-- O LOG DA JORNADA: quando o lead entrou em cada etapa, e quantas vezes.
--
-- Até aqui `wa_conversas.etapa` guardava UMA palavra: onde ele está agora.
-- Isso responde "e o Joel?" e não responde nada do que se pergunta depois:
-- há quanto tempo ele está parado em Extrato, se ele já esteve em Proposta e
-- voltou, quantas vezes a mesma pessoa passou pelo mesmo lugar. Um lead que
-- chegou em Proposta duas vezes e voltou nas duas tem uma história — e ela
-- estava sendo sobrescrita a cada mudança.
--
-- ─────────────────────── por que gatilho, e não código ──────────────────────
--
-- A etapa muda por mais de um caminho: a tela, uma importação, um dia uma
-- automação. Registrar no navegador deixaria de fora tudo que não passa por
-- ele, e o buraco só apareceria meses depois, num histórico com falhas que
-- ninguém consegue mais reconstruir. No gatilho, quem escreve `etapa` escreve
-- o log, queira ou não.
--
-- O QUE NÃO DÁ PRA INVENTAR. As conversas que já existem não têm história
-- gravada: só sabemos onde elas estão. A carga inicial marca essas linhas como
-- `estimado`, e a tela diz isso em vez de exibir uma data que parece apurada e
-- não é. Data errada com cara de certa é pior que data ausente.
create table if not exists public.wa_etapa_log (
  id          uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.wa_conversas(id) on delete cascade,

  -- Para onde foi, e de onde veio. `de` é nulo na primeira linha de cada
  -- conversa; guardá-lo evita ter que reconstruir a ordem para saber se aquela
  -- passagem foi avanço ou volta.
  etapa       text not null,
  de          text,

  /* `clock_timestamp()` e não `now()`: `now()` é o instante da TRANSAÇÃO, e
     duas mudanças de etapa feitas na mesma transação sairiam com o mesmo
     carimbo — o log ficaria sem ordem justamente onde a ordem é o conteúdo. */
  entrou_em   timestamptz not null default clock_timestamp(),
  por         uuid references auth.users(id),

  -- Linha da carga inicial: sabemos a etapa, não sabemos quando ela começou.
  estimado    boolean not null default false
);

comment on table public.wa_etapa_log is
  'Cada passagem de um lead por uma etapa da jornada. Escrito por gatilho; linhas com estimado=true vieram da carga inicial e nao tem data apurada.';

create index if not exists ix_wa_etapa_log_conversa
  on public.wa_etapa_log (conversa_id, entrou_em);

/* O REGISTRO ACONTECE ONDE A MUDANÇA ACONTECE.
   `auth.uid()` só existe quando quem escreve é uma pessoa logada; vindo do
   service_role (importação, webhook) fica nulo, e nulo aqui é a verdade: não
   houve gente. */
create or replace function public.fn_wa_etapa_log()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.wa_etapa_log (conversa_id, etapa, de, entrou_em, por)
    values (new.id, coalesce(new.etapa, 'chegou'), null, coalesce(new.created_at, now()), auth.uid());
    return new;
  end if;

  -- `is distinct from` e não `<>`: com nulo dos dois lados, `<>` devolve nulo e
  -- o log perderia justamente a primeira mudança de uma linha antiga.
  if new.etapa is distinct from old.etapa then
    insert into public.wa_etapa_log (conversa_id, etapa, de, por)
    values (new.id, coalesce(new.etapa, 'chegou'), old.etapa, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wa_etapa_log_novo on public.wa_conversas;
create trigger trg_wa_etapa_log_novo
  after insert on public.wa_conversas
  for each row execute function public.fn_wa_etapa_log();

drop trigger if exists trg_wa_etapa_log_mudou on public.wa_conversas;
create trigger trg_wa_etapa_log_mudou
  after update of etapa on public.wa_conversas
  for each row execute function public.fn_wa_etapa_log();

-- A carga inicial: uma linha por conversa que ainda não tem nenhuma, com a
-- etapa de hoje e a data de criação, marcada como estimada.
insert into public.wa_etapa_log (conversa_id, etapa, de, entrou_em, estimado)
select c.id, coalesce(c.etapa, 'chegou'), null, c.created_at, true
  from public.wa_conversas c
 where not exists (select 1 from public.wa_etapa_log l where l.conversa_id = c.id);

alter table public.wa_etapa_log enable row level security;

drop policy if exists "wa_etapa_log_ler" on public.wa_etapa_log;
create policy "wa_etapa_log_ler" on public.wa_etapa_log
  for select to authenticated
  using (public.fn_is_admin() or public.tem_modulo('atendimento'));

/* Sem política de escrita: quem escreve é o gatilho, que é SECURITY DEFINER.
   Deixar a tabela aberta para INSERT direto convidaria a inventar passagens
   que nunca aconteceram — e um log que aceita qualquer linha não serve para
   responder "quantas vezes ele voltou pra Proposta?". */

/* ── A MENSAGEM PROGRAMADA GUARDA A ETAPA DE QUANDO FOI MARCADA ──
   "Programei o quê, quando ele estava onde?" é uma pergunta que a jornada
   responde e a lista de programadas não: dali a três dias o lead já mudou de
   etapa, e a mensagem continua sendo a que alguém escreveu pensando na etapa
   antiga. Preenchida por gatilho, e não pelo navegador, pela mesma razão de
   sempre: existe mais de um caminho até esta tabela. */
alter table public.wa_agendadas add column if not exists etapa text;

comment on column public.wa_agendadas.etapa is
  'A etapa em que o lead estava quando a mensagem foi programada. Preenchida por gatilho no insert.';

create or replace function public.fn_wa_agendada_etapa()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.etapa is null then
    select c.etapa into new.etapa from public.wa_conversas c where c.id = new.conversa_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wa_agendada_etapa on public.wa_agendadas;
create trigger trg_wa_agendada_etapa
  before insert on public.wa_agendadas
  for each row execute function public.fn_wa_agendada_etapa();
