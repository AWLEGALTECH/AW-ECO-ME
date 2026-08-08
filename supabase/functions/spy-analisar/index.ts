// spy-analisar (AW SPY — análise em segundo plano) — motor: OpenAI
//
// Passada única (cabe no tempo da função serverless): baixa os extratos do
// Drive e a IA lê os PDFs e devolve, de uma vez, o relatório + resumo + flags
// por eixo + as transações-CHAVE (operações de crédito, cobranças recorrentes,
// valores relevantes — não a lista inteira, que via LLM estoura o tempo).
// A extração determinística completa (parser por banco) é o próximo passo.
//
// Roda via EdgeRuntime.waitUntil; retorna 202 na hora. Progresso em
// spy_analise.progresso (o front faz polling).
// Secrets: GOOGLE_SA_JSON, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { create, getNumericDate, type Header, type Payload } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const MODELO = "gpt-4o-mini";
const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

// ── Google SA (download do Drive) ────────────────────────────────────────────
interface SA { client_email: string; private_key: string; token_uri?: string; }
async function importKey(pem: string): Promise<CryptoKey> {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}
async function getToken(): Promise<string> {
  const sa: SA = JSON.parse(Deno.env.get("GOOGLE_SA_JSON")!);
  const key = await importKey(sa.private_key);
  const assertion = await create({ alg: "RS256", typ: "JWT" } as Header, {
    iss: sa.client_email, scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: sa.token_uri ?? "https://oauth2.googleapis.com/token", iat: getNumericDate(0), exp: getNumericDate(1800),
  } as Payload, key);
  const r = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!r.ok) throw new Error(`token ${r.status}`);
  return (await r.json()).access_token;
}
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf); let bin = ""; const c = 0x8000;
  for (let i = 0; i < bytes.length; i += c) bin += String.fromCharCode(...bytes.subarray(i, i + c));
  return btoa(bin);
}
async function baixar(fileId: string, token: string): Promise<ArrayBuffer> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`download ${fileId}: ${r.status}`);
  return r.arrayBuffer();
}

// ── OpenAI (Responses API — aceita PDF via input_file) ───────────────────────
const SCHEMA = {
  type: "json_schema", name: "analise_spy", strict: true,
  schema: {
    type: "object", additionalProperties: false,
    required: ["relatorio", "risco_geral", "flags", "transacoes_chave"],
    properties: {
      relatorio: { type: "string" },
      risco_geral: { type: "string", enum: ["baixo", "medio", "alto", "critico"] },
      flags: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          required: ["eixo", "codigo", "label", "confianca", "evidencia"],
          properties: {
            eixo: { type: "string", enum: ["financeira", "credores", "produtos", "consumo", "vulnerabilidade", "perfil", "temporal"] },
            codigo: { type: "string" }, label: { type: "string" },
            confianca: { type: "number" }, evidencia: { type: "string" },
          },
        },
      },
      transacoes_chave: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          required: ["data", "descricao", "valor", "sinal", "saldo"],
          properties: {
            data: { type: "string" }, descricao: { type: "string" },
            valor: { type: "number" }, sinal: { type: "integer", enum: [1, -1] },
            saldo: { type: ["number", "null"] },
          },
        },
      },
    },
  },
};

async function openai(content: any[], maxTokens: number): Promise<string> {
  const key = Deno.env.get("OPENAI_API_KEY");
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODELO, input: [{ role: "user", content }], max_output_tokens: maxTokens, temperature: 0, text: { format: SCHEMA } }),
  });
  if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 220)}`);
  const d = await r.json();
  let txt = d.output_text;
  if (!txt && Array.isArray(d.output)) {
    for (const o of d.output) for (const c of (o.content || [])) if (typeof c.text === "string") { txt = c.text; break; }
  }
  return txt || "{}";
}
function parseJson(s: string): any { try { return JSON.parse(String(s).replace(/^```json\s*|```$/g, "").trim()); } catch { return null; } }
function normalizeDate(v: any): string | null {
  const s = String(v || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;     // DD/MM/AAAA
  m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);     if (m) return `${m[1]}-${m[2]}-${m[3]}`;     // AAAA/MM/DD
  m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);       if (m) return `${m[3]}-${m[2]}-${m[1]}`;     // DD-MM-AAAA
  return null;
}

const PROMPT = `Você é o motor do AW SPY, central de inteligência de um escritório de advocacia do consumidor. Recebe UM extrato bancário (PDF) de um cliente. Sua saída principal é o "relatorio": um DOSSIÊ PROFUNDO e HUMANO sobre essa pessoa, escrito de forma corrida e específica (não use tópicos rígidos, não seja robótico).

