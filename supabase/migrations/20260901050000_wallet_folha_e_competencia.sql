-- FOLHA DA ESTAGIÁRIA E O MÊS DE COMPETÊNCIA.
--
-- O escritório enxugou os fixos pra três — aluguel e os dois pró-labores — e
-- pediu a folha da estagiária: bolsa de R$ 700,00 e comissão de cerca de
-- R$ 600,00.
--
-- E levantou o problema certo: a bolsa de agosto, paga em 01/09, cai como
-- despesa de setembro no regime de caixa, apesar de ser custo de agosto. Isso
-- não é detalhe — é o que faz o custo de um mês nunca fechar com o resultado
-- daquele mês.
--
-- MUDAR O DIA RESOLVE METADE. A bolsa dá pra pagar no último dia do mês
-- trabalhado, e aí caixa e competência coincidem. A comissão NÃO: ela depende
-- do fechamento do mês, que só existe depois que o mês acabou. Nenhuma escolha
-- de data conserta isso.
--
-- A OUTRA METADE É ETIQUETAR. Entra `competencia` no lançamento: a que mês
-- aquele dinheiro se refere, independente do dia em que saiu. Com ela, uma
-- comissão paga em 15/09 continua dizendo "competência 08/2026", e a pergunta
-- "quanto custou agosto" passa a ter resposta permanente, sem depender de
-- ninguém lembrar.
--
-- O lançamento continua nascendo pelo CAIXA — o Wallet não vira contabilidade
-- por competência. A competência é uma etiqueta em cima do fato, não um
-- segundo regime concorrendo com o primeiro.

-- ── a etiqueta de competência ───────────────────────────────────────────────
alter table public.balance_lancamentos
  add column if not exists competencia text;

comment on column public.balance_lancamentos.competencia is
  'A que mês (YYYY-MM) este dinheiro se refere, quando não for o mês em que ele andou. Nulo = mesmo mês da data. Serve pra comissão paga no mês seguinte continuar contando como custo do mês trabalhado.';

alter table public.balance_recorrentes
  add column if not exists competencia_offset integer not null default 0;

comment on column public.balance_recorrentes.competencia_offset is
  'Quantos meses atrás está a competência em relação ao pagamento. 0 = paga no próprio mês (aluguel, bolsa no último dia). -1 = paga no mês seguinte ao que se refere (comissão).';

-- ── a categoria da comissão ─────────────────────────────────────────────────
-- Não reaproveita "Bônus de fechamento": aquela é `fixa` e a automação do
-- fechamento escreve nela por nome. Misturar as duas faria o bônus dos sócios
-- e a comissão da estagiária caírem no mesmo balde.
insert into public.balance_categorias (nome, tipo, grupo, fixa, ordem, icone, judicial) values
  ('Comissão', 'saida', 'Pessoal', false, 35, 'HandCoins', false)
on conflict (nome, tipo) do nothing;

-- ── a lista de fixos que o escritório quer ──────────────────────────────────
delete from public.balance_recorrentes
 where descricao in ('Estrutura digital', 'Supermercado e copa');

update public.balance_recorrentes set competencia_offset = 0;

insert into public.balance_recorrentes
  (descricao, conta_id, categoria_id, tipo, valor, dia_vencimento, inicio, ativo, competencia_offset)
select v.descricao,
       (select id from public.balance_contas where banco = 'caixa' limit 1),
       (select id from public.balance_categorias where nome = v.categoria and tipo = 'saida' limit 1),
       'saida', v.valor, v.dia, date '2026-09-01', true, v.offset
  from (values
    -- último dia do mês trabalhado: aí a bolsa de agosto é custo de agosto,
    -- sem etiqueta nenhuma precisar salvar a conta
    ('Bolsa da estagiária',    700.00, 31, 'Salário',  0),
    -- só dá pra saber quanto é depois que o mês fechou; então paga no seguinte
    -- e carrega a competência do mês trabalhado
    ('Comissão da estagiária', 600.00, 15, 'Comissão', -1)
  ) as v(descricao, valor, dia, categoria, "offset")
 where not exists (
   select 1 from public.balance_recorrentes r where r.descricao = v.descricao
 );

-- ── a materialização passa a carimbar a competência ─────────────────────────
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
  v_criados int := 0;
  v_ultimo  int := extract(day from (date_trunc('month', p_mes) + interval '1 month - 1 day'));
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
    -- a competência anda pra trás conforme o fixo declarou; offset 0 deixa a
    -- etiqueta nula, que é o mesmo que dizer "é do próprio mês"
    v_comp := case when coalesce(r.competencia_offset, 0) = 0 then null
                   else to_char(date_trunc('month', p_mes)
                                + make_interval(months => r.competencia_offset), 'YYYY-MM')
              end;

    begin
      insert into public.balance_lancamentos
        (conta_id, categoria_id, tipo, valor, data, status, descricao, origem, origem_ref,
         competencia)
      values
        (r.conta_id, r.categoria_id, r.tipo, r.valor, v_venc, 'previsto', r.descricao,
         'recorrente', v_ref, v_comp);
      v_criados := v_criados + 1;
    exception when unique_violation then
      null;
    end;
  end loop;

  return jsonb_build_object('mes', to_char(p_mes,'YYYY-MM'), 'criados', v_criados);
end;
$function$;

grant execute on function public.fn_balance_materializar_recorrentes(date) to authenticated;
