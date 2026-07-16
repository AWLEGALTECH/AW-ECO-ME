-- Refazer a análise comercial de um cliente e RECALCULAR o fechamento.
--
-- Decisões (combinadas com o cliente):
--   - Grava a nova análise em clientes.analise_comercial (substitui a anterior).
--   - As rubricas AJUIZÁVEIS (não bloqueadas) viram a nova contagem de ações.
--   - Se o cliente já tem fechamento: atualiza as rubricas dele, MANTENDO o
--     dono (quem captou). Só muda a quantidade de ações.
--   - Se não tem fechamento: cria um, creditado a quem captou (cadastrado_por),
--     com data de hoje.
--
-- SECURITY DEFINER pra escrever em clientes/fechamentos ignorando RLS.
create or replace function public.fn_refazer_analise_comercial(
  p_cliente_id uuid,
  p_analise jsonb,
  p_editor uuid default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_rubricas text[];
  v_new int;
  v_old int := 0;
  v_fech_id uuid;
  v_fech_resp text;
  v_cli_nome text;
  v_cadastrado_por text;
  v_autor_id uuid;
  v_pre uuid;
begin
  -- rubricas ajuizáveis (não bloqueadas, não vazias) da nova análise
  select coalesce(array_agg(r->>'rubrica'), array[]::text[])
    into v_rubricas
    from jsonb_array_elements(
           case jsonb_typeof(p_analise)
             when 'array' then p_analise
             else coalesce(p_analise->'rubricas', '[]'::jsonb)
           end
         ) r
   where coalesce((r->>'bloqueada')::boolean, false) = false
     and coalesce(btrim(r->>'rubrica'), '') <> '';
  v_new := coalesce(array_length(v_rubricas, 1), 0);

  -- Piso de 1 ação: uma captação nunca vale 0 (mesma política da confirmação,
  -- que injeta "Desconto ajuizável" quando não há descontos). Assim refazer a
  -- análise sem ajuizáveis não apaga a ação de quem captou.
  if v_new = 0 then
    v_rubricas := array['Desconto ajuizável'];
    v_new := 1;
  end if;

  -- grava a nova análise no cliente
  update public.clientes set analise_comercial = p_analise where id = p_cliente_id;
  select nome, cadastrado_por into v_cli_nome, v_cadastrado_por
    from public.clientes where id = p_cliente_id;

  -- fechamento do cliente (prefere o ligado a pré-cliente; senão o mais recente)
  select id, coalesce(array_length(rubricas, 1), 0), responsavel
    into v_fech_id, v_old, v_fech_resp
    from public.fechamentos
   where cliente_id = p_cliente_id
   order by (pre_cliente_id is not null) desc, data desc
   limit 1;

  if v_fech_id is not null then
    update public.fechamentos set rubricas = v_rubricas where id = v_fech_id;
    return jsonb_build_object('acao', 'atualizado', 'fechamento_id', v_fech_id,
                              'antes', v_old, 'depois', v_new, 'responsavel', v_fech_resp);
  end if;

  -- sem fechamento: cria um, creditado a quem captou (cadastrado_por)
  v_autor_id := public.fn_resolve_autor(v_cadastrado_por);
  if v_autor_id is null then v_autor_id := p_editor; end if;
  select id into v_pre from public.pre_clientes
   where cliente_id = p_cliente_id order by created_at desc limit 1;

  insert into public.fechamentos
    (data, cliente_nome, cliente_id, rubricas, pendencia, pasta_drive, user_id, responsavel, created_by, pre_cliente_id)
  values
    (current_date, v_cli_nome, p_cliente_id, v_rubricas, false, false,
     v_autor_id, v_cadastrado_por, coalesce(v_autor_id, p_editor), v_pre)
  on conflict (pre_cliente_id) where pre_cliente_id is not null
    do update set rubricas = excluded.rubricas
  returning id into v_fech_id;

  return jsonb_build_object('acao', 'criado', 'fechamento_id', v_fech_id,
                            'antes', 0, 'depois', v_new, 'responsavel', v_cadastrado_por);
end; $$;

grant execute on function public.fn_refazer_analise_comercial(uuid, jsonb, uuid) to authenticated;
