// wa-webhook — a porta de ENTRADA das mensagens do WhatsApp.
//
// A Evolution API chama esta função a cada evento `messages.upsert` da
// instância. Aqui a mensagem vira linha em `wa_mensagens`, a conversa se
// atualiza sozinha (trigger) e a mídia vai pro Storage.
//
// POR QUE DIRETO NA EDGE FUNCTION, E NÃO PELO n8n: no AW-ECO o caminho é
// Evolution → n8n ("MARTINS PONTES - Captura de Mensagens") → Supabase.
// Funciona, mas põe um workflow visual no meio do caminho mais crítico do
// sistema: quando quebra, quebra em silêncio e o conserto é arrastar nó. Aqui
// a Evolution fala direto com o Postgres — menos peça, o código vive no
// repositório, e o erro aparece no log da função.
//
// RESPONDER RÁPIDO É REQUISITO, NÃO CAPRICHO. A Evolution reentrega quando não
// recebe 200 a tempo. Se a gente segurar a resposta esperando o download de um
// áudio de três minutos, ela manda de novo — e de novo. Então: grava a linha,
// responde, e baixa a mídia depois em segundo plano. O índice único em
// `id_whatsapp` cobre a reentrega que escapar.
//
// Env (secrets): WA_WEBHOOK_TOKEN, EVOLUTION_URL, EVOLUTION_APIKEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-wa-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

/** 55 + DDD + 9 dígitos. Mesma regra do fn_wa_canonico e do src/lib/phone.ts. */
function canonico(raw: string): string {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10) d = d.slice(0, 2) + "9" + d.slice(2);
  return d.length === 11 ? "55" + d : String(raw || "").replace(/\D/g, "");
}

/** O tipo sai da chave presente em `message`, não do `messageType`: aquele
 *  muda de nome entre versões da Evolution, a chave não. */
function tipoDe(m: Record<string, unknown>): string {
  if (!m) return "outro";
  if (m.conversation || m.extendedTextMessage) return "texto";
  if (m.audioMessage) return "audio";
  if (m.imageMessage) return "imagem";
  if (m.videoMessage) return "video";
  if (m.documentMessage || m.documentWithCaptionMessage) return "documento";
  if (m.stickerMessage) return "sticker";
  if (m.locationMessage || m.liveLocationMessage) return "localizacao";
  if (m.contactMessage || m.contactsArrayMessage) return "contato";
  return "outro";
}

/** Legenda de foto também é texto — é onde mora metade do que o cliente diz. */
function textoDe(m: Record<string, any>): string | null {
  if (!m) return null;
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    m.documentWithCaptionMessage?.message?.documentMessage?.caption ??
    null
  );
}

function midiaDe(m: Record<string, any>) {
  const n =
    m?.audioMessage ?? m?.imageMessage ?? m?.videoMessage ??
    m?.documentMessage ?? m?.documentWithCaptionMessage?.message?.documentMessage ??
    m?.stickerMessage;
  if (!n) return null;
  return {
    mime: n.mimetype ?? null,
    nome: n.fileName ?? null,
    bytes: Number(n.fileLength ?? 0) || null,
    duracao: Number(n.seconds ?? 0) || null,
  };
}

