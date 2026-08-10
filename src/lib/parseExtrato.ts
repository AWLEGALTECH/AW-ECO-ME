// CAMADA 0 (código, sem IA): extrai o LEDGER COMPLETO de um extrato, preservando
// a descrição verbatim de cada lançamento. Quando o extrato tem coluna de saldo
// corrente, o valor e o sinal de cada transação saem da DIFERENÇA entre saldos
// consecutivos — sem chutar sinal — e a extração RECONCILIA:
//   saldo_inicial + Σ(movimentos) == saldo_final.
//
// Se reconcilia (erro ≈ 0), a extração está PROVADA correta e completa → o
// servidor NÃO gasta IA nesse extrato. Se não reconcilia (formato esquisito,
// escaneado, sem coluna de saldo), o extrato volta pro motor antigo (IA lê o
// texto). Assim o pior caso é o comportamento de hoje, e a economia acontece
// sempre que a conta fecha. A profundidade é preservada porque a IA final
// recebe TODAS as transações com descrição, não agregados.
//
// Padrões de data/valor calibrados no parser (testado, com OCR) do Finder.

export interface Tx {
  data: string | null; // AAAA-MM-DD
  descricao: string; // histórico verbatim (é daqui que sai a profundidade)
  valor: number; // com sinal: + entrada, - saída
  saldo: number | null;
}

export interface ResumoExtrato {
  n: number;
  entradas: number;
  saidas: number; // positivo (módulo)
  porCategoria: Record<string, { n: number; entradas: number; saidas: number }>;
  porMes: Record<string, { entradas: number; saidas: number }>;
}

// Candidato a oportunidade de fechamento (defesa do consumidor), pré-marcado
// pelo código para a IA validar — foca a análise no que interessa.
export interface Candidato { tipo: string; ocorrencias: number; total: number; exemplos: string[]; }

export interface ExtratoAnalisado {
  name: string;
  periodo: string;
  header: string;
  reconciliado: boolean;
  erroRecon: number | null;
  saldoInicial: number | null;
  saldoFinal: number | null;
  transacoes: Tx[];
  resumo: ResumoExtrato;
  candidatos: Candidato[];
}

const num = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", "."));

