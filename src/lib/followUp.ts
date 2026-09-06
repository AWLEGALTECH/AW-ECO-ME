// A CENTRAL DE FOLLOW-UP — a régua de quando cobrar, e de quem.
//
// Substitui uma planilha que fazia o cálculo ao contrário: "hoje é dia X, então
// quem leva o UP03 é quem entrou em X−15" — e alguém procurava essas pessoas à
// mão, uma a uma, no chat. O trabalho todo era ACHAR QUEM, não fazer.
//
// ─────────────────────── as três decisões que sustentam tudo ───────────────
//
// 1. O RELÓGIO COMEÇA NO SILÊNCIO, NÃO NO PRIMEIRO CONTATO.
//    A planilha contava do primeiro contato porque o chat dela não oferecia
//    outra âncora. Aqui existe uma melhor: o momento em que o lead parou de
//    responder. A diferença é grande — contado do primeiro contato, alguém que
//    conversou três semanas e sumiu ONTEM cairia direto na cobrança de "60
//    dias", escrita para quem sumiu há dois meses.
//
// 2. ENTRA QUEM FICOU SEM RESPOSTA DEPOIS DE UMA MENSAGEM NOSSA.
//    Isso separa duas coisas que se parecem na tela e são opostas:
//
//      ele escreveu e ninguém respondeu  →  caixa não respondida. Falha nossa,
//                                           urgência hoje, não é cadência.
//      nós escrevemos e ele sumiu        →  follow-up.
//
//    Juntar as duas na mesma fila faria a primeira desaparecer embaixo da
//    segunda — e a primeira é a que perde cliente.
//
// 3. A CADÊNCIA CONTA DO ÚLTIMO TOQUE, NÃO DE UM CALENDÁRIO FIXO.
//    Se o segundo follow-up for feito com cinco dias de atraso, o terceiro não
//    pode vencer no dia seguinte. O que importa é "quantos dias desde que a
//    gente cutucou pela última vez", não uma data que já foi perdida.

/** Dias desde o silêncio em que cada cobrança vence. */
export const CADENCIA = [1, 5, 15, 30, 60] as const;

/** Quantas cobranças a régua tem, no total. */
export const TOTAL_RODADAS = CADENCIA.length;

/** O nome curto de cada rodada, do jeito que a planilha nomeia. */
export function rotuloDaRodada(rodada: number): string {
  return `UP${String(rodada).padStart(2, "0")}`;
}

/**
 * O que dizer em cada cobrança.
 *
 * O texto não é a mensagem que vai pro cliente — é o que a task diz para quem
 * vai escrever. Cada rodada tem uma intenção diferente, e é isso que evita as
 * cinco cobranças virarem cinco "e aí, tudo certo?".
 */
export const INTENCAO: Record<number, { titulo: string; detalhe: string }> = {
  1: {
    titulo: "1º follow-up — retomar",
    detalhe: "Um dia sem resposta. Retome de onde parou, sem cobrar: pergunte se ficou alguma dúvida do que foi dito.",
  },
  2: {
    titulo: "2º follow-up — tirar o obstáculo",
    detalhe: "Cinco dias. Quem some nessa altura em geral travou em algo concreto. Pergunte o que falta para decidir.",
  },
  3: {
    titulo: "3º follow-up — trazer novidade",
    detalhe: "Quinze dias. Repetir a mesma pergunta não move. Traga algo novo: um caso parecido, um prazo que mudou.",
  },
  4: {
    titulo: "4º follow-up — checar se ainda faz sentido",
    detalhe: "Trinta dias. Pergunte diretamente se o assunto ainda está de pé — resposta negativa também é resposta.",
  },
  5: {
    titulo: "5º follow-up — encerrar ou reabrir",
    detalhe: "Sessenta dias. Última da régua. Deixe a porta aberta e registre o desfecho; depois desta, o lead sai da cadência.",
  },
};

