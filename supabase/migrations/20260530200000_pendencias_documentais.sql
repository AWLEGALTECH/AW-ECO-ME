-- ========================================================================
-- Pendências documentais — nova etapa na esteira
-- ========================================================================
-- Quando o usuario clica em "Iniciar analise" pra um cliente aguardando,
-- ele pode relatar uma pendencia documental (ex: falta comprovante de
-- residencia, extrato, contrato). Cria uma demanda nova na esteira com:
--
--   etapa  = 'pendencia_documental'
--   status = 'pendente' (vira 'resolvida' quando admin marca como tal)
--   pendencia_tipo = 'comprovante_residencia' | 'extratos_bancarios'
--                  | 'contrato_drive' | 'rg' | 'cpf' | 'procuracao'
--                  | 'personalizada'
--   descricao = texto livre (so usado quando pendencia_tipo='personalizada')
-- ========================================================================

ALTER TABLE public.demandas
  ADD COLUMN IF NOT EXISTS pendencia_tipo text;

CREATE INDEX IF NOT EXISTS demandas_pendencia_idx
  ON public.demandas (etapa, status)
  WHERE etapa = 'pendencia_documental';

-- Expande check de etapa pra aceitar 'pendencia_documental' e status pra 'resolvida'
ALTER TABLE public.demandas DROP CONSTRAINT IF EXISTS demandas_etapa_check;
ALTER TABLE public.demandas ADD CONSTRAINT demandas_etapa_check
  CHECK (etapa = ANY (ARRAY[
    'analise_documental'::text,
    'analise_vinculada'::text,
    'confeccao_peca'::text,
    'pronta_para_protocolo'::text,
    'protocolada'::text,
    'processual'::text,
    'pendencia_documental'::text
  ]));

ALTER TABLE public.demandas DROP CONSTRAINT IF EXISTS demandas_status_check;
ALTER TABLE public.demandas ADD CONSTRAINT demandas_status_check
  CHECK (status = ANY (ARRAY[
    'pendente'::text,
    'em_andamento'::text,
    'concluida'::text,
    'bloqueada'::text,
    'cancelada'::text,
    'resolvida'::text
  ]));
