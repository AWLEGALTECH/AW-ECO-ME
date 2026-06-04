-- Identifica lotes de inserção em prospects: todo lead inserido na mesma
-- chamada de "Inserir leads" recebe o mesmo batch_id. Histórico agrupa
-- por isso pra mostrar "quem importou N leads em tal hora".

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS batch_id uuid;
CREATE INDEX IF NOT EXISTS prospects_batch_idx ON prospects(batch_id);

-- Backfill: prospects sem batch_id sao agrupados por (autor, lista, minuto).
-- Cada agrupamento ganha um UUID novo. Leads soltos (sem outros do mesmo
-- agrupamento) ficam com batch_id proprio (lote de 1).
WITH grupos AS (
  SELECT
    array_agg(id) AS ids,
    gen_random_uuid() AS bid
  FROM prospects
  WHERE batch_id IS NULL
  GROUP BY created_by, COALESCE(lista_origem, ''), date_trunc('minute', created_at)
)
UPDATE prospects p SET batch_id = g.bid
FROM grupos g
WHERE p.id = ANY(g.ids);
