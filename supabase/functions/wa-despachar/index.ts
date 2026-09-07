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

type Midia = { path: string; mime?: string | null; nome?: string | null; tipo?: Tipo; duracao?: number | null };

/** Os anexos da linha, aceitando as duas formas: `midias` (nova) e `midia_path` (antiga). */
function anexosDaLinha(a: Record<string, any>): Midia[] {
  const lista = Array.isArray(a.midias) ? (a.midias as Midia[]) : [];
  const bons = lista.filter((m) => m && typeof m.path === "string" && m.path);
  if (bons.length > 0) return bons;
  if (a.midia_path) {
    return [{ path: a.midia_path, mime: a.midia_mime, nome: a.midia_nome, tipo: a.tipo, duracao: a.duracao }];
  }
  return [];
}

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

      /* ── UMA MENSAGEM PODE TER VÁRIOS ANEXOS ──
         Sai um por vez, na ordem em que foram escolhidos, e o TEXTO ACOMPANHA O
         PRIMEIRO como legenda — igual ao WhatsApp. Repetir a legenda em cada um
         faria o cliente receber o mesmo parágrafo quatro vezes.

         DEPOIS DO PRIMEIRO ENTREGUE, ESTA LINHA NÃO VOLTA PRA FILA. Um erro no
         terceiro anexo devolveria a linha para `pendente`, e o minuto seguinte
         reenviaria os dois que o cliente já tinha recebido. Entre "faltou um
         arquivo" e "chegou tudo em dobro", o primeiro é o que dá pra
         consertar. */
      const anexos = anexosDaLinha(a);
      const partes: Array<{ tipo: Tipo; url: string | null; nome: string | null; mime: string | null; texto: string | null; midia: Midia | null }> =
        anexos.length === 0
          ? [{ tipo: "texto", url: null, nome: null, mime: null, texto: a.texto, midia: null }]
          : anexos.map((m, i) => ({
              tipo: (m.tipo ?? "documento") as Tipo,
              url: null, nome: m.nome ?? null, mime: m.mime ?? null,
              texto: i === 0 ? a.texto : null,
              midia: m,
            }));

      let primeiraMsg: string | null = null;
      let entregues = 0;
      let quebrou: string | null = null;

      for (const parte of partes) {
        if (parte.midia) {
          // Uma hora de validade: a Evolution baixa em segundos, e um link curto
          // é um link que não vaza depois.
          const { data: assinada, error: eUrl } = await sb.storage
            .from("wa-midia").createSignedUrl(parte.midia.path, 3600);
          if (eUrl || !assinada?.signedUrl) {
            quebrou = `Mídia sem URL (${parte.nome ?? parte.midia.path}): ${eUrl?.message ?? "arquivo sumiu do bucket"}`;
            break;
          }
          parte.url = assinada.signedUrl;
        }

        const { rota, corpo } = requisicao(
          parte.tipo, conversa.telefone, parte.texto, parte.url, parte.nome, parte.mime,
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
          quebrou = `${dica}: ${bruto.slice(0, 160)}`;
          break;
        }

        const retorno = (() => { try { return JSON.parse(bruto); } catch { return {}; } })();

        // ── agora sim, vira linha na conversa ──
        const { data: msg, error: eIns } = await sb.from("wa_mensagens").insert({
          conversa_id: a.conversa_id,
          id_whatsapp: retorno?.key?.id ?? null,
          direcao: "saida",
          status: "enviada",
          tipo: parte.tipo,
          texto: parte.texto,
          midia_path: parte.midia?.path ?? null,
          midia_mime: parte.mime,
          midia_nome: parte.nome,
          duracao: parte.midia?.duracao ?? null,
          enviado_por: a.criada_por,
          /* SAIU SOZINHA, e a tela precisa saber. Sem esta marca, uma conversa
             que sobe ao topo às três da manhã parece movimento de gente — e
             alguém pode responder de manhã a um "oi, tudo bem?" que ele mesmo
             agendou, achando que o cliente escreveu. */
          automatica: true,
        }).select("id").single();

        /* JÁ FOI. O cliente recebeu; falhar aqui é problema de registro, não de
           entrega. Marcar como falha faria o minuto seguinte reenviar — e o
           cliente receberia duas vezes por causa de um erro de gravação. */
        if (eIns) console.error("[wa-despachar] enviou mas não gravou:", eIns.message);
        else if (!primeiraMsg) primeiraMsg = msg.id;

        entregues++;
      }

      if (quebrou && entregues === 0) {
        await desfecho(false, null, quebrou);
        falhas++; continue;
      }

      await desfecho(true, primeiraMsg, null);

      if (quebrou) {
        /* Entregue pela metade. O status fica `enviada` para não reenviar o que
           já chegou, e o erro é gravado por cima para que a linha não conte
           essa história como se tivesse dado tudo certo. */
        console.error(`[wa-despachar] parcial ${a.id}: ${entregues}/${partes.length} — ${quebrou}`);
        await sb.from("wa_agendadas")
          .update({ erro: `Saiu ${entregues} de ${partes.length}: ${quebrou}` })
          .eq("id", a.id);
      }
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
