-- Cliente com pendência documental aberta NÃO pode coexistir na fila de
-- "Análise primária" (col 1) e na fila de pendências ao mesmo tempo. Ao
-- relatar pendência, o cliente sai da col 1 (carimba
-- analise_primaria_finalizada_at) e fica só em pendências; volta pra
-- análise primária quando todas as pendências forem resolvidas.
--
-- Going-forward isso é feito no front (EsteiraInicioDialog). Aqui só
-- resgatamos quem já estava coexistindo: na col 1 (tag=true, não
-- finalizada) e com pelo menos uma pendência aberta — tira da col 1.
UPDATE public.clientes c
SET analise_primaria_finalizada_at = now()
WHERE c.precisa_analise_extratos = true
  AND c.analise_primaria_finalizada_at IS NULL
  AND EXISTS (
        SELECT 1 FROM public.demandas d
        WHERE d.cliente_id = c.id
          AND d.etapa = 'pendencia_documental'
          AND d.status = 'pendente'
      );
