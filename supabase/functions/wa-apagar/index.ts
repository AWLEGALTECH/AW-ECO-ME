// wa-apagar — "Apagar para todos" (pedido da Adria, 18/09/2026).
//
// Vem do AW-ECO, onde roda desde 14/09. Revoga no WhatsApp uma mensagem NOSSA
// pela Evolution (chat/deleteMessageForEveryone) e marca a linha como apagada.
//
// O WhatsApp só aceita revogar o que saiu há pouco (~2 dias); fora disso ele
// recusa, e aqui a recusa vira uma frase que diz o porquê, em vez de um erro
// genérico. Essa é a parte que mais importa: quem apaga uma mensagem mandada
// por engano precisa saber, sem dúvida nenhuma, se ela sumiu do aparelho do
// cliente ou não.
//
// "Apagar só para mim" NÃO passa por aqui: não há nada para pedir ao WhatsApp,
// é um update direto (fn_wa_mensagem_so_para_mim). Lá a mensagem continua.
//
// A MENSAGEM NÃO SOME DA NOSSA TELA. Nem esta, nem a que o cliente apaga: o
// conteúdo fica e a bolha ganha uma tarja dizendo o que aconteceu. Essa
// conversa é prova, e prova não perde linha porque alguém apagou do próprio
// celular.
//
// GRAVA DEPOIS DO OK, como a wa-enviar: a bolha só ganha a tarja quando a
// Evolution confirmou. O contrário diria que sumiu do aparelho do cliente uma
// mensagem que ele continua lendo.
//
// Env (secrets): EVOLUTION_URL, EVOLUTION_APIKEY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// Sempre 200 com { ok }: `functions.invoke` esconde o corpo das respostas
// non-2xx, e o erro chegaria na tela como "non-2xx status code".
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

const JANELA_HORAS = 48;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" });

  const URL_SB = Deno.env.get("SUPABASE_URL")!;
  const base = (Deno.env.get("EVOLUTION_URL") || "").replace(/\/+$/, "");
  const apikey = Deno.env.get("EVOLUTION_APIKEY_GLOBAL") || Deno.env.get("EVOLUTION_APIKEY") || "";
  if (!base || !apikey) return json({ ok: false, error: "EVOLUTION_URL/EVOLUTION_APIKEY não configurados nos secrets" });

  try {
    const auth = req.headers.get("Authorization") || "";
    const comoUsuario = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: eu } = await comoUsuario.auth.getUser();
    if (!eu?.user) return json({ ok: false, error: "Não autenticado" });
    const { data: admin } = await comoUsuario.rpc("fn_is_admin");
    const { data: temModulo } = await comoUsuario.rpc("tem_modulo", { p_key: "atendimento" });
    if (!admin && !temModulo) return json({ ok: false, error: "Sem acesso ao atendimento" });

    const body = await req.json().catch(() => ({}));
    const mensagemId = String(body.mensagem_id || "");
    if (!mensagemId) return json({ ok: false, error: "mensagem_id é obrigatório" });

    const sb = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: m, error: eM } = await sb
      .from("wa_mensagens")
      .select("id, conversa_id, direcao, id_whatsapp, criada_em, apagada_em, wa_conversas(instancia, telefone, jid)")
      .eq("id", mensagemId).maybeSingle();
    if (eM) return json({ ok: false, error: eM.message });
    if (!m) return json({ ok: false, error: "Mensagem não encontrada" });
    if (m.apagada_em) return json({ ok: true, ja: true });
    if (m.direcao !== "saida") return json({ ok: false, error: "Só dá pra apagar para todos uma mensagem NOSSA. A do cliente, só 'para mim'." });
    if (!m.id_whatsapp) return json({ ok: false, error: "Essa mensagem não tem o id do WhatsApp — não dá pra revogar." });
    const idadeH = (Date.now() - new Date(m.criada_em).getTime()) / 3_600_000;
    if (idadeH > JANELA_HORAS) {
      return json({ ok: false, error: `O WhatsApp só deixa apagar para todos em até ${JANELA_HORAS} h. Esta tem ${Math.round(idadeH)} h, então só dá 'para mim'.` });
    }

    const conv = (Array.isArray(m.wa_conversas) ? m.wa_conversas[0] : m.wa_conversas) as { instancia: string; telefone: string; jid: string | null } | null;
    if (!conv) return json({ ok: false, error: "Conversa não encontrada" });
    const remoteJid = conv.jid || `${conv.telefone}@s.whatsapp.net`;

    const r = await fetch(`${base}/chat/deleteMessageForEveryone/${encodeURIComponent(conv.instancia)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({ id: m.id_whatsapp, remoteJid, fromMe: true }),
    });
    const bruto = await r.text();
    if (!r.ok) {
      console.error(`[wa-apagar] ${r.status}: ${bruto.slice(0, 400)}`);
      return json({ ok: false, error: `O WhatsApp não aceitou apagar (${r.status}). ${bruto.slice(0, 160)}` });
    }

    const { error: eUp } = await sb.from("wa_mensagens")
      .update({ apagada_em: new Date().toISOString(), apagada_por: eu.user.id })
      .eq("id", mensagemId);
    // Apagou lá e não marcou aqui é o único desencontro possível, e ele é
    // avisado em vez de silencioso: a tela continuaria mostrando o texto de
    // algo que o cliente já não tem.
    if (eUp) return json({ ok: true, aviso: "Apagou no WhatsApp, mas não marquei no histórico: " + eUp.message });
    return json({ ok: true });
  } catch (e) {
    console.error("[wa-apagar]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
