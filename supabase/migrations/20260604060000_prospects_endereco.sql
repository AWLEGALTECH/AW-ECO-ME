-- Endereco do estabelecimento — quando o parser detecta no texto
-- colado. Util pra geolocalizar leads (cluster por bairro/cidade).
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS endereco text;
