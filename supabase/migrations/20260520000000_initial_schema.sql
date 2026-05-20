-- ========================================================================
-- AW ECO ME — Schema inicial (foco em gestão processual)
-- Espelha a aba ADV da planilha CONTROLE_DE_PROCESSOS_GERAL.xlsx
-- ========================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- profiles (espelha auth.users)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  nome text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- clientes
CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf_cnpj text,
  telefone text,
  email text,
  endereco text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX clientes_nome_unique_idx ON public.clientes (UPPER(TRIM(nome)));
CREATE INDEX clientes_nome_idx ON public.clientes (nome);

-- processos (campos espelham a aba ADV)
CREATE TABLE public.processos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_processo text NOT NULL UNIQUE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE RESTRICT,
  materia text,
  data_ultimo_andamento date,
  prazo_processual date,
  fase_processual text,
  tipo_pendencia text,
  status_tarefa text,
  vara_juizo_origem text,
  observacoes text,
  valor_causa numeric(14,2),
  comarca_uf text,
  parceiro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX processos_cliente_id_idx ON public.processos (cliente_id);
CREATE INDEX processos_fase_idx ON public.processos (fase_processual);
CREATE INDEX processos_materia_idx ON public.processos (materia);
CREATE INDEX processos_data_ultimo_andamento_idx ON public.processos (data_ultimo_andamento DESC);

-- Trigger: updated_at automático
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at_profiles  BEFORE UPDATE ON public.profiles  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_clientes  BEFORE UPDATE ON public.clientes  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_processos BEFORE UPDATE ON public.processos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger: cria profile automaticamente ao criar usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS
ALTER TABLE public.profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_self_read"   ON public.profiles  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_self_update" ON public.profiles  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "clientes_auth_all"    ON public.clientes  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "processos_auth_all"   ON public.processos FOR ALL TO authenticated USING (true) WITH CHECK (true);
