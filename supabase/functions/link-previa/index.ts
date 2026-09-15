// link-previa — o cartão que aparece embaixo do link, como no WhatsApp.
//
// Recebe uma URL, lê as etiquetas Open Graph da página e devolve título,
// descrição, imagem e nome do site. Guarda o resultado em `wa_link_previa`, e
// linha com erro também é resposta: link que não tem prévia não pode ser
// buscado de novo a cada rolagem da conversa.
//
// ════════════════════ O ENDEREÇO VEM DE FORA. TODO CUIDADO ═══════════════════
//
// Quem manda o link é o LEAD. Qualquer pessoa com o número do escritório
// consegue fazer este servidor buscar um endereço à escolha dela, e é assim que
// se faz um SSRF: mandar o servidor pedir `http://169.254.169.254/` (os
// segredos da máquina na AWS/GCP) ou `http://localhost:54321/` (o banco, que
// daqui está autenticado) e ler a resposta pela porta dos fundos, disfarçada de
// título de página.
//
// As travas, e nenhuma delas é opcional:
//
//   1. SÓ http e https. Nada de file://, gopher://, data:.
//   2. NADA DE ENDEREÇO INTERNO. Loopback, rede privada, link-local (o
//      169.254.169.254 dos metadados de nuvem) e os nomes que levam a eles
//      (localhost, *.internal, *.local) são recusados.
//   3. REDIRECIONAMENTO É CONFERIDO A CADA SALTO. Um site de fora pode
//      responder "vá para localhost"; seguir redirecionamento automaticamente
//      pularia a trava 2 inteira. Por isso `redirect: "manual"` e no máximo
//      três saltos, cada um passando pela mesma peneira.
//   4. TETO DE TEMPO E DE TAMANHO. 8 segundos e 2 MB: prévia é enfeite, e
//      enfeite não segura a fila nem come memória.
//   5. SÓ VOLTA O QUE FOI EXTRAÍDO. Título, descrição, imagem e site. O corpo
//      da resposta nunca sai daqui, e cada campo sai cortado.
//
// Env (secrets): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
// Mesmo arquivo que o navegador testa (link simbólico para src/lib): ler HTML
// de terceiro com expressão regular é a parte que erra, e cada modo de errar
// que aparece vira teste lá.
import { extrairPrevia, type PreviaDoLink } from "./previaOpenGraph.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

const TETO_MS = 8000;
/* 2 MB: o <head> do YouTube sozinho passa de 512 KB, e com o teto antigo a
   prévia dele saía vazia. Ainda é teto: página de 40 MB não entra na memória
   desta função por causa de um enfeite. */
const TETO_BYTES = 2 * 1024 * 1024;
const MAX_SALTOS = 3;
/* Uma semana. Prévia velha é melhor que prévia nenhuma, e site que muda de
   título não é urgência de ninguém aqui. */
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

/** Nome de máquina que nunca é de fora. */
const NOMES_INTERNOS = [
  "localhost", "ip6-localhost", "ip6-loopback",
  "metadata.google.internal", "metadata", "instance-data",
];

/** Faixas que não podem ser alcançadas a partir daqui. */
function ipInterno(host: string): boolean {
  // IPv6 entre colchetes, ou solto
  const semColchetes = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (semColchetes === "::1" || semColchetes === "::" || semColchetes.startsWith("fe80:")
      || semColchetes.startsWith("fc") || semColchetes.startsWith("fd")) return true;

  const m = semColchetes.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b, Number(m[3]), Number(m[4])].some((n) => n > 255)) return true; // não é IP válido
  if (a === 127 || a === 0 || a === 10) return true;                 // loopback, "este host", privada
  if (a === 169 && b === 254) return true;                           // link-local: metadados de nuvem
  if (a === 172 && b >= 16 && b <= 31) return true;                  // privada
  if (a === 192 && b === 168) return true;                           // privada
  if (a === 100 && b >= 64 && b <= 127) return true;                 // CGNAT
  if (a >= 224) return true;                                         // multicast e reservado
  return false;
}

/** Este endereço pode ser buscado? Devolve o motivo quando não. */
function recusa(u: URL): string | null {
  if (u.protocol !== "http:" && u.protocol !== "https:") return "Só abro endereço http ou https.";
  const host = u.hostname.toLowerCase();
  if (!host) return "Endereço sem servidor.";
  if (NOMES_INTERNOS.includes(host)) return "Endereço interno.";
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) return "Endereço interno.";
  if (ipInterno(host)) return "Endereço interno.";
  return null;
}

type Previa = PreviaDoLink;

