-- View de tarefas achatadas
--
-- As tarefas vivem dentro de `processos.linha_temporal` (jsonb: etapas → tasks).
-- Pra contar/ordenar prazo no Dashboard sem baixar a linha temporal inteira de
-- todos os processos (≈700 KB), esta view achata tudo numa tabela.
--
-- security_invoker = true → a RLS de `processos` continua valendo: cada usuário
-- só enxerga as tarefas dos processos que já podia ver.

create or replace view public.vw_tarefas_processo
with (security_invoker = true) as
select
  p.id                                as processo_id,
  p.numero_processo,
  p.fase_processual,
  p.materia,
  p.valor_causa,
  c.nome                              as cliente_nome,
  et->>'titulo'                       as etapa_titulo,
  t->>'id'                            as task_id,
  t->>'tipo'                          as tipo,        -- acao | monitoramento | pendencia
  t->>'titulo'                        as titulo,
  nullif(t->>'conteudo', '')          as conteudo,
  nullif(t->>'prazo', '')::date       as prazo,
  nullif(t->>'status', '')            as status,
  nullif(t->>'desfecho', '')          as desfecho     -- null = ainda aberta
from public.processos p
left join public.clientes c on c.id = p.cliente_id
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(p.linha_temporal) = 'array' then p.linha_temporal else '[]'::jsonb end
) et
cross join lateral jsonb_array_elements(coalesce(et->'tasks', '[]'::jsonb)) t;

comment on view public.vw_tarefas_processo is
  'Tarefas da linha temporal achatadas (uma linha por tarefa). Usada pelo Dashboard e por qualquer consulta de prazo. Respeita a RLS de processos.';
