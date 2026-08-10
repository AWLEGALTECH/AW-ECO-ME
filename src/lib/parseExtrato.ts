// Enumeração das transações do extrato NO CÓDIGO ("trabalho bruto"), sem IA.
//
// Antes o servidor chamava o modelo UMA VEZ POR EXTRATO só para listar as
// transações — lento e travava no meio de muitos anos. Aqui o navegador varre o
// texto já extraído do PDF e enumera TODAS as transações de graça e na hora.
// A IA sai dessa etapa: depois faz UMA única chamada para escrever o dossiê.
//
// O parser é heurístico (formatos de extrato variam). Quando ele acha poucas
// transações num extrato, o servidor cai no fallback de leitura por IA daquele
// arquivo — então nada se perde, e o caso comum fica instantâneo.

export interface Transacao {
  data: string | null; // AAAA-MM-DD quando dá para inferir; senão null
  descricao: string;
  valor: number; // COM sinal: positivo = entrada, negativo = saída
}

export interface ResumoExtrato {
  n: number;
  entradas: number; // soma dos créditos
  saidas: number; // soma dos débitos, em módulo (positivo)
  porCategoria: Record<string, { n: number; entradas: number; saidas: number }>;
  porMes: Record<string, { entradas: number; saidas: number }>;
  maiores: Transacao[]; // maiores movimentações por |valor|
}

export interface ExtratoParseado {
  name: string;
  periodo: string;
  header: string; // começo do texto (cabeçalho: titular, conta, etc.)
  transacoes: Transacao[];
  resumo: ResumoExtrato;
}

// ── Categorias (espelham as CATS visuais da tela Spy) ────────────────────────
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

// Palavras que indicam entrada (crédito) e saída (débito), usadas só quando a
// linha não traz um sinal explícito (+/-, C/D, parênteses).
const RE_CRED = /RECEBID|SAL[AÁ]RIO|PROVENTO|VENCIMENTO|BENEF[IÍ]CIO|APOSENTAD|\bINSS\b|PENS[AÃ]O|DEP[OÓ]SITO|ESTORNO|REEMBOLSO|RENDIMENTO|RESGATE|DEVOLU[CÇ]|CR[EÉ]DITO EM CONTA|TED RECEBID|PIX RECEBID|DOC RECEBID/i;
const RE_DEB = /ENVIAD|PAGAMENTO|COMPRA|SAQUE|TARIFA|D[EÉ]BITO|BOLETO|FATURA|PARCELA|EMPR[EÉ]STIMO|CONSIGN|\bIOF\b|ANUIDADE|MENSALIDADE|COBRAN[CÇ]A/i;

// Linhas que NÃO são transação (saldo, total, cabeçalho de coluna, etc.).
const RE_SKIP = /\b(SALDO|TOTAL|SUBTOTAL|LIMITE|EXTRATO|PER[IÍ]ODO|AG[EÊ]NCIA|LAN[CÇ]AMENTOS FUTUROS|DISPON[IÍ]VEL|RESUMO|MOVIMENTA[CÇ][AÃ]O DO DIA)\b/i;

const MESES: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

function valorBR(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

function anoDoisDigitos(yy: number): number {
  return yy <= 49 ? 2000 + yy : 1900 + yy;
}

// Ano dominante do texto (para completar datas dd/mm sem ano).
function dominanteAno(texto: string): number | null {
  const contagem = new Map<number, number>();
  const re = /\b(?:19|20)\d{2}\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const y = parseInt(m[0], 10);
    if (y >= 1990 && y <= 2100) contagem.set(y, (contagem.get(y) || 0) + 1);
  }
  let melhor: number | null = null, max = 0;
  for (const [y, c] of contagem) if (c > max) { max = c; melhor = y; }
  return melhor;
}

function anoDoNome(name: string): number | null {
  const m = String(name || "").match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}

interface AchouData { iso: string | null; ini: number; fim: number; }

