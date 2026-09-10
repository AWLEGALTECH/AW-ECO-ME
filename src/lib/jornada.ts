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

/* ═══════════════════════ AS JORNADAS ═══════════════════════
 *
 * O dossiê define a jornada. Lead da base Bradesco anda por etapas que o
 * sistema detecta sozinho (mensagem nossa, pedido de extrato, PDF recebido,
 * análise do Finder, pré-cliente do Writer, assinatura); quem não está em base
 * nenhuma fica na jornada padrão, que é a original do Atendimento, até alguém
 * dizer de onde veio.
 *
 * A regra de detecção mora no banco (migração jornada_bradesco); o espelho
 * abaixo (`alvoDaMensagem`) existe para a tela explicar e para o teste fixar
 * a regra em prosa. Se os dois divergirem, o do banco é o que vale.
 */

export type Jornada = "padrao" | "bradesco";

export interface EtapaDef {
  chave: string;
  rotulo: string;
  descricao: string;
  /** saída do funil: não fica no trilho, aparece como estado */
  terminal?: boolean;
}

export const ETAPAS_PADRAO: readonly EtapaDef[] = [
  { chave: "chegou",   rotulo: "Chegou",    descricao: "mandou mensagem, ainda não foi triado" },
  { chave: "triagem",  rotulo: "Triagem",   descricao: "descobrindo se há caso" },
  { chave: "extrato",  rotulo: "Extrato",   descricao: "esperando o documento, que é o gargalo" },
  { chave: "proposta", rotulo: "Proposta",  descricao: "sabe o que dá pra pedir, falta fechar" },
  { chave: "fechado",  rotulo: "Fechado",   descricao: "virou cliente" },
];

export const ETAPAS_BRADESCO: readonly EtapaDef[] = [
  { chave: "na_base",               rotulo: "Na base",               descricao: "está na base de leads; ninguém daqui respondeu ainda" },
  { chave: "triagem",               rotulo: "Triagem",               descricao: "já falamos com ele; descobrindo se há caso" },
  { chave: "aguardando_extrato",    rotulo: "Aguardando extrato",    descricao: "pedimos o extrato; é aqui que a cadência cobra" },
  { chave: "aguardando_analise",    rotulo: "Aguardando análise",    descricao: "extrato recebido; falta rodar o Finder" },
  /* A etapa se chama pelo que ESPERA, como as vizinhas. Nesse ponto a análise
     já saiu e o que trava o caso é o documento que ainda não chegou. A chave é
     diferente da 'proposta' da régua padrão de propósito: são momentos
     diferentes e convivem no mesmo log de passagens. */
  { chave: "aguardando_documentos",  rotulo: "Aguardando documentação", descricao: "análise pronta; falta ele mandar os documentos" },
  { chave: "aguardando_assinatura", rotulo: "Aguardando assinatura", descricao: "kit e procuração enviados pelo Writer" },
  { chave: "assinado",              rotulo: "Assinado",              descricao: "assinou; daqui em diante é registro" },
  { chave: "perdido",               rotulo: "Perdido",               descricao: "saiu do funil", terminal: true },
];

export function etapasDaJornada(j: Jornada | null | undefined): readonly EtapaDef[] {
  return j === "bradesco" ? ETAPAS_BRADESCO : ETAPAS_PADRAO;
}

/** As etapas do trilho: as terminais ficam de fora e viram um aviso. */
export function trilhoDaJornada(j: Jornada | null | undefined): readonly EtapaDef[] {
  return etapasDaJornada(j).filter((e) => !e.terminal);
}

/** Rótulo de uma chave. Sem jornada, procura nas duas: o log guarda chaves de ambas. */
export function rotuloDaEtapa(j: Jornada | null | undefined, chave: string | null | undefined): string {
  if (!chave) return "";
  const lista = j ? etapasDaJornada(j) : [...ETAPAS_BRADESCO, ...ETAPAS_PADRAO];
  return lista.find((e) => e.chave === chave)?.rotulo
    ?? [...ETAPAS_BRADESCO, ...ETAPAS_PADRAO].find((e) => e.chave === chave)?.rotulo
    ?? chave;
}

export function ehEtapaTerminal(j: Jornada | null | undefined, chave: string): boolean {
  return !!etapasDaJornada(j).find((e) => e.chave === chave)?.terminal;
}

export const BASES: readonly { chave: string; rotulo: string; curto: string }[] = [
  { chave: "bradesco",  rotulo: "Base Bradesco",  curto: "Bradesco" },
  { chave: "indicacao", rotulo: "Indicação",       curto: "Indicação" },
  { chave: "outra",     rotulo: "Outra origem",    curto: "Outra" },
];

export function rotuloDaBase(chave: string | null | undefined): string | null {
  if (!chave) return null;
  return BASES.find((b) => b.chave === chave)?.rotulo ?? chave;
}

export function jornadaDaBase(base: string | null | undefined): Jornada {
  return base === "bradesco" ? "bradesco" : "padrao";
}

export const MOTIVOS_PERDIDO: readonly string[] = [
  "Sem desconto indevido",
  "Não respondeu",
  "Desistiu",
  "Já tem advogado",
  "Fora do perfil",
];

/**
 * Para onde uma mensagem leva o lead na jornada Bradesco. Espelho da regra do
 * banco. `null` quando a mensagem não move nada.
 */
export function alvoDaMensagem(m: {
  direcao: "entrada" | "saida";
  tipo: string;
  texto?: string | null;
  midiaMime?: string | null;
}): string | null {
  if (m.direcao === "saida") {
    return m.tipo === "texto" && /extrato/i.test(m.texto ?? "") ? "aguardando_extrato" : "triagem";
  }
  if (m.tipo === "documento" && /pdf/i.test(m.midiaMime ?? "")) return "aguardando_analise";
  return null;
}

/** O automático só anda para a frente; voltar é decisão de gente. */
export function avancaBradesco(atual: string | null | undefined, alvo: string): boolean {
  const ordem = (k: string | null | undefined) => ETAPAS_BRADESCO.findIndex((e) => e.chave === (k ?? "na_base"));
  if (atual === "perdido") return false;
  return ordem(alvo) > ordem(atual);
}
