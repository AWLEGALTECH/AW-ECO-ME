// wa-conectar — ligar um número novo pela plataforma.
//
// Até aqui, conectar um WhatsApp era ir no painel da Evolution, criar a
// instância, ler o QR e depois configurar o webhook à mão — quatro passos em
// duas ferramentas, e o quarto é o que ninguém lembra. Instância conectada com
// webhook errado parece que funcionou: aparece "conectado" no painel e nenhuma
// mensagem chega no sistema.
//
// POR QUE O WEBHOOK É CONFIGURADO AQUI, E NÃO DEIXADO PRA DEPOIS. É a parte
// invisível e a única que quebra em silêncio. Fazendo daqui, a lista de eventos
// deixa de ser algo que alguém marcou uma vez numa tela e passa a ser o que
// este código diz que ela é — inclusive PRESENCE_UPDATE e MESSAGES_UPDATE, que
// são justamente os que estão faltando na instância que foi criada à mão.
//
// AÇÕES
//   criar        cria a instância, aponta o webhook e devolve o QR
//   qr           novo QR de uma instância que existe e está desconectada
//   estado       "conectado" / "conectando" / "desconectado"
//   webhook      reaplica a configuração de webhook numa instância existente
//   desconectar  derruba a sessão (a instância continua existindo)
//
// Env (secrets): EVOLUTION_URL, EVOLUTION_APIKEY, WA_WEBHOOK_TOKEN.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

/* Os eventos que este sistema sabe usar. Pedir só o que se usa não é economia:
   evento que ninguém trata vira linha em wa_eventos e ruído no diagnóstico. */
const EVENTOS = [
  "MESSAGES_UPSERT",   // mensagem nova
  "MESSAGES_UPDATE",   // entregue / lida / áudio ouvido
  "PRESENCE_UPDATE",   // online / digitando / gravando
  "CONNECTION_UPDATE", // caiu, reconectou
];

