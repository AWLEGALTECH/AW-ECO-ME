/* A CONVERSA QUE ACABOU DE CHEGAR DE OUTRO NÚMERO.
 *
 * O problema que isto resolve apareceu com a Ediene ("Neguinha", 92 98425-3852)
 * em 18/09: a Adria repassou o número para o Dr. Matheus Enes Corporativo e lá
 * ele "não apareceu". Ele estava lá, e a linha estava certa. O que estava
 * errado era o LUGAR dela.
 *
 * A caixa é ordenada por `ultima_em`, o carimbo da última mensagem, que é o
 * que todo aplicativo de mensagem usa e é o certo. Só que a conversa recém
 * repassada ainda não tem mensagem NAQUELE número: `ultima_em` é nulo, o nulo
 * vale zero na conta, e ela vai para o fim de uma fila de sessenta e nove.
 * Ninguém rola até lá. Na prática, repassar um número era fazê-lo sumir.
 *
 * Então ela sobe para logo abaixo das fixadas, e fica ali ATÉ ALGUÉM
 * TRABALHAR NELA. A faixa se esvazia sozinha: no instante em que existe
 * mensagem depois do repasse, a conversa volta para a ordem normal, pelo
 * carimbo dela. Sem prazo, sem botão de "ok, vi", sem mais um estado para
 * alguém lembrar de limpar.
 *
 * Só sobe no número que RECEBEU. Quem repassou continua com a conversa na
 * leitura (`pode_escrever = false`), e ali ela não é tarefa de ninguém: subir
 * nos dois lados poria a mesma pessoa duas vezes no topo de duas caixas, uma
 * delas sem nada a fazer.
 */

export interface LinhaDaCaixa {
  fixadaEm?: string | null;
  /** quando o repasse aconteceu */
  movidaEm?: string | null;
  /** de qual número ela veio */
  movidaDe?: string | null;
  /** false = este número só lê; quem responde é outro */
  podeEscrever?: boolean | null;
  ultimaEm?: string | null;
}

const ms = (iso?: string | null): number => {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** Chegou por repasse e ainda não teve mensagem nenhuma depois disso. */
export function recemChegada(l: LinhaDaCaixa): boolean {
  if (!l.movidaEm || !l.movidaDe) return false;
  if (l.podeEscrever === false) return false;
  const movida = ms(l.movidaEm);
  if (!movida) return false;
  /* Mensagem DEPOIS do repasse quer dizer que a conversa já andou naquele
     número: alguém respondeu, ou o lead escreveu. A partir daí ela tem carimbo
     próprio e não precisa mais de ajuda para ser encontrada. */
  return ms(l.ultimaEm) <= movida;
}

/**
 * A ordem da caixa, em três faixas.
 *
 *   1. fixadas          a última fixada primeiro, como pilha de papel
 *   2. recém-chegadas   a última a chegar primeiro: é a que ninguém viu ainda
 *   3. o resto          pela última mensagem, como sempre foi
 *
 * A faixa 2 é estreita de propósito. Ela existe para uma conversa que ninguém
 * consegue achar, e não para virar uma segunda lista de prioridades: tudo o
 * que já foi trabalhado uma vez sai dela sozinho.
 */
export function compararNaCaixa(a: LinhaDaCaixa, b: LinhaDaCaixa): number {
  const fa = ms(a.fixadaEm);
  const fb = ms(b.fixadaEm);
  if (fa !== fb) return fb - fa;

  const ra = recemChegada(a);
  const rb = recemChegada(b);
  if (ra !== rb) return ra ? -1 : 1;
  if (ra && rb) {
    const m = ms(b.movidaEm) - ms(a.movidaEm);
    if (m !== 0) return m;
  }

  return ms(b.ultimaEm) - ms(a.ultimaEm);
}
