// wa-presenca — pedir ao WhatsApp que nos conte quando o contato está digitando.
//
// POR QUE ISSO PRECISA EXISTIR. O evento `PRESENCE_UPDATE` está marcado no
// painel da Evolution e mesmo assim nunca chegou uma linha sequer — enquanto
// `MESSAGES_UPSERT` chega normalmente. Não é webhook, não é token, não é a
// lista de eventos: é o protocolo.
//
// Presença no WhatsApp é ASSINADA POR CONTATO. O Baileys só recebe
// `presence.update` de um JID depois de chamar `presenceSubscribe` naquele JID.
// Sem a assinatura o servidor simplesmente não manda, e a ausência se parece
// exatamente com "o evento está desmarcado" — que foi onde eu procurei
// primeiro, e errado.
//
// E POR QUE ELA TENTA VÁRIAS ROTAS. Eu não consigo alcançar a documentação da
// Evolution daqui, e o nome dessa rota mudou entre versões da v2. Chutar uma e
// deixar o resto quieto reproduziria o defeito que essa integração já teve três
// vezes: falhar em silêncio e parecer que funcionou.
//
// Então ela tenta as candidatas conhecidas, GRAVA qual respondeu o quê em
// `wa_eventos`, e devolve o nome da que funcionou. Na primeira chamada real, a
// dúvida vira fato — e se nenhuma existir, isso também fica escrito, que é uma
// resposta legítima: esta build não expõe assinatura de presença.
//
// O que ela NÃO faz: mandar a NOSSA presença. `sendPresence` existe e seria
// tentador incluir na lista, mas ele anuncia o escritório como "online" ou
// "digitando" no aparelho do cliente — efeito visível para outra pessoa, que
// ninguém pediu.
//
// Env: EVOLUTION_URL, EVOLUTION_APIKEY, EVOLUTION_APIKEY_GLOBAL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

/** Candidatas, em ordem de probabilidade. Só assinatura — nada que anuncie a
 *  nossa presença para o contato. */
const ROTAS = [
  "chat/presenceSubscribe",
  "chat/subscribePresence",
  "chat/presence",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" });

  const URL_SB = Deno.env.get("SUPABASE_URL")!;
  const base = (Deno.env.get("EVOLUTION_URL") || "").replace(/\/+$/, "");
  const apikey = Deno.env.get("EVOLUTION_APIKEY_GLOBAL") || Deno.env.get("EVOLUTION_APIKEY") || "";
  if (!base || !apikey) return json({ ok: false, error: "Evolution não configurada" });

  try {
    const comoUsuario = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const { data: eu } = await comoUsuario.auth.getUser();
    if (!eu?.user) return json({ ok: false, error: "Não autenticado" });
    const { data: admin } = await comoUsuario.rpc("fn_is_admin");
    const { data: temModulo } = await comoUsuario.rpc("tem_modulo", { p_key: "atendimento" });
    if (!admin && !temModulo) return json({ ok: false, error: "Sem acesso ao atendimento" });

    const body = await req.json().catch(() => ({}));
    const conversaId = String(body.conversa_id || "");
    if (!conversaId) return json({ ok: false, error: "conversa_id é obrigatório" });

    const sb = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // O número sai da linha da conversa, nunca do navegador: aceitar número do
    // cliente HTTP seria aceitar assinar a presença de quem ele quisesse.
    const { data: conversa } = await sb
      .from("wa_conversas").select("instancia, telefone, jid").eq("id", conversaId).maybeSingle();
    if (!conversa) return json({ ok: false, error: "Conversa não encontrada" });

    const inst = encodeURIComponent(conversa.instancia);
    const numero = conversa.telefone;
    const jid = conversa.jid || `${numero}@s.whatsapp.net`;

    const tentativas: { rota: string; status: number; corpo: string }[] = [];
    let aceita: string | null = null;

    for (const rota of ROTAS) {
      // Duas formas de corpo entre versões: `number` puro e `jid` completo.
      for (const corpo of [{ number: numero }, { number: jid }]) {
        const r = await fetch(`${base}/${rota}/${inst}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey },
          body: JSON.stringify(corpo),
        });
        const txt = (await r.text()).slice(0, 200);
        tentativas.push({ rota, status: r.status, corpo: txt });
        if (r.ok) { aceita = rota; break; }
      }
      if (aceita) break;
    }

    // O resultado vira linha, sempre — inclusive o fracasso. É a diferença
    // entre "a presença não funciona" e "a presença não funciona PORQUE esta
    // build não tem a rota", e só a segunda dá pra agir em cima.
    await sb.from("wa_eventos").insert({
      instancia: conversa.instancia,
      evento: aceita ? "presenca.assinatura.ok" : "presenca.assinatura.sem-rota",
      corpo: { telefone: numero, aceita, tentativas },
    });

    return json({
      ok: true,
      assinou: !!aceita,
      rota: aceita,
      // 404 em todas quer dizer uma coisa só, e ela merece frase.
      diagnostico: aceita
        ? null
        : "Nenhuma rota de assinatura de presença respondeu. Esta versão da Evolution provavelmente não expõe "
          + "`presenceSubscribe` — sem ela o WhatsApp nunca envia 'digitando', e o indicador não tem como existir.",
      tentativas,
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
