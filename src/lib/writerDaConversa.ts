/* LEVAR O LEAD AO WRITER, COM A ANÁLISE DELE JÁ NA MÃO.
 *
 * Na etapa "Aguardando documentação" o que falta produzir é o kit: contrato e
 * procuração, que é o que vai para a assinatura e leva o lead à etapa seguinte.
 * O Writer já sabe montar isso a partir de uma análise comercial do Finder; o
 * que faltava era chegar lá com a análise DAQUELE contato já escolhida, em vez
 * de procurá-la numa lista de todas.
 *
 * O vínculo existe desde que a análise passou a nascer com `conversa_id`: é ele
 * que responde "qual análise é a desta conversa".
 */

/**
 * O endereço do Writer já sabendo de onde veio e qual análise usar.
 *
 * O `conversa` viaja junto mesmo sem uso imediato: é por ele que o Writer, um
 * dia, vai devolver o que produziu para a conversa (a procuração enviada, o
 * pré-cliente criado) sem ninguém ter que casar nome com telefone.
 */
export function linkDoWriter(args: {
  conversaId: string;
  nome?: string | null;
  analiseId?: string | null;
}): string {
  const qs = new URLSearchParams();
  qs.set("conversa", args.conversaId);
  if (args.nome?.trim()) qs.set("nome", args.nome.trim());
  if (args.analiseId) qs.set("analise_comercial", args.analiseId);
  return `/writer?${qs.toString()}`;
}