No relatorio, conte a história dessa pessoa a partir do dinheiro dela, cobrindo com riqueza (sempre que os dados sustentarem):
- Quem é: profissão/ocupação provável e de onde vem a renda (nome da fonte pagadora), faixa de renda real, faixa etária provável, cidade/bairro onde vive e trabalha.
- Família e núcleo: quem transfere/recebe com recorrência (cite os nomes das contrapartes de PIX/TED e o vínculo provável — cônjuge, filho, pai/mãe), quem parece depender dela, indícios de rateio de casa.
- Hábitos e vida: onde compra e abastece, streamings e assinaturas que mantém CITANDO OS SERVIÇOS PELO NOME (Netflix, Spotify, Amazon, etc.) e se há sinais de assinatura esquecida/duplicada; saúde (farmácia, plano, mensalidade de clínica) se aparecer; lazer, transporte, rotina.
- Vida financeira: como gasta, dívidas e crédito (empréstimos, consignado, cheque especial, cartão), comportamento de endividamento e a época do ano em que ela aperta e recontrata crédito.
- Gancho jurídico: onde há oportunidade de defesa do consumidor (cobranças abusivas, reajustes, endividamento) para o escritório ajudar.

Regras: use SOMENTE o que os dados sustentam; toda inferência é PROBABILÍSTICA — sinalize com "provavelmente", "há indícios de", etc.; cite datas e valores reais como evidência; NÃO invente; não use travessão.

