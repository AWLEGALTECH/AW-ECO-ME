-- Renomeia conceitualmente 3 etapas do funil de prospecção (labels são da
-- UI; as chaves do estágio continuam respondeu/diagnostico/proposta):
--   "Respondeu"    -> "Número do decisor adquirido"
--   "Diagnóstico"  -> "Call de diagnóstico agendada"
--   "Proposta"     -> "Call de proposta agendada"
--
-- Cada uma ganha um dado próprio:
--  - telefone_decisor: número direto de quem decide, associado ao lead na
--    etapa do decisor e exibido como contato clicável junto ao principal.
--  - diagnostico_call_at / proposta_call_at: data/hora agendada da call,
--    preenchida nas etapas correspondentes (futuramente sincronizada com
--    o Google Calendar).
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS telefone_decisor text;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS diagnostico_call_at timestamptz;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS proposta_call_at timestamptz;

-- Novo tipo de evento pra registrar agendamentos de call na timeline do lead.
ALTER TABLE prospect_eventos DROP CONSTRAINT IF EXISTS prospect_eventos_tipo_check;
ALTER TABLE prospect_eventos ADD CONSTRAINT prospect_eventos_tipo_check
  CHECK (tipo IN ('criado','movido','nota','contato','status','follow_up','agenda'));
