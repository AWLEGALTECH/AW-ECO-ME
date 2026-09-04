// wa-enviar — a porta de SAÍDA do atendimento.
//
// Texto, imagem, documento e áudio. A `wa-webhook` é a entrada; esta é o
// contrário, e as duas falam com a Evolution direto, sem n8n no meio. No AW-ECO
// o caminho de saída é front → webhook do n8n → Evolution, e é ali que mora o
// tipo de defeito mais chato que existe: quando o workflow quebra, ele quebra
// calado e o conserto é arrastar nó numa tela.
//
// TRÊS DECISÕES QUE VALE EXPLICAR:
//
// 1. O NÚMERO NÃO VEM DO NAVEGADOR. Chega o `conversa_id`; a instância e o
//    telefone saem da linha de `wa_conversas`. Aceitar o número do cliente
//    HTTP seria aceitar mandar mensagem pra quem ele quisesse.
//
// 2. A MÍDIA VAI POR URL ASSINADA, NÃO POR BASE64. O arquivo já subiu pro
//    bucket antes da chamada; aqui só se assina um link de uma hora e a
//    Evolution baixa. Base64 faria a gravação inteira atravessar esta função —
//    exatamente o caminho que estourou o AW-ECO.
//
// 3. GRAVA DEPOIS DO OK. A linha em `wa_mensagens` só nasce quando a Evolution
//    aceita. Gravar antes deixaria na tela uma mensagem que o cliente nunca
//    recebeu, e essa é pior que o erro: ninguém reenvia o que parece enviado.
//
// Env (secrets): EVOLUTION_URL, EVOLUTION_APIKEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// Sempre 200 com { ok }: `functions.invoke` esconde o corpo das respostas
// non-2xx, e aí o erro chega na tela como "Edge Function returned a non-2xx
// status code" — que não diz nada pra quem está tentando responder um cliente.
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

type Tipo = "texto" | "imagem" | "video" | "documento" | "audio";

/** Rota e corpo da Evolution v2 para cada tipo. */
function requisicao(tipo: Tipo, numero: string, texto: string | null, url: string | null, nome: string | null, mime: string | null) {
  if (tipo === "texto") {
    return { rota: "sendText", corpo: { number: numero, text: texto ?? "" } };
  }
  if (tipo === "audio") {
    // Rota própria: sendMedia mandaria como ARQUIVO de áudio (aquele card com
    // clipe), e não como mensagem de voz. Quem responde lead manda voz.
    return { rota: "sendWhatsAppAudio", corpo: { number: numero, audio: url } };
  }
  return {
    rota: "sendMedia",
    corpo: {
      number: numero,
      mediatype: tipo === "imagem" ? "image" : tipo === "video" ? "video" : "document",
      mimetype: mime ?? undefined,
      media: url,
      fileName: nome ?? undefined,
      // Legenda junto com a foto, como no WhatsApp — mandar duas mensagens
      // separadas descola o texto da imagem que ele explica.
      caption: texto || undefined,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" });

  const URL_SB = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const base = (Deno.env.get("EVOLUTION_URL") || "").replace(/\/+$/, "");
  const apikey = Deno.env.get("EVOLUTION_APIKEY") || "";

  if (!base || !apikey) {
    return json({ ok: false, error: "EVOLUTION_URL/EVOLUTION_APIKEY não configurados nos secrets" });
  }

  try {
    // ── quem está pedindo ──
    const auth = req.headers.get("Authorization") || "";
    const comoUsuario = createClient(URL_SB, ANON, { global: { headers: { Authorization: auth } } });
    const { data: eu } = await comoUsuario.auth.getUser();
    if (!eu?.user) return json({ ok: false, error: "Não autenticado" });

    const { data: admin } = await comoUsuario.rpc("fn_is_admin");
    const { data: temModulo } = await comoUsuario.rpc("tem_modulo", { p_key: "atendimento" });
    if (!admin && !temModulo) return json({ ok: false, error: "Sem acesso ao atendimento" });

    const body = await req.json().catch(() => ({}));
    const conversaId = String(body.conversa_id || "");
    const tipo = String(body.tipo || "texto") as Tipo;
    const texto = (body.texto as string | null)?.trim() || null;
    const midiaPath = (body.midia_path as string | null) || null;
    const midiaNome = (body.midia_nome as string | null) || null;
    const mime = (body.mime as string | null) || null;
    const duracao = Number(body.duracao) || null;

    if (!conversaId) return json({ ok: false, error: "conversa_id é obrigatório" });
    if (tipo === "texto" && !texto) return json({ ok: false, error: "Mensagem vazia" });
    if (tipo !== "texto" && !midiaPath) return json({ ok: false, error: "midia_path é obrigatório" });

    const sb = createClient(URL_SB, SERVICE);

    // ── pra quem, por qual número ──
    const { data: conversa, error: eConv } = await sb
      .from("wa_conversas").select("id, instancia, telefone").eq("id", conversaId).maybeSingle();
    if (eConv) return json({ ok: false, error: eConv.message });
    if (!conversa) return json({ ok: false, error: "Conversa não encontrada" });

    // ── link que a Evolution vai baixar ──
    let url: string | null = null;
    if (midiaPath) {
      const { data: assinada, error: eUrl } = await sb.storage
        .from("wa-midia").createSignedUrl(midiaPath, 3600);
      if (eUrl || !assinada?.signedUrl) {
        return json({ ok: false, error: `Não consegui assinar a mídia: ${eUrl?.message ?? "sem URL"}` });
      }
      url = assinada.signedUrl;
    }

    const { rota, corpo } = requisicao(tipo, conversa.telefone, texto, url, midiaNome, mime);
    const resp = await fetch(`${base}/message/${rota}/${encodeURIComponent(conversa.instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify(corpo),
    });

    const bruto = await resp.text();
    if (!resp.ok) {
      console.error(`[wa-enviar] ${rota} ${resp.status}: ${bruto.slice(0, 500)}`);
      return json({ ok: false, error: `Evolution ${resp.status}: ${bruto.slice(0, 200)}` });
    }
    const retorno = (() => { try { return JSON.parse(bruto); } catch { return {}; } })();

    // ── agora sim, vira linha ──
    const { error: eIns } = await sb.from("wa_mensagens").insert({
      conversa_id: conversaId,
      // O id do WhatsApp fecha o ciclo: a Evolution reenvia o `messages.upsert`
      // da própria mensagem que a gente mandou, e o índice único em
      // `id_whatsapp` faz esse eco virar no-op em vez de mensagem repetida.
      id_whatsapp: retorno?.key?.id ?? null,
      direcao: "saida",
      // Nasce "enviada": a Evolution acabou de aceitar. Sem isso a mensagem
      // ficava sem vistinho nenhum até o WhatsApp confirmar a entrega — e
      // "sem confirmação" na tela quer dizer "não saiu", que é o oposto.
      status: "enviada",
      tipo,
      texto,
      midia_path: midiaPath,
      midia_mime: mime,
      midia_nome: midiaNome,
      duracao,
      enviado_por: eu.user.id,
    });
    if (eIns) {
      // A mensagem FOI enviada — o cliente já recebeu. Falhar aqui é um
      // problema de registro, não de entrega, e dizer "erro ao enviar" faria
      // o atendente mandar de novo.
      console.error("[wa-enviar] enviou mas não gravou:", eIns.message);
      return json({ ok: true, aviso: "Mensagem enviada, mas não entrou no histórico." });
    }

    return json({ ok: true });
  } catch (e) {
    console.error("[wa-enviar]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
