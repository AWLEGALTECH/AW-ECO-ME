-- Responsavel pelo lead: carimbado pela primeira vez que alguem move o
-- lead de "aguardando_contato" pra "em_cadencia" (cadencia iniciada).
-- Fica visivel no card e no popup pra todos saberem quem assumiu.

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES auth.users(id);
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS responsavel_email text;

CREATE INDEX IF NOT EXISTS prospects_responsavel_idx
  ON prospects(responsavel_id) WHERE responsavel_id IS NOT NULL;
