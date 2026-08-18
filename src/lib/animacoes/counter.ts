// Counter: contagem rápida de 0 até um valor.
//
// O desenho vive aqui, fora do React e fora do componente, por um motivo
// prático: a MESMA função pinta a prévia na tela e cada quadro da exportação.
// Se fossem dois caminhos, o vídeo sairia diferente do que a pessoa aprovou,
// e é exatamente esse tipo de divergência que faz alguém desistir da
// ferramenta e voltar pro After Effects.

export type FormatoNumero = "numero" | "dinheiro" | "percentual";

// Famílias com alternativa em cascata: nem todo computador tem todas, e um
// nome que não existe faria o canvas cair na fonte padrão sem avisar.
export const FONTES = [
  { k: "inter", nome: "Inter", css: '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif' },
  { k: "impact", nome: "Impact", css: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif' },
  { k: "arial", nome: "Arial", css: 'Arial, Helvetica, sans-serif' },
  { k: "georgia", nome: "Georgia", css: 'Georgia, "Times New Roman", serif' },
  { k: "mono", nome: "Mono", css: '"Roboto Mono", "Courier New", ui-monospace, monospace' },
  { k: "trebuchet", nome: "Trebuchet", css: '"Trebuchet MS", system-ui, sans-serif' },
] as const;

export type FonteKey = typeof FONTES[number]["k"];
export const cssDaFonte = (k: FonteKey) => (FONTES.find((f) => f.k === k) ?? FONTES[0]).css;

export interface ConfigCounter {
  valorFinal: number;
  duracao: number;          // segundos
  segurarFim: number;       // segundos parado no valor final
  largura: number;
  altura: number;
  fundo: string | null;     // null = transparente
  corNumero: string;
  formato: FormatoNumero;
  casas: number;            // casas decimais
  milhar: boolean;          // separador de milhar
  sinalMais: boolean;       // mostra o + no positivo
  tamanhoFonte: number;     // fração da altura (0.1 a 0.5)
  fonte: FonteKey;
  peso: number;             // 400..900
}

export const CONFIG_PADRAO: ConfigCounter = {
  valorFinal: 250,
  duracao: 1.2,
  segurarFim: 0.6,
  largura: 1080,
  altura: 1080,
  fundo: "#0B0B0F",
  corNumero: "#22C55E",
  formato: "numero",
  casas: 0,
  milhar: true,
  sinalMais: false,
  tamanhoFonte: 0.28,
  fonte: "inter",
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

/** Quadros da contagem em si, sem o tempo parado no fim. */
export function quadrosDaContagem(cfg: ConfigCounter): number {
  return Math.max(1, Math.round(cfg.duracao * FPS));
}

/**
 * Quadros do arquivo inteiro: contagem mais o tempo segurando o valor final.
 *
 * Segurar não é enfeite. Sem isso o material acaba no instante exato em que o
 * número assenta, que é justamente o quadro que se usa na edição, e ninguém
 * consegue congelar um quadro que dura 33ms.
 */
export function totalDeQuadros(cfg: ConfigCounter): number {
  return quadrosDaContagem(cfg) + Math.round(cfg.segurarFim * FPS);
}

/** Instante da animação (0 a 1) no quadro `i`. Depois da contagem, fica em 1. */
export function tDoQuadro(i: number, cfg: ConfigCounter): number {
  return Math.min(i / quadrosDaContagem(cfg), 1);
}

/**
 * Tamanho da fonte em pixels, medido pelo VALOR FINAL e não pelo valor do
 * quadro. É o detalhe que decide se a animação presta.
 *
 * Medindo quadro a quadro, "1" caberia folgado e sairia gigante, "1.000.000"
 * seria reduzido pra caber, e o número encolheria diante da câmera a cada
 * ordem de grandeza cruzada. Como a contagem é monotônica de zero até o alvo, o
 * texto mais largo é sempre o final: medir por ele fixa um tamanho só, que
 * serve do primeiro dígito ao último.
 *
 * A redução pra caber continua existindo, só que aplicada uma vez, ao final:
 * número cortado na borda seria material inutilizável entregue como pronto.
 */
export function tamanhoDaFonte(ctx: CanvasRenderingContext2D, cfg: ConfigCounter): number {
  const familia = cssDaFonte(cfg.fonte);
  const alvo = formatarValor(cfg.valorFinal, cfg);
  const util = cfg.largura * 0.86;

  const base = cfg.altura * cfg.tamanhoFonte;
  ctx.font = `${cfg.peso} ${base}px ${familia}`;
  const largura = ctx.measureText(alvo).width;
  return largura > util ? base * (util / largura) : base;
}

/** Pinta um quadro. `t` vai de 0 a 1. */
export function desenharQuadro(ctx: CanvasRenderingContext2D, cfg: ConfigCounter, t: number) {
  const { largura: L, altura: A } = cfg;

  ctx.clearRect(0, 0, L, A);
  if (cfg.fundo) {
    ctx.fillStyle = cfg.fundo;
    ctx.fillRect(0, 0, L, A);
  }

  ctx.font = `${cfg.peso} ${tamanhoDaFonte(ctx, cfg)}px ${cssDaFonte(cfg.fonte)}`;
  ctx.fillStyle = cfg.corNumero;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(formatarValor(valorEm(t, cfg), cfg), L / 2, A / 2);
}
