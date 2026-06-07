-- ========================================================================
-- Esteira: análise primária universal + resgate do "limbo" de pendências
-- ========================================================================
-- Regra de negócio reforçada:
--  (1) TODO cliente novo entra na fila de "Análise primária" (coluna 1 da
--      esteira), independente da origem — manual, Writer/kit, edge function.
--      Antes só os confirmados de pre_clientes recebiam a tag; manuais e do
--      Writer ficavam de fora e se perdiam da triagem inicial.
--  (2) Quando TODAS as pendências documentais de um cliente são resolvidas,
--      ele DEVE voltar pra fila de análise primária. Isso não acontecia: os
--      usuários zeravam as pendências e o cliente ficava num limbo (fora da
--      col 1 e sem produção). A lógica de reabertura agora vive no front, mas
--      aqui resgatamos quem já caiu no limbo.

-- (1) Default da tag passa a ser true — cobre qualquer caminho de inserção.
ALTER TABLE public.clientes ALTER COLUMN precisa_analise_extratos SET DEFAULT true;

-- (2) Backfill do limbo: clientes que tiveram pelo menos uma pendência
--     resolvida, não têm nenhuma pendência aberta e não estão em produção
--     ativa — recoloca na fila de análise primária (tag=true + finalizada=null).
--     Quem está em produção (peça vinculada/artesanal/protocolo etc.) NÃO é
--     mexido: não está perdido, está visível nas colunas seguintes.
UPDATE public.clientes c
SET precisa_analise_extratos = true,
    analise_primaria_finalizada_at = NULL,
    analise_primaria_finalizada_by = NULL
WHERE EXISTS (
        SELECT 1 FROM public.demandas d
        WHERE d.cliente_id = c.id
          AND d.etapa = 'pendencia_documental'
          AND d.status IN ('resolvida','concluida')
      )
  AND NOT EXISTS (
        SELECT 1 FROM public.demandas d
        WHERE d.cliente_id = c.id
          AND d.etapa = 'pendencia_documental'
          AND d.status = 'pendente'
      )
  AND NOT EXISTS (
        SELECT 1 FROM public.demandas d
        WHERE d.cliente_id = c.id
          AND d.etapa IN ('analise_vinculada','fluxo_artesanal','pronta_para_protocolo','confeccao_peca','protocolada','processual')
          AND d.status <> 'cancelada'
      );
