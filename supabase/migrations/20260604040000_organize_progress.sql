-- Coluna pra registrar progresso da edge function organize-client-folder
-- por arquivo. O frontend faz polling dessa coluna enquanto o invoke
-- esta rodando pra mostrar "Renomeando arquivo X/Y: <nome>" em tempo real.
--
-- Formato:
--   {
--     "atualizado_em": "iso-timestamp",
--     "total": 25,
--     "processados": 7,
--     "atual": "WhatsApp Image...jpg",
--     "ultimo_renomeado": { "de": "Doc12.pdf", "para": "RG.pdf", "categoria": "rg" },
--     "finalizado": false
--   }
--
-- Zerado/atualizado pela function. O frontend pode ler livremente.

ALTER TABLE pre_clientes ADD COLUMN IF NOT EXISTS organize_progress jsonb;
