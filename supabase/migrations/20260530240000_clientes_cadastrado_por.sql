-- Quem cadastrou o cliente (nome de exibicao). Texto livre porque captadores
-- por procuracao (ex: Adria Mota) nao sao necessariamente usuarios do sistema.
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS cadastrado_por text;

-- Backfill dos atuais:
--   origem 'writer' = captado por procuracao -> Adria Mota
--   demais (manual/sistema) -> Luan Asaf
UPDATE public.clientes
SET cadastrado_por = CASE WHEN origem = 'writer' THEN 'Adria Mota' ELSE 'Luan Ásaf' END
WHERE cadastrado_por IS NULL;
