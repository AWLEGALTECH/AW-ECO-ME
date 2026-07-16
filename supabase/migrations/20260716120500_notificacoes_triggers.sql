-- Geração automática das notificações a partir dos eventos do sistema.
--   1) pré-cliente criado        (INSERT em pre_clientes)
--   2) pré-cliente confirmado    (UPDATE em pre_clientes -> status confirmado)
--   3) ação protocolada          (UPDATE em demandas -> protocolado_at preenchido)
-- Todos os inserts passam por fn_criar_notificacao, que respeita o liga/desliga
-- de notificacao_config.ativo.

-- Formata número como moeda BR: 55970 -> "R$ 55.970,00".
create or replace function public.fn_fmt_brl(v numeric)
returns text language sql immutable as $$
  select 'R$ ' || translate(to_char(coalesce(v, 0), 'FM999G999G990D00'), ',.', '.,');
$$;

-- Insere uma notificação SE o tipo estiver ativo na config.
create or replace function public.fn_criar_notificacao(
  p_tipo text, p_titulo text, p_corpo text, p_dados jsonb,
  p_link text, p_actor_id uuid, p_actor_nome text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.notificacao_config c where c.tipo = p_tipo and c.ativo) then
    return;
  end if;
  insert into public.notificacoes (tipo, titulo, corpo, dados, link, actor_id, actor_nome)
  values (p_tipo, p_titulo, p_corpo, coalesce(p_dados, '{}'::jsonb), p_link, p_actor_id, p_actor_nome);
end;
$$;

-- Resolve o profiles.id a partir do "Primeiro Último" (mesma regra usada no
-- comissionamento). Retorna null se não achar.
create or replace function public.fn_resolve_autor(p_nome text)
returns uuid language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p
   where p_nome is not null and btrim(p_nome) <> ''
     and lower(
           split_part(btrim(p.nome), ' ', 1) || ' ' ||
           reverse(split_part(reverse(btrim(p.nome)), ' ', 1))
         ) = lower(btrim(p_nome))
   limit 1;
$$;

-- 1) Pré-cliente criado ────────────────────────────────────────────────────
create or replace function public.fn_notif_pre_cliente_criado()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_autor text; begin
  v_autor := new.dados_completos->>'cadastrado_por';
  perform public.fn_criar_notificacao(
    'pre_cliente_criado',
    'Novo pré-cliente',
    coalesce(new.nome, 'Cliente') || coalesce(' · por ' || nullif(btrim(v_autor), ''), ''),
    jsonb_build_object('cliente_nome', new.nome, 'pre_cliente_id', new.id),
    '/pre-clientes',
    public.fn_resolve_autor(v_autor),
    nullif(btrim(v_autor), '')
  );
  return new;
end; $$;

drop trigger if exists trg_notif_pre_cliente_criado on public.pre_clientes;
create trigger trg_notif_pre_cliente_criado
  after insert on public.pre_clientes
  for each row execute function public.fn_notif_pre_cliente_criado();

-- 2) Pré-cliente confirmado (virou cliente) ────────────────────────────────
create or replace function public.fn_notif_pre_cliente_confirmado()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_autor text; v_cli text; begin
  if new.status = 'confirmado' and (old.status is distinct from 'confirmado') then
    v_autor := new.dados_completos->>'cadastrado_por';
    v_cli := coalesce((select nome from public.clientes where id = new.cliente_id), new.nome);
    perform public.fn_criar_notificacao(
      'pre_cliente_confirmado',
      'Pré-cliente confirmado',
      coalesce(v_cli, 'Cliente') || ' virou cliente'
        || coalesce(' · de ' || nullif(btrim(v_autor), ''), ''),
      jsonb_build_object('cliente_nome', v_cli, 'cliente_id', new.cliente_id, 'pre_cliente_id', new.id),
      coalesce('/clientes/' || new.cliente_id::text, '/pre-clientes'),
      coalesce(new.confirmed_by, public.fn_resolve_autor(v_autor)),
      nullif(btrim(v_autor), '')
    );
  end if;
  return new;
end; $$;

drop trigger if exists trg_notif_pre_cliente_confirmado on public.pre_clientes;
create trigger trg_notif_pre_cliente_confirmado
  after update on public.pre_clientes
  for each row execute function public.fn_notif_pre_cliente_confirmado();

-- 3) Ação protocolada ──────────────────────────────────────────────────────
create or replace function public.fn_notif_peca_protocolada()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cli text; begin
  if new.protocolado_at is not null and (old.protocolado_at is null) then
    v_cli := (select nome from public.clientes where id = new.cliente_id);
    perform public.fn_criar_notificacao(
      'peca_protocolada',
      'Ação protocolada',
      coalesce(v_cli, 'Cliente') || ' · ' || public.fn_fmt_brl(new.valor_causa),
      jsonb_build_object(
        'cliente_nome', v_cli,
        'cliente_id', new.cliente_id,
        'valor_causa', new.valor_causa,
        'numero_processo', new.numero_processo
      ),
      coalesce('/clientes/' || new.cliente_id::text, '/esteira'),
      null, null
    );
  end if;
  return new;
end; $$;

drop trigger if exists trg_notif_peca_protocolada on public.demandas;
create trigger trg_notif_peca_protocolada
  after update on public.demandas
  for each row execute function public.fn_notif_peca_protocolada();
