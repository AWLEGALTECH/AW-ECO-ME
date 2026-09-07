/* O LOG DA JORNADA, ARRUMADO POR ETAPA.
 *
 * O banco guarda a história em ordem de tempo: uma linha por passagem, na
 * sequência em que aconteceram. A tela precisa do contrário — por ETAPA, porque
 * é embaixo de cada etapa que a informação vai aparecer. Este módulo faz essa
 * virada, e faz sozinho para poder ser testado: contar passagem é o tipo de
 * conta que erra por um e ninguém percebe, porque "duas vezes" e "três vezes"
 * são igualmente plausíveis olhando a tela.
 *
 * O QUE UMA VOLTA SIGNIFICA. Passar por Proposta uma vez é o curso normal.
 * Passar duas é sinal: alguma coisa levou o lead de volta, e a data da volta é o
 * que permite achar a conversa daquele dia. Por isso a segunda passagem não é
 * um detalhe do mesmo item — é uma linha própria, com a sua data.
 */

export interface PassagemDeEtapa {
  etapa: string;
  de: string | null;
  entrou_em: string;
  estimado: boolean;
}

export interface PassagemNaTela {
  /** 1 na primeira vez que o lead entrou nesta etapa, 2 na volta, e assim por diante */
  vez: number;
  entrouEm: string;
  de: string | null;
  estimado: boolean;
  /** entrou vindo de uma etapa POSTERIOR: o lead voltou */
  voltou: boolean;
}

const ordem = (chaves: readonly string[], e: string | null) =>
  e === null ? -1 : chaves.indexOf(e);

/**
 * O log virado do avesso: de "o que aconteceu, em ordem" para "o que aconteceu
 * em cada etapa".
 *
 * `chaves` é a ordem das etapas da jornada — é o que permite dizer se uma
 * passagem foi avanço ou volta sem guardar isso no banco.
 */
export function passagensPorEtapa(
  log: PassagemDeEtapa[], chaves: readonly string[],
): Map<string, PassagemNaTela[]> {
  const fora = new Map<string, PassagemNaTela[]>();
  // Ordena por data porque a consulta pode chegar em qualquer ordem, e a
  // contagem de "vez" depende inteiramente da sequência estar certa.
  const emOrdem = [...log].sort((a, b) => a.entrou_em.localeCompare(b.entrou_em));

  for (const p of emOrdem) {
    const anteriores = fora.get(p.etapa) ?? [];
    anteriores.push({
      vez: anteriores.length + 1,
      entrouEm: p.entrou_em,
      de: p.de,
      estimado: p.estimado,
      voltou: ordem(chaves, p.de) > ordem(chaves, p.etapa) && ordem(chaves, p.etapa) >= 0,
    });
    fora.set(p.etapa, anteriores);
  }
  return fora;
}

/** Quantas vezes o lead bateu nesta etapa. Zero quando nunca passou por ela. */
export function vezesNaEtapa(log: PassagemDeEtapa[], etapa: string): number {
  return log.filter((p) => p.etapa === etapa).length;
}

/** Dia e hora curtos: "12/08 às 14:20". */
export function quandoDaPassagem(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Há quanto tempo o lead está aqui.
 *
 * Em dias, e não em horas: o que se decide olhando isso é "está parado demais?",
 * e essa pergunta não muda entre as onze e as quinze horas. "hoje" e "ontem" no
 * lugar de "0 dias" e "1 dia" porque é assim que se fala.
 */
export function tempoNaEtapa(desdeISO: string, agora = new Date()): string {
  const d = new Date(desdeISO);
  if (Number.isNaN(d.getTime())) return "";
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dias = Math.max(0, Math.round((dia(agora) - dia(d)) / 86400000));
  if (dias === 0) return "hoje";
  if (dias === 1) return "há 1 dia";
  return `há ${dias} dias`;
}
