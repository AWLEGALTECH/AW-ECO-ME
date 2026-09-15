-- OS DOIS RELÓGIOS DAS AUTOMAÇÕES.
--
--   leads-sync        de 5 em 5 min — a planilha vira lead sem ninguém clicar
--   wa-automacoes     de minuto em minuto — varre, toma a fila e roda os passos
--
-- POR QUE CINCO MINUTOS, E NÃO UM. A planilha é lida inteira a cada rodada (a
-- API do Google não avisa o que mudou), então cada leitura custa uma chamada
-- por base. De minuto em minuto seriam 1440 leituras por dia por planilha para
-- ganhar, no melhor caso, quatro minutos de resposta a um lead que acabou de
-- preencher um formulário. Cinco minutos é a diferença que ninguém percebe do
-- lado de lá e que mantém a conta de serviço longe do 429.
--
-- O EXECUTOR É DE MINUTO porque ele não sai chamando ninguém quando não há o
-- que fazer: a primeira coisa que faz é uma consulta na fila, e fila vazia
-- custa uma linha lida. É o mesmo desenho do `wa-despachar`, que já roda assim
-- há meses.
--
-- A CHAVE NO CABEÇALHO É A ANON, e não a de serviço, pelos mesmos dois motivos
-- do despachante: é o padrão que os outros crons deste banco já usam, e chamar
-- estas funções fora de hora não antecipa nada — as duas são filtradas por
-- `rodar_em <= now()` e por `ativa`, então uma chamada extra encontra a mesma
-- lista vazia que encontraria sozinha.

select cron.unschedule('leads-sync-5min') where exists (
  select 1 from cron.job where jobname = 'leads-sync-5min'
);

select cron.schedule(
  'leads-sync-5min',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := 'https://wvltdjspytysuoybcfgb.supabase.co/functions/v1/leads-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <anon key do projeto>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);

select cron.unschedule('wa-automacoes-minuto') where exists (
  select 1 from cron.job where jobname = 'wa-automacoes-minuto'
);

select cron.schedule(
  'wa-automacoes-minuto',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://wvltdjspytysuoybcfgb.supabase.co/functions/v1/wa-automacoes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <anon key do projeto>'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  );
  $cron$
);
