// leads-planilha — lê a planilha da landing page e devolve as linhas cruas.
//
// Ela NÃO interpreta colunas: quem faz isso é src/lib/planilhaLeads.ts, no
// navegador, com teste. Aqui fica só o que só pode ser feito aqui: falar com o
// Google usando a chave da conta de serviço, que não pode viver no navegador.
//
// DOIS CAMINHOS, E ISSO NÃO É EXCESSO.
//
//   1. API do Sheets — devolve as abas pelo nome e lê a que se pede.
//   2. Export do Drive — devolve a PRIMEIRA aba em CSV.
//
// O caminho 2 existe porque Sheets e Drive são APIs SEPARADAS no Google Cloud,
// habilitadas separadamente. Este projeto usa o Drive há meses (as pastas de
// cliente), então o Drive está ligado; o Sheets pode nunca ter sido. Quando é
// esse o caso, a API do Sheets responde 403 — o MESMO código de "você não tem
// acesso ao arquivo" — e foi exatamente aí que eu errei o diagnóstico: mandei
// compartilhar a planilha com a conta de serviço, o Matheus compartilhou, e o
// erro continuou igual, porque nunca tinha sido sobre compartilhamento.
//
// Então: tenta o Sheets; se ele estiver desligado no projeto, cai pro Drive e
// segue funcionando. E o motivo real vem escrito, com a frase do Google junto.
//
// Env (secrets): GOOGLE_SA_JSON.

import { create, getNumericDate, type Header, type Payload } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

interface ContaServico { client_email: string; private_key: string }

function conta(): ContaServico {
  const raw = Deno.env.get("GOOGLE_SA_JSON");
  if (!raw) throw new Error("GOOGLE_SA_JSON não configurado");
  const sa = JSON.parse(raw);
  return { client_email: sa.client_email, private_key: String(sa.private_key).replace(/\\n/g, "\n") };
}

/** Um token por escopo — Sheets e Drive são permissões diferentes. */
async function token(sa: ContaServico, escopo: string): Promise<string> {
  const pem = sa.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const bin = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const chave = await crypto.subtle.importKey(
    "pkcs8", bin.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const header: Header = { alg: "RS256", typ: "JWT" };
  const payload: Payload = {
    iss: sa.client_email,
    scope: escopo,
    aud: "https://oauth2.googleapis.com/token",
    exp: getNumericDate(3600),
    iat: getNumericDate(0),
  };
  const assertion = await create(header, payload, chave);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!r.ok) throw new Error(`OAuth ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).access_token as string;
}

/** Nome de aba num range A1 vai entre aspas simples; as internas dobram. */
const aspasA1 = (nome: string) => `'${nome.replace(/'/g, "''")}'`;

interface Falha { status: number; motivo: string; frase: string; apiDesligada: boolean }

/**
 * O que o Google realmente disse.
 *
 * A frase do Google entra na resposta em vez de eu resumi-la: foi resumindo
 * ("não enxerga essa planilha") que eu escondi um "API não habilitada" atrás de
 * um problema de compartilhamento, e mandei consertar a coisa errada.
 */
