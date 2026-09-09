-- O DESFECHO DE CADA PROCESSO, LIDO DO QUE O TRIBUNAL PUBLICOU.
--
-- A pergunta "quanto a gente ganha?" não tinha resposta no sistema. A tabela
-- `sentencas` só registra vitória: 46 linhas, todas "ganha" ou "transitada".
-- Taxa de procedência calculada sobre ela dá 100%, o que não é uma taxa, é a
-- ausência de denominador.
--
-- O denominador está no DJEN. `publicacoes` guarda 1.676 publicações e as
-- sentenças vêm com o dispositivo no corpo: "JULGO IMPROCEDENTES os pedidos",
-- "JULGO PARCIALMENTE PROCEDENTE", "HOMOLOGO o acordo". Esta view lê isso.
--
-- ─────────────────────────── como a leitura é feita ──────────────────────────
--
-- 1. Cada publicação é classificada pelo dispositivo. A ordem dos testes é a
--    regra: PARCIALMENTE antes de PROCEDENTE (senão parcial vira total), e
--    mérito antes de extinção (o dispositivo de improcedência diz "extinguindo
--    o processo COM resolução do mérito", e testar extinção primeiro o roubaria).
--
-- 2. O desfecho do processo é a ÚLTIMA decisão de mérito publicada. Uma
--    sentença reformada em segundo grau seria substituída pelo acórdão, se ele
--    dissesse o resultado. Nos 8 acórdãos da base todos são "NEGO PROVIMENTO",
--    que mantém a sentença, então a última decisão de mérito continua valendo.
--    "DOU PROVIMENTO" não é classificado aqui porque inverte o resultado só
--    quando se sabe QUEM recorreu, e o texto nem sempre diz.
--
-- 3. Extinção é duas coisas diferentes, e a view separa:
--      por pagamento (art. 924, "cumprimento", "satisfação da obrigação"):
--        depois de uma vitória é a vitória EXECUTADA, o melhor desfecho possível;
--        sem sentença captada antes, é acordo ou pagamento espontâneo;
--      sem resolução de mérito (desistência, abandono, incompetência):
--        não conta como vitória nem como derrota. Fica fora da taxa.
--
-- 4. Ministério Público, recursos e intimações sem dispositivo não classificam.
--
-- ───────────────────────────── o que foi conferido ───────────────────────────
--
-- Das 46 vitórias do Tracker, 42 têm "JULGO (PARCIALMENTE) PROCEDENTE" no DJEN.
-- As 3 que também trazem "IMPROCEDENTE" são parciais (ganhou a repetição,
-- perdeu o dano moral), e uma não tem sentença publicada. É esse cruzamento
-- que autoriza usar o DJEN como fonte: ele acha o que o Tracker registrou, e
-- acha também o que o Tracker não tem, que é justamente a derrota.
--
-- É VIEW, e não coluna: recalcula a cada leitura, então uma publicação nova
-- muda o desfecho sem gatilho nem rotina. Mil e poucas publicações com regex
-- cabem numa consulta de dashboard.
create or replace view public.vw_desfecho_processo
with (security_invoker = true)
as
with pub as (
  select regexp_replace(pu.numero_processo, '\D', '', 'g') num,
         pu.data_publicacao dt,
         regexp_replace(regexp_replace(pu.conteudo, '<[^>]*>', ' ', 'g'), '\s+', ' ', 'g') txt
    from public.publicacoes pu
   where pu.conteudo is not null
),
cls as (
  select num, dt,
    case
      when txt ~* 'JULGO\s+PARCIALMENTE\s+PROCEDENTE'                         then 'parcial'
      when txt ~* 'JULGO\s+(TOTALMENTE\s+)?PROCEDENTES?'                       then 'procedente'
      when txt ~* 'JULGO\s+IMPROCEDENTES?|JULGADA\s+IMPROCEDENTE'              then 'improcedente'
      when txt ~* 'HOMOLOG\w*\s+(O\s+)?ACORDO'                                 then 'acordo'
    end merito,
    (txt ~* 'JULGO\s+EXTINTO|EXTIN[CÇ][AÃ]O\s+DO\s+(PROCESSO|FEITO)|SEM\s+RESOLU[CÇ][AÃ]O\s+D[EO]\s+M[EÉ]RITO')
      and (txt ~* 'CUMPRIMENTO|SATISFA[CÇ][AÃ]O\s+DA\s+OBRIGA[CÇ][AÃ]O|PAGAMENTO|ART\.?\s*924') as extinto_pagamento,
    (txt ~* 'JULGO\s+EXTINTO|EXTIN[CÇ][AÃ]O\s+DO\s+(PROCESSO|FEITO)|SEM\s+RESOLU[CÇ][AÃ]O\s+D[EO]\s+M[EÉ]RITO')
      and not (txt ~* 'CUMPRIMENTO|SATISFA[CÇ][AÃ]O\s+DA\s+OBRIGA[CÇ][AÃ]O|PAGAMENTO|ART\.?\s*924') as extinto_sem_merito
  from pub
),
ultimo_merito as (
  select distinct on (num) num, merito, dt
    from cls where merito is not null
   order by num, dt desc
),
por_num as (
  select c.num,
         max(c.dt) filter (where c.extinto_pagamento)  dt_pagamento,
         bool_or(c.extinto_sem_merito)                  sem_merito,
         min(c.dt) filter (where c.extinto_sem_merito)  dt_sem_merito
    from cls c group by c.num
)
select
  p.id                                   as processo_id,
  p.numero_processo,
  p.materia,
  p.materia_rubricas,
  p.requeridos,
  p.fase_processual,
  p.valor_causa,
  case
    when m.merito is not null            then m.merito
    when n.sem_merito                    then 'sem_merito'
    when n.dt_pagamento is not null      then 'pago_sem_sentenca'
    else                                      'em_andamento'
  end                                    as desfecho,
  coalesce(m.dt, n.dt_sem_merito, n.dt_pagamento) as dt_desfecho,
  /* Vitória que já virou dinheiro: extinção por pagamento DEPOIS da decisão. */
  (m.merito in ('procedente','parcial','acordo') and n.dt_pagamento >= m.dt) as executado,
  s.valor                                as valor_sentenca,
  (s.valor is not null)                  as no_tracker
from public.processos p
left join ultimo_merito m on m.num = regexp_replace(p.numero_processo, '\D', '', 'g')
left join por_num n       on n.num = regexp_replace(p.numero_processo, '\D', '', 'g')
left join lateral (
  select sum(se.valor) valor from public.sentencas se where se.processo_id = p.id
) s on true;

comment on view public.vw_desfecho_processo is
  'Desfecho de cada processo lido da ultima decisao publicada no DJEN. procedente | parcial | improcedente | acordo | sem_merito | pago_sem_sentenca | em_andamento.';

grant select on public.vw_desfecho_processo to authenticated;
