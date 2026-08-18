// Counter: contagem rápida de 0 até um valor.
//
// O desenho vive aqui, fora do React e fora do componente, por um motivo
// prático: a MESMA função pinta a prévia na tela e cada quadro da exportação.
// Se fossem dois caminhos, o vídeo sairia diferente do que a pessoa aprovou,
// e é exatamente esse tipo de divergência que faz alguém desistir da
// ferramenta e voltar pro After Effects.

export type FormatoNumero = "numero" | "dinheiro" | "percentual";

export interface ConfigCounter {
  valorFinal: number;
  duracao: number;          // segundos
  largura: number;
  altura: number;
  fundo: string | null;     // null = transparente
  corNumero: string;
  formato: FormatoNumero;
  casas: number;            // casas decimais
  milhar: boolean;          // separador de milhar
  sinalMais: boolean;       // mostra o + no positivo
  tamanhoFonte: number;     // fração da altura (0.1 a 0.5)
  peso: number;             // 400..900
}

export const CONFIG_PADRAO: ConfigCounter = {
  valorFinal: 250,
  duracao: 1.2,
  largura: 1080,
  altura: 1080,
  fundo: "#0B0B0F",
  corNumero: "#22C55E",
  formato: "numero",
  casas: 0,
  milhar: true,
  sinalMais: false,
  tamanhoFonte: 0.28,
  peso: 800,
};

export const FPS = 30;

// Desaceleração forte: a maior parte da contagem acontece nos primeiros
// instantes e o número "assenta" no fim. É o que dá a sensação de rápido sem
// deixar o valor final ilegível.
function suavizar(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function formatarValor(v: number, cfg: ConfigCounter): string {
  const negativo = v < 0;
  const corpo = Math.abs(v).toLocaleString("pt-BR", {
    minimumFractionDigits: cfg.casas,
    maximumFractionDigits: cfg.casas,
    useGrouping: cfg.milhar,
  });
  const sinal = negativo ? "-" : (cfg.sinalMais && v > 0 ? "+" : "");
  if (cfg.formato === "dinheiro") return `${sinal}R$ ${corpo}`;
  if (cfg.formato === "percentual") return `${sinal}${corpo}%`;
  return `${sinal}${corpo}`;
}

/** Valor mostrado no instante `t` (0 a 1) da animação. */
export function valorEm(t: number, cfg: ConfigCounter): number {
  const bruto = cfg.valorFinal * suavizar(Math.min(Math.max(t, 0), 1));
  // Arredonda na casa exibida, senão o número "treme" entre quadros mostrando
  // dígitos que a formatação vai esconder de qualquer jeito.
  const f = Math.pow(10, cfg.casas);
  return Math.round(bruto * f) / f;
}

export function totalDeQuadros(cfg: ConfigCounter): number {
  return Math.max(1, Math.round(cfg.duracao * FPS));
}

/**
 * Pinta um quadro. `t` vai de 0 a 1.
 *
 * A fonte é medida e reduzida até caber na largura útil: "R$ 1.250.000,00" é
 * muito mais largo que "12", e um número cortado na borda seria um material
 * inutilizável entregue como pronto.
 */
export function desenharQuadro(ctx: CanvasRenderingContext2D, cfg: ConfigCounter, t: number) {
  const { largura: L, altura: A } = cfg;

  ctx.clearRect(0, 0, L, A);
  if (cfg.fundo) {
    ctx.fillStyle = cfg.fundo;
    ctx.fillRect(0, 0, L, A);
  }

  const texto = formatarValor(valorEm(t, cfg), cfg);
  const familia = '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
  let tamanho = A * cfg.tamanhoFonte;
  const util = L * 0.86;

  ctx.font = `${cfg.peso} ${tamanho}px ${familia}`;
  const largura = ctx.measureText(texto).width;
  if (largura > util) {
    tamanho = tamanho * (util / largura);
    ctx.font = `${cfg.peso} ${tamanho}px ${familia}`;
  }

  ctx.fillStyle = cfg.corNumero;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(texto, L / 2, A / 2);
}
