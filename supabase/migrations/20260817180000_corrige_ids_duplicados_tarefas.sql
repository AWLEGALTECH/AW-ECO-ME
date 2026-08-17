-- Conserta ids de tarefa repetidos dentro do mesmo processo.
--
-- O contador que nomeia as tarefas (t1, t2, ...) vivia em estado de componente
-- e começava em 1 a cada montagem, ignorando o que já estava salvo. Reabrir um
-- processo e criar uma tarefa gerava um segundo "t1".
--
-- Isso não era só cosmético. `salvarDesfecho` e `resolverTarefa` percorrem
-- todas as etapas e casam a tarefa pelo id: com o id repetido, concluir uma
-- marcava as duas. E na tela de Tarefas, que junta os processos todos, a chave
-- repetida fazia o React reaproveitar o nó errado e a grade ficava presa numa
-- ordem por mais que se trocasse a ordenação.
--
-- Aqui só os processos afetados são reescritos, e neles as tarefas são
-- renumeradas na ordem em que já estavam: etapa por etapa, tarefa por tarefa.
-- Nada além do par id/ordem muda, e nenhuma tabela referencia esses ids
-- (vw_tarefas_processo apenas projeta task_id, não faz junção por ele).

with alvo as (
  select p.id
  from public.processos p,
       jsonb_array_elements(p.linha_temporal) e,
       jsonb_array_elements(coalesce(e->'tasks', '[]'::jsonb)) t
  where jsonb_typeof(p.linha_temporal) = 'array'
  group by p.id
  having count(*) <> count(distinct t->>'id')
),
etapas as (
  select p.id as pid, eo.ord as eord, eo.e as etapa
  from public.processos p
  join alvo a on a.id = p.id
  cross join lateral jsonb_array_elements(p.linha_temporal) with ordinality eo(e, ord)
),
tarefas as (
  select et.pid, et.eord, tt.ord as tord, tt.t as task
  from etapas et
  cross join lateral (
    select t, ord
    from jsonb_array_elements(coalesce(et.etapa->'tasks', '[]'::jsonb)) with ordinality x(t, ord)
  ) tt
),
numerada as (
  select *, row_number() over (partition by pid order by eord, tord) as n
  from tarefas
),
agrupada as (
  select pid, eord,
         jsonb_agg(
           jsonb_set(jsonb_set(task, '{id}', to_jsonb('t' || n)), '{ordem}', to_jsonb(n))
           order by tord
         ) as tasks
  from numerada
  group by pid, eord
),
reconstruida as (
  select et.pid,
         jsonb_agg(
           jsonb_set(et.etapa, '{tasks}', coalesce(ag.tasks, '[]'::jsonb))
           order by et.eord
         ) as lt
  from etapas et
  left join agrupada ag on ag.pid = et.pid and ag.eord = et.eord
  group by et.pid
)
update public.processos p
set linha_temporal = r.lt
from reconstruida r
where r.pid = p.id;
