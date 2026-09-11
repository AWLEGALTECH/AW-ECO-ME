/* A PRÉVIA DO QUE ESTÁ SENDO ANEXADO, ANTES DE MANDAR.
 *
 * Hoje o anexo vira um chip de dois centímetros com o nome truncado. Quem colou
 * um print não vê o print; quem escolheu três documentos vê três retângulos
 * iguais e descobre qual era qual do outro lado, no celular do cliente.
 *
 * O WhatsApp resolve isso com uma tela cheia por PÁGINA: um anexo por vez,
 * grande, com as miniaturas embaixo e um "+" para continuar juntando. Só depois
 * de conferir é que se volta para a conversa com tudo segurado na barra.
 *
 * ─────────────────────────── o que mora aqui ───────────────────────────────
 *
 * QUAL É A CARA DE CADA ANEXO e COMO A NAVEGAÇÃO SE COMPORTA. São as duas
 * coisas que a tela erra quando não têm nome: um PDF desenhado como imagem
 * quebrada, e a página que some debaixo do dedo quando alguém remove a última.
 */

export type TipoDaPrevia = "imagem" | "video" | "audio" | "pdf" | "outro";

const EXT = (nome: string) => (nome || "").match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() ?? "";

/**
 * O que este anexo é, para a tela saber o que desenhar.
 *
 * O mime manda quando existe; a extensão é o plano B. Print colado chega como
 * `image/png` sem nome nenhum, e documento arrastado do Explorer às vezes chega
 * com mime vazio e só o nome.
 */
export function tipoDaPrevia(mime?: string | null, nome?: string | null): TipoDaPrevia {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "imagem";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m.includes("pdf")) return "pdf";

  const e = EXT(nome || "");
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "bmp"].includes(e)) return "imagem";
  if (["mp4", "mov", "webm", "mkv", "avi"].includes(e)) return "video";
  if (["mp3", "ogg", "opus", "m4a", "wav", "aac"].includes(e)) return "audio";
  if (e === "pdf") return "pdf";
  return "outro";
}

/** "1,4 MB". Sem casa decimal em byte e kilobyte, que não acrescentam nada. */
export function tamanhoLegivel(bytes?: number | null): string {
  const b = Number(bytes);
  if (!Number.isFinite(b) || b <= 0) return "";
  if (b < 1024) return `${Math.round(b)} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/**
 * Para onde a seta leva.
 *
 * NÃO CIRCULA. Na última, a seta da direita não volta para a primeira: quem
 * está conferindo três documentos precisa saber que chegou ao fim, e a volta
 * silenciosa faz a pessoa contar de novo achando que perdeu um.
 */
export function paginaVizinha(atual: number, total: number, passo: 1 | -1): number {
  if (total <= 0) return 0;
  return Math.min(total - 1, Math.max(0, atual + passo));
}

/**
 * Qual página fica aberta depois de remover a que está na tela.
 *
 * Removendo a última, volta para a anterior; removendo uma do meio, a de trás
 * ocupa o lugar e o índice não muda. É o que mantém o dedo parado: quem está
 * apagando três seguidos aperta no mesmo lugar três vezes.
 */
export function indiceAposRemover(removido: number, totalAntes: number): number {
  const depois = totalAntes - 1;
  if (depois <= 0) return 0;
  return Math.min(removido, depois - 1);
}

/** "3 de 7", ou vazio quando é um só: contar até um é ruído. */
export function rotuloDaPagina(atual: number, total: number): string {
  if (total <= 1) return "";
  return `${atual + 1} de ${total}`;
}

/**
 * O nome que a prévia mostra, sem estourar a linha.
 *
 * Corta no MEIO e não no fim: assim sobram o começo E o fim, que é onde os
 * nomes de documento costumam diferir ("...joao-da-silva.pdf" contra
 * "...maria-da-silva.pdf"), e a extensão sobrevive para dizer o que é a coisa.
 * Não faz milagre: dois nomes que só diferem no miolo colidem de qualquer jeito,
 * e para esses o que salva é a miniatura ao lado, não o texto.
 */
export function nomeEncurtado(nome: string, limite = 42): string {
  const n = (nome || "").trim();
  if (n.length <= limite) return n;
  const ext = EXT(n);
  const semExt = ext ? n.slice(0, -(ext.length + 1)) : n;
  const sobra = limite - (ext ? ext.length + 2 : 1);
  if (sobra < 6) return n.slice(0, limite - 1) + "…";
  const frente = Math.ceil(sobra * 0.6);
  const fim = sobra - frente;
  return `${semExt.slice(0, frente)}…${fim > 0 ? semExt.slice(-fim) : ""}${ext ? "." + ext : ""}`;
}
