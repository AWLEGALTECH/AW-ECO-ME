-- A BAIXA DO TRACKER numa transação só.
--
-- Dar baixa é duas coisas ao mesmo tempo: o processo muda pro status de pago e
-- o dinheiro entra no Wallet. Se a tela fizesse as duas em chamadas separadas,
-- toda falha no meio deixaria um dos dois lados mentindo — ou um processo
-- marcado como pago sem lançamento nenhum, ou dinheiro no caixa de um processo
-- que o Tracker continua cobrando. As duas passam a acontecer aqui dentro.
--
-- O QUE MUDA EM RELAÇÃO À VERSÃO ANTERIOR:
--
-- 1. Carimba o status. A etapa ATUAL da linha temporal recebe o status de baixa
--    (ALVARÁ PAGO ou ACORDO PAGO) e a ficha acompanha em `fase_processual`.
--    Antes a função só mexia em dinheiro e deixava o status pra tela.
--
-- 2. Deixa de travar o processo em uma baixa só. O `origem_ref` era o id do
--    processo puro, e o índice único então permitia UMA baixa por processo pra
--    sempre — um segundo alvará no mesmo processo seria recusado em silêncio.
--    Agora o ref carrega a data, então baixas em dias diferentes convivem e um
--    clique duplo no mesmo dia continua sendo barrado, que é o acidente real.
--
-- 3. A categoria vem da via. Alvará entra como "Alvará recebido", acordo como
--    "Acordo recebido" — sem isso as duas caíam no mesmo balde e o Wallet não
--    sabia dizer quanto veio de cada caminho.
--
-- A PARTE DO CLIENTE CONTINUA VINDO PREENCHIDA À MÃO. O percentual do contrato
-- não está registrado em lugar nenhum, e agosto teve contrato de 30%, de 40% e
-- de 50% — supor meio a meio erraria um em cada três. Ela vira repasse
-- pendente, que é o que responde "quanto desse saldo não é meu".

-- a assinatura mudou (p_categoria virou p_via), então a antiga sai de cena antes
drop function if exists public.fn_balance_baixar_tracker(uuid,uuid,numeric,numeric,date,text,text,uuid);

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

  select p.cliente_id, p.numero_processo, c.nome, coalesce(p.linha_temporal, '[]'::jsonb)
    into v_cli, v_num, v_nome, v_lt
    from public.processos p
    left join public.clientes c on c.id = p.cliente_id
   where p.id = p_processo_id
   for update;
  if v_num is null then raise exception 'processo % nao encontrado', p_processo_id; end if;

  select id into v_cat from public.balance_categorias
   where nome = v_cat_nome and tipo = 'entrada' limit 1;

  -- ── o dinheiro ──
  insert into public.balance_lancamentos
    (conta_id, categoria_id, tipo, valor, data, status, descricao,
     cliente_id, processo_id, origem, origem_ref, criado_por, pago_em)
  values
    (p_conta_id, v_cat, 'entrada', p_valor_bruto, p_data, 'realizado',
     coalesce(p_descricao,
       (case when p_via = 'acordo' then 'Acordo · ' else 'Alvará · ' end)
       || coalesce(v_nome, 'processo') || ' · ' || v_num),
     v_cli, p_processo_id, 'tracker',
     -- a data no ref: baixas em dias diferentes convivem, clique duplo no
     -- mesmo dia é barrado pelo índice único
     p_processo_id::text || '|' || to_char(p_data, 'YYYY-MM-DD'),
     p_editor, now())
  returning id into v_lanc;

  -- a parte do cliente fica na conta até alguém decidir repassar
  if coalesce(p_valor_cliente,0) > 0 then
    insert into public.balance_repasses
      (lancamento_entrada_id, cliente_id, processo_id, valor_devido)
    values (v_lanc, v_cli, p_processo_id, p_valor_cliente)
    returning id into v_rep;
  end if;

  -- ── o status ──
  -- Carimba a etapa ATUAL. Sem etapa atual (linha vazia ou toda concluída) só
  -- a ficha muda: inventar uma etapa aqui bagunçaria a história do processo.
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
