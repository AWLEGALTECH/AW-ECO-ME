/* TAXA DE PROCEDÊNCIA, do lado da tela.
 *
 * A linha vem de `vw_desfecho_processo`, que lê a última decisão publicada no
 * DJEN. Aqui só se agrega. A regra de leitura mora no banco, e a de contagem
 * mora aqui, e as duas estão escritas uma vez cada.
 *
 * ─────────────────────────── o que conta como taxa ───────────────────────────
 *
 * Procedência = ganhos / (ganhos + perdidos), onde:
 *   ganho   = procedente ou parcial   (parcial é vitória: ganhou parte do pedido)
 *   perdido = improcedente
 *
 * FICAM FORA do denominador, de propósito:
 *   acordo             não é vitória do juiz, é negociação; entra como contexto
 *   sem_merito         desistência, abandono, incompetência: ninguém julgou nada
 *   pago_sem_sentenca  o réu pagou antes de haver decisão; é bom, mas não é taxa
 *   em_andamento       ainda não aconteceu
 *
 * Misturar isso na taxa daria um número que ninguém consegue interpretar: um
 * escritório com muitas desistências pareceria perder mais, e um com muitos
 * acordos pareceria ganhar mais, sem que nenhum juiz tivesse decidido nada.
 */

export type Desfecho =
  | "procedente" | "parcial" | "improcedente" | "acordo"
  | "sem_merito" | "pago_sem_sentenca" | "em_andamento";

export interface LinhaDesfecho {
  materia: string | null;
  requeridos: string[] | null;
  fase_processual: string | null;
  desfecho: Desfecho;
  dt_desfecho: string | null;
  executado: boolean | null;
  valor_sentenca: number | string | null;
  no_tracker: boolean | null;
}

export const ehGanho = (d: Desfecho) => d === "procedente" || d === "parcial";
export const ehPerda = (d: Desfecho) => d === "improcedente";
/** Decidido no mérito: entra no denominador da taxa. */
export const ehDecidido = (d: Desfecho) => ehGanho(d) || ehPerda(d);

/** Percentual inteiro, ou null quando não há o que dividir. Nunca "0%" por falta de dado. */
export function taxa(ganhos: number, perdidos: number): number | null {
  const n = ganhos + perdidos;
  return n === 0 ? null : Math.round((100 * ganhos) / n);
}

export interface Resumo {
  total: number;
  decididos: number;
  procedentes: number;
  parciais: number;
  improcedentes: number;
  ganhos: number;
  taxa: number | null;
  acordos: number;
  semMerito: number;
  pagosSemSentenca: number;
  emAndamento: number;
  suspensos: number;
  /** vitórias que já viraram extinção por pagamento */
  executados: number;
  valorGanho: number;
  /** vitórias que o DJEN acha e o Tracker não tem */
  ganhosForaDoTracker: number;
}

export function resumo(linhas: LinhaDesfecho[]): Resumo {
  const c = (f: (l: LinhaDesfecho) => boolean) => linhas.filter(f).length;
  const procedentes = c((l) => l.desfecho === "procedente");
  const parciais = c((l) => l.desfecho === "parcial");
  const improcedentes = c((l) => l.desfecho === "improcedente");
  const ganhos = procedentes + parciais;
  return {
    total: linhas.length,
    decididos: ganhos + improcedentes,
    procedentes, parciais, improcedentes, ganhos,
    taxa: taxa(ganhos, improcedentes),
    acordos: c((l) => l.desfecho === "acordo"),
    semMerito: c((l) => l.desfecho === "sem_merito"),
    pagosSemSentenca: c((l) => l.desfecho === "pago_sem_sentenca"),
    emAndamento: c((l) => l.desfecho === "em_andamento"),
    suspensos: c((l) => l.desfecho === "em_andamento" && l.fase_processual === "SUSPENSO"),
    executados: c((l) => !!l.executado),
    valorGanho: linhas.reduce((s, l) => s + (Number(l.valor_sentenca) || 0), 0),
    ganhosForaDoTracker: c((l) => ehGanho(l.desfecho) && !l.no_tracker),
  };
}

