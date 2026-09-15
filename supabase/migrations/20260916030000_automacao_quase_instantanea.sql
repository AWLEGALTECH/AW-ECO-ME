-- A MENSAGEM DEMORAVA ATÉ SETE MINUTOS, E NENHUM DELES ERA TRABALHO.
--
-- Medido na primeira automação que funcionou de verdade:
--
--   16:47:03  o gatilho enfileira a execução
--   16:48:00  o executor a pega          → 57 s parada esperando o cron
--   16:48:00  a mensagem entra em wa_agendadas, marcada para agora
--   16:49:03  o despachante a envia      → 62 s parada esperando o cron
--
-- Dois minutos inteiros de espera de relógio para um trabalho de
-- milissegundos. E antes disso vinha a leitura da planilha, de cinco em cinco
-- minutos: sozinha, a maior parcela do atraso.
--
-- ───────────────────────── o conserto, em duas partes ───────────────────────
--
-- 1. A LEITURA PASSA A SER DE MINUTO EM MINUTO. O que tornou isso viável não
--    foi coragem: foi a `leads-sync` passar a gravar só a linha que MUDOU. Reler
--    688 linhas por minuto e regravar todas seria um milhão de versões de linha
--    por dia para não mudar nada, com inchaço de tabela e o gatilho de "o lead
--    voltou" sendo chamado à toa 688 vezes por minuto.
--
-- 2. CADA ETAPA ACORDA A SEGUINTE. A `leads-sync` chama a `wa-automacoes`
--    quando gravou alguma coisa; a `wa-automacoes` chama a `wa-despachar`
--    quando pôs mensagem na fila. Os crons continuam existindo como rede de
--    segurança, para o caso de uma chamada dessas se perder.
--
-- Fica: lead na planilha → no máximo um minuto até o banco → segundos até o
-- WhatsApp. Um minuto é o piso do pg_cron; abaixo disso só com a planilha
-- avisando sozinha (Apps Script no formulário), que é assunto de outro dia.

select cron.unschedule('leads-sync-5min') where exists (
  select 1 from cron.job where jobname = 'leads-sync-5min');

select cron.schedule('leads-sync-minuto', '* * * * *', $cron$
  select net.http_post(
    url := 'https://wvltdjspytysuoybcfgb.supabase.co/functions/v1/leads-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <anon key do projeto>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000);
  $cron$);
