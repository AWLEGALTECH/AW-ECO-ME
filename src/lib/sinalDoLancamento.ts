/* O SINAL QUE O HISTÓRICO DO LANÇAMENTO JÁ DIZ SOZINHO.
 *
 * O texto extraído do PDF do Bradesco perde a coluna: "Crédito (R$)" e
 * "Débito (R$)" viram um número só antes do saldo, e o saldo devedor é impresso
 * SEM sinal (a conta que está em 331,49 negativos aparece como "331,49"). Quem
 * lê o texto não sabe, por esse número, se o dinheiro entrou ou saiu.
 *
 * Mas há rubricas que nunca são entrada. Tarifa, IOF, encargo, mora, parcela,
 * saque, PIX enviado: é sempre dinheiro saindo. E há as que nunca são saída:
 * INSS, salário, PIX recebido, rendimento, depósito. Este módulo é esse
 * vocabulário, e serve de ÂNCORA: o parser usa a votação dessas rubricas para
 * decidir de que lado do zero a conta estava, e a leitura por IA usa para
 * corrigir chute errado do modelo.
 *
 * Só entra aqui o que é inequívoco. "TRANSF CC PARA CC" pode ser os dois lados;
 * fica de fora e deixa o saldo decidir.
 */

/** Maiúsculo e sem acento, que é como o banco grava e como a regra compara. */
export function historicoNormalizado(desc: string): string {
  return String(desc || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

/* Estorno e devolução devolvem dinheiro: são crédito mesmo quando a rubrica
   estornada é uma tarifa. Por isso são testados ANTES da lista de débitos. */
const CREDITO_ANTES = [/^ESTORNO/, /^DEVOLUCAO/, /^DEV\b/, /^CANCELAMENTO/];

const DEBITO = [
  /^MORA\b/, /^MORA-/, /\bJUROS\b/, /^ENCARGOS?\b/, /^IOF\b/,
  /TARIFA/, /^PACOTE DE SERVI/, /^PACOTE SERV/, /^CESTA\b/, /ANUIDADE/, /^PEND\.?\s*TARIFA/,
  /^PARCELA\b/, /^PRESTACAO\b/, /^PGTO\b/, /^PAGTO\b/, /^PAGAMENTO\b/, /^COMPRA\b/,
  /^SAQUE\b/, /^PIX ENVIADO/, /^PIX QR CODE/, /^TED ENVIAD/, /^DOC ENVIAD/,
  /^TITULO DE CAPITALIZA/, /^SEGURO/, /^DEB(ITO)?\.? ?AUTOM/, /^DEBITO\b/,
  /^OPERACOES VENCIDAS CONTR/,           // recuperação de atrasado: o banco toma o que entrou
  /^TRANSFERENCIA PIX\b.*\bDES:/,        // DES = destinatário: saiu
  /^TRANSF(ERENCIA)?\b.*\bDES:/,
];

const CREDITO = [
  /^INSS\b/, /SALARIO/, /^TRANSF SALDO C\/SAL/, /^PIX RECEBIDO/, /^RENDIMENTO/,
  /BENEFICIO/, /APOSENTAD/, /PROVENTO/, /^DEP\b/, /^DEPOSITO/,
  /^TED-TRANSF ELET DISPON/, /^DOC CREDITO/, /^CREDITO AUTOM/, /^CRED\.? ?AUTOM/,
  /^RECEBIMENTO\b/, /^EMPRESTIMO\b/, /^LIBERACAO/, /^LIB\.? CRED/,
  /^TRANSFERENCIA PIX\b.*\bREMT?:/,      // REM = remetente: entrou
  /^TRANSF(ERENCIA)?\b.*\bREMT?:/,
];

/**
 * -1 quando o histórico é sempre saída, +1 quando é sempre entrada, 0 quando
 * o texto sozinho não decide (e aí manda o saldo).
 */
export function sinalPeloHistorico(desc: string): -1 | 0 | 1 {
  const d = historicoNormalizado(desc);
  if (!d) return 0;
  if (CREDITO_ANTES.some((re) => re.test(d))) return 1;
  if (DEBITO.some((re) => re.test(d))) return -1;
  if (CREDITO.some((re) => re.test(d))) return 1;
  return 0;
}

/**
 * Aplica o vocabulário a um valor já com sinal: se a rubrica é inequívoca e o
 * sinal veio trocado, corrige; se não é, devolve como veio. É o remendo para a
 * leitura por IA, que não vê coluna nenhuma e chuta.
 */
export function corrigirSinalPeloHistorico(desc: string, valorComSinal: number): number {
  const r = sinalPeloHistorico(desc);
  if (r === 0) return valorComSinal;
  return r * Math.abs(valorComSinal);
}
