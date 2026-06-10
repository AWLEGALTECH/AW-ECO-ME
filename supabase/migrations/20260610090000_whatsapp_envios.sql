-- Log de mensagens de WhatsApp enviadas pelo sistema (edge function
-- send-whatsapp -> webhook n8n -> Evolution API no corporativo).
-- Serve de auditoria: o que foi enviado, pra quem e se deu certo.
--
-- Insercao acontece so pela edge function (service role, bypassa RLS);
-- usuarios autenticados apenas leem.
CREATE TABLE IF NOT EXISTS public.whatsapp_envios (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  telefone   text NOT NULL,            -- canonicalizado: 55 + DD + 9 + 8 digitos
  mensagem   text NOT NULL,
  contexto   text,                     -- ex.: boas_vindas_pre_cliente
  status     text NOT NULL DEFAULT 'enviado',  -- enviado | erro
  erro       text,
  enviado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_envios_cliente_idx ON public.whatsapp_envios (cliente_id);
CREATE INDEX IF NOT EXISTS whatsapp_envios_created_idx ON public.whatsapp_envios (created_at DESC);

ALTER TABLE public.whatsapp_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "we_read" ON public.whatsapp_envios;
CREATE POLICY "we_read" ON public.whatsapp_envios FOR SELECT TO authenticated
  USING (true);
