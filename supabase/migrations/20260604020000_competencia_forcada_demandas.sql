-- Registra se a competencia foi FORCADA pelo advogado (override manual no
-- Writer) ou se eh o calculo automatico baseado em valor. Permite ao Espelho
-- mostrar badge "forcado" e o operador do protocolo saber que a regra geral
-- foi conscientemente quebrada.
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS competencia_forcada boolean DEFAULT false;
