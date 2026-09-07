-- A RÉGUA DEIXA DE SER DO ESCRITÓRIO E PASSA A SER DE CADA NÚMERO.
--
-- Enquanto havia um número só, "a régua" e "a régua do Portal" eram a mesma
-- frase. Com dois, não são: o Portal recebe lead frio de campanha e cobra
-- rápido; o número do escritório fala com quem já é caso, e cobrar de um dia
-- ali é perseguição. Mesma tela, duas políticas, e até aqui uma sobrescrevia a
-- outra sem ninguém ver.
--
-- ─────────────────────── as três peças desta mudança ────────────────────────
--
-- 1. CADÊNCIA E MENSAGENS POR NÚMERO. As duas tabelas ganham `instancia` na
--    chave. Número sem linha própria cai no padrão de fábrica — número novo
--    nasce funcionando, e não vazio.
--
-- 2. A REGRA PADRÃO DE CADA NÚMERO: entra todo mundo, ou não entra ninguém.
--    São dois jeitos opostos e legítimos de trabalhar. No Portal, cobrar todo
--    mundo é o certo: são leads que vieram de anúncio e somem por padrão. No
--    número do escritório, o certo é o contrário — a maioria é cliente com
--    processo andando, e cobrar sozinho seria constranger quem já pagou.
--    Sem essa chave, um dos dois números fica errado o tempo todo.
--
-- 3. O CONTATO PODE FUGIR DA REGRA. `wa_conversas.followup_ativo` é NULO por
--    padrão, e nulo quer dizer "faço o que o número mandar". Ligado ou
--    desligado explicitamente, vale sobre a regra. Os três estados são
--    necessários: sem o nulo, mudar a regra do número não pegaria em ninguém
--    que já existe, porque toda conversa teria uma opinião gravada.

-- ── 1. a regra de cada número ───────────────────────────────────────────────
create table if not exists public.wa_followup_regras (
  instancia      text primary key,

  -- Ligado: entra na régua quem não pediu pra sair. Desligado: só entra quem
  -- foi escolhido a dedo.
  padrao_ativo   boolean not null default true,

  atualizado_por uuid references auth.users(id),
  updated_at     timestamptz not null default now()
);

comment on table public.wa_followup_regras is
  'A politica de follow-up de cada numero: por padrao todo mundo entra na regua, ou por padrao ninguem entra.';

alter table public.wa_followup_regras enable row level security;

drop policy if exists "wa_followup_regras_tudo" on public.wa_followup_regras;
create policy "wa_followup_regras_tudo" on public.wa_followup_regras
  for all to authenticated
  using (public.fn_is_admin() or public.tem_modulo('atendimento'))
  with check (public.fn_is_admin() or public.tem_modulo('atendimento'));

drop trigger if exists trg_wa_followup_regras_updated on public.wa_followup_regras;
create trigger trg_wa_followup_regras_updated
  before update on public.wa_followup_regras
  for each row execute function public.set_updated_at();

-- Os números que já existem continuam como estavam: todo mundo na régua.
insert into public.wa_followup_regras (instancia, padrao_ativo)
select i.nome, true from public.wa_instancias i
on conflict (instancia) do nothing;

-- ── 2. a decisão de cada contato, que vence a regra ─────────────────────────
alter table public.wa_conversas
  add column if not exists followup_ativo boolean;

comment on column public.wa_conversas.followup_ativo is
  'Null = segue a regra do numero. True/false = decisao explicita para este contato, e vence a regra.';

-- ── 3. cadência e mensagens padrão, agora por número ────────────────────────
--
-- A migração é a parte delicada: as tabelas têm PK em `rodada` e ficam com PK
-- em (instancia, rodada). As linhas que existem hoje são a régua do escritório
-- inteiro; elas viram a régua DE CADA número que existe, o que preserva
-- exatamente o comportamento de hoje enquanto ninguém mexer.
/* Colunas escritas à mão, e não um laço genérico: copiar linha "com uma coluna
   trocada" sem nomear as colunas exige hstore ou row-cast, e as duas formas
   quebram calado quando alguém adiciona uma coluna. Duas tabelas, dois blocos,
   e o dia em que a forma mudar o erro aparece aqui e não em produção. */
/* O GATILHO DE ORDEM SAI DE CENA ENQUANTO AS LINHAS SE MOVEM. Ele é um
   constraint trigger DEFERRABLE: dispara no commit, e por isso deixa "eventos
   pendentes" pendurados na tabela — o que faz o ALTER TABLE seguinte falhar com
   "cannot ALTER TABLE because it has pending trigger events". Ele volta na
   migração das funções, já na versão que compara por número. */
drop trigger if exists trg_wa_followup_cadencia_ordem on public.wa_followup_cadencia;

alter table public.wa_followup_cadencia add column if not exists instancia text;
alter table public.wa_followup_modelos  add column if not exists instancia text;

/* A CHAVE ANTIGA CAI ANTES DE COPIAR, e a ordem aqui é o bug que eu já cometi:
   com a PK ainda em `rodada` sozinha, inserir a cópia da rodada 1 para o
   segundo número colide com a rodada 1 do primeiro — e o `on conflict do
   nothing`, que existe pra tornar a migração repetível, engole as cópias TODAS
   sem reclamar. A migração "funciona", não copia nada, e ninguém descobre até
   alguém ajustar a régua de um número e ver o outro mudar junto. */
alter table public.wa_followup_cadencia drop constraint if exists wa_followup_cadencia_pkey;
alter table public.wa_followup_modelos  drop constraint if exists wa_followup_modelos_pkey;

do $$
declare v_primeira text;
begin
  select nome into v_primeira from public.wa_instancias order by nome limit 1;

  -- Sem número cadastrado, as linhas de hoje viram o padrão global ('*') e
  -- nada mais precisa acontecer.
  if v_primeira is null then
    update public.wa_followup_cadencia set instancia = '*' where instancia is null;
    update public.wa_followup_modelos  set instancia = '*' where instancia is null;
    return;
  end if;

  -- Uma cópia da régua de hoje para cada número ALÉM do primeiro...
  insert into public.wa_followup_cadencia (instancia, rodada, dias, atualizado_por)
  select i.nome, c.rodada, c.dias, c.atualizado_por
    from public.wa_followup_cadencia c
    cross join public.wa_instancias i
   where c.instancia is null and i.nome <> v_primeira
  on conflict do nothing;

  insert into public.wa_followup_modelos
    (instancia, rodada, tipo, texto, midia_path, midia_mime, midia_nome, duracao, midias, ativo, atualizado_por)
  select i.nome, m.rodada, m.tipo, m.texto, m.midia_path, m.midia_mime, m.midia_nome,
         m.duracao, m.midias, m.ativo, m.atualizado_por
    from public.wa_followup_modelos m
    cross join public.wa_instancias i
   where m.instancia is null and i.nome <> v_primeira
  on conflict do nothing;

  -- ...e as originais ficam sendo as do primeiro.
  update public.wa_followup_cadencia set instancia = v_primeira where instancia is null;
  update public.wa_followup_modelos  set instancia = v_primeira where instancia is null;
end $$;

alter table public.wa_followup_cadencia alter column instancia set not null;
alter table public.wa_followup_modelos  alter column instancia set not null;

alter table public.wa_followup_cadencia add primary key (instancia, rodada);
alter table public.wa_followup_modelos  add primary key (instancia, rodada);

comment on column public.wa_followup_cadencia.instancia is
  'De qual numero e esta regua. Numero sem linha propria cai no padrao de fabrica.';
comment on column public.wa_followup_modelos.instancia is
  'De qual numero e esta mensagem padrao.';
