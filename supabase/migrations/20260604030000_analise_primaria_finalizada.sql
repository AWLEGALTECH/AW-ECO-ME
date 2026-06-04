-- "Analise primaria" eh a primeira analise feita do cliente (era chamada
-- "Aguardando analise" antes). Antes, o cliente saia da coluna 1 da
-- esteira automaticamente assim que aparecia QUALQUER demanda downstream
-- (analise_vinculada, fluxo_artesanal, pronta_para_protocolo,
-- pendencia_documental). O advogado reclamou: ele quer trabalhar em
-- paralelo (iniciar Bradesco + criar pecas artesanais) sem perder o
-- cliente de vista, e so tirar da col 1 quando ele explicitamente
-- declarar "analise primaria finalizada".
--
-- Esses dois campos carimbam quando/quem finalizou.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS analise_primaria_finalizada_at timestamptz,
  ADD COLUMN IF NOT EXISTS analise_primaria_finalizada_by uuid REFERENCES auth.users(id);

-- Backfill: clientes que JA tem demanda downstream pendente sao
-- considerados com analise primaria finalizada (preservam o comportamento
-- anterior — quem ja saiu da col 1 continua fora). So marca os que ainda
-- nao foram marcados.
UPDATE clientes c
SET analise_primaria_finalizada_at = now()
WHERE c.precisa_analise_extratos = true
  AND c.analise_primaria_finalizada_at IS NULL
  AND EXISTS (
    SELECT 1 FROM demandas d
    WHERE d.cliente_id = c.id
      AND d.etapa IN ('analise_vinculada','fluxo_artesanal','pronta_para_protocolo','pendencia_documental')
      AND d.status <> 'cancelada'
  );
