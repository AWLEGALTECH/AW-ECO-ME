// LEU? ESTÁ ONLINE? QUANDO FOI VISTO?
//
// Três informações que o WhatsApp dá e que respondem a mesma pergunta prática:
// vale insistir agora, ou é perda de tempo?
//
// O QUE ESTE MÓDULO PROTEGE. Todas as três podem simplesmente NÃO EXISTIR: o
// contato esconde o status, a instância nunca assinou a presença daquele chat,
// a confirmação de leitura não chegou. E a tentação, em cada um desses casos, é
// preencher o buraco com o palpite mais próximo — escrever "offline" quando não
// se sabe, mostrar um visto simples quando nem isso voltou.
//
// Seria inventar um fato sobre uma pessoa real. "Não sei" e "está offline" são
// respostas diferentes, e quem lê a tela vai decidir se liga ou não com base
// nelas. Por isso tudo aqui devolve null quando não há informação, e é a tela
// que fica calada.

export type StatusMsg = "enviada" | "entregue" | "lida" | "tocada";
export type Presenca = "disponivel" | "indisponivel" | "digitando" | "gravando";

/** Quantos vistos desenhar, e se são azuis. Null = ainda sem confirmação. */
export function vistoDaMensagem(status: string | null | undefined):
  { riscos: 1 | 2; lida: boolean } | null {
  switch (status) {
    case "enviada":  return { riscos: 1, lida: false };
    case "entregue": return { riscos: 2, lida: false };
    case "lida":
    case "tocada":   return { riscos: 2, lida: true };
    default:         return null;
  }
}

/** O que a etiqueta diz sobre o status. Vazio quando não há status. */
export function rotuloDoStatus(status: string | null | undefined): string {
  switch (status) {
    case "enviada":  return "enviada";
    case "entregue": return "entregue no aparelho";
    case "lida":     return "lida";
    case "tocada":   return "áudio ouvido";
    default:         return "";
  }
}

/**
 * O que aparece embaixo do nome, no cabeçalho da conversa.
 *
 * Ordem de prioridade: o que está acontecendo AGORA ganha do que aconteceu —
 * "digitando" enquanto se olha a tela vale mais que qualquer carimbo de hora.
 *
 * Devolve null quando não há nada honesto a dizer. A tela não escreve
 * "offline": a maioria dos contatos esconde o status, e a ausência de evento
 * quer dizer "não sei", não "não está".
 */
export function situacaoDoContato(args: {
  presenca?: string | null;
  presencaEm?: string | null;
  vistoEm?: string | null;
  agora?: Date;
  /** depois disso, "online" vira notícia velha e para de ser exibido */
  validadeMin?: number;
}): { texto: string; aoVivo: boolean } | null {
  const agora = args.agora ?? new Date();
  const validade = (args.validadeMin ?? 3) * 60_000;

  const t = args.presencaEm ? new Date(args.presencaEm).getTime() : NaN;
  const fresco = Number.isFinite(t) && agora.getTime() - t <= validade;

  if (fresco) {
    if (args.presenca === "digitando") return { texto: "digitando…", aoVivo: true };
    if (args.presenca === "gravando") return { texto: "gravando áudio…", aoVivo: true };
    if (args.presenca === "disponivel") return { texto: "online", aoVivo: true };
  }

  const v = args.vistoEm ? new Date(args.vistoEm).getTime() : NaN;
  if (!Number.isFinite(v)) return null;
  return { texto: `visto ${quandoFoi(v, agora)}`, aoVivo: false };
}

/** "agora há pouco", "há 12 min", "há 3 h", "ontem 21:04", "28/08 09:12". */
export function quandoFoi(quando: number | string, agora = new Date()): string {
  const t = typeof quando === "number" ? quando : new Date(quando).getTime();
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const min = Math.floor((agora.getTime() - t) / 60_000);

  if (min < 2) return "agora há pouco";
  if (min < 60) return `há ${min} min`;

  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diasAtras = Math.round((dia(agora) - dia(d)) / 86400000);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (diasAtras <= 0) {
    const h = Math.floor(min / 60);
    return `há ${h} h`;
  }
  if (diasAtras === 1) return `ontem ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

/**
 * A conversa merece um pontinho de "online" na lista?
 *
 * Só com presença fresca e positiva. Sem evento, sem pontinho — de novo: a
 * lista não pode sugerir que a pessoa está fora quando ninguém contou nada.
 */
export function estaOnline(presenca: string | null | undefined, presencaEm: string | null | undefined, agora = new Date()): boolean {
  if (!presenca || !["disponivel", "digitando", "gravando"].includes(presenca)) return false;
  const t = presencaEm ? new Date(presencaEm).getTime() : NaN;
  return Number.isFinite(t) && agora.getTime() - t <= 3 * 60_000;
}
