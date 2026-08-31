-- A primeira parcela cai no dia dela, não no dia das outras.
--
-- O formulário passou a perguntar quatro coisas: valor, quando cai a PRIMEIRA,
-- em que dia caem as DEMAIS, e quantas são. Só que a materialização usava
-- `dia_vencimento` pra todos os meses, inclusive o primeiro — então uma série
-- que começa dia 20 e depois corre no dia 5 nasceria com a primeira parcela no
-- dia 5, antes da data combinada.
--
-- Agora, no mês em que a série começa, o vencimento é o próprio `inicio`. Nos
-- meses seguintes vale o `dia_vencimento`. É exatamente o que as quatro
-- perguntas prometem na tela.

create or replace function public.fn_balance_materializar_recorrentes(
  p_mes date default date_trunc('month', current_date)::date
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r         record;
  v_venc    date;
  v_ref     text;
  v_comp    text;
  v_ini     date := date_trunc('month', p_mes)::date;
  v_fim     date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_criados int := 0;
  v_ultimo  int := extract(day from v_fim);
begin
  for r in
    select * from public.balance_recorrentes
     where ativo and inicio <= v_fim and (fim is null or fim >= v_ini)
  loop
    if exists (
      select 1 from public.balance_lancamentos
       where recorrente_id = r.id and data between v_ini and v_fim
    ) then
      continue;
    end if;

    -- no mês de estreia manda a data combinada da primeira parcela; nos
    -- demais, o dia que se repete
    if date_trunc('month', r.inicio) = date_trunc('month', p_mes) then
      v_venc := r.inicio;
    else
      v_venc := (v_ini + make_interval(days => least(r.dia_vencimento, v_ultimo) - 1))::date;
    end if;

    v_ref  := r.id::text || '|' || to_char(p_mes, 'YYYY-MM');
    v_comp := case when coalesce(r.competencia_offset, 0) = 0 then null
                   else to_char(v_ini + make_interval(months => r.competencia_offset), 'YYYY-MM')
              end;

    begin
      insert into public.balance_lancamentos
        (conta_id, categoria_id, tipo, valor, data, status, descricao,
         origem, origem_ref, recorrente_id, competencia, cliente_id, observacoes)
      values
        (r.conta_id, r.categoria_id, r.tipo, r.valor, v_venc, 'previsto', r.descricao,
         'recorrente', v_ref, r.id, v_comp, r.cliente_id,
         case when r.estimado then 'Valor estimado — conferir antes de dar baixa.' else null end);
      v_criados := v_criados + 1;
    exception when unique_violation then
      null;
    end;
  end loop;

  return jsonb_build_object('mes', to_char(p_mes,'YYYY-MM'), 'criados', v_criados);
end;
$function$;

grant execute on function public.fn_balance_materializar_recorrentes(date) to authenticated;
