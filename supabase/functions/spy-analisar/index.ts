// spy-analisar (AW SPY). Análise POR EXTRATO (sem cruzamento): cada extrato vira
// um quadro isolado com o mapeamento NEUTRO de todas as transações, salvo em
// spy_analise.parciais assim que fica pronto (streaming). Reconciliado pelo saldo
// = mapeado por código, sem IA. Não reconciliou = a IA extrai as transações do
// texto. Sem dossiê cruzado, sem resumo por extrato, sem flags. Teto de 5 min
// com corte por chamada (AbortController). Secrets: OPENAI_API_KEY, SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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

const SCHEMA_EXTRACAO = {
  type: "json_schema", name: "extracao_spy", strict: true,
  schema: {
    type: "object", additionalProperties: false,
    required: ["periodo", "transacoes_chave"],
    properties: {
      periodo: { type: "string" },
      transacoes_chave: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          required: ["data", "descricao", "valor", "sinal"],
          properties: {
            data: { type: "string" }, descricao: { type: "string" },
            valor: { type: "number" }, sinal: { type: "integer", enum: [1, -1] },
          },
        },
      },
    },
  },
};

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  if (signal) signal.addEventListener("abort", () => { clearTimeout(t); rej(new Error("timeout")); }, { once: true });
});

// Cada chamada tem CORTE DURO por tempo (AbortController). Se pendurar, aborta e falha.
async function openai(content: any[], maxTokens: number, format: unknown, opts: { tries?: number; timeoutMs?: number } = {}): Promise<string> {
  const tries = opts.tries ?? 3;
  const timeoutMs = opts.timeoutMs ?? 45000;
  const key = Deno.env.get("OPENAI_API_KEY");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let lastErr = "";
  try {
    for (let attempt = 1; attempt <= tries; attempt++) {
      if (ac.signal.aborted) throw new Error("timeout_openai");
      try {
        const r = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model: MODELO, input: [{ role: "user", content }], max_output_tokens: maxTokens, temperature: 0.2, text: { format } }),
          signal: ac.signal,
        });
        if (r.status === 429) {
          const body = (await r.text()).slice(0, 300);
          lastErr = `openai 429: ${body.slice(0, 180)}`;
          if (/insufficient_quota|no credits|billing/i.test(body)) throw new Error(`sem_creditos: ${body.slice(0, 140)}`);
          if (attempt < tries) { await sleep(Math.min(attempt * 4000, 10000), ac.signal); continue; }
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
        if (ac.signal.aborted || /aborted|the operation was aborted|timeout/i.test(lastErr)) throw new Error("timeout_openai");
        if (/sem_creditos|insufficient_quota|no credits/i.test(lastErr)) break;
        if (attempt < tries) await sleep(1500, ac.signal);
      }
    }
    throw new Error(lastErr || "openai falhou");
  } finally { clearTimeout(timer); }
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

const brl = (n: number) => `R$ ${(Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Só mapeia (neutro): extrai o máximo de lançamentos do texto, sem interpretar.
const PROMPT_EXTRACAO = `Você é o mapeador de extratos do AW SPY. Recebe UM extrato bancário (texto extraído do PDF) e deve MAPEAR as transações desse único período, de forma NEUTRA (NÃO interprete, NÃO resuma, NÃO cruze com outros).

Preencha "periodo" com o intervalo do extrato (ex.: "2022", "jan-dez/2023", ou o mês/ano que constar).

Em "transacoes_chave", liste TODAS as transações que conseguir extrair (o máximo possível, não só as maiores), na ordem em que aparecem. Para cada uma: data (AAAA-MM-DD), descricao (o histórico EXATAMENTE como aparece), valor (sempre positivo) e sinal (1 crédito/entrada, -1 débito/saída). NÃO invente transação; use apenas o que o texto mostra. Ignore linhas de saldo/total.`;

async function estaViva(s: any, id: string): Promise<boolean> {
  const { data } = await s.from("spy_analise").select("status").eq("id", id).maybeSingle();
  return !!data && data.status === "processando";
}

async function autoContinuar(analiseId: string, clienteId: string, arquivos: any[]) {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/spy-analisar`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ retomar: analiseId, cliente_id: clienteId, arquivos }),
    });
  } catch (_e) { /* stale-idempotência recupera numa próxima */ }
}

