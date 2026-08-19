-- Milestone "Acordo" na linha temporal dos processos.
--
-- Acordo não é a etapa seguinte de nada: é o desvio que encerra o caminho. Por
-- isso entra no FIM da linha — fechado o acordo em qualquer ponto, o processo
-- salta para cá e o que ficou no meio é marcado como pulado, que é exatamente
-- o que aconteceu com aquelas etapas.
--
-- Não há tabela nova. O acordo (valor, data do fechamento, previsão de
-- pagamento) mora dentro da própria etapa, igual ao registro de cumprimento de
-- sentença, e o Tracker lê tudo de linha_temporal.

-- ── 1. Toda linha temporal já salva ganha a etapa Acordo ────────────────────
-- Sem isso, os 321 processos existentes nunca enxergariam a milestone: a linha
-- é gerada uma vez e persistida, não remontada a cada abertura.
update public.processos p
set linha_temporal = p.linha_temporal || jsonb_build_array(jsonb_build_object(
      'id',     'e' || (jsonb_array_length(p.linha_temporal) + 1),
      'titulo', 'Acordo',
      'status', 'pendente',
      'secao',  'Acordo',
      'tasks',  '[]'::jsonb
    ))
where jsonb_typeof(p.linha_temporal) = 'array'
  and jsonb_array_length(p.linha_temporal) > 0
  and not exists (
    select 1 from jsonb_array_elements(p.linha_temporal) e
    where e->>'titulo' = 'Acordo'
  );

-- ── 2. Quem já está em acordo vai para a milestone ──────────────────────────
-- Processos cujo status processual JÁ é um dos três status de acordo estavam
-- parados numa etapa que nada tem a ver com o que estão esperando (os dois
-- casos reais da base estavam em "Sentença" aguardando pagamento de acordo).
-- O valor do acordo não dá para adivinhar: a etapa fica atual e pedindo o
-- registro, que é onde a pessoa preenche.
with alvo as (
  select p.id, upper(trim(p.fase_processual)) as status
  from public.processos p
  where upper(trim(coalesce(p.fase_processual, ''))) in
        ('EM TRATATIVA DE ACORDO', 'AG. PAGAMENTO ACORDO', 'ARQUIVADO ACORDO')
    and jsonb_typeof(p.linha_temporal) = 'array'
    and exists (
      select 1 from jsonb_array_elements(p.linha_temporal) e
      where e->>'titulo' = 'Acordo' and e->>'status' <> 'atual'
    )
),
refeita as (
  select a.id,
         jsonb_agg(
           case
             when e.valor->>'titulo' = 'Acordo'
               then e.valor || jsonb_build_object('status', 'atual', 'statusProcessual', a.status)
             -- o que estava em curso fica cravado; o que nunca começou, pulado
             when e.valor->>'status' = 'atual'   then e.valor || '{"status":"concluida"}'::jsonb
             when e.valor->>'status' = 'pendente' then e.valor || '{"status":"pulada"}'::jsonb
             else e.valor
           end
           order by e.ord
         ) as linha
  from alvo a
  join public.processos p on p.id = a.id
  cross join lateral jsonb_array_elements(p.linha_temporal) with ordinality as e(valor, ord)
  group by a.id
)
update public.processos p
set linha_temporal = r.linha
from refeita r
where p.id = r.id;
