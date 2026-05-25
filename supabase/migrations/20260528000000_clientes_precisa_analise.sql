-- Tag pra esteira de producao: marca clientes que precisam ter o pipeline
-- de analise de extratos bradesco iniciado.
-- Setado=true automaticamente quando o pre_cliente eh confirmado (vem do
-- kit/procuracao). Manual: user pode toggle no perfil do cliente.
-- Esteira /esteira coluna 1 mostra clientes com tag=true e sem nenhuma
-- analise_vinculada ainda — "pipeline nao iniciado".

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS precisa_analise_extratos boolean DEFAULT false;

-- Backfill: confirmados ate hoje vieram do kit/procuracao
UPDATE clientes c SET precisa_analise_extratos = true
WHERE EXISTS (
  SELECT 1 FROM pre_clientes pc WHERE pc.cliente_id = c.id AND pc.status = 'confirmado'
)
AND precisa_analise_extratos = false;
