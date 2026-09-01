// QUANTO DAQUELE DINHEIRO QUE ENTROU NÃO É DO ESCRITÓRIO.
//
// Quando um alvará ou um acordo cai na conta, o extrato mostra o valor CHEIO.
// Só que boa parte dele é do cliente — é dinheiro que passou pela conta do
// escritório e vai sair de novo. Ler o saldo sem saber disso é a forma mais
// fácil de gastar o que não é seu.
//
// A baixa do Tracker já grava esse pedaço em `balance_repasses`. O que faltava
// era a tela DIZER. Este módulo é a ponte: dado um lançamento e os repasses
// carregados, responde se aquela entrada carrega dinheiro de cliente, quanto,
// e se já saiu.
//
// Por que fica aqui e não dentro da tela: é conta de dinheiro de terceiro. Se
// errar a subtração, o escritório acha que tem mais do que tem. Aqui dá pra
// testar cada caso — inclusive os feios, tipo repasse maior que a entrada.

export interface RepasseLancamento {
  id: string;
  lancamento_entrada_id: string;
  valor_devido: number | string;
  status: "pendente" | "pago";
  pago_em?: string | null;
}

export interface LancamentoParaRepasse {
  id: string;
  tipo: "entrada" | "saida";
  valor: number | string;
}

/* Genérico no repasse porque quem chama já tem o registro inteiro vindo do
   banco e precisa dele de volta INTEIRO — é ele que o botão de repassar leva
   adiante. Estreitar pro tipo mínimo daqui obrigaria a tela a procurar a linha
   outra vez pelo id. */
export interface ParteDoCliente<T extends RepasseLancamento = RepasseLancamento> {
  repasse: T;
  /** o que é do cliente */
  devido: number;
  /** o que sobra pro escritório depois de repassar */
  doEscritorio: number;
  /** ainda não saiu da conta */
  pendente: boolean;
  /** frase curta, pro selo em tela estreita (onde não há colunas) */
  resumo: string;
  /** só o essencial, pra coluna "do cliente" — ela já tem cabeçalho dizendo o quê */
  curto: string;
  /** frase inteira, pro detalhe do lançamento */
  aviso: string;
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dia = (iso?: string | null) => {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}` : null;
};

/**
 * Indexa os repasses pelo lançamento de entrada que os originou.
 *
 * Um lançamento tem no máximo um repasse na prática, mas nada no banco impede
 * dois. Se acontecer, somar os valores esconderia o problema — fica com o
 * primeiro, que é o que a tela mostra, e o resto aparece na aba de repasses.
 */
export function indexarRepasses<T extends RepasseLancamento>(
  repasses: T[] | null | undefined,
): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of repasses ?? []) {
    if (!r?.lancamento_entrada_id) continue;
    if (!m.has(r.lancamento_entrada_id)) m.set(r.lancamento_entrada_id, r);
  }
  return m;
}

/**
 * O aviso de dinheiro de cliente para um lançamento — ou null quando não há.
 *
 * Devolve null pra saída: o repasse aponta pra entrada que trouxe o dinheiro,
 * e a saída que o quita não pode se anunciar como "tem parte de cliente" —
 * ela É a parte do cliente indo embora.
 */
export function parteDoCliente<T extends RepasseLancamento>(
  lanc: LancamentoParaRepasse,
  indice: Map<string, T>,
): ParteDoCliente<T> | null {
  if (!lanc || lanc.tipo !== "entrada") return null;
  const repasse = indice.get(lanc.id);
  if (!repasse) return null;

  const devido = Number(repasse.valor_devido);
  if (!Number.isFinite(devido) || devido <= 0) return null;

  const bruto = Number(lanc.valor) || 0;
  // Nunca negativo: repasse maior que a entrada é dado torto, e mostrar
  // "−R$ 30 pro escritório" só confunde quem lê. Zero diz a verdade útil.
  const doEscritorio = Math.max(0, Number((bruto - devido).toFixed(2)));
  const pendente = repasse.status !== "pago";
  const quando = dia(repasse.pago_em);

  return {
    repasse,
    devido,
    doEscritorio,
    pendente,
    resumo: pendente ? `${brl(devido)} é do cliente` : "já repassado",
    curto: pendente ? brl(devido) : "repassado",
    aviso: pendente
      ? `${brl(devido)} deste valor é do cliente e ainda está na conta. ` +
        `Do escritório são ${brl(doEscritorio)}.`
      : `${brl(devido)} deste valor eram do cliente e já foram repassados` +
        `${quando ? ` em ${quando}` : ""}.`,
  };
}