// Procura a primeira data da linha. Devolve o intervalo para removê-la da descrição.
function acharData(line: string, ano: number | null): AchouData | null {
  let m: RegExpMatchArray | null;
  // dd/mm/yyyy ou dd-mm-yyyy ou dd.mm.yyyy
  m = line.match(/\b(\d{2})[/.\-](\d{2})[/.\-](\d{4})\b/);
  if (m) return { iso: `${m[3]}-${m[2]}-${m[1]}`, ini: m.index!, fim: m.index! + m[0].length };
  // yyyy-mm-dd
  m = line.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return { iso: `${m[1]}-${m[2]}-${m[3]}`, ini: m.index!, fim: m.index! + m[0].length };
  // dd/mm/yy
  m = line.match(/\b(\d{2})[/.\-](\d{2})[/.\-](\d{2})\b/);
  if (m) return { iso: `${anoDoisDigitos(parseInt(m[3], 10))}-${m[2]}-${m[1]}`, ini: m.index!, fim: m.index! + m[0].length };
  // dd/mm (sem ano) → usa o ano dominante
  m = line.match(/\b(\d{2})[/.](\d{2})(?![/.\d])/);
  if (m && ano) return { iso: `${ano}-${m[2]}-${m[1]}`, ini: m.index!, fim: m.index! + m[0].length };
  // dd mmm (ex.: "23 jan")
  m = line.match(/\b(\d{1,2})\s*(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/i);
  if (m && ano) {
    const dia = m[1].padStart(2, "0");
    return { iso: `${ano}-${MESES[m[2].toLowerCase()]}-${dia}`, ini: m.index!, fim: m.index! + m[0].length };
  }
  return null;
}

interface MoneyTok { abs: number; mark: number; ini: number; fim: number; }

// Todos os valores monetários da linha, com o sinal explícito quando houver.
function acharValores(line: string): MoneyTok[] {
  const re = /([-+(]?)\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})\s*([CDcd)+\-]?)/g;
  const out: MoneyTok[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const abs = valorBR(m[2]);
    if (!isFinite(abs)) continue;
    const pre = m[1], post = m[3];
    let mark = 0;
    if (pre === "-" || post === "-" || (pre === "(" && post === ")")) mark = -1;
    else if (pre === "+" || post === "+") mark = 1;
    else if (post === "D" || post === "d") mark = -1;
    else if (post === "C" || post === "c") mark = 1;
    out.push({ abs, mark, ini: m.index!, fim: m.index! + m[0].length });
  }
  return out;
}

// O trabalho bruto: percorre linha a linha e enumera as transações.
export function parseTransacoes(texto: string, anoHint?: number | null): Transacao[] {
  const ano = anoHint ?? dominanteAno(texto);
  const linhas = String(texto || "").split("\n");
  const out: Transacao[] = [];
  let dataArrastada: string | null = null; // data do dia corrente (linhas agrupadas)

  for (const raw of linhas) {
    const line = raw.trim();
    if (!line) continue;
    const d = acharData(line, ano);
    if (d?.iso) dataArrastada = d.iso;

    const valores = acharValores(line);
    if (!valores.length) continue;
    if (RE_SKIP.test(line)) continue;

    // Descrição: remove data e valores, sobra o histórico.
    let desc = line;
    if (d) desc = desc.slice(0, d.ini) + " " + desc.slice(d.fim);
    desc = desc
      .replace(/([-+(]?)\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}\s*([CDcd)+\-]?)/g, " ")
      .replace(/\bR\$/gi, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s\-–|.:]+|[\s\-–|.:]+$/g, "")
      .trim();

    // Precisa de letras suficientes para ser um histórico de transação real.
    const letras = (desc.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    if (letras < 3) continue;
    // Só conta se tem data na linha OU herdou a data do dia.
    const iso = d?.iso ?? dataArrastada;
    if (!iso && !d) continue;

    const val = valores[0]; // 1º valor = transação; demais (se houver) = saldo
    let sinal = val.mark;
    if (!sinal) {
      if (RE_CRED.test(desc)) sinal = 1;
      else if (RE_DEB.test(desc)) sinal = -1;
      else sinal = -1; // a maioria das linhas de extrato é débito
    }
    out.push({ data: iso, descricao: desc.slice(0, 120), valor: sinal * val.abs });
  }
  return out;
}

function agregarResumo(txs: Transacao[]): ResumoExtrato {
  const r: ResumoExtrato = { n: txs.length, entradas: 0, saidas: 0, porCategoria: {}, porMes: {}, maiores: [] };
  for (const t of txs) {
    const ent = t.valor > 0 ? t.valor : 0;
    const sai = t.valor < 0 ? -t.valor : 0;
    r.entradas += ent;
    r.saidas += sai;
    const k = categoriaKey(t.descricao);
    const c = (r.porCategoria[k] ||= { n: 0, entradas: 0, saidas: 0 });
    c.n++; c.entradas += ent; c.saidas += sai;
    if (t.data) {
      const mes = t.data.slice(0, 7);
      const mm = (r.porMes[mes] ||= { entradas: 0, saidas: 0 });
      mm.entradas += ent; mm.saidas += sai;
    }
  }
  r.maiores = [...txs].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor)).slice(0, 30);
  return r;
}

function periodoDe(name: string, txs: Transacao[]): string {
  const doNome = anoDoNome(name);
  const meses = txs.map((t) => t.data).filter(Boolean).sort() as string[];
  if (meses.length) {
    const a1 = meses[0].slice(0, 4), a2 = meses[meses.length - 1].slice(0, 4);
    if (a1 === a2) return doNome ? String(doNome) : a1;
    return `${a1}–${a2}`;
  }
  return doNome ? String(doNome) : "período";
}

// Ponto de entrada: recebe o texto do PDF e devolve tudo mastigado.
export function resumirExtrato(name: string, texto: string): ExtratoParseado {
  const ano = anoDoNome(name) ?? dominanteAno(texto);
  const transacoes = parseTransacoes(texto, ano);
  const resumo = agregarResumo(transacoes);
  const periodo = periodoDe(name, transacoes);
  const header = String(texto || "").slice(0, 1200);
  return { name, periodo, header, transacoes, resumo };
}
