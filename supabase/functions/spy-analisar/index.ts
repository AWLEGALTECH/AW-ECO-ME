// spy-analisar (AW SPY, análise em segundo plano). Motor: OpenAI
//
// Duas etapas (cabe no tempo da função serverless):
//   1) EXTRAÇÃO por extrato (uma chamada por PDF, SEQUENCIAL): a IA lê cada
//      extrato e devolve os FATOS densos daquele período (fonte pagadora, renda
//      mês a mês, contrapartes por nome, assinaturas, tarifas, crédito, eventos
//      com data) + flags por eixo + transações-CHAVE.
//   2) SÍNTESE (uma chamada, só texto, sem PDF): recebe os fatos de TODOS os
//      períodos juntos e escreve UM ÚNICO dossiê contínuo, cruzando os anos como
//      uma só linha de entendimento (evolução de renda, endividamento, hábitos).
//
// Progresso em spy_analise.progresso (o front faz polling): { etapa, pct,
// detalhe, feed[] } onde feed é o "diário" ao vivo da análise (estilo terminal).
// Roda via EdgeRuntime.waitUntil; retorna 202 na hora.
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

// ── OpenAI (Responses API, aceita PDF via input_file) ────────────────────────
const EIXOS = ["financeira", "credores", "produtos", "consumo", "vulnerabilidade", "perfil", "temporal"];

// Etapa 1: extração de FATOS por extrato.
const SCHEMA_EXTRACAO = {
  type: "json_schema", name: "extracao_spy", strict: true,
  schema: {
    type: "object", additionalProperties: false,
    required: ["periodo", "notas", "risco_geral", "flags", "transacoes_chave"],
    properties: {
      periodo: { type: "string" },
      notas: { type: "string" },
      risco_geral: { type: "string", enum: ["baixo", "medio", "alto", "critico"] },
      flags: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          required: ["eixo", "codigo", "label", "confianca", "evidencia"],
          properties: {
            eixo: { type: "string", enum: EIXOS },
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

// Etapa 2: síntese num único dossiê contínuo.
const SCHEMA_DOSSIE = {
  type: "json_schema", name: "dossie_spy", strict: true,
  schema: {
    type: "object", additionalProperties: false,
    required: ["relatorio", "risco_geral"],
    properties: {
      relatorio: { type: "string" },
      risco_geral: { type: "string", enum: ["baixo", "medio", "alto", "critico"] },
    },
  },
};

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

async function openai(content: any[], maxTokens: number, format: unknown, tries = 4): Promise<string> {
  const key = Deno.env.get("OPENAI_API_KEY");
  let lastErr = "";
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: MODELO, input: [{ role: "user", content }], max_output_tokens: maxTokens, temperature: 0.3, text: { format } }),
      });
      if (r.status === 429) {
        lastErr = `openai 429: ${(await r.text()).slice(0, 180)}`;
        if (attempt < tries) { await sleep(attempt * 8000); continue; }
        throw new Error(lastErr);
      }
      if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 260)}`);
      const d = await r.json();
      if (Array.isArray(d.output)) {
        for (const o of d.output) for (const c of (o.content || [])) if (c?.type === "refusal" && c.refusal) throw new Error(`recusa: ${String(c.refusal).slice(0, 200)}`);
      }
      if (d.status === "incomplete") throw new Error(`incompleto: ${d.incomplete_details?.reason || "?"}`);
      let txt = d.output_text;
      if (!txt && Array.isArray(d.output)) {
        for (const o of d.output) for (const c of (o.content || [])) if (typeof c.text === "string") { txt = c.text; break; }
      }
      if (txt) return txt;
      throw new Error("resposta vazia");
    } catch (e) {
      lastErr = String((e as Error)?.message || e);
      if (attempt < tries) await sleep(1500);
    }
  }
  throw new Error(lastErr || "openai falhou");
}
function parseJson(s: string): any { try { return JSON.parse(String(s).replace(/^```json\s*|```$/g, "").trim()); } catch { return null; } }
function normalizeDate(v: any): string | null {
  const s = String(v || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);     if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);       if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

// Etapa 1: extração de fatos densos de UM extrato.
const PROMPT_EXTRACAO = `Você é o motor de extração do AW SPY, central de inteligência de um escritório de advocacia do consumidor. Recebe UM extrato bancário (PDF) de um cliente. NÃO escreva um texto bonito ainda: sua função é EXTRAIR os fatos crus e específicos desse extrato, para que uma etapa posterior cruze vários períodos e escreva o dossiê.

Preencha "periodo" com o intervalo do extrato (ex.: "2022", "jan-dez/2023", ou o mês/ano que constar).

