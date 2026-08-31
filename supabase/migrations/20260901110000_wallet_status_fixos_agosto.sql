-- STATUS DOS FIXOS DE AGOSTO, sem duplicar o que já está lançado.
--
-- O escritório informou: em agosto o aluguel e o pró-labore do Dr. Diego estão
-- pagos; o pró-labore do Dr. Matheus, as comissões e a folha, não. E que o
-- "Retirada Matheus" de R$ 1.500,00 lançado em 01/08 é pró-labore de JULHO,
-- pago no primeiro dia de agosto.
--
-- O PROBLEMA DE LIGAR ISSO. Agosto já tem o aluguel e a retirada do Diego
-- lançados — vieram da planilha e do extrato. Gerar os fixos de agosto lançaria
-- os dois de novo e quebraria os R$ 22.180,76. Então em vez de gerar, esta
-- migration LIGA o lançamento que já existe ao custo fixo que ele cumpre.
--
-- Pra isso entra `recorrente_id` no lançamento. Até aqui a amarração era só
-- pelo `origem_ref` que a materialização escreve, o que só funciona pra
-- lançamento que ela mesma criou — dinheiro que saiu por fora nunca conseguia
-- dar baixa num fixo. Com a coluna, qualquer lançamento pode cumprir um fixo,
-- tenha ele nascido da automação, do extrato ou da mão.
--
-- E a materialização passa a checar por essa coluna antes de criar: se o mês já
-- tem lançamento daquele fixo, ela pula. É o que impede o "Gerar agosto" de
-- duplicar o aluguel depois desta migration.
--
-- Os três em aberto entram como `previsto`, então NÃO mexem no saldo: o
-- realizado de agosto continua fechando em R$ 22.180,76 contra a planilha.

-- ── a coluna que liga lançamento a custo fixo ───────────────────────────────
alter table public.balance_lancamentos
  add column if not exists recorrente_id uuid
    references public.balance_recorrentes(id) on delete set null;

comment on column public.balance_lancamentos.recorrente_id is
  'O custo fixo que este lançamento cumpre. Independe de quem criou o lançamento: serve pra dinheiro que saiu por fora dar baixa num fixo do mês.';

create index if not exists balance_lanc_recorrente_idx
  on public.balance_lancamentos (recorrente_id, data);

-- ── os fixos passam a valer desde agosto ────────────────────────────────────
update public.balance_recorrentes set inicio = date '2026-08-01', updated_at = now();

-- ── o que já está pago: liga, não cria ──────────────────────────────────────
update public.balance_lancamentos l
   set recorrente_id = r.id, updated_at = now()
  from public.balance_recorrentes r
 where r.descricao = 'Aluguel de sala comercial'
   and l.origem_ref = 'planilha-2026-08|04';

update public.balance_lancamentos l
   set recorrente_id = r.id, updated_at = now()
  from public.balance_recorrentes r
 where r.descricao = 'Pró-labore Dr. Diego'
   and l.origem_ref = 'extrato-2026-08|36';

-- ── a retirada de 01/08 é pró-labore de julho ───────────────────────────────
-- Encaixa no padrão que o escritório acabou de definir: pago no começo do mês,
-- referente ao anterior. Sem essa etiqueta, julho fica sem custo de sócio e
-- agosto fica com dois.
update public.balance_lancamentos
   set competencia = '2026-07',
       observacoes = 'Pró-labore de julho, pago em 01/08. Confirmado pelo escritório.',
       updated_at  = now()
 where origem_ref = 'planilha-2026-08|03';

-- ── os três em aberto ───────────────────────────────────────────────────────
insert into public.balance_lancamentos
  (conta_id, categoria_id, tipo, valor, data, status, descricao, observacoes,
   origem, origem_ref, recorrente_id, competencia)
select r.conta_id, r.categoria_id, r.tipo, r.valor,
       -- dia do fixo, encolhido pro último dia quando o mês não tem
       (date '2026-08-01'
        + make_interval(days => least(r.dia_vencimento, 31) - 1))::date,
       'previsto', r.descricao,
       'Em aberto em agosto, informado pelo escritório.',
       'recorrente', r.id::text || '|2026-08', r.id,
       case when r.competencia_offset = 0 then null else '2026-07' end
  from public.balance_recorrentes r
 where r.descricao in ('Pró-labore Dr. Matheus', 'Comissões', 'Folha de pagamento')
   and not exists (
     select 1 from public.balance_lancamentos x
      where x.recorrente_id = r.id and x.data between date '2026-08-01' and date '2026-08-31'
   );

-- ── a materialização respeita o que já existe ───────────────────────────────
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
    -- Se o mês JÁ tem lançamento deste fixo, não cria outro. Vale tanto pro que
    -- a automação criou quanto pro que foi ligado à mão a partir do extrato —
    -- é o que impede o aluguel de agosto entrar duas vezes.
    if exists (
      select 1 from public.balance_lancamentos
       where recorrente_id = r.id and data between v_ini and v_fim
    ) then
      continue;
    end if;

    v_venc := (v_ini + make_interval(days => least(r.dia_vencimento, v_ultimo) - 1))::date;
    v_ref  := r.id::text || '|' || to_char(p_mes, 'YYYY-MM');
    v_comp := case when coalesce(r.competencia_offset, 0) = 0 then null
                   else to_char(v_ini + make_interval(months => r.competencia_offset), 'YYYY-MM')
              end;

    begin
      insert into public.balance_lancamentos
        (conta_id, categoria_id, tipo, valor, data, status, descricao,
         origem, origem_ref, recorrente_id, competencia)
      values
        (r.conta_id, r.categoria_id, r.tipo, r.valor, v_venc, 'previsto', r.descricao,
         'recorrente', v_ref, r.id, v_comp);
      v_criados := v_criados + 1;
    exception when unique_violation then
      null;
    end;
  end loop;

  return jsonb_build_object('mes', to_char(p_mes,'YYYY-MM'), 'criados', v_criados);
end;
$function$;

grant execute on function public.fn_balance_materializar_recorrentes(date) to authenticated;
