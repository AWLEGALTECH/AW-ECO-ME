/* O RECORTE DA FOTO DE PERFIL: a conta por trás do arrastar e do zoom.
 *
 * O WhatsApp mostra a foto atrás de um círculo e deixa a pessoa arrastar e
 * aproximar até encaixar. O que torna isso "encaixar" e não "bagunçar" são
 * duas regras, e as duas moram aqui, fora da tela, com teste:
 *
 *   1. a foto pode RECUAR, mas até um limite: o zoom vai de metade do quadro
 *      (a foto inteira dentro do círculo, com fundo escuro em volta) até quatro
 *      vezes. Sem o recuo, uma foto quadrada nascia já colada no círculo e não
 *      havia o que personalizar, que foi a primeira queixa;
 *   2. a foto nunca DESGRUDA da borda: maior que o quadro, ela para quando a
 *      última faixa ainda toca a borda; menor, ela para quando encosta por
 *      dentro. É a mesma conta com o valor absoluto.
 *
 * Tudo em coordenadas do QUADRO (o quadrado de tela onde o círculo mora). A
 * tela desenha a imagem na posição que `posicaoNoQuadro` devolve, e o canvas
 * da saída repete essa posição multiplicada pela razão saída/quadro: uma conta
 * só para os dois, porque o que a pessoa alinhou tem que ser o que sai.
 */

export interface Enquadramento {
  /** fator sobre a escala de cobertura: 1 = cobre o quadro exatamente, 0.5 = metade, 2 = dobro */
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

/** Zoom mínimo: a foto inteira cabe no círculo com folga. Abaixo disto ela vira um selo. */
export const ZOOM_MINIMO = 0.5;

/** Zoom máximo: além disto a foto vira pixel, e o WhatsApp também para por aí. */
export const ZOOM_MAXIMO = 4;

/** O lado da imagem final, em pixels. 640 é o que o WhatsApp usa para perfil. */
export const LADO_DA_SAIDA = 640;

export const zoomValido = (z: number) => Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, z));

/** Quanto a imagem mede no quadro, para um zoom. */
export function tamanhoNoQuadro(largura: number, altura: number, quadro: number, zoom: number) {
  const s = escalaDeCobertura(largura, altura, quadro) * zoomValido(zoom);
  return { w: largura * s, h: altura * s, escala: s };
}

/**
 * O deslocamento permitido. Imagem maior que o quadro anda até a borda dela
 * encostar na borda do quadro; imagem menor anda até encostar por dentro. Nos
 * dois casos a folga é |lado - quadro| / 2, e exatamente do tamanho do quadro
 * a folga é zero.
 */
export function limitarDeslocamento(
  largura: number, altura: number, quadro: number, e: Enquadramento,
): Enquadramento {
  const { w, h } = tamanhoNoQuadro(largura, altura, quadro, e.zoom);
  const maxX = Math.abs(w - quadro) / 2;
  const maxY = Math.abs(h - quadro) / 2;
  // `|| 0` apaga o zero negativo que `Math.max(-0, x)` devolve quando a
  // folga é zero: ele vira "-0px" no transform e "-0" no teste, e nenhum
  // dos dois é o que a conta quer dizer.
  return {
    zoom: zoomValido(e.zoom),
    dx: Math.min(maxX, Math.max(-maxX, e.dx)) || 0,
    dy: Math.min(maxY, Math.max(-maxY, e.dy)) || 0,
  };
}

/**
 * Onde a imagem fica dentro do quadro: canto superior esquerdo e tamanho, em
 * px do quadro. É exatamente o que o `<img>` da tela desenha, e é exatamente o
 * que o canvas repete na saída, multiplicado pela razão saída/quadro. Uma
 * conta só para os dois, porque o que a pessoa alinhou no círculo tem que ser
 * o que sai: ela pôs o olho do cliente no centro, e é ali que ele fica.
 * Quando a imagem é menor que o quadro, o que sobra em volta é fundo escuro.
 */
export function posicaoNoQuadro(
  largura: number, altura: number, quadro: number, e: Enquadramento,
): { x: number; y: number; w: number; h: number } {
  const seguro = limitarDeslocamento(largura, altura, quadro, e);
  const { w, h } = tamanhoNoQuadro(largura, altura, quadro, seguro.zoom);
  return { x: quadro / 2 - w / 2 + seguro.dx, y: quadro / 2 - h / 2 + seguro.dy, w, h };
}