Em "notas", despeje TODOS os fatos concretos e específicos que esse extrato sustenta, de forma densa (pode ser corrido ou em linhas), SEM enfeite e SEM inventar:
- Titular: NOME COMPLETO do correntista/titular da conta, exatamente como aparece no extrato (cabeçalho, rodapé ou dados cadastrais). SEMPRE registre isso.
- Fonte pagadora e renda: nome exato de quem paga o salário/benefício, valores mês a mês (liste os que der), datas dos créditos.
- Contrapartes: NOMES das pessoas/empresas em PIX/TED/DOC (quem recebe dela e quem paga a ela), com valores e recorrência, não resuma como "transferências", CITE OS NOMES.
- Assinaturas e recorrentes: CITE PELO NOME (Netflix, Spotify, Amazon Prime, Google, academia, seguro, plano) com valor e data.
- Saúde, mercado, combustível, farmácia, lazer: estabelecimentos citados, com valores.
- Crédito e dívida: empréstimos, consignado, cheque especial, cartão, parcelas, com valores e datas.
- Tarifas bancárias: tipos e total.
- Saques em dinheiro: quantidade e total.
- Saldos: inicial/final, e se virou negativo em algum momento (data).
- Qualquer evento fora do padrão, com data e valor.

PERCORRA O EXTRATO TRANSAÇÃO POR TRANSAÇÃO, não apenas as maiores. Depois some e sintetize os PADRÕES (isso é o mais importante):
- Categorize os gastos (alimentação, transporte, moradia/contas, saúde, educação, crédito/dívida, tarifas, saques, lazer) e diga o PESO de cada categoria no total (aproximado).
- Recorrências: o que se repete todo mês (assinaturas, parcelas, boletos), com valor.
- Ritmo/época: em que dias/época do mês o dinheiro aperta; em que época do ano ela recontrata crédito ou pega empréstimo; ciclos de aperto e folga.
- Racionalidade financeira: sinais de compras por impulso vs essenciais, se gasta mais do que ganha, se depende de crédito pra fechar o mês, tendência a se endividar.
- Comportamento de crédito: quando pega empréstimo/consignado, com que frequência, se renova/refinancia.

Regras: use SOMENTE o que o extrato mostra; cite valores e datas; NÃO invente; NÃO use travessão.

Também devolva: risco_geral desse período; flags (uma por achado concreto, com eixo, codigo curto, confianca 0..1 e evidencia com datas/valores); e transacoes_chave (ATÉ 25 mais relevantes: crédito, recorrentes, valores altos, NÃO a lista inteira). Datas em AAAA-MM-DD. sinal: 1 crédito, -1 débito. valor sempre positivo.`;

// Etapa 2: síntese de um dossiê contínuo a partir dos fatos de todos os períodos.
const PROMPT_SINTESE = `Você é o analista do AW SPY, de um escritório de advocacia do consumidor. Abaixo estão FATOS extraídos de um ou mais extratos bancários da MESMA pessoa, em períodos diferentes (anos/meses). Trate tudo como UMA ÚNICA LINHA CONTÍNUA de entendimento sobre essa pessoa.

Escreva em "relatorio" UM ÚNICO dossiê profundo e humano, corrido e específico (não use tópicos rígidos, não separe por ano com cabeçalhos, não seja robótico). Uma pessoa lendo deve sentir que conhece o indivíduo. Cubra, sempre que os dados sustentarem:
- Quem é: comece NOMEANDO a pessoa pelo nome do titular sempre que ele constar nos fatos (não escreva "um indivíduo" se há nome); profissão/ocupação provável, de onde vem a renda (nome da fonte pagadora), faixa de renda, faixa etária provável, cidade/bairro onde vive e trabalha.
- Família e núcleo: contrapartes recorrentes CITADAS PELO NOME e o vínculo provável (cônjuge, filho, pai/mãe), quem depende de quem, rateio de casa.
- Hábitos e vida: onde compra e abastece, streamings/assinaturas PELO NOME e sinais de assinatura esquecida/duplicada, saúde, lazer, transporte, rotina.
- Vida financeira e RACIONALIDADE: como gasta (peso das categorias), se vive dentro ou fora da renda, se depende de crédito pra fechar o mês, compras por impulso vs essenciais, dívidas e comportamento de endividamento.
- PADRÕES DE CRÉDITO: em que época do mês/ano a pessoa aperta e tende a pegar empréstimo/consignado, com que frequência renova/refinancia, ciclos de aperto e folga.
- EVOLUÇÃO NO TEMPO (essencial quando há mais de um período): como a renda mudou de um ano para o outro, quando entrou/saiu de dívida, o que passou a gastar ou deixou de gastar, tendência da saúde financeira. Amarre os períodos numa trajetória, não os descreva em separado.
- Gancho jurídico: onde há oportunidade de defesa do consumidor (cobranças abusivas, reajustes, tarifas, endividamento) para o escritório ajudar.

