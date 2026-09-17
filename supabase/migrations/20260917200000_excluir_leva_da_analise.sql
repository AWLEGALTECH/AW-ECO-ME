-- APAGAR UMA LEVA INTEIRA DA ANÁLISE COMERCIAL.
--
-- Até aqui dava para tirar rubrica por rubrica de dentro de uma leva, mas não
-- dava para dizer "esta análise não presta, some com ela". E análise repetida
-- acontece: o mesmo cliente é analisado de novo, com o extrato melhor lido ou
-- com o vocabulário certo, e a leva nova SOMA com a velha em vez de
-- substituí-la. Ninguém escolheu isso, é só o que acontece quando não há
-- botão para desfazer.
--
-- O JEFFERSON WOLLACE mostra o tamanho do problema: três levas do MESMO
-- contrato contra o MESMO banco, 24 ações no total, sendo que a lista real tem
-- nove. As mesmas cobranças apareciam três vezes, com três grafias
-- ("Saque em terminal", "Saque Terminal"), e cada passagem foi paga no
-- fechamento: R$ 120 por uma análise de R$ 45.
--
-- ── a leva sem registro ────────────────────────────────────────────────────
-- `p_grupo_id` nulo apaga as rubricas ÓRFÃS, as que não pertencem a leva
-- nenhuma. Elas existem porque a confirmação do pré-cliente copiava a análise
-- do Writer literalmente, sem `grupos[]`. A migration de 28/08 adotou as que
-- existiam na época, mas a origem continuou produzindo (o Jefferson é de
-- 14/09), e essas rubricas são invisíveis para o editor: não estão em nenhuma
-- leva, então nenhuma tela as alcança. São exatamente as que mais precisam
-- sair, porque são as mais velhas.
--
-- ── o fechamento ───────────────────────────────────────────────────────────
-- Apagar ações sem mexer no fechamento deixaria a aba de fechamentos cobrando
-- por trabalho que não está mais na ficha. Então:
--   • sobrou alguma leva apontando para aquele fechamento  -> recalcula
--   • não sobrou nenhuma                                   -> apaga o fechamento
-- Fechamento com zero ação não paga nada e não explica nada; só assombra a
-- lista. O rastro fica em `analise_comercial_eventos`, que guarda cada rubrica
-- removida, por quem e quando.

