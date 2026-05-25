-- Allow anon role to SELECT demandas of etapa='analise_documental' too.
-- The Finder (anon) needs this to find the most recent analise_documental
-- of a cliente and set it as analise_pai_id when creating an analise_vinculada.
-- Previously only 'analise_vinculada' was allowed, so vincular.js fetched
-- empty and analise_pai_id ended up NULL — análises vinculadas didn't show
-- up grouped under their parent session in the cliente detail UI.

DROP POLICY IF EXISTS demandas_anon_select_analise_vinc ON demandas;

CREATE POLICY demandas_anon_select_analise_vinc ON demandas
  FOR SELECT TO anon
  USING (etapa IN ('analise_vinculada', 'analise_documental'));