async function pipeline(analiseId: string, clienteId: string, arquivos: Array<{ id: string; name: string; texto?: string; mimeType?: string; periodo?: string; header?: string; reconciliado?: boolean; saldoInicial?: number | null; saldoFinal?: number | null; resumo?: any; candidatos?: any[]; transacoes?: any[] }>) {
  const s = sb();
  const { data: row0 } = await s.from("spy_analise").select("parciais, progresso, status, created_at").eq("id", analiseId).maybeSingle();
  if (!row0 || row0.status !== "processando") return;
  const TETO_MS = 300000, RESERVA_MS = 20000;
  const deadline = new Date(row0.created_at).getTime() + TETO_MS;
  const parciais: any[] = Array.isArray(row0.parciais) ? row0.parciais : [];
  const feed: any[] = Array.isArray(row0.progresso?.feed) ? row0.progresso.feed.slice() : [];
  const feitos = new Set(parciais.map((p) => p.name));
  const total = arquivos.length;

  const prog = async (etapa: string, pct: number, detalhe: string, add?: any) => {
    if (add) for (const m of (Array.isArray(add) ? add : [add])) feed.push(m);
    await s.from("spy_analise").update({ progresso: { etapa, pct, detalhe, feed: feed.slice(-80) }, updated_at: new Date().toISOString() }).eq("id", analiseId);
  };
  const salvarParciais = async () => { await s.from("spy_analise").update({ parciais }).eq("id", analiseId); };
  const pctLidos = () => 10 + Math.round((parciais.length / Math.max(1, total)) * 85);

  try {
    if (parciais.length === 0) await prog("analisando", 6, "Preparando a leitura", { msg: "Preparando a leitura dos extratos", kind: "step" });

    const pendentes = arquivos.filter((a) => !feitos.has(a.name));
    if (pendentes.length > 0) {
      const INICIO = Date.now();
      const LIMITE_MS = 110000;
      for (let idx = 0; idx < pendentes.length; idx++) {
        const a = pendentes[idx];
        if (!(await estaViva(s, analiseId))) return;
        if (Date.now() > deadline - RESERVA_MS) {
          for (let k = idx; k < pendentes.length; k++) parciais.push({ name: pendentes[k].name, falhou: true, erro: "tempo excedido (5 min)" });
          await prog("analisando", pctLidos(), "Teto de 5 min", { msg: `Teto de 5 min atingido — ${pendentes.length - idx} extrato(s) ficaram para reprocessar`, kind: "warn" });
          await salvarParciais();
          break;
        }
        if (parciais.length > 0 && Date.now() - INICIO > LIMITE_MS) {
          await prog("analisando", pctLidos(), `Continuando (${parciais.length}/${total})`,
            { msg: `Pausa técnica: já fiz ${parciais.length}/${total}, continuando os demais...`, kind: "step" });
          await salvarParciais();
          await autoContinuar(analiseId, clienteId, arquivos);
          return;
        }
        await prog("analisando", pctLidos(), `Lendo ${a.name}`, { msg: `Lendo ${a.name}...`, kind: "step" });

        // Reconciliado pelo saldo (navegador) → mapeamento por código, SEM IA.
        const codeTx = (a.reconciliado === true && Array.isArray(a.transacoes))
          ? a.transacoes.filter((t: any) => typeof t?.valor === "number") : [];
        if (codeTx.length >= 3) {
          const transacoes = codeTx.slice(0, 600).map((t: any) => ({ data: t.data || null, descricao: String(t.descricao || ""), valor: Number(t.valor) || 0 }));
          const ent = Number(a.resumo?.entradas || 0), sai = Number(a.resumo?.saidas || 0);
          parciais.push({ name: a.name, periodo: a.periodo || null, reconciliado: true, transacoes });
          const add: any[] = [{ msg: `${a.name}: ${a.periodo || "período"} · ${transacoes.length} lançamentos mapeados (conferidos pelo saldo) · entra ${brl(ent)}, sai ${brl(sai)}`, kind: "ok" }];
          for (const t of transacoes.slice(0, 6)) add.push({ kind: "tx", data: t.data || "", desc: t.descricao.slice(0, 48), valor: Math.abs(t.valor), sinal: t.valor >= 0 ? 1 : -1 });
          await prog("analisando", pctLidos(), `Quadro de ${a.name} pronto`, add);
          await salvarParciais();
          continue;
        }

        // Não reconciliou → a IA MAPEIA as transações do texto (sem interpretar).
        let parsed: any = null;
        const texto = String(a.texto || "").trim();
        if (texto.replace(/\s/g, "").length < 40) {
          parciais.push({ name: a.name, falhou: true, erro: "sem texto" });
          await prog("analisando", pctLidos(), `Sem texto em ${a.name}`, { msg: `${a.name}: sem texto legível (escaneado?)`, kind: "warn" });
          await salvarParciais();
          continue;
        }
        let errFile: string | null = null;
        try {
          const content = [{ type: "input_text", text: `${PROMPT_EXTRACAO}\n\n=== EXTRATO: ${a.name} ===\n${texto.slice(0, 120000)}` }];
          parsed = parseJson(await openai(content, 8000, SCHEMA_EXTRACAO, { timeoutMs: 60000, tries: 2 }));
        } catch (e) { parsed = null; errFile = String((e as Error)?.message || e); }
        if (!parsed && errFile && /sem_creditos|insufficient_quota|no credits/i.test(errFile)) {
          feed.push({ msg: "Conta OpenAI sem créditos. Adicione créditos para rodar a análise.", kind: "warn" });
          await s.from("spy_analise").update({
            status: "erro", erro: "OpenAI sem créditos. Adicione créditos em platform.openai.com/settings/organization/billing.",
            progresso: { etapa: "erro", pct: 100, detalhe: "Conta OpenAI sem créditos", feed: feed.slice(-80) },
          }).eq("id", analiseId);
          return;
        }
        if (parsed) {
          const transacoes = (parsed.transacoes_chave || []).map((t: any) => ({ data: t.data || null, descricao: String(t.descricao || ""), valor: (t.sinal === 1 ? 1 : -1) * Math.abs(Number(t.valor) || 0) }));
          parciais.push({ name: a.name, periodo: parsed.periodo || null, reconciliado: false, transacoes });
          const add: any[] = [{ msg: `${a.name}: ${parsed.periodo || "período"} · ${transacoes.length} transações mapeadas (lido por IA)`, kind: "ok" }];
          for (const t of transacoes.slice(0, 6)) add.push({ kind: "tx", data: t.data || "", desc: t.descricao.slice(0, 48), valor: Math.abs(t.valor), sinal: t.valor >= 0 ? 1 : -1 });
          await prog("analisando", pctLidos(), `Quadro de ${a.name} pronto`, add);
        } else {
          parciais.push({ name: a.name, falhou: true, erro: errFile });
          await prog("analisando", pctLidos(), `Falha ao ler ${a.name}`, { msg: `${a.name}: não consegui ler${errFile ? ` (${errFile.slice(0, 100)})` : ""}`, kind: "warn" });
        }
        await salvarParciais();
      }
    }

    // Finaliza quando todos foram lidos. Cada quadro já está salvo (streaming).
    if (!(await estaViva(s, analiseId))) return;
    const oks = parciais.filter((p) => !p.falhou)
      .sort((x, y) => String(x.periodo || x.name).localeCompare(String(y.periodo || y.name)));
    const txs = oks.flatMap((p) => (Array.isArray(p.transacoes) ? p.transacoes : []));

    const semCredito = parciais.some((p) => p.falhou && /sem_creditos|no credits|insufficient_quota/i.test(String(p.erro || "")));
    if (semCredito && oks.length === 0) {
      feed.push({ msg: "Conta OpenAI sem créditos. Adicione créditos para rodar a análise.", kind: "warn" });
      await s.from("spy_analise").update({
        status: "erro", erro: "OpenAI sem créditos. Adicione créditos em platform.openai.com/settings/organization/billing.",
        progresso: { etapa: "erro", pct: 100, detalhe: "Conta OpenAI sem créditos", feed: feed.slice(-80) },
      }).eq("id", analiseId);
      return;
    }

    const naoLidos = parciais.filter((p) => p.falhou).length;
    const faltamTempo = parciais.filter((p) => p.falhou && /tempo excedido/.test(String(p.erro || ""))).map((p) => p.name);
    feed.push({ msg: `${faltamTempo.length ? "Concluído (parcial)" : "Concluído"} · ${oks.length}/${total} quadro(s) · ${txs.length} transações${faltamTempo.length ? ` · faltaram por tempo: ${faltamTempo.join(", ")} — reprocessar` : (naoLidos ? ` · ${naoLidos} não lido(s)` : "")}`, kind: "done" });
    await s.from("spy_analise").update({
      status: "concluida", relatorio: null, resumo: {}, erro: null,
      n_transacoes: txs.length, updated_at: new Date().toISOString(),
      progresso: { etapa: "concluida", pct: 100, detalhe: `${oks.length} quadro(s) · ${txs.length} transações`, feed: feed.slice(-80) },
    }).eq("id", analiseId);

    if (txs.length) {
      const rows = txs.slice(0, 1200).map((t: any) => ({
        analise_id: analiseId, cliente_id: clienteId,
        data: normalizeDate(t.data),
        valor: Math.abs(Number(t.valor) || 0),
        sinal: Number(t.valor) >= 0 ? 1 : -1,
        saldo: null, descricao: t.descricao || null,
      }));
      const { error: eTx } = await s.from("spy_transacao").insert(rows);
      if (eTx) { for (const row of rows) { await s.from("spy_transacao").insert(row); } }
    }

    // Unicidade: esta análise passa a ser a ÚNICA do cliente.
    try {
      const { data: velhas } = await s.from("spy_analise").select("id").eq("cliente_id", clienteId).neq("id", analiseId);
      const ids = (velhas || []).map((v: any) => v.id);
      if (ids.length) {
        await s.from("spy_transacao").delete().in("analise_id", ids);
        await s.from("spy_flag").delete().in("analise_id", ids);
        await s.from("spy_analise").delete().in("id", ids);
      }
    } catch (_e) { /* limpeza best-effort */ }
  } catch (e) {
    feed.push({ msg: `Erro: ${String((e as Error)?.message || e).slice(0, 120)}`, kind: "warn" });
    await sb().from("spy_analise").update({ status: "erro", erro: String((e as Error)?.message || e), progresso: { etapa: "erro", pct: 100, feed: feed.slice(-80) } }).eq("id", analiseId);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({} as any));
    const clienteId = body.cliente_id as string | undefined;
    const arquivos = (body.arquivos as any[] | undefined) || [];
    const retomar = body.retomar as string | undefined;
    const reprocessar = body.reprocessar as string | undefined;
    if (!clienteId) return j({ error: "cliente_id obrigatorio" }, 400);
    if (!arquivos.length) return j({ error: "selecione ao menos um documento" }, 400);
    if (arquivos.length > 12) return j({ error: "máximo de 12 documentos por análise" }, 400);
    if (!Deno.env.get("OPENAI_API_KEY")) return j({ error: "OPENAI_API_KEY nao configurado" }, 500);

    if (retomar) {
      const task = pipeline(retomar, clienteId, arquivos);
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(task);
      else await task;
      return j({ ok: true, analise_id: retomar, background: true, retomando: true }, 202);
    }

    if (reprocessar) {
      const { data: old } = await sb().from("spy_analise").select("parciais").eq("id", reprocessar).eq("cliente_id", clienteId).maybeSingle();
      const reenviados = new Set(arquivos.filter((a) => a.reconciliado === true || typeof a.texto === "string").map((a) => a.name));
      const seed = (Array.isArray(old?.parciais) ? old.parciais : []).filter((p: any) => !reenviados.has(p.name));
      const { data: novo, error } = await sb().from("spy_analise").insert({
        cliente_id: clienteId, status: "processando", arquivos: arquivos.map((a) => ({ id: a.id, name: a.name })),
        modelo: MODELO, created_by: (body.created_by as string) || null, parciais: seed,
        progresso: { etapa: "fila", pct: 6, detalhe: "Reprocessando os que faltaram", feed: [{ msg: "Reanalisando os documentos que faltaram", kind: "step" }] },
      }).select("id").single();
      if (error) return j({ error: error.message }, 500);
      const task = pipeline(novo.id, clienteId, arquivos);
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(task);
      else await task;
      return j({ ok: true, analise_id: novo.id, background: true, reprocessando: true }, 202);
    }

    const { data: jaRodando } = await sb().from("spy_analise").select("id, updated_at, created_at").eq("cliente_id", clienteId).eq("status", "processando").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (jaRodando?.id) {
      const ref = new Date(jaRodando.updated_at || jaRodando.created_at).getTime();
      if (Date.now() - ref < 120000) return j({ ok: true, analise_id: jaRodando.id, background: true, ja_existia: true }, 202);
      await sb().from("spy_analise").delete().eq("id", jaRodando.id);
    }

    const { data: novo, error } = await sb().from("spy_analise").insert({
      cliente_id: clienteId, status: "processando", arquivos: arquivos.map((a) => ({ id: a.id, name: a.name })),
      modelo: MODELO, created_by: (body.created_by as string) || null, parciais: [],
      progresso: { etapa: "fila", pct: 4, detalhe: "Na fila", feed: [{ msg: "Análise na fila", kind: "step" }] },
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