/** Nome de instância aceito pela Evolution: sem espaço, sem acento. */
function nomeDeInstancia(bruto: string): string {
  return String(bruto || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim().replace(/\s+/g, "-")
    .slice(0, 40);
}

/** O QR pode voltar em três formatos diferentes conforme a versão. */
function acharQr(o: any): string | null {
  const bruto = o?.qrcode?.base64 ?? o?.base64 ?? o?.qrcode?.code ?? o?.code ?? null;
  if (!bruto) return null;
  const s = String(bruto);
  // `base64` já vem como data URI; `code` é o texto do QR, que não serve de
  // imagem — devolver ele como se fosse imagem daria um retângulo quebrado.
  return s.startsWith("data:image") ? s : (s.startsWith("iVBOR") ? `data:image/png;base64,${s}` : null);
}

function traduzEstado(bruto: unknown): string {
  const s = String(bruto ?? "").toLowerCase();
  if (s === "open") return "conectado";
  if (s === "connecting") return "conectando";
  return "desconectado";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" });

  const URL_SB = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const base = (Deno.env.get("EVOLUTION_URL") || "").replace(/\/+$/, "");
  const apikey = Deno.env.get("EVOLUTION_APIKEY") || "";
  const tokenWebhook = Deno.env.get("WA_WEBHOOK_TOKEN") || "";

  if (!base || !apikey) return json({ ok: false, error: "EVOLUTION_URL/EVOLUTION_APIKEY não configurados" });
  if (!tokenWebhook) return json({ ok: false, error: "WA_WEBHOOK_TOKEN não configurado" });

  const urlWebhook = `${URL_SB}/functions/v1/wa-webhook?token=${encodeURIComponent(tokenWebhook)}`;
  const cab = { "Content-Type": "application/json", apikey };

  try {
    // ── só quem cuida do atendimento liga número ──
    const auth = req.headers.get("Authorization") || "";
    const comoUsuario = createClient(URL_SB, ANON, { global: { headers: { Authorization: auth } } });
    const { data: eu } = await comoUsuario.auth.getUser();
    if (!eu?.user) return json({ ok: false, error: "Não autenticado" });
    const { data: admin } = await comoUsuario.rpc("fn_is_admin");
    const { data: temModulo } = await comoUsuario.rpc("tem_modulo", { p_key: "atendimento" });
    if (!admin && !temModulo) return json({ ok: false, error: "Sem acesso ao atendimento" });

    const body = await req.json().catch(() => ({}));
    const acao = String(body.acao || "").trim();
    const nome = nomeDeInstancia(String(body.instancia || ""));
    if (!nome) return json({ ok: false, error: "Nome da instância é obrigatório" });

    const sb = createClient(URL_SB, SERVICE);

    /** Aponta o webhook desta instância pra cá, com a lista de eventos daqui. */
    const apontarWebhook = async (): Promise<string | null> => {
      // Duas formas conhecidas do corpo entre versões da v2. A primeira é a
      // atual; a segunda é a antiga. Tentar as duas custa um request e evita um
      // "conectado mas nada chega" que ninguém liga ao formato do JSON.
      const formas = [
        { webhook: { enabled: true, url: urlWebhook, webhookByEvents: false, webhookBase64: false, events: EVENTOS } },
        { enabled: true, url: urlWebhook, webhook_by_events: false, webhook_base64: false, events: EVENTOS },
      ];
      let ultimo = "";
      for (const corpo of formas) {
        const r = await fetch(`${base}/webhook/set/${encodeURIComponent(nome)}`, {
          method: "POST", headers: cab, body: JSON.stringify(corpo),
        });
        if (r.ok) return null;
        ultimo = `${r.status}: ${(await r.text()).slice(0, 200)}`;
      }
      return ultimo;
    };

    // ─────────────────────────── criar ───────────────────────────
    if (acao === "criar") {
      const r = await fetch(`${base}/instance/create`, {
        method: "POST", headers: cab,
        body: JSON.stringify({
          instanceName: nome,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        }),
      });
      const bruto = await r.text();
      if (!r.ok) {
        return json({ ok: false, error: `Evolution ${r.status}: ${bruto.slice(0, 300)}` });
      }
      const dados = (() => { try { return JSON.parse(bruto); } catch { return {}; } })();

      const erroWebhook = await apontarWebhook();

      // A instância entra no espelho já como desconectada: ela só fica de pé
      // quando alguém apontar a câmera. Gravar como conectada faria a tela
      // mentir no minuto em que o QR aparece.
      await sb.from("wa_instancias").upsert(
        { nome, status: "desconectado", ativa: true, sincronizado_em: new Date().toISOString() },
        { onConflict: "nome" },
      );

      return json({
        ok: true, instancia: nome, qr: acharQr(dados),
        aviso: erroWebhook ? `Instância criada, mas o webhook não foi aceito (${erroWebhook}). Sem ele, nenhuma mensagem chega.` : null,
      });
    }

    // ─────────────────────────── qr ───────────────────────────
    if (acao === "qr") {
      const r = await fetch(`${base}/instance/connect/${encodeURIComponent(nome)}`, { headers: cab });
      const bruto = await r.text();
      if (!r.ok) return json({ ok: false, error: `Evolution ${r.status}: ${bruto.slice(0, 300)}` });
      const dados = (() => { try { return JSON.parse(bruto); } catch { return {}; } })();
      return json({ ok: true, instancia: nome, qr: acharQr(dados) });
    }

    // ─────────────────────────── estado ───────────────────────────
    if (acao === "estado") {
      const r = await fetch(`${base}/instance/connectionState/${encodeURIComponent(nome)}`, { headers: cab });
      const bruto = await r.text();
      if (!r.ok) return json({ ok: false, error: `Evolution ${r.status}: ${bruto.slice(0, 200)}` });
      const dados = (() => { try { return JSON.parse(bruto); } catch { return {}; } })();
      const estado = traduzEstado(dados?.instance?.state ?? dados?.state);
      await sb.from("wa_instancias")
        .update({ status: estado, sincronizado_em: new Date().toISOString() })
        .eq("nome", nome);
      return json({ ok: true, instancia: nome, estado });
    }

    // ─────────────────────────── webhook ───────────────────────────
    if (acao === "webhook") {
      const erro = await apontarWebhook();
      return json(erro
        ? { ok: false, error: `A Evolution recusou a configuração do webhook (${erro}).` }
        : { ok: true, instancia: nome, eventos: EVENTOS });
    }

    // ─────────────────────────── desconectar ───────────────────────────
    if (acao === "desconectar") {
      const r = await fetch(`${base}/instance/logout/${encodeURIComponent(nome)}`, {
        method: "DELETE", headers: cab,
      });
      if (!r.ok) return json({ ok: false, error: `Evolution ${r.status}: ${(await r.text()).slice(0, 200)}` });
      await sb.from("wa_instancias").update({ status: "desconectado" }).eq("nome", nome);
      return json({ ok: true, instancia: nome, estado: "desconectado" });
    }

    return json({ ok: false, error: `Ação desconhecida: "${acao}"` });
  } catch (e) {
    console.error("[wa-conectar]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
