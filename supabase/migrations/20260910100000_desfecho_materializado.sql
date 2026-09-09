-- O DESFECHO SAI DA VIEW E VIRA COLUNA, ATUALIZADA POR GATILHO.
--
-- `vw_desfecho_processo` levava 5,2 segundos: ela rodava regex sobre o corpo
-- das 1.676 publicações a cada leitura. No dashboard isso aparecia como a
-- página inteira zerada por vários segundos, porque tudo esperava junto.
--
-- A conta é redundante. O texto de uma publicação não muda depois de gravado,
-- então o desfecho de um processo só pode mudar quando ENTRA publicação nova
-- dele. É esse o momento de recalcular, e só pra ele.
--
-- Por processo a leitura é barata: `publicacoes.numero_processo` já tem
-- índice e o formato bate exatamente com `processos.numero_processo` (1.388 de
-- 1.388 iguais na comparação direta), então cada recálculo lê umas quatro
-- publicações em vez de todas.
--
-- "ESTÁ ATUALIZANDO AUTOMÁTICO?" Está, e de um jeito melhor que antes: a view
-- recalculava a cada leitura (por isso a lentidão); agora recalcula a cada
-- publicação que o DJEN traz, na hora em que ela é gravada. A leitura passa a
-- ser uma coluna.

-- ── 1. as colunas ────────────────────────────────────────────────────────────
alter table public.processos
  add column if not exists desfecho text,
  add column if not exists dt_desfecho date,
  add column if not exists desfecho_executado boolean;

comment on column public.processos.desfecho is
  'Lido da ultima decisao publicada no DJEN, por gatilho. procedente | parcial | improcedente | acordo | sem_merito | pago_sem_sentenca | em_andamento.';

create index if not exists ix_processos_desfecho on public.processos (desfecho);

-- ── 2. a leitura, agora para UM processo ─────────────────────────────────────
--
-- Mesmas regras da view antiga (ordem dos testes é a regra: PARCIALMENTE antes
-- de PROCEDENTE, mérito antes de extinção; a última decisão de mérito manda;
-- extinção por pagamento depois de vitória é vitória executada; Ministério
-- Público e recurso negado não classificam).
create or replace function public.fn_desfecho_do_processo(p_numero text)
returns table (desfecho text, dt_desfecho date, executado boolean)
language sql
stable
as $function$
  with pub as (
    select pu.data_publicacao dt,
           regexp_replace(regexp_replace(pu.conteudo, '<[^>]*>', ' ', 'g'), '\s+', ' ', 'g') txt
      from public.publicacoes pu
     where pu.numero_processo = p_numero and pu.conteudo is not null
  ),
  cls as (
    select dt,
      case
        when txt ~* 'JULGO\s+PARCIALMENTE\s+PROCEDENTE'                then 'parcial'
        when txt ~* 'JULGO\s+(TOTALMENTE\s+)?PROCEDENTES?'              then 'procedente'
        when txt ~* 'JULGO\s+IMPROCEDENTES?|JULGADA\s+IMPROCEDENTE'     then 'improcedente'
        when txt ~* 'HOMOLOG\w*\s+(O\s+)?ACORDO'                        then 'acordo'
      end merito,
      (txt ~* 'JULGO\s+EXTINTO|EXTIN[CÇ][AÃ]O\s+DO\s+(PROCESSO|FEITO)|SEM\s+RESOLU[CÇ][AÃ]O\s+D[EO]\s+M[EÉ]RITO') extinto,
      (txt ~* 'CUMPRIMENTO|SATISFA[CÇ][AÃ]O\s+DA\s+OBRIGA[CÇ][AÃ]O|PAGAMENTO|ART\.?\s*924') pagamento
    from pub
  ),
  m as (select merito, dt from cls where merito is not null order by dt desc limit 1),
  n as (
    select max(dt) filter (where extinto and pagamento)      dt_pagamento,
           bool_or(extinto and not pagamento)                 sem_merito,
           min(dt) filter (where extinto and not pagamento)   dt_sem_merito
      from cls
  )
  select
    case
      when m.merito is not null       then m.merito
      when n.sem_merito               then 'sem_merito'
      when n.dt_pagamento is not null then 'pago_sem_sentenca'
      else                                 'em_andamento'
    end,
    coalesce(m.dt, n.dt_sem_merito, n.dt_pagamento),
    coalesce(m.merito in ('procedente','parcial','acordo') and n.dt_pagamento >= m.dt, false)
  from n left join m on true;
