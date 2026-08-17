// Janelas de prazo.
//
// A pergunta que a tela de tarefas precisa responder não é "quais tarefas
// existem", é "o que vence quando". Isso vira uma régua de tempo com poucas
// faixas nomeadas, e todas as telas que falam de prazo usam esta mesma régua.
//
// Duas decisões que valem explicar:
//
// 1. Toda janela INCLUI o que já venceu. Quem pergunta "o que preciso resolver
//    esta semana" também precisa ver o que passou do prazo na semana passada e
//    continua aberto. Esconder o atrasado dentro de um recorte de tempo seria
//    a pior forma de perder um prazo. Quem quer só o atraso filtra por
//    SITUAÇÃO: vencida é um estado da tarefa, não um pedaço do calendário, e
//    ter as duas coisas era contar critérios diferentes com o mesmo nome (a
//    situação olha só o que está aberto; a janela olhava tudo).
//
// 2. "Esta semana" vai até sábado, não são sete dias corridos. Semana é o que
//    o calendário mostra; próximos 15 e 30 é que são contagem rolante, e o
//    rótulo diz isso.

export type Janela = "todas" | "hoje" | "semana" | "q15" | "q30" | "sem";

export function ymdParaData(s?: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function dataParaYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Dias entre hoje e o prazo. Negativo quer dizer vencido; null, sem prazo.
export function diasAte(prazo?: string): number | null {
  const d = ymdParaData(prazo);
  if (!d) return null;
  d.setHours(0, 0, 0, 0);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoje.getTime()) / 86400000);
}

// Quantos dias faltam pro fim da semana corrente, contando domingo como
// primeiro dia, que é como o calendário brasileiro se apresenta.
export function diasAteFimDaSemana(): number {
  return 6 - new Date().getDay();
}

export const JANELAS: { key: Janela; label: string; dica: string }[] = [
  { key: "todas", label: "Todas", dica: "Sem recorte de prazo" },
  { key: "hoje", label: "Hoje", dica: "Vencem hoje, mais o que já venceu" },
  { key: "semana", label: "Esta semana", dica: "Até sábado, mais o que já venceu" },
  { key: "q15", label: "15 dias", dica: "Próximos 15 dias, mais o que já venceu" },
  { key: "q30", label: "30 dias", dica: "Próximos 30 dias, mais o que já venceu" },
  { key: "sem", label: "Sem prazo", dica: "Tarefas que ninguém datou" },
];

export function naJanela(prazo: string | undefined, j: Janela): boolean {
  if (j === "todas") return true;
  const dias = diasAte(prazo);
  if (j === "sem") return dias === null;
  if (dias === null) return false;
  if (j === "hoje") return dias <= 0;
  if (j === "semana") return dias <= diasAteFimDaSemana();
  if (j === "q15") return dias <= 15;
  return dias <= 30;
}

// Cor por urgência, usada nos chips do calendário e nas bordas de card.
export function tomDoPrazo(dias: number | null) {
  if (dias === null) return { texto: "text-muted-foreground", chip: "bg-white/[0.06] text-muted-foreground ring-white/10" };
  if (dias < 0) return { texto: "text-rose-400", chip: "bg-rose-500/15 text-rose-300 ring-rose-500/30" };
  if (dias <= 1) return { texto: "text-amber-400", chip: "bg-amber-500/15 text-amber-300 ring-amber-500/30" };
  if (dias <= 3) return { texto: "text-amber-400", chip: "bg-amber-500/10 text-amber-300/90 ring-amber-500/20" };
  return { texto: "text-muted-foreground", chip: "bg-primary/12 text-primary ring-primary/25" };
}

// Ordena pelo prazo, com quem não tem prazo sempre no fim: tarefa sem data não
// disputa urgência com quem tem, nem no topo nem no meio.
export function porPrazo<T extends { prazo?: string }>(a: T, b: T, desc = false): number {
  const da = diasAte(a.prazo);
  const db = diasAte(b.prazo);
  if (da === null && db === null) return 0;
  if (da === null) return 1;
  if (db === null) return -1;
  return desc ? db - da : da - db;
}