create or replace function public.fn_excluir_leva_analise(
  p_cliente_id uuid,
  p_grupo_id   uuid default null,   -- null = a leva órfã, sem registro em grupos[]
  p_editor     uuid default null,
  p_motivo     text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ac        jsonb;
  v_cli_nome  text;
  v_grupos    jsonb;
  v_da_leva   jsonb := '[]'::jsonb;
  v_outras    jsonb := '[]'::jsonb;
  v_novos     jsonb := '[]'::jsonb;
  v_rub       jsonb;
  v_fech      uuid;
  v_orfa      boolean := p_grupo_id is null;
  v_nomes     text[];
  v_candidatos int;
  v_sobraram  int;
  v_destino   text;
  v_acoes     int := null;
begin
  select nome, coalesce(analise_comercial, '{}'::jsonb) into v_cli_nome, v_ac
    from public.clientes where id = p_cliente_id;
  if v_cli_nome is null then raise exception 'cliente % nao encontrado', p_cliente_id; end if;

  v_grupos := case when jsonb_typeof(v_ac->'grupos') = 'array' then v_ac->'grupos' else '[]'::jsonb end;

  -- separa o que é da leva do que fica
  for v_rub in select e.valor from jsonb_array_elements(
      case when jsonb_typeof(v_ac->'rubricas') = 'array' then v_ac->'rubricas' else '[]'::jsonb end) as e(valor)
  loop
    if (v_orfa and coalesce(v_rub->>'grupo_id', '') = '')
       or (not v_orfa and v_rub->>'grupo_id' = p_grupo_id::text) then
      v_da_leva := v_da_leva || jsonb_build_array(v_rub);
    else
      v_outras := v_outras || jsonb_build_array(v_rub);
    end if;
  end loop;

  if jsonb_array_length(v_da_leva) = 0 then
    raise exception 'leva % nao tem rubrica nenhuma em %',
      coalesce(p_grupo_id::text, '(sem registro)'), v_cli_nome;
  end if;

  select array_agg(e.valor->>'rubrica') into v_nomes from jsonb_array_elements(v_da_leva) as e(valor);

  -- ── de qual fechamento essa leva saiu ────────────────────────────────────
  if not v_orfa then
    select (g->>'fechamento_id')::uuid into v_fech
      from jsonb_array_elements(v_grupos) g where g->>'id' = p_grupo_id::text;
  else
    -- A órfã não aponta para lugar nenhum, então o vínculo é deduzido do mesmo
    -- jeito que o backfill de 28/08 deduziu: `fechamentos.rubricas` espelha
    -- exatamente a leva que o gerou, e um fechamento sem leva apontando para
    -- ele é, por construção, o da análise que veio do kit. Só age quando a
    -- correspondência é ÚNICA: creditar (ou descreditar) a pessoa errada é
    -- mexer em bônus de gente de verdade.
    select count(*), (array_agg(f.id))[1] into v_candidatos, v_fech
      from public.fechamentos f
     where f.cliente_id = p_cliente_id
       and (select array_agg(x order by x) from unnest(f.rubricas) x)
           = (select array_agg(y order by y) from unnest(v_nomes) y)
       and not exists (select 1 from jsonb_array_elements(v_grupos) g
                        where (g->>'fechamento_id') = f.id::text);
    if v_candidatos <> 1 then v_fech := null; end if;
  end if;

  -- ── histórico, antes de sumir com elas ───────────────────────────────────
  for v_rub in select e.valor from jsonb_array_elements(v_da_leva) as e(valor)
  loop
    insert into public.analise_comercial_eventos
      (cliente_id, contrato_id, rubrica, requerido, acao, por, motivo, fechamento_id)
    values (p_cliente_id, nullif(v_rub->>'contrato_id','')::uuid, v_rub->>'rubrica',
            nullif(v_rub->>'requerido',''), 'removida', p_editor,
            coalesce(nullif(btrim(coalesce(p_motivo,'')), ''), 'leva apagada'), v_fech);
  end loop;

  -- ── a leva sai da ficha ──────────────────────────────────────────────────
  if v_orfa then
    v_novos := v_grupos;
  else
    select coalesce(jsonb_agg(g.valor order by g.pos), '[]'::jsonb) into v_novos
      from jsonb_array_elements(v_grupos) with ordinality as g(valor, pos)
     where g.valor->>'id' <> p_grupo_id::text;
  end if;

  update public.clientes
     set analise_comercial = v_ac || jsonb_build_object('rubricas', v_outras, 'grupos', v_novos)
   where id = p_cliente_id;

  -- ── e o fechamento acompanha ─────────────────────────────────────────────
  if v_fech is null then
    v_destino := 'nao_identificado';
  else
    select count(*) into v_sobraram
      from jsonb_array_elements(v_novos) g where g->>'fechamento_id' = v_fech::text;
    if v_sobraram = 0 then
      delete from public.fechamentos where id = v_fech;
      v_destino := 'apagado';
      v_acoes := 0;
    else
      v_acoes := public.fn_recalcular_fechamento(v_fech);
      v_destino := 'recalculado';
    end if;
  end if;

  return jsonb_build_object(
    'cliente',        v_cli_nome,
    'leva',           coalesce(p_grupo_id::text, 'sem registro'),
    'removidas',      jsonb_array_length(v_da_leva),
    'rubricas',       to_jsonb(v_nomes),
    'restantes',      jsonb_array_length(v_outras),
    'fechamento_id',  v_fech,
    'fechamento',     v_destino,
    'acoes_no_fechamento', v_acoes);
end;
$function$;

comment on function public.fn_excluir_leva_analise(uuid, uuid, uuid, text) is
  'Apaga uma leva inteira da analise comercial do cliente (p_grupo_id nulo = as rubricas orfas, sem leva). Registra cada rubrica em analise_comercial_eventos e recalcula, ou apaga, o fechamento que a leva alimentava.';

grant execute on function public.fn_excluir_leva_analise(uuid, uuid, uuid, text) to authenticated;
