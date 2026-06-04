-- 'follow_up' como estagio + carimbo da data agendada. Substitui o
-- conceito anterior de ganho/perdido como acao no popup do lead — agora
-- as 2 opcoes terminais sao Follow-up (agenda data, fica em coluna
-- propria) e Arquivar (status='arquivado', some do pipeline).
ALTER TABLE prospects DROP CONSTRAINT IF EXISTS prospects_estagio_check;
ALTER TABLE prospects ADD CONSTRAINT prospects_estagio_check
  CHECK (estagio IN ('aguardando_contato','em_cadencia','respondeu','diagnostico','proposta','follow_up','ganho','perdido'));

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS follow_up_at timestamptz;
CREATE INDEX IF NOT EXISTS prospects_follow_up_at_idx
  ON prospects(follow_up_at) WHERE follow_up_at IS NOT NULL;

ALTER TABLE prospect_eventos DROP CONSTRAINT IF EXISTS prospect_eventos_tipo_check;
ALTER TABLE prospect_eventos ADD CONSTRAINT prospect_eventos_tipo_check
  CHECK (tipo IN ('criado','movido','nota','contato','status','follow_up'));
