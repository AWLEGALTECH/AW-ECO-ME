-- ========================================================================
-- AW ECO ME — Sistema de roles e permissões por módulo
-- ========================================================================
-- profiles.role           : 'admin' | 'user'
-- profiles.approved       : aguarda aprovação do admin antes de logar
-- user_module_access      : quais sidebar items cada user comum enxerga
-- ========================================================================

-- 1) Colunas em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'
    CHECK (role IN ('admin', 'user')),
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_role_idx     ON public.profiles (role);
CREATE INDEX IF NOT EXISTS profiles_approved_idx ON public.profiles (approved);

-- 2) Helper: is_admin(uid) — usado pelas policies sem expor profiles diretamente
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = uid AND role = 'admin' AND approved = true
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

-- 3) Tabela user_module_access
CREATE TABLE IF NOT EXISTS public.user_module_access (
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module_key  text NOT NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, module_key)
);

CREATE INDEX IF NOT EXISTS user_module_access_user_idx ON public.user_module_access (user_id);

ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

-- User pode ler os próprios módulos; admin pode ler/escrever tudo.
DROP POLICY IF EXISTS "uma_self_read"   ON public.user_module_access;
DROP POLICY IF EXISTS "uma_admin_read"  ON public.user_module_access;
DROP POLICY IF EXISTS "uma_admin_write" ON public.user_module_access;

CREATE POLICY "uma_self_read"   ON public.user_module_access FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "uma_admin_read"  ON public.user_module_access FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "uma_admin_write" ON public.user_module_access FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 4) Profiles: admin pode ler/escrever todos
DROP POLICY IF EXISTS "profiles_admin_read"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;

CREATE POLICY "profiles_admin_read"   ON public.profiles FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));
CREATE POLICY "profiles_admin_update" ON public.profiles FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 5) Atualiza handle_new_user — novo cadastro nasce não-aprovado e como 'user'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome, role, approved)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'nome', NEW.email),
    'user',
    false
  );
  RETURN NEW;
END;
$$;

-- 6) Seed: promover awlegaltech@gmail.com a admin/approved (se já existir)
UPDATE public.profiles
SET role = 'admin', approved = true
WHERE email = 'awlegaltech@gmail.com';

-- 7) Backfill: usuários já existentes (pré-feature) ficam aprovados pra não quebrar
-- (só os já presentes; novos cadastros ainda precisarão aprovação)
UPDATE public.profiles SET approved = true WHERE approved = false;

-- 8) Backfill: todos os usuários existentes ganham acesso a todos os módulos atuais
INSERT INTO public.user_module_access (user_id, module_key)
SELECT p.id, m.module_key
FROM public.profiles p
CROSS JOIN (VALUES
  ('dashboard'),
  ('clientes'),
  ('pre_clientes'),
  ('esteira'),
  ('processos'),
  ('writer'),
  ('finder')
) AS m(module_key)
ON CONFLICT DO NOTHING;
