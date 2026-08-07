// spy-analisar (AW SPY — pipeline real, em segundo plano)
//
// Fluxo (roda via EdgeRuntime.waitUntil; retorna 202 na hora):
//   1) baixa os extratos do Drive (Service Account)
//   2) EXTRAÇÃO (IA): Gemini lê cada PDF e devolve as transações estruturadas
//      (data, valor, sinal — infere pela variação de saldo quando o banco não
//      marca —, saldo, descrição, método). Grava em spy_transacao.
//   3) AGREGAÇÃO (código determinístico): totais por ano, recorrências, operações
//      de crédito, contrapartes, proxy de renda, dias negativos.
//   4) INTERPRETAÇÃO (IA): Gemini recebe a AGREGAÇÃO (não o PDF) e devolve
//      relatório + flags por eixo (com confiança e evidência).
//
// Progresso escrito em spy_analise.progresso a cada etapa (o front faz polling).
// Secrets: GOOGLE_SA_JSON, GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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

const MODELO = "gemini-2.5-flash";
const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

// ── Google SA ────────────────────────────────────────────────────────────────
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

// ── Gemini ───────────────────────────────────────────────────────────────────
async function gemini(parts: any[], maxTokens: number): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: maxTokens } }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return d?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
}
function parseJson(s: string): any { try { return JSON.parse(s.replace(/^```json\s*|```$/g, "").trim()); } catch { return null; } }

const PROMPT_EXTRACAO = `Extraia TODAS as transações deste extrato bancário (PDF). Para cada transação:
- data: "AAAA-MM-DD"
- valor: número POSITIVO
- sinal: 1 para crédito, -1 para débito. Se o extrato não marcar claramente, INFIRA pela variação do saldo entre linhas.
- saldo: saldo após a transação (pode ser negativo)
- descricao: texto da transação (mantenha a contraparte)
- metodo: pix|ted|doc|boleto|cartao|debito|saque|deposito|tarifa|salario|outro
Responda SOMENTE JSON: {"banco":"nome","transacoes":[{...}]}. Não invente transações; não use travessão.`;

const PROMPT_INTERP = `Você é o motor de interpretação do AW SPY (advocacia do consumidor). Recebe a AGREGAÇÃO determinística das transações de UM cliente (não o extrato bruto) e produz a análise.
Use as recorrências, operações de crédito, totais por ano e proxy de renda. Toda inferência (família, saúde, profissão) é PROBABILÍSTICA: dê confiança e cite evidência (datas/valores da agregação). Nunca apresente inferência como fato provado.
Responda SOMENTE JSON:
{"relatorio":"markdown","resumo":{"renda_liquida_estimada":"","perfil":"","composicao_familiar":"","janela_critica":"","risco_geral":"baixo|medio|alto|critico"},
"flags":[{"eixo":"financeira|credores|produtos|consumo|vulnerabilidade|perfil|temporal","codigo":"EX: FIN.SUPERENDIVIDAMENTO","label":"","confianca":0.0,"valor":{},"evidencia":""}]}
Não use travessão (—).`;

