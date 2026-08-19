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
  fps: number;              // 30 ou 60
  suavizar: number;         // 0 = desligado; 1 = rastro cheio entre quadros
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
  fps: 60,
  suavizar: 0.7,
};

export const FPS_OPCOES = [30, 60] as const;

// Desaceleração forte: a maior parte da contagem acontece nos primeiros
// instantes e o número "assenta" no fim. É o que dá a sensação de rápido sem
// deixar o valor final ilegível.
function suavizar(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * Formata na mão, sem `toLocaleString`.
 *
 * O Intl decide o separador pelos dados de locale do navegador, e nem todo
 * navegador entrega ponto no pt-BR: em alguns, o milhar vem como espaço fino
 * e "1.000.000" vira "1 000 000" no material final. Peça de marketing não
 * pode depender de que o computador de quem exportou tenha o locale completo,
 * então o ponto e a vírgula são escritos aqui.
 */
export function formatarValor(v: number, cfg: ConfigCounter): string {
  const negativo = v < 0;
  const abs = Math.abs(v);

  const fixo = abs.toFixed(cfg.casas);
  const [inteira, decimal] = fixo.split(".");
  const comMilhar = cfg.milhar ? inteira.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : inteira;
  const corpo = decimal ? `${comMilhar},${decimal}` : comMilhar;

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
  return Math.max(1, Math.round(cfg.duracao * cfg.fps));
}

/**
 * Quadros do arquivo inteiro: contagem mais o tempo segurando o valor final.
 *
 * Segurar não é enfeite. Sem isso o material acaba no instante exato em que o
 * número assenta, que é justamente o quadro que se usa na edição, e ninguém
 * consegue congelar um quadro que dura 33ms.
 */
export function totalDeQuadros(cfg: ConfigCounter): number {
  // O "+ 1" é o quadro que fecha a contagem. Com N quadros de contagem os
  // índices vão de 0 a N-1, e nenhum deles chega a t = 1: sem manter o número
  // no fim, o arquivo terminava em 998.925 no lugar de 1.000.000.
  return quadrosDaContagem(cfg) + 1 + Math.round(cfg.segurarFim * cfg.fps);
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

// Quantas amostras dentro de um mesmo quadro compõem o rastro. Seis já dá o
// borrão contínuo; mais que isso custa desenho e não se enxerga.
const AMOSTRAS_RASTRO = 6;

/**
 * Pinta um quadro. `t` vai de 0 a 1.
 *
 * O travado da contagem rápida não vem da conta, vem da natureza do meio: a 30
 * quadros por segundo com desaceleração forte, os primeiros quadros pulam
 * dezenas de milhares de uma vez, e o olho lê salto, não movimento. É o mesmo
 * motivo pelo qual uma roda de carroça filmada parece girar ao contrário.
 *
 * A saída é a que o cinema usa: obturador aberto. Em vez de um instante
 * congelado, o quadro guarda o caminho percorrido DENTRO dele — várias amostras
 * entre o quadro anterior e este, as antigas mais fracas, a atual opaca por
 * cima.
 *
 * Por isso `tAnterior` importa: o rastro cobre o intervalo real entre dois
 * quadros, não uma janela fixa. Nos quadros em que o número já parou, os dois
 * instantes são o mesmo e o rastro simplesmente não existe — sem isso, o
 * quadro final, que é justamente o que se usa na edição, sairia com fantasmas
 * de 998.960 atrás do 1.000.000.
 */
export function desenharQuadro(
  ctx: CanvasRenderingContext2D,
  cfg: ConfigCounter,
  t: number,
  tAnterior?: number,
) {
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

  const x = L / 2, y = A / 2;
  const escreve = (tk: number, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.fillText(formatarValor(valorEm(tk, cfg), cfg), x, y);
  };

  // Sem quadro anterior informado, assume um quadro de intervalo.
  const anterior = tAnterior ?? Math.max(0, t - 1 / Math.max(1, cfg.duracao * cfg.fps));
  const vao = t - anterior;

  if (cfg.suavizar > 0 && vao > 0) {
    // De trás pra frente: o rastro entra primeiro e a posição atual cobre por
    // cima, senão o valor que importa ficaria por baixo dos fantasmas.
    for (let k = AMOSTRAS_RASTRO; k >= 1; k--) {
      const tk = Math.max(0, t - (k / AMOSTRAS_RASTRO) * vao * cfg.suavizar);
      escreve(tk, (1 - k / (AMOSTRAS_RASTRO + 1)) * 0.5 * cfg.suavizar);
    }
  }
  escreve(t, 1);
  ctx.globalAlpha = 1;
}
