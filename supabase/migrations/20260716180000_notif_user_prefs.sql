-- Controle de notificações POR usuário: o admin escolhe, na tela de Usuários,
-- quais tipos cada usuário recebe. Admin sempre recebe tudo.
--
-- notificacao_user_prefs — 1 linha por (usuário, tipo) com permitido=true.
-- Sem linha = não recebe. A antiga coluna notificacao_config.visivel_usuarios
-- deixa de reger a visibilidade (o controle agora é por usuário).

create table if not exists public.notificacao_user_prefs (
  user_id   uuid not null,
  tipo      text not null,
  permitido boolean not null default true,
  primary key (user_id, tipo)
);

alter table public.notificacao_user_prefs enable row level security;

-- Admin gerencia tudo; usuário lê as próprias (a RLS de notificacoes precisa).
drop policy if exists nup_admin_all on public.notificacao_user_prefs;
create policy nup_admin_all on public.notificacao_user_prefs for all to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());
drop policy if exists nup_self_read on public.notificacao_user_prefs;
create policy nup_self_read on public.notificacao_user_prefs for select to authenticated
  using (user_id = auth.uid());

-- Novo tipo (Parte B): cliente assinou o contrato (via ZapSign).
insert into public.notificacao_config (tipo, label, ativo, visivel_usuarios) values
  ('cliente_assinou', 'Cliente assinou o contrato', true, false)
on conflict (tipo) do nothing;

-- Visibilidade de notificacoes agora é por usuário (admin vê tudo).
drop policy if exists notif_select on public.notificacoes;
create policy notif_select on public.notificacoes for select to authenticated
  using (
    public.fn_is_admin()
    or exists (
      select 1
        from public.notificacao_user_prefs p
        join public.notificacao_config c on c.tipo = p.tipo
       where p.user_id = auth.uid()
         and p.tipo = notificacoes.tipo
         and p.permitido
         and c.ativo
    )
  );
