/* COMO UMA BASE SE APRESENTA, ONDE QUER QUE ELA APAREÇA.
 *
 * A planilha ligada aparece em dois lugares agora: na caixa Base, onde se
 * trabalha a fila, e na aba Automações, onde se escolhe qual delas o fluxo
 * escuta. Duas telas desenhando a mesma coisa de dois jeitos fazem duvidar se
 * é a mesma coisa — a pessoa acabou de ver "Leads Bradesco" com 689 na base de
 * um lado, e precisa reconhecê-la do outro sem pensar.
 *
 * Por isso o que descreve uma base mora aqui, e não dentro de uma das telas.
 */

/**
 * O PINGO DIZ SE A LEITURA ESTÁ DE PÉ.
 *
 * Verde: o último puxão trouxe os leads. Âmbar: trouxe com ressalva, e a
 * ressalva é o título. Cinza: nunca puxou.
 *
 * Existe porque "689 na base" continuaria escrito igual no dia em que a
 * planilha parasse de responder, e número velho é o disfarce perfeito para uma
 * integração quebrada.
 */
export function saudeDaBase(
  f: { ultimo_sync: string | null; ultimo_erro: string | null },
  quando?: (iso: string) => string,
): { cor: string; titulo: string } {
  if (!f.ultimo_sync) return { cor: "bg-muted-foreground/40", titulo: "Nunca puxou desta planilha" };
  if (f.ultimo_erro) return { cor: "bg-amber-400", titulo: f.ultimo_erro };
  const q = quando ? quando(f.ultimo_sync) : f.ultimo_sync;
  return { cor: "bg-emerald-400", titulo: `Leitura ok, último puxão ${q}` };
}