// ── Agregação determinística ─────────────────────────────────────────────────
function norm(s: string): string {
  return (s || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[0-9]/g, " ").replace(/[^A-Z ]/g, " ").replace(/\b(LTDA|ME|EPP|SA|CIA|BR|BRASIL)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}
function agregar(tx: any[]): any {
  const porAno: Record<string, any> = {};
  const rec: Record<string, { descricao: string; valor: number; datas: string[] }> = {};
  const contra: Record<string, { n: number; soma: number }> = {};
  const credKW = /EMPREST|CREDITO|FINANC|CONSIGNAD|ANTECIP|REFINANC|SAQUE CART|CDC|CAPITAL/i;
  const creditoOps: any[] = [];
  const creditosMes: Record<string, number> = {};
  let saldoMin = Infinity; const diasNeg = new Set<string>();

  for (const t of tx) {
    const ano = (t.data || "").slice(0, 4) || "?";
    const ym = (t.data || "").slice(0, 7);
    porAno[ano] ||= { creditos: 0, debitos: 0, saldo_fim: null };
    if (t.sinal > 0) porAno[ano].creditos += Number(t.valor) || 0; else porAno[ano].debitos += Number(t.valor) || 0;
    if (t.saldo != null) porAno[ano].saldo_fim = t.saldo;
    if (typeof t.saldo === "number") { if (t.saldo < saldoMin) saldoMin = t.saldo; if (t.saldo < 0 && t.data) diasNeg.add(t.data); }
    if (t.sinal > 0) creditosMes[ym] = (creditosMes[ym] || 0) + (Number(t.valor) || 0);

    const nd = norm(t.descricao);
    if (nd) { contra[nd] ||= { n: 0, soma: 0 }; contra[nd].n++; contra[nd].soma += Number(t.valor) || 0; }
    const rk = nd + "|" + (Number(t.valor) || 0).toFixed(2);
    if (nd) { rec[rk] ||= { descricao: t.descricao, valor: Number(t.valor) || 0, datas: [] }; rec[rk].datas.push(t.data); }
    if (credKW.test(t.descricao || "")) creditoOps.push({ data: t.data, valor: t.valor, sinal: t.sinal, descricao: t.descricao });
  }
  const recorrencias = Object.values(rec).filter((r) => r.datas.length >= 3)
    .map((r) => ({ descricao: r.descricao, valor: r.valor, ocorrencias: r.datas.length, primeira: r.datas.sort()[0], ultima: r.datas.sort().slice(-1)[0] }))
    .sort((a, b) => b.ocorrencias - a.ocorrencias).slice(0, 40);
  const contrapartes = Object.entries(contra).map(([d, v]) => ({ descricao: d, ...v })).sort((a, b) => b.n - a.n).slice(0, 30);
  const mensal = Object.values(creditosMes).sort((a, b) => a - b);
  const rendaMediana = mensal.length ? mensal[Math.floor(mensal.length / 2)] : null;

  return {
    total_transacoes: tx.length, por_ano: porAno, saldo_minimo: saldoMin === Infinity ? null : saldoMin,
    dias_negativos: diasNeg.size, proxy_renda_mensal: rendaMediana,
    recorrencias, operacoes_credito: creditoOps.slice(0, 60), contrapartes_frequentes: contrapartes,
  };
}

async function setProg(analiseId: string, p: { etapa: string; pct: number; detalhe?: string }) {
  await sb().from("spy_analise").update({ progresso: p }).eq("id", analiseId);
}

// ── Pipeline ─────────────────────────────────────────────────────────────────
async function pipeline(analiseId: string, clienteId: string, arquivos: Array<{ id: string; name: string; mimeType?: string }>) {
  const s = sb();
  try {
    await setProg(analiseId, { etapa: "baixando", pct: 8, detalhe: "Baixando extratos do Drive" });
    const token = await getToken();
    const baixados = await Promise.all(arquivos.map(async (a) => ({ name: a.name, mime: a.mimeType || "application/pdf", buf: await baixar(a.id, token) })));

    // EXTRAÇÃO (IA) por PDF, em paralelo, com progresso incremental.
    let done = 0; const n = baixados.length;
    await setProg(analiseId, { etapa: "extraindo", pct: 20, detalhe: `Extraindo transações (0/${n})` });
    const perFile = await Promise.all(baixados.map(async (f) => {
      let out: any = null;
      try {
        const txt = await gemini([{ text: PROMPT_EXTRACAO }, { inlineData: { mimeType: f.mime, data: toBase64(f.buf) } }], 32768);
        out = parseJson(txt);
      } catch (_e) { out = null; }
      done++;
      await setProg(analiseId, { etapa: "extraindo", pct: 20 + Math.round((done / n) * 40), detalhe: `Extraindo transações (${done}/${n}) · ${f.name}` });
      const trans = Array.isArray(out?.transacoes) ? out.transacoes : [];
      return { banco: out?.banco || null, trans };
    }));

    const banco = perFile.find((p) => p.banco)?.banco || null;
    const todas = perFile.flatMap((p) => p.trans);

    // grava transações (em lotes)
    if (todas.length) {
      const rows = todas.map((t: any) => ({
        analise_id: analiseId, cliente_id: clienteId, data: t.data || null,
        valor: typeof t.valor === "number" ? Math.abs(t.valor) : null,
        sinal: t.sinal === 1 || t.sinal === -1 ? t.sinal : null, saldo: typeof t.saldo === "number" ? t.saldo : null,
        descricao: t.descricao || null, metodo: t.metodo || null, banco,
      }));
      for (let i = 0; i < rows.length; i += 500) await s.from("spy_transacao").insert(rows.slice(i, i + 500));
    }

    // AGREGAÇÃO (código)
    await setProg(analiseId, { etapa: "estruturando", pct: 65, detalhe: `Estruturando ${todas.length} transações` });
    const agg = agregar(todas);

    // INTERPRETAÇÃO (IA)
    await setProg(analiseId, { etapa: "interpretando", pct: 78, detalhe: "Interpretação jurídica (IA)" });
    const interpTxt = await gemini([{ text: PROMPT_INTERP }, { text: "AGREGACAO:\n" + JSON.stringify(agg) }], 8192);
    const parsed = parseJson(interpTxt) || { relatorio: interpTxt, resumo: {}, flags: [] };
    const flags = Array.isArray(parsed.flags) ? parsed.flags : [];

    await setProg(analiseId, { etapa: "gravando", pct: 95, detalhe: "Gravando resultado" });
    await s.from("spy_analise").update({
      status: "concluida", relatorio: parsed.relatorio || null, resumo: parsed.resumo || {},
      n_transacoes: todas.length, progresso: { etapa: "concluida", pct: 100, detalhe: `${todas.length} transações · ${flags.length} flags` },
    }).eq("id", analiseId);
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
    if (!Deno.env.get("GEMINI_API_KEY")) return j({ error: "GEMINI_API_KEY nao configurado" }, 500);

    const { data: novo, error } = await sb().from("spy_analise").insert({
      cliente_id: clienteId, status: "processando", arquivos: arquivos.map((a) => ({ id: a.id, name: a.name })),
      modelo: MODELO, created_by: (body.created_by as string) || null, progresso: { etapa: "fila", pct: 2, detalhe: "Na fila" },
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
