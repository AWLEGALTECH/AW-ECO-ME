/* REAJUIZAMENTO: A AÇÃO EXTINTA SEM MÉRITO QUE VOLTA PARA A FILA DE PROTOCOLO.
 *
 * Extinção sem mérito não encerra o direito. O mesmo pedido pode ser
 * protocolado de novo, ganha número novo no fórum e vira um processo novo aqui
 * dentro, mas continua sendo a mesma briga do mesmo cliente contra o mesmo
 * banco. Este arquivo é a regra dessa volta: quem pode voltar, o que a pessoa
 * do protocolo precisa receber junto, e como os dois processos ficam amarrados
 * depois.
 *
 * Está fora da tela porque são três perguntas de dinheiro e de prazo, e todas
 * as três aparecem em mais de um lugar (ficha do processo, ficha do cliente,
 * quadro da esteira). Regra repetida em três telas é regra que diverge em duas.
 */

/** A etapa da demanda no quadro da esteira. Vale como valor de `demandas.etapa`. */
export const ETAPA_REAJUIZAMENTO = "reajuizamento";

/** O tipo da demanda continua sendo o mesmo: isto desemboca num protocolo. */
export const TIPO_REAJUIZAMENTO = "pre_protocolo";

/**
 * Os status em que o processo está pedindo para voltar.
 *
 * São DOIS porque a casa usa os dois. "AG. REAJUIZAMENTO" é o que a equipe
 * escreve hoje; "REAJUIZAR" veio da planilha original e ainda marca processos
 * de verdade. Aceitar só um deixaria uma parte da fila sem o botão, e ninguém
 * descobriria pela tela: o botão simplesmente não apareceria.
 */
export const STATUS_PEDE_REAJUIZAMENTO = ["AG. REAJUIZAMENTO", "REAJUIZAR"] as const;

/** Compara sem acento, sem caixa e sem espaço sobrando: a planilha não é uniforme. */
function chave(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim();
}

/** Este processo está esperando para ser reajuizado? */
export function pedeReajuizamento(fase: string | null | undefined): boolean {
  const k = chave(fase);
  return STATUS_PEDE_REAJUIZAMENTO.some((s) => chave(s) === k);
}

export interface ProcessoParaReajuizar {
  id: string;
  numero_processo: string | null;
  materia: string | null;
  comarca_uf: string | null;
  vara_juizo_origem: string | null;
  valor_causa: number | null;
  observacoes: string | null;
}

/**
 * POR QUE A AÇÃO CAIU, em uma das duas formas que a casa usa.
 *
 * "motivo" é texto livre: o juiz extinguiu por algo que não se repete, alguém
 * escreve o quê e a vida segue. "pendencia" é o fluxo normal de pendências: o
 * reprotocolo depende de um documento que não está na mão, e enquanto ele não
 * chega o cliente inteiro fica bloqueado na esteira, que é como a casa já trata
 * documento faltando em qualquer outra fase.
 *
 * São excludentes de propósito. Uma extinção tem uma causa; oferecer as duas
 * juntas produziria fichas com um motivo escrito e uma pendência que diz outra
 * coisa, e ninguém saberia qual das duas é a verdadeira.
 */
export type CausaDoReajuizamento =
  | { tipo: "motivo"; texto: string }
  | { tipo: "pendencia"; pendencias: string[]; detalhe?: string | null };

/** O que vai para `processos.reajuizamento_motivo`, e daí para os banners. */
export function textoDaCausa(
  causa: CausaDoReajuizamento,
  rotuloDe: (chave: string) => string = (k) => k,
): string {
  if (causa.tipo === "motivo") return causa.texto.trim();
  const nomes = causa.pendencias.map(rotuloDe).filter(Boolean);
  const base = nomes.length > 0
    ? `Aguardando documentos para reajuizar: ${nomes.join(", ")}.`
    : "Aguardando documentos para reajuizar.";
  const extra = causa.detalhe?.trim();
  return extra ? `${base} ${extra}` : base;
}

