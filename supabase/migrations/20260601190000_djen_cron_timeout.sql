-- Recria o cron com timeout maior (sync com 500+ publicacoes pode levar
-- ate 1 min; default do pg_net e 5s).
do $$
begin
  perform cron.unschedule('djen-sync-diario');
exception when others then null;
end $$;

select cron.schedule(
  'djen-sync-diario',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://wvltdjspytysuoybcfgb.supabase.co/functions/v1/djen-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2bHRkanNweXR5c3VveWJjZmdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjAxNjEsImV4cCI6MjA5NDgzNjE2MX0.aTFKemNruwj70C3inSxfmz8DQm38ux9JGlq5GXuGL34'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
