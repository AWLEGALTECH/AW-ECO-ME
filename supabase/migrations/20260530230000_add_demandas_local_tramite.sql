-- Local de tramite (ex: Juizado Especial Civel, Vara Civel Comum,
-- Vara da Fazenda Publica). Persistido em demandas pra evitar perguntar
-- ao usuario toda vez que for protocolar.
alter table public.demandas
  add column if not exists local_tramite text;
comment on column public.demandas.local_tramite is
  'Onde o processo vai tramitar (Juizado Especial Civel, Vara Civel Comum etc.). Definido pelo advogado no momento do protocolo.';