/** Um dia em ISO, sem hora e sem fuso — é assim que a task guarda. */
export const diaISO = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const somaDias = (iso: string, n: number): string => {
  const [a, m, d] = iso.split("-").map(Number);
  return diaISO(new Date(a, m - 1, d + n));
};

/**
 * Quando vence a PRIMEIRA cobrança de uma conversa que acabou de silenciar.
 *
 * Conta de `desdeISO` — o dia da nossa última mensagem sem resposta.
 */
export function vencimentoDaPrimeira(desdeISO: string): string {
  return somaDias(desdeISO, CADENCIA[0]);
}

/**
 * Quando vence a PRÓXIMA, dado que a rodada `rodada` foi concluída em `feitaEm`.
 *
 * O intervalo é a diferença entre dois degraus da régua — de 5 para 15 são dez
 * dias — e ele é contado a partir de quando a cobrança foi REALMENTE feita.
 * Fosse contado do calendário original, uma cobrança atrasada empurraria a
 * seguinte pro mesmo dia, e a régua inteira desabaria numa tarde.
 *
 * Null quando a régua acabou: não há próxima, o lead sai da cadência.
 */
export function vencimentoDaProxima(rodada: number, feitaEmISO: string): string | null {
  if (rodada < 1 || rodada >= CADENCIA.length) return null;
  const intervalo = CADENCIA[rodada] - CADENCIA[rodada - 1];
  return somaDias(feitaEmISO, intervalo);
}

export type SituacaoDaConversa = {
  /** quem falou por último */
  ultimaFoi: "lead" | "nos" | null;
  /** o dia da última mensagem, ISO */
  ultimaEm: string | null;
  etapa: string | null;
  arquivada?: boolean;
};

/**
 * Esta conversa deve estar na cadência?
 *
 * A porta de ENTRADA é uma só: a última palavra foi nossa e ela ficou sem
 * resposta. As de SAÍDA são quatro, e importam tanto quanto — cadência que não
 * sabe terminar vira lista de fantasmas, e lista de fantasmas ninguém abre.
 */
export function entraNaCadencia(c: SituacaoDaConversa): boolean {
  if (c.arquivada) return false;              // saída: tirada da caixa
  if (c.etapa === "fechado") return false;    // saída: virou cliente
  if (!c.ultimaEm) return false;              // nunca houve conversa
  return c.ultimaFoi === "nos";               // entrada: falamos e ele sumiu
}

/**
 * Por que esta conversa NÃO está na cadência — em português.
 *
 * Existe porque "não aparece na lista" é a pior resposta possível para quem
 * está procurando um lead específico. Com o motivo escrito, a pessoa sabe se
 * precisa agir ou se o sistema está certo.
 */
export function motivoDeFora(c: SituacaoDaConversa): string | null {
  if (entraNaCadencia(c)) return null;
  if (c.arquivada) return "conversa arquivada";
  if (c.etapa === "fechado") return "já fechou";
  if (!c.ultimaEm) return "ainda não houve conversa";
  if (c.ultimaFoi === "lead") return "ele respondeu — a bola está com a gente";
  return "fora da cadência";
}

/** Vencida, para hoje, ou ainda por vir — é o que ordena a central. */
export type Urgencia = "atrasada" | "hoje" | "futura";

export function urgenciaDaTask(diaISOTask: string, hojeISO: string): Urgencia {
  if (diaISOTask < hojeISO) return "atrasada";
  if (diaISOTask === hojeISO) return "hoje";
  return "futura";
}

/** Quantos dias de atraso. Zero quando não está atrasada. */
export function diasDeAtraso(diaISOTask: string, hojeISO: string): number {
  const [a1, m1, d1] = diaISOTask.split("-").map(Number);
  const [a2, m2, d2] = hojeISO.split("-").map(Number);
  const t1 = new Date(a1, m1 - 1, d1).getTime();
  const t2 = new Date(a2, m2 - 1, d2).getTime();
  return Math.max(0, Math.round((t2 - t1) / 86400000));
}
