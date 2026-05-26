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