function ler(erroBruto: string, status: number): Falha {
  let frase = erroBruto.slice(0, 300);
  let motivo = "";
  try {
    const j = JSON.parse(erroBruto);
    frase = String(j?.error?.message ?? frase).slice(0, 400);
    motivo = String(j?.error?.details?.[0]?.reason ?? j?.error?.status ?? "");
  } catch { /* nem sempre é JSON */ }
  const apiDesligada = motivo === "SERVICE_DISABLED"
    || /has not been used in project|is disabled|não está habilitada/i.test(frase);
  return { status, motivo, frase, apiDesligada };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" });

  let email = "(conta de serviço não lida)";
  try {
    const body = await req.json().catch(() => ({}));
    const planilha = String(body.planilha_id || "").trim();
    const abaPedida = String(body.aba || "").trim();
    if (!planilha) return json({ ok: false, error: "planilha_id é obrigatório" });

    const sa = conta();
    email = sa.client_email;

    // ───────────────── caminho 1: API do Sheets ─────────────────
    let falhaSheets: Falha | null = null;
    try {
      const acesso = await token(sa, "https://www.googleapis.com/auth/spreadsheets.readonly");
      const auth = { Authorization: `Bearer ${acesso}` };

      const rMeta = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(planilha)}`
        + "?fields=properties.title,sheets.properties.title",
        { headers: auth },
      );

      if (rMeta.ok) {
        const meta = await rMeta.json();
        const abas: string[] = (meta?.sheets ?? [])
          .map((s: { properties?: { title?: string } }) => s?.properties?.title)
          .filter((t: unknown): t is string => typeof t === "string" && t.length > 0);
        if (abas.length === 0) return json({ ok: false, error: "A planilha não tem nenhuma aba.", conta: email });

        let aba = abas[0];
        let aviso: string | null = null;
        if (abaPedida) {
          const achada = abas.find((a) => a.toLowerCase() === abaPedida.toLowerCase());
          if (achada) aba = achada;
          // Ler a primeira em vez de falhar: quem digitou o nome errado quer os
          // leads, não uma lição sobre nomes de aba.
          else aviso = `A aba "${abaPedida}" não existe. Li "${aba}". Abas: ${abas.join(", ")}.`;
        }

        const range = `${aspasA1(aba)}!A1:ZZ100000`;
        const rVal = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(planilha)}/values/${encodeURIComponent(range)}`
          + "?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE",
          { headers: auth },
        );
        if (rVal.ok) {
          const dados = await rVal.json();
          const linhas: string[][] = Array.isArray(dados?.values) ? dados.values : [];
          return json({
            ok: true, via: "sheets", titulo: meta?.properties?.title ?? null, aba, abas, conta: email,
            aviso: linhas.length === 0 ? (aviso ?? `A aba "${aba}" está vazia.`) : aviso,
            cabecalho: linhas.length > 0 ? linhas[0].map((c) => String(c ?? "")) : [],
            linhas: linhas.slice(1).map((l, i) => ({ linha: i + 2, celulas: l.map((c) => String(c ?? "")) })),
          });
        }
        falhaSheets = ler(await rVal.text(), rVal.status);
      } else {
        falhaSheets = ler(await rMeta.text(), rMeta.status);
      }
    } catch (e) {
      falhaSheets = { status: 0, motivo: "excecao", frase: String(e).slice(0, 300), apiDesligada: false };
    }

    // 404 é o único caso em que não adianta tentar de novo por outro caminho:
    // o arquivo não está lá.
    if (falhaSheets && falhaSheets.status === 404) {
      return json({
        ok: false, conta: email,
        error: `Planilha não encontrada. Confira o link. (Google: ${falhaSheets.frase})`,
      });
    }

    // ───────────────── caminho 2: export do Drive ─────────────────
    let falhaDrive: Falha | null = null;
    try {
      const acesso = await token(sa, "https://www.googleapis.com/auth/drive.readonly");
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(planilha)}/export?mimeType=text%2Fcsv`,
        { headers: { Authorization: `Bearer ${acesso}` } },
      );
      if (r.ok) {
        const csv = await r.text();
        return json({
          ok: true, via: "drive", conta: email, csv,
          // O export do Drive só entrega a PRIMEIRA aba. Se a pessoa pediu
          // outra, ela precisa saber que não foi essa que veio.
          aviso: [
            abaPedida ? `Li a primeira aba da planilha (o caminho alternativo não escolhe aba, e você pediu "${abaPedida}").` : null,
            falhaSheets?.apiDesligada
              ? `A API do Google Sheets está desligada no projeto da conta de serviço — por isso o caminho alternativo. Pra escolher aba, habilite-a. (Google: ${falhaSheets.frase})`
              : null,
          ].filter(Boolean).join(" ") || null,
        });
      }
      falhaDrive = ler(await r.text(), r.status);
    } catch (e) {
      falhaDrive = { status: 0, motivo: "excecao", frase: String(e).slice(0, 300), apiDesligada: false };
    }

    // ───────────────── os dois falharam: dizer o que cada um disse ─────────────────
    const partes: string[] = [];
    if (falhaSheets?.apiDesligada) partes.push("A API do Google Sheets está desligada no projeto da conta de serviço.");
    if (falhaDrive?.status === 403 || falhaDrive?.status === 404) {
      partes.push(`A conta de serviço não consegue abrir a planilha. Compartilhe com ${email} (leitor).`);
    }
    partes.push(`Sheets ${falhaSheets?.status ?? "?"}: ${falhaSheets?.frase ?? "-"}`);
    partes.push(`Drive ${falhaDrive?.status ?? "?"}: ${falhaDrive?.frase ?? "-"}`);

    return json({ ok: false, conta: email, error: partes.join(" · ").slice(0, 900) });
  } catch (e) {
    console.error("[leads-planilha]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e), conta: email });
  }
});
