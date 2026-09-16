/* O RECORTE POR DATA DA ABA BASES.
 *
 * "Só os que chegaram de tal data a tal data" é a pergunta que uma base de 708
 * linhas exige e que nenhuma lista corrida responde. Sem ela, comparar segunda
 * com terça vira contar linha na tela, e "a landing rendeu mais depois que
 * mexemos no anúncio?" não tem onde ser feita.
 *
 * ISTO MORA NUMA LIB, E NÃO NA TELA. É conta de data, que é onde erro de um dia
 * se esconde melhor: "últimos 7 dias" que devolve 8, "ontem" que inclui hoje,
 * dia escolhido no calendário que vira meia-noite e não traz ninguém. Nenhum
 * desses aparece olhando a tela — todos aparecem num teste.
 */

export type Atalho = "tudo" | "hoje" | "ontem" | "7dias" | "30dias" | "escolhido";

/** O que o calendário de duas pontas devolve. Mesmo formato do react-day-picker. */
export interface Intervalo {
  from?: Date;
  to?: Date;
}

export const ATALHOS: { chave: Atalho; rotulo: string }[] = [
  { chave: "tudo", rotulo: "Tudo" },
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "ontem", rotulo: "Ontem" },
  { chave: "7dias", rotulo: "7 dias" },
  { chave: "30dias", rotulo: "30 dias" },
];

/** Meia-noite local do dia de uma data. */
export function inicioDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** O último instante do dia, para o fim do intervalo incluir o dia inteiro. */
export function fimDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/**
 * O intervalo que cada atalho quer dizer, em datas de verdade.
 *
 * `null` é "sem recorte". Devolver datas em vez de uma chave deixa a filtragem
 * ser uma só, sem um `if` por atalho espalhado pela tela.
 */
export function periodoDoAtalho(
  a: Atalho,
  escolhido: Intervalo | undefined,
  agora = new Date(),
): { de: Date; ate: Date } | null {
  if (a === "tudo") return null;

  if (a === "hoje") return { de: inicioDoDia(agora), ate: fimDoDia(agora) };

  if (a === "ontem") {
    /* ONTEM É O DIA DE ONTEM, e não as últimas 24 horas. Às 15h, "ontem"
       terminando às 15h de ontem deixaria de fora a tarde inteira dele. */
    const o = new Date(agora);
    o.setDate(o.getDate() - 1);
    return { de: inicioDoDia(o), ate: fimDoDia(o) };
  }

  if (a === "7dias" || a === "30dias") {
    /* SETE DIAS CONTANDO HOJE, então recua seis. Recuar sete daria oito dias
       na tela, e o número do botão passaria a mentir. */
    const dias = a === "7dias" ? 6 : 29;
    const de = new Date(agora);
    de.setDate(de.getDate() - dias);
    return { de: inicioDoDia(de), ate: fimDoDia(agora) };
  }

  if (!escolhido?.from) return null;
  /* UM DIA SÓ VALE O DIA INTEIRO. Quem clica em "12" quer o dia 12, não a
     meia-noite dele — e sem isto a escolha de um dia só devolveria zero lead,
     o que na tela parece defeito. */
  return { de: inicioDoDia(escolhido.from), ate: fimDoDia(escolhido.to ?? escolhido.from) };
}

const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "Hoje", "12 de set", "12 a 18 de set" — o que o botão do período mostra. */
export function rotuloDoPeriodo(a: Atalho, escolhido: Intervalo | undefined): string {
  const pronto = ATALHOS.find((x) => x.chave === a);
  if (pronto) return pronto.rotulo;
  if (!escolhido?.from) return "Período";

  const dia = (d: Date) => `${d.getDate()} de ${MES_CURTO[d.getMonth()]}`;
  const umDiaSo = !escolhido.to
    || inicioDoDia(escolhido.to).getTime() === inicioDoDia(escolhido.from).getTime();
  if (umDiaSo) return dia(escolhido.from);
  return `${escolhido.from.getDate()} a ${dia(escolhido.to!)}`;
}

/** O lead chegou dentro do recorte? Sem data de chegada, fica de fora. */
export function dentroDoPeriodo(chegouEm: string | null, periodo: { de: Date; ate: Date } | null): boolean {
  if (!periodo) return true;
  if (!chegouEm) return false;
  const t = new Date(chegouEm).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= periodo.de.getTime() && t <= periodo.ate.getTime();
}
