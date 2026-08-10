// spy-insights (AW SPY). Roteiro comercial em 2 camadas:
//
// CAMADA A (código, R$0): lê as transações já mapeadas (spy_analise.parciais)
// e computa o DIGEST determinístico do roteiro — renda, instituições, créditos,
// sequência de empréstimos, sinais de refinanciamento (janela temporal),
// sazonalidade, contrapartes PIX, estabelecimentos, tarifas, mudanças bruscas.
// Todo número citado vem daqui (a IA não conta dinheiro).
//
// CAMADA B (IA, 1 chamada): recebe o digest e escreve APENAS o que exige
// julgamento e linguagem: prioridades 🔴🟡🟢 com ficha completa (o que
// encontramos → o que pode representar → pergunta pronta → documento),
// narrativa da história financeira e resumo comercial.
//
// REGRA DE OURO (do roteiro): a IA NUNCA afirma direito ou irregularidade.
// Sempre "ponto de atenção" + o que verificar.
//
// Resultado salvo em spy_analise.resumo.insights (regerável sob demanda).
// Secrets: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const MODELO = "gpt-4o-mini";
const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const brl = (n: number) => `R$ ${(Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Dicionário de instituições financeiras (bancos, fintechs, financeiras) ───
const INSTS: { re: RegExp; nome: string; tipo: string }[] = [
  { re: /BRADESCO/i, nome: "Bradesco", tipo: "banco" },
  { re: /ITAU|ITAÚ/i, nome: "Itaú", tipo: "banco" },
  { re: /SANTANDER/i, nome: "Santander", tipo: "banco" },
  { re: /CAIXA ECON|\bCEF\b/i, nome: "Caixa Econômica", tipo: "banco" },
  { re: /BANCO DO BRASIL|BCO BRASIL|BCO DO BRASIL/i, nome: "Banco do Brasil", tipo: "banco" },
  { re: /\bINTER\b/i, nome: "Banco Inter", tipo: "banco digital" },
  { re: /\bC6\b/i, nome: "C6 Bank", tipo: "banco digital" },
  { re: /NUBANK|NU PAGAMENTOS/i, nome: "Nubank", tipo: "fintech" },
  { re: /PAGSEGURO|PAGBANK/i, nome: "PagBank", tipo: "fintech" },
  { re: /MERCADO ?PAGO/i, nome: "Mercado Pago", tipo: "fintech" },
  { re: /PICPAY/i, nome: "PicPay", tipo: "fintech" },
  { re: /\bNEON\b/i, nome: "Neon", tipo: "fintech" },
  { re: /WILL ?BANK/i, nome: "Will Bank", tipo: "fintech" },
  { re: /CREFISA/i, nome: "Crefisa", tipo: "financeira" },
  { re: /AGIBANK/i, nome: "Agibank", tipo: "financeira" },
  { re: /\bBMG\b/i, nome: "BMG", tipo: "financeira" },
  { re: /\bPAN\b/i, nome: "Banco Pan", tipo: "financeira" },
  { re: /\bFACTA\b/i, nome: "Facta", tipo: "financeira" },
  { re: /LOSANGO/i, nome: "Losango", tipo: "financeira" },
  { re: /\bOMNI\b/i, nome: "Omni", tipo: "financeira" },
  { re: /CREDSYSTEM/i, nome: "Credsystem", tipo: "financeira" },
  { re: /MIDWAY/i, nome: "Midway (Riachuelo)", tipo: "financeira de varejo" },
  { re: /RIACHUELO/i, nome: "Riachuelo", tipo: "varejo com crédito" },
  { re: /RENNER|REALIZE/i, nome: "Renner/Realize", tipo: "varejo com crédito" },
  { re: /PERNAMBUCANAS/i, nome: "Pernambucanas", tipo: "varejo com crédito" },
  { re: /CASAS BAHIA|VIA VAREJO/i, nome: "Casas Bahia", tipo: "varejo com crédito" },
  { re: /MAGALU|LUIZACRED|MAGAZINE LUIZA/i, nome: "Magalu/Luizacred", tipo: "varejo com crédito" },
  { re: /CARREFOUR|\bCSF\b/i, nome: "Carrefour", tipo: "varejo com crédito" },
  { re: /SICOOB/i, nome: "Sicoob", tipo: "cooperativa" },
  { re: /SICREDI/i, nome: "Sicredi", tipo: "cooperativa" },
  { re: /\bBV\b|VOTORANTIM/i, nome: "Banco BV", tipo: "financeira" },
  { re: /DAYCOVAL/i, nome: "Daycoval", tipo: "banco" },
  { re: /\bSAFRA\b/i, nome: "Safra", tipo: "banco" },
];

const CATS: { key: string; re: RegExp }[] = [
  { key: "renda", re: /SALARIO|SAL P\/CC|BENEFICIO|APOSENTAD|\bINSS\b|PREFEITURA|SECRETARIA|PENSAO|PROVENTO|VENCIMENTO|BOLSA FAMILIA|AUXILIO/i },
  { key: "credito", re: /EMPRESTIMO|CONSIGNAD|CREDITO PESSOAL|FINANCIAMENTO|PARCELA.*CONTR|LIQUID\.?\s*CONTRATO|CREDIARIO|ENCARGO|MORA CREDITO|MORA CARTAO|\bCCB\b/i },
  { key: "cartao", re: /CARTAO|FATURA/i },
  { key: "tarifa", re: /TARIFA|CESTA|ANUIDADE|\bIOF\b|PACOTE SERV|MANUTENC/i },
  { key: "alimentacao", re: /MERCAD|SUPERMERC|PADARIA|ACOUGUE|IFOOD|RESTAURANT|LANCHON|ATACAD|HORTIFRUT/i },
  { key: "transporte", re: /POSTO|COMBUST|GASOLINA|\bUBER\b|\b99\b|ESTACIONAM|PEDAGIO|Indigo|PARK/i },
  { key: "saude", re: /FARMAC|DROGA|HOSPITAL|CLINICA|LABORAT|UNIMED|ODONTO|HAPVIDA/i },
  { key: "telecom", re: /CLARO|VIVO|\bTIM\b|\bOI\b|INTERNET|TELEFONE|NET SERV/i },
  { key: "saque", re: /SAQUE|DINHEIRO ATM|BANCO 24H|CORBAN/i },
  { key: "investimento", re: /INVEST FACIL|APLIC|RESGATE|POUPANCA/i },
  { key: "pix", re: /\bPIX\b|TRANSF|TED|DOC/i },
];
const catDe = (d: string) => { for (const c of CATS) if (c.re.test(d)) return c.key; return "outro"; };

const dias = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
const norm = (s: string) => s.toUpperCase().replace(/\d{2}\/\d{2}/g, "").replace(/[0-9*./-]{4,}/g, "").replace(/\s+/g, " ").trim();

interface Tx { data: string | null; descricao: string; valor: number }

// ── CAMADA A: digest determinístico (todo número citado nasce aqui) ──────────
function montarDigest(txs: Tx[]) {
  const comData = txs.filter((t) => t.data).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  const periodo = comData.length ? { de: comData[0].data, ate: comData[comData.length - 1].data } : { de: null, ate: null };

  // por mês
  const meses: Record<string, { entradas: number; saidas: number; renda: number; emprestimos: number; emprestimos_valor: number; cartao_saida: number }> = {};
  for (const t of comData) {
    const m = String(t.data).slice(0, 7);
    const r = (meses[m] ||= { entradas: 0, saidas: 0, renda: 0, emprestimos: 0, emprestimos_valor: 0, cartao_saida: 0 });
    if (t.valor > 0) r.entradas += t.valor; else r.saidas += Math.abs(t.valor);
    const cat = catDe(t.descricao);
    if (cat === "renda" && t.valor > 0) r.renda += t.valor;
    if (cat === "cartao" && t.valor < 0) r.cartao_saida += Math.abs(t.valor);
  }

  // renda: fontes e evolução
  const rendaTx = comData.filter((t) => t.valor > 0 && catDe(t.descricao) === "renda");
  const fontes = new Map<string, { n: number; total: number }>();
  for (const t of rendaTx) { const k = norm(t.descricao).slice(0, 60); const f = fontes.get(k) || { n: 0, total: 0 }; f.n++; f.total += t.valor; fontes.set(k, f); }
  const rendaMeses = Object.entries(meses).filter(([, v]) => v.renda > 0);
  const rendaMediaMensal = rendaMeses.length ? rendaMeses.reduce((s, [, v]) => s + v.renda, 0) / rendaMeses.length : 0;

  // créditos que ENTRARAM (possíveis empréstimos): exclui estornos de parcela/mora
  // (linhas de pagamento que aparecem positivas) e valores irrisórios.
  const creditosIn = comData.filter((t) => t.valor >= 100
      && /EMPRESTIMO|CREDITO PESSOAL|CONSIGNAD|FINANCIAMENTO|\bCCB\b|CREFISA|AGIBANK|\bBMG\b/i.test(t.descricao)
      && !/PARCELA|MORA |ENCARGO|LIQUID/i.test(t.descricao))
    .map((t) => ({ data: t.data, valor: t.valor, descricao: t.descricao.slice(0, 80) }));
  // pagamentos de crédito (parcelas, liquidações, encargos)
  const pagamentosCred = comData.filter((t) => t.valor < 0 && catDe(t.descricao) === "credito")
    .map((t) => ({ data: t.data, valor: Math.abs(t.valor), descricao: t.descricao.slice(0, 80) }));

  // sequência de empréstimos + intervalos
  for (const c of creditosIn as any[]) c.dias_desde_anterior = null;
  for (let i = 1; i < creditosIn.length; i++) (creditosIn[i] as any).dias_desde_anterior = Math.round(dias(String(creditosIn[i].data), String(creditosIn[i - 1].data)));
  const rendaM = rendaMediaMensal || 1;
  for (const c of creditosIn as any[]) c.pct_da_renda_mensal = Math.round((c.valor / rendaM) * 100);

  // sinais de refinanciamento: crédito entrando com pagamento relevante a crédito em ±7 dias
  const refiSinais: any[] = [];
  for (const c of creditosIn) {
    const perto = pagamentosCred.filter((p) => dias(String(p.data), String(c.data)) <= 7);
    const totalPerto = perto.reduce((s, p) => s + p.valor, 0);
    if (totalPerto >= c.valor * 0.3 && perto.length) {
      refiSinais.push({ credito: c, pagamentos_proximos: perto.slice(0, 5), total_pago_na_janela: +totalPerto.toFixed(2) });
    }
  }

  // instituições no texto
  const instituicoes: any[] = [];
  for (const inst of INSTS) {
    const hits = comData.filter((t) => inst.re.test(t.descricao));
    if (!hits.length) continue;
    instituicoes.push({
      nome: inst.nome, tipo: inst.tipo, ocorrencias: hits.length,
      primeira: hits[0].data, ultima: hits[hits.length - 1].data,
      recebido: +hits.filter((t) => t.valor > 0).reduce((s, t) => s + t.valor, 0).toFixed(2),
      pago: +hits.filter((t) => t.valor < 0).reduce((s, t) => s + Math.abs(t.valor), 0).toFixed(2),
    });
  }

  // contrapartes PIX/transferências
  const contrapartes = new Map<string, { enviado: number; recebido: number; n: number }>();
  for (const t of comData) {
    const m = t.descricao.match(/(?:DES|REM|DEST)\.?:?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .]{2,40})/);
    if (!m) continue;
    const k = norm(m[1]).slice(0, 40);
    if (!k || k.length < 3) continue;
    const c = contrapartes.get(k) || { enviado: 0, recebido: 0, n: 0 };
    c.n++; if (t.valor < 0) c.enviado += Math.abs(t.valor); else c.recebido += t.valor;
    contrapartes.set(k, c);
  }
  const topContrapartes = [...contrapartes.entries()].sort((a, b) => (b[1].enviado + b[1].recebido) - (a[1].enviado + a[1].recebido)).slice(0, 15)
    .map(([nome, v]) => ({ nome, n: v.n, enviado: +v.enviado.toFixed(2), recebido: +v.recebido.toFixed(2) }));

  // estabelecimentos por categoria
  const porCat: Record<string, Map<string, { n: number; total: number }>> = {};
  for (const t of comData) {
    if (t.valor >= 0) continue;
    const cat = catDe(t.descricao);
    if (!["alimentacao", "transporte", "saude", "telecom"].includes(cat)) continue;
    const k = norm(t.descricao.replace(/COMPRA ELO DEBITO VISTA|PAGTO ELETRONICO|COMPRA CARTAO/gi, "")).slice(0, 45);
    if (!k) continue;
    const m = (porCat[cat] ||= new Map());
    const e = m.get(k) || { n: 0, total: 0 };
    e.n++; e.total += Math.abs(t.valor); m.set(k, e);
  }
  const estabelecimentos: Record<string, any[]> = {};
  for (const [cat, m] of Object.entries(porCat)) {
    estabelecimentos[cat] = [...m.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8)
      .map(([nome, v]) => ({ nome, n: v.n, total: +v.total.toFixed(2) }));
  }

  // tarifas/encargos e saques
  const tarifas = comData.filter((t) => t.valor < 0 && catDe(t.descricao) === "tarifa");
  const encargos = comData.filter((t) => t.valor < 0 && /ENCARGO|MORA /i.test(t.descricao));
  const saques = comData.filter((t) => t.valor < 0 && catDe(t.descricao) === "saque");

  // mudanças bruscas
  const mesesArr = Object.entries(meses).sort((a, b) => a[0].localeCompare(b[0]));
  const mediaSaidas = mesesArr.length ? mesesArr.reduce((s, [, v]) => s + v.saidas, 0) / mesesArr.length : 0;
  const mudancas: any[] = [];
  for (const [m, v] of mesesArr) {
    if (mediaSaidas && v.saidas > mediaSaidas * 1.6) mudancas.push({ mes: m, tipo: "saidas_acima_do_normal", saidas: +v.saidas.toFixed(2), media: +mediaSaidas.toFixed(2) });
    if (rendaMediaMensal && v.renda > 0 && v.renda < rendaMediaMensal * 0.55) mudancas.push({ mes: m, tipo: "queda_de_renda", renda: +v.renda.toFixed(2), media: +rendaMediaMensal.toFixed(2) });
  }

  // maiores movimentações
  const maioresEntradas = [...comData].filter((t) => t.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, 8)
    .map((t) => ({ data: t.data, valor: t.valor, descricao: t.descricao.slice(0, 70) }));
  const maioresSaidas = [...comData].filter((t) => t.valor < 0).sort((a, b) => a.valor - b.valor).slice(0, 8)
    .map((t) => ({ data: t.data, valor: t.valor, descricao: t.descricao.slice(0, 70) }));

  return {
    periodo,
    total_transacoes: comData.length,
    renda: {
      media_mensal: +rendaMediaMensal.toFixed(2),
      meses_com_renda: rendaMeses.length,
      fontes: [...fontes.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5).map(([nome, v]) => ({ nome, n: v.n, total: +v.total.toFixed(2) })),
      por_mes: Object.fromEntries(mesesArr.map(([m, v]) => [m, +v.renda.toFixed(2)])),
    },
    fluxo_mensal: Object.fromEntries(mesesArr.map(([m, v]) => [m, { entradas: +v.entradas.toFixed(2), saidas: +v.saidas.toFixed(2), cartao: +v.cartao_saida.toFixed(2) }])),
    creditos_recebidos: creditosIn.slice(0, 40),
    pagamentos_de_credito: { n: pagamentosCred.length, total: +pagamentosCred.reduce((s, p) => s + p.valor, 0).toFixed(2), amostra: pagamentosCred.slice(0, 15) },
    sinais_refinanciamento: refiSinais.slice(0, 10),
    instituicoes,
    contrapartes_pix: topContrapartes,
    estabelecimentos,
    tarifas: { n: tarifas.length, total: +tarifas.reduce((s, t) => s + Math.abs(t.valor), 0).toFixed(2) },
    encargos_mora: { n: encargos.length, total: +encargos.reduce((s, t) => s + Math.abs(t.valor), 0).toFixed(2), amostra: encargos.slice(0, 10).map((t) => ({ data: t.data, valor: t.valor, descricao: t.descricao.slice(0, 70) })) },
    saques: { n: saques.length, total: +saques.reduce((s, t) => s + Math.abs(t.valor), 0).toFixed(2) },
    mudancas_bruscas: mudancas.slice(0, 12),
    maiores_entradas: maioresEntradas,
    maiores_saidas: maioresSaidas,
  };
}

// ── CAMADA B: 1 chamada de IA ────────────────────────────────────────────────
const SCHEMA_INSIGHTS = {
  type: "json_schema", name: "insights_spy", strict: true,
  schema: {
    type: "object", additionalProperties: false,
    required: ["resumo_comercial", "prioridades", "narrativa"],
    properties: {
      resumo_comercial: {
        type: "object", additionalProperties: false,
        required: ["renda_identificada", "instituicoes", "emprestimos", "primeiro_credito", "periodo_maior_contratacao", "principais_relacoes"],
        properties: {
          renda_identificada: { type: "string" }, instituicoes: { type: "string" }, emprestimos: { type: "string" },
          primeiro_credito: { type: "string" }, periodo_maior_contratacao: { type: "string" }, principais_relacoes: { type: "string" },
        },
      },
      prioridades: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          required: ["nivel", "titulo", "o_que_encontramos", "o_que_pode_representar", "pergunta", "documento"],
          properties: {
            nivel: { type: "string", enum: ["alta", "media", "baixa"] },
            titulo: { type: "string" }, o_que_encontramos: { type: "string" }, o_que_pode_representar: { type: "string" },
            pergunta: { type: "string" }, documento: { type: "string" },
          },
        },
      },
      narrativa: { type: "string" },
    },
  },
};

const PROMPT_INSIGHTS = `Você é o analista comercial do AW SPY, de um escritório de advocacia do consumidor. Recebe abaixo um DIGEST computado por código a partir dos extratos bancários de um cliente: todos os números são exatos e auditáveis. Use SOMENTE esses fatos. NÃO invente valores, datas ou instituições.

