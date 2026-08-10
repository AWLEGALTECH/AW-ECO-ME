// Mapeamento NEUTRO das transações do extrato, NO CÓDIGO (sem IA).
//
// Extratos (ex.: Bradesco) vêm em MÚLTIPLAS LINHAS: a data numa linha, o
// histórico e a contraparte em outras, e por fim uma linha `docto valor saldo`.
// O parser acumula as linhas de descrição até achar a linha de saldo, e deriva
// o valor e o sinal da DIFERENÇA entre saldos consecutivos (saldo - saldo_ant),
// o que resolve a coluna crédito/débito automaticamente.
//
// RECONCILIAÇÃO: para cada lançamento, comparamos |Δsaldo| com o valor impresso.
// Se a maioria bate (matchRate alto), a extração está PROVADA e o servidor mapeia
// por código, sem IA. Se não bate (formato estranho/escaneado), cai no fallback
// de IA no servidor. Assim o pior caso é o de hoje, e o caso comum fica de graça.

export interface Tx { data: string | null; descricao: string; valor: number; saldo: number | null }

export interface ResumoExtrato {
  n: number;
  entradas: number;
  saidas: number;
  porCategoria: Record<string, { n: number; entradas: number; saidas: number }>;
  porMes: Record<string, { entradas: number; saidas: number }>;
}

export interface ExtratoAnalisado {
  name: string;
  periodo: string;
  header: string;
  reconciliado: boolean;
  matchRate: number;
  saldoInicial: number | null;
  saldoFinal: number | null;
  transacoes: Tx[];
  resumo: ResumoExtrato;
  candidatos: never[]; // (mantido por compatibilidade; hoje o mapeamento é neutro)
}

const CAT_REGEX: { key: string; re: RegExp }[] = [
  { key: "renda", re: /SALARIO|BENEFICIO|APOSENTAD|\bINSS\b|PREFEITURA|SECRETARIA|PENSAO|PROVENTO|VENCIMENTO|BOLSA FAMILIA|AUXILIO|SAL P\/CC/i },
  { key: "alimentacao", re: /MERCAD|SUPERMERC|PADARIA|ACOUGUE|IFOOD|RESTAURANT|LANCHON|ALIMENT|HORTIFRUT|ATACAD/i },
  { key: "transporte", re: /POSTO|COMBUST|GASOLINA|\bUBER\b|\b99\b|TAXI|ONIBUS|PASSAGEM|PEDAGIO|ESTACIONAM|\bIPVA\b/i },
  { key: "moradia", re: /ALUGUEL|CONDOMIN|ENERGIA|CEMIG|COPASA|\bLUZ\b|\bAGUA\b|\bGAS\b|INTERNET|\bIPTU\b|MORADIA|CLARO|VIVO|\bTIM\b/i },
  { key: "escola", re: /ESCOLA|FACULD|UNIVERS|COLEGIO|MENSALIDADE|\bCURSO\b|EDUCAC|CRECHE/i },
  { key: "saude", re: /FARMAC|DROGA|HOSPITAL|CLINICA|MEDIC|LABORAT|SAUDE|UNIMED|ODONTO|AMIL|HAPVIDA/i },
  { key: "credito", re: /EMPRESTIMO|CONSIGNAD|FINANCIAMENTO|PARCELA|CREDIARIO|CARTAO|FATURA|CREFISA|\bBMG\b|AGIBANK|CREDITO PESSOAL|ENCARGO/i },
  { key: "tarifa", re: /TARIFA|\bTAXA\b|MANUTENC|CESTA|ANUIDADE|\bIOF\b|PACOTE SERV/i },
  { key: "saque", re: /SAQUE|CORBAN|CAIXA ELETR|\bSAQ\b|DINHEIRO ATM/i },
  { key: "transferencia", re: /\bPIX\b|\bTED\b|\bDOC\b|TRANSFER/i },
];
export function categoriaKey(desc: string): string {
  const d = String(desc || "");
  for (const c of CAT_REGEX) if (c.re.test(d)) return c.key;
  return "outro";
}

