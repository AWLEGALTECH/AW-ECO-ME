-- Tipo de procedimento processual (JEC, Comum, Fazenda Publica, JEFP, JEF...).
-- Complementa local_tramite que e a vara/foro especifico onde a peca foi
-- protocolada. Procedimento = rito; local_tramite = vara/comarca.
alter table public.demandas
  add column if not exists procedimento text;
comment on column public.demandas.procedimento is
  'Tipo de procedimento processual: JEC, Comum, Fazenda Publica, JEFP, JEF etc.';