Além do relatorio, devolva: risco_geral; flags (uma por achado concreto, com eixo, codigo curto, confianca 0..1 e evidencia com datas/valores) para uso interno estruturado; e transacoes_chave (ATÉ 25 transações mais relevantes: crédito, cobranças recorrentes, valores altos — NÃO a lista inteira). Datas em AAAA-MM-DD. sinal: 1 crédito, -1 débito. valor sempre positivo.`;

async function setProg(analiseId: string, p: { etapa: string; pct: number; detalhe?: string }) {
  await sb().from("spy_analise").update({ progresso: p }).eq("id", analiseId);
}

const ORDEM_RISCO: Record<string, number> = { baixo: 1, medio: 2, alto: 3, critico: 4 };

async function pipeline(analiseId: string, clienteId: string, arquivos: Array<{ id: string; name: string; mimeType?: string }>) {
  const s = sb();
  try {
    await setProg(analiseId, { etapa: "baixando", pct: 12, detalhe: "Baixando extratos do Drive" });
    const token = await getToken();
    const baixados = await Promise.all(arquivos.map(async (a) => ({ name: a.name, mime: a.mimeType || "application/pdf", buf: await baixar(a.id, token) })));

    // Um PDF por chamada (juntos estouram a janela de contexto do modelo).
    const n = baixados.length; let done = 0;
    await setProg(analiseId, { etapa: "analisando", pct: 20, detalhe: `Analisando extratos (0/${n})` });
    const perFile = await Promise.all(baixados.map(async (f) => {
      let parsed: any = null;
      try {
        const content = [
          { type: "input_text", text: PROMPT },
          { type: "input_file", filename: f.name, file_data: `data:${f.mime};base64,${toBase64(f.buf)}` },
        ];
        parsed = parseJson(await openai(content, 6000));
      } catch (_e) { parsed = null; }
      done++;
      await setProg(analiseId, { etapa: "analisando", pct: 20 + Math.round((done / n) * 65), detalhe: `Analisando extratos (${done}/${n}) · ${f.name}` });
      return { name: f.name, parsed };
    }));

    // Junta os resultados por ano.
    const oks = perFile.filter((p) => p.parsed);
    const relatorio = oks.length
      ? oks.map((p) => (n > 1 ? `## ${p.name}\n` : "") + (p.parsed.relatorio || "")).join("\n\n")
      : null;
    let maxR = 0; let riscoLabel = "";
    for (const p of oks) { const ri = ORDEM_RISCO[p.parsed.risco_geral] || 0; if (ri > maxR) { maxR = ri; riscoLabel = p.parsed.risco_geral; } }
    const resumo = riscoLabel ? { risco_geral: riscoLabel } : {};
    const flags = oks.flatMap((p) => (Array.isArray(p.parsed.flags) ? p.parsed.flags : [])).slice(0, 60);
    const txs = oks.flatMap((p) => (Array.isArray(p.parsed.transacoes_chave) ? p.parsed.transacoes_chave : [])).slice(0, 120);

    await setProg(analiseId, { etapa: "gravando", pct: 92, detalhe: "Gravando resultado" });
    await s.from("spy_analise").update({
      status: "concluida", relatorio, resumo,
      n_transacoes: txs.length, progresso: { etapa: "concluida", pct: 100, detalhe: `${txs.length} transações-chave · ${flags.length} flags` },
    }).eq("id", analiseId);

    if (txs.length) {
      const rows = txs.slice(0, 80).map((t: any) => ({
        analise_id: analiseId, cliente_id: clienteId,
        data: normalizeDate(t.data),
        valor: typeof t.valor === "number" ? Math.abs(t.valor) : null,
        sinal: t.sinal === 1 || t.sinal === -1 ? t.sinal : null,
        saldo: typeof t.saldo === "number" ? t.saldo : null, descricao: t.descricao || null,
      }));
      const { error: eTx } = await s.from("spy_transacao").insert(rows);
      if (eTx) { for (const row of rows) { await s.from("spy_transacao").insert(row); } }
    }
    if (flags.length) {
      await s.from("spy_flag").insert(flags.slice(0, 60).map((f: any) => ({
        analise_id: analiseId, cliente_id: clienteId, eixo: f.eixo || null, codigo: f.codigo || null, label: f.label || null,
        valor: f.valor && typeof f.valor === "object" ? f.valor : {}, confianca: typeof f.confianca === "number" ? f.confianca : null,
        origem: "llm", evidencia: f.evidencia || null,
      })));
    }
  } catch (e) {
    await sb().from("spy_analise").update({ status: "erro", erro: String((e as Error)?.message || e), progresso: { etapa: "erro", pct: 100 } }).eq("id", analiseId);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({} as any));
    const clienteId = body.cliente_id as string | undefined;
    const arquivos = (body.arquivos as Array<{ id: string; name: string; mimeType?: string }> | undefined) || [];
    if (!clienteId) return j({ error: "cliente_id obrigatorio" }, 400);
    if (!arquivos.length) return j({ error: "selecione ao menos um documento" }, 400);
    if (arquivos.length > 8) return j({ error: "máximo de 8 documentos por análise" }, 400);
    if (!Deno.env.get("OPENAI_API_KEY")) return j({ error: "OPENAI_API_KEY nao configurado" }, 500);

    const { data: novo, error } = await sb().from("spy_analise").insert({
      cliente_id: clienteId, status: "processando", arquivos: arquivos.map((a) => ({ id: a.id, name: a.name })),
      modelo: MODELO, created_by: (body.created_by as string) || null, progresso: { etapa: "fila", pct: 4, detalhe: "Na fila" },
    }).select("id").single();
    if (error) return j({ error: error.message }, 500);

    const task = pipeline(novo.id, clienteId, arquivos);
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(task);
    else await task;

    return j({ ok: true, analise_id: novo.id, background: true }, 202);
  } catch (e) {
    return j({ error: String((e as Error)?.message || e) }, 500);
  }
});
