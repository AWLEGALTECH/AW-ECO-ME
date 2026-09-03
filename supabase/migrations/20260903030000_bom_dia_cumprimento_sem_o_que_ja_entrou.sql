-- O "VALOR EM CUMPRIMENTO" ESTAVA CONTANDO DINHEIRO QUE JÁ ENTROU.
--
-- A notificação das 6h somava, todo dia, coisa que não estava mais a receber.
-- Dois buracos, medidos na base em 02/09/2026:
--
-- 1) PAGO CONTINUAVA CONTANDO — 5 processos, R$ 23.502,23.
--    A baixa do Tracker marca `fase_processual = 'ALVARÁ PAGO'` e carimba o
--    `statusProcessual` da etapa, mas NÃO move a linha do tempo: a etapa
--    "Cumprimento de sentença" segue com status='atual'. Como o filtro só
--    olhava o TÍTULO da etapa atual, processo pago continuava somando. Mais da
--    metade do número que chegava de manhã era dinheiro que já tinha entrado e
--    já tinha sido repassado ao cliente.
--
-- 2) ACORDO NÃO ENTRAVA — 3 processos em AG. PAGAMENTO ACORDO.
--    O filtro aceitava só 'Cumprimento de sentença'. Quem fechou acordo e
--    espera o pagamento fica na etapa "Acordo" e não era contado em lugar
--    nenhum. Era o "valor novo entrando" que o escritório sentiu falta.
--
-- A REGRA PASSA A SER UMA SÓ: é "em cumprimento" o dinheiro que a gente espera
-- receber e ainda NÃO recebeu.
--
--   · etapa atual é Cumprimento de sentença OU Acordo
--   · o processo não está arquivado
--   · e não foi pago
--
-- "Pago" é a mesma definição do src/lib/baixaTracker.ts — ALVARÁ PAGO ou
-- ACORDO PAGO — lida dos DOIS lugares onde a baixa escreve (a fase do processo
-- e o statusProcessual da etapa), porque uma baixa antiga pode ter carimbado só
-- um deles.
--
-- ACORDO SEM VALOR NÃO VIRA ZERO EM SILÊNCIO: ele é contado à parte e sai numa
-- linha do aviso, pra alguém ir preencher em vez de o número mentir pra baixo.
--
-- O PARÂMETRO DE DESTINATÁRIO É PRA TESTE. Sem ele, a notificação vai pra todo
-- mundo, como sempre; com um id, vai só pra aquela pessoa. O cron continua
-- chamando `fn_bom_dia_ajuizado()` sem argumento, às 10h UTC (6h de Manaus).
-- Testar mandando pro escritório inteiro às 2 da manhã não é teste, é susto.

create or replace function public.fn_bom_dia_ajuizado(p_destinatario uuid default null)
returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_total numeric; v_cumpr numeric; v_sem_valor int;
  v_total_fmt text; v_cumpr_fmt text; v_alerta text;
begin
  select coalesce(sum(valor_causa), 0) into v_total
    from public.processos where fase_processual is distinct from 'ARQUIVADO';

  with base as (
    select
      p.fase_processual,
      (select e from jsonb_array_elements(p.linha_temporal) e where e->>'status' = 'atual' limit 1) as atual,
      (select (e->'execucao'->>'valor')::numeric from jsonb_array_elements(p.linha_temporal) e
        where e->>'titulo' = 'Cumprimento de sentença' limit 1) as eval,
      (select (e->'acordo'->>'valor')::numeric   from jsonb_array_elements(p.linha_temporal) e
        where e->>'titulo' = 'Acordo' limit 1) as aval,
      (select (e->'sentenca'->>'valor')::numeric from jsonb_array_elements(p.linha_temporal) e
        where e->>'titulo' = 'Sentença' limit 1) as sval
    from public.processos p
    where p.linha_temporal is not null
      and p.fase_processual is distinct from 'ARQUIVADO'
  ), aberto as (
    select
      b.atual->>'titulo' as fase,
      b.eval, b.aval, b.sval,
      (b.fase_processual in ('ALVARÁ PAGO', 'ACORDO PAGO')
        or coalesce(b.atual->>'statusProcessual', '') in ('ALVARÁ PAGO', 'ACORDO PAGO')) as pago
    from base b
  )
  select
    coalesce(sum(case when fase = 'Cumprimento de sentença' then coalesce(eval, sval)
                      when fase = 'Acordo'                  then aval
                 end), 0),
    count(*) filter (where fase = 'Acordo' and aval is null)
  into v_cumpr, v_sem_valor
  from aberto
  where not pago and fase in ('Cumprimento de sentença', 'Acordo');

  v_total_fmt := public.fn_fmt_brl(v_total);
  v_cumpr_fmt := public.fn_fmt_brl(v_cumpr);
  v_alerta := case when v_sem_valor > 0
                   then E'\n' || v_sem_valor || ' acordo' || case when v_sem_valor > 1 then 's' else '' end
                        || ' sem valor registrado'
                   else '' end;

  perform public.fn_criar_notificacao_ext(
    'bom_dia', 'Balanço diário 📈',
    'Valor ajuizado: ' || v_total_fmt || E'\n' || 'Valor em cumprimento: ' || v_cumpr_fmt || v_alerta,
    jsonb_build_object('valor_total', v_total, 'valor_cumprimento', v_cumpr,
                       'ajuizado', v_total_fmt, 'cumprimento', v_cumpr_fmt,
                       'acordos_sem_valor', v_sem_valor, 'alerta', v_alerta),
    '/dashboard', null, null, p_destinatario);
end; $function$;

-- O corpo da notificação vem de um template no banco; sem esta linha, o alerta
-- dos acordos sem valor seria montado na função e descartado na renderização.
update public.notificacao_config
   set corpo_template = 'Valor ajuizado: {ajuizado}' || E'\n' || 'Valor em cumprimento: {cumprimento}{alerta}'
 where tipo = 'bom_dia';
