/* O PULO DE ETAPA, VISTO DE DENTRO DA CONVERSA.
 *
 * A jornada da direita já mostra onde o lead está. O que ela não mostra é o
 * INSTANTE em que ele se mexeu: a bolinha simplesmente está preenchida da
 * próxima vez que alguém olha para lá, e quem estava conversando não viu nada
 * acontecer. Quando a etapa anda por conta própria (o cliente mandou o PDF, o
 * ZapSign avisou que assinou), o avanço acontece no meio de uma conversa que
 * está sendo lida, e passa em branco.
 *
 * Este módulo é só a DECISÃO: houve avanço, e qual foi. A comemoração é da
 * tela. Aqui ficam as três respostas que precisam estar certas para o pop não
 * virar estorvo:
 *
 *   1. VOLTAR NÃO É AVANÇO. Corrigir uma etapa marcada por engano é rotina, e
 *      comemorar uma correção ensina a pessoa a ignorar a comemoração.
 *   2. TROCAR DE CONVERSA NÃO É AVANÇO. Quem passa por dez leads da fila veria
 *      dez pops, um por lead, todos falsos. Por isso a comparação é sempre
 *      dentro da MESMA conversa, e a primeira vez que se vê uma conversa nunca
 *      conta.
 *   3. PERDIDO NÃO É ETAPA DE TRILHO. É saída do funil, e não tem nada de
 *      dopaminérgico.
 */
import { etapasDaJornada, trilhoDaJornada, type Jornada } from "@/lib/jornada";

export interface Avanco {
  /** de onde saiu, já com o nome que a pessoa lê */
  de: string;
  /** para onde foi */
  para: string;
  /** quantas etapas pulou de uma vez (o automático às vezes pula) */
  passos: number;
  /** a posição no trilho, 1-based, e o tamanho dele: "3 de 7" */
  posicao: number;
  total: number;
  /** chegou na última do trilho. É a única que merece festa grande */
  chegada: boolean;
}

/**
 * Houve avanço entre duas etapas da mesma conversa?
 *
 * `de` ausente quer dizer "é a primeira vez que vejo esta conversa": não dá
 * para saber se ela andou, e chutar que sim encheria a tela de pop toda vez que
 * alguém abrisse um lead.
 */
export function avancoEntre(
  jornada: Jornada | null | undefined,
  de: string | null | undefined,
  para: string | null | undefined,
): Avanco | null {
  if (!de || !para || de === para) return null;

  const todas = etapasDaJornada(jornada);
  const iDe = todas.findIndex((e) => e.chave === de);
  const iPara = todas.findIndex((e) => e.chave === para);
  // Chave que não é desta jornada (uma conversa que trocou de base, por
  // exemplo): não dá para dizer se andou para frente.
  if (iDe < 0 || iPara < 0) return null;
  if (todas[iDe].terminal || todas[iPara].terminal) return null;
  if (iPara <= iDe) return null;

  const trilho = trilhoDaJornada(jornada);
  const posicao = trilho.findIndex((e) => e.chave === para) + 1;

  return {
    de: todas[iDe].rotulo,
    para: todas[iPara].rotulo,
    passos: iPara - iDe,
    posicao,
    total: trilho.length,
    chegada: posicao === trilho.length,
  };
}

/**
 * Quanto tempo o pop fica na tela, em milissegundos.
 *
 * A chegada merece mais: é a única vez que aquele lead vira contrato, e é o
 * único momento em que valer a pena parar para olhar. O resto é um aceno.
 */
export function duracaoDoPop(a: Avanco): number {
  return a.chegada ? 3600 : 2400;
}