/** A causa está preenchida o bastante para gravar? Devolve o que falta. */
export function faltaNaCausa(causa: CausaDoReajuizamento): string | null {
  if (causa.tipo === "motivo") {
    return causa.texto.trim() ? null : "Escreva o motivo do reajuizamento.";
  }
  if (causa.pendencias.length === 0) return "Escolha ao menos uma pendência.";
  /* A personalizada sem descrição vira uma pendência chamada "Outro", que não
     diz a ninguém o que buscar. */
  if (causa.pendencias.includes("personalizada") && !causa.detalhe?.trim()) {
    return "Descreva a pendência personalizada.";
  }
  return null;
}

export interface DemandaDeReajuizamento {
  titulo: string;
  descricao: string;
  desconto: string | null;
  comarca: string | null;
  uf: string | null;
  valor_causa: number | null;
}

/**
 * Separa "Manaus / AM" nas duas partes que a demanda guarda em campos próprios.
 *
 * O processo guarda comarca e UF grudados num campo só, e a demanda os quer
 * separados, porque é assim que a tela de protocolo pergunta. Sem UF
 * reconhecível, tudo vira comarca: melhor a comarca com sujeira do que perder
 * a cidade inteira porque o final não era uma sigla.
 */
export function separarComarcaUf(comarcaUf: string | null | undefined): { comarca: string | null; uf: string | null } {
  const bruto = String(comarcaUf ?? "").trim();
  if (!bruto) return { comarca: null, uf: null };
  const m = bruto.match(/^(.*?)[\s/,-]+([A-Za-z]{2})$/);
  if (m && m[1].trim()) return { comarca: m[1].trim(), uf: m[2].toUpperCase() };
  return { comarca: bruto, uf: null };
}

/**
 * O que a pessoa do protocolo recebe para reprotocolar.
 *
 * A descrição é redigida, e não um despejo de campos, porque quem abre isso na
 * esteira está com quinze demandas na tela e precisa saber em cinco segundos
 * que aquilo é um REPROTOCOLO, de qual processo, e onde ele corria. O número
 * do processo extinto é a primeira linha de propósito: é o que se consulta
 * para saber por que caiu, e é o que vai na petição nova.
 */
export function demandaDeReajuizamento(
  proc: ProcessoParaReajuizar,
  clienteNome: string | null | undefined,
  /* A causa vem PRIMEIRO na descrição, logo abaixo do número: é o que quem vai
     reprotocolar precisa ler antes de qualquer outra coisa, porque é o que não
     pode se repetir. */
  causa?: string | null,
): DemandaDeReajuizamento {
  const nome = String(clienteNome ?? "").trim() || "cliente";
  const numero = String(proc.numero_processo ?? "").trim();
  const { comarca, uf } = separarComarcaUf(proc.comarca_uf);

  const linhas: string[] = [
    `Reajuizamento de ${numero || "processo sem número"}, extinto sem mérito.`,
  ];
  if (causa?.trim()) linhas.push(`Motivo: ${causa.trim()}`);
  if (proc.materia) linhas.push(`Matéria: ${proc.materia}`);
  if (proc.vara_juizo_origem) linhas.push(`Corria em: ${proc.vara_juizo_origem}`);
  if (proc.comarca_uf) linhas.push(`Comarca: ${proc.comarca_uf}`);
  if (proc.valor_causa != null) {
    linhas.push(`Valor da causa anterior: ${proc.valor_causa.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`);
  }
  /* As observações do processo vêm por último e inteiras: é onde costuma estar
     o motivo da extinção, que é justamente o que não pode se repetir. */
  if (proc.observacoes?.trim()) linhas.push(`Observações do processo anterior: ${proc.observacoes.trim()}`);

  return {
    titulo: `Reajuizar: ${nome}`,
    descricao: linhas.join("\n"),
    desconto: proc.materia,
    comarca,
    uf,
    valor_causa: proc.valor_causa,
  };
}

/**
 * Já existe demanda de reajuizamento viva para este processo?
 *
 * Vale para não oferecer o botão duas vezes e acabar com duas petições do
 * mesmo pedido na fila, que no fórum vira litispendência. Cancelada não conta:
 * quem cancelou quis desfazer, e precisa poder gerar de novo.
 */
export function temReajuizamentoAberto(
  demandas: readonly { etapa: string; status: string; processo_id?: string | null }[],
  processoId: string,
): boolean {
  return demandas.some((d) =>
    d.etapa === ETAPA_REAJUIZAMENTO
    && d.processo_id === processoId
    && d.status !== "cancelada");
}
