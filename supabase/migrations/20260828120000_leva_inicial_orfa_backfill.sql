-- A primeira leva de rubricas de um cliente era invisível para a edição.
--
-- Quem confirma um pré-cliente dispara fn_fechamento_ao_confirmar_pre_cliente,
-- que copia `_analise_comercial` do Writer literalmente para o cliente. As
-- rubricas do Writer não têm `id` nem `grupo_id`, e nenhum `grupos[]` é criado.
-- Já fn_salvar_grupo_analise separa as rubricas com
--   (v_rub->>'grupo_id') is not distinct from v_grupo::text
-- e grupo_id nulo nunca é igual a um uuid — então essas rubricas caem sempre no
-- balde "dos outros grupos" e não pertencem a leva nenhuma. Na tela, o seletor
-- de levas lista `grupos[]`: a leva original simplesmente não aparecia, e não
-- havia como corrigi-la. Sete dos nove clientes afetados não tinham grupo algum,
-- então para eles a análise inteira era inalcançável.
--
-- Esta migration adota as órfãs num grupo de verdade. O grupo não inventa
-- contabilidade: ele aponta para o fechamento que JÁ contou essas rubricas, e
-- herda dali a data e o crédito. A identificação desse fechamento não é
-- palpite — fn_salvar_grupo_analise mantém `fechamentos.rubricas` espelhando
-- exatamente as rubricas do grupo, então o fechamento cujo array bate na régua
-- com as órfãs é, por construção, o que as contou.
--
-- Conferido antes de escrever: os 9 clientes afetados casam com exatamente um
-- fechamento cada, todos criados pelo trigger do pré-cliente. Cliente que não
-- casar com exatamente um é PULADO e reportado — melhor ficar como está do que
-- creditar a leva à pessoa errada, que aqui significa mexer em bônus.
--
-- A migration seguinte fecha a origem, para não voltarem a nascer órfãs.

do $$
declare
  r            record;
  v_grupo      uuid;
  v_rubricas   jsonb;
  v_rub        jsonb;
  v_novas      jsonb;
  v_grupos     jsonb;
  v_ajustados  int := 0;
  v_pulados    int := 0;
begin
  for r in
    with orfas as (
      select c.id  as cliente_id,
             c.nome,
             c.analise_comercial as ac,
             (select array_agg(x->>'rubrica' order by x->>'rubrica')
                from jsonb_array_elements(c.analise_comercial->'rubricas') x
               where not (x ? 'grupo_id')) as rubricas_orfas,
             (select nullif(x->>'contrato_id','')
                from jsonb_array_elements(c.analise_comercial->'rubricas') x
               where not (x ? 'grupo_id') limit 1) as contrato_id
        from public.clientes c
       where c.analise_comercial is not null
         and jsonb_typeof(c.analise_comercial->'rubricas') = 'array'
         and exists (select 1
                       from jsonb_array_elements(c.analise_comercial->'rubricas') x
                      where not (x ? 'grupo_id'))
    )
    select o.cliente_id, o.nome, o.ac, o.contrato_id,
           (array_agg(f.id))[1]                         as fechamento_id,
           (array_agg(f.data))[1]                       as data_fechamento,
           (array_agg(f.user_id))[1]                    as creditada_a,
           (array_agg(coalesce(f.created_by, f.user_id)))[1] as criado_por,
           count(*)                                     as casamentos
      from orfas o
      join public.fechamentos f
        on f.cliente_id = o.cliente_id
       and (select array_agg(x order by x) from unnest(f.rubricas) x) = o.rubricas_orfas
     group by o.cliente_id, o.nome, o.ac, o.contrato_id
  loop
    -- só age quando a correspondência é única
    if r.casamentos <> 1 or r.fechamento_id is null then
      v_pulados := v_pulados + 1;
      raise warning 'analise_comercial: % pulado — % fechamento(s) compatíveis, credito indefinido',
        r.nome, r.casamentos;
      continue;
    end if;

    v_grupo := gen_random_uuid();
    v_novas := '[]'::jsonb;

    for v_rub in
      select e.valor from jsonb_array_elements(r.ac->'rubricas') as e(valor)
    loop
      if not (v_rub ? 'grupo_id') then
        -- a rubrica original ganha identidade e passa a pertencer à leva
        v_rub := v_rub
               || jsonb_build_object('grupo_id', to_jsonb(v_grupo::text))
               || case when v_rub ? 'id' then '{}'::jsonb
                       else jsonb_build_object('id', to_jsonb(gen_random_uuid()::text)) end;
      end if;
      v_novas := v_novas || jsonb_build_array(v_rub);
    end loop;

    v_grupos := case when jsonb_typeof(r.ac->'grupos') = 'array'
                     then r.ac->'grupos' else '[]'::jsonb end;

    v_grupos := v_grupos || jsonb_build_array(jsonb_build_object(
      'id',            v_grupo::text,
      'criado_em',     r.data_fechamento::text,
      'criado_por',    to_jsonb(r.criado_por),
      'creditada_a',   to_jsonb(r.creditada_a),
      'contrato_id',   to_jsonb(r.contrato_id),
      'fechamento_id', to_jsonb(r.fechamento_id),
      -- marca de que a leva foi reconstruída, não registrada na hora
      'origem',        'backfill_leva_inicial'
    ));

    update public.clientes
       set analise_comercial = r.ac
             || jsonb_build_object('rubricas', v_novas, 'grupos', v_grupos)
     where id = r.cliente_id;

    v_ajustados := v_ajustados + 1;
  end loop;

  raise notice 'levas iniciais reconstruídas: % · pulados: %', v_ajustados, v_pulados;
end $$;
