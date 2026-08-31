-- BALANCE — gestão financeira do escritório.
--
-- Decisões que moldam este esquema, todas do escritório:
--
-- BRUTO COM REPASSE. Um alvará de R$ 10.000 num contrato de 50% entra inteiro
-- na conta, porque é isso que o banco mostra. A parte do cliente vira um
-- REPASSE pendente — não sai automático: o escritório decide quando enviar.
-- Por isso repasse é tabela própria e não um campo do lançamento: ele tem vida
-- own (nasce pendente, vira pago, tem data) e é o que responde "quanto desse
-- saldo não é meu".
--
-- CAIXA + PREVISTO. O lançamento nasce `previsto` (com vencimento) ou
-- `realizado` (já entrou/saiu). Não é competência: nada é reconhecido por
-- direito, só por dinheiro — mas dá pra ver o que vem.
--
-- VÁRIAS CONTAS. Cada lançamento diz de qual conta saiu ou entrou, e o saldo é
-- por conta. Sem isso o total nunca bate com extrato nenhum.
--
-- FORA DA V1: repasse a parceiro. Hoje `clientes.parceiro` é texto livre com
-- duplicata de digitação ("JÂNIO" e "JÂNIO GOMES"), os parceiros dos processos
-- são outros dos parceiros dos clientes, e não existe onde guardar percentual.
-- Inventar isso agora seria chutar quanto cada um recebe.

-- ── contas ──────────────────────────────────────────────────────────────────
create table if not exists public.balance_contas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  tipo          text not null default 'corrente'
                check (tipo in ('corrente','poupanca','especie','investimento')),
  instituicao   text,
  -- o saldo de partida do dia em que a conta entrou no sistema; o saldo atual é
  -- este mais os lançamentos realizados
  saldo_inicial numeric(14,2) not null default 0,
  ativo         boolean not null default true,
  ordem         integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── categorias (plano de contas) ────────────────────────────────────────────
create table if not exists public.balance_categorias (
  id      uuid primary key default gen_random_uuid(),
  nome    text not null,
  tipo    text not null check (tipo in ('entrada','saida')),
  grupo   text,
  -- categoria de sistema: o Balance depende dela existir (repasse, honorário,
  -- bônus). Some do botão de excluir pra ninguém apagar e quebrar a baixa.
  fixa    boolean not null default false,
  ativo   boolean not null default true,
  ordem   integer not null default 0,
  unique (nome, tipo)
);

