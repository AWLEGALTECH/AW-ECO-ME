// TASKS DO ATENDIMENTO — lembrete e follow-up.
//
// São duas coisas com naturezas opostas, e é por isso que têm ícones e origens
// diferentes na tela:
//
//   LEMBRETE   nasce da mão da atendente. "Ligar pra dona Maria quinta" — ela
//              combinou, ela marca, ela escolhe o dia.
//   FOLLOW-UP  nasce sozinho, do tempo. Ninguém marca: o lead parou de andar
//              no CRM e a cadência traz ele de volta pro dia certo.
//
// A CADÊNCIA. Um lead parado não some — ele volta em intervalos que abrem: 2,
// 5, 10, 20 e 30 dias parado. Cinco tentativas em um mês, cada vez mais espaçadas.
// Abrir o intervalo é o ponto: cobrar todo dia queima o lead, e cobrar uma vez
// só perde quem só precisava de um empurrão. Depois do último passo o lead
// esfria e para de gerar task — insistir além disso é gastar o dia da atendente
// com quem já decidiu não responder.
//
// "Parado" é tempo sem NENHUM movimento: nem mensagem dele, nem nossa, nem
// mudança de etapa. É diferente de "sem resposta nossa", que é culpa nossa e
// aparece na caixa de entrada, não aqui.

export type TipoTask = "lembrete" | "follow_up";

export interface Task {
  id: string;
  tipo: TipoTask;
  leadId: string;
  lead: string;
  titulo: string;
  detalhe: string;
  /** YYYY-MM-DD — o dia em que ela aparece */
  data: string;
  /** HH:MM, opcional. "Passar o extrato hoje" não tem hora; "ligar às 15h" tem. */
  hora?: string | null;
  feita: boolean;
  /** só no follow-up: qual tentativa é essa */
  rodada?: number;
}

/** Dias de parada em que a cobrança acontece. */
export const CADENCIA = [2, 5, 10, 20, 30] as const;

/* O PAINEL INTEIRO se chama "Lembretes" agora, então o chip do tipo não pode
   dizer "Lembrete": o rótulo repetiria o nome da coluna e não distinguiria
   nada. O que separa os dois é a ORIGEM — um foi marcado por uma pessoa, o
   outro nasceu da régua. */
export const ROTULO_TIPO: Record<TipoTask, string> = {
  lembrete: "Manual",
  follow_up: "Follow-up",
};

/**
 * Quantas cobranças um lead parado há N dias já deveria ter recebido.
 *
 * É contagem acumulada, não "qual passo é hoje": um lead que ficou 12 dias sem
 * ninguém olhar deveria ter recebido três cobranças (2, 5 e 10 dias). Assim,
 * quando alguém volta a mexer na fila depois de uma semana de férias, os
 * atrasados aparecem — em vez de sumirem por não ser exatamente o dia deles.
 */
export function rodadasDevidas(diasParado: number): number {
  return CADENCIA.filter((d) => diasParado >= d).length;
}

/** O lead passou do último passo da cadência: parou de gerar cobrança. */
export function esfriou(diasParado: number): boolean {
  return diasParado > CADENCIA[CADENCIA.length - 1];
}

/**
 * Daqui a quantos dias cai a próxima cobrança, e qual será ela.
 * Null quando a cadência acabou — é o que a tela usa pra dizer "esfriou".
 */
export function proximaCobranca(diasParado: number): { emDias: number; rodada: number } | null {
  for (let i = 0; i < CADENCIA.length; i++) {
    if (diasParado < CADENCIA[i]) {
      return { emDias: CADENCIA[i] - diasParado, rodada: i + 1 };
    }
  }
  return null;
}

export interface LeadParado {
  id: string;
  nome: string;
  /** dias sem nenhum movimento */
  diasParado: number;
  /** cobranças que já saíram */
  followUpsFeitos: number;
  /** lead fechado ou perdido não precisa de cobrança */
  ativo: boolean;
}

/**
 * Os follow-ups que o dia precisa mostrar.
 *
 * Um por lead, mesmo quando ele deve três: a fila é do dia, e três linhas do
 * mesmo nome só ocupariam espaço dizendo a mesma coisa. A rodada mostrada é a
 * que está vencendo — é ela que diz se é a primeira tentativa ou a última.
 */
export function followUpsDoDia(leads: LeadParado[], data: string): Task[] {
  const saida: Task[] = [];
  for (const l of leads) {
    if (!l.ativo) continue;
    if (esfriou(l.diasParado)) continue;
    const devidas = rodadasDevidas(l.diasParado);
    if (devidas <= l.followUpsFeitos) continue;
    const rodada = l.followUpsFeitos + 1;
    const atrasadas = devidas - l.followUpsFeitos;
    saida.push({
      id: `fu-${l.id}-${rodada}`,
      tipo: "follow_up",
      leadId: l.id,
      lead: l.nome,
      titulo: `${rodada}ª cobrança`,
      detalhe: atrasadas > 1
        ? `parado há ${l.diasParado} dias · ${atrasadas} cobranças atrasadas`
        : `parado há ${l.diasParado} dias`,
      data,
      feita: false,
      rodada,
    });
  }
  return saida;
}

/**
 * A ordem do dia: o que não foi feito primeiro, e dentro disso o follow-up mais
 * atrasado antes do lembrete — quem já está parado há mais tempo é quem corre
 * mais risco de nunca mais responder.
 */
export function ordenarTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.feita !== b.feita) return a.feita ? 1 : -1;
    if (a.tipo !== b.tipo) return a.tipo === "follow_up" ? -1 : 1;
    if (a.tipo === "follow_up" && b.tipo === "follow_up") {
      const ra = b.rodada ?? 0, rb = a.rodada ?? 0;
      if (ra !== rb) return ra - rb;
    }
    // Entre lembretes, quem tem hora marcada vem primeiro e em ordem de
    // relógio: "ligar às 9h" perde a validade às 9h05, "passar o extrato hoje"
    // não perde. Sem hora, a ordem é a de criação (o id é sequencial no tempo).
    if (a.tipo === "lembrete" && b.tipo === "lembrete") {
      const ha = a.hora ?? "", hb = b.hora ?? "";
      if (!!ha !== !!hb) return ha ? -1 : 1;
      if (ha && hb && ha !== hb) return ha < hb ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * A hora como a tela escreve: "15:00" vira "15h", "15:30" vira "15h30".
 *
 * Hora redonda sem os dois zeros porque é assim que se combina em voz alta —
 * "ligo às 15h", não "às 15 e zero zero".
 */
export function horaBonita(hora: string | null | undefined): string {
  const h = String(hora || "").trim();
  const m = h.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const hh = String(Number(m[1]));
  return m[2] === "00" ? `${hh}h` : `${hh}h${m[2]}`;
}

export interface ProgressoTasks {
  feitas: number;
  total: number;
  /** 0–100; dia sem task nenhuma é 100 — não há o que concluir */
  pct: number;
  concluido: boolean;
}

export function progressoTasks(tasks: Task[]): ProgressoTasks {
  const total = tasks.length;
  const feitas = tasks.filter((t) => t.feita).length;
  return {
    feitas,
    total,
    pct: total === 0 ? 100 : Math.round((feitas / total) * 100),
    concluido: total > 0 && feitas === total,
  };
}
