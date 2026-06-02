-- Agenda o sync diario do DJEN as 09:00 UTC (06:00 BRT).
-- pg_cron + pg_net ja estao instalados (usados por outros jobs).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove o job se ja existir (idempotente)
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
    body := '{}'::jsonb
  );
  $$
);
