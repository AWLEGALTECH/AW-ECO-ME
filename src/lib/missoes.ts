// AS MISSÕES DO DIA — a régua do painel de atendimento.
//
// O foco do módulo é um só: não perder lead. Por isso a coluna da direita não é
// uma lista de tarefas qualquer, é uma fila com ORDEM DE CULPA:
//
//   1. a pessoa falou com a gente e ninguém respondeu   ← culpa nossa
//   2. o lead está vivo e ninguém disse o que fazer     ← descuido nosso
//   3. o resto (cobrar extrato, ligar, follow-up)       ← trabalho normal
//
// As duas primeiras foram o que o escritório escolheu como alarme, e é por isso
// que elas valem mais ponto: o placar tem que puxar pro lado do que dói.
//
// PONTO NÃO É ENFEITE, É PRIORIZAÇÃO. Se responder um lead esquecido vale o
// mesmo que ligar pra alguém que combinou ligação, a fila deixa de ter opinião
// e vira ordem de chegada — que é exatamente o que faz lead afundar.
//
// A sequência conta dias FECHADOS: um dia em que nenhuma pessoa ficou sem
// resposta. É a única métrica aqui que não dá pra melhorar trabalhando mais
// rápido, só trabalhando sem deixar buraco.

export type TipoMissao =
  | "sem_resposta"      // ele falou, a gente não respondeu
  | "sem_proxima_acao"  // lead vivo, sem combinado
  | "cobrar_extrato"    // o gargalo do funil
  | "follow_up"         // ele sumiu depois da nossa última
  | "ligar";            // combinou ligação

export interface Missao {
  id: string;
  tipo: TipoMissao;
  leadId: string;
  lead: string;
  detalhe: string;
  /** há quantas horas isso está pendente — ordena dentro do mesmo tipo */
  horas: number;
  feita: boolean;
}

/** Quanto cada missão vale. A ordem dos números é a ordem da fila. */
export const PONTOS: Record<TipoMissao, number> = {
  sem_resposta: 30,
  sem_proxima_acao: 20,
  cobrar_extrato: 15,
  follow_up: 10,
  ligar: 10,
};

/** Peso de urgência: menor vem primeiro. Espelha a ordem de culpa. */
const URGENCIA: Record<TipoMissao, number> = {
  sem_resposta: 0,
  sem_proxima_acao: 1,
  cobrar_extrato: 2,
  follow_up: 3,
  ligar: 3,
};

export const ROTULO_MISSAO: Record<TipoMissao, string> = {
  sem_resposta: "Responder",
  sem_proxima_acao: "Definir próximo passo",
  cobrar_extrato: "Cobrar extrato",
  follow_up: "Dar um alô",
  ligar: "Ligar",
};

/** As duas que o escritório elegeu como alarme aparecem marcadas em risco. */
export function emRisco(m: Pick<Missao, "tipo">): boolean {
  return m.tipo === "sem_resposta" || m.tipo === "sem_proxima_acao";
}

/**
 * A fila: por urgência, e dentro dela pela espera mais longa.
 *
 * O que está feito cai pro fim — sai do caminho sem sumir, pra pessoa ver o que
 * já rendeu no dia. Ordenação estável por id, senão a lista dança a cada render.
 */
export function ordenarMissoes(missoes: Missao[]): Missao[] {
  return [...missoes].sort((a, b) => {
    if (a.feita !== b.feita) return a.feita ? 1 : -1;
    const u = URGENCIA[a.tipo] - URGENCIA[b.tipo];
    if (u !== 0) return u;
    if (b.horas !== a.horas) return b.horas - a.horas;
    return a.id.localeCompare(b.id);
  });
}

export interface ProgressoDoDia {
  feitas: number;
  total: number;
  /** 0–100; dia sem missão nenhuma é 100, não 0 — não há o que cobrar */
  pct: number;
  pontos: number;
  pontosPossiveis: number;
  /** nenhuma pendência de risco sobrando */
  zerado: boolean;
}

export function progressoDoDia(missoes: Missao[]): ProgressoDoDia {
  const total = missoes.length;
  const feitas = missoes.filter((m) => m.feita).length;
  const pontos = missoes.filter((m) => m.feita).reduce((a, m) => a + PONTOS[m.tipo], 0);
  const pontosPossiveis = missoes.reduce((a, m) => a + PONTOS[m.tipo], 0);
  return {
    feitas,
    total,
    pct: total === 0 ? 100 : Math.round((feitas / total) * 100),
    pontos,
    pontosPossiveis,
    zerado: missoes.every((m) => m.feita || !emRisco(m)),
  };
}

export interface Patente {
  rotulo: string;
  /** dias que faltam pra próxima; null quando já está no topo */
  faltam: number | null;
  proxima: string | null;
}

const PATENTES: { dias: number; rotulo: string }[] = [
  { dias: 0,  rotulo: "Começando" },
  { dias: 3,  rotulo: "Constante" },
  { dias: 7,  rotulo: "Semana limpa" },
  { dias: 15, rotulo: "Quinzena limpa" },
  { dias: 30, rotulo: "Mês inteiro" },
];

/**
 * A sequência de dias sem deixar ninguém sem resposta.
 *
 * Dias, não missões: dá pra fechar cem missões num dia e ainda ter deixado uma
 * pessoa falando sozinha. É por isso que a sequência quebra com UM buraco.
 */
export function patenteDaSequencia(dias: number): Patente {
  const d = Math.max(0, Math.floor(dias));
  let atual = PATENTES[0];
  let proxima: { dias: number; rotulo: string } | null = null;
  for (const p of PATENTES) {
    if (d >= p.dias) atual = p;
    else { proxima = p; break; }
  }
  return {
    rotulo: atual.rotulo,
    faltam: proxima ? proxima.dias - d : null,
    proxima: proxima ? proxima.rotulo : null,
  };
}
