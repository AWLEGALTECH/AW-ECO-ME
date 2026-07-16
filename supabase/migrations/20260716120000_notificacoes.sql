-- Sistema de notificações do AW ECO.
--
-- Modelo:
--   notificacoes       — cada evento vira 1 linha (broadcast). Visibilidade
--                        controlada por notificacao_config + RLS.
--   notificacao_lida   — marcador de leitura POR usuário (a notificação é
--                        compartilhada, então cada um tem seu "lida").
--   notificacao_config — o admin liga/desliga cada tipo e decide se os
--                        usuários não-admin enxergam aquele tipo (admin vê tudo).

create table if not exists public.notificacoes (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null,           -- pre_cliente_criado | pre_cliente_confirmado | peca_protocolada
  titulo      text not null,
  corpo       text,
  dados       jsonb not null default '{}'::jsonb,  -- cliente_nome, valor_causa, ids...
  link        text,                    -- rota interna aberta ao clicar
  actor_id    uuid,                    -- quem gerou (profiles.id), pode ser null
  actor_nome  text,
  created_at  timestamptz not null default now()
);
create index if not exists notificacoes_created_idx on public.notificacoes (created_at desc);
create index if not exists notificacoes_tipo_idx on public.notificacoes (tipo);

create table if not exists public.notificacao_lida (
  notificacao_id uuid not null references public.notificacoes(id) on delete cascade,
  user_id        uuid not null,
  lida_at        timestamptz not null default now(),
  primary key (notificacao_id, user_id)
);

create table if not exists public.notificacao_config (
  tipo             text primary key,
  label            text not null,
  ativo            boolean not null default true,   -- gera notificação?
  visivel_usuarios boolean not null default false   -- não-admins veem? (admin sempre vê)
);

insert into public.notificacao_config (tipo, label, ativo, visivel_usuarios) values
  ('pre_cliente_criado',     'Pré-cliente criado',                 true, false),
  ('pre_cliente_confirmado', 'Pré-cliente confirmado (virou cliente)', true, false),
  ('peca_protocolada',       'Ação protocolada (com valor da causa)',  true, false)
on conflict (tipo) do nothing;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.notificacoes     enable row level security;
alter table public.notificacao_lida enable row level security;
alter table public.notificacao_config enable row level security;

-- Helper: o usuário atual é admin aprovado?
create or replace function public.fn_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'admin' and coalesce(p.approved, false)
  );
$$;

-- notificacoes: admin vê tudo; usuário comum vê só tipos liberados e ativos.
drop policy if exists notif_select on public.notificacoes;
create policy notif_select on public.notificacoes for select to authenticated
  using (
    public.fn_is_admin()
    or exists (
      select 1 from public.notificacao_config c
       where c.tipo = notificacoes.tipo and c.visivel_usuarios and c.ativo
    )
  );

-- notificacao_lida: cada usuário só mexe nas próprias marcações.
drop policy if exists notif_lida_select on public.notificacao_lida;
create policy notif_lida_select on public.notificacao_lida for select to authenticated
  using (user_id = auth.uid());
drop policy if exists notif_lida_insert on public.notificacao_lida;
create policy notif_lida_insert on public.notificacao_lida for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists notif_lida_delete on public.notificacao_lida;
create policy notif_lida_delete on public.notificacao_lida for delete to authenticated
  using (user_id = auth.uid());

-- config: todos leem (pra saber o que mostrar); só admin altera.
drop policy if exists notif_cfg_select on public.notificacao_config;
create policy notif_cfg_select on public.notificacao_config for select to authenticated
  using (true);
drop policy if exists notif_cfg_update on public.notificacao_config;
create policy notif_cfg_update on public.notificacao_config for update to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());

-- Realtime: o sininho escuta inserts em tempo real.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificacoes'
  ) then
    alter publication supabase_realtime add table public.notificacoes;
  end if;
end $$;
