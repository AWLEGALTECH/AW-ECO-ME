/* O REQUERIDO DE UM PROCESSO, do lado da tela.
 *
 * A coluna `processos.requeridos` guarda CHAVES (`BANCO_BRADESCO`), e o nome de
 * tela mora em `requeridos_catalogo`. É o mesmo desenho de `materias_catalogo`:
 * renomear "Banco Bradesco S/A" para "Banco Bradesco" passa a ser uma linha
 * editada, e não um UPDATE em 283 processos.
 *
 * ESTE ARQUIVO É ESPELHO DE `fn_requerido_chave` NO BANCO, e isso é uma dívida
 * consciente: a mesma regra escrita duas vezes, uma em SQL e uma aqui. A
 * alternativa seria uma ida ao banco a cada tecla digitada. O que segura as
 * duas juntas é o teste — se alguém mexer numa e não na outra, um nome digitado
 * na tela deixa de encontrar a linha que o gatilho criou, e o requerido aparece
 * duplicado no catálogo com duas chaves diferentes.
 */

/** A chave a partir do nome. Espelho de `public.fn_requerido_chave`. */
export function chaveDeRequerido(nome: string): string {
  const semAcento = (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  return semAcento
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/**
 * O nome como ele se escreve: SEMPRE MAIÚSCULO.
 *
 * A ficha põe matéria e requerido um embaixo do outro, e a matéria vem da
 * planilha em caixa alta. Com o réu em caixa mista logo abaixo — "ALIMENTO
 * CONTAMINADO" sobre "Nestle Brasil Ltda" — as duas linhas parecem vir de
 * sistemas diferentes.
 *
 * A caixa mista não era escolha nossa: é o DJEN, que escreve "BANCO BRADESCO"
 * numa publicação e "Nestle Brasil Ltda" na outra. Herdar a inconsistência da
 * fonte é herdar o problema.
 *
 * OS ACENTOS FICAM: PREVIDÊNCIA, LOCAÇÃO, ÂMBAR. Tirar acento seria outra
 * decisão, e uma que empobrece o nome próprio de uma empresa. O banco tem a
 * mesma regra num CHECK, então isto aqui é conveniência da tela — não é o que
 * segura a regra de pé.
 */
export function nomeDeRequerido(nome: string): string {
  return (nome ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * A lista digitada vira nomes.
 *
 * Separa por vírgula, e NÃO por ponto-e-vírgula nem por "e": razão social tem
 * vírgula ("FACTA FINANCEIRA S.A. CREDITO, FINANCIAMENTO E INVESTIMENTO") e
 * tem "e", então qualquer separador mais esperto quebraria nomes legítimos ao
 * meio. Com vírgula só, quem tem dois réus digita dois nomes e o pior caso é
 * uma razão social partida — visível na hora, no chip que aparece.
 */
export function nomesDaLista(texto: string): string[] {
  return (texto ?? "")
    .split(",")
    .map(nomeDeRequerido)
    .filter((n) => n.length > 1);
}

/** Os nomes viram a lista para o campo de texto. */
export function listaDosNomes(nomes: string[]): string {
  return (nomes ?? []).filter(Boolean).join(", ");
}

/** As chaves viram nomes de tela; chave sem catálogo mostra a si mesma. */
export function nomesDasChaves(
  chaves: string[] | null | undefined,
  catalogo: Record<string, string>,
): string[] {
  return (chaves ?? []).map((c) => catalogo[c] ?? c);
}

/** Duas listas de chave são a mesma? Ordem não conta — litisconsórcio não tem primeiro. */
export function mesmasChaves(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  const x = [...(a ?? [])].sort();
  const y = [...(b ?? [])].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** De onde veio a resposta, em uma frase que se entende sem saber o esquema. */
export function fonteDoRequerido(origem: string | null | undefined): string | null {
  switch (origem) {
    case "djen":      return "Conferido na distribuição do tribunal.";
    case "intimacao": return "Lido de uma intimação do processo.";
    case "contrato":  return "Herdado do contrato do cliente. Ninguém conferiu no tribunal.";
    case "manual":    return "Preenchido à mão.";
    default:          return null;
  }
}
