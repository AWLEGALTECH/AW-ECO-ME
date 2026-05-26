-- RPC que permite admin remover solicitacao de acesso pendente (libera o email pra novo signup).
-- SECURITY DEFINER necessario pra deletar de auth.users (schema com privilegios restritos).
-- Protecoes:
--   1) caller precisa ser admin aprovado
--   2) target precisa ter approved=false (nao deleta usuario ativo por engano)
--   3) target nao pode ser o proprio caller

CREATE OR REPLACE FUNCTION public.admin_delete_pending_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean;
  v_target_approved boolean;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;

  IF v_caller = target_user_id THEN
    RAISE EXCEPTION 'Nao pode remover a si mesmo';
  END IF;

  SELECT (role = 'admin' AND approved = true) INTO v_is_admin
    FROM public.profiles WHERE id = v_caller;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Acesso negado: apenas admins';
  END IF;

  SELECT approved INTO v_target_approved
    FROM public.profiles WHERE id = target_user_id;
  IF v_target_approved IS NULL THEN
    RAISE EXCEPTION 'Usuario nao encontrado';
  END IF;
  IF v_target_approved THEN
    RAISE EXCEPTION 'Usuario ja foi aprovado. Bloqueie-o antes de remover.';
  END IF;

  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_pending_user(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_delete_pending_user(uuid) TO authenticated;