const RE_SALDO_ANT = /saldo\s+(?:anterior|em\s+\d{2}\/\d{2}(?:\/\d{2,4})?)\s*:?\s*(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*([DC-]?)/i;
const RE_SKIP = /^(saldo|s a l d o|total|subtotal|per[ií]odo|extrato\s+de|tarifas\s+debitadas\s+em|[uú]ltimos\s+lan[cç]amentos|ag[eê]ncia|\bconta\b|limite|dispon[ií]vel|data\s*:)/i;
// Token de valor BR com marca de sinal: sufixo D/C, (-)/(+), ou "-" na frente.
const RE_AMT = /(-?)(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:\(([+-])\)|([DC]))?/gi;

// Categorias (espelham as CATS visuais da tela Spy) — só a KEY, para agregação.
const CAT_REGEX: { key: string; re: RegExp }[] = [
  { key: "renda", re: /SALARIO|BENEFICIO|APOSENTAD|\bINSS\b|PREFEITURA|PENSAO|PROVENTO|VENCIMENTO|BOLSA FAMILIA|AUXILIO/i },
  { key: "alimentacao", re: /MERCAD|SUPERMERC|PADARIA|ACOUGUE|IFOOD|RESTAURANT|LANCHON|ALIMENT|HORTIFRUT|ATACAD/i },
  { key: "transporte", re: /POSTO|COMBUST|GASOLINA|\bUBER\b|\b99\b|TAXI|ONIBUS|PASSAGEM|PEDAGIO|ESTACIONAM|\bIPVA\b/i },
  { key: "moradia", re: /ALUGUEL|CONDOMIN|ENERGIA|CEMIG|COPASA|\bLUZ\b|\bAGUA\b|\bGAS\b|INTERNET|\bIPTU\b|MORADIA|CLARO|VIVO|\bTIM\b/i },
  { key: "escola", re: /ESCOLA|FACULD|UNIVERS|COLEGIO|MENSALIDADE|\bCURSO\b|EDUCAC|CRECHE/i },
  { key: "saude", re: /FARMAC|DROGA|HOSPITAL|CLINICA|MEDIC|LABORAT|SAUDE|UNIMED|ODONTO|AMIL|HAPVIDA/i },
  { key: "credito", re: /EMPRESTIMO|CONSIGNAD|FINANCIAMENTO|PARCELA|CREDIARIO|CARTAO|FATURA|CREFISA|\bBMG\b|AGIBANK/i },
  { key: "tarifa", re: /TARIFA|\bTAXA\b|MANUTENC|CESTA|ANUIDADE|\bIOF\b|PACOTE SERV/i },
  { key: "saque", re: /SAQUE|CORBAN|CAIXA ELETR|\bSAQ\b/i },
  { key: "transferencia", re: /\bPIX\b|\bTED\b|\bDOC\b|TRANSFER/i },
];
export function categoriaKey(desc: string): string {
  const d = String(desc || "");
  for (const c of CAT_REGEX) if (c.re.test(d)) return c.key;
  return "outro";
}

// Padrões de oportunidade de fechamento (defesa do consumidor).
const CAND_REGEX: { tipo: string; re: RegExp }[] = [
  { tipo: "Empréstimo/consignado", re: /EMPRESTIMO|CONSIGNAD|CREDITO PESSOAL|CREFISA|\bBMG\b|AGIBANK|FINANCIAMENTO|MORA CREDITO/i },
  { tipo: "Tarifas bancárias", re: /TARIFA|CESTA|ANUIDADE|PACOTE SERV|MANUTENC|\bIOF\b/i },
  { tipo: "Cheque especial/juros", re: /CHEQUE ESPECIAL|\bJUROS\b|\bLIS\b|ADIANTAMENTO A DEPOSITANTE|ADIANT.*DEPOSITANTE/i },
  { tipo: "Seguros/assistências", re: /SEGURO|PROTECAO|ASSISTENCIA|SEGURIDADE/i },
  { tipo: "Estornos/devoluções", re: /ESTORNO|DEVOLUC|REEMBOLSO/i },
];

function acharData(line: string, ano: number | null) {
  let m = line.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/); if (m) return { iso: `${m[3]}-${m[2]}-${m[1]}`, i: m.index!, len: m[0].length };
  m = line.match(/\b(\d{2})\/(\d{2})\/(\d{2})\b/); if (m) return { iso: `20${m[3]}-${m[2]}-${m[1]}`, i: m.index!, len: m[0].length };
  m = line.match(/\b(\d{2})\/(\d{2})\b/); if (m && ano) return { iso: `${ano}-${m[2]}-${m[1]}`, i: m.index!, len: m[0].length };
  return null;
}

function amounts(line: string) {
  const out: { val: number; sign: number }[] = [];
  const re = new RegExp(RE_AMT.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    let sign = 0;
    if (m[1] === "-" || m[3] === "-" || m[4] === "D") sign = -1;
    else if (m[3] === "+" || m[4] === "C") sign = 1;
    out.push({ val: num(m[2]), sign });
  }
  return out;
}

function anoDoNome(name: string): number | null {
  const m = String(name || "").match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}
function dominanteAno(texto: string): number | null {
  const m = texto.match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}

