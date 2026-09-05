// OS TRÊS SONS DA CAIXA.
//
// Som em ferramenta de trabalho é a coisa mais fácil de errar: alto demais e a
// pessoa desliga no primeiro dia; igual pra tudo e ele para de informar, vira
// só barulho. Aqui os três dizem coisas diferentes e têm peso diferente de
// propósito:
//
//   enviada           confirmação, não notícia. A pessoa apertou enter e sabe
//                     o que fez — o som só fecha o gesto. É o mais curto e o
//                     mais baixo dos três.
//
//   recebida-aberta   ela JÁ ESTÁ OLHANDO a conversa. A mensagem vai aparecer
//                     na frente dela de qualquer jeito; o som é um toque de
//                     canto, não um chamado.
//
//   recebida-fechada  a única que é notícia de verdade: chegou algo numa
//                     conversa que ninguém está vendo. Duas notas subindo,
//                     mais tempo e mais volume — é a que precisa alcançar
//                     alguém de costas pra tela.
//
// SINTETIZADO, NÃO ARQUIVO. Três blips não valem um pedido de rede nem um mp3
// no repositório, e o Web Audio dá controle exato de duração e volume — que é
// justamente o que separa "discreto" de "irritante".
//
// A ENVELOPE IMPORTA MAIS QUE A NOTA. Onda quadrada ou corte seco no fim
// produzem um clique que soa como defeito; por isso tudo aqui é senoide com
// subida de 10ms e queda exponencial. É o que faz um bipe soar intencional.

export type SomAtendimento = "enviada" | "recebida-aberta" | "recebida-fechada";

export type Desenho = {
  /** as notas, em hertz, tocadas em sequência */
  notas: number[];
  /** duração de CADA nota, em segundos */
  duracao: number;
  /** pico do volume, de 0 a 1 */
  volume: number;
};

// OS NÚMEROS JÁ ESTIVERAM ERRADOS, e vale registrar por quê. A primeira versão
// usava 3,5% e 5,5% de pico: no papel é "discreto", no alto-falante de notebook
// é silêncio — cerca de -29 dB num blip de 60ms não chega ao ouvido de ninguém.
// Discreto é o som que não assusta, não o som que não existe. A hierarquia
// entre os três é que importa, e ela continua a mesma; o que mudou foi o chão.
export const DESENHO: Record<SomAtendimento, Desenho> = {
  // Uma nota curta: fecha o gesto e some.
  "enviada": { notas: [880], duracao: 0.07, volume: 0.10 },
  // Mais grave e mais presente que a de envio — é o outro lado falando —, mas
  // ainda de canto: a pessoa está com a conversa na frente.
  "recebida-aberta": { notas: [587.33], duracao: 0.10, volume: 0.17 },
  // Duas notas subindo (ré → lá). Subir é o que faz um som pedir atenção sem
  // soar de alarme; descer soaria como erro.
  "recebida-fechada": { notas: [587.33, 880], duracao: 0.13, volume: 0.45 },
};

/**
 * Qual som toca para esta mensagem — ou nenhum.
 *
 * Mensagem NOSSA em conversa que não é a aberta não toca nada: ela foi enviada
 * de outro lugar (outra aba, o celular do escritório), e um bipe de confirmação
 * para um gesto que a pessoa não fez é ruído puro.
 */
export function somDaMensagem(args: {
  direcao: "entrada" | "saida" | string;
  conversaId: string;
  conversaAberta: string | null;
}): SomAtendimento | null {
  const aberta = !!args.conversaAberta && args.conversaId === args.conversaAberta;
  if (args.direcao === "saida") return aberta ? "enviada" : null;
  if (args.direcao === "entrada") return aberta ? "recebida-aberta" : "recebida-fechada";
  return null;
}

/**
 * Toca o som. Falha em silêncio, sempre.
 *
 * O navegador bloqueia áudio antes do primeiro clique da pessoa na página, e
 * isso não é erro — é a regra. Um `catch` que estourasse aqui derrubaria a
 * conversa por causa de um bipe, o que seria trocar uma comodidade por um
 * defeito.
 */
export function tocar(som: SomAtendimento, ctx: AudioContext, agora?: number): void {
  const d = DESENHO[som];
  const t0 = agora ?? ctx.currentTime;

  d.notas.forEach((hz, i) => {
    const inicio = t0 + i * d.duracao * 0.75;   // notas encavaladas: soam como um som só
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(hz, inicio);

    // Subida de 10ms e queda exponencial. Corte seco vira clique, e clique
    // soa como defeito de hardware, não como aviso.
    vol.gain.setValueAtTime(0.0001, inicio);
    vol.gain.exponentialRampToValueAtTime(d.volume, inicio + 0.01);
    vol.gain.exponentialRampToValueAtTime(0.0001, inicio + d.duracao);

    osc.connect(vol).connect(ctx.destination);
    osc.start(inicio);
    osc.stop(inicio + d.duracao + 0.02);
  });
}

/** Quanto tempo o som inteiro ocupa, em segundos. */
export function duracaoTotal(som: SomAtendimento): number {
  const d = DESENHO[som];
  return d.duracao * (1 + (d.notas.length - 1) * 0.75);
}
