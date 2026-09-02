// O TEMPO DA CASCATA QUANDO O PROCESSO PULA ETAPAS.
//
// Fechado um acordo lá na contestação, o processo atropela oito etapas de uma
// vez. Oito X aparecendo juntos não contam história nenhuma; acendendo um de
// cada vez, de cima pra baixo, o que se vê é o fluxo da ação correndo até o
// acordo e abrindo lá.
//
// ERA DUAS ANIMAÇÕES. Primeiro a "fita" enchia a linha da etapa atual até a
// seguinte, e só depois a cascata saía cortando as puladas — dois movimentos
// contando a mesma coisa, um atrás do outro, e o segundo parecendo começar do
// zero. Com salto, agora, só a cascata acontece. A fita ficou pro avanço
// normal, de uma etapa pra seguinte, onde não há corte nenhum e sem ela não
// sobraria animação alguma.
//
// A CADEIA COMEÇA NA ETAPA CONCLUÍDA, não na primeira pulada. O trecho que
// acende primeiro é o que sai debaixo do check; se a cascata começasse na
// primeira pulada, aquele primeiro pedaço apareceria pronto e o corte pareceria
// brotar do meio da linha.
//
// Isto aqui é só a conta. Quem desenha é o ProcessoTimeline — mas a conta mora
// fora dele porque errar meio passo aqui faz a etapa nova abrir antes de o
// corte chegar nela, e isso não se vê lendo JSX.

/** segundos entre um trecho da linha e o seguinte */
export const PASSO_PULADA = 0.13;
/** respiro depois do check da etapa concluída, antes de o pulso sair */
export const INICIO_CASCATA = 0.15;

/**
 * Os ids na ordem em que o pulso desce: a etapa concluída primeiro, depois cada
 * pulada. Sem salto não há cascata — devolve lista vazia, e a fita assume.
 */
export function cadeiaDoPulso(concluida: string, puladas: string[]): string[] {
  return puladas.length ? [concluida, ...puladas] : [];
}

/** Quando o trecho de índice `i` da cadeia começa a acender. */
export function acendeEm(i: number): number {
  return INICIO_CASCATA + i * PASSO_PULADA;
}

/**
 * Quando o pulso chega na etapa nova — é aí que ela abre.
 *
 * São n+1 trechos: o da concluída mais um por pulada. Sem pulada nenhuma não há
 * cascata, e o zero diz isso.
 */
export function fimDaCascata(n: number): number {
  return n ? INICIO_CASCATA + (n + 1) * PASSO_PULADA : 0;
}

/**
 * A fita (linha longa se preenchendo por inteiro) só toca no avanço sem salto.
 * Com salto ela vira a primeira das duas animações costuradas que o corte já
 * conta sozinho.
 */
export function temFita(nPuladas: number): boolean {
  return nPuladas === 0;
}
