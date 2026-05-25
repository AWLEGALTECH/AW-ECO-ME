-- Pipeline etapa 3 (pronta_para_protocolo) precisa armazenar dados pra
-- "espelho de protocolo": copia-cola facilitada de info processual.
-- Tambem precisa registrar conclusao quando o tribunal devolve o numero.
ALTER TABLE demandas
  ADD COLUMN IF NOT EXISTS numero_processo text,         -- recebido do tribunal apos protocolar
  ADD COLUMN IF NOT EXISTS protocolado_at timestamptz,   -- quando o user clicou em concluir
  ADD COLUMN IF NOT EXISTS protocolado_tribunal text,    -- 'projudi' (so funcional por ora)
  ADD COLUMN IF NOT EXISTS comarca text,                 -- preenchido na peca (writer pacote 3)
  ADD COLUMN IF NOT EXISTS uf text,                      -- idem
  ADD COLUMN IF NOT EXISTS valor_causa numeric;          -- pra animacao de valor total acumulado
