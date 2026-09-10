/* MENSAGENS RÁPIDAS: os atalhos de barra do campo de digitar.
 *
 * Digitar "/" no campo abre a lista; digitar "/ext" filtra até a frase que se
 * quer; clicar (ou Enter) põe a frase inteira no campo. É o mesmo gesto de
 * qualquer aplicativo com comando de barra, e a graça está em não ter que
 * pensar nele.
 *
 * O QUE ESTE MÓDULO DECIDE: quando a lista abre, o que ela mostra, e o que é um
 * comando válido. A tela e o banco ficam de fora, que é o que permite testar a
 * regra sem abrir o navegador.
 */

export interface Atalho {
  id: string;
  /** o que se digita depois da barra, sem a barra */
  comando: string;
  conteudo: string;
}

/** Comando cru do que a pessoa digitou: minúsculo, sem acento, sem espaço. */
export function normalizarComando(bruto: string): string {
  return (bruto || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^\/+/, "")          // "/extrato" e "extrato" são a mesma coisa
    .trim()
    .replace(/\s+/g, "-")         // "pedir extrato" vira "pedir-extrato"
    .replace(/[^a-z0-9_-]/g, "")  // o resto não sobrevive a ser digitado correndo
    .slice(0, 24);
}

/** O que o banco aceita. Mesma regra do CHECK, para o erro aparecer antes de ir. */
export function comandoValido(comando: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,23}$/.test(comando);
}

/**
 * O termo que a pessoa está digitando depois da barra, ou `null` quando a
 * lista não deve aparecer.
 *
 * A lista só abre quando o rascunho COMEÇA com a barra: é o rascunho inteiro
 * que vai ser trocado pela frase, então uma barra no meio da mensagem ("e/ou",
 * "24/48h") não é comando e abrir ali seria atrapalhar quem escreve.
 *
 * O espaço fecha: quem digitou "/ ..." está escrevendo uma mensagem que começa
 * com barra, não chamando um atalho.
 */
export function termoDoRascunho(texto: string): string | null {
  if (!texto.startsWith("/")) return null;
  const resto = texto.slice(1);
  if (/\s/.test(resto)) return null;
  return resto.toLowerCase();
}

/**
 * Os atalhos que casam com o termo.
 *
 * Quem começa com o termo vem primeiro (é o que a pessoa está digitando);
 * depois quem o tem no meio do comando ou no texto da mensagem, que é como se
 * acha a frase de que só se lembra o assunto. Termo vazio mostra tudo.
 */
export function filtrarAtalhos(atalhos: Atalho[], termo: string): Atalho[] {
  const t = (termo || "").toLowerCase().trim();
  const porComando = (a: Atalho, b: Atalho) => a.comando.localeCompare(b.comando, "pt-BR");
  if (!t) return [...atalhos].sort(porComando);

  const comeca = atalhos.filter((a) => a.comando.startsWith(t)).sort(porComando);
  const dentro = atalhos
    .filter((a) => !a.comando.startsWith(t) &&
      (a.comando.includes(t) || a.conteudo.toLowerCase().includes(t)))
    .sort(porComando);
  return [...comeca, ...dentro];
}

/** Já existe atalho com este comando? Ignora a própria linha, ao editar. */
export function comandoDuplicado(atalhos: Atalho[], comando: string, ignorarId?: string | null): boolean {
  return atalhos.some((a) => a.comando === comando && a.id !== ignorarId);
}

/** Mantém o índice escolhido dentro da lista quando ela encolhe ao filtrar. */
export function indiceNaLista(indice: number, tamanho: number): number {
  if (tamanho <= 0) return 0;
  return Math.min(Math.max(0, indice), tamanho - 1);
}
