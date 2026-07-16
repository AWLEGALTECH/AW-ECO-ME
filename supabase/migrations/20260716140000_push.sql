-- Push (Fase 2 das notificações): assinaturas dos aparelhos + disparo.
--
-- push_subscriptions — 1 linha por aparelho/navegador inscrito (endpoint +
--                      chaves p256dh/auth que o Web Push exige).
-- push_vapid          — guarda o par de chaves VAPID (JWK). RLS sem policy =
--                      ninguém lê pelo client; só o service role (edge fn) lê.
-- Trigger em notificacoes -> chama a edge function send-push via pg_net (async),
-- que resolve os destinatários e entrega o push.

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user_idx on public.push_subscriptions (user_id);

create table if not exists public.push_vapid (
  id          int primary key default 1,
  keys        jsonb not null,             -- { publicKey: JWK, privateKey: JWK }
  updated_at  timestamptz not null default now(),
  constraint push_vapid_singleton check (id = 1)
);

alter table public.push_subscriptions enable row level security;
alter table public.push_vapid         enable row level security;  -- sem policy: só service role

-- Cada usuário gerencia só as próprias inscrições.
drop policy if exists push_sub_select on public.push_subscriptions;
create policy push_sub_select on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
drop policy if exists push_sub_insert on public.push_subscriptions;
create policy push_sub_insert on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists push_sub_delete on public.push_subscriptions;
create policy push_sub_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- pg_net pra chamar a edge function sem travar o insert.
create extension if not exists pg_net;

-- Ao inserir uma notificação, dispara o send-push (que decide destinatários).
create or replace function public.fn_disparar_push()
returns trigger language plpgsql security definer set search_path = public, net, extensions as $$
begin
  perform net.http_post(
    url := 'https://wvltdjspytysuoybcfgb.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2bHRkanNweXR5c3VveWJjZmdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjAxNjEsImV4cCI6MjA5NDgzNjE2MX0.aTFKemNruwj70C3inSxfmz8DQm38ux9JGlq5GXuGL34',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2bHRkanNweXR5c3VveWJjZmdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjAxNjEsImV4cCI6MjA5NDgzNjE2MX0.aTFKemNruwj70C3inSxfmz8DQm38ux9JGlq5GXuGL34'
    ),
    body := jsonb_build_object('notificacao_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists trg_disparar_push on public.notificacoes;
create trigger trg_disparar_push
  after insert on public.notificacoes
  for each row execute function public.fn_disparar_push();