const EXT: Record<string, string> = {
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav",
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "application/pdf": "pdf",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  const token = Deno.env.get("WA_WEBHOOK_TOKEN");
  const enviado = new URL(req.url).searchParams.get("token") ?? req.headers.get("x-wa-token");
  if (!token || enviado !== token) return json({ ok: false, error: "token" }, 401);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let corpo: any = {};
  try { corpo = await req.json(); } catch { return json({ ok: true, ignorado: "corpo ilegivel" }); }

  const eventos = Array.isArray(corpo?.data) ? corpo.data : [corpo?.data];
  const instancia = corpo?.instance ?? corpo?.instanceName ?? "desconhecida";
  const evento = String(corpo?.event ?? "").toLowerCase();

  // ── PRESENÇA: online, digitando, gravando ──
  //
  // Vem noutro evento, com formato próprio. Nem todo contato manda: quem
  // esconde o status simplesmente não gera evento — e por isso a ausência
  // significa "não sei", nunca "está offline". A tela respeita isso.
  if (evento.startsWith("presence")) {
    const d = corpo?.data ?? {};
    const jidP: string = d.id ?? d.remoteJid ?? "";
    const bruta: string = String(
      d.presences?.[jidP]?.lastKnownPresence ??
      Object.values(d.presences ?? {})[0]?.lastKnownPresence ??
      d.presence ?? "",
    ).toLowerCase();
    const mapa: Record<string, string> = {
      available: "disponivel", unavailable: "indisponivel",
      composing: "digitando", recording: "gravando",
    };
    const presenca = mapa[bruta];
    const telP = canonico(String(jidP).replace(/@.*$/, ""));
    // Presença que não vira nada é anotada com o corpo cru. Nem toda instância
    // manda no mesmo formato, e sem ver o que chegou a investigação vira
    // adivinhação — foi assim que eu já errei um diagnóstico nesta integração.
    if (!presenca || !telP) {
      console.log("[wa-webhook] presenca sem leitura:", JSON.stringify(d).slice(0, 500));
    }
    if (presenca && telP) {
      const { error } = await sb.rpc("fn_wa_presenca", {
        p_instancia: instancia, p_telefone: telP, p_presenca: presenca,
      });
      if (error) console.error("[wa-webhook] presenca:", error.message);
    }
    return json({ ok: true, presenca: presenca ?? "ignorada" });
  }

  // ── LEITURA: enviada → entregue → lida ──
  //
  // "Ele não respondeu" e "ele não recebeu" se parecem na tela e são problemas
  // completamente diferentes. O status vem em `messages.update`, um evento
  // separado do que traz mensagem nova.
  if (evento === "messages.update" || evento === "messages.edit") {
    const lista = Array.isArray(corpo?.data) ? corpo.data : [corpo?.data];
    const mapa: Record<string, string> = {
      SERVER_ACK: "enviada", DELIVERY_ACK: "entregue", READ: "lida", PLAYED: "tocada",
    };
    let mexidas = 0;
    for (const u of lista) {
      const idWa: string | null = u?.key?.id ?? u?.keyId ?? null;
      const bruto = String(u?.update?.status ?? u?.status ?? "").toUpperCase();
      const status = mapa[bruto];
      if (!idWa || !status) continue;
      // A função no banco só deixa o status ANDAR PRA FRENTE: a Evolution
      // reentrega fora de ordem, e um "entregue" atrasado chegando depois do
      // "lida" faria a mensagem deslerse na cara de quem está olhando.
      const { error } = await sb.rpc("fn_wa_status_mensagem", {
        p_id_whatsapp: idWa, p_status: status,
      });
      if (error) console.error("[wa-webhook] status:", error.message);
      else mexidas++;
    }
    return json({ ok: true, status: mexidas });
  }

  // Conexão, chamada, etc. Ignorar com 200 — devolver erro faria a Evolution
  // reentregar pra sempre. Mas ANOTAR o nome: é a única forma de descobrir que
  // ela começou a mandar algo que a gente ainda não trata, e o silêncio aqui
  // seria mais um caso de "a tela não mostra e ninguém sabe por quê".
  if (evento && !evento.includes("messages")) {
    console.log("[wa-webhook] evento sem tratamento:", evento);
    return json({ ok: true, ignorado: evento });
  }

  const gravadas: string[] = [];

  for (const d of eventos) {
    if (!d?.key) continue;
    const jid: string = d.key.remoteJid ?? "";
    if (!jid || jid.endsWith("@g.us") || jid.startsWith("status@")) continue;  // grupo e status não são atendimento

    const fromMe = !!d.key.fromMe;
    const msg = d.message ?? {};
    const tipo = tipoDe(msg);
    const texto = textoDe(msg);
    const midia = midiaDe(msg);
    const idWa: string | null = d.key.id ?? null;
    const quando = d.messageTimestamp
      ? new Date(Number(d.messageTimestamp) * 1000).toISOString()
      : new Date().toISOString();

    const telefone = canonico(jid.replace(/@.*$/, ""));
    if (!telefone) continue;

    // O NOME NÃO ENTRA NESTE UPSERT, e essa é a correção de um bug que já
    // aconteceu: quando NÓS mandamos a mensagem, a Evolution devolve o evento
    // com `pushName` = o nome do NOSSO perfil. Escrevendo direto, toda conversa
    // iniciada por nós passava a se chamar "Portal Direito Aberto" — quatro
    // leads na lista com o nome do escritório e nenhum jeito de distingui-los.
    const { data: conv, error: eConv } = await sb
      .from("wa_conversas")
      .upsert(
        { instancia, telefone, jid },
        { onConflict: "instancia,telefone", ignoreDuplicates: false },
      )
      .select("id, nome_wa, fonte_id")
      .single();
    if (eConv || !conv) { console.error("[wa-webhook] conversa:", eConv?.message); continue; }

    // O nome só é preenchido quando VEIO DELE e a conversa ainda não tem um.
    // Não sobrescrever também protege o que a atendente digitou à mão no "+":
    // "Dona Maria (mãe do José)" diz mais que "Maria" do perfil, e quem
    // escreveu aquilo escreveu por um motivo.
    const nomeDele = !fromMe ? String(d.pushName ?? "").trim() : "";
    if (nomeDele && !conv.nome_wa) {
      await sb.from("wa_conversas").update({ nome_wa: nomeDele }).eq("id", conv.id);
    }

    // DE QUAL BASE ESSA PESSOA VEIO. Quem preencheu a landing e depois chamou
    // no WhatsApp é inbound E é da base — as duas coisas ao mesmo tempo, e a
    // segunda se perderia se ninguém procurasse o telefone na lista de leads.
    // A regra mora no banco (fn_wa_vincular_base) porque a wa-nova-conversa
    // chama a mesma: escrita duas vezes, uma ia ficar pra trás na primeira
    // mudança, e o sintoma seria uma etiqueta errada que ninguém confere.
    // Só na primeira vez: já vinculada, não há o que procurar.
    if (!conv.fonte_id) {
      const { error: eVinc } = await sb.rpc("fn_wa_vincular_base", { p_conversa: conv.id });
      if (eVinc) console.error("[wa-webhook] vincular base:", eVinc.message);
    }

    const { data: linha, error: eMsg } = await sb
      .from("wa_mensagens")
      .insert({
        conversa_id: conv.id,
        id_whatsapp: idWa,
        direcao: fromMe ? "saida" : "entrada",
        tipo,
        texto,
        midia_mime: midia?.mime ?? null,
        midia_nome: midia?.nome ?? null,
        midia_bytes: midia?.bytes ?? null,
        duracao: midia?.duracao ?? null,
        criada_em: quando,
        // Nossa mensagem nasce "enviada" — a Evolution aceitou. Os passos
        // seguintes chegam em `messages.update`. Recebida não tem status: o
        // que se acompanha é o caminho do que a gente manda.
        status: fromMe ? "enviada" : null,
        bruto: d,
      })
      .select("id")
      .single();

    // 23505 = reentrega batendo no índice único. Não é erro, é o desenho.
    if (eMsg) {
      if ((eMsg as { code?: string }).code !== "23505") console.error("[wa-webhook] msg:", eMsg.message);
      continue;
    }
    gravadas.push(linha.id);

    if (midia && tipo !== "texto") {
      const baixar = async () => {
        try {
          const base = (Deno.env.get("EVOLUTION_URL") ?? "").replace(/\/$/, "");
          const key = Deno.env.get("EVOLUTION_APIKEY");
          if (!base || !key) return;
          const r = await fetch(`${base}/chat/getBase64FromMediaMessage/${encodeURIComponent(instancia)}`, {
            method: "POST",
            headers: { apikey: key, "Content-Type": "application/json" },
            body: JSON.stringify({ message: { key: d.key }, convertToMp4: false }),
          });
          if (!r.ok) { console.error("[wa-webhook] midia", r.status, await r.text()); return; }
          const j = await r.json();
          const b64: string = j?.base64 ?? "";
          if (!b64) return;
          const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          const mime = j?.mimetype ?? midia.mime ?? "application/octet-stream";
          const ext = EXT[String(mime).split(";")[0]] ?? "bin";
          const caminho = `${conv.id}/${linha.id}.${ext}`;
          const up = await sb.storage.from("wa-midia").upload(caminho, bin, { contentType: mime, upsert: true });
          if (up.error) { console.error("[wa-webhook] storage:", up.error.message); return; }
          await sb.from("wa_mensagens")
            .update({ midia_path: caminho, midia_mime: mime, midia_bytes: bin.byteLength })
            .eq("id", linha.id);
        } catch (e) {
          console.error("[wa-webhook] midia falhou:", (e as Error).message);
        }
      };
      // @ts-ignore EdgeRuntime existe no Deploy; fora dele cai no await
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(baixar());
      else await baixar();
    }
  }

  return json({ ok: true, gravadas: gravadas.length });
});
