-- PROJETOS — gestão do trabalho do escritório que não é processo nem peça
--
-- A Esteira cuida da produção (colunas fixas, ligada a cliente/demanda), as
-- Tarefas vêm do andamento processual e os Chamados são do software. Nada
-- disso abriga "lançar a campanha", "migrar a planilha", "estruturar as
-- execuções". É esse o vazio que esta tabela preenche.
--
-- Duas ideias sustentam o desenho:
--   1. COLUNAS POR PROJETO — cada projeto define o próprio funil. Campanha usa
--      Ideia→Produção→No ar; captação usa Lead→Contato→Contrato.
--   2. VÍNCULOS OPCIONAIS — um card pode apontar pra um cliente, um processo ou
--      um chamado do próprio AW. É o que uma ferramenta genérica não faz.

create table if not exists public.projetos (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  descricao    text,
  cor          text not null default 'primary',   -- chave da paleta, não hex
  icone        text not null default 'Rocket',    -- nome do ícone lucide
  dono_id      uuid references auth.users(id) on delete set null,
  prazo        date,
  status       text not null default 'ativo'
               check (status in ('ativo','pausado','concluido','arquivado')),
  ordem        int  not null default 0,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  concluido_at timestamptz
);

create table if not exists public.projeto_colunas (
  id           uuid primary key default gen_random_uuid(),
  projeto_id   uuid not null references public.projetos(id) on delete cascade,
  nome         text not null,
  ordem        int  not null default 0,
  cor          text not null default 'muted',
  -- Cair nesta coluna conclui o card (carimba concluido_at). Normalmente a última.
  e_conclusao  boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists idx_projeto_colunas_projeto on public.projeto_colunas (projeto_id, ordem);

create table if not exists public.projeto_cards (
  id             uuid primary key default gen_random_uuid(),
  projeto_id     uuid not null references public.projetos(id) on delete cascade,
  coluna_id      uuid not null references public.projeto_colunas(id) on delete cascade,
  titulo         text not null,
  descricao      text,
  responsavel_id uuid references auth.users(id) on delete set null,
  prazo          date,
  prioridade     text not null default 'normal' check (prioridade in ('baixa','normal','alta')),
  ordem          int  not null default 0,
  concluido_at   timestamptz,
  -- Vínculos com o resto do AW. Todos opcionais.
  cliente_id     uuid references public.clientes(id)  on delete set null,
  processo_id    uuid references public.processos(id) on delete set null,
  chamado_id     uuid references public.chamados(id)  on delete set null,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id) on delete set null,
  updated_at     timestamptz not null default now()
);
create index if not exists idx_projeto_cards_coluna  on public.projeto_cards (coluna_id, ordem);
create index if not exists idx_projeto_cards_projeto on public.projeto_cards (projeto_id);
-- Alimenta a central de prazos do Dashboard e a aba Tarefas.
create index if not exists idx_projeto_cards_prazo
  on public.projeto_cards (prazo) where prazo is not null and concluido_at is null;

-- updated_at automático
create or replace function public.fn_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_projetos_touch on public.projetos;
create trigger trg_projetos_touch before update on public.projetos
  for each row execute function public.fn_touch_updated_at();
drop trigger if exists trg_projeto_cards_touch on public.projeto_cards;
create trigger trg_projeto_cards_touch before update on public.projeto_cards
  for each row execute function public.fn_touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Projeto é do escritório: quem tem o módulo vê tudo. Num time pequeno,
-- compartimentar cria mais atrito do que protege.
alter table public.projetos        enable row level security;
alter table public.projeto_colunas enable row level security;
alter table public.projeto_cards   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['projetos','projeto_colunas','projeto_cards'] loop
    execute format('drop policy if exists %1$s_rw on public.%1$s', t);
    execute format($f$
      create policy %1$s_rw on public.%1$s for all to authenticated
        using (public.fn_tem_modulo('projetos')) with check (public.fn_tem_modulo('projetos'))
    $f$, t);
  end loop;
end $$;

-- ── Templates de funil ───────────────────────────────────────────────────
-- Criar um projeto do zero e ainda ter que inventar as colunas é atrito na
-- pior hora. O template entrega o funil pronto e editável.
create or replace function public.fn_criar_projeto(
  p_nome text, p_descricao text, p_cor text, p_icone text,
  p_dono uuid, p_prazo date, p_template text, p_user uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_cols text[]; v_cores text[]; i int;
begin
  if not public.fn_tem_modulo('projetos') then
    raise exception 'sem acesso ao módulo de projetos';
  end if;

  insert into public.projetos (nome, descricao, cor, icone, dono_id, prazo, created_by,
                               ordem)
  values (coalesce(nullif(btrim(p_nome),''),'Projeto sem nome'), nullif(btrim(p_descricao),''),
          coalesce(p_cor,'primary'), coalesce(p_icone,'Rocket'), p_dono, p_prazo, p_user,
          coalesce((select max(ordem)+1 from public.projetos where status = 'ativo'), 0))
  returning id into v_id;

  case coalesce(p_template,'simples')
    when 'campanha' then
      v_cols  := array['Ideia','Produção','No ar','Medindo','Encerrada'];
      v_cores := array['muted','primary','amber','sky','emerald'];
    when 'captacao' then
      v_cols  := array['Lead','Contato feito','Reunião','Proposta','Fechado'];
      v_cores := array['muted','sky','primary','amber','emerald'];
    when 'implantacao' then
      v_cols  := array['Levantamento','Em construção','Homologação','No ar'];
      v_cores := array['muted','primary','amber','emerald'];
    else
      v_cols  := array['A fazer','Fazendo','Feito'];
      v_cores := array['muted','primary','emerald'];
  end case;

  for i in 1 .. array_length(v_cols,1) loop
    insert into public.projeto_colunas (projeto_id, nome, ordem, cor, e_conclusao)
    values (v_id, v_cols[i], i-1, v_cores[i], i = array_length(v_cols,1));
  end loop;

  return v_id;
end $$;

comment on function public.fn_criar_projeto is
  'Cria projeto já com as colunas do template escolhido (simples|campanha|captacao|implantacao).';
