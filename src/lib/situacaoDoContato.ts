/* O QUE ESTA PESSOA É PARA O ESCRITÓRIO, E O QUE A FICHA MOSTRA POR CAUSA DISSO.
 *
 * A ficha de atendimento nasceu para LEAD: origem, base, jornada, follow-up.
 * Funciona enquanto a pessoa está no funil. Mas o número do Dr. Matheus não
 * atende funil: atende cliente com processo em curso, escritório adverso
 * negociando acordo, e a própria equipe. Para essa gente a ficha de lead não
 * responde nada. "No funil há 6 dias" para quem tem cinco processos ativos é
 * ruído, e "Jornada Bradesco" para o advogado do banco é errado.
 *
 * ─────────────────────────────── cinco situações ────────────────────────────
 *
 * Levantadas nas 56 conversas do corporativo, e não inventadas:
 *
 *   lead          está no funil, ou ainda não se sabe o que é
 *   cliente       tem ficha de cliente, ou passou pela virada
 *   contraparte   escritório do banco negociando acordo
 *   interno       equipe, e os próprios números do escritório aparecendo como
 *                 contato
 *   outro         não é nenhuma das anteriores, e alguém já olhou
 *
 * A SITUAÇÃO DECIDE A FICHA. Lead vê jornada e follow-up. Cliente vê processos
 * e pendências, e não vê funil nenhum, porque não está em funil nenhum.
 * Contraparte e interno veem o mínimo: notas e lembretes, que servem para
 * qualquer pessoa.
 *
 * Este módulo é a única fonte dessas regras. A tela pergunta a ele o que
 * desenhar; o banco pergunta a ele quais valores existem. Duas cópias
 * divergiriam na primeira mudança.
 */

export const SITUACOES = ["lead", "cliente", "contraparte", "interno", "outro"] as const;
export type Situacao = (typeof SITUACOES)[number];

export interface SituacaoDef {
  chave: Situacao;
  rotulo: string;
  /** a frase que explica a escolha, na hora de escolher */
  descricao: string;
  /** o tom da etiqueta: cada situação tem uma cor, e a cor é fixa */
  tom: "primary" | "emerald" | "amber" | "sky" | "zinc";
}

export const SITUACOES_DEF: readonly SituacaoDef[] = [
  { chave: "lead",        rotulo: "Lead",        tom: "primary", descricao: "está no funil, ou ainda não se sabe o que é" },
  { chave: "cliente",     rotulo: "Cliente",     tom: "emerald", descricao: "tem ficha de cliente ou já assinou" },
  { chave: "contraparte", rotulo: "Contraparte", tom: "amber",   descricao: "escritório ou preposto da outra parte, negociando" },
  { chave: "interno",     rotulo: "Interno",     tom: "sky",     descricao: "equipe, ou um número do próprio escritório" },
  { chave: "outro",       rotulo: "Outro",       tom: "zinc",    descricao: "não é nenhuma das anteriores" },
];

export function situacaoValida(x: unknown): x is Situacao {
  return typeof x === "string" && (SITUACOES as readonly string[]).includes(x);
}

/** A situação a usar: a gravada, ou lead, que é o que todo contato é até se saber mais. */
export function situacaoOuPadrao(x: unknown): Situacao {
  return situacaoValida(x) ? x : "lead";
}

export function defDaSituacao(s: Situacao): SituacaoDef {
  return SITUACOES_DEF.find((d) => d.chave === s) ?? SITUACOES_DEF[0];
}

/* ── o que a ficha mostra ─────────────────────────────────────────────────── */

/** As seções da ficha que dependem da situação. As demais aparecem sempre. */
export type SecaoCondicional =
  | "followup" | "jornada" | "programadas"        // coisas de funil
  | "processos" | "pendencias" | "ficha_cliente"  // coisas de quem já é cliente
  | "chegada";                                    // "chegou em" e "no funil"

/**
 * Esta seção aparece para esta situação?
 *
 * A regra inteira, num lugar só:
 *
 *   funil (follow-up, jornada, programadas, chegada)   só para LEAD
 *   cliente (processos, pendências, ficha)             só para CLIENTE
 *
 * Contraparte, interno e outro não veem nenhum dos dois grupos. Não estão no
 * funil e não têm processo em nome próprio: o que sobra para eles é o que
 * serve para qualquer pessoa, notas e lembretes, e isso a tela mostra sempre.
 */
