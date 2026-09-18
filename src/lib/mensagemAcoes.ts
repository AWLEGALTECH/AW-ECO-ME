/* O QUE SE PODE FAZER COM UMA MENSAGEM JÁ ENVIADA.
 *
 * As duas regras daqui são do WHATSAPP, e não nossas: ele só deixa revogar
 * ("apagar para todos") o que saiu há pouco, e só deixa editar a própria
 * mensagem de texto numa janela bem mais curta. Fora dessas janelas ele
 * recusa, e quem tentou fica achando que o sistema falhou.
 *
 * Por isso a regra mora aqui, longe da tela: ela é conferida em DOIS lugares
 * que não se enxergam. Na tela, para o item nem aparecer quando não vai
 * funcionar (menu que oferece o que não faz é pior que menu sem o item), e na
 * edge function, que é quem de fato chama a Evolution e não pode confiar no
 * que o navegador mandou. Duas conferências da mesma regra escritas em dois
 * lugares divergem na primeira vez que uma delas muda.
 *
 * Os limites são conservadores de propósito. O do WhatsApp para revogar
 * mudou de 1 para 2 dias ao longo dos anos e pode mudar de novo; errar para
 * menos faz o item sumir cedo demais, errar para mais faz a Evolution recusar
 * com um erro que ninguém sabe ler.
 */

/** Horas em que o WhatsApp ainda aceita revogar uma mensagem nossa. */
export const JANELA_APAGAR_HORAS = 48;

/** Minutos em que o WhatsApp ainda aceita editar uma mensagem nossa. */
export const JANELA_EDITAR_MIN = 15;

export interface MensagemParaAcao {
  id?: string | null;
  /** "nos" = saiu daqui. Só o que é nosso pode ser revogado ou editado. */
  de?: "lead" | "nos";
  tipo?: string | null;
  /** carimbo cru de quando a mensagem saiu */
  criadaEm?: string | null;
  /** apagada para todos: por nós, na nossa; pelo contato, na dele */
  apagada?: boolean;
  /** apagada só do nosso lado; lá ela continua intacta */
  soParaMim?: boolean;
  /** sem o id do WhatsApp não há o que revogar nem o que editar lá */
  idWhatsapp?: string | null;
}

/** Idade da mensagem em minutos. Sem carimbo, infinita: trava por segurança. */
function minutosDe(criadaEm: string | null | undefined): number {
  if (!criadaEm) return Infinity;
  const t = new Date(criadaEm).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 60_000;
}

/**
 * Dá para apagar para todos, isto é, revogar no WhatsApp do cliente?
 *
 * Só as NOSSAS: o WhatsApp não deixa ninguém apagar mensagem alheia da
 * conversa do outro, e prometer isso na tela seria mentir. Para a do cliente
 * existe o "apagar para mim", que é outra coisa e não precisa de janela.
 */
export function podeApagarParaTodos(m: MensagemParaAcao): boolean {
  if (!m.id || m.de !== "nos" || m.apagada) return false;
  /* A bolha otimista ainda não tem id do WhatsApp porque a Evolution ainda não
     respondeu. Ela também não existe lá, então não há o que revogar. */
  if (m.idWhatsapp === null) return false;
  return minutosDe(m.criadaEm) <= JANELA_APAGAR_HORAS * 60;
}

/**
 * Dá para editar?
 *
 * Só texto, porque é só isso que o WhatsApp edita: legenda de foto, áudio e
 * documento não têm edição, e oferecer levaria a pessoa a reescrever algo que
 * a Evolution recusaria no fim.
 */
export function podeEditar(m: MensagemParaAcao): boolean {
  if (!m.id || m.de !== "nos" || m.apagada) return false;
  if (m.idWhatsapp === null) return false;
  if ((m.tipo ?? "texto") !== "texto") return false;
  return minutosDe(m.criadaEm) <= JANELA_EDITAR_MIN;
}

/**
 * Quanto tempo ainda resta para editar, em minutos inteiros, para a tela
 * poder dizer "faltam 12 min" em vez de deixar a pessoa descobrir sozinha
 * que a janela fechou no meio da digitação.
 */
export function minutosRestantesParaEditar(m: MensagemParaAcao): number {
  return Math.max(0, Math.ceil(JANELA_EDITAR_MIN - minutosDe(m.criadaEm)));
}

/* ── A TARJA ───────────────────────────────────────────────────────────────
 *
 * NADA SOME DA NOSSA TELA. O conteúdo fica sempre, e o que muda é uma tarja
 * no rodapé da bolha dizendo o que aconteceu com ela.
 *
 * O motivo é o que essa conversa é: prova. Cliente que manda um valor e apaga
 * trinta segundos depois apagou do aparelho DELE, não do que foi dito, e quem
 * atende precisa poder ler aquilo amanhã. Um histórico que esquece junto com o
 * WhatsApp do outro lado não responde "mas ele falou isso em setembro".
 *
 * As três frases são diferentes de propósito, porque as três situações são
 * diferentes para quem está atendendo:
 *
 *   o cliente apagou   ele não vê mais; nós vemos. Vale saber que ele tentou
 *                      voltar atrás, e vale saber o que era.
 *   apagada para todos fomos nós, e sumiu no aparelho dele. Não adianta
 *                      cobrar resposta sobre aquilo.
 *   só para mim        sumiu só da nossa vista; ele continua com a mensagem
 *                      inteira e pode responder a ela a qualquer momento.
 *
 * Trocar uma frase pela outra é o erro caro desta tela, e é silencioso.
 */
export type EstadoApagada = "cliente" | "todos" | "so_para_mim" | null;

/** Em qual dos três estados a mensagem está, ou nenhum. */
export function estadoDaApagada(m: MensagemParaAcao & { soParaMim?: boolean }): EstadoApagada {
  if (m.apagada) return m.de === "lead" ? "cliente" : "todos";
  if (m.soParaMim) return "so_para_mim";
  return null;
}

/** O que a tarja escreve. */
export function textoDaTarja(estado: EstadoApagada): string {
  if (estado === "cliente") return "Mensagem apagada pelo cliente";
  if (estado === "todos") return "Mensagem apagada para todos";
  if (estado === "so_para_mim") return "Mensagem apagada só para você";
  return "";
}

/** A explicação curta embaixo da tarja: o que o outro lado está vendo. */
export function detalheDaTarja(estado: EstadoApagada): string {
  if (estado === "cliente") return "Sumiu no WhatsApp dele. Aqui fica registrada.";
  if (estado === "todos") return "Sumiu no WhatsApp dele também.";
  if (estado === "so_para_mim") return "No WhatsApp dele ela continua normal.";
  return "";
}
