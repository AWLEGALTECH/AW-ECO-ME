/* COMPRIMIR O ANEXO ANTES DE SUBIR.
 *
 * É a peça que faz o anexo no chamado caber no plano. Um print de Mac sai em
 * PNG com 2 a 4 MB; o mesmo print em WebP a 80% fica em 200 a 300 KB e
 * continua perfeitamente legível, porque tela de sistema é texto e retângulo
 * de cor chapada, que é exatamente o que esse formato comprime bem. A conta
 * do mês: ~15 MB em vez de ~150 MB.
 *
 * NO NAVEGADOR, e não depois do upload. Comprimir no servidor já pagou a
 * subida do arquivo grande, e quem manda print do escritório manda de uma
 * internet que não sobra.
 *
 * O QUE NÃO SE MEXE:
 *
 *   PDF e documento    não é imagem, não há o que reamostrar sem destruir.
 *   imagem já pequena  reprocessar uma de 80 KB costuma AUMENTAR o arquivo, e
 *                      de todo jeito não muda a conta do mês.
 *   GIF                virar WebP estático mataria a animação, que nesse
 *                      formato é o conteúdo inteiro.
 *   áudio              já nasce em opus pelo gravador, que é o formato certo.
 *
 * A parte que decide mora aqui e tem teste; a que desenha no canvas precisa de
 * navegador e fica no fim do arquivo, sem lógica nenhuma além de desenhar.
 */

/** Acima disto vale a pena reprocessar. Abaixo, comprimir costuma engordar. */
export const MINIMO_PARA_COMPRIMIR = 200 * 1024;

/** O maior lado da imagem depois de reduzida. Cabe um print de tela cheia. */
export const LADO_MAXIMO = 1600;

/** Qualidade do WebP. 0.8 é onde texto de tela ainda sai limpo. */
export const QUALIDADE = 0.8;

/** Só estas viram WebP. O GIF fica de fora para não perder a animação. */
const COMPRIMIVEIS = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/bmp"];

/**
 * Vale a pena comprimir este arquivo?
 *
 * Conservador de propósito: na dúvida, sobe como veio. Um anexo que chega
 * grande é um problema de conta no fim do mês; um anexo que chega corrompido
 * ou ilegível é um chamado que não dá para responder.
 */
export function vaiComprimir(mime: string | null | undefined, bytes: number): boolean {
  const m = String(mime ?? "").toLowerCase().split(";")[0].trim();
  if (!COMPRIMIVEIS.includes(m)) return false;
  return bytes > MINIMO_PARA_COMPRIMIR;
}

/**
 * O tamanho de destino, mantendo a proporção.
 *
 * Imagem menor que o teto não é AMPLIADA: esticar um print de 800px para 1600
 * gastaria quatro vezes mais bytes para mostrar exatamente a mesma coisa, só
 * que borrada.
 */
export function dimensaoAlvo(largura: number, altura: number, teto = LADO_MAXIMO): { largura: number; altura: number } {
  const w = Math.max(1, Math.round(largura));
  const h = Math.max(1, Math.round(altura));
  const maior = Math.max(w, h);
  if (maior <= teto) return { largura: w, altura: h };
  const fator = teto / maior;
  return { largura: Math.max(1, Math.round(w * fator)), altura: Math.max(1, Math.round(h * fator)) };
}

/** "Captura de Tela 2026-09-19.png" vira "Captura de Tela 2026-09-19.webp". */
export function nomeComprimido(nome: string): string {
  const limpo = String(nome ?? "").trim() || "imagem";
  const ponto = limpo.lastIndexOf(".");
  return (ponto > 0 ? limpo.slice(0, ponto) : limpo) + ".webp";
}

/** "2,4 MB → 240 KB" para a tela poder mostrar o que foi economizado. */
export function tamanhoBonito(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** Caminho do anexo no bucket. Sem o nome original: ele pode ter acento,
 *  barra e espaço, e o que o Storage aceita no path é bem mais estreito. */
export function caminhoDoAnexo(chamadoId: string, nome: string, agora = Date.now()): string {
  const ponto = String(nome ?? "").lastIndexOf(".");
  const ext = ponto > 0 ? String(nome).slice(ponto + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const aleatorio = Math.random().toString(36).slice(2, 8);
  return `${chamadoId}/${agora}-${aleatorio}${ext ? "." + ext : ""}`;
}

/** imagem | audio | documento, no vocabulário da tabela. */
export function tipoDoAnexo(mime: string | null | undefined): "imagem" | "audio" | "documento" {
  const m = String(mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return "imagem";
  if (m.startsWith("audio/")) return "audio";
  return "documento";
}

/* ── a parte que precisa de navegador ────────────────────────────────────── */

/**
 * Devolve o arquivo comprimido, ou o original quando não valeu a pena.
 *
 * NUNCA LEVANTA ERRO. Se o navegador não der conta (formato exótico, imagem
 * corrompida, canvas bloqueado), o original sobe: o chamado com anexo pesado é
 * muito melhor que o chamado sem anexo nenhum, e quem está pedindo ajuda não
 * tem que entender por que o print não foi.
 */
export async function comprimirImagem(arquivo: File | Blob, nome: string): Promise<{ arquivo: Blob; nome: string; original: number }> {
  const original = arquivo.size;
  const manter = { arquivo, nome, original };
  if (!vaiComprimir(arquivo.type, original)) return manter;
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") return manter;

  try {
    const bitmap = await createImageBitmap(arquivo);
    const { largura, altura } = dimensaoAlvo(bitmap.width, bitmap.height);
    const tela = document.createElement("canvas");
    tela.width = largura;
    tela.height = altura;
    const ctx = tela.getContext("2d");
    if (!ctx) return manter;
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, "image/webp", QUALIDADE));
    // Comprimiu e ficou MAIOR: acontece com imagem pequena ou já otimizada, e
    // nesse caso o certo é ficar com a de origem.
    if (!blob || blob.size >= original) return manter;
    return { arquivo: blob, nome: nomeComprimido(nome), original };
  } catch {
    return manter;
  }
}
