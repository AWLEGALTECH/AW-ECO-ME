-- AW SPY: guarda os resultados parciais da extração (um item por extrato já lido)
-- para a análise poder se continuar sozinha entre janelas da função serverless.
alter table public.spy_analise add column if not exists parciais jsonb not null default '[]'::jsonb;
