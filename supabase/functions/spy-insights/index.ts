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
      recorrencia: hits.length >= 3 ? "recorrente" : hits.length === 1 ? "aparece 1x" : "ocasional",
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

  // CONTRATOS de crédito: agrupa as parcelas pelo número do contrato que aparece
  // no histórico ("CONTR 466465593 PARC 017/096") — dá parcelas pagas, valor
  // médio, total do plano (x/096), mora e vigência de cada contrato.
  const contratos = new Map<string, any>();
  for (const t of comData) {
    if (t.valor >= 0) continue;
    const m = t.descricao.match(/CONTR[ATO.\s]*(\d{6,})(?:\s*PARC\s*(\d+)\/(\d+))?/i);
    if (!m) continue;
    const id = m[1];
    const c = contratos.get(id) || { contrato: id, parcelas_pagas: 0, total_pago: 0, parcelas_plano: null, primeira: t.data, ultima: t.data, exemplo: t.descricao.slice(0, 70), mora: 0 };
    c.parcelas_pagas++; c.total_pago += Math.abs(t.valor); c.ultima = t.data;
    if (m[3]) c.parcelas_plano = parseInt(m[3], 10);
    if (/MORA/i.test(t.descricao)) c.mora += Math.abs(t.valor);
    contratos.set(id, c);
  }
  const contratosArr = [...contratos.values()]
    .map((c) => ({ ...c, total_pago: +c.total_pago.toFixed(2), mora: +c.mora.toFixed(2), parcela_media: +(c.total_pago / c.parcelas_pagas).toFixed(2) }))
    .sort((a, b) => b.total_pago - a.total_pago).slice(0, 15);

  // Indícios de VEÍCULO: gasto com combustível mês a mês; se surgiu no meio do
  // período (antes não havia), é indício de veículo recente.
  const combustivel = comData.filter((t) => t.valor < 0 && /POSTO|COMBUST|GASOLINA/i.test(t.descricao));
  const combMeses = new Map<string, number>();
  for (const t of combustivel) { const m = String(t.data).slice(0, 7); combMeses.set(m, (combMeses.get(m) || 0) + Math.abs(t.valor)); }
  const mesesTodos = mesesArr.map(([m]) => m);
  const primeiroComb = combustivel.length ? String(combustivel[0].data).slice(0, 7) : null;
  const veiculo = {
    abastecimentos: combustivel.length,
    total: +combustivel.reduce((s, t) => s + Math.abs(t.valor), 0).toFixed(2),
    media_mensal_quando_ha: combMeses.size ? +([...combMeses.values()].reduce((a, b) => a + b, 0) / combMeses.size).toFixed(2) : 0,
    primeiro_mes: primeiroComb,
    ultimo_mes: combustivel.length ? String(combustivel[combustivel.length - 1].data).slice(0, 7) : null,
    meses_com_gasto: combMeses.size,
    meses_no_periodo: mesesTodos.length,
    surgiu_no_meio_do_periodo: !!(primeiroComb && mesesTodos.length > 3 && mesesTodos.indexOf(primeiroComb) > 2),
  };

  // ROTATIVO / cheque especial: encargos de limite de crédito.
  const rotativoTx = comData.filter((t) => t.valor < 0 && /ENCARGOS? LIMITE|ADIANT.*DEPOSIT|CHEQUE ESPECIAL|JUROS.*(LIMITE|CHEQ)/i.test(t.descricao));
  const rotativo = { n: rotativoTx.length, total: +rotativoTx.reduce((s, t) => s + Math.abs(t.valor), 0).toFixed(2), primeiro: rotativoTx[0]?.data ?? null, ultimo: rotativoTx[rotativoTx.length - 1]?.data ?? null };

  // Comprometimento mensal da renda com crédito.
  const pagCredMes = new Map<string, number>();
  for (const p of pagamentosCred) { const m = String(p.data).slice(0, 7); pagCredMes.set(m, (pagCredMes.get(m) || 0) + p.valor); }
  const comprometimento = Object.fromEntries(mesesArr.map(([m, v]) => [m, { pago_credito: +((pagCredMes.get(m) || 0)).toFixed(2), pct_da_renda: v.renda > 0 ? Math.round(((pagCredMes.get(m) || 0) / v.renda) * 100) : null }]));
  const maiorConcentracao = [...pagCredMes.entries()].sort((a, b) => b[1] - a[1])[0] || null;

  // Eventos da linha do endividamento (fatos, em ordem cronológica).
  const eventos: any[] = [];
  const primeiroEncargo = comData.find((t) => t.valor < 0 && /ENCARGO|MORA |JUROS/i.test(t.descricao));
  if (primeiroEncargo) eventos.push({ marco: "primeiro_sinal_endividamento", data: primeiroEncargo.data, detalhe: primeiroEncargo.descricao.slice(0, 70), valor: primeiroEncargo.valor });
  if (creditosIn[0]) eventos.push({ marco: "primeiro_emprestimo", data: creditosIn[0].data, detalhe: creditosIn[0].descricao, valor: creditosIn[0].valor });
  if (rotativo.primeiro) eventos.push({ marco: "entrada_no_rotativo", data: rotativo.primeiro, detalhe: "primeiro encargo de limite de crédito/cheque especial" });
  for (const c of creditosIn.slice(1, 9)) eventos.push({ marco: "novo_emprestimo", data: c.data, detalhe: c.descricao, valor: c.valor });
  for (const rf of refiSinais.slice(0, 5)) eventos.push({ marco: "possivel_renegociacao", data: rf.credito.data, detalhe: `crédito de ${brl(rf.credito.valor)} com ${rf.pagamentos_proximos.length} pagamento(s) de crédito na mesma janela` });
  if (maiorConcentracao) eventos.push({ marco: "maior_concentracao_de_dividas", data: `${maiorConcentracao[0]}-01`, detalhe: "mês com maior pagamento a crédito do período", valor: +maiorConcentracao[1].toFixed(2) });
  eventos.sort((a, b) => String(a.data).localeCompare(String(b.data)));

  // CARTÕES: faturas/gastos de cartão mês a mês (evolução), mora de cartão
  // (indício de pagamento parcial/rotativo) e anuidades.
  const cartaoTx = comData.filter((t) => t.valor < 0 && /GASTOS CARTAO|FATURA|PAGTO CARTAO|MORA CARTAO|ANUIDADE/i.test(t.descricao));
  const cartaoMes = new Map<string, number>();
  for (const t of cartaoTx) { const m = String(t.data).slice(0, 7); cartaoMes.set(m, (cartaoMes.get(m) || 0) + Math.abs(t.valor)); }
  const moraCartao = cartaoTx.filter((t) => /MORA CARTAO/i.test(t.descricao));
  const cartoes = {
    pagamentos: cartaoTx.length,
    total: +cartaoTx.reduce((s, t) => s + Math.abs(t.valor), 0).toFixed(2),
    faturas_por_mes: Object.fromEntries([...cartaoMes.entries()].sort()),
    mora_cartao: { n: moraCartao.length, total: +moraCartao.reduce((s, t) => s + Math.abs(t.valor), 0).toFixed(2) },
  };

  // VAREJO por segmento (com sinalização de loja com cartão próprio/crediário).
  const SEGMENTOS: { seg: string; re: RegExp }[] = [
    { seg: "roupas_departamento", re: /RAMSONS|RENNER|RIACHUELO|C&A|MARISA|PERNAMBUCANAS|HAVAN|BELLAS MODAS|FASHION|LOJAS AMERICANAS|MODAS/i },
    { seg: "supermercado_atacado", re: /SUPERMERC|MERCAD(?!O ?PAGO)|ATACAD|ASSAI|CARREFOUR|DB\b|NOVA ERA|PANIFICADORA|COMERCIAL/i },
    { seg: "farmacia", re: /FARMAC|DROGA|PAGUE MENOS|FARMABEM/i },
    { seg: "marketplace", re: /SHOPEE|MERCADO ?LIVRE|AMAZON|ALIEXPRESS|SHEIN|MAGALU|AMERICANAS\.?COM/i },
  ];
  const COM_CREDITO_PROPRIO = /BEMOL|RIACHUELO|RENNER|MARISA|PERNAMBUCANAS|CASAS BAHIA|MAGALU|AMERICANAS|HAVAN|RAMSONS/i;
  const varejo: Record<string, any[]> = {};
  for (const { seg, re } of SEGMENTOS) {
    const m = new Map<string, { n: number; total: number; primeiro: any; ultimo: any }>();
    for (const t of comData) {
      if (t.valor >= 0 || !re.test(t.descricao)) continue;
      const k = norm(t.descricao.replace(/COMPRA ELO DEBITO VISTA|PAGTO ELETRONICO|COMPRA CARTAO/gi, "")).slice(0, 45);
      if (!k) continue;
      const e = m.get(k) || { n: 0, total: 0, primeiro: t.data, ultimo: t.data };
      e.n++; e.total += Math.abs(t.valor); e.ultimo = t.data; m.set(k, e);
    }
    varejo[seg] = [...m.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 8)
      .map(([nome, v]) => ({ nome, n: v.n, total: +v.total.toFixed(2), media: +(v.total / v.n).toFixed(2), primeiro: v.primeiro, ultimo: v.ultimo, credito_proprio_conhecido: COM_CREDITO_PROPRIO.test(nome) }));
  }

  // SUPERMERCADOS, modelo de consumo: 1ª metade vs 2ª metade do período.
  const superTx = comData.filter((t) => t.valor < 0 && /SUPERMERC|MERCAD(?!O ?PAGO)|ATACAD|ASSAI|CARREFOUR|NOVA ERA|DB\b/i.test(t.descricao));
  const meio = Math.floor(mesesTodos.length / 2);
  const metade1 = new Set(mesesTodos.slice(0, meio)), metade2 = new Set(mesesTodos.slice(meio));
  const superConsumo = {
    n: superTx.length,
    total: +superTx.reduce((s, t) => s + Math.abs(t.valor), 0).toFixed(2),
    gasto_medio_por_compra: superTx.length ? +(superTx.reduce((s, t) => s + Math.abs(t.valor), 0) / superTx.length).toFixed(2) : 0,
    total_primeira_metade: +superTx.filter((t) => metade1.has(String(t.data).slice(0, 7))).reduce((s, t) => s + Math.abs(t.valor), 0).toFixed(2),
    total_segunda_metade: +superTx.filter((t) => metade2.has(String(t.data).slice(0, 7))).reduce((s, t) => s + Math.abs(t.valor), 0).toFixed(2),
  };

  // TELECOM: operadoras, recorrência e mudança de valor.
  const telecomTx = comData.filter((t) => t.valor < 0 && /CLARO|VIVO|\bTIM\b|\bOI\b|INTERNET|TELEFONE|CONTA DE TELEFONE|NET SERV|SKY\b/i.test(t.descricao));
  const telecomMap = new Map<string, { n: number; total: number; valores: number[] }>();
  for (const t of telecomTx) {
    const k = norm(t.descricao).slice(0, 40) || "TELECOM";
    const e = telecomMap.get(k) || { n: 0, total: 0, valores: [] };
    e.n++; e.total += Math.abs(t.valor); e.valores.push(Math.abs(t.valor)); telecomMap.set(k, e);
  }
  const telecom = [...telecomMap.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 6)
    .map(([nome, v]) => ({ nome, n: v.n, total: +v.total.toFixed(2), menor: +Math.min(...v.valores).toFixed(2), maior: +Math.max(...v.valores).toFixed(2) }));

  // SAZONALIDADE (mês do ano, agregando todos os anos).
  const porMesAno: Record<string, { emprestimos: number; cartao: number; saidas: number }> = {};
  for (let mm = 1; mm <= 12; mm++) porMesAno[String(mm).padStart(2, "0")] = { emprestimos: 0, cartao: 0, saidas: 0 };
  for (const c of creditosIn) porMesAno[String(c.data).slice(5, 7)].emprestimos++;
  for (const [m, v] of cartaoMes) porMesAno[m.slice(5, 7)].cartao += v;
  for (const [m, v] of mesesArr) porMesAno[m.slice(5, 7)].saidas += v.saidas;
  const sazonalidade = Object.fromEntries(Object.entries(porMesAno).map(([m, v]) => [m, { emprestimos: v.emprestimos, cartao: +v.cartao.toFixed(2), saidas: +v.saidas.toFixed(2) }]));

  // PIX RELEVANTES: com instituições financeiras e entradas seguidas de saídas.
  const pixInstituicoes = comData.filter((t) => /PIX|TRANSF|TED/i.test(t.descricao) && INSTS.some((i) => i.re.test(t.descricao)))
    .slice(0, 20).map((t) => ({ data: t.data, valor: t.valor, descricao: t.descricao.slice(0, 70) }));
  const entradaSeguida: any[] = [];
  for (let i = 0; i < comData.length; i++) {
    const t = comData[i];
    if (t.valor < 1000) continue;
    let saiu = 0;
    for (let k = i + 1; k < comData.length && dias(String(comData[k].data), String(t.data)) <= 2; k++) if (comData[k].valor < 0) saiu += Math.abs(comData[k].valor);
    if (saiu >= t.valor * 0.7) entradaSeguida.push({ entrada: { data: t.data, valor: t.valor, descricao: t.descricao.slice(0, 60) }, saidas_em_48h: +saiu.toFixed(2) });
  }

  return {
    contratos: contratosArr,
    veiculo,
    rotativo,
    cartoes,
    varejo,
    supermercados_consumo: superConsumo,
    telecom,
    sazonalidade_mes_do_ano: sazonalidade,
    pix_com_instituicoes: pixInstituicoes,
    entradas_seguidas_de_saidas: entradaSeguida.slice(0, 10),
    comprometimento_mensal: comprometimento,
    linha_endividamento_eventos: eventos.slice(0, 18),
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
    required: ["resumo_comercial", "emprestimos", "linha_endividamento", "prioridades", "narrativa"],
    properties: {
      emprestimos: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          required: ["data", "valor", "detalhe", "parcelas", "pergunta", "documento"],
          properties: {
            data: { type: "string" }, valor: { type: "string" }, detalhe: { type: "string" },
            parcelas: { type: "string" }, pergunta: { type: "string" }, documento: { type: "string" },
          },
        },
      },
      linha_endividamento: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          required: ["marco", "quando", "detalhe"],
          properties: { marco: { type: "string" }, quando: { type: "string" }, detalhe: { type: "string" } },
        },
      },
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

