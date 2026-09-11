/* BUSCAR SEM TROPEÇAR NO ACENTO.
 *
 * O extrato do banco vem em caixa alta e SEM ACENTO: o que está gravado é
 * "OPERACOES VENCIDAS", "TARIFA MANUTENCAO", "EMPRESTIMO CONSIGNADO". Quem
 * procura, porém, escreve como se fala, com acento e cedilha.
 *
 * Comparar os dois crus faz a busca dizer "nenhuma transação bate" em cima de
 * 109 lançamentos que estão bem ali. Foi o que aconteceu no chamado do banco de
 * descontos: a rubrica procurada era "OPERAÇÕES VENCIDAS" e o banco guarda
 * "OPERACOES VENCIDAS". Nenhum erro apareceu; a tela só disse que não havia
 * nada, e "não há nada" é uma resposta que ninguém contesta.
 *
 * Aqui os dois lados passam pela mesma peneira antes de se encontrarem.
 */

/**
 * O texto do jeito que se compara: sem acento, sem caixa, sem espaço dobrado.
 *
 * `NFD` separa a letra do acento ("ç" vira "c" + cedilha) e o segundo passo
 * joga fora a parte de cima. É o mesmo caminho que o `unaccent` do Postgres
 * faz do outro lado, e por isso os dois concordam.
 */
export function paraBusca(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O que a pessoa digitou está neste texto?
 *
 * TODAS as palavras precisam aparecer, em qualquer ordem. É o que faz
 * "vencidas operacoes" achar "OPERACOES VENCIDAS CONTR. 5090675", e o que
 * permite juntar pedaços de campos diferentes ("silva 320" acha o lançamento de
 * R$ 320 do Silva) sem que a ordem em que a tela montou o texto importe.
 *
 * Busca vazia combina com tudo: filtrar por nada é não filtrar.
 */
export function combina(textoJaNormalizado: string, busca: string): boolean {
  const termos = paraBusca(busca).split(" ").filter(Boolean);
  if (termos.length === 0) return true;
  return termos.every((t) => textoJaNormalizado.includes(t));
}
