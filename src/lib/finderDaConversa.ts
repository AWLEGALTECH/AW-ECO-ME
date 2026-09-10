/* LEVAR OS DOCUMENTOS DA CONVERSA AO FINDER.
 *
 * O lead manda o extrato no WhatsApp e o arquivo fica no nosso storage. Até
 * aqui, analisar isso queria dizer: baixar o PDF, achar na pasta de downloads,
 * abrir o Finder, arrastar. Quatro gestos e uma chance de arrastar o arquivo
 * do cliente errado.
 *
 * O QUE ESTE MÓDULO DECIDE. Quais anexos da conversa são candidatos (o Finder
 * só lê PDF), com que nome eles chegam lá, e o endereço do Finder já apontando
 * para esta conversa. A parte suja (baixar do storage e empurrar para dentro do
 * iframe) mora em `Finder.tsx`, porque é DOM e não dá para testar aqui.
 *
 * O NOME IMPORTA. O WhatsApp batiza o anexo recebido com um uuid
 * ("1c1af6ec-d04b-47fe-a800-acfd77aa91c7.pdf"), e é esse nome que apareceria na
 * fila do Finder: três linhas iguais e ilegíveis quando o lead manda três
 * extratos. Nome assim vira "extrato-1.pdf"; nome de verdade ("657962190_DED.pdf")
 * é preservado, porque quem mandou escolheu aquilo.
 */

/* O formato da mensagem como a tela já a tem. `id` é opcional porque a maquete
   do atendimento monta mensagens à mão; sem id não dá para pedir o anexo depois,
   então essas ficam de fora da lista. */
export interface AnexoDaConversa {
  id?: string;
  tipo?: string | null;
  midiaPath?: string | null;
  midiaMime?: string | null;
  midiaNome?: string | null;
  de: "lead" | "nos";
  hora?: string;
}

export interface DocumentoDaConversa {
  /** id da mensagem */
  id: string;
  /** caminho no bucket wa-midia */
  path: string;
  /** nome que vai aparecer na fila do Finder */
  nome: string;
  /** nome cru, como chegou */
  nomeOriginal: string | null;
  /** quem mandou */
  de: "lead" | "nos";
  hora?: string;
}

const UUID_SOLTO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\s*\(\d+\))?$/i;

/** É PDF? Pelo mime quando há, pela extensão quando não há. */
export function ehPdf(a: AnexoDaConversa): boolean {
  if (!a.id || !a.midiaPath) return false;
  if (a.midiaMime) return /pdf/i.test(a.midiaMime);
  return /\.pdf$/i.test(a.midiaNome ?? "");
}

/** O nome que o arquivo leva para o Finder. */
export function nomeDoDocumento(nomeOriginal: string | null | undefined, posicao: number): string {
  const cru = (nomeOriginal ?? "").trim();
  const semExt = cru.replace(/\.pdf$/i, "");
  if (!semExt || UUID_SOLTO.test(semExt)) return `extrato-${posicao}.pdf`;
  return /\.pdf$/i.test(cru) ? cru : `${cru}.pdf`;
}

/**
 * Os PDFs da conversa, na ordem em que chegaram.
 *
 * Os dois sentidos entram: o extrato quase sempre vem dele, mas acontece de a
 * atendente reenviar o arquivo que o cliente mandou no número antigo, e esse
 * também é extrato. Quem escolhe é quem está olhando; a lista só não pode
 * esconder nada.
 */
export function documentosDaConversa(msgs: AnexoDaConversa[]): DocumentoDaConversa[] {
  const docs: DocumentoDaConversa[] = [];
  for (const m of msgs) {
    if (!ehPdf(m)) continue;
    docs.push({
      id: m.id!,
      path: m.midiaPath!,
      nome: nomeDoDocumento(m.midiaNome, docs.length + 1),
      nomeOriginal: m.midiaNome ?? null,
      de: m.de,
      hora: m.hora,
    });
  }
  return docs;
}

/** Recebidos primeiro: é o extrato que o lead mandou que se quer analisar. */
export function selecaoInicial(docs: DocumentoDaConversa[]): string[] {
  const doLead = docs.filter((d) => d.de === "lead");
  return (doLead.length > 0 ? doLead : docs).map((d) => d.id);
}

/**
 * O endereço do Finder já sabendo de onde veio.
 *
 * `docs` são ids de mensagem, e não caminhos do storage: caminho na barra de
 * endereços é um convite a pedir arquivo alheio. Com o id, quem lê é a página,
 * pela mesma RLS do módulo de atendimento.
 */
export function linkDoFinder(args: { conversaId: string; nome?: string | null; docs: string[] }): string {
  const qs = new URLSearchParams();
  qs.set("conversa", args.conversaId);
  if (args.nome?.trim()) qs.set("nome", args.nome.trim());
  if (args.docs.length > 0) qs.set("docs", args.docs.join(","));
  return `/finder?${qs.toString()}`;
}

/** A lista de ids da URL, sem vazio e sem repetido. */
export function docsDaUrl(param: string | null): string[] {
  if (!param) return [];
  return [...new Set(param.split(",").map((s) => s.trim()).filter(Boolean))];
}
