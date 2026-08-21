-- Salva UM grupo da analise comercial.
--
-- Grupo novo  (p_grupo_id null): as rubricas nascem agora, contam no mes
--   corrente e vao para quem p_creditar_a disser.
-- Grupo existente: so corrige o que ja existe. Remocao sai do fechamento
--   daquele grupo; nada de contabilidade nova. As rubricas dos OUTROS grupos
--   nunca sao tocadas — e isso que impede uma edicao de mexer em mes fechado.
create or replace function public.fn_salvar_grupo_analise(
  p_cliente_id uuid,
  p_rubricas jsonb,
  p_grupo_id uuid default null,
  p_editor uuid default null,
  p_creditar_a uuid default null,
  p_contrato_id uuid default null,
  p_motivo_remocao text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ac         jsonb;
  v_grupos     jsonb;
  v_outras     jsonb := '[]'::jsonb;
  v_antigas    jsonb := '[]'::jsonb;   -- rubricas que este grupo tinha
  v_saida      jsonb := '[]'::jsonb;   -- rubricas finais deste grupo
  v_novas      int := 0;
  v_removidas  int := 0;
  v_rub        jsonb;
  v_ids_final  text[];
  v_grupo      uuid;
  v_novo       boolean;
  v_creditar   uuid;
  v_fech       uuid;
  v_cli_nome   text;
  v_hoje       date := current_date;
begin
  select nome, coalesce(analise_comercial, '{}'::jsonb) into v_cli_nome, v_ac
    from public.clientes where id = p_cliente_id;
  if v_cli_nome is null then raise exception 'cliente % nao encontrado', p_cliente_id; end if;

  v_grupos := case when jsonb_typeof(v_ac->'grupos') = 'array' then v_ac->'grupos' else '[]'::jsonb end;
  v_novo   := p_grupo_id is null;
  v_grupo  := coalesce(p_grupo_id, gen_random_uuid());

  -- separa o que e deste grupo do que e dos outros
  for v_rub in select e.valor from jsonb_array_elements(
      case when jsonb_typeof(v_ac->'rubricas') = 'array' then v_ac->'rubricas' else '[]'::jsonb end) as e(valor)
  loop
    if (v_rub->>'grupo_id') is not distinct from v_grupo::text then
      v_antigas := v_antigas || jsonb_build_array(v_rub);
    else
      v_outras := v_outras || jsonb_build_array(v_rub);
    end if;
  end loop;

  if v_novo and jsonb_array_length(v_antigas) > 0 then
    raise exception 'grupo % ja existe', v_grupo;
  end if;

  -- monta a lista final do grupo: quem tem id continua sendo o mesmo; quem
  -- chega sem id e rubrica nova.
  v_ids_final := array[]::text[];
  for v_rub in select e.valor from jsonb_array_elements(coalesce(p_rubricas, '[]'::jsonb)) as e(valor)
  loop
    if (v_rub->>'id') is null then
      v_novas := v_novas + 1;
      v_rub := v_rub || jsonb_build_object('id', gen_random_uuid());
    end if;
    v_ids_final := v_ids_final || (v_rub->>'id');
    v_rub := v_rub || jsonb_build_object('grupo_id', to_jsonb(v_grupo::text));
    v_saida := v_saida || jsonb_build_array(v_rub);
  end loop;

  -- o que sumiu da lista foi removido do grupo
  for v_rub in select e.valor from jsonb_array_elements(v_antigas) as e(valor)
  loop
    if not ((v_rub->>'id') = any(v_ids_final)) then
      v_removidas := v_removidas + 1;
      insert into public.analise_comercial_eventos
        (cliente_id, contrato_id, rubrica, requerido, acao, por, motivo)
      values (p_cliente_id, nullif(v_rub->>'contrato_id','')::uuid, v_rub->>'rubrica',
              nullif(v_rub->>'requerido',''), 'removida', p_editor, p_motivo_remocao);
    end if;
  end loop;

  -- ── fechamento do grupo ──────────────────────────────────────────────────
  if v_novo then
    v_creditar := coalesce(p_creditar_a, p_editor);
    select id into v_fech from public.fechamentos
     where cliente_id = p_cliente_id and pre_cliente_id is null
       and user_id is not distinct from v_creditar
       and date_trunc('month', data) = date_trunc('month', v_hoje)
     limit 1;
    if v_fech is null then
      insert into public.fechamentos
        (data, cliente_nome, cliente_id, rubricas, pendencia, pasta_drive, user_id, responsavel, created_by)
      values (v_hoje, v_cli_nome, p_cliente_id, array[]::text[], false, true, v_creditar,
              (select nome from public.profiles where id = v_creditar), coalesce(p_editor, v_creditar))
      returning id into v_fech;
    end if;
    v_grupos := v_grupos || jsonb_build_array(jsonb_build_object(
      'id', v_grupo::text, 'criado_em', v_hoje::text,
      'criado_por', to_jsonb(p_editor), 'creditada_a', to_jsonb(v_creditar),
      'contrato_id', to_jsonb(p_contrato_id), 'fechamento_id', to_jsonb(v_fech)));
  else
    select (g->>'fechamento_id')::uuid, (g->>'creditada_a')::uuid into v_fech, v_creditar
      from jsonb_array_elements(v_grupos) g where g->>'id' = v_grupo::text;
  end if;

  -- o fechamento do grupo passa a espelhar exatamente as rubricas ajuizaveis
  -- dele. Como so este grupo e tocado, nenhum outro mes se mexe.
  if v_fech is not null then
    update public.fechamentos
       set rubricas = coalesce((
             select array_agg(e.valor->>'rubrica')
               from jsonb_array_elements(v_saida) as e(valor)
              where coalesce((e.valor->>'bloqueada')::boolean, false) = false
                and coalesce(btrim(e.valor->>'rubrica'), '') <> ''), array[]::text[])
     where id = v_fech;
  end if;

  -- historico das que entraram (so faz sentido em grupo novo)
  if v_novo then
    for v_rub in select e.valor from jsonb_array_elements(v_saida) as e(valor) loop
      insert into public.analise_comercial_eventos
        (cliente_id, contrato_id, rubrica, requerido, acao, por, creditada_a, fechamento_id)
      values (p_cliente_id, nullif(v_rub->>'contrato_id','')::uuid, v_rub->>'rubrica',
              nullif(v_rub->>'requerido',''), 'adicionada', p_editor, v_creditar, v_fech);
    end loop;
  end if;

  update public.clientes
     set analise_comercial = v_ac || jsonb_build_object('rubricas', v_outras || v_saida, 'grupos', v_grupos)
   where id = p_cliente_id;

  return jsonb_build_object(
    'grupo_id', v_grupo, 'novo', v_novo,
    'novas', case when v_novo then jsonb_array_length(v_saida) else 0 end,
    'removidas', v_removidas,
    'creditadas_a', (select nome from public.profiles where id = v_creditar),
    'fechamento_id', v_fech,
    'mes', to_char(coalesce((select (g->>'criado_em')::date from jsonb_array_elements(v_grupos) g
                              where g->>'id' = v_grupo::text), v_hoje), 'MM/YYYY'));
end;
$function$;

grant execute on function public.fn_salvar_grupo_analise(uuid, jsonb, uuid, uuid, uuid, uuid, text) to authenticated;
