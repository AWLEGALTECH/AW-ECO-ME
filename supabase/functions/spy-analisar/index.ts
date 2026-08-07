// spy-analisar (AW SPY — Fase 1)
//
// Recebe { cliente_id, arquivos: [{id, name, mimeType}] }.
// Baixa os extratos do Drive (via Service Account), manda pro Gemini com a
// metodologia AW SPY e grava: spy_analise (relatório + resumo) + spy_flag
// (flags estruturadas por eixo, com confiança e evidência).
//
// A IA fica SÓ na interpretação/redação. As inferências são probabilísticas:
// toda flag carrega confiança e evidência; nada é apresentado como fato provado.
//
// Secrets: GOOGLE_SA_JSON, GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { create, getNumericDate, type Header, type Payload } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

interface SA { client_email: string; private_key: string; token_uri?: string; }
function parseSA(): SA { return JSON.parse(Deno.env.get("GOOGLE_SA_JSON")!); }
async function importKey(pem: string): Promise<CryptoKey> {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}
async function getToken(sa: SA): Promise<string> {
  const key = await importKey(sa.private_key);
  const header: Header = { alg: "RS256", typ: "JWT" };
  const payload: Payload = {
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: sa.token_uri ?? "https://oauth2.googleapis.com/token", iat: getNumericDate(0), exp: getNumericDate(1800),
  };
  const assertion = await create(header, payload, key);
  const r = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  return (await r.json()).access_token;
}
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}
async function baixar(fileId: string, token: string): Promise<ArrayBuffer> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`download ${fileId}: ${r.status}`);
  return r.arrayBuffer();
}

const MODELO = "gemini-2.5-flash";