-- ── lançamentos ─────────────────────────────────────────────────────────────
create table if not exists public.balance_lancamentos (
  id           uuid primary key default gen_random_uuid(),
  conta_id     uuid not null references public.balance_contas(id) on delete restrict,
  categoria_id uuid references public.balance_categorias(id) on delete set null,
  tipo         text not null check (tipo in ('entrada','saida')),
  valor        numeric(14,2) not null check (valor > 0),
  -- realizado: o dia em que o dinheiro andou. previsto: o vencimento.
  data         date not null,
  status       text not null default 'realizado' check (status in ('previsto','realizado')),
  descricao    text not null,
  observacoes  text,
  -- de onde o dinheiro veio ou pra onde foi, no mundo jurídico
  cliente_id   uuid references public.clientes(id) on delete set null,
  processo_id  uuid references public.processos(id) on delete set null,
  contrato_id  uuid references public.contratos(id) on delete set null,
  -- quem criou o lançamento: mão, baixa do Tracker, recorrente ou fechamento
  origem       text not null default 'manual'
               check (origem in ('manual','tracker','recorrente','fechamento')),
  origem_ref   text,
  criado_por   uuid,
  pago_em      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists balance_lanc_data_idx     on public.balance_lancamentos (data desc);
create index if not exists balance_lanc_conta_idx    on public.balance_lancamentos (conta_id, status);
create index if not exists balance_lanc_processo_idx on public.balance_lancamentos (processo_id);
create index if not exists balance_lanc_cliente_idx  on public.balance_lancamentos (cliente_id);
-- a baixa do Tracker não pode entrar duas vezes pro mesmo processo
create unique index if not exists balance_lanc_origem_unica
  on public.balance_lancamentos (origem, origem_ref)
  where origem <> 'manual' and origem_ref is not null;

-- ── repasses (dinheiro de cliente parado na conta) ──────────────────────────
create table if not exists public.balance_repasses (
  id                    uuid primary key default gen_random_uuid(),
  lancamento_entrada_id uuid not null references public.balance_lancamentos(id) on delete cascade,
  cliente_id            uuid references public.clientes(id) on delete set null,
  processo_id           uuid references public.processos(id) on delete set null,
  valor_devido          numeric(14,2) not null check (valor_devido > 0),
  status                text not null default 'pendente' check (status in ('pendente','pago')),
  -- a saída que quitou o repasse; nula enquanto pendente
  lancamento_saida_id   uuid references public.balance_lancamentos(id) on delete set null,
  pago_em               date,
  observacoes           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists balance_repasse_status_idx on public.balance_repasses (status, created_at);

-- ── recorrentes (aluguel, salário, assinatura) ──────────────────────────────
create table if not exists public.balance_recorrentes (
  id             uuid primary key default gen_random_uuid(),
  descricao      text not null,
  conta_id       uuid not null references public.balance_contas(id) on delete restrict,
  categoria_id   uuid references public.balance_categorias(id) on delete set null,
  tipo           text not null check (tipo in ('entrada','saida')),
  valor          numeric(14,2) not null check (valor > 0),
  dia_vencimento integer not null check (dia_vencimento between 1 and 31),
  inicio         date not null default current_date,
  fim            date,
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── permissão ───────────────────────────────────────────────────────────────
-- O Balance mostra folha e bônus, então não é de todo mundo. Reaproveita o
-- controle de módulos que já existe em vez de inventar um segundo.
create or replace function public.tem_modulo(p_key text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.user_module_access
     where user_id = auth.uid() and module_key = p_key
  );
$$;

alter table public.balance_contas      enable row level security;
alter table public.balance_categorias  enable row level security;
alter table public.balance_lancamentos enable row level security;
alter table public.balance_repasses    enable row level security;
alter table public.balance_recorrentes enable row level security;

do $$
declare t text;
begin
  foreach t in array array['balance_contas','balance_categorias','balance_lancamentos',
                           'balance_repasses','balance_recorrentes']
  loop
    execute format($f$
      drop policy if exists %1$s_balance on public.%1$s;
      create policy %1$s_balance on public.%1$s
        for all to authenticated
        using (public.tem_modulo('balance'))
        with check (public.tem_modulo('balance'));
    $f$, t);
  end loop;
end $$;

-- ── plano de contas inicial ─────────────────────────────────────────────────
-- Ponto de partida, editável na tela. As marcadas como `fixa` o Balance usa por
-- nome na baixa do Tracker e no bônus — apagar uma delas quebraria a automação.
insert into public.balance_categorias (nome, tipo, grupo, fixa, ordem) values
  ('Honorário de êxito',      'entrada', 'Receita processual', true,  10),
  ('Acordo recebido',         'entrada', 'Receita processual', true,  20),
  ('Honorário sucumbencial',  'entrada', 'Receita processual', false, 30),
  ('Honorário contratual',    'entrada', 'Receita processual', false, 40),
  ('Consultoria',             'entrada', 'Outras receitas',    false, 50),
  ('Aporte de sócio',         'entrada', 'Outras receitas',    false, 60),
  ('Reembolso',               'entrada', 'Outras receitas',    false, 70),
  ('Repasse ao cliente',      'saida',   'Terceiros',          true,  10),
  ('Salário',                 'saida',   'Pessoal',            false, 20),
  ('Bônus de fechamento',     'saida',   'Pessoal',            true,  30),
  ('Pró-labore',              'saida',   'Pessoal',            false, 40),
  ('Aluguel',                 'saida',   'Estrutura',          false, 50),
  ('Energia, água e internet','saida',   'Estrutura',          false, 60),
  ('Software e assinaturas',  'saida',   'Estrutura',          false, 70),
  ('Custas e diligências',    'saida',   'Processual',         false, 80),
  ('Perícia',                 'saida',   'Processual',         false, 90),
  ('Marketing e tráfego',     'saida',   'Comercial',          false, 100),
  ('Imposto e taxa',          'saida',   'Tributário',         false, 110),
  ('Tarifa bancária',         'saida',   'Tributário',         false, 120),
  ('Outras despesas',         'saida',   'Outras',             false, 200)
on conflict (nome, tipo) do nothing;

comment on table public.balance_lancamentos is
  'Razão do Balance. Entrada e saída do escritório, previstas ou realizadas.';
comment on table public.balance_repasses is
  'Parte do alvará que é do cliente e ainda está na conta do escritório.';