export function parseExtrato(texto: string, anoHint?: number | null): {
  transacoes: Tx[]; reconciliado: boolean; saldoInicial: number | null; saldoFinal: number | null; erroRecon: number | null;
} {
  const linhas = String(texto || "").split("\n");
  const ano = anoHint ?? dominanteAno(texto);

  let saldoInicial: number | null = null;
  for (const l of linhas) { const m = l.match(RE_SALDO_ANT); if (m) { saldoInicial = num(m[1]) * (m[2] === "D" || m[2] === "-" ? -1 : 1); break; } }

  const txs: Tx[] = [];
  let dataArr: string | null = null;
  let saldoAnt: number | null = saldoInicial;
  let temColunaSaldo = false;

  for (const raw of linhas) {
    const line = raw.trim(); if (!line) continue;
    const d = acharData(line, ano); if (d) dataArr = d.iso;
    if (RE_SKIP.test(line)) continue;
    const amts = amounts(line);
    if (!amts.length) continue;
    const iso = d?.iso ?? dataArr;
    if (!iso && !d) continue;

    let desc = line;
    if (d) desc = desc.slice(0, d.i) + " " + desc.slice(d.i + d.len);
    desc = desc.replace(new RegExp(RE_AMT.source, "gi"), " ").replace(/\bR\$/gi, " ").replace(/\s+/g, " ").replace(/^[\s\-–|.:]+|[\s\-–|.:]+$/g, "").trim();
    const letras = (desc.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    if (letras < 3) continue;

    let valor: number; let saldo: number | null = null;
    if (amts.length >= 2) {
      // [valor, saldo]: deriva o valor do DELTA de saldo (robusto, sem chutar sinal)
      temColunaSaldo = true;
      const ult = amts[amts.length - 1];
      saldo = ult.val * (ult.sign < 0 ? -1 : 1);
      if (saldoAnt !== null) valor = +(saldo - saldoAnt).toFixed(2);
      else { const a = amts[0]; valor = (a.sign || -1) * a.val; }
      saldoAnt = saldo;
    } else {
      const a = amts[0];
      valor = (a.sign || -1) * a.val; // sinal explícito, senão débito
    }
    txs.push({ data: iso, descricao: desc.slice(0, 120), valor, saldo });
  }

  const saldoFinal = (() => { for (let i = txs.length - 1; i >= 0; i--) if (txs[i].saldo !== null) return txs[i].saldo; return null; })();
  let reconciliado = false, erroRecon: number | null = null;
  if (temColunaSaldo && saldoInicial !== null && saldoFinal !== null && txs.length > 0) {
    const soma = txs.reduce((s, t) => s + t.valor, 0);
    erroRecon = +(saldoInicial + soma - saldoFinal).toFixed(2);
    reconciliado = Math.abs(erroRecon) < 0.02;
  }
  return { transacoes: txs, reconciliado, saldoInicial, saldoFinal, erroRecon };
}

function agregar(txs: Tx[]): ResumoExtrato {
  const r: ResumoExtrato = { n: txs.length, entradas: 0, saidas: 0, porCategoria: {}, porMes: {} };
  for (const t of txs) {
    const ent = t.valor > 0 ? t.valor : 0, sai = t.valor < 0 ? -t.valor : 0;
    r.entradas += ent; r.saidas += sai;
    const k = categoriaKey(t.descricao);
    const c = (r.porCategoria[k] ||= { n: 0, entradas: 0, saidas: 0 });
    c.n++; c.entradas += ent; c.saidas += sai;
    if (t.data) { const m = (r.porMes[t.data.slice(0, 7)] ||= { entradas: 0, saidas: 0 }); m.entradas += ent; m.saidas += sai; }
  }
  return r;
}

function candidatos(txs: Tx[]): Candidato[] {
  const out: Candidato[] = [];
  for (const c of CAND_REGEX) {
    const hits = txs.filter((t) => c.re.test(t.descricao));
    if (!hits.length) continue;
    const total = hits.reduce((s, t) => s + Math.abs(t.valor), 0);
    const exemplos = Array.from(new Set(hits.map((t) => t.descricao))).slice(0, 4);
    out.push({ tipo: c.tipo, ocorrencias: hits.length, total: +total.toFixed(2), exemplos });
  }
  return out;
}

function periodoDe(name: string, txs: Tx[]): string {
  const doNome = anoDoNome(name);
  const meses = txs.map((t) => t.data).filter(Boolean).sort() as string[];
  if (meses.length) {
    const a1 = meses[0].slice(0, 4), a2 = meses[meses.length - 1].slice(0, 4);
    if (a1 === a2) return doNome ? String(doNome) : a1;
    return `${a1}–${a2}`;
  }
  return doNome ? String(doNome) : "período";
}

// Ponto de entrada: texto do PDF → tudo mastigado para a Camada de interpretação.
export function analisarExtrato(name: string, texto: string): ExtratoAnalisado {
  const ano = anoDoNome(name) ?? dominanteAno(texto);
  const p = parseExtrato(texto, ano);
  return {
    name,
    periodo: periodoDe(name, p.transacoes),
    header: String(texto || "").slice(0, 1200),
    reconciliado: p.reconciliado,
    erroRecon: p.erroRecon,
    saldoInicial: p.saldoInicial,
    saldoFinal: p.saldoFinal,
    transacoes: p.transacoes,
    resumo: agregar(p.transacoes),
    candidatos: candidatos(p.transacoes),
  };
}
