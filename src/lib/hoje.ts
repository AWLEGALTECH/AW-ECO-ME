// QUE DIA É HOJE PRO ESCRITÓRIO.
//
// `new Date().toISOString()` devolve UTC. Manaus é UTC-4, então das 20h à
// meia-noite o ISO já está no dia seguinte: às 20:18 de 31/08 ele diz
// 2026-09-01. Todo lugar que carimbava "hoje" desse jeito errava a data em
// quatro horas por dia — e sempre nas quatro horas em que alguém está fechando
// o mês.
//
// Foi assim que um fechamento feito em 31/08 nasceu em setembro e a tela de
// Fechamentos abriu no mês errado.
//
// A conta certa é o calendário LOCAL de quem está olhando: getFullYear,
// getMonth e getDate, que já respeitam o fuso do navegador. Não é preciso fixar
// America/Manaus — quem abrir de outro fuso vê o próprio dia, que é o
// comportamento esperado de um sistema usado por pessoas, não por servidores.

const pad = (n: number) => String(n).padStart(2, "0");

/** Hoje em AAAA-MM-DD, pelo calendário de quem está olhando. */
export function hojeISO(agora: Date = new Date()): string {
  return `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`;
}

/** Uma data qualquer em AAAA-MM-DD, sem passar por UTC. */
export function dataISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** O mês de hoje em AAAA-MM. */
export function mesDeHoje(agora: Date = new Date()): string {
  return hojeISO(agora).slice(0, 7);
}
