/* SEGUNDO GRAU: o que a ficha precisa saber sobre um status para decidir se
 * mostra o card de segundo grau e se exige a câmara ou turma.
 *
 * Pedido no chamado: "sempre que avançar para AG. ACÓRDÃO, obrigatório qual
 * câmara ou turma está o processo, para ficar salvo".
 */

/** Statuses em que o processo já está (ou acabou de ir) no segundo grau. */
export const STATUS_SEGUNDO_GRAU: readonly string[] = [
  "AG. REMESSA AO 2º GRAU",
  "AG. DISTRIBUIÇÃO 2º GRAU",
  "AG. DESPACHO INICIAL 2º GRAU",
  "AG. TJ SENTENÇA",
  "AG. TJ ACÓRDÃO",
  "AG. ACÓRDÃO",
  "JULGADO ACÓRDÃO",
  "AG. EMBARGOS",
];

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

export function ehSegundoGrau(status: string | null | undefined): boolean {
  const s = norm(status);
  return STATUS_SEGUNDO_GRAU.some((x) => norm(x) === s);
}

/** Acórdão só sai de uma câmara ou turma: sem saber qual, o status não entra. */
export function exigeOrgaoJulgador(status: string | null | undefined): boolean {
  return /ACORDAO/.test(norm(status));
}

/** Os órgãos do TJAM que julgam os recursos desta carteira. Sugestão, não lista fechada. */
export const ORGAOS_SUGERIDOS: readonly string[] = [
  "1ª TURMA RECURSAL",
  "2ª TURMA RECURSAL",
  "3ª TURMA RECURSAL",
  "4ª TURMA RECURSAL",
  "PRIMEIRA CÂMARA CÍVEL",
  "SEGUNDA CÂMARA CÍVEL",
  "TERCEIRA CÂMARA CÍVEL",
  "CÂMARAS REUNIDAS",
];

/** Caixa alta, sem espaço sobrando, como o resto da ficha. */
export function normalizarOrgao(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLocaleUpperCase("pt-BR");
}

/**
 * Quantos dias o processo está no segundo grau, contados da data em que
 * subiu. `null` quando não há data.
 */
export function diasNoSegundoGrau(dataSubida: string | null | undefined, hoje = new Date()): number | null {
  if (!dataSubida) return null;
  const [y, m, d] = dataSubida.split("-").map(Number);
  if (!y || !m || !d) return null;
  const base = new Date(y, m - 1, d);
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.max(0, Math.round((h.getTime() - base.getTime()) / 86400000));
}
