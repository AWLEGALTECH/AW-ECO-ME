/* O RECORTE DA FOTO DE PERFIL: a conta por trás do arrastar e do zoom.
 *
 * O WhatsApp mostra a foto atrás de um círculo e deixa a pessoa arrastar e
 * aproximar até encaixar. O que torna isso "encaixar" e não "bagunçar" são
 * duas regras, e as duas moram aqui, fora da tela, com teste:
 *
 *   1. a foto nunca fica MENOR que o círculo: zoom mínimo é o que cobre o
 *      quadro por inteiro, senão aparece fundo vazio dentro da bola;
 *   2. a foto nunca DESGRUDA da borda: arrastar para no ponto em que a última
 *      faixa da imagem ainda toca o quadro.
 *
 * Tudo em coordenadas do QUADRO (o quadrado de tela onde o círculo mora). A
 * saída é um retângulo em pixels da imagem ORIGINAL, que é o que o canvas
 * recorta; a tela é só uma janela para escolher esse retângulo.
 */

export interface Enquadramento {
  /** fator sobre a escala mínima: 1 = cobre o quadro exatamente, 2 = dobro */
  zoom: number;
  /** deslocamento do centro da imagem em relação ao centro do quadro, em px do quadro */
  dx: number;
  dy: number;
}

/** Escala (px do quadro por px da imagem) que faz a imagem COBRIR o quadro. */
export function escalaDeCobertura(largura: number, altura: number, quadro: number): number {
  if (largura <= 0 || altura <= 0 || quadro <= 0) return 1;
  return Math.max(quadro / largura, quadro / altura);
}

/** Quanto a imagem mede no quadro, para um zoom. */
export function tamanhoNoQuadro(largura: number, altura: number, quadro: number, zoom: number) {
  const s = escalaDeCobertura(largura, altura, quadro) * Math.max(1, zoom);
  return { w: largura * s, h: altura * s, escala: s };
}

/**
 * O deslocamento permitido: a imagem pode andar até a borda dela encostar na
 * borda do quadro, e não mais. Com a imagem exatamente do tamanho do quadro
 * numa dimensão, o deslocamento nessa dimensão é zero.
 */
export function limitarDeslocamento(
  largura: number, altura: number, quadro: number, e: Enquadramento,
): Enquadramento {
  const { w, h } = tamanhoNoQuadro(largura, altura, quadro, e.zoom);
  const maxX = Math.max(0, (w - quadro) / 2);
  const maxY = Math.max(0, (h - quadro) / 2);
  // `|| 0` apaga o zero negativo que `Math.max(-0, x)` devolve quando a
  // folga é zero: ele vira "-0px" no transform e "-0" no teste, e nenhum
  // dos dois é o que a conta quer dizer.
  return {
    zoom: Math.max(1, e.zoom),
    dx: Math.min(maxX, Math.max(-maxX, e.dx)) || 0,
    dy: Math.min(maxY, Math.max(-maxY, e.dy)) || 0,
  };
}

/**
 * O retângulo da imagem original que o quadro está mostrando.
 *
 * É o que vai para `drawImage(img, sx, sy, sw, sh, 0, 0, saida, saida)`. Sai
 * em pixels da imagem, já limitado às bordas dela, porque o que a tela mostra
 * e o que o canvas recorta têm que ser a MESMA coisa: a pessoa alinhou o olho
 * do cliente no centro do círculo, e é ali que ele tem que sair.
 */
export function recorteNaImagem(
  largura: number, altura: number, quadro: number, e: Enquadramento,
): { sx: number; sy: number; sw: number; sh: number } {
  const seguro = limitarDeslocamento(largura, altura, quadro, e);
  const { escala } = tamanhoNoQuadro(largura, altura, quadro, seguro.zoom);
  // lado do quadro, em pixels da imagem
  const lado = quadro / escala;
  // o centro do quadro cai em (centro da imagem - deslocamento), na imagem
  const cx = largura / 2 - seguro.dx / escala;
  const cy = altura / 2 - seguro.dy / escala;
  const sx = Math.min(Math.max(0, cx - lado / 2), Math.max(0, largura - lado));
  const sy = Math.min(Math.max(0, cy - lado / 2), Math.max(0, altura - lado));
  return { sx, sy, sw: Math.min(lado, largura), sh: Math.min(lado, altura) };
}

/** Zoom máximo: além disto a foto vira pixel, e o WhatsApp também para por aí. */
export const ZOOM_MAXIMO = 4;

/** O lado da imagem final, em pixels. 640 é o que o WhatsApp usa para perfil. */
export const LADO_DA_SAIDA = 640;
