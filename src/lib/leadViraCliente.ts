/* O ÚLTIMO DEGRAU DA JORNADA: O LEAD VIRA CLIENTE, OU NÃO VIRA.
 *
 * Até aqui "Finalizar atendimento" era um interruptor: ligava e desligava a
 * régua de cobrança, e pronto. Mas um lead não termina de um jeito só. Ou ele
 * fecha e passa a ser cliente, ou ele deu pra trás. São dois caminhos com
 * consequências opostas, e um interruptor não sabe diferenciar os dois.
 *
 * ─────────────────────────────── o que mora aqui ────────────────────────────
 *
 * As decisões que a tela toma antes de mexer no banco:
 *
 *   pode virar cliente?   quem já virou não vira de novo, e sem número de
 *                         destino não há para onde ir
 *   para onde vai?        as instâncias possíveis, tirando a de onde ele sai
 *   o que vai escrito?    a mensagem de boas-vindas daquele número, com o
 *                         primeiro nome no lugar certo
 *
 * A MENSAGEM CHEGA ESCRITA E NÃO ENVIADA. É a primeira palavra do escritório
 * com alguém que acabou de assinar um contrato, e o nome que vai nela saiu de
 * um extrato lido por máquina. Quem aperta o enter lê antes. Este módulo
 * prepara o texto; quem manda é gente.
 */

/** O texto quando o número de destino não tem um próprio configurado. */
export const BOAS_VINDAS_PADRAO =
  "Olá, {nome}! Seja bem-vindo ao escritório. " +
  "Me chamo Dr. Matheus Enes e, a partir de agora, prossigo pessoalmente com o seu atendimento. " +
  "Qualquer dúvida sobre o seu processo, é só me chamar por aqui.";

/**
 * O primeiro nome, do jeito que se fala com alguém.
 *
 * "JEFFERSON WOLLACE FERREIRA DE ARAUJO" vira "Jefferson". Nome inteiro numa
 * saudação soa a cobrança de banco, e é justamente o oposto do que esta
 * mensagem existe para fazer.
 */
export function primeiroNome(nome: string | null | undefined): string {
  const limpo = (nome || "").replace(/\s+/g, " ").trim();
  if (!limpo) return "";
  const p = limpo.split(" ")[0];
  if (p.length <= 1) return "";
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

/**
 * A mensagem pronta para a barra.
 *
 * `{nome}` é o único buraco, e ele fecha sozinho quando não há nome: sem isso a
 * pessoa receberia "Olá, !" na primeira frase que o escritório dirige a ela.
 */
export function mensagemDeBoasVindas(
  modelo: string | null | undefined,
  nome: string | null | undefined,
): string {
  const base = (modelo || "").trim() || BOAS_VINDAS_PADRAO;
  const primeiro = primeiroNome(nome);
  return base
    .replace(/\{nome\}/g, primeiro)
    // "Olá, ! Seja" vira "Olá! Seja": a vírgula órfã denuncia o buraco vazio.
    .replace(/,\s*!/g, "!")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Uma instância, do jeito mínimo que esta decisão precisa. */
export interface InstanciaEscolhivel {
  id: string;
  nome: string;
  ativa?: boolean | null;
}

const mesmoNome = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Para onde este lead pode ir.
 *
 * Tira a instância de onde ele já está (repassar para o mesmo número não é
 * repasse) e as desligadas (mandar para um número que não responde é perder a
 * pessoa em silêncio).
 */
export function destinosPossiveis(
  instancias: InstanciaEscolhivel[],
  atual: string | null | undefined,
): InstanciaEscolhivel[] {
  return instancias.filter(
    (i) => i.ativa !== false && !(atual && mesmoNome(i.nome, atual)),
  );
}

export type ImpedimentoDaVirada = "ja_e_cliente" | "sem_destino" | null;

/**
 * O que impede este lead de virar cliente agora, se algo impedir.
 *
 * Devolver o MOTIVO e não um booleano é o que permite a tela dizer por que o
 * botão não serve, em vez de mostrá-lo apagado e deixar a pessoa clicando.
 */
export function impedimentoDaVirada(args: {
  jaVirouEm?: string | null;
  destinos: InstanciaEscolhivel[];
}): ImpedimentoDaVirada {
  if (args.jaVirouEm) return "ja_e_cliente";
  if (args.destinos.length === 0) return "sem_destino";
  return null;
}

/** O impedimento em uma linha, para a tela não ficar muda. */
export function explicarImpedimento(i: ImpedimentoDaVirada): string {
  if (i === "ja_e_cliente") return "Esta pessoa já foi aprovada como cliente.";
  if (i === "sem_destino") return "Não há outro número ligado para onde levá-la.";
  return "";
}

/**
 * O motivo do descarte, do jeito que vai para o banco.
 *
 * A lista de motivos cobre o comum, e o campo livre cobre o resto. Os dois
 * juntos viram uma linha só: "Desistiu: achou caro" diz mais que qualquer um
 * dos dois sozinho, e continua agrupável pelo começo.
 */
export function motivoDoDescarte(escolhido: string, detalhe: string): string {
  const e = (escolhido || "").trim();
  const d = (detalhe || "").replace(/\s+/g, " ").trim();
  if (!e) return d;
  if (!d) return e;
  return `${e}: ${d}`;
}
