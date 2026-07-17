// zapsign-webhook
//
// Recebe o webhook do ZapSign quando um documento é assinado e cria a
// notificação "cliente assinou". Protegido por ?token= (guardado em
// integracao_secrets). O push sai automático (trigger em notificacoes).
//
// Também aceita, pra teste, { signer, doc } ou { texto } com a frase
// "FULANO assinou o documento X".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function capNome(s: string): string {
  const small = new Set(["de", "da", "do", "das", "dos", "e"]);
  return (s || "").trim().toLowerCase().split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// Extrai { signer, doc, signedish } de payloads variados do ZapSign.
function extrair(p: any): { signer?: string; doc?: string; signedish: boolean } {
  if (!p || typeof p !== "object") return { signedish: false };

  let doc: string | undefined = p.name || p.doc?.name || p.document?.name || p.filename;
  let signer: string | undefined =
    p.signer_name || p.signer?.name || p.who_signed?.name || p.user?.name;

  const signers = p.signers || p.doc?.signers || p.document?.signers;
  let signerSigned = false;
  if (Array.isArray(signers) && signers.length) {
    const signed = signers.find((s: any) => /sign/i.test(String(s?.status || "")));
    const pick = signed || signers[signers.length - 1];
    signer = signer || pick?.name;
    signerSigned = !!signed;
  }

  const eventType = String(p.event_type || p.event || "").toLowerCase();
  const status = String(p.status || "").toLowerCase();
  let signedish = /sign/i.test(eventType) || /sign/i.test(status) || signerSigned;

  // Fallback: frase do e-mail "FULANO assinou o documento X"
  const texto = typeof p.texto === "string" ? p.texto
    : typeof p.text === "string" ? p.text : null;
  const alvo = texto || (!signer ? JSON.stringify(p) : "");
  if (alvo) {
    const m = alvo.match(/([A-Za-zÀ-ÿ'.\s]{3,}?)\s+assinou o documento\s+([^\n"\\]+)/i);
    if (m) { signer = signer || m[1].trim(); doc = doc || m[2].trim(); signedish = true; }
  }

  // teste manual explícito
  if (p.signer && !signer) signer = String(p.signer);
  if (p.doc && !doc && typeof p.doc === "string") doc = p.doc;

  return { signer: signer?.trim(), doc: doc?.trim(), signedish };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // 1. valida o token
    const url = new URL(req.url);
    const token = url.searchParams.get("token") || req.headers.get("x-webhook-token") || "";
    const { data: sec } = await sb.from("integracao_secrets").select("valor").eq("chave", "zapsign_webhook_token").single();
    if (!sec?.valor || token !== sec.valor) return j({ error: "unauthorized" }, 401);

    // 2. extrai quem assinou
    const payload = await req.json().catch(() => ({}));
    const { signer, doc, signedish } = extrair(payload);
    if (!signer) return j({ ok: true, ignored: true, motivo: "sem_signatario" });
    if (!signedish) return j({ ok: true, ignored: true, motivo: "evento_nao_assinatura" });

    const nome = capNome(signer);

    // 3. tenta casar com um cliente/pré-cliente (pro link)
    let link = "/pre-clientes";
    let clienteId: string | null = null;
    const { data: cli } = await sb.from("clientes").select("id").ilike("nome", signer).limit(1).maybeSingle();
    if (cli?.id) { clienteId = cli.id; link = `/clientes/${cli.id}`; }

    // 4. cria a notificação (respeita o liga/desliga; dispara push via trigger)
    const { error } = await sb.rpc("fn_criar_notificacao", {
      p_tipo: "cliente_assinou",
      p_titulo: "Contrato assinado 🎉",
      p_corpo: `${nome} assinou o contrato.`,
      p_dados: { cliente_nome: signer, cliente_id: clienteId, documento: doc || null },
      p_link: link,
      p_actor_id: null,
      p_actor_nome: null,
    });
    if (error) return j({ error: error.message }, 500);

    return j({ ok: true, signer: nome, doc: doc || null, matched: !!clienteId });
  } catch (e) {
    console.error("[zapsign-webhook]", e);
    return j({ error: String((e as Error)?.message || e) }, 500);
  }
});