Regras: use SOMENTE os fatos fornecidos; toda inferência é PROBABILÍSTICA (use "provavelmente", "há indícios de"); cite datas e valores reais como evidência; NÃO invente nada que não esteja nos fatos; NÃO use travessão. Defina risco_geral considerando o conjunto todo.`;

const ORDEM_RISCO: Record<string, number> = { baixo: 1, medio: 2, alto: 3, critico: 4 };

// A análise segue viva enquanto a linha existe e está 'processando'. Se o usuário
// cancelar (a linha é removida ou muda de status), a pipeline aborta.
async function estaViva(s: any, id: string): Promise<boolean> {
  const { data } = await s.from("spy_analise").select("status").eq("id", id).maybeSingle();
  return !!data && data.status === "processando";
}

async function pipeline(analiseId: string, clienteId: string, arquivos: Array<{ id: string; name: string; mimeType?: string }>) {
  const s = sb();
  const feed: Array<any> = [];
  const prog = async (etapa: string, pct: number, detalhe: string, add?: any) => {
    if (add) for (const m of (Array.isArray(add) ? add : [add])) feed.push(m);
    await s.from("spy_analise").update({ progresso: { etapa, pct, detalhe, feed: feed.slice(-60) } }).eq("id", analiseId);
  };
  try {
    await prog("baixando", 10, "Conectando ao Drive", { msg: "Conectando ao Google Drive", kind: "step" });
    const token = await getToken();
    const baixados = await Promise.all(arquivos.map(async (a) => ({ name: a.name, mime: a.mimeType || "application/pdf", buf: await baixar(a.id, token) })));
    await prog("baixando", 16, `Baixados ${baixados.length} extrato(s)`, { msg: `Baixados ${baixados.length} arquivo(s) do Drive`, kind: "ok" });

    // Etapa 1: um PDF por chamada, SEQUENCIAL (evita o teto de tokens/min da OpenAI).
    const n = baixados.length; let done = 0;
    await prog("analisando", 20, `Lendo extratos (0/${n})`);
    const perFile: Array<{ name: string; parsed: any }> = [];
    for (const f of baixados) {
      if (!(await estaViva(s, analiseId))) return; // cancelada
      await prog("analisando", 20 + Math.round((done / n) * 55), `Lendo ${f.name}`, { msg: `Lendo ${f.name}...`, kind: "step" });
      let parsed: any = null;
      try {
        const content = [
          { type: "input_text", text: PROMPT_EXTRACAO },
          { type: "input_file", filename: f.name, file_data: `data:${f.mime};base64,${toBase64(f.buf)}` },
        ];
        parsed = parseJson(await openai(content, 5000, SCHEMA_EXTRACAO));
      } catch (_e) { parsed = null; }
      done++;
      if (parsed) {
        const ntx = Array.isArray(parsed.transacoes_chave) ? parsed.transacoes_chave.length : 0;
        const add: Array<any> = [{ msg: `${f.name}: ${parsed.periodo || "período"} · ${ntx} transações-chave · risco ${parsed.risco_geral || "?"}`, kind: "ok" }];
        for (const t of (parsed.transacoes_chave || []).slice(0, 6)) {
          add.push({
            kind: "tx",
            data: t.data || "",
            desc: String(t.descricao || "").slice(0, 48),
            valor: typeof t.valor === "number" ? t.valor : null,
            sinal: t.sinal === 1 ? 1 : -1,
          });
        }
        await prog("analisando", 20 + Math.round((done / n) * 55), `Lido ${f.name}`, add);
      } else {
        await prog("analisando", 20 + Math.round((done / n) * 55), `Falha ao ler ${f.name}`, { msg: `${f.name}: não consegui ler`, kind: "warn" });
      }
      perFile.push({ name: f.name, parsed });
    }

    // Ordena os períodos cronologicamente (pelo nome do arquivo / periodo detectado).
    const oks = perFile.filter((p) => p.parsed)
      .sort((a, b) => String(a.parsed.periodo || a.name).localeCompare(String(b.parsed.periodo || b.name)));

    // Flags e transações-chave: união de todos os períodos.
    const flags = oks.flatMap((p) => (Array.isArray(p.parsed.flags) ? p.parsed.flags : [])).slice(0, 80);
    const txs = oks.flatMap((p) => (Array.isArray(p.parsed.transacoes_chave) ? p.parsed.transacoes_chave : [])).slice(0, 160);

    // Etapa 2: síntese num único dossiê contínuo, cruzando todos os períodos.
    let relatorio: string | null = null;
    let riscoLabel = "";
    let sintErro: string | null = null;
    if (!(await estaViva(s, analiseId))) return; // cancelada antes da síntese
    if (oks.length) {
      await prog("sintetizando", 82, n > 1 ? `Cruzando ${oks.length} períodos num só perfil` : "Montando o dossiê",
        { msg: n > 1 ? `Cruzando ${oks.length} períodos num só perfil...` : "Montando o dossiê...", kind: "step" });
      const fatos = oks.map((p) => `### Período: ${p.parsed.periodo || p.name}\n${p.parsed.notas || ""}`).join("\n\n");
      try {
        const dossie = parseJson(await openai([{ type: "input_text", text: `${PROMPT_SINTESE}\n\n=== FATOS EXTRAÍDOS ===\n${fatos}` }], 6000, SCHEMA_DOSSIE));
        relatorio = dossie?.relatorio || null;
        riscoLabel = dossie?.risco_geral || "";
        if (!relatorio) sintErro = "sintese sem relatorio";
      } catch (e) { relatorio = null; sintErro = String((e as Error)?.message || e); }
      if (!relatorio) {
        relatorio = oks.map((p) => (n > 1 ? `## ${p.parsed.periodo || p.name}\n` : "") + (p.parsed.notas || "")).join("\n\n");
      }
      if (!riscoLabel) {
        let maxR = 0;
        for (const p of oks) { const ri = ORDEM_RISCO[p.parsed.risco_geral] || 0; if (ri > maxR) { maxR = ri; riscoLabel = p.parsed.risco_geral; } }
      }
      await prog("sintetizando", 90, "Dossiê gerado", { msg: `Dossiê gerado · risco ${riscoLabel || "?"}`, kind: "ok" });
    }
    const resumo = riscoLabel ? { risco_geral: riscoLabel } : {};

    if (!(await estaViva(s, analiseId))) return; // cancelada antes de gravar
    feed.push({ msg: `Concluído · ${txs.length} transações · ${flags.length} marcadores`, kind: "done" });
    await s.from("spy_analise").update({
      status: "concluida", relatorio, resumo, erro: sintErro,
      n_transacoes: txs.length, progresso: { etapa: "concluida", pct: 100, detalhe: `${txs.length} transações-chave · ${flags.length} flags`, feed: feed.slice(-60) },
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

    // Unicidade: esta análise passa a ser a ÚNICA do cliente. Regenerar = do zero,
    // então as anteriores (e suas transações/flags) são removidas.
    try {
      const { data: velhas } = await s.from("spy_analise").select("id").eq("cliente_id", clienteId).neq("id", analiseId);
      const ids = (velhas || []).map((v: any) => v.id);
      if (ids.length) {
        await s.from("spy_transacao").delete().in("analise_id", ids);
        await s.from("spy_flag").delete().in("analise_id", ids);
        await s.from("spy_analise").delete().in("id", ids);
      }
    } catch (_e) { /* limpeza best-effort, não derruba a análise */ }
  } catch (e) {
    feed.push({ msg: `Erro: ${String((e as Error)?.message || e).slice(0, 120)}`, kind: "warn" });
    await sb().from("spy_analise").update({ status: "erro", erro: String((e as Error)?.message || e), progresso: { etapa: "erro", pct: 100, feed: feed.slice(-60) } }).eq("id", analiseId);
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

    // Idempotência: se já existe uma análise RECENTE rodando pra esse cliente,
    // devolve ela (evita duplicatas por duplo-clique). Se for uma presa/antiga
    // (> 2 min sem terminar), remove e deixa a nova rodar. Isso destrava a
    // regeneração quando havia uma análise anterior travada.
    const { data: jaRodando } = await sb().from("spy_analise").select("id, created_at").eq("cliente_id", clienteId).eq("status", "processando").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (jaRodando?.id) {
      const idadeMs = Date.now() - new Date(jaRodando.created_at).getTime();
      if (idadeMs < 120000) return j({ ok: true, analise_id: jaRodando.id, background: true, ja_existia: true }, 202);
      await sb().from("spy_analise").delete().eq("id", jaRodando.id); // presa: descarta
    }

    const { data: novo, error } = await sb().from("spy_analise").insert({
      cliente_id: clienteId, status: "processando", arquivos: arquivos.map((a) => ({ id: a.id, name: a.name })),
      modelo: MODELO, created_by: (body.created_by as string) || null, progresso: { etapa: "fila", pct: 4, detalhe: "Na fila", feed: [{ msg: "Análise na fila", kind: "step" }] },
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
