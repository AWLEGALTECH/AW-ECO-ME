-- Modulo de prospeccao ativa: gestao de leads cold com pipeline
-- enxuto (aguardando contato -> em cadencia -> respondeu -> diagnostico
-- -> proposta -> ganho/perdido). Leads entram por colagem de texto na
-- pagina, parser regex extrai nome/fone/site/insta/maps, e cada um vira
-- um card no kanban.
--
-- prospect_eventos guarda a timeline de mudancas (criou, moveu, nota,
-- contato registrado) — mesmo padrao do audit_log mas dedicado pra
-- visualizacao linear na ficha do prospect.

CREATE TABLE IF NOT EXISTS prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text,
  email text,
  instagram text,
  whatsapp text,
  google_maps_url text,
  site text,
  avaliacao numeric(2,1),
  horario_funcionamento text,
  cidade text,

  estagio text NOT NULL DEFAULT 'aguardando_contato'
    CHECK (estagio IN ('aguardando_contato','em_cadencia','respondeu','diagnostico','proposta','ganho','perdido')),
  status text NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo','arquivado')),

  lista_origem text,
  observacoes text,

  proxima_acao_at timestamptz,
  ultimo_contato_at timestamptz,
  entrou_na_etapa_at timestamptz NOT NULL DEFAULT now(),

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospects_estagio_idx ON prospects(estagio) WHERE status = 'ativo';
CREATE INDEX IF NOT EXISTS prospects_lista_origem_idx ON prospects(lista_origem);
CREATE INDEX IF NOT EXISTS prospects_created_at_idx ON prospects(created_at DESC);

-- Mantem updated_at atualizado e re-carimba entrou_na_etapa_at quando
-- a etapa muda (pra calcular "ha X dias nessa etapa" no card).
CREATE OR REPLACE FUNCTION prospects_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'UPDATE' AND NEW.estagio IS DISTINCT FROM OLD.estagio THEN
    NEW.entrou_na_etapa_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prospects_touch ON prospects;
CREATE TRIGGER prospects_touch BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION prospects_touch_updated_at();

ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prospects_team_select" ON prospects;
DROP POLICY IF EXISTS "prospects_team_all"    ON prospects;
CREATE POLICY "prospects_team_select" ON prospects FOR SELECT TO authenticated USING (true);
CREATE POLICY "prospects_team_all"    ON prospects FOR ALL    TO authenticated USING (true) WITH CHECK (true);


CREATE TABLE IF NOT EXISTS prospect_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('criado','movido','nota','contato','status')),
  de_estagio text,
  para_estagio text,
  texto text,
  user_id uuid REFERENCES auth.users(id),
  user_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prospect_eventos_prospect_idx
  ON prospect_eventos(prospect_id, created_at DESC);

ALTER TABLE prospect_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prospect_eventos_team_select" ON prospect_eventos;
DROP POLICY IF EXISTS "prospect_eventos_team_insert" ON prospect_eventos;
CREATE POLICY "prospect_eventos_team_select" ON prospect_eventos FOR SELECT TO authenticated USING (true);
CREATE POLICY "prospect_eventos_team_insert" ON prospect_eventos FOR INSERT TO authenticated WITH CHECK (true);

-- Registra "criado" automaticamente quando um prospect entra. Outras
-- transicoes (mudanca de etapa, status, nota) sao registradas pelo
-- frontend pra que o user_email do auth seja preservado.
CREATE OR REPLACE FUNCTION prospect_log_create()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  email_atual text;
BEGIN
  SELECT email INTO email_atual FROM auth.users WHERE id = NEW.created_by;
  INSERT INTO prospect_eventos (prospect_id, tipo, para_estagio, user_id, user_email)
  VALUES (NEW.id, 'criado', NEW.estagio, NEW.created_by, email_atual);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prospect_create_log ON prospects;
CREATE TRIGGER prospect_create_log AFTER INSERT ON prospects
  FOR EACH ROW EXECUTE FUNCTION prospect_log_create();
