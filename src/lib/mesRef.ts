// O MÊS COMO RECORTE — usado pelo Wallet, onde o mês é o parâmetro principal.
//
// A referência é sempre a string "YYYY-MM". Andar no mês passa por
// `new Date(ano, mês - 1 + passos, 1)`, que já vira o ano sozinho nos dois
// sentidos — somar 1 em dezembro dá janeiro do ano seguinte, subtrair 1 em
// janeiro dá dezembro do anterior. Fazer a conta na mão em cima do número do
// mês é o caminho curto pra ter um "mês 13" ou um "mês 0" na tela.
//
// Tudo aqui trabalha em horário LOCAL, de propósito. `toISOString()` converte
// pra UTC, e no Brasil isso adianta o relógio em 3 horas: no dia 31 às 21h o
// mês corrente já seria o seguinte. Justamente na virada do mês, que é quando
// o escritório mais olha essa tela.

export const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const ref = (ano: number, mesZeroBased: number) =>
  `${ano}-${String(mesZeroBased + 1).padStart(2, "0")}`;

/** O mês de hoje, em horário local. */
export function mesAtual(agora: Date = new Date()): string {
  return ref(agora.getFullYear(), agora.getMonth());
}

/** Anda `passos` meses a partir de uma referência (aceita negativo). */
export function mesDeslocado(referencia: string, passos: number): string {
  const [a, m] = referencia.split("-").map(Number);
  const d = new Date(a, m - 1 + passos, 1);
  return ref(d.getFullYear(), d.getMonth());
}

/** Nome do mês e ano, pra escrever no título. */
export function mesPorExtenso(referencia: string): { nome: string; ano: number } {
  const [a, m] = referencia.split("-").map(Number);
  return { nome: MESES_PT[m - 1] ?? referencia, ano: a };
}

/** Primeiro e último dia do mês, em ISO — a janela que filtra a lista. */
export function janelaDoMes(referencia: string): { de: string; ate: string } {
  const [a, m] = referencia.split("-").map(Number);
  // dia 0 do mês seguinte é o último dia deste; cobre fevereiro e bissexto
  const ultimo = new Date(a, m, 0).getDate();
  return { de: `${referencia}-01`, ate: `${referencia}-${String(ultimo).padStart(2, "0")}` };
}

/** Quantos meses separam duas referências. Negativo se a segunda for antes. */
export function mesesEntre(de: string, ate: string): number {
  const [a1, m1] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}