const RE_DEC = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
const RE_DATA_INI = /^(\d{2})\/(\d{2})\/(\d{4})\b/; // data na coluna Data (início da linha)
const RE_SKIP = /^(Data\s+Hist|Data:\s|Extrato de:|Bradesco|Nome:|Folha:|Movimenta|SALDO ANTERIOR|Saldo Anterior|P[aá]gina|Dispon[ií]vel|Limite de|Total\b|Resumo|Ag[eê]ncia:)/i;
const RE_FIM = /^Total\b/i;

const num = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", "."));

export function parseExtrato(texto: string): { transacoes: Tx[]; reconciliado: boolean; saldoInicial: number | null; saldoFinal: number | null; matchRate: number } {
  const linhas = String(texto || "").split("\n");
  const txs: Tx[] = [];
  let dataAtual: string | null = null, prevSaldo: number | null = null, saldoIni: number | null = null;
  let buffer: string[] = [];
  let match = 0, tot = 0;

  for (const raw of linhas) {
    const line = raw.trim();
    if (!line) continue;
    if (RE_FIM.test(line)) break;      // linha "Total ..." encerra o extrato
    if (RE_SKIP.test(line)) continue;  // cabeçalhos/rodapés que se repetem por página
    const dIni = line.match(RE_DATA_INI);
    if (dIni) dataAtual = `${dIni[3]}-${dIni[2]}-${dIni[1]}`;
    const decs = line.match(RE_DEC);
    if (decs && decs.length >= 2) {
      const saldo = num(decs[decs.length - 1]);
      const valorShown = num(decs[decs.length - 2]);
      let head = line.slice(0, line.lastIndexOf(decs[decs.length - 2]));
      head = head.replace(RE_DATA_INI, " ").replace(/\b\d{5,}\b/g, " ").replace(/\bCOD\.?\s*LANC\.?\b/i, " ").replace(/\bR\$\b/gi, " ").replace(/\s+/g, " ").trim();
      const desc = [...buffer, head].join(" ").replace(/\s+/g, " ").replace(/^[\s\-|.:]+|[\s\-|.:]+$/g, "").trim();
      buffer = [];
      if (prevSaldo === null) { saldoIni = saldo; prevSaldo = saldo; continue; } // saldo de abertura
      const delta = +(saldo - prevSaldo).toFixed(2);
      prevSaldo = saldo;
      if (delta === 0) continue;
      const bate = Math.abs(Math.abs(delta) - valorShown) < 0.02;
      tot++; if (bate) match++;
      const mag = valorShown > 0 ? valorShown : Math.abs(delta);
      txs.push({ data: dataAtual, descricao: desc.slice(0, 110), valor: +((delta >= 0 ? 1 : -1) * mag).toFixed(2), saldo });
    } else {
      const letras = (line.match(/[A-Za-zÀ-ÿ]/g) || []).length;
      if (letras >= 3) buffer.push(line);
    }
  }

  const matchRate = tot ? match / tot : 0;
  const reconciliado = txs.length >= 5 && matchRate >= 0.7;
  return { transacoes: txs, reconciliado, saldoInicial: saldoIni, saldoFinal: prevSaldo, matchRate };
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

function anoDoNome(name: string): number | null {
  const m = String(name || "").match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
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

// Ponto de entrada: texto do PDF → mapeamento neutro pronto para o quadro.
export function analisarExtrato(name: string, texto: string): ExtratoAnalisado {
  const p = parseExtrato(texto);
  return {
    name,
    periodo: periodoDe(name, p.transacoes),
    header: String(texto || "").slice(0, 1200),
    reconciliado: p.reconciliado,
    matchRate: p.matchRate,
    saldoInicial: p.saldoInicial,
    saldoFinal: p.saldoFinal,
    transacoes: p.transacoes,
    resumo: agregar(p.transacoes),
    candidatos: [],
  };
}
