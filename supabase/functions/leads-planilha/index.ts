// leads-planilha — lê a planilha da landing page e devolve as linhas cruas.
//
// Ela NÃO interpreta nada: devolve cabeçalho e linhas como estão na aba. Quem
// entende as colunas é src/lib/planilhaLeads.ts, no navegador, com teste.
//
// POR QUE A INTERPRETAÇÃO FICA DO OUTRO LADO. O parser precisaria existir aqui
// (Deno) e lá (browser) pra a tela conseguir mostrar antes de gravar — e duas
// cópias da mesma regra é o jeito conhecido de elas discordarem seis meses
// depois, uma corrigida e a outra não. Aqui fica só o que só pode ser feito
// aqui: falar com o Google usando a chave da conta de serviço, que não pode
// viver no navegador.
//
// A CONTA DE SERVIÇO É A MESMA DO DRIVE (GOOGLE_SA_JSON). Se ela não enxergar a
// planilha, o erro devolve o e-mail dela — porque o conserto é compartilhar a
// planilha com esse endereço, e adivinhar qual é seria a primeira coisa que
// alguém ia precisar procurar.
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

async function token(sa: ContaServico): Promise<string> {
  const pem = sa.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const bin = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const chave = await crypto.subtle.importKey(
    "pkcs8", bin.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const header: Header = { alg: "RS256", typ: "JWT" };
  const payload: Payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" });

  let email = "(conta de serviço não lida)";
  try {
    const body = await req.json().catch(() => ({}));
    const planilha = String(body.planilha_id || "").trim();
    const aba = String(body.aba || "").trim();
    if (!planilha) return json({ ok: false, error: "planilha_id é obrigatório" });

    const sa = conta();
    email = sa.client_email;
    const acesso = await token(sa);

    // Sem aba especificada, a primeira. `values.get` com o nome da aba pega a
    // grade toda; sem nome, o A1 padrão é justamente a primeira aba.
    const alvo = aba ? `${encodeURIComponent(aba)}` : "A1:ZZ100000";
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(planilha)}/values/${alvo}`
      + "?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE";

    const r = await fetch(url, { headers: { Authorization: `Bearer ${acesso}` } });
    if (!r.ok) {
      const detalhe = (await r.text()).slice(0, 300);
      if (r.status === 403 || r.status === 404) {
        return json({
          ok: false,
          error: `A conta de serviço não enxerga essa planilha. Compartilhe com ${email} (leitor).`,
          conta: email,
        });
      }
      return json({ ok: false, error: `Sheets ${r.status}: ${detalhe}`, conta: email });
    }

    const dados = await r.json();
    const linhas: string[][] = Array.isArray(dados?.values) ? dados.values : [];
    if (linhas.length === 0) return json({ ok: true, cabecalho: [], linhas: [], conta: email });

    return json({
      ok: true,
      cabecalho: linhas[0].map((c) => String(c ?? "")),
      // A linha 1 é o cabeçalho, então a primeira de dados é a 2 da planilha —
      // e é esse número que volta, pra quem for conferir achar a linha certa
      // ao abrir o arquivo.
      linhas: linhas.slice(1).map((l, i) => ({ linha: i + 2, celulas: l.map((c) => String(c ?? "")) })),
      conta: email,
    });
  } catch (e) {
    console.error("[leads-planilha]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e), conta: email });
  }
});
