-- A baixa nunca funcionou: FOR UPDATE com LEFT JOIN é recusado pelo Postgres.
--
-- O erro que aparecia na tela:
--
--     FOR UPDATE cannot be applied to the nullable side of an outer join
--
-- A função travava a linha do processo com
--
--     from processos p left join clientes c on c.id = p.cliente_id
--      where p.id = ... for update
--
-- e o Postgres recusa: `clientes` está no lado que pode vir nulo do LEFT JOIN,
-- e não há linha pra travar quando ele vem nulo. Um `FOR UPDATE` sem dizer o
-- que travar tenta travar as duas tabelas.
--
-- A correção é dizer QUAL: `for update of p`. Trava só o processo, que é o que
-- precisa mesmo — o nome do cliente é leitura, ninguém disputa.
--
-- POR QUE ISSO PASSOU. Eu escrevi a função, apliquei a migration com sucesso e
-- dei por testada. Só que aplicar uma função só compila o corpo; o erro só
-- aparece quando ela RODA. Nenhum dos meus testes chamava a RPC de verdade —
-- eles cobriam a decisão de quando perguntar, em TypeScript, e não a transação
-- que faz o trabalho. A feature foi ao ar quebrada e ficou assim até alguém
-- tentar usar.

create or replace function public.fn_balance_baixar_tracker(
  p_processo_id   uuid,
  p_conta_id      uuid,
  p_valor_bruto   numeric,
  p_valor_cliente numeric default 0,
  p_data          date default current_date,
  p_via           text default 'alvara',
  p_descricao     text default null,
  p_editor        uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status   text;
  v_cat_nome text;
  v_cat      uuid;
  v_lanc     uuid;
  v_rep      uuid;
  v_cli      uuid;
  v_num      text;
  v_nome     text;
  v_lt       jsonb;
  v_nova     jsonb;
  v_achou    boolean := false;
begin
  if p_valor_bruto is null or p_valor_bruto <= 0 then
    raise exception 'valor recebido tem que ser maior que zero';
  end if;
  if coalesce(p_valor_cliente,0) < 0 or coalesce(p_valor_cliente,0) > p_valor_bruto then
    raise exception 'a parte do cliente tem que caber dentro do valor recebido';
  end if;
  if p_via not in ('alvara','acordo') then
    raise exception 'via da baixa tem que ser alvara ou acordo, veio %', p_via;
  end if;

  v_status   := case when p_via = 'acordo' then 'ACORDO PAGO' else 'ALVARÁ PAGO' end;
  v_cat_nome := case when p_via = 'acordo' then 'Acordo recebido' else 'Alvará recebido' end;

  -- Trava só o processo. Duas consultas em vez de um join com FOR UPDATE: o
  -- nome do cliente é leitura e não precisa de trava nenhuma.
  select p.cliente_id, p.numero_processo, coalesce(p.linha_temporal, '[]'::jsonb)
    into v_cli, v_num, v_lt
    from public.processos p
   where p.id = p_processo_id
   for update;
  if v_num is null then raise exception 'processo % nao encontrado', p_processo_id; end if;

  select c.nome into v_nome from public.clientes c where c.id = v_cli;

  select id into v_cat from public.balance_categorias
   where nome = v_cat_nome and tipo = 'entrada' limit 1;

  insert into public.balance_lancamentos
    (conta_id, categoria_id, tipo, valor, data, status, descricao,
     cliente_id, processo_id, origem, origem_ref, criado_por, pago_em)
  values
    (p_conta_id, v_cat, 'entrada', p_valor_bruto, p_data, 'realizado',
     coalesce(p_descricao,
       (case when p_via = 'acordo' then 'Acordo · ' else 'Alvará · ' end)
       || coalesce(v_nome, 'processo') || ' · ' || v_num),
     v_cli, p_processo_id, 'tracker',
     p_processo_id::text || '|' || to_char(p_data, 'YYYY-MM-DD'),
     p_editor, now())
  returning id into v_lanc;

  if coalesce(p_valor_cliente,0) > 0 then
    insert into public.balance_repasses
      (lancamento_entrada_id, cliente_id, processo_id, valor_devido)
    values (v_lanc, v_cli, p_processo_id, p_valor_cliente)
    returning id into v_rep;
  end if;

  select exists (
    select 1 from jsonb_array_elements(v_lt) e where e->>'status' = 'atual'
  ) into v_achou;

  if v_achou then
    select jsonb_agg(
             case when e->>'status' = 'atual'
                  then e || jsonb_build_object('statusProcessual', v_status)
                  else e end
             order by ord)
      into v_nova
      from jsonb_array_elements(v_lt) with ordinality as t(e, ord);
  end if;

  update public.processos
     set linha_temporal  = case when v_achou then coalesce(v_nova, v_lt) else linha_temporal end,
         fase_processual = v_status,
         updated_at      = now()
   where id = p_processo_id;

  return jsonb_build_object(
    'lancamento_id',    v_lanc,
    'repasse_id',       v_rep,
    'status',           v_status,
    'etapa_carimbada',  v_achou,
    'valor_escritorio', p_valor_bruto - coalesce(p_valor_cliente,0));
end;
$function$;

grant execute on function public.fn_balance_baixar_tracker(uuid,uuid,numeric,numeric,date,text,text,uuid) to authenticated;
