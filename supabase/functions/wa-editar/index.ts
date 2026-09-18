// wa-editar — editar uma mensagem NOSSA, como no WhatsApp (Adria, 18/09/2026).
//
// Vem do AW-ECO, onde roda desde 17/09. O WhatsApp só deixa editar a própria
// mensagem de TEXTO em até 15 minutos; a Evolution expõe isso em
// chat/updateMessage. Fora da janela ela recusa, e aqui a recusa vira uma
// frase que diz o porquê.
//
// Só grava depois do OK do WhatsApp, a mesma regra da wa-enviar e da
// wa-apagar: a tela nunca mostra uma versão que o cliente não recebeu. O
// contrário seria pior que o erro, porque quem confere o histórico leria o
// texto corrigido e o cliente estaria lendo o outro.
//
// O texto original fica guardado (texto_original): conversa com cliente é
// registro, e registro não perde versão.
//
// Env (secrets): EVOLUTION_URL, EVOLUTION_APIKEY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

const JANELA_MIN = 15;

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
    const id = String(body.mensagem_id || "");
    const texto = String(body.texto ?? "").trim();
    if (!id) return json({ ok: false, error: "mensagem_id é obrigatório" });
    if (!texto) return json({ ok: false, error: "O texto não pode ficar vazio. Para remover, use Apagar." });

    const sb = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: m, error: eM } = await sb.from("wa_mensagens")
      .select("id, direcao, tipo, texto, id_whatsapp, criada_em, apagada_em, texto_original, wa_conversas(instancia, telefone, jid)")
      .eq("id", id).maybeSingle();
    if (eM || !m) return json({ ok: false, error: "Mensagem não encontrada" });
    if (m.direcao !== "saida") return json({ ok: false, error: "Só dá pra editar mensagem nossa." });
    if (m.tipo !== "texto") return json({ ok: false, error: "Só mensagem de texto pode ser editada." });
    if (m.apagada_em) return json({ ok: false, error: "Essa mensagem foi apagada." });
    if (!m.id_whatsapp) return json({ ok: false, error: "Essa mensagem não tem identificação no WhatsApp, então não dá pra editar." });
    const minutos = (Date.now() - new Date(m.criada_em).getTime()) / 60_000;
    if (minutos > JANELA_MIN) {
      return json({ ok: false, error: `O WhatsApp só deixa editar em até ${JANELA_MIN} minutos, e essa saiu há ${Math.round(minutos)}.` });
    }
    // Salvou sem mudar nada: não gasta chamada na Evolution nem marca a bolha
    // como editada, que seria uma marca mentindo sobre o que aconteceu.
    if (texto === (m.texto ?? "").trim()) return json({ ok: true, ja: true });

    const conv = (Array.isArray(m.wa_conversas) ? m.wa_conversas[0] : m.wa_conversas) as { instancia: string; telefone: string; jid: string | null } | null;
    if (!conv) return json({ ok: false, error: "Conversa não encontrada" });
    const remoteJid = conv.jid || `${conv.telefone}@s.whatsapp.net`;

    const r = await fetch(`${base}/chat/updateMessage/${encodeURIComponent(conv.instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({ number: conv.telefone, key: { remoteJid, fromMe: true, id: m.id_whatsapp }, text: texto }),
    });
    const bruto = await r.text();
    if (!r.ok) {
      console.error(`[wa-editar] Evolution ${r.status}: ${bruto.slice(0, 300)}`);
      return json({ ok: false, error: r.status === 400 ? "O WhatsApp recusou a edição (passou dos 15 minutos?)." : `Evolution ${r.status}` });
    }

    const { error: eUp } = await sb.from("wa_mensagens")
      // `texto_original ?? texto`: guarda o de ANTES DA PRIMEIRA edição. Editar
      // de novo não pode sobrescrever o original com a versão intermediária,
      // senão o que ficou registrado não é o que o cliente leu primeiro.
      .update({ texto, editada_em: new Date().toISOString(), texto_original: m.texto_original ?? m.texto })
      .eq("id", id);
    if (eUp) return json({ ok: true, aviso: "Editada no WhatsApp, mas não consegui gravar aqui: " + eUp.message });
    return json({ ok: true });
  } catch (e) {
    console.error("[wa-editar]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
