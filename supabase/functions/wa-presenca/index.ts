// wa-presenca — manter viva a presença do contato (digitando / online).
//
// O PROBLEMA, EM UMA FRASE: esta build da Evolution (2.3.7, a última estável)
// não expõe `presenceSubscribe` — oito grafias, todas 404. E sem assinatura o
// WhatsApp não conta quem está digitando.
//
// A presença chegou a fluir numa madrugada e secou catorze horas depois, logo
// depois de um `connection.update`. Isso explica o que estava acontecendo:
// existia uma subscrição IMPLÍCITA naquele socket do Baileys, e socket novo
// nasce sem ela. Não era uma coisa que funcionava e quebrou; era uma coisa que
// nunca esteve na nossa mão.
//
// O QUE COLOCA ELA NA NOSSA MÃO. `chat/sendPresence` existe aqui — foi o
// inventário de rotas que mostrou. Ele anuncia a NOSSA presença ao contato, e
// esse anúncio abre o canal de volta: o servidor passa a mandar a presença dele.
// Não é o que o nome da rota promete, é o que ela faz na prática.
//
// POR ISSO A FUNÇÃO VIROU BATIMENTO, e não um "assine uma vez". A tela chama
// aqui ao abrir a conversa e volta a chamar de minuto em minuto enquanto ela
// estiver aberta. Uma chamada só morreria junto com o próximo socket, e a gente
// voltaria a descobrir isso catorze horas depois.
//
// O CUSTO É REAL E É VISÍVEL PRA OUTRA PESSOA: o número do escritório aparece
// "online" no celular do lead enquanto alguém está com a conversa dele aberta.
// Não é mentira — o atendente está mesmo ali — mas é informação que passou a
// sair daqui pra fora, e por isso mora numa chave do banco
// (`app_config.wa_presenca_gatilho`), que se desliga numa linha:
//
//   off                não anuncia nada
//   teste:<telefone>   só naquele número
//   on                 em todas as conversas abertas
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

/** As grafias de assinatura que as v2 já usaram. Todas deram 404 nesta build;
 *  ficam porque uma atualização do servidor faz isso voltar a valer sozinho. */
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
    // cliente HTTP seria aceitar anunciar presença pra quem ele quisesse.
    const { data: conversa } = await sb
      .from("wa_conversas").select("instancia, telefone, jid").eq("id", conversaId).maybeSingle();
    if (!conversa) return json({ ok: false, error: "Conversa não encontrada" });

    const inst = encodeURIComponent(conversa.instancia);
    const numero = conversa.telefone;
    const jid = conversa.jid || `${numero}@s.whatsapp.net`;

    // A ÂNCORA QUE ENSINA O @lid. A presença chega identificada só pelo
    // LinkedID, que não é telefone, e a Evolution não devolve esse par quando
    // perguntada. O vínculo se aprende porque o WhatsApp só manda presença de
    // quem se está olhando — e é a tela que sabe quem é.
    await sb.from("wa_conversas")
      .update({ presenca_pedida_em: new Date().toISOString() })
      .eq("id", conversaId);

    // ─────────────────── o batimento que segura a presença ───────────────────
    //
    // Vem ANTES de qualquer atalho. É o que mantém o canal aberto, e um atalho
    // na frente dele significaria a presença secando de novo sem ninguém notar.
    const { data: cfg } = await sb
      .from("app_config").select("valor").eq("chave", "wa_presenca_gatilho").maybeSingle();
    const modo = String(cfg?.valor ?? "off").trim();
    const valeAqui = modo === "on" || (modo.startsWith("teste:") && modo.slice(6) === numero);

    let gatilho: { tentou: boolean; status?: number } = { tentou: false };
    if (valeAqui) {
      const r = await fetch(`${base}/chat/sendPresence/${inst}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey },
        // "available" é o mínimo honesto: diz que a conversa está aberta do
        // nosso lado. "composing" seria fingir que alguém está digitando quando
        // ninguém está — mentira contada para o cliente, não para a tela.
        body: JSON.stringify({ number: numero, presence: "available", delay: 0 }),
      });
      gatilho = { tentou: true, status: r.status };
    }

    // Já sabemos que esta instância não tem rota de assinatura? Então não gasta
    // as oito requisições de novo. Vale por 24h, pra uma atualização do servidor
    // ser descoberta sozinha, sem ninguém lembrar de voltar aqui.
    const desde = new Date(Date.now() - DIA_MS).toISOString();
    const { data: jaSabido } = await sb
      .from("wa_eventos").select("criado_em")
      .eq("instancia", conversa.instancia)
      .eq("evento", "presenca.assinatura.sem-rota")
      .gte("criado_em", desde)
      .limit(1);

    if (jaSabido && jaSabido.length > 0) {
      return json({ ok: true, assinou: false, jaSabido: true, gatilho, modo });
    }

    const tentativas: { rota: string; status: number }[] = [];
    let aceita: string | null = null;
    for (const rota of ROTAS) {
      for (const corpo of [{ number: numero }, { number: jid }]) {
        const r = await fetch(`${base}/${rota}/${inst}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey },
          body: JSON.stringify(corpo),
        });
        tentativas.push({ rota, status: r.status });
        if (r.ok) { aceita = rota; break; }
        // 404 é a rota que não existe; o corpo não muda isso.
        if (r.status === 404) break;
      }
      if (aceita) break;
    }

    await sb.from("wa_eventos").insert({
      instancia: conversa.instancia,
      evento: aceita ? "presenca.assinatura.ok" : "presenca.assinatura.sem-rota",
      corpo: { telefone: numero, aceita, tentativas, gatilho, modo },
    });

    return json({ ok: true, assinou: !!aceita, rota: aceita, gatilho, modo });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
