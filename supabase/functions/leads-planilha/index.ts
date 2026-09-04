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
// AS ABAS SÃO LISTADAS ANTES DE LER. Parece rodeio e não é: pedir direto uma
// aba pelo nome, quando o nome está errado, devolve um 400 de "range inválido"
// — e "range inválido" não diz à pessoa que o problema é o nome da aba, nem
// qual nome seria o certo. Planilha de respostas de formulário quase nunca se
// chama como a gente imagina ("Respostas ao formulário 1"), então errar aqui é
// o caso comum, não a exceção. Listando primeiro, a aba errada vira aviso com
// a lista de abas de verdade, e a leitura acontece assim mesmo na primeira.
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

/** Nome de aba dentro de um range A1 precisa de aspas simples, e as internas dobram. */
function aspasA1(nome: string): string {
  return `'${nome.replace(/'/g, "''")}'`;
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
    const acesso = await token(sa);
    const auth = { Authorization: `Bearer ${acesso}` };

    // ── 1. que abas existem ──
    const rMeta = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(planilha)}`
      + "?fields=properties.title,sheets.properties.title",
      { headers: auth },
    );
    if (!rMeta.ok) {
      const detalhe = (await rMeta.text()).slice(0, 300);
      if (rMeta.status === 403 || rMeta.status === 404) {
        return json({
          ok: false,
          error: `A conta de serviço não enxerga essa planilha. Compartilhe com ${email} (leitor).`,
          conta: email,
        });
      }
      return json({ ok: false, error: `Sheets ${rMeta.status}: ${detalhe}`, conta: email });
    }
    const meta = await rMeta.json();
    const abas: string[] = (meta?.sheets ?? [])
      .map((s: { properties?: { title?: string } }) => s?.properties?.title)
      .filter((t: unknown): t is string => typeof t === "string" && t.length > 0);

    if (abas.length === 0) {
      return json({ ok: false, error: "A planilha não tem nenhuma aba.", conta: email });
    }

    // ── 2. qual aba usar ──
    let aba = abas[0];
    let aviso: string | null = null;
    if (abaPedida) {
      const achada = abas.find((a) => a.toLowerCase() === abaPedida.toLowerCase());
      if (achada) {
        aba = achada;
      } else {
        // Ler a primeira em vez de falhar: quem digitou o nome da aba errado
        // quer os leads, não uma lição sobre nomes de aba. O aviso conta o que
        // aconteceu e mostra as opções reais.
        aviso = `A aba "${abaPedida}" não existe. Li "${aba}". Abas da planilha: ${abas.join(", ")}.`;
      }
    }

    // ── 3. ler ──
    const range = `${aspasA1(aba)}!A1:ZZ100000`;
    const rVal = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(planilha)}/values/${encodeURIComponent(range)}`
      + "?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE",
      { headers: auth },
    );
    if (!rVal.ok) {
      return json({
        ok: false,
        error: `Sheets ${rVal.status} ao ler "${aba}": ${(await rVal.text()).slice(0, 200)}`,
        conta: email, abas,
      });
    }

    const dados = await rVal.json();
    const linhas: string[][] = Array.isArray(dados?.values) ? dados.values : [];
    if (linhas.length === 0) {
      return json({
        ok: true, cabecalho: [], linhas: [], conta: email, abas, aba,
        aviso: aviso ?? `A aba "${aba}" está vazia.`,
      });
    }

    return json({
      ok: true,
      titulo: meta?.properties?.title ?? null,
      aba,
      abas,
      aviso,
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