$function$;

-- ── 3. quem grava ───────────────────────────────────────────────────────────
create or replace function public.fn_processos_gravar_desfecho(p_numero text)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.processos p
     set desfecho = d.desfecho, dt_desfecho = d.dt_desfecho, desfecho_executado = d.executado
    from public.fn_desfecho_do_processo(p_numero) d
   where p.numero_processo = p_numero;
$function$;

-- ── 4. publicação nova recalcula o processo dela ────────────────────────────
create or replace function public.fn_publicacao_atualiza_desfecho()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.numero_processo is not null then
    perform public.fn_processos_gravar_desfecho(new.numero_processo);
  end if;
  return new;
end $function$;

drop trigger if exists trg_publicacao_atualiza_desfecho on public.publicacoes;
create trigger trg_publicacao_atualiza_desfecho
  after insert or update of conteudo, numero_processo on public.publicacoes
  for each row execute function public.fn_publicacao_atualiza_desfecho();

-- ── 5. processo novo (ou renumerado) já nasce lido ──────────────────────────
--
-- BEFORE, e preenchendo NEW: um AFTER que fizesse UPDATE na própria linha
-- dispararia a si mesmo de novo.
create or replace function public.fn_processo_le_desfecho()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare d record;
begin
  select * into d from public.fn_desfecho_do_processo(new.numero_processo);
  new.desfecho := d.desfecho;
  new.dt_desfecho := d.dt_desfecho;
  new.desfecho_executado := d.executado;
  return new;
end $function$;

drop trigger if exists trg_processo_le_desfecho on public.processos;
create trigger trg_processo_le_desfecho
  before insert or update of numero_processo on public.processos
  for each row execute function public.fn_processo_le_desfecho();

-- ── 6. o que já existe ──────────────────────────────────────────────────────
-- Subconsulta, e não LATERAL direto: num UPDATE, o FROM não pode referenciar a
-- tabela alvo, então a leitura por processo acontece numa derivada por id.
update public.processos p
   set desfecho = d.desfecho, dt_desfecho = d.dt_desfecho, desfecho_executado = d.executado
  from (
    select pp.id, x.desfecho, x.dt_desfecho, x.executado
      from public.processos pp, lateral public.fn_desfecho_do_processo(pp.numero_processo) x
  ) d
 where d.id = p.id;

-- ── 7. a view continua existindo, com o mesmo contrato, lendo coluna ────────
--
-- Quem consome (`src/lib/procedencia.ts`) não precisa saber que a fonte mudou.
-- DROP e CREATE, e não REPLACE: a lista de colunas muda de ordem e o REPLACE
-- recusa.
drop view if exists public.vw_desfecho_processo;
create view public.vw_desfecho_processo
with (security_invoker = true)
as
select
  p.id                  as processo_id,
  p.numero_processo,
  p.materia,
  p.materia_rubricas,
  p.requeridos,
  p.fase_processual,
  p.valor_causa,
  coalesce(p.desfecho, 'em_andamento') as desfecho,
  p.dt_desfecho,
  p.desfecho_executado  as executado,
  s.valor               as valor_sentenca,
  (s.valor is not null) as no_tracker
from public.processos p
left join lateral (
  select sum(se.valor) valor from public.sentencas se where se.processo_id = p.id
) s on true;

comment on view public.vw_desfecho_processo is
  'Desfecho de cada processo (coluna materializada por gatilho a cada publicacao do DJEN) mais o valor registrado no Tracker.';

grant select on public.vw_desfecho_processo to authenticated;