REGRA DE OURO: você NUNCA afirma que existe um direito ou uma irregularidade. Você diz "identificamos um ponto de atenção" e indica o que verificar. A análise jurídica é humana.

Produza:

1. "resumo_comercial": campos curtos e objetivos (renda identificada com valor médio mensal e fonte; quantas e quais instituições; quantos empréstimos identificados e total; data do primeiro crédito; período de maior contratação; principais relações de consumo).

2. "prioridades": 3 a 8 fichas classificadas em "alta" (operação que merece contato imediato e pedido de documentos: empréstimos relevantes, sinais de refinanciamento, encargos/mora recorrentes), "media" (sinal que exige conversa) e "baixa" (relação de consumo identificada). Cada ficha com: titulo curto; o_que_encontramos (com data e valor REAIS do digest); o_que_pode_representar (sempre em tom de possibilidade); pergunta (pergunta PRONTA, na segunda pessoa, para o atendente fazer ao cliente); documento (qual documento solicitar, ex.: contrato/CCB, comprovante de liberação, faturas).

3. "narrativa": a história financeira do cliente em 1 parágrafo corrido e humano: como era o padrão, quando surgiram créditos, como evoluiu o endividamento, meses de aperto, situação atual. Cite meses/valores reais. Sem travessão.

Escreva tudo em português do Brasil, tom profissional e direto.`;

async function openaiCall(prompt: string, timeoutMs: number): Promise<any> {
  const key = Deno.env.get("OPENAI_API_KEY");
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const r = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model: MODELO, input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }], max_output_tokens: 6000, temperature: 0.3, text: { format: SCHEMA_INSIGHTS } }),
          signal: ac.signal,
        });
        if (!r.ok) throw new Error(`openai ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const d = await r.json();
        let txt = d.output_text;
        if (!txt && Array.isArray(d.output)) for (const o of d.output) for (const c of (o.content || [])) if (typeof c.text === "string") { txt = c.text; break; }
        if (!txt) throw new Error("resposta vazia");
        return JSON.parse(String(txt).replace(/^```json\s*|```$/g, "").trim());
      } catch (e) {
        if (ac.signal.aborted) throw new Error("timeout_openai");
        if (attempt === 2) throw e;
      }
    }
  } finally { clearTimeout(timer); }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({} as any));
    const clienteId = body.cliente_id as string | undefined;
    let analiseId = body.analise_id as string | undefined;
    if (!clienteId) return j({ error: "cliente_id obrigatorio" }, 400);
    if (!Deno.env.get("OPENAI_API_KEY")) return j({ error: "OPENAI_API_KEY nao configurado" }, 500);

    const s = sb();
    let q = s.from("spy_analise").select("id, parciais, resumo, status").eq("cliente_id", clienteId).eq("status", "concluida").order("created_at", { ascending: false }).limit(1);
    if (analiseId) q = s.from("spy_analise").select("id, parciais, resumo, status").eq("id", analiseId).limit(1) as any;
    const { data: rows, error } = await q;
    if (error) return j({ error: error.message }, 500);
    const a = rows?.[0];
    if (!a) return j({ error: "nenhuma análise concluída para este cliente" }, 404);
    analiseId = a.id;

    // Junta as transações de todos os quadros (mapeadas por código ou por IA).
    const parciais: any[] = Array.isArray(a.parciais) ? a.parciais : [];
    const txs: Tx[] = parciais.filter((p) => !p.falhou && Array.isArray(p.transacoes))
      .flatMap((p) => p.transacoes)
      .filter((t: any) => typeof t?.valor === "number")
      .slice(0, 6000);
    if (txs.length < 5) return j({ error: "poucas transações mapeadas para gerar insights" }, 400);

    // CAMADA A: digest por código.
    const digest = montarDigest(txs);

    // CAMADA B: 1 chamada.
    const insights = await openaiCall(`${PROMPT_INSIGHTS}\n\n=== DIGEST (computado por código, números exatos) ===\n${JSON.stringify(digest)}`, 90000);
    if (!insights?.prioridades) return j({ error: "IA não retornou insights válidos" }, 502);

    const resumoNovo = { ...(a.resumo && typeof a.resumo === "object" ? a.resumo : {}), insights, insights_em: new Date().toISOString() };
    await s.from("spy_analise").update({ resumo: resumoNovo, updated_at: new Date().toISOString() }).eq("id", analiseId);

    return j({ ok: true, analise_id: analiseId, insights });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    return j({ error: /timeout/i.test(msg) ? "a geração demorou demais, tente novamente" : msg }, 500);
  }
});