2. "emprestimos": UMA ficha POR crédito de empréstimo recebido (use creditos_recebidos do digest, um a um, em ordem cronológica). Cada ficha: data (dd/mm/aaaa); valor (formato R$); detalhe (descrição da operação, % da renda mensal que o valor representa, intervalo em dias desde o empréstimo anterior quando houver, e se há sinal de refinanciamento na mesma janela); parcelas (cruze com os contratos do digest: quantas parcelas pagas, valor médio da parcela, plano x/y quando houver, mora vinculada; se não houver contrato vinculável, diga "parcelas não identificadas no extrato"); pergunta (pergunta pronta na segunda pessoa sobre ESTE empréstimo específico); documento (contrato/CCB e comprovante de liberação desta operação).

3. "linha_endividamento": o ciclo "quando começou, como evoluiu, onde chegou" em 5 a 9 marcos cronológicos, usando linha_endividamento_eventos, rotativo, comprometimento_mensal e cartoes do digest. Cubra, quando os dados sustentarem: primeiro sinal de endividamento; primeiro empréstimo; aumento do uso de crédito (evolução das faturas de cartão); entrada no rotativo/cheque especial; novos empréstimos; renegociações/refinanciamentos; período de maior concentração de dívidas. Cada marco: marco (rótulo curto, ex.: "Primeiro sinal de endividamento"); quando (mês/ano ou data); detalhe (1 frase com valores reais).

