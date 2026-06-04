-- Parceiro do cliente: nome do colaborador externo que trouxe o caso
-- (collab). Texto livre, opcional. Editavel depois com confirmacao na UI.
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS parceiro text;

-- Competencia da peca (JEC ou Vara Civel Comum). Gravada pelo Writer no
-- momento da finalizacao, com base no valor da causa e regra de alcada
-- vigente (40 SM = R$ 64.840 em 2026). Se nulo, o espelho de protocolo
-- recalcula com fallback. Evita divergencia ME (limite antigo) vs Writer
-- (limite atualizado) na faixa R$ 60.001 - R$ 64.840.
ALTER TABLE public.demandas ADD COLUMN IF NOT EXISTS competencia text;
