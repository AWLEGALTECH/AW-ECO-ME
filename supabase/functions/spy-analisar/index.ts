// spy-analisar (AW SPY, análise em segundo plano). Motor: OpenAI
//
// ANÁLISE EM CAMADAS (economia sem perder profundidade):
// - CAMADA 0 (código, no navegador): parseExtrato enumera os lançamentos e
//   RECONCILIA pelo saldo. Extrato que fecha a conta chega aqui já pronto e NÃO
//   gasta IA — o servidor só monta os fatos (lista completa + candidatos jurídicos).
// - FALLBACK: extrato que não reconciliou (formato esquisito/escaneado) volta pro
//   motor antigo, com a IA lendo o texto — então o pior caso é o de hoje.
// - SÍNTESE: UMA chamada de IA cruza tudo e escreve o dossiê (com as oportunidades
//   de fechamento) + flags. De N chamadas gordas para ~1 enxuta.
//
// TETO DE 5 MIN: nenhuma análise passa de 5 min. Cada chamada de IA tem corte
// duro (~45s, AbortController) e há um deadline global (criação + 5 min): o que
// não couber é marcado "faltou por tempo" para reprocessar, e a síntese roda com
// o que deu certo (entrega parcial). Assim um extrato pendurado nunca trava tudo.
//
// Lê TODOS os extratos, mesmo que sejam muitos: a análise SE CONTINUA sozinha.
// Cada janela da função salva o progresso em spy_analise.parciais e, se sobraram
// extratos, reinicia a si mesma (retomar). Quando todos foram lidos, cruza tudo
// num único dossiê contínuo.
//
// Progresso em spy_analise.progresso { etapa, pct, detalhe, feed[] } (o front
// faz polling). Roda via EdgeRuntime.waitUntil; retorna 202 na hora.
// Secrets: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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

// ── OpenAI (Responses API, recebe o texto do extrato) ────────────────────────
const EIXOS = ["financeira", "credores", "produtos", "consumo", "vulnerabilidade", "perfil", "temporal"];

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

const SCHEMA_DOSSIE = {
  type: "json_schema", name: "dossie_spy", strict: true,
  schema: {
    type: "object", additionalProperties: false,
    required: ["relatorio", "risco_geral", "flags"],
    properties: {
      relatorio: { type: "string" },
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
    },
  },
};

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  if (signal) signal.addEventListener("abort", () => { clearTimeout(t); rej(new Error("timeout")); }, { once: true });
});

