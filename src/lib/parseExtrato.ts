// Mapeamento NEUTRO das transações do extrato, NO CÓDIGO (sem IA).
//
// Extratos (ex.: Bradesco) vêm em MÚLTIPLAS LINHAS: a data numa linha, o
// histórico e a contraparte em outras, e por fim uma linha `docto valor saldo`.
// O parser acumula as linhas de descrição até achar a linha de saldo.
//
// ─────────────────────── o saldo devedor vem SEM sinal ───────────────────────
//
// O texto do PDF perde duas coisas: a coluna (crédito ou débito viram um número
// só) e o sinal do saldo. A conta que está 331,49 NEGATIVA aparece como
// "331,49". Derivar o sinal do lançamento pela diferença dos saldos, como este
// parser fazia, inverte TODOS os lançamentos enquanto a conta está no
// vermelho: a tarifa "aumenta" o saldo e vira crédito. Foi assim que centenas
// de moras, tarifas e IOFs entraram no banco como entrada, justamente na
// clientela do Spy, que vive no limite.
//
// A saída: o saldo impresso é um MÓDULO. A cada lançamento de valor v, o saldo
// novo só pode ser b+v ou b-v, e o módulo impresso diz qual dos dois foi. O que
// o módulo não diz é o sinal do PRIMEIRO saldo de cada trecho (e um trecho
// recomeça toda vez que a conta passa por zero exato): as duas orientações são
// simétricas. Duas âncoras desfazem a simetria:
//
//   1. a linha "Total <créditos> <débitos> <saldo>" no fim de cada extrato, que
//      só fecha com a orientação certa;
//   2. o vocabulário das rubricas (sinalDoLancamento): tarifa, mora, IOF e
//      saque nunca são entrada; INSS e PIX recebido nunca são saída. A
//      orientação que concorda com mais rubricas vence.
//
// ─────────────────────────── blocos e "Últimos Lançamentos" ──────────────────
//
// Um PDF pode trazer vários extratos (2017 a 2026 num arquivo só), cada um com
// abertura ("COD. LANC."), folhas e "Total". O parser antigo parava no primeiro
// "Total" e jogava fora os outros nove anos. Agora cada extrato é um BLOCO.
//
// E todo extrato do Bradesco termina com uma página "Últimos Lançamentos": os
// lançamentos mais recentes da conta na data da impressão, iguais em todos os
// extratos impressos no mesmo dia. São lançamentos de verdade (foi nela que
// apareceram os R$ 32 mil de operações vencidas do Saul), mas repetidos em
// cada arquivo. Saem marcados com `bloco: "ultimos"` para serem gravados uma
// vez só.
//
// RECONCILIAÇÃO: para cada lançamento, comparamos o saldo previsto com o
// impresso. Se a maioria bate, a extração está PROVADA e o servidor mapeia por
// código, sem IA. Se não bate (formato estranho, escaneado), cai no fallback de
// IA no servidor.

import { sinalPeloHistorico } from "./sinalDoLancamento";

export type BlocoDoExtrato = "movimento" | "ultimos";

export interface Tx { data: string | null; descricao: string; valor: number; saldo: number | null; bloco: BlocoDoExtrato }

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
  /** "Extrato inexistente": o banco diz que não houve movimento no período */
  semMovimento: boolean;
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
/* "Bradesco Celular" é o cabeçalho; "BRADESCO VIDA E PREVIDENCIA SA" é a
   contraparte de um lançamento e tem que ficar na descrição. */
const RE_SKIP = /^(Data\s+Hist|Data:\s|Extrato de:|Bradesco Celular|Nome:|Folha:|Movimenta|SALDO ANTERIOR|Saldo Anterior|P[aá]gina|Dispon[ií]vel|Limite de|Resumo|Ag[eê]ncia:)/i;
const RE_TOTAL = /^Total\b/i;
const RE_ULTIMOS = /[ÚU]ltimos\s+Lan[cç]amentos/i;
const RE_MOVIMENTO = /Movimenta[çc][ãa]o entre:?\s*(\d{2}\/\d{2}\/(\d{4}))\s*e\s*(\d{2}\/\d{2}\/(\d{4}))/i;
const RE_INEXISTENTE = /Extrato inexistente/i;
const RE_ABERTURA = /\bCOD\.?\s*LANC\.?/i;
/** tolerância entre o saldo previsto e o impresso: só arredondamento de ponto
    flutuante. Tem lançamento de R$ 0,01 (IOF); com tolerância de dois centavos
    os dois lados batiam e o IOF virava crédito. */
const TOL = 0.006;

const num = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", "."));
const r2 = (x: number) => Math.round(x * 100) / 100;
const dataIso = (m: RegExpMatchArray) => `${m[3]}-${m[2]}-${m[1]}`;

