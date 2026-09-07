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

/** Dias desde o silêncio em que cada cobrança vence, quando ninguém mexeu.
 *
 * DEIXOU DE SER A VERDADE E VIROU O PADRÃO. A régua de verdade mora em
 * `wa_followup_cadencia` e pode ser ajustada na tela — no mês de audiência,
 * cobrar de 1 dia é perseguição; na semana morta, esperar 15 é perder o lead.
 * Este array continua aqui como o que vale antes de a tabela responder, e como
 * o que volta a valer se ela vier vazia: a fila do dia não pode sumir por causa
 * de uma consulta que falhou. */
export const CADENCIA = [1, 5, 15, 30, 60] as const;

/** Quantas cobranças a régua tem, no total. */
export const TOTAL_RODADAS = CADENCIA.length;

/** A régua em uso — a ajustada, se houver; a padrão, se não. */
export type Regua = readonly number[];

/* Uma régua vinda do banco pode chegar curta, com buraco ou fora de ordem —
   basta alguém ter apagado uma linha. Aqui ela é COMPLETADA com o padrão em vez
   de recusada: uma régua torta ainda cobra gente, uma régua ausente não cobra
   ninguém. */
export function reguaValida(dias: number[] | null | undefined): Regua {
  if (!dias || dias.length === 0) return CADENCIA;
  return Array.from({ length: TOTAL_RODADAS }, (_, i) =>
    Number.isFinite(dias[i]) && dias[i] > 0 ? dias[i] : CADENCIA[i]);
}

/** O nome curto de cada rodada, do jeito que a planilha nomeia. */
export function rotuloDaRodada(rodada: number): string {
  return `UP${String(rodada).padStart(2, "0")}`;
}

/** Em que degrau da régua essa rodada cai — 1, 5, 15, 30 ou 60 dias no padrão. */
export function diasDaRodada(rodada: number, regua: Regua = CADENCIA): number | null {
  if (rodada < 1 || rodada > TOTAL_RODADAS) return null;
  return regua[rodada - 1] ?? CADENCIA[rodada - 1];
}

/**
 * O rótulo que vai no cartão.
 *
 * "UP01 de 5" contava a posição na fila, e posição na fila não muda o que se
 * escreve. O DEGRAU muda: "de 1 dia" pede um lembrete leve, "de 60 dias" pede
 * uma mensagem de encerramento. É a mesma informação — a primeira rodada é
 * sempre a de 1 dia —, dita pelo lado que decide a mensagem.
 */
export function rotuloDoDegrau(rodada: number, regua: Regua = CADENCIA): string {
  const d = diasDaRodada(rodada, regua);
  if (d === null) return "Follow-up";
  return `Follow-up de ${d} ${d === 1 ? "dia" : "dias"}`;
}

/**
 * O que dizer em cada cobrança.
 *
 * O texto não é a mensagem que vai pro cliente — é o que a task diz para quem
 * vai escrever. Cada rodada tem uma intenção diferente, e é isso que evita as
 * cinco cobranças virarem cinco "e aí, tudo certo?".
 */
export const INTENCAO: Record<number, { titulo: string; detalhe: string }> = {
  /* SEM O NÚMERO DE DIAS ESCRITO NO TEXTO. Ele estava aqui ("Cinco dias.") e
     virou mentira no dia em que a régua passou a ser ajustável: o degrau da
     segunda rodada pode ser 3 ou 7 agora. Quem mostra o número é a tela, que lê
     a régua em uso; aqui fica só a INTENÇÃO, que não muda com o calendário. */
  1: {
    titulo: "Retomar de onde parou",
    detalhe: "Primeiro toque. Retome sem cobrar: pergunte se ficou alguma dúvida do que foi dito.",
  },
  2: {
    titulo: "Tirar o obstáculo",
    detalhe: "Quem some nesta altura em geral travou em algo concreto. Pergunte o que falta para decidir.",
  },
  3: {
    titulo: "Trazer novidade",
    detalhe: "Repetir a mesma pergunta não move. Traga algo novo: um caso parecido, um prazo que mudou.",
  },
  4: {
    titulo: "Checar se ainda faz sentido",
    detalhe: "Pergunte diretamente se o assunto ainda está de pé. Resposta negativa também é resposta.",
  },
  5: {
    titulo: "Encerrar ou reabrir",
    detalhe: "Última da régua. Deixe a porta aberta e registre o desfecho; depois desta, o lead sai da cadência.",
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
export function vencimentoDaPrimeira(desdeISO: string, regua: Regua = CADENCIA): string {
  return somaDias(desdeISO, regua[0] ?? CADENCIA[0]);
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
export function vencimentoDaProxima(
  rodada: number, feitaEmISO: string, regua: Regua = CADENCIA,
): string | null {
  if (rodada < 1 || rodada >= TOTAL_RODADAS) return null;
  const intervalo = (regua[rodada] ?? CADENCIA[rodada]) - (regua[rodada - 1] ?? CADENCIA[rodada - 1]);
  /* Uma régua que não sobe agendaria a próxima cobrança para ANTES da que
     acabou de ser feita. O banco já recusa isso na hora de salvar; aqui o piso
     de um dia é o cinto de segurança de quem leu a régua antes da correção. */
  return somaDias(feitaEmISO, Math.max(1, intervalo));
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
  if (c.ultimaFoi === "lead") return "ele respondeu, a bola está com a gente";
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