/**
 * Busca a página, conferindo cada salto de redirecionamento.
 *
 * O `redirect: "manual"` é a trava que faz a peneira valer: com o padrão, um
 * site de fora responderia 302 para localhost e o Deno seguiria sozinho, sem
 * passar por `recusa` de novo.
 */
async function buscar(alvo: URL, sinal: AbortSignal): Promise<{ html: string; final: URL } | { erro: string }> {
  let atual = alvo;

  for (let salto = 0; salto <= MAX_SALTOS; salto++) {
    const motivo = recusa(atual);
    if (motivo) return { erro: motivo };

    const r = await fetch(atual.toString(), {
      redirect: "manual",
      signal: sinal,
      headers: {
        /* Um navegador de verdade no cabeçalho: muitos sites devolvem página
           vazia para quem não se identifica, e prévia vazia é o mesmo que prévia
           nenhuma. O bot fica declarado no fim, que é o honesto. */
        "User-Agent": "Mozilla/5.0 (compatible; AW-ECO/1.0; +previa-de-link)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });

    if (r.status >= 300 && r.status < 400) {
      const para = r.headers.get("location");
      if (!para) return { erro: "Redirecionamento sem destino." };
      try {
        atual = new URL(para, atual);
      } catch {
        return { erro: "Redirecionamento para endereço inválido." };
      }
      continue;
    }

    if (!r.ok) return { erro: `O site respondeu ${r.status}.` };

    const tipo = (r.headers.get("content-type") || "").toLowerCase();
    if (tipo && !tipo.includes("html")) {
      // PDF, imagem, zip: não tem etiqueta para ler, e não é erro.
      return { erro: "Esse endereço não é uma página." };
    }

    /* LER ATÉ O TETO, E PARAR. `r.text()` traria o arquivo inteiro, e há página
       de 40 MB no mundo. As etiquetas que interessam vivem no <head>.

       O texto é ACUMULADO e decodificado em fluxo, e o `</head>` é procurado no
       acumulado: procurando dentro de cada pedaço separado, um `</head>` que
       cai na emenda de dois pedaços não é encontrado, e a leitura seguia até o
       teto à toa. E decodificar pedaço a pedaço partiria caractere de dois
       bytes na emenda, que é como acento vira losango. */
    const leitor = r.body?.getReader();
    if (!leitor) return { erro: "O site respondeu vazio." };
    const decodificador = new TextDecoder("utf-8", { fatal: false });
    let html = "";
    let total = 0;
    while (total < TETO_BYTES) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.length;
      html += decodificador.decode(value, { stream: true });
      // O </head> já passou: o resto é corpo, e não tem etiqueta nenhuma.
      if (html.includes("</head>")) break;
    }
    html += decodificador.decode();
    try { await leitor.cancel(); } catch { /* já terminou */ }

    return { html, final: atual };
  }

  return { erro: "Redirecionamento demais." };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const bruto = String(body.url || "").trim();
    if (!bruto) return json({ ok: false, error: "url é obrigatória" });
    if (bruto.length > 2000) return json({ ok: false, error: "Endereço longo demais." });

    let alvo: URL;
    try { alvo = new URL(bruto); } catch { return json({ ok: false, error: "Endereço inválido." }); }

    const motivo = recusa(alvo);
    if (motivo) return json({ ok: true, previa: { titulo: null, descricao: null, imagem: null, site: null, erro: motivo } });

    const url = alvo.toString();

    // Já buscamos, e a resposta ainda vale? Inclusive a resposta "não tem prévia".
    const { data: guardada } = await sb
      .from("wa_link_previa").select("titulo, descricao, imagem, site, erro, buscada_em")
      .eq("url", url).maybeSingle();
    if (guardada && Date.now() - new Date(guardada.buscada_em).getTime() < VALIDADE_MS) {
      return json({ ok: true, previa: guardada, doCache: true });
    }

    const corte = AbortSignal.timeout(TETO_MS);
    let previa: Previa;
    try {
      const r = await buscar(alvo, corte);
      previa = "erro" in r
        ? { titulo: null, descricao: null, imagem: null, site: null, erro: r.erro }
        : extrairPrevia(r.html, r.final.toString(), (u) => {
            try { return !recusa(new URL(u)); } catch { return false; }
          });
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      previa = {
        titulo: null, descricao: null, imagem: null, site: null,
        erro: /abort|timeout/i.test(msg) ? "O site demorou demais." : "Não consegui abrir esse endereço.",
      };
    }

    await sb.from("wa_link_previa").upsert({ url, ...previa, buscada_em: new Date().toISOString() });

    return json({ ok: true, previa });
  } catch (e) {
    console.error("[link-previa]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
