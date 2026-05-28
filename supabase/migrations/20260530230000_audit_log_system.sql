-- Sistema central de logs com triggers automaticos + RPC pra eventos manuais.
-- Snapshot completo do row em INSERT/DELETE; UPDATE registra diff de chaves alteradas.
-- RLS: admin le tudo, usuario comum so le os proprios eventos.

CREATE TABLE IF NOT EXISTS public.audit_log (
  id            bigserial PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email    text,
  action        text NOT NULL,
  resource_type text NOT NULL,
  resource_id   text,
  details       jsonb,
  diff          jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_user_idx ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS audit_log_resource_idx ON public.audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON public.audit_log(action);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_admin_select ON public.audit_log;
CREATE POLICY audit_log_admin_select ON public.audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = auth.uid() AND role = 'admin' AND approved = true));

DROP POLICY IF EXISTS audit_log_self_select ON public.audit_log;
CREATE POLICY audit_log_self_select ON public.audit_log FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;
CREATE POLICY audit_log_insert ON public.audit_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.app_log(
  p_action text,
  p_resource_type text,
  p_resource_id text DEFAULT NULL,
  p_details jsonb DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id bigint;
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_log(user_id, user_email, action, resource_type, resource_id, details)
  VALUES (auth.uid(), v_email, p_action, p_resource_type, p_resource_id, p_details)
  RETURNING id INTO v_id;
  RETURN v_id;
END
$$;
REVOKE ALL ON FUNCTION public.app_log(text,text,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.app_log(text,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.audit_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text;
  v_action text;
  v_id text;
  v_details jsonb;
  v_diff jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_id := COALESCE((row_to_json(OLD)->>'id'), 'unknown');
    v_details := to_jsonb(OLD);
  ELSIF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_id := COALESCE((row_to_json(NEW)->>'id'), 'unknown');
    v_details := to_jsonb(NEW);
  ELSE
    v_action := 'update';
    v_id := COALESCE((row_to_json(NEW)->>'id'), 'unknown');
    v_details := to_jsonb(NEW);
    SELECT jsonb_object_agg(key, jsonb_build_object('before', old_val, 'after', new_val))
      INTO v_diff
    FROM (
      SELECT key, n.value AS new_val, o.value AS old_val
      FROM jsonb_each(to_jsonb(NEW)) n
      FULL JOIN jsonb_each(to_jsonb(OLD)) o USING (key)
      WHERE n.value IS DISTINCT FROM o.value
        AND key NOT IN ('updated_at')
    ) changes;
  END IF;

  INSERT INTO public.audit_log(user_id, user_email, action, resource_type, resource_id, details, diff)
  VALUES (auth.uid(), v_email, v_action, TG_TABLE_NAME, v_id, v_details, v_diff);

  RETURN COALESCE(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS trg_audit_clientes ON public.clientes;
CREATE TRIGGER trg_audit_clientes AFTER INSERT OR UPDATE OR DELETE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_processos ON public.processos;
CREATE TRIGGER trg_audit_processos AFTER INSERT OR UPDATE OR DELETE ON public.processos
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_demandas ON public.demandas;
CREATE TRIGGER trg_audit_demandas AFTER INSERT OR UPDATE OR DELETE ON public.demandas
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
CREATE TRIGGER trg_audit_profiles AFTER UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_user_module_access ON public.user_module_access;
CREATE TRIGGER trg_audit_user_module_access AFTER INSERT OR UPDATE OR DELETE ON public.user_module_access
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
