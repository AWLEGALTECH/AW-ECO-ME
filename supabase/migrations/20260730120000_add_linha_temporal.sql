-- Linha temporal (etapas cravadas + tarefas) persistida por processo.
-- Substitui a simulação por matéria: cada processo passa a carregar a sua
-- própria linha do tempo. Datas de marco desconhecidas ficam como "pré-sistema".
alter table public.processos
  add column if not exists linha_temporal jsonb;

comment on column public.processos.linha_temporal is
  'Etapas do processo (array JSON de milestones, cada um com suas tasks). Datas desconhecidas = "pré-sistema".';
