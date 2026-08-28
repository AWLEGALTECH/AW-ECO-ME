// Regras puras do diálogo de ações ajuizáveis.
//
// Vive fora do componente porque o componente importa o cliente Supabase, que
// toca `localStorage` na carga do módulo — e isso impede testar a regra sem
// arrastar o navegador junto.

/**
 * Decide se o diálogo tem que zerar seu estado.
 *
 * A chave precisa ser gravada SEMPRE, inclusive quando o diálogo fecha. Se só
 * for gravada com ele aberto, duas aberturas seguidas produzem a mesma chave
 * ("id|true"), a segunda não é reconhecida como abertura nova, e o diálogo
 * reabre com o estado da vez anterior: o stage parado em "conferir" e o
 * `selOriginal` velho, que é a foto contra a qual o diff calcula o que SAI da
 * leva. Confirmar ali remove rubrica de verdade, de uma leva que a pessoa nem
 * abriu naquela sessão. Já aconteceu em produção.
 */
export function decidirReinicio(
  chaveGravada: string,
  clienteId: string | undefined,
  aberto: boolean,
): { chave: string; reiniciar: boolean } {
  const chave = `${clienteId || ""}|${aberto}`;
  return { chave, reiniciar: chave !== chaveGravada };
}