/** Uma linha `docto valor saldo` já lida: valor e saldo em MÓDULO. */
interface Passo { data: string | null; desc: string; v: number; m: number }

/** Um extrato inteiro dentro do PDF: abertura, lançamentos e a linha Total. */
interface Bloco {
  tipo: BlocoDoExtrato;
  anos: string[];
  aberturaMag: number | null;
  passos: Passo[];
  /** os números da linha "Total": [créditos, débitos, saldo] ou [um lado, saldo] */
  total: number[] | null;
}

/* ── 1. o texto vira blocos de passos ─────────────────────────────────────── */

function lerBlocos(texto: string): { blocos: Bloco[]; viuInexistente: boolean; anosDosCabecalhos: string[] } {
  const linhas = String(texto || "").split("\n");
  const blocos: Bloco[] = [];
  const anosDosCabecalhos: string[] = [];
  let atual: Bloco | null = null;
  let tipo: BlocoDoExtrato = "movimento";
  let anos: string[] = [];
  let cabecalho = "";
  let viuInexistente = false;
  let dataAtual: string | null = null;
  let buffer: string[] = [];

  const novoBloco = (): Bloco => {
    const b: Bloco = { tipo, anos, aberturaMag: null, passos: [], total: null };
    blocos.push(b);
    return b;
  };

  for (const raw of linhas) {
    const line = raw.trim();
    if (!line) continue;
    if (RE_INEXISTENTE.test(line)) { viuInexistente = true; continue; }

    /* Cabeçalho de extrato. Repete a cada folha; só é extrato NOVO quando o
       período (ou o tipo) muda. */
    const mMov = line.match(RE_MOVIMENTO);
    const ehUltimos = RE_ULTIMOS.test(line);
    if (mMov || ehUltimos) {
      const cab = ehUltimos ? "ultimos" : `${mMov![1]}-${mMov![3]}`;
      const t: BlocoDoExtrato = ehUltimos ? "ultimos" : "movimento";
      if (cab !== cabecalho || t !== tipo) {
        atual = null; buffer = [];
        cabecalho = cab; tipo = t;
        anos = ehUltimos ? [] : Array.from(new Set([mMov![2], mMov![4]]));
        for (const a of anos) if (!anosDosCabecalhos.includes(a)) anosDosCabecalhos.push(a);
      }
      continue;
    }

    /* "Total" fecha o bloco. O próximo lançamento abre outro. */
    if (RE_TOTAL.test(line)) {
      if (atual) atual.total = (line.match(RE_DEC) || []).map(num);
      atual = null; buffer = [];
      continue;
    }

    /* Abertura ("COD. LANC."): o saldo de partida, em módulo. */
    if (RE_ABERTURA.test(line)) {
      const dIni = line.match(RE_DATA_INI);
      if (dIni) dataAtual = dataIso(dIni);
      const decs = line.match(RE_DEC) || [];
      if (!atual || atual.passos.length > 0) atual = novoBloco();
      atual.aberturaMag = decs.length ? Math.abs(num(decs[decs.length - 1])) : 0;
      buffer = [];
      continue;
    }

    if (RE_SKIP.test(line)) continue;  // cabeçalhos/rodapés que se repetem por página
    const dIni = line.match(RE_DATA_INI);
    if (dIni) dataAtual = dataIso(dIni);
    const decs = Array.from(line.matchAll(RE_DEC));
    if (decs.length >= 2) {
      const m = Math.abs(num(decs[decs.length - 1][0]));
      const v = Math.abs(num(decs[decs.length - 2][0]));
      /* corta na POSIÇÃO do valor, não na última ocorrência do texto dele:
         quando valor e saldo são iguais ("32.722,37 32.722,37") a última
         ocorrência é o saldo, e o valor ficava dentro da descrição */
      let head = line.slice(0, decs[decs.length - 2].index);
      head = head.replace(RE_DATA_INI, " ").replace(/\b\d{5,}\b/g, " ").replace(/\bR\$\b/gi, " ").replace(/\s+/g, " ").trim();
      const desc = [...buffer, head].join(" ").replace(/\s+/g, " ").replace(/^[\s\-|.:]+|[\s\-|.:]+$/g, "").trim();
      buffer = [];
      if (!atual) atual = novoBloco();
      if (atual.aberturaMag === null && atual.passos.length === 0) { atual.aberturaMag = m; continue; } // layout sem "COD. LANC.": a primeira linha de saldo é a abertura
      atual.passos.push({ data: dataAtual, desc: desc.slice(0, 110), v, m });
    } else {
      const letras = (line.match(/[A-Za-zÀ-ÿ]/g) || []).length;
      if (letras >= 3) buffer.push(line);
    }
  }
  return { blocos, viuInexistente, anosDosCabecalhos };
}

