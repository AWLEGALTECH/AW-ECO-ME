-- A FOTO ENTRA NA PRIMEIRA MENSAGEM QUE A CONVERSA TROCAR.
--
-- Por gatilho, e não dentro da `wa-webhook`. A webhook é a peça mais delicada
-- do sistema (é ela que precisa de `verify_jwt = false`, e um deploy pela API
-- religa isso sozinho e derruba a caixa em silêncio). Somar responsabilidade
-- ali significa mexer nela de novo a cada regra nova; aqui a regra fica ao lado
-- das outras que já moram em gatilho, e a webhook segue intocada.
--
-- CARIMBA ANTES DE CHAMAR. Dez mensagens seguidas da mesma conversa dispararam
-- dez buscas se o carimbo só viesse no fim. A `wa-foto` limpa o carimbo quando
-- não conseguiu nem perguntar (Evolution fora do ar), então "não tem foto" e
-- "não deu para perguntar" não se confundem.
--
-- Mesmo caminho do push: `pg_net` com a chave anônima, que é JWT válido para o
-- portão e não dá acesso a nada por si.

create or replace function public.fn_wa_foto_do_contato()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $function$
declare
  v_conversa uuid;
begin
  select id into v_conversa
    from public.wa_conversas
   where id = new.conversa_id
     and foto_path is null
     and foto_em is null
   for update skip locked;

  if v_conversa is null then return new; end if;

  update public.wa_conversas set foto_em = now() where id = v_conversa;

  perform net.http_post(
    url := 'https://wvltdjspytysuoybcfgb.supabase.co/functions/v1/wa-foto',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2bHRkanNweXR5c3VveWJjZmdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjAxNjEsImV4cCI6MjA5NDgzNjE2MX0.aTFKemNruwj70C3inSxfmz8DQm38ux9JGlq5GXuGL34',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2bHRkanNweXR5c3VveWJjZmdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjAxNjEsImV4cCI6MjA5NDgzNjE2MX0.aTFKemNruwj70C3inSxfmz8DQm38ux9JGlq5GXuGL34'
    ),
    body := jsonb_build_object('conversas', jsonb_build_array(v_conversa))
  );
  return new;
end $function$;

drop trigger if exists trg_wa_foto_do_contato on public.wa_mensagens;
create trigger trg_wa_foto_do_contato
  after insert on public.wa_mensagens
  for each row execute function public.fn_wa_foto_do_contato();

comment on function public.fn_wa_foto_do_contato is
  'Na primeira mensagem de uma conversa sem foto, pede a foto de perfil do contato (edge wa-foto).';