4. "prioridades": 3 a 8 fichas classificadas em "alta" (operação que merece contato imediato e pedido de documentos), "media" (sinal que exige conversa) e "baixa" (relação de consumo identificada). Considere também: cartões com mora (possível rotativo/pagamento parcial), lojas com crédito próprio (crediário a confirmar), telecom com variação de valor, PIX com instituições financeiras, entradas seguidas de saídas. Cada ficha: titulo curto; o_que_encontramos (com data e valor REAIS do digest); o_que_pode_representar (tom de possibilidade); pergunta (pronta, na segunda pessoa); documento (qual solicitar).

5. "narrativa": a história financeira do cliente em 1 parágrafo corrido e humano: como era o padrão, quando surgiram créditos, como evoluiu o endividamento, meses de aperto, situação atual. Cite meses/valores reais. Sem travessão.

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
          body: JSON.stringify({ model: MODELO, input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }], max_output_tokens: 10000, temperature: 0.3, text: { format: SCHEMA_INSIGHTS } }),
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

    // Salva também o DIGEST: o front renderiza as seções factuais (instituições,
    // cartões, varejo, veículo, sazonalidade) direto dele, sem depender da IA.
    const resumoNovo = { ...(a.resumo && typeof a.resumo === "object" ? a.resumo : {}), insights, digest, insights_em: new Date().toISOString() };
    await s.from("spy_analise").update({ resumo: resumoNovo, updated_at: new Date().toISOString() }).eq("id", analiseId);

    return j({ ok: true, analise_id: analiseId, insights });
  } catch (e) {
    const msg = String((e as Error)?.message || e);
    return j({ error: /timeout/i.test(msg) ? "a geração demorou demais, tente novamente" : msg }, 500);
  }
});