const METODOLOGIA = `Você é o motor de análise do AW SPY, uma central de inteligência de um escritório de advocacia do consumidor. Recebe um ou mais EXTRATOS BANCÁRIOS (PDF) de UM cliente e produz a análise individual (Fase 1).

Leia os extratos e extraia SOMENTE o que os dados sustentam. Tudo que for inferência (composição familiar, saúde, relacionamentos, profissão) é PROBABILÍSTICO: atribua confiança e cite a evidência. NUNCA apresente inferência como fato provado. Trabalhe com datas e valores reais dos extratos.

Detecte, quando houver evidência:
- Situação financeira: saldo negativo crônico, uso de cheque especial (e taxa), % da renda comprometida com crédito, superendividamento, sazonalidade do aperto, renda líquida REAL creditada.
- Credores e produtos: consignado (inclusive em cadeia entre bancos), empréstimo pessoal, rotativo de cartão, capitalização, previdência, seguro prestamista; concentração num mesmo credor.
- Relações de consumo: assinaturas digitais (com histórico de reajuste), assinaturas simultâneas/esquecidas, telecom duplicado, saltos em conta de utility (energia/água), escolas, condomínio, financiamento, seguros. Cite reajustes em % quando der.
- Cadeia de refinanciamento: empréstimo liberado e consumido no mesmo dia para quitar dívida anterior; contratos que quitam contratos.
- Cobranças recorrentes contestáveis: valor idêntico repetindo em datas suspeitas; liberação recebida e devolvida no mesmo valor (possível contratação não reconhecida).
- Perfil e rotina: composição do domicílio, dependentes, profissão/vínculos, geografia (bairros), meio de transporte, faixa de renda.
- Janela crítica: mês/semana do ano em que o cliente historicamente aperta e contrata crédito novo (para agir ANTES).

Responda SOMENTE com JSON válido nesta forma:
{
  "relatorio": "markdown com a análise narrativa, para leitura humana",
  "resumo": {
    "renda_liquida_estimada": "texto",
    "perfil": "texto",
    "composicao_familiar": "texto (com nível de confiança)",
    "janela_critica": "texto",
    "risco_geral": "baixo|medio|alto|critico"
  },
  "flags": [
    {
      "eixo": "financeira|credores|produtos|consumo|vulnerabilidade|perfil|temporal",
      "codigo": "CODIGO.CURTO (ex.: FIN.SUPERENDIVIDAMENTO, CRE.CONSIGNADO_CADEIA, CON.ASSINATURA_ESQUECIDA, VUL.CONTAGIO_ENDIVIDAMENTO, TMP.JANELA_CRITICA)",
      "label": "rótulo humano curto",
      "confianca": 0.0,
      "valor": { "campo": "valor estruturado relevante, ex. {\\"contratos\\": 32, \\"taxa_am\\": 0.08}" },
      "evidencia": "datas e valores concretos do extrato que sustentam esta flag"
    }
  ]
}
Não invente transações. Se os PDFs não forem extratos legíveis, retorne relatorio explicando e flags vazio. Não use travessão (—) no texto.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let analiseId: string | null = null;
  try {
    const body = await req.json().catch(() => ({} as any));
    const clienteId = body.cliente_id as string | undefined;
    const arquivos = (body.arquivos as Array<{ id: string; name: string; mimeType?: string }> | undefined) || [];
    const createdBy = (body.created_by as string | undefined) || null;
    if (!clienteId) return j({ error: "cliente_id obrigatorio" }, 400);
    if (!arquivos.length) return j({ error: "selecione ao menos um documento" }, 400);
    if (arquivos.length > 8) return j({ error: "máximo de 8 documentos por análise" }, 400);

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) return j({ error: "GEMINI_API_KEY nao configurado" }, 500);

    // 1. registra a análise (processando)
    const { data: novo, error: eIns } = await sb.from("spy_analise").insert({
      cliente_id: clienteId, status: "processando",
      arquivos: arquivos.map((a) => ({ id: a.id, name: a.name })),
      modelo: MODELO, created_by: createdBy,
    }).select("id").single();
    if (eIns) return j({ error: eIns.message }, 500);
    analiseId = novo.id;

    // 2. baixa os PDFs do Drive
    const sa = parseSA();
    const token = await getToken(sa);
    const parts: any[] = [{ text: METODOLOGIA }];
    let totalBytes = 0;
    for (const a of arquivos) {
      const buf = await baixar(a.id, token);
      totalBytes += buf.byteLength;
      if (totalBytes > 18 * 1024 * 1024) throw new Error("documentos somam mais de 18MB; selecione menos por vez");
      parts.push({ inlineData: { mimeType: a.mimeType || "application/pdf", data: toBase64(buf) } });
    }

    // 3. Gemini
    const gResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${geminiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 8192 },
      }),
    });
    if (!gResp.ok) throw new Error(`gemini ${gResp.status}: ${(await gResp.text()).slice(0, 300)}`);
    const gData = await gResp.json();
    const txt = gData?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    let parsed: any;
    try { parsed = JSON.parse(txt); } catch { parsed = { relatorio: txt, resumo: {}, flags: [] }; }

    const flags = Array.isArray(parsed.flags) ? parsed.flags : [];

    // 4. grava resultado
    await sb.from("spy_analise").update({
      status: "concluida",
      relatorio: parsed.relatorio || null,
      resumo: parsed.resumo || {},
    }).eq("id", analiseId);

    if (flags.length) {
      await sb.from("spy_flag").insert(flags.slice(0, 60).map((f: any) => ({
        analise_id: analiseId, cliente_id: clienteId,
        eixo: f.eixo || null, codigo: f.codigo || null, label: f.label || null,
        valor: f.valor && typeof f.valor === "object" ? f.valor : {},
        confianca: typeof f.confianca === "number" ? f.confianca : null,
        origem: "llm", evidencia: f.evidencia || null,
      })));
    }

    return j({ ok: true, analise_id: analiseId, flags: flags.length });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    if (analiseId) await sb.from("spy_analise").update({ status: "erro", erro: msg }).eq("id", analiseId);
    return j({ error: msg, analise_id: analiseId }, 500);
  }
});
