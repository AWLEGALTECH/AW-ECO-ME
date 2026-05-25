-- Adiciona data_inicio_desconto e data_fim_desconto em demandas.
-- O Finder grava essas datas (primeiro e ultimo desconto da planilha)
-- ao criar a analise_vinculada. O Writer puxa via fetchAnaliseVinculadaMeta
-- e pre-preenche os campos do pacote 3 (data_inicio_descontos /
-- data_fim_descontos) — usuario nao precisa redigitar.
--
-- Formato esperado: DD/MM/AAAA (texto, igual aos campos do writer).

ALTER TABLE demandas
  ADD COLUMN IF NOT EXISTS data_inicio_desconto text,
  ADD COLUMN IF NOT EXISTS data_fim_desconto text;
