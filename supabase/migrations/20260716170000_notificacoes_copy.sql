-- Copy humanizada das notificações: título com emoji e corpo dissertativo,
-- com nome do cliente em Title Case e primeiro nome de quem captou.
-- (No sininho o nome/valor saem em negrito — feito no client; no push o SO
--  não permite formatação, então lá é a mesma frase em texto puro.)

create or replace function public.fn_title_nome(p text)
returns text language sql immutable as $$
  select case when p is null or btrim(p) = '' then p else (
    select string_agg(
      case when lower(w) in ('de','da','do','das','dos','e') and ord > 1 then lower(w)
           else upper(left(w,1)) || lower(substr(w,2)) end, ' ')
    from (
      select w, row_number() over () ord
      from regexp_split_to_table(btrim(regexp_replace(p, '\s+', ' ', 'g')), ' ') w
    ) t
  ) end;
$$;

create or replace function public.fn_primeiro_nome(p text)
returns text language sql immutable as $$
  select public.fn_title_nome(split_part(btrim(coalesce(p, '')), ' ', 1));
$$;

create or replace function public.fn_notif_pre_cliente_criado()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_autor text; v_nome text; v_af text; begin
  v_autor := new.dados_completos->>'cadastrado_por';
  v_nome := public.fn_title_nome(new.nome);
  v_af := public.fn_primeiro_nome(v_autor);
  perform public.fn_criar_notificacao(
    'pre_cliente_criado', 'Novo pré-cliente 📁',
    case when coalesce(v_af,'') <> ''
      then v_af || ' cadastrou o pré-cliente ' || coalesce(v_nome,'—') || ', que agora aguarda confirmação.'
      else coalesce(v_nome,'—') || ' foi cadastrado como pré-cliente e aguarda confirmação.' end,
    jsonb_build_object('cliente_nome', new.nome, 'pre_cliente_id', new.id),
    '/pre-clientes', public.fn_resolve_autor(v_autor), nullif(btrim(v_autor), ''));
  return new;
end; $$;

create or replace function public.fn_notif_pre_cliente_confirmado()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_autor text; v_cli text; v_af text; begin
  if new.status = 'confirmado' and (old.status is distinct from 'confirmado') then
    v_autor := new.dados_completos->>'cadastrado_por';
    v_cli := public.fn_title_nome(coalesce((select nome from public.clientes where id = new.cliente_id), new.nome));
    v_af := public.fn_primeiro_nome(v_autor);
    perform public.fn_criar_notificacao(
      'pre_cliente_confirmado', 'Novo cliente 👤',
      coalesce(v_cli,'—') || ' virou cliente.'
        || case when coalesce(v_af,'') <> '' then ' Fechamento de ' || v_af || '.' else '' end,
      jsonb_build_object('cliente_nome', coalesce((select nome from public.clientes where id = new.cliente_id), new.nome),
                         'cliente_id', new.cliente_id, 'pre_cliente_id', new.id),
      coalesce('/clientes/' || new.cliente_id::text, '/pre-clientes'),
      coalesce(new.confirmed_by, public.fn_resolve_autor(v_autor)), nullif(btrim(v_autor), ''));
  end if;
  return new;
end; $$;

create or replace function public.fn_notif_peca_protocolada()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cli text; begin
  if new.protocolado_at is not null and (old.protocolado_at is null) then
    v_cli := public.fn_title_nome((select nome from public.clientes where id = new.cliente_id));
    perform public.fn_criar_notificacao(
      'peca_protocolada', 'Ação protocolada ☑️',
      'A ação de ' || coalesce(v_cli,'—') || ' foi protocolada, com valor de causa de ' || public.fn_fmt_brl(new.valor_causa) || '.',
      jsonb_build_object('cliente_nome', (select nome from public.clientes where id = new.cliente_id),
                         'cliente_id', new.cliente_id, 'valor_causa', new.valor_causa, 'numero_processo', new.numero_processo),
      coalesce('/clientes/' || new.cliente_id::text, '/esteira'), null, null);
  end if;
  return new;
end; $$;
