-- Notificações de chamados + suporte a notificação DIRECIONADA a um usuário.
--   - chamado_aberto     → broadcast (admins recebem; resolvem)
--   - chamado_resolvido  → direcionada a quem abriu o chamado
-- E restringe a mudança de status/resolução a admins.

-- 1) Notificação direcionada: coluna + RLS (o destinatário também vê no sino). ─
alter table public.notificacoes add column if not exists destinatario_id uuid;

drop policy if exists notif_select on public.notificacoes;
create policy notif_select on public.notificacoes for select to authenticated
  using (
    public.fn_is_admin()
    or destinatario_id = auth.uid()
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

-- 2) fn_criar_notificacao ganha uma versão _ext com destinatário; a de 7 args
--    vira um wrapper (mantém todos os callers atuais funcionando). ────────────
create or replace function public.fn_criar_notificacao_ext(
  p_tipo text, p_titulo text, p_corpo text, p_dados jsonb,
  p_link text, p_actor_id uuid, p_actor_nome text, p_destinatario_id uuid
) returns void language plpgsql security definer set search_path = public as $$
declare c record; v_tit text; v_corpo text; v_dados jsonb;
begin
  select * into c from public.notificacao_config where tipo = p_tipo;
  if c.tipo is null or not c.ativo then return; end if;
  v_dados := coalesce(p_dados, '{}'::jsonb);
  if (v_dados ? 'cliente_nome') and not (v_dados ? 'cliente') then
    v_dados := v_dados || jsonb_build_object('cliente', public.fn_title_nome(v_dados->>'cliente_nome'));
  end if;
  v_tit   := coalesce(nullif(public.fn_render_template(c.titulo_template, v_dados), ''), p_titulo);
  v_corpo := coalesce(nullif(public.fn_render_template(c.corpo_template,  v_dados), ''), p_corpo);
  v_tit   := btrim(replace(v_tit,   '—', ''));
  v_corpo := btrim(replace(v_corpo, '—', ''));
  insert into public.notificacoes (tipo, titulo, corpo, dados, link, actor_id, actor_nome, destinatario_id)
  values (p_tipo, v_tit, v_corpo, v_dados, p_link, p_actor_id, p_actor_nome, p_destinatario_id);
end; $$;

create or replace function public.fn_criar_notificacao(
  p_tipo text, p_titulo text, p_corpo text, p_dados jsonb,
  p_link text, p_actor_id uuid, p_actor_nome text
) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.fn_criar_notificacao_ext(p_tipo, p_titulo, p_corpo, p_dados, p_link, p_actor_id, p_actor_nome, null);
end; $$;

-- 3) Tipos de notificação dos chamados (copy editável na central). ────────────
insert into public.notificacao_config (tipo, label, ativo, visivel_usuarios) values
  ('chamado_aberto',    'Chamado aberto',    true, false),
  ('chamado_resolvido', 'Chamado resolvido', true, false)
on conflict (tipo) do nothing;

update public.notificacao_config set
  titulo_template = 'Novo chamado 🎫',
  corpo_template  = 'Novo chamado ({tipo}) em {sistema}: {titulo}. Aberto por {autor}.',
  variaveis = jsonb_build_object(
    'tipo', 'Tipo (Bug/Implementação/Ideia)',
    'sistema', 'Aba/área do chamado',
    'titulo', 'Título do chamado',
    'autor', 'Quem abriu')
where tipo = 'chamado_aberto';

update public.notificacao_config set
  titulo_template = 'Chamado resolvido ✅',
  corpo_template  = 'Seu chamado "{titulo}" foi resolvido por {resolvido_por}.',
  variaveis = jsonb_build_object(
    'titulo', 'Título do chamado',
    'resolvido_por', 'Quem resolveu')
where tipo = 'chamado_resolvido';

-- 4) Triggers: abriu → avisa; resolveu → avisa quem abriu. ────────────────────
create or replace function public.fn_notif_chamado_aberto()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tl text; v_sis text;
begin
  v_tl := case new.tipo when 'bug' then 'Bug' when 'implementacao' then 'Implementação'
                        when 'ideia' then 'Ideia' else new.tipo end;
  v_sis := coalesce(nullif(btrim(new.sistema), ''), 'Geral');
  perform public.fn_criar_notificacao(
    'chamado_aberto', 'Novo chamado 🎫',
    'Novo chamado (' || v_tl || ') em ' || v_sis || ': ' || new.titulo
      || '. Aberto por ' || coalesce(new.autor_nome, 'alguém') || '.',
    jsonb_build_object('titulo', new.titulo, 'tipo', v_tl, 'sistema', v_sis,
                       'autor', coalesce(new.autor_nome, 'Alguém')),
    '/chamados', new.created_by, new.autor_nome);
  return new;
end; $$;

drop trigger if exists trg_notif_chamado_aberto on public.chamados;
create trigger trg_notif_chamado_aberto
  after insert on public.chamados
  for each row execute function public.fn_notif_chamado_aberto();

create or replace function public.fn_notif_chamado_resolvido()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'resolvido' and (old.status is distinct from 'resolvido')
     and new.created_by is not null
     and new.created_by is distinct from new.resolvido_por then
    perform public.fn_criar_notificacao_ext(
      'chamado_resolvido', 'Chamado resolvido ✅',
      'Seu chamado "' || new.titulo || '" foi resolvido por '
        || coalesce(new.resolvido_por_nome, 'a equipe') || '.',
      jsonb_build_object('titulo', new.titulo,
                         'resolvido_por', coalesce(new.resolvido_por_nome, 'a equipe')),
      '/chamados', new.resolvido_por, new.resolvido_por_nome,
      new.created_by);
  end if;
  return new;
end; $$;

drop trigger if exists trg_notif_chamado_resolvido on public.chamados;
create trigger trg_notif_chamado_resolvido
  after update on public.chamados
  for each row execute function public.fn_notif_chamado_resolvido();

-- 5) Quem resolve/muda status = só admins (o autor abre e acompanha). ─────────
drop policy if exists chamados_update on public.chamados;
create policy chamados_update on public.chamados for update to authenticated
  using (public.fn_is_admin()) with check (public.fn_is_admin());