// Cada chamada tem CORTE DURO por tempo (AbortController). Se pendurar, aborta e
// falha — é isso que impede um extrato travado de segurar a análise inteira.
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
          body: JSON.stringify({ model: MODELO, input: [{ role: "user", content }], max_output_tokens: maxTokens, temperature: 0.3, text: { format } }),
          signal: ac.signal,
        });
        if (r.status === 429) {
          const body = (await r.text()).slice(0, 300);
          lastErr = `openai 429: ${body.slice(0, 180)}`;
          // Sem créditos/quota: repetir não adianta, falha na hora.
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
        // Estourou o tempo desta chamada: aborta de vez (não repete).
        if (ac.signal.aborted || /aborted|the operation was aborted|timeout/i.test(lastErr)) throw new Error("timeout_openai");
        // Sem créditos/quota: não adianta repetir, sai na hora.
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

// Monta os FATOS de um extrato que o CÓDIGO já reconciliou (Camada 0), sem IA.
// Entrega a LISTA COMPLETA de lançamentos com descrição verbatim (é daqui que a
// IA tira a profundidade e as contrapartes), mais os agregados e os candidatos
// a oportunidade de fechamento já apontados. A síntese lê isso e interpreta.
function notasCodigo(a: any): string {
  const resumo = a.resumo || {};
  const txs: any[] = Array.isArray(a.transacoes) ? a.transacoes : [];
  const L: string[] = [];
  const header = String(a.header || "").replace(/\s+/g, " ").trim().slice(0, 400);
  if (header) L.push(`Cabeçalho (titular/conta quando presente): ${header}`);
  const ent = Number(resumo.entradas || 0), sai = Number(resumo.saidas || 0);
  L.push(`Extração conferida pelo saldo (reconciliada). Lançamentos: ${txs.length}. Entradas: ${brl(ent)}. Saídas: ${brl(sai)}. Resultado no período: ${brl(ent - sai)}. Saldo inicial ${brl(Number(a.saldoInicial || 0))}, saldo final ${brl(Number(a.saldoFinal || 0))}.`);
  const cand: any[] = Array.isArray(a.candidatos) ? a.candidatos : [];
  if (cand.length) {
    L.push(`Candidatos a oportunidade de fechamento (defesa do consumidor) já detectados: ` +
      cand.map((c) => `${c.tipo} — ${c.ocorrencias}x, total ${brl(c.total)} (ex.: ${(c.exemplos || []).join(", ")})`).join("; ") + ".");
  }
  // LISTA COMPLETA de lançamentos (limita para não estourar; avisa se cortar).
  const MAX = 400;
  const lista = txs.slice(0, MAX).map((t) => `${t.data || "?"} ${Number(t.valor) >= 0 ? "+" : "-"}${brl(Math.abs(Number(t.valor) || 0))} ${String(t.descricao || "").slice(0, 70)}`).join("\n");
  L.push(`Todos os lançamentos do período (data, valor, histórico):\n${lista}${txs.length > MAX ? `\n(... e mais ${txs.length - MAX} lançamentos)` : ""}`);
  return L.join("\n");
}

// Resumo CURTO de UM extrato (não cruza nada). É o texto do quadro daquele período.
const SCHEMA_RESUMO = {
  type: "json_schema", name: "resumo_extrato", strict: true,
  schema: { type: "object", additionalProperties: false, required: ["resumo"], properties: { resumo: { type: "string" } } },
};
const PROMPT_RESUMO = `Você é analista de um escritório de advocacia do consumidor. Resuma ESTE extrato bancário (um único período, NÃO cruze com outros) em 2 a 4 frases corridas, específicas e humanas: quem é o titular se aparecer, de onde vem a renda e o valor, principais gastos e recorrências, sinais de crédito/endividamento, e as oportunidades de fechamento (tarifas, empréstimos/consignados, seguros, cheque especial). Use SOMENTE os fatos abaixo; NÃO invente; NÃO use travessão.`;

// Curto resumo por extrato (não bloqueia o quadro: se falhar, volta "").
async function resumoDe(facts: string): Promise<string> {
  try {
    const r = parseJson(await openai([{ type: "input_text", text: `${PROMPT_RESUMO}\n\n=== FATOS DESTE EXTRATO ===\n${facts}` }], 700, SCHEMA_RESUMO, { timeoutMs: 40000, tries: 2 }));
    return r?.resumo || "";
  } catch { return ""; }
}

// Destaca as transações-chave: renda, crédito/dívida, tarifas, seguros e as maiores.
const RE_CHAVE = /SAL[AÁ]RIO|BENEF[IÍ]CIO|APOSENTAD|\bINSS\b|PENS[AÃ]O|PROVENTO|PREFEITURA|EMPR[EÉ]STIMO|CONSIGN|CREFISA|\bBMG\b|AGIBANK|FINANCIAMENTO|TARIFA|CESTA|ANUIDADE|SEGURO|CHEQUE ESPECIAL|\bJUROS\b/i;
function marcarChaves(txs: Array<{ data: any; descricao: string; valor: number }>) {
  const top = [...txs.map((t, i) => ({ i, abs: Math.abs(Number(t.valor) || 0) }))].sort((a, b) => b.abs - a.abs).slice(0, 8).map((x) => x.i);
  const topSet = new Set(top);
  return txs.map((t, i) => ({ data: t.data || null, descricao: String(t.descricao || ""), valor: Number(t.valor) || 0, chave: RE_CHAVE.test(String(t.descricao || "")) || topSet.has(i) }));
}

// Candidatos (código, vindos do navegador) → flags para o dashboard.
const CAND_EIXO: Record<string, string> = {
  "Empréstimo/consignado": "credores", "Tarifas bancárias": "financeira", "Cheque especial/juros": "financeira",
  "Seguros/assistências": "produtos", "Estornos/devoluções": "consumo",
};
function candFlags(cands: any[], periodo: string | null): any[] {
  return (Array.isArray(cands) ? cands : []).map((c) => ({
    eixo: CAND_EIXO[c.tipo] || "financeira", codigo: c.tipo, label: `${c.tipo}${periodo ? ` (${periodo})` : ""}`,
    confianca: 0.8, evidencia: `${c.ocorrencias}x, total ${brl(c.total)} — ex.: ${(c.exemplos || []).join(", ")}`,
  }));
}

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

const PROMPT_SINTESE = `Você é o analista do AW SPY, de um escritório de advocacia do consumidor. Abaixo estão FATOS extraídos de um ou mais extratos bancários da MESMA pessoa, em períodos diferentes (anos/meses). Trate tudo como UMA ÚNICA LINHA CONTÍNUA de entendimento sobre essa pessoa.

Escreva em "relatorio" UM ÚNICO dossiê profundo e humano, corrido e específico (não use tópicos rígidos, não separe por ano com cabeçalhos, não seja robótico). Uma pessoa lendo deve sentir que conhece o indivíduo. Cubra, sempre que os dados sustentarem:
- Quem é: comece NOMEANDO a pessoa pelo nome do titular sempre que ele constar nos fatos (não escreva "um indivíduo" se há nome); profissão/ocupação provável, de onde vem a renda (nome da fonte pagadora), faixa de renda, faixa etária provável, cidade/bairro onde vive e trabalha.
- Família e núcleo: contrapartes recorrentes CITADAS PELO NOME e o vínculo provável (cônjuge, filho, pai/mãe), quem depende de quem, rateio de casa.
- Hábitos e vida: onde compra e abastece, streamings/assinaturas PELO NOME e sinais de assinatura esquecida/duplicada, saúde, lazer, transporte, rotina.
- Vida financeira e RACIONALIDADE: como gasta (peso das categorias), se vive dentro ou fora da renda, se depende de crédito pra fechar o mês, compras por impulso vs essenciais, dívidas e comportamento de endividamento.
- PADRÕES DE CRÉDITO: em que época do mês/ano a pessoa aperta e tende a pegar empréstimo/consignado, com que frequência renova/refinancia, ciclos de aperto e folga.
- EVOLUÇÃO NO TEMPO (essencial quando há mais de um período): como a renda mudou de um ano para o outro, quando entrou/saiu de dívida, o que passou a gastar ou deixou de gastar, tendência da saúde financeira. Amarre os períodos numa trajetória, não os descreva em separado.
- Gancho jurídico: onde há oportunidade de defesa do consumidor (cobranças abusivas, reajustes, tarifas, endividamento) para o escritório ajudar.

Quando os fatos trouxerem a LISTA COMPLETA de lançamentos, percorra-a: nomeie contrapartes recorrentes de PIX/TED, cite assinaturas/estabelecimentos pelo nome, e trate os "candidatos a oportunidade de fechamento" já apontados. DEDIQUE um trecho às OPORTUNIDADES DE FECHAMENTO concretas para o escritório: empréstimos/consignados (com credor, quantidade e total), tarifas bancárias recorrentes, cheque especial/juros, seguros e assistências embutidos (possível venda casada), cobranças duplicadas ou estornos — cada uma com valor e datas como evidência, e por que renderia atuação de defesa do consumidor.

Regras: use SOMENTE os fatos fornecidos; toda inferência é PROBABILÍSTICA (use "provavelmente", "há indícios de"); cite datas e valores reais como evidência; NÃO invente nada que não esteja nos fatos; NÃO use travessão. Defina risco_geral considerando o conjunto todo.

Também devolva "flags": achados concretos consolidados de toda a trajetória (não por período), cada um com eixo, codigo curto, label, confianca 0..1 e evidencia com datas/valores. Priorize as oportunidades de fechamento. Só crie flag que os fatos sustentem.`;

const ORDEM_RISCO: Record<string, number> = { baixo: 1, medio: 2, alto: 3, critico: 4 };

// A análise segue viva enquanto a linha existe e está 'processando'. Se o usuário
// cancelar (a linha é removida ou muda de status), a pipeline aborta.
async function estaViva(s: any, id: string): Promise<boolean> {
  const { data } = await s.from("spy_analise").select("status").eq("id", id).maybeSingle();
  return !!data && data.status === "processando";
}

// Reinicia a própria função para continuar os extratos que faltam (nova janela).
async function autoContinuar(analiseId: string, clienteId: string, arquivos: any[]) {
  try {
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/spy-analisar`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
      body: JSON.stringify({ retomar: analiseId, cliente_id: clienteId, arquivos }),
    });
  } catch (_e) { /* se falhar, a stale-idempotência recupera numa próxima */ }
}

async function pipeline(analiseId: string, clienteId: string, arquivos: Array<{ id: string; name: string; texto?: string; mimeType?: string; periodo?: string; header?: string; reconciliado?: boolean; saldoInicial?: number | null; saldoFinal?: number | null; resumo?: any; candidatos?: any[]; transacoes?: any[] }>) {
  const s = sb();
  const { data: row0 } = await s.from("spy_analise").select("parciais, progresso, status, created_at").eq("id", analiseId).maybeSingle();
  if (!row0 || row0.status !== "processando") return; // cancelada/removida
  // TETO GLOBAL: nenhuma análise passa de 5 min. O que não couber vira "faltou
  // por tempo" e fica para reprocessar; a síntese roda com o que deu certo.
  const TETO_MS = 300000, RESERVA_SINTESE_MS = 75000;
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
  const pctLidos = () => 18 + Math.round((parciais.length / Math.max(1, total)) * 58);

  try {
    if (parciais.length === 0) await prog("analisando", 8, "Preparando a leitura", { msg: "Preparando a leitura dos extratos", kind: "step" });

    const pendentes = arquivos.filter((a) => !feitos.has(a.name));
    if (pendentes.length > 0) {
      const INICIO = Date.now();
      const LIMITE_MS = 110000; // janela: para antes do teto e continua em outra
      for (let idx = 0; idx < pendentes.length; idx++) {
        const a = pendentes[idx];
        if (!(await estaViva(s, analiseId))) return; // cancelada
        // Teto de 5 min: reserva tempo pra síntese; o que sobrou fica pra reprocessar.
        if (Date.now() > deadline - RESERVA_SINTESE_MS) {
          for (let k = idx; k < pendentes.length; k++) parciais.push({ name: pendentes[k].name, falhou: true, erro: "tempo excedido (5 min)" });
          await prog("analisando", pctLidos(), "Teto de 5 min", { msg: `Teto de 5 min atingido — ${pendentes.length - idx} extrato(s) ficaram para reprocessar`, kind: "warn" });
          await salvarParciais();
          break;
        }
        if (parciais.length > 0 && Date.now() - INICIO > LIMITE_MS) {
          await prog("analisando", pctLidos(), `Continuando (${parciais.length}/${total})`,
            { msg: `Pausa técnica: já li ${parciais.length}/${total}, continuando os demais...`, kind: "step" });
          await salvarParciais();
          await autoContinuar(analiseId, clienteId, arquivos);
          return; // a próxima janela assume
        }
        await prog("analisando", pctLidos(), `Lendo ${a.name}`, { msg: `Lendo ${a.name}...`, kind: "step" });

        // CAMADA 0 (código): extrato reconciliado pelo saldo → extração PROVADA,
        // não gasta IA. Só entra aqui quando a conta do saldo fechou no navegador.
        const codeTx = (a.reconciliado === true && Array.isArray(a.transacoes))
          ? a.transacoes.filter((t: any) => typeof t?.valor === "number") : [];
        if (codeTx.length >= 3) {
          // Mapeamento NEUTRO: todas as transações, sem IA, sem interpretação.
          const transacoes = codeTx.slice(0, 600).map((t: any) => ({ data: t.data || null, descricao: String(t.descricao || ""), valor: Number(t.valor) || 0 }));
          const ent = Number(a.resumo?.entradas || 0), sai = Number(a.resumo?.saidas || 0);
          parciais.push({ name: a.name, periodo: a.periodo || null, reconciliado: true, transacoes });
          const add: any[] = [{ msg: `${a.name}: ${a.periodo || "período"} · ${transacoes.length} lançamentos mapeados (conferidos pelo saldo) · entra ${brl(ent)}, sai ${brl(sai)}`, kind: "ok" }];
          for (const t of transacoes.slice(0, 6)) add.push({ kind: "tx", data: t.data || "", desc: t.descricao.slice(0, 48), valor: Math.abs(t.valor), sinal: t.valor >= 0 ? 1 : -1 });
          await prog("analisando", pctLidos(), `Quadro de ${a.name} pronto`, add);
          await salvarParciais();
          continue;
        }

        // FALLBACK: não reconciliou (formato esquisito/escaneado) → motor antigo (IA lê o texto).
        let parsed: any = null;
        const texto = String(a.texto || "").trim();
        if (texto.replace(/\s/g, "").length < 40) {
          // Sem texto legível (provável PDF escaneado): marca e segue.
          parciais.push({ name: a.name, falhou: true, erro: "sem texto" });
          await prog("analisando", pctLidos(), `Sem texto em ${a.name}`, { msg: `${a.name}: sem texto legível (escaneado?)`, kind: "warn" });
          await salvarParciais();
          continue;
        }
        let errFile: string | null = null;
        try {
          const content = [
            { type: "input_text", text: `${PROMPT_EXTRACAO}\n\n=== EXTRATO: ${a.name} (texto extraído do PDF) ===\n${texto.slice(0, 120000)}` },
          ];
          parsed = parseJson(await openai(content, 5000, SCHEMA_EXTRACAO, { timeoutMs: 45000, tries: 2 }));
        } catch (e) { parsed = null; errFile = String((e as Error)?.message || e); }
        // Conta OpenAI sem créditos: aborta a análise inteira já no 1º extrato.
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

    // SEM CRUZAMENTO: cada extrato é um quadro isolado. Finaliza quando todos foram lidos.
    if (!(await estaViva(s, analiseId))) return;
    const oks = parciais.filter((p) => !p.falhou)
      .sort((x, y) => String(x.periodo || x.name).localeCompare(String(y.periodo || y.name)));
    const flags = oks.flatMap((p) => (Array.isArray(p.flags) ? p.flags : [])).slice(0, 120);
    const txs = oks.flatMap((p) => (Array.isArray(p.transacoes) ? p.transacoes : []));

    // Conta OpenAI sem créditos e nada reconciliado: falha com mensagem clara.
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
      const rows = txs.slice(0, 800).map((t: any) => ({
        analise_id: analiseId, cliente_id: clienteId,
        data: normalizeDate(t.data),
        valor: Math.abs(Number(t.valor) || 0),
        sinal: Number(t.valor) >= 0 ? 1 : -1,
        saldo: null, descricao: t.descricao || null,
      }));
      const { error: eTx } = await s.from("spy_transacao").insert(rows);
      if (eTx) { for (const row of rows) { await s.from("spy_transacao").insert(row); } }
    }
    if (flags.length) {
      await s.from("spy_flag").insert(flags.slice(0, 100).map((f: any) => ({
        analise_id: analiseId, cliente_id: clienteId, eixo: f.eixo || null, codigo: f.codigo || null, label: f.label || null,
        valor: f.valor && typeof f.valor === "object" ? f.valor : {}, confianca: typeof f.confianca === "number" ? f.confianca : null,
        origem: "llm", evidencia: f.evidencia || null,
      })));
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
    const arquivos = (body.arquivos as Array<{ id: string; name: string; texto?: string; mimeType?: string; periodo?: string; header?: string; reconciliado?: boolean; saldoInicial?: number | null; saldoFinal?: number | null; resumo?: any; candidatos?: any[]; transacoes?: any[] }> | undefined) || [];
    const retomar = body.retomar as string | undefined;
    const reprocessar = body.reprocessar as string | undefined;
    if (!clienteId) return j({ error: "cliente_id obrigatorio" }, 400);
    if (!arquivos.length) return j({ error: "selecione ao menos um documento" }, 400);
    if (arquivos.length > 12) return j({ error: "máximo de 12 documentos por análise" }, 400);
    if (!Deno.env.get("OPENAI_API_KEY")) return j({ error: "OPENAI_API_KEY nao configurado" }, 500);

    // Continuação (a própria função se reinicia para ler os extratos restantes).
    if (retomar) {
      const task = pipeline(retomar, clienteId, arquivos);
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(task);
      else await task;
      return j({ ok: true, analise_id: retomar, background: true, retomando: true }, 202);
    }

    // Reprocessar: cria uma NOVA análise reaproveitando os extratos que já deram
    // certo (seed) e reprocessando só os reenviados; a síntese re-cruza tudo. A
    // created_at nova reinicia o teto de 5 min; a unicidade apaga a antiga no fim.
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

    // Idempotência: se já há uma análise ATIVA (atualizada há < 2 min) pra esse
    // cliente, devolve ela. Se estiver parada/antiga, descarta e cria nova.
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