/* ── 2. cada bloco ganha sinais ───────────────────────────────────────────── */

interface Caminhada {
  sinais: (1 | -1)[];
  valores: number[];   // com sinal; 0 quando o passo não é lançamento (delta zero)
  saldos: number[];    // com sinal, sempre no módulo impresso
  votos: number;       // concordância com o vocabulário das rubricas
  batem: number;       // passos em que o saldo previsto bateu com o impresso
}

/**
 * Percorre um trecho com a orientação `s` (o sinal do saldo em que ele começa,
 * ou o sinal do primeiro lançamento quando começa em zero).
 */
function caminhar(passos: Passo[], idx: number[], saldoDePartida: number, s: 1 | -1): Caminhada {
  let bal = s * saldoDePartida;
  const out: Caminhada = { sinais: [], valores: [], saldos: [], votos: 0, batem: 0 };
  for (const i of idx) {
    const { v, m, desc } = passos[i];
    let sinal: 1 | -1;
    let novo: number;
    let bate: boolean;
    if (Math.abs(bal) < 0.005) {
      // em zero, os dois lados têm o mesmo módulo: a orientação decide
      sinal = s; novo = s * v; bate = Math.abs(v - m) < TOL;
    } else {
      const soma = bal + v, sub = bal - v;
      if (Math.abs(Math.abs(soma) - m) < TOL) { sinal = 1; novo = soma; bate = true; }
      else if (Math.abs(Math.abs(sub) - m) < TOL) { sinal = -1; novo = sub; bate = true; }
      else {
        // não fechou: assume que a conta ficou do mesmo lado e segue pelo módulo
        novo = (bal < 0 ? -1 : 1) * m;
        sinal = novo - bal >= 0 ? 1 : -1;
        bate = false;
      }
    }
    // gruda no módulo impresso para não acumular centavo de arredondamento
    novo = (novo < 0 ? -1 : 1) * m;
    const mag = v > 0 ? v : Math.abs(novo - bal);
    if (bate) out.batem++;
    const r = sinalPeloHistorico(desc);
    if (r !== 0) out.votos += r === sinal ? 1 : -1;
    out.sinais.push(sinal);
    out.valores.push(mag < 0.005 ? 0 : r2(sinal * mag));
    out.saldos.push(r2(novo));
    bal = novo;
  }
  return out;
}

function resolverBloco(b: Bloco): { txs: Tx[]; batem: number; total: number; saldoInicial: number | null; saldoFinal: number | null } {
  const ab = b.aberturaMag ?? 0;
  if (b.passos.length === 0) return { txs: [], batem: 0, total: 0, saldoInicial: b.aberturaMag, saldoFinal: b.aberturaMag };

  /* Trechos: um novo começa toda vez que o saldo anterior é zero exato, porque
     dali a conta pode ter ido para qualquer lado. */
  const trechos: number[][] = [];
  let cur: number[] = [];
  let prevMag = ab;
  for (let i = 0; i < b.passos.length; i++) {
    if (prevMag < 0.005 && cur.length) { trechos.push(cur); cur = []; }
    cur.push(i);
    prevMag = b.passos[i].m;
  }
  if (cur.length) trechos.push(cur);

  const opcoes = trechos.map((idx) => {
    const partida = idx[0] === 0 ? ab : b.passos[idx[0] - 1].m;
    return { idx, mais: caminhar(b.passos, idx, partida, 1), menos: caminhar(b.passos, idx, partida, -1) };
  });
  const preferida = (o: typeof opcoes[number]): Caminhada => {
    if (o.mais.votos !== o.menos.votos) return o.mais.votos > o.menos.votos ? o.mais : o.menos;
    if (o.mais.batem !== o.menos.batem) return o.mais.batem > o.menos.batem ? o.mais : o.menos;
    return o.mais; // sem evidência nenhuma: conta no azul, que é o normal de um extrato
  };
  let escolha = opcoes.map(preferida);

  /* Âncora do Total: "Total <créditos> <débitos> <saldo>" só fecha com a
     orientação certa. Se a votação das rubricas não fechou, tenta virar trechos
     até fechar. */
  if (b.total && b.total.length >= 3) {
    const [tc, td] = b.total;
    const fecha = (cams: Caminhada[]) => {
      let c = 0, d = 0;
      cams.forEach((cam) => cam.valores.forEach((val) => { if (val > 0) c += val; else d += -val; }));
      return Math.abs(c - tc) < 0.05 && Math.abs(d - td) < 0.05;
    };
    if (!fecha(escolha) && opcoes.length <= 12) {
      for (let mask = 1; mask < (1 << opcoes.length); mask++) {
        const cand = opcoes.map((o, k) => ((mask >> k) & 1) ? (escolha[k] === o.mais ? o.menos : o.mais) : escolha[k]);
        if (fecha(cand)) { escolha = cand; break; }
      }
    }
  }

  const txs: Tx[] = [];
  let batem = 0;
  opcoes.forEach((o, k) => {
    const cam = escolha[k];
    batem += cam.batem;
    o.idx.forEach((i, j) => {
      if (cam.valores[j] === 0) return; // saldo não mudou: não é lançamento
      const p = b.passos[i];
      txs.push({ data: p.data, descricao: p.desc, valor: cam.valores[j], saldo: cam.saldos[j], bloco: b.tipo });
    });
  });
  const primeira = escolha[0] === opcoes[0].mais ? 1 : -1;
  const ultima = escolha[escolha.length - 1];
  return {
    txs, batem, total: b.passos.length,
    saldoInicial: r2(primeira * ab),
    saldoFinal: ultima.saldos.length ? ultima.saldos[ultima.saldos.length - 1] : null,
  };
}

