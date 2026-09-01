// A BAIXA DO TRACKER — a porta de saída.
//
// O Tracker guarda o que está PREVISTO entrar. Um processo só sai dele por dois
// motivos: ou nunca entrou (não tem sentença nem acordo, então ainda vai
// passar por aqui), ou o dinheiro caiu — e aí ele não é mais previsão, é caixa,
// e a vida dele continua no Wallet. Essa saída é a baixa.
//
// SÃO DUAS VIAS DE GANHAR DINHEIRO NUM PROCESSO, e cada uma tem o seu último
// status antes do arquivamento:
//
//   litigiosa (sem acordo) → ... → ALVARÁ EXPEDIDO → ALVARÁ PAGO → ARQUIVADO
//   acordo                 → ... → AG. PAGAMENTO ACORDO → ACORDO PAGO → ARQUIVADO ACORDO
//
// Os dois "PAGO" são gêmeos: mesmo significado (o dinheiro entrou), caminhos
// diferentes. Antes deles o processo tinha um valor esperado; depois deles tem
// um valor recebido, que é coisa do Wallet.
//
// POR QUE ELES NÃO SÃO "ARQUIVADO". Arquivar é ato de organização do
// escritório e pode demorar semanas depois do dinheiro cair. Se a baixa
// dependesse do arquivamento, o Tracker mostraria como "a receber" dinheiro que
// já está na conta — que é exatamente o erro que este módulo existe pra evitar.
//
// A REGRA VALE PELAS DUAS PORTAS. Dá pra mudar o status pelo próprio Tracker ou
// pela ficha do processo, e nos dois casos é a mesma baixa. Por isso a decisão
// mora aqui, fora das telas: duas cópias divergiriam na primeira correção, e
// uma delas deixaria de perguntar.

export const STATUS_ALVARA_PAGO = "ALVARÁ PAGO";
export const STATUS_ACORDO_PAGO = "ACORDO PAGO";

/** Qual caminho o dinheiro fez até entrar. */
export type ViaBaixa = "alvara" | "acordo";

const POR_STATUS: Record<string, ViaBaixa> = {
  [STATUS_ALVARA_PAGO]: "alvara",
  [STATUS_ACORDO_PAGO]: "acordo",
};

const limpo = (s?: string | null) => (s ?? "").trim().toUpperCase();

/**
 * O status tira o processo do Tracker? Devolve a via, ou null.
 * Tolerante a caixa e espaço porque esses status também chegam da planilha,
 * digitados à mão.
 */
export function viaDeBaixa(status?: string | null): ViaBaixa | null {
  return POR_STATUS[limpo(status)] ?? null;
}

export const ehStatusDeBaixa = (status?: string | null) => viaDeBaixa(status) !== null;

/**
 * O processo já saiu do Tracker? Vale tanto o status de baixa quanto o
 * arquivamento — quem arquivou sem passar pelo "pago" também não está
 * esperando dinheiro nenhum.
 */
export function jaSaiuDoTracker(status?: string | null): boolean {
  const s = limpo(status);
  return ehStatusDeBaixa(s) || s === "ARQUIVADO" || s === "ARQUIVADO ACORDO";
}

export interface DecisaoBaixa {
  /** abrir a pergunta "quer dar baixa no Tracker?" */
  pedirBaixa: boolean;
  via: ViaBaixa | null;
  /** por que não pediu — serve pra tela explicar em vez de ficar muda */
  motivo?: "ja-baixado" | "sem-valor" | "nao-e-status-de-baixa" | "sem-mudanca";
}

/**
 * Mudar de `de` para `para` dispara a baixa?
 *
 * Só dispara quando o status NOVO é de baixa e o processo ainda não tinha sido
 * baixado. Reaplicar o mesmo status não repergunta: quem clicou duas vezes não
 * quis lançar duas vezes, e lançar dinheiro em dobro é bem pior que não
 * perguntar de novo.
 */
export function decidirBaixa(args: {
  de?: string | null;
  para?: string | null;
  /** já existe lançamento de baixa no Wallet pra este processo */
  jaBaixado?: boolean;
  /** quanto o processo vale hoje; sem valor não há o que lançar */
  valor?: number;
}): DecisaoBaixa {
  const via = viaDeBaixa(args.para);
  if (!via) return { pedirBaixa: false, via: null, motivo: "nao-e-status-de-baixa" };
  if (limpo(args.de) === limpo(args.para)) return { pedirBaixa: false, via, motivo: "sem-mudanca" };
  if (args.jaBaixado) return { pedirBaixa: false, via, motivo: "ja-baixado" };
  if (!args.valor || args.valor <= 0) return { pedirBaixa: false, via, motivo: "sem-valor" };
  return { pedirBaixa: true, via };
}

/**
 * A divisão do que entrou. O escritório preenche à mão: o percentual do
 * contrato não está registrado em lugar nenhum, e chutar 50% erra em um de cada
 * três casos — em agosto houve contrato de 30%, de 40% e de 50%.
 */
export function dividirBaixa(bruto: number, doCliente: number): {
  valido: boolean;
  erro?: string;
  doEscritorio: number;
  percentualCliente: number;
} {
  if (!(bruto > 0)) {
    return { valido: false, erro: "O valor recebido tem que ser maior que zero.", doEscritorio: 0, percentualCliente: 0 };
  }
  if (doCliente < 0) {
    return { valido: false, erro: "A parte do cliente não pode ser negativa.", doEscritorio: 0, percentualCliente: 0 };
  }
  if (doCliente > bruto) {
    return { valido: false, erro: "A parte do cliente não cabe dentro do valor recebido.", doEscritorio: 0, percentualCliente: 0 };
  }
  return {
    valido: true,
    doEscritorio: Number((bruto - doCliente).toFixed(2)),
    percentualCliente: Number(((doCliente / bruto) * 100).toFixed(1)),
  };
}

/**
 * Quanto o Tracker esperava receber deste processo — a sugestão que aparece
 * preenchida no diálogo da baixa.
 *
 * Pela via do acordo é o valor acordado; pela litigiosa, o mais próximo do que
 * de fato vai cair: o valor já executado, senão a condenação de 2º grau, senão
 * a de 1º. É sugestão, não imposição — quem dá a baixa digita o que caiu.
 */
export function valorPrevistoDoProcesso(
  etapas: Array<{
    titulo?: string;
    sentenca?: { valor?: number; resultado?: string };
    julgamento?: { valor?: number; resultado?: string };
    execucao?: { valor?: number };
    acordo?: { valor?: number };
  }> | null | undefined,
  via: ViaBaixa,
): number {
  const lista = etapas ?? [];
  const achar = (t: string) => lista.find((e) => e.titulo === t);

  if (via === "acordo") return Number(achar("Acordo")?.acordo?.valor || 0);

  const exec = achar("Cumprimento de sentença")?.execucao?.valor;
  const julg = achar("Julgamento em 2º grau")?.julgamento;
  const sent = achar("Sentença")?.sentenca;
  return Number(
    exec ||
    (julg && julg.resultado !== "improcedente" ? julg.valor : 0) ||
    (sent && sent.resultado !== "improcedente" ? sent.valor : 0) ||
    0,
  );
}
