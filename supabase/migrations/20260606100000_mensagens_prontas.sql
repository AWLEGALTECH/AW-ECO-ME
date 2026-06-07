-- Slots de mensagens prontas por usuario. Comeca com 2 (saudacao WhatsApp
-- e saudacao Instagram), mas o catalogo de slots vive no frontend
-- (src/lib/mensagensProntas.ts) — crescer = adicionar uma chave la, sem
-- precisar de migration. Cada (user_id, chave) guarda o conteudo editavel.
--
-- Visibilidade: cada usuario le/edita as proprias; admin le as de todos.
CREATE TABLE IF NOT EXISTS public.mensagens_prontas (
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chave      text NOT NULL,
  conteudo   text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, chave)
);

CREATE INDEX IF NOT EXISTS mensagens_prontas_user_idx ON public.mensagens_prontas (user_id);

ALTER TABLE public.mensagens_prontas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mp_self_all"   ON public.mensagens_prontas;
DROP POLICY IF EXISTS "mp_admin_read" ON public.mensagens_prontas;

-- Dono faz tudo com as proprias mensagens
CREATE POLICY "mp_self_all" ON public.mensagens_prontas FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admin pode ler as de todos (oversight)
CREATE POLICY "mp_admin_read" ON public.mensagens_prontas FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- Mantem updated_at em dia
CREATE OR REPLACE FUNCTION public.mensagens_prontas_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mensagens_prontas_touch ON public.mensagens_prontas;
CREATE TRIGGER mensagens_prontas_touch BEFORE UPDATE ON public.mensagens_prontas
  FOR EACH ROW EXECUTE FUNCTION public.mensagens_prontas_touch();