/* ── 3. o extrato inteiro ─────────────────────────────────────────────────── */

export interface ExtratoLido {
  transacoes: Tx[];
  reconciliado: boolean;
  saldoInicial: number | null;
  saldoFinal: number | null;
  matchRate: number;
  semMovimento: boolean;
  /** anos dos blocos de movimentação, na ordem em que aparecem */
  anos: string[];
}

export function parseExtrato(texto: string): ExtratoLido {
  const { blocos, viuInexistente, anosDosCabecalhos: anos } = lerBlocos(texto);
  const txs: Tx[] = [];
  let batem = 0, total = 0;
  let saldoInicial: number | null = null, saldoFinal: number | null = null;
  const vistosUltimos = new Set<string>();

  for (const b of blocos) {
    const r = resolverBloco(b);
    batem += r.batem; total += r.total;
    if (b.tipo === "movimento") {
      if (saldoInicial === null) saldoInicial = r.saldoInicial;
      if (r.saldoFinal !== null) saldoFinal = r.saldoFinal;
    }
    for (const t of r.txs) {
      if (t.bloco === "ultimos") {
        // a mesma página "Últimos Lançamentos" vem em cada extrato do arquivo
        const chave = `${t.data}|${t.descricao}|${t.valor}|${t.saldo}`;
        if (vistosUltimos.has(chave)) continue;
        vistosUltimos.add(chave);
      }
      txs.push(t);
    }
  }
  if (saldoFinal === null && txs.length) saldoFinal = txs[txs.length - 1].saldo;

  const matchRate = total ? batem / total : 0;
  const temMovimento = blocos.some((b) => b.tipo === "movimento" && b.passos.length > 0);
  const semMovimento = viuInexistente && !temMovimento;
  const reconciliado =
    (txs.length >= 5 && matchRate >= 0.7) ||
    (txs.length >= 1 && matchRate >= 0.99) ||   // extrato curto, mas fechou centavo a centavo
    (txs.length === 0 && semMovimento);         // o banco disse que não houve movimento
  return { transacoes: txs, reconciliado, saldoInicial, saldoFinal, matchRate, semMovimento, anos };
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

/**
 * O período que o quadro exibe. Vem do cabeçalho "Movimentação entre", que é
 * o que o banco diz; a página "Últimos Lançamentos" é sempre da data da
 * impressão e não pode puxar o período para o ano corrente.
 */
function periodoDe(name: string, txs: Tx[], anos: string[]): string {
  const doNome = anoDoNome(name);
  const lista = anos.length ? [...anos].sort() : (txs.filter((t) => t.bloco === "movimento").map((t) => t.data).filter(Boolean).sort() as string[]).map((d) => d.slice(0, 4));
  if (lista.length) {
    const a1 = lista[0], a2 = lista[lista.length - 1];
    if (a1 === a2) return doNome && !anos.length ? String(doNome) : a1;
    return `${a1}–${a2}`;
  }
  return doNome ? String(doNome) : "período";
}

// Ponto de entrada: texto do PDF → mapeamento neutro pronto para o quadro.
export function analisarExtrato(name: string, texto: string): ExtratoAnalisado {
  const p = parseExtrato(texto);
  return {
    name,
    periodo: periodoDe(name, p.transacoes, p.anos),
    header: String(texto || "").slice(0, 1200),
    reconciliado: p.reconciliado,
    matchRate: p.matchRate,
    saldoInicial: p.saldoInicial,
    saldoFinal: p.saldoFinal,
    semMovimento: p.semMovimento,
    transacoes: p.transacoes,
    resumo: agregar(p.transacoes),
    candidatos: [],
  };
}
