// send-whatsapp
//
// Recebe { telefone, mensagem, cliente_id?, contexto?, enviado_por? } e
// repassa pro workflow do n8n que dispara a mensagem pelo WhatsApp
// corporativo (Evolution API). Grava cada tentativa em whatsapp_envios.
//
// Responde sempre 200 com { ok, error? } pra o frontend conseguir ler o
// detalhe do erro (functions.invoke mascara o body em respostas non-2xx).
//
// Envs: N8N_WHATSAPP_WEBHOOK_URL, N8N_WHATSAPP_WEBHOOK_SECRET

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Copia de src/lib/phone.ts — canonicaliza telefone BR pra 13 digitos:
// 55 + DD (2) + 9 + 8 digitos. Manter as duas em sincronia.
function canonicalizarTelefone(raw: string | null | undefined): string {
  if (!raw) return "";
  let d = String(raw).replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    d = d.slice(2);
  }
  if (d.length === 10) {
    d = d.slice(0, 2) + "9" + d.slice(2);
  }
  if (d.length !== 11) return String(raw).replace(/\D/g, "");
  return "55" + d;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const telefone = body.telefone as string | undefined;
    const mensagem = (body.mensagem as string | undefined)?.trim();
    const clienteId = (body.cliente_id as string | undefined) || null;
    const contexto = (body.contexto as string | undefined) || null;
    const enviadoPor = (body.enviado_por as string | undefined) || null;

    if (!telefone || !mensagem) {
      return json({ ok: false, error: "telefone e mensagem sao obrigatorios" });
    }

    const numero = canonicalizarTelefone(telefone);
    if (numero.length !== 13) {
      return json({ ok: false, error: `Telefone invalido: "${telefone}"` });
    }

    const webhookUrl = Deno.env.get("N8N_WHATSAPP_WEBHOOK_URL");
    const webhookSecret = Deno.env.get("N8N_WHATSAPP_WEBHOOK_SECRET");
    if (!webhookUrl) {
      return json({ ok: false, error: "N8N_WHATSAPP_WEBHOOK_URL nao configurado" });
    }

    let ok = false;
    let erro: string | null = null;
    try {
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(webhookSecret ? { "x-webhook-secret": webhookSecret } : {}),
        },
        body: JSON.stringify({ numero, mensagem, cliente_id: clienteId, contexto }),
      });
      if (resp.ok) {
        ok = true;
      } else {
        const t = await resp.text().catch(() => "");
        erro = `n8n respondeu ${resp.status}${t ? `: ${t.slice(0, 300)}` : ""}`;
      }
    } catch (e) {
      erro = `Falha ao chamar n8n: ${String((e as Error)?.message || e)}`;
    }

    // Auditoria — nao deixa falha de log derrubar o envio que ja aconteceu
    try {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { persistSession: false } },
      );
      await sb.from("whatsapp_envios").insert({
        cliente_id: clienteId,
        telefone: numero,
        mensagem,
        contexto,
        status: ok ? "enviado" : "erro",
        erro,
        enviado_por: enviadoPor,
      });
    } catch (e) {
      console.error("[send-whatsapp] falha ao logar envio", e);
    }

    return json(ok ? { ok: true, numero } : { ok: false, error: erro });
  } catch (e) {
    console.error("[send-whatsapp] erro", e);
    return json({ ok: false, error: String((e as Error)?.message || e) });
  }
});