export function mostraSecao(situacao: Situacao, secao: SecaoCondicional): boolean {
  const deFunil = secao === "followup" || secao === "jornada" || secao === "programadas" || secao === "chegada";
  const deCliente = secao === "processos" || secao === "pendencias" || secao === "ficha_cliente";
  if (deFunil) return situacao === "lead";
  if (deCliente) return situacao === "cliente";
  return true;
}

/**
 * O chute inicial, a partir do que já se sabe da conversa.
 *
 * É o que o banco fez na migração, escrito de novo aqui para a tela poder
 * sugerir a mesma coisa quando a coluna ainda estiver no padrão. Não decide:
 * sugere. Quem decide é quem atende, clicando.
 */
export function situacaoSugerida(args: {
  situacaoGravada?: string | null;
  clienteId?: string | null;
  virouClienteEm?: string | null;
}): Situacao {
  if (situacaoValida(args.situacaoGravada) && args.situacaoGravada !== "lead") return args.situacaoGravada;
  if (args.clienteId || args.virouClienteEm) return "cliente";
  return situacaoOuPadrao(args.situacaoGravada);
}

/* ── o que muda quando a situação muda ────────────────────────────────────── */

/** O nome de cada seção como a pessoa a vê na ficha. */
const NOME_DA_SECAO: Record<SecaoCondicional, string> = {
  followup: "Follow-up",
  jornada: "Jornada",
  programadas: "Programadas",
  chegada: "tempo no funil",
  processos: "Processos",
  pendencias: "Pendências",
  ficha_cliente: "atalho para a ficha do cliente",
};

const TODAS_AS_SECOES: readonly SecaoCondicional[] = [
  "followup", "jornada", "programadas", "chegada", "processos", "pendencias", "ficha_cliente",
];

export interface ConsequenciasDaTroca {
  /** o que passa a aparecer na ficha */
  ganha: string[];
  /** o que some da ficha */
  perde: string[];
  /** a pessoa sai da régua de cobrança */
  saiDaRegua: boolean;
  /** a pessoa volta a poder entrar na régua */
  voltaARegua: boolean;
}

/**
 * O que acontece se a situação trocar de `de` para `para`.
 *
 * Calculado da MESMA regra que desenha a ficha (`mostraSecao`), e não escrito
 * à mão num texto de aviso: aviso escrito à mão descreve a tela de ontem. O que
 * este cálculo devolve é o que a tela vai fazer de verdade no segundo seguinte.
 *
 * A RÉGUA É A CONSEQUÊNCIA QUE NÃO SE VÊ. Sumir uma seção a pessoa percebe na
 * hora; continuar cobrando por WhatsApp alguém que virou cliente, ou o advogado
 * do banco, ninguém percebe até o constrangimento. Por isso ela é dita aqui e
 * feita no banco, na mesma troca.
 */
export function consequenciasDaTroca(de: Situacao, para: Situacao): ConsequenciasDaTroca {
  const ganha: string[] = [];
  const perde: string[] = [];
  for (const sec of TODAS_AS_SECOES) {
    const antes = mostraSecao(de, sec);
    const depois = mostraSecao(para, sec);
    if (!antes && depois) ganha.push(NOME_DA_SECAO[sec]);
    if (antes && !depois) perde.push(NOME_DA_SECAO[sec]);
  }
  return {
    ganha,
    perde,
    saiDaRegua: de === "lead" && para !== "lead",
    voltaARegua: de !== "lead" && para === "lead",
  };
}

/* ── pendências de um cliente ─────────────────────────────────────────────── */

/**
 * O que conta como pendência na ficha de cliente.
 *
 * `demandas` guarda 800 linhas com cinco status. Concluída, resolvida e
 * cancelada são passado; o que a ficha precisa mostrar é o que ainda está na
 * mão de alguém. Sem este filtro, o cliente com 30 demandas antigas encerradas
 * teria uma seção enorme dizendo nada.
 */
export const STATUS_PENDENTE: readonly string[] = ["pendente", "em_andamento"];

export function ehPendente(status: string | null | undefined): boolean {
  return !!status && STATUS_PENDENTE.includes(status);
}
