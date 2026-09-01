-- Agosto não fechou, e o fuso do servidor achava que sim.
--
-- O escritório é de Manaus, UTC-4. Quando o servidor marca 01/09 00:14 UTC, em
-- Manaus ainda são 20:14 de 31/08 — agosto tem mais quatro horas de vida. Foi
-- por isso que a parcela das cadeiras nasceu em setembro: eu datei pelo relógio
-- do servidor, não pelo do escritório.
--
-- 1. A PARCELA DAS CADEIRAS VOLTA PRA AGOSTO. Ela não só pertence a agosto como
--    já foi paga lá: os R$ 195,03 que saíram em 28/08 dentro do pix do Dr.
--    Diego. Então além de mudar o início, o pagamento que já existe é ligado à
--    série — a primeira parcela deixa de estar "em aberto" e passa a constar
--    como paga, que é a verdade.
--
-- 2. A MENSALIDADE DO MARCOS TAMBÉM. O chamado diz "MARCOS - DIA 15 - R$500", e
--    a planilha registra "Cliente Marcos, R$ 500,00" em 15/08. Valor e dia
--    batem, então é a mensalidade de agosto dele: volta pra agosto e o
--    lançamento é ligado.
--
-- 3. FAUSTO, MÁRCIA E KELVIN FICAM EM SETEMBRO. Não há em agosto nenhum
--    recebimento que case com eles — o único candidato seria os R$ 400,00 do
--    "Cliente Kelvin" de 15/08, mas o chamado dele diz dia 30 e R$ 600,00, e
--    nem o valor nem o dia batem. Puxar os três pra agosto criaria três meses
--    "em aberto" afirmando que esses clientes devem — e eu não tenho como saber
--    se devem ou se pagaram por fora.
--
-- 4. O PADRÃO DA MATERIALIZAÇÃO PASSA A SER O MÊS DE MANAUS. Rodar a geração
--    sem dizer o mês, na virada, geraria o mês seguinte por causa do fuso do
--    servidor. A tela sempre manda o mês, então isso nunca apareceu — mas é o
--    tipo de armadilha que só dispara no pior dia, que é o dia do fechamento.

-- ── 1. cadeiras ──
update public.balance_recorrentes
   set inicio = date '2026-08-28',
       dia_vencimento = 28,
       observacoes = 'Primeira parcela paga em 28/08, dentro do pix do Dr. Diego. Quantas faltam ainda não está registrado — preencher o nº de parcelas quando souberem.',
       updated_at = now()
 where descricao = 'Parcela das cadeiras';

update public.balance_lancamentos l
   set recorrente_id = r.id, updated_at = now()
  from public.balance_recorrentes r
 where r.descricao = 'Parcela das cadeiras'
   and l.origem_ref = 'extrato-2026-08|36b';

-- ── 2. mensalidade do Marcos ──
update public.balance_recorrentes
   set inicio = date '2026-08-15',
       observacoes = 'Do chamado de 28/08. A mensalidade de agosto é o "Cliente Marcos" de 15/08 — valor e dia batem. Três Marcos na base: confirmar qual antes de amarrar ao cliente.',
       updated_at = now()
 where descricao = 'Mensalidade · Marcos';

update public.balance_lancamentos l
   set recorrente_id = r.id, updated_at = now()
  from public.balance_recorrentes r
 where r.descricao = 'Mensalidade · Marcos'
   and l.origem_ref = 'planilha-2026-08|01';

-- ── 3. o Kelvin de agosto não é a mensalidade dele ──
update public.balance_lancamentos
   set observacoes = 'CONFERIR: o chamado diz que a mensalidade do Kelvin é de R$ 600,00 no dia 30. Este é de R$ 400,00 em 15/08 — não bate, então não foi ligado à mensalidade.',
       updated_at = now()
 where origem_ref = 'planilha-2026-08|02';

-- ── 4. o mês padrão passa a ser o de Manaus ──
create or replace function public.fn_balance_materializar_recorrentes(
  p_mes date default date_trunc('month', timezone('America/Manaus', now()))::date
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