export interface FaixaDesfecho {
  nome: string;
  procedentes: number;
  parciais: number;
  improcedentes: number;
  decididos: number;
  taxa: number | null;
}

function agrupar(linhas: LinhaDesfecho[], chave: (l: LinhaDesfecho) => string[]): Map<string, FaixaDesfecho> {
  const m = new Map<string, FaixaDesfecho>();
  for (const l of linhas) {
    if (!ehDecidido(l.desfecho)) continue;
    for (const k of chave(l)) {
      const f = m.get(k) ?? { nome: k, procedentes: 0, parciais: 0, improcedentes: 0, decididos: 0, taxa: null };
      if (l.desfecho === "procedente") f.procedentes++;
      else if (l.desfecho === "parcial") f.parciais++;
      else f.improcedentes++;
      f.decididos++;
      m.set(k, f);
    }
  }
  for (const f of m.values()) f.taxa = taxa(f.procedentes + f.parciais, f.improcedentes);
  return m;
}

const ordenar = (a: FaixaDesfecho, b: FaixaDesfecho) => b.decididos - a.decididos || a.nome.localeCompare(b.nome);

/**
 * Por matéria, com a cauda dobrada em "OUTRAS".
 *
 * `minimo` é o corte de honestidade: uma matéria com um processo decidido tem
 * taxa de 0% ou 100%, e nenhum dos dois é informação. Abaixo do corte as
 * matérias somam numa linha só, que continua contando no total sem fingir que
 * cada uma tem uma taxa própria.
 */
export function porMateria(linhas: LinhaDesfecho[], minimo = 3): FaixaDesfecho[] {
  const todas = [...agrupar(linhas, (l) => [l.materia ?? "SEM MATÉRIA"]).values()].sort(ordenar);
  const cabem = todas.filter((f) => f.decididos >= minimo);
  const cauda = todas.filter((f) => f.decididos < minimo);
  if (cauda.length === 0) return cabem;
  const outras = cauda.reduce<FaixaDesfecho>((acc, f) => ({
    nome: `OUTRAS (${cauda.length})`,
    procedentes: acc.procedentes + f.procedentes,
    parciais: acc.parciais + f.parciais,
    improcedentes: acc.improcedentes + f.improcedentes,
    decididos: acc.decididos + f.decididos,
    taxa: null,
  }), { nome: "", procedentes: 0, parciais: 0, improcedentes: 0, decididos: 0, taxa: null });
  outras.taxa = taxa(outras.procedentes + outras.parciais, outras.improcedentes);
  return [...cabem, outras];
}

/** Por requerido. Litisconsórcio conta o processo em cada réu, que é o que cada réu enfrentou. */
export function porRequerido(linhas: LinhaDesfecho[], nomes: Record<string, string>, maximo = 8): FaixaDesfecho[] {
  const m = agrupar(linhas, (l) => (l.requeridos?.length ? l.requeridos : ["(sem requerido)"]).map((k) => nomes[k] ?? k));
  return [...m.values()].sort(ordenar).slice(0, maximo);
}

export interface MesDesfecho {
  mes: string;      // "2026-08"
  rotulo: string;   // "ago/26"
  ganhos: number;
  perdidos: number;
  taxa: number | null;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function rotuloDoMes(mes: string): string {
  const [a, m] = mes.split("-");
  const i = Number(m) - 1;
  return MESES[i] ? `${MESES[i]}/${a.slice(2)}` : mes;
}

/** Por mês da decisão, só o que foi decidido no mérito. Meses sem decisão não aparecem. */
export function porMes(linhas: LinhaDesfecho[]): MesDesfecho[] {
  const m = new Map<string, MesDesfecho>();
  for (const l of linhas) {
    if (!ehDecidido(l.desfecho) || !l.dt_desfecho) continue;
    const mes = l.dt_desfecho.slice(0, 7);
    const f = m.get(mes) ?? { mes, rotulo: rotuloDoMes(mes), ganhos: 0, perdidos: 0, taxa: null };
    if (ehGanho(l.desfecho)) f.ganhos++; else f.perdidos++;
    m.set(mes, f);
  }
  const lista = [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  for (const f of lista) f.taxa = taxa(f.ganhos, f.perdidos);
  return lista;
}
