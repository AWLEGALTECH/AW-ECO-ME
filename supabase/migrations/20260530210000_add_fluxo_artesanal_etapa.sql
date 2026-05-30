-- Adiciona a etapa 'fluxo_artesanal' ao check constraint de demandas.etapa.
-- Casos que nao sao acao Bradesco entram nessa coluna e tem a peca feita
-- manualmente. A esteira renderiza esses cards entre "analise_vinculada"
-- (Bradesco) e "pronta_para_protocolo".
ALTER TABLE public.demandas DROP CONSTRAINT IF EXISTS demandas_etapa_check;
ALTER TABLE public.demandas ADD CONSTRAINT demandas_etapa_check
  CHECK (etapa = ANY (ARRAY[
    'analise_documental'::text,
    'analise_vinculada'::text,
    'fluxo_artesanal'::text,
    'confeccao_peca'::text,
    'pronta_para_protocolo'::text,
    'protocolada'::text,
    'processual'::text,
    'pendencia_documental'::text
  ]));
