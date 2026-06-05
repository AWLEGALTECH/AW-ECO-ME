-- Substitui lista_origem + cidade por nicho. Cada lote de inserção
-- agora eh tagueado pelo nicho da empresa (clinica, advogado, pet,
-- estetica, etc) — esse campo casa com um icone na UI (lib/nichos.ts).
DROP INDEX IF EXISTS prospects_lista_origem_idx;
ALTER TABLE prospects DROP COLUMN IF EXISTS cidade;
ALTER TABLE prospects DROP COLUMN IF EXISTS lista_origem;

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS nicho text;
CREATE INDEX IF NOT EXISTS prospects_nicho_idx ON prospects(nicho) WHERE nicho IS NOT NULL;
