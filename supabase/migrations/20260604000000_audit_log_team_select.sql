-- Permite que qualquer usuario autenticado leia o audit_log de demandas e
-- clientes. Necessario pro card da Esteira mostrar "movido por X ha Y" —
-- atualmente so admin via tudo e usuario comum so via os proprios eventos.
DROP POLICY IF EXISTS audit_log_team_workflow_select ON public.audit_log;
CREATE POLICY audit_log_team_workflow_select ON public.audit_log FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND resource_type IN ('demandas', 'clientes', 'contratos')
  );
