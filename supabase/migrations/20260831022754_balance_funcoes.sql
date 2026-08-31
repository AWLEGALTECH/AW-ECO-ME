-- BAIXA DO TRACKER -----------------------------------------------------------
-- O dinheiro do processo entrou. Cria a entrada BRUTA na conta e, se parte for
-- do cliente, o repasse pendente. O item sai do Tracker por consequencia: o
-- Tracker passa a esconder processo que ja tem lancamento origem='tracker'.
-- O indice unico (origem, origem_ref) impede baixar o mesmo processo duas vezes.
create or replace function public.fn_balance_baixar_tracker(
  p_processo_id   uuid,
  p_conta_id      uuid,
  p_valor_bruto   numeric,
  p_valor_cliente numeric default 0,
  p_data          date default current_date,
  p_categoria     text default 'Honorário de êxito',
  p_descricao     text default null,
  p_editor        uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cat    uuid;
  v_lanc   uuid;
  v_rep    uuid;
  v_cli    uuid;
  v_num    text;
  v_nome   text;
begin
  if p_valor_bruto is null or p_valor_bruto <= 0 then
    raise exception 'valor bruto tem que ser maior que zero';
  end if;
  if coalesce(p_valor_cliente,0) < 0 or coalesce(p_valor_cliente,0) > p_valor_bruto then
    raise exception 'a parte do cliente tem que caber dentro do valor bruto';
  end if;

  select p.cliente_id, p.numero_processo, c.nome
    into v_cli, v_num, v_nome
    from public.processos p
    left join public.clientes c on c.id = p.cliente_id
   where p.id = p_processo_id;
  if v_num is null then raise exception 'processo % nao encontrado', p_processo_id; end if;

  select id into v_cat from public.balance_categorias
   where nome = p_categoria and tipo = 'entrada' limit 1;

  insert into public.balance_lancamentos
    (conta_id, categoria_id, tipo, valor, data, status, descricao,
     cliente_id, processo_id, origem, origem_ref, criado_por, pago_em)
  values
    (p_conta_id, v_cat, 'entrada', p_valor_bruto, p_data, 'realizado',
     coalesce(p_descricao, 'Recebimento · ' || coalesce(v_nome, 'processo') || ' · ' || v_num),
     v_cli, p_processo_id, 'tracker', p_processo_id::text, p_editor, now())
  returning id into v_lanc;

  -- a parte do cliente fica na conta ate alguem decidir repassar; nao sai sozinha
  if coalesce(p_valor_cliente,0) > 0 then
    insert into public.balance_repasses
      (lancamento_entrada_id, cliente_id, processo_id, valor_devido)
    values (v_lanc, v_cli, p_processo_id, p_valor_cliente)
    returning id into v_rep;
  end if;

  return jsonb_build_object(
    'lancamento_id', v_lanc,
    'repasse_id', v_rep,
    'valor_escritorio', p_valor_bruto - coalesce(p_valor_cliente,0));
end;
$function$;

-- PAGAR UM REPASSE -----------------------------------------------------------
create or replace function public.fn_balance_pagar_repasse(
  p_repasse_id uuid,
  p_conta_id   uuid,
  p_data       date default current_date,
  p_editor     uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_r    record;
  v_cat  uuid;
  v_saida uuid;
  v_nome text;
begin
  select * into v_r from public.balance_repasses where id = p_repasse_id;
  if v_r.id is null then raise exception 'repasse % nao encontrado', p_repasse_id; end if;
  if v_r.status = 'pago' then raise exception 'este repasse ja foi pago'; end if;

  select nome into v_nome from public.clientes where id = v_r.cliente_id;
  select id into v_cat from public.balance_categorias
   where nome = 'Repasse ao cliente' and tipo = 'saida' limit 1;

  insert into public.balance_lancamentos
    (conta_id, categoria_id, tipo, valor, data, status, descricao,
     cliente_id, processo_id, origem, criado_por, pago_em)
  values
    (p_conta_id, v_cat, 'saida', v_r.valor_devido, p_data, 'realizado',
     'Repasse · ' || coalesce(v_nome, 'cliente'),
     v_r.cliente_id, v_r.processo_id, 'manual', p_editor, now())
  returning id into v_saida;

  update public.balance_repasses
     set status = 'pago', pago_em = p_data, lancamento_saida_id = v_saida, updated_at = now()
   where id = p_repasse_id;

  return jsonb_build_object('lancamento_saida_id', v_saida, 'valor', v_r.valor_devido);
end;
$function$;

-- RECORRENTES ----------------------------------------------------------------
-- Materializa os fixos do mes como PREVISTOS. Idempotente: rodar duas vezes no
-- mesmo mes nao duplica, porque (origem, origem_ref) e unico e o ref carrega o
-- mes. Dia 31 em mes curto cai no ultimo dia do mes.
create or replace function public.fn_balance_materializar_recorrentes(
  p_mes date default date_trunc('month', current_date)::date
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r        record;
  v_venc   date;
  v_ref    text;
  v_criados int := 0;
  v_ultimo int := extract(day from (date_trunc('month', p_mes) + interval '1 month - 1 day'));
begin
  for r in
    select * from public.balance_recorrentes
     where ativo
       and inicio <= (date_trunc('month', p_mes) + interval '1 month - 1 day')::date
       and (fim is null or fim >= date_trunc('month', p_mes)::date)
  loop
    v_venc := (date_trunc('month', p_mes)
               + make_interval(days => least(r.dia_vencimento, v_ultimo) - 1))::date;
    v_ref  := r.id::text || '|' || to_char(p_mes, 'YYYY-MM');

    begin
      insert into public.balance_lancamentos
        (conta_id, categoria_id, tipo, valor, data, status, descricao, origem, origem_ref)
      values
        (r.conta_id, r.categoria_id, r.tipo, r.valor, v_venc, 'previsto', r.descricao,
         'recorrente', v_ref);
      v_criados := v_criados + 1;
    exception when unique_violation then
      -- ja materializado neste mes
      null;
    end;
  end loop;

  return jsonb_build_object('mes', to_char(p_mes,'YYYY-MM'), 'criados', v_criados);
end;
$function$;

-- BONUS DO FECHAMENTO --------------------------------------------------------
-- O calculo do bonus mora na tela de Fechamentos e tem regra propria (meta,
-- multiplicador, especial, excedente). Recalcular aqui seria manter duas contas
-- que podem divergir — entao a tela manda o valor que ela mesma mostra, e aqui
-- so vira saida prevista. Um lancamento por pessoa por mes.
create or replace function public.fn_balance_lancar_bonus(
  p_user_id uuid,
  p_mes     text,
  p_valor   numeric,
  p_conta_id uuid,
  p_editor  uuid default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cat  uuid;
  v_nome text;
  v_lanc uuid;
  v_ref  text := p_user_id::text || '|' || p_mes;
  v_venc date := (to_date(p_mes || '-01', 'YYYY-MM-DD') + interval '1 month + 4 days')::date;
begin
  if coalesce(p_valor,0) <= 0 then raise exception 'bonus tem que ser maior que zero'; end if;
  select nome into v_nome from public.profiles where id = p_user_id;
  select id into v_cat from public.balance_categorias
   where nome = 'Bônus de fechamento' and tipo = 'saida' limit 1;

  insert into public.balance_lancamentos
    (conta_id, categoria_id, tipo, valor, data, status, descricao, origem, origem_ref, criado_por)
  values
    (p_conta_id, v_cat, 'saida', p_valor, v_venc, 'previsto',
     'Bônus ' || p_mes || ' · ' || coalesce(v_nome,'equipe'),
     'fechamento', v_ref, p_editor)
  on conflict (origem, origem_ref) where origem <> 'manual' and origem_ref is not null
  do update set valor = excluded.valor, updated_at = now()
  returning id into v_lanc;

  return jsonb_build_object('lancamento_id', v_lanc);
end;
$function$;

grant execute on function public.fn_balance_baixar_tracker(uuid,uuid,numeric,numeric,date,text,text,uuid) to authenticated;
grant execute on function public.fn_balance_pagar_repasse(uuid,uuid,date,uuid) to authenticated;
grant execute on function public.fn_balance_materializar_recorrentes(date) to authenticated;
grant execute on function public.fn_balance_lancar_bonus(uuid,text,numeric,uuid,uuid) to authenticated;
