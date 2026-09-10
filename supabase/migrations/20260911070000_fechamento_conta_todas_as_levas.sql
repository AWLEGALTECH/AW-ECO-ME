-- O FECHAMENTO SÓ CONTAVA A ÚLTIMA LEVA, E APAGAVA AS ANTERIORES.
--
-- O JOSÉ ALMYR tem 19 ações ajuizáveis em três levas (13, 6 e 2). O fechamento
-- dele contava DUAS. As outras dezessete não estavam erradas nem bloqueadas:
-- foram apagadas quando a leva seguinte foi salva.
--
-- ── a linha ────────────────────────────────────────────────────────────────
--
--     update public.fechamentos
--        set rubricas = (select array_agg(...) from jsonb_array_elements(v_saida) ...)
--      where id = v_fech;
--
-- `v_saida` é a lista DESTA leva. O `set` não acrescenta, SUBSTITUI. E o mesmo
-- fechamento é reusado de propósito quando cliente, pessoa creditada e mês são
-- os mesmos:
--
--     select id into v_fech from public.fechamentos
--      where cliente_id = p_cliente_id and pre_cliente_id is null
--        and user_id is not distinct from v_creditar
--        and date_trunc('month', data) = date_trunc('month', v_hoje)
--
-- Então três levas do mesmo cliente, no mesmo mês, para a mesma pessoa caem no
-- mesmo fechamento, e cada uma apaga a anterior. Ninguém vê: não dá erro, o
-- número só fica menor.
--
-- ── o estrago ──────────────────────────────────────────────────────────────
-- Três clientes, 24 ações fora da conta:
--     JOSÉ ALMYR ARAÚJO LOPES      3 levas    19 devidas    2 contadas
--     LUIZ OTÁVIO G. F. DE BELEM   1 leva      6 devidas    0 contadas
--     DIEGO DA GAMA ISMAEL         2 levas     5 devidas    4 contadas
--
-- ── a correção ─────────────────────────────────────────────────────────────
-- O fechamento passa a espelhar TODAS as levas que apontam para ele, e não a
-- que está sendo salva. Vira uma função só, que a carga também usa: duas contas
-- do mesmo número em lugares diferentes divergem no primeiro ajuste.

create or replace function public.fn_recalcular_fechamento(p_fech uuid)
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_rubs   text[];
  v_grupos int;
begin
  if p_fech is null then return -1; end if;

  -- FECHAMENTO SEM LEVA NENHUMA NÃO SE MEXE. O que nasce da confirmação do
  -- pré-cliente tem as rubricas do kit e nenhum grupo apontando para ele;
  -- recalcular pelas levas zeraria a lista dele.
  select count(*) into v_grupos
    from public.fechamentos f
    join public.clientes c on c.id = f.cliente_id,
         jsonb_array_elements(coalesce(c.analise_comercial->'grupos', '[]'::jsonb)) g
   where f.id = p_fech and (g->>'fechamento_id')::uuid = p_fech;
  if v_grupos = 0 then return -1; end if;

  select coalesce(array_agg(r->>'rubrica'), array[]::text[]) into v_rubs
    from public.fechamentos f
    join public.clientes c on c.id = f.cliente_id,
         jsonb_array_elements(coalesce(c.analise_comercial->'grupos', '[]'::jsonb)) g,
         jsonb_array_elements(coalesce(c.analise_comercial->'rubricas', '[]'::jsonb)) r
   where f.id = p_fech
     and (g->>'fechamento_id')::uuid = p_fech
     and r->>'grupo_id' = g->>'id'
     and coalesce((r->>'bloqueada')::boolean, false) = false
     and coalesce(btrim(r->>'rubrica'), '') <> '';

  update public.fechamentos set rubricas = v_rubs where id = p_fech;
  return coalesce(array_length(v_rubs, 1), 0);
end $function$;

comment on function public.fn_recalcular_fechamento(uuid) is
  'Refaz fechamentos.rubricas a partir de TODAS as levas que apontam para ele. Devolve -1 quando o fechamento nao tem leva (o que veio do pre-cliente).';

-- ── a função de salvar passa a usar a mesma conta ───────────────────────────
create or replace function public.fn_salvar_grupo_analise(
  p_cliente_id uuid,
  p_rubricas jsonb,
  p_grupo_id uuid default null,
  p_editor uuid default null,
  p_creditar_a uuid default null,
  p_contrato_id uuid default null,
  p_motivo_remocao text default null,
  p_analise_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ac         jsonb;
  v_grupos     jsonb;
  v_novos_grupos jsonb;
  v_outras     jsonb := '[]'::jsonb;
  v_antigas    jsonb := '[]'::jsonb;
  v_saida      jsonb := '[]'::jsonb;
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
      'contrato_id', to_jsonb(p_contrato_id), 'fechamento_id', to_jsonb(v_fech),
      'analise_id', to_jsonb(p_analise_id)));
  else
    select (g->>'fechamento_id')::uuid, (g->>'creditada_a')::uuid into v_fech, v_creditar
      from jsonb_array_elements(v_grupos) g where g->>'id' = v_grupo::text;
    if p_analise_id is not null then
      select coalesce(jsonb_agg(
               case when g.valor->>'id' = v_grupo::text
                    then g.valor || jsonb_build_object('analise_id', to_jsonb(p_analise_id))
                    else g.valor end
               order by g.pos), '[]'::jsonb)
        into v_novos_grupos
        from jsonb_array_elements(v_grupos) with ordinality as g(valor, pos);
      v_grupos := v_novos_grupos;
    end if;
  end if;

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

  -- DEPOIS de gravar o cliente, e olhando TODAS as levas do fechamento.
  -- Antes era aqui em cima e só com esta leva, e era isso que apagava as
  -- outras duas do José Almyr toda vez que alguém salvava a terceira.
  perform public.fn_recalcular_fechamento(v_fech);

  if p_analise_id is not null then
    update public.analises_comerciais
       set cliente_id = p_cliente_id, updated_at = now()
     where id = p_analise_id and cliente_id is null;
  end if;

  return jsonb_build_object(
    'grupo_id', v_grupo, 'novo', v_novo,
    'novas', case when v_novo then jsonb_array_length(v_saida) else 0 end,
    'removidas', v_removidas,
    'creditadas_a', (select nome from public.profiles where id = v_creditar),
    'fechamento_id', v_fech,
    'analise_id', p_analise_id,
    'mes', to_char(coalesce((select (g->>'criado_em')::date from jsonb_array_elements(v_grupos) g
                              where g->>'id' = v_grupo::text), v_hoje), 'MM/YYYY'));
end;
$function$;

-- ── a carga: refaz o que já estava errado ──────────────────────────────────
-- Só os fechamentos que TÊM leva. Os que vieram da confirmação do pré-cliente
-- ficam intocados, e é por isso que a função devolve -1 neles.
do $$
declare r record; n int;
begin
  for r in
    select distinct f.id
      from public.fechamentos f
      join public.clientes c on c.id = f.cliente_id,
           jsonb_array_elements(coalesce(c.analise_comercial->'grupos', '[]'::jsonb)) g
     where (g->>'fechamento_id')::uuid = f.id
  loop
    n := public.fn_recalcular_fechamento(r.id);
  end loop;
end $$;
