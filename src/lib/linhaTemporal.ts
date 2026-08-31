// Trava do autosave da linha temporal do processo.
//
// Contexto do bug que originou este arquivo: em ProcessoDetail o estado
// `etapas` nasce `[]` e só é preenchido quando o load do processo termina (três
// idas ao banco em sequência). O efeito de autosave, porém, dispara já na
// montagem — com debounce de 800ms. Em conexão lenta o timeout vencia antes do
// load e gravava `linha_temporal: []` no banco, apagando a história do
// processo. Quando o usuário saía da tela nessa janela, o gravar de volta nunca
// acontecia e a perda ficava permanente.
//
// A regra abaixo é a única fonte da decisão "pode gravar?", isolada aqui pra
// poder ser testada sem montar a tela.

/**
 * Só libera a gravação quando a linha em memória é comprovadamente a do
 * processo aberto — ou seja, quando o load já devolveu os dados DELE.
 *
 * @param prontaPara id do processo cuja linha já está carregada em memória
 *                   (`null` enquanto nada foi carregado)
 * @param id         id do processo aberto na tela
 * @param isNew      true na tela de processo novo (não há o que gravar)
 */
export function podeGravarLinha(
  prontaPara: string | null,
  id: string | undefined,
  isNew: boolean,
): boolean {
  if (isNew) return false;
  if (!id) return false;
  return prontaPara === id;
}
