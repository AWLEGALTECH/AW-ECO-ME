// wa-despachar — solta as mensagens retidas quando chega a hora.
//
// Roda a cada minuto pelo pg_cron. É a única parte do sistema que fala com o
// cliente sem ninguém na frente da tela, e o código inteiro é escrito com isso
// em mente: de madrugada, no domingo, com o escritório fechado, não há quem
// perceba um erro na hora em que ele acontece.
//
// ─────────────────────── as decisões que sustentam isso ────────────────────
//
// 1. A FILA É TOMADA, NÃO LIDA. `fn_wa_agendadas_tomar` faz um UPDATE atômico
//    de `pendente` para `enviando` e devolve o que conseguiu mudar. Se dois
//    despachos se sobrepuserem — o cron atrasou e o seguinte entrou junto —, o
//    segundo não encontra nada. Ler a fila e depois enviar deixaria a janela
//    entre a leitura e o envio aberta, e mensagem repetida para cliente é pior
//    que mensagem atrasada.
//
// 2. GRAVA DEPOIS DO OK, como a wa-enviar. A linha em `wa_mensagens` só nasce
//    quando a Evolution aceita: uma mensagem na tela que o cliente nunca
//    recebeu é pior que o erro, porque ninguém reenvia o que parece enviado.
//
// 3. NUNCA DERRUBA A RODADA INTEIRA POR UMA LINHA. Cada mensagem tem seu
//    try/catch; uma que falha não pode segurar as outras dezenove.
//
// 4. VERIFICA A INSTÂNCIA ANTES. Número desconectado devolve erro da Evolution
//    de qualquer jeito, mas a mensagem de erro dela não diz "o WhatsApp caiu" —
//    e é isso que a pessoa precisa ler no dia seguinte.
//
// ⚠️ verify_jwt: esta função NÃO é chamada de fora — quem chama é o pg_cron,
// que manda o service_role no Authorization. Ela pode ficar com verify_jwt
// ligado, ao contrário da wa-webhook.
//
// Env (secrets): EVOLUTION_URL, EVOLUTION_APIKEY_GLOBAL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

type Tipo = "texto" | "imagem" | "video" | "documento" | "audio";

/** Rota e corpo da Evolution v2 para cada tipo. Espelho da wa-enviar. */
function requisicao(tipo: Tipo, numero: string, texto: string | null, url: string | null, nome: string | null, mime: string | null) {
  if (tipo === "texto") {
    return { rota: "sendText", corpo: { number: numero, text: texto ?? "" } };
  }
  if (tipo === "audio") {
    // Rota própria: sendMedia mandaria como ARQUIVO de áudio, não como
    // mensagem de voz. Quem fala com lead manda voz.
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
      caption: texto || undefined,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const URL_SB = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const base = (Deno.env.get("EVOLUTION_URL") || "").replace(/\/+$/, "");
  const apikey = Deno.env.get("EVOLUTION_APIKEY_GLOBAL") || Deno.env.get("EVOLUTION_APIKEY") || "";

  const sb = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });

  if (!base || !apikey) {
    console.error("[wa-despachar] EVOLUTION_URL/APIKEY ausentes");
    return json({ ok: false, error: "Evolution não configurada" });
  }

  // ── toma a fila ──
  const { data: fila, error: eFila } = await sb.rpc("fn_wa_agendadas_tomar", { p_limite: 20 });
  if (eFila) {
    console.error("[wa-despachar] tomar:", eFila.message);
    return json({ ok: false, error: eFila.message });
  }
  const linhas = (fila ?? []) as Array<Record<string, any>>;
  if (linhas.length === 0) return json({ ok: true, enviadas: 0, falhas: 0 });

  let enviadas = 0;
  let falhas = 0;

  for (const a of linhas) {
    const desfecho = (ok: boolean, mensagem: string | null, erro: string | null) =>
      sb.rpc("fn_wa_agendada_desfecho", {
        p_id: a.id, p_ok: ok, p_mensagem: mensagem, p_erro: erro,
      });

    try {
      // ── pra quem, por qual número ──
      const { data: conversa, error: eConv } = await sb
        .from("wa_conversas").select("id, instancia, telefone, nome_wa")
        .eq("id", a.conversa_id).maybeSingle();
      if (eConv || !conversa) {
        await desfecho(false, null, eConv?.message ?? "Conversa não encontrada");
        falhas++; continue;
      }

      // ── o link que a Evolution vai baixar ──
      let url: string | null = null;
      if (a.midia_path) {
        // Uma hora de validade: a Evolution baixa em segundos, e um link curto
        // é um link que não vaza depois.
        const { data: assinada, error: eUrl } = await sb.storage
          .from("wa-midia").createSignedUrl(a.midia_path, 3600);
        if (eUrl || !assinada?.signedUrl) {
          await desfecho(false, null, `Mídia sem URL: ${eUrl?.message ?? "arquivo sumiu do bucket"}`);
          falhas++; continue;
        }
        url = assinada.signedUrl;
      }

      const { rota, corpo } = requisicao(
        a.tipo as Tipo, conversa.telefone, a.texto, url, a.midia_nome, a.midia_mime,
      );
      const resp = await fetch(`${base}/message/${rota}/${encodeURIComponent(conversa.instancia)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey },
        body: JSON.stringify(corpo),
      });
      const bruto = await resp.text();

      if (!resp.ok) {
        /* A MENSAGEM DE ERRO PRECISA DIZER O QUE FAZER. A Evolution devolve
           "Connection Closed" quando a instância está desconectada, e quem lê
           isso na manhã seguinte não liga o texto ao WhatsApp fora do ar. */
        const dica = resp.status === 401
          ? "chave da Evolution recusada"
          : /connection|closed|not.*found/i.test(bruto)
            ? `instância ${conversa.instancia} parece desconectada`
            : `Evolution ${resp.status}`;
        console.error(`[wa-despachar] ${rota} ${resp.status}: ${bruto.slice(0, 300)}`);
        await desfecho(false, null, `${dica}: ${bruto.slice(0, 160)}`);
        falhas++; continue;
      }

      const retorno = (() => { try { return JSON.parse(bruto); } catch { return {}; } })();

      // ── agora sim, vira linha na conversa ──
      const { data: msg, error: eIns } = await sb.from("wa_mensagens").insert({
        conversa_id: a.conversa_id,
        id_whatsapp: retorno?.key?.id ?? null,
        direcao: "saida",
        status: "enviada",
        tipo: a.tipo,
        texto: a.texto,
        midia_path: a.midia_path,
        midia_mime: a.midia_mime,
        midia_nome: a.midia_nome,
        duracao: a.duracao,
        enviado_por: a.criada_por,
      }).select("id").single();

      if (eIns) {
        /* JÁ FOI. O cliente recebeu; falhar aqui é problema de registro, não de
           entrega. Marcar como falha faria o minuto seguinte reenviar — e o
           cliente receberia duas vezes por causa de um erro de gravação. */
        console.error("[wa-despachar] enviou mas não gravou:", eIns.message);
        await desfecho(true, null, null);
        enviadas++; continue;
      }

      await desfecho(true, msg.id, null);
      enviadas++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[wa-despachar] linha", a.id, msg);
      await desfecho(false, null, msg);
      falhas++;
    }
  }

  console.log(`[wa-despachar] enviadas=${enviadas} falhas=${falhas}`);
  return json({ ok: true, enviadas, falhas });
});
