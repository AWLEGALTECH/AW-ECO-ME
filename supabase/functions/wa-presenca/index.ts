// wa-presenca — pedir ao WhatsApp que nos conte quando o contato está digitando.
//
// POR QUE ISSO PRECISA EXISTIR. O evento `PRESENCE_UPDATE` está marcado no
// painel da Evolution e nunca chegou uma linha sequer, enquanto o
// `MESSAGES_UPSERT` chega normalmente. Não é webhook, não é token, não é a
// lista de eventos: é o protocolo.
//
// Presença no WhatsApp é ASSINADA POR CONTATO. O Baileys só recebe
// `presence.update` de um JID depois de chamar `presenceSubscribe` naquele JID.
// Sem a assinatura o servidor não manda nada, e a ausência se parece exatamente
// com "o evento está desmarcado" — que foi onde eu procurei primeiro, errado.
//
// O QUE JÁ SE SABE DESTE SERVIDOR: na primeira rodada, `presenceSubscribe`,
// `subscribePresence` e `presence` responderam 404 nas duas formas de corpo.
// A lista abaixo esgota as variações de nome que as v2 usaram, pra a conclusão
// ser "esta build não tem a rota" e não "eu não achei o nome dela".
//
// E ELA PARA DE BATER NA PORTA. Depois de uma rodada em que TUDO deu 404, a
// função não repete as chamadas por 24h para aquela instância — abrir conversa
// disparava oito requisições condenadas a cada clique. As 24h existem pra que um
// upgrade da Evolution seja descoberto sozinho, sem ninguém lembrar de voltar
// aqui.
//
// O que ela NÃO faz: mandar a NOSSA presença. `sendPresence` existe e em
// algumas builds assina de quebra, mas ele anuncia o escritório como "online"
// ou "digitando" no aparelho do cliente — efeito visível para outra pessoa, que
// ninguém pediu. Isso se decide com quem responde pelo escritório, não aqui.
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

/** Todas as grafias que as v2 já usaram. Só assinatura — nada que anuncie a
 *  nossa presença para o contato. */
const ROTAS = [
  "chat/presenceSubscribe",
  "chat/subscribePresence",
  "chat/presence",
  "chat/presence-subscribe",
  "chat/subscribe-presence",
  "chat/updatePresence",
  "chat/fetchPresence",
  "instance/presenceSubscribe",
];

const DIA_MS = 24 * 60 * 60 * 1000;

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

    // Já sabemos que esta instância não tem a rota? Então não gasta oito
    // requisições de novo. Vale por 24h, pra um upgrade ser descoberto sozinho.
    const desde = new Date(Date.now() - DIA_MS).toISOString();
    const { data: jaSabido } = await sb
      .from("wa_eventos").select("criado_em")
      .eq("instancia", conversa.instancia)
      .eq("evento", "presenca.assinatura.sem-rota")
      .gte("criado_em", desde)
      .limit(1);
    if (jaSabido && jaSabido.length > 0) {
      return json({
        ok: true, assinou: false, rota: null, jaSabido: true,
        diagnostico: "Esta instância já respondeu 404 em todas as rotas de assinatura nas últimas 24h.",
      });
    }

    const inst = encodeURIComponent(conversa.instancia);
    const numero = conversa.telefone;
    const jid = conversa.jid || `${numero}@s.whatsapp.net`;

    const tentativas: { rota: string; status: number; corpo: string }[] = [];
    let aceita: string | null = null;

    for (const rota of ROTAS) {
      // Duas formas de corpo entre versões: `number` puro e `jid` completo. Mas
      // só insiste na segunda quando a primeira NÃO foi 404 — 404 é a rota que
      // não existe, e o corpo não muda isso.
      for (const corpo of [{ number: numero }, { number: jid }]) {
        const r = await fetch(`${base}/${rota}/${inst}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey },
          body: JSON.stringify(corpo),
        });
        const txt = (await r.text()).slice(0, 200);
        tentativas.push({ rota, status: r.status, corpo: txt });
        if (r.ok) { aceita = rota; break; }
        if (r.status === 404) break;
      }
      if (aceita) break;
    }

    // O resultado vira linha, sempre — inclusive o fracasso. É a diferença entre
    // "a presença não funciona" e "a presença não funciona PORQUE esta build não
    // tem a rota", e só a segunda dá pra agir em cima.
    await sb.from("wa_eventos").insert({
      instancia: conversa.instancia,
      evento: aceita ? "presenca.assinatura.ok" : "presenca.assinatura.sem-rota",
      corpo: { telefone: numero, aceita, tentativas },
    });

    return json({
      ok: true,
      assinou: !!aceita,
      rota: aceita,
      diagnostico: aceita
        ? null
        : "Nenhuma das grafias conhecidas de assinatura de presença existe nesta Evolution (todas 404). "
          + "Sem `presenceSubscribe` o WhatsApp nunca envia 'digitando' nem 'online', e o indicador não tem "
          + "como existir — não é configuração, é ausência de recurso na versão instalada.",
      tentativas,
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
