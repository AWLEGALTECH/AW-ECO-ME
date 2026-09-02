// O HISTÓRICO DE UM LANÇAMENTO, EM PORTUGUÊS.
//
// O banco guarda a mudança crua: `{"valor": {"before": 100, "after": 120}}`.
// Isso serve pra auditoria e não serve pra ninguém ler. Aqui vira
// "valor: R$ 100,00 → R$ 120,00", que é a frase que responde a pergunta de
// quem abriu a tela: o que mexeram nisso, e quem.
//
// Por que fora do componente: a tradução tem regra de verdade — id vira nome,
// data vira dia, `previsto` vira "ainda vai acontecer" — e regra escondida
// dentro de JSX não se testa. O componente só recebe as linhas prontas.
//
// O QUE NÃO APARECE. `id`, `created_at` e `updated_at` são ruído de banco: nem
// mudam por decisão de ninguém, nem dizem nada a quem lê. Todo o resto aparece,
// inclusive campo que eu não previ — sai com o nome cru da coluna. Esconder o
// desconhecido seria a única forma de o histórico mentir por omissão.

export interface EventoBruto {
  quando: string;
  acao: string;
  quem: string;
  mudancas: Record<string, { before: unknown; after: unknown }> | null;
}

/** Como transformar id em nome. Cada uma é opcional; sem ela, sai o id. */
export interface Dicionarios {
  categoria?: (id: string) => string | undefined;
  conta?: (id: string) => string | undefined;
  cliente?: (id: string) => string | undefined;
}

export interface EventoLegivel {
  quando: string;
  quandoTexto: string;
  quem: string;
  acao: "create" | "update" | "delete" | "outro";
  titulo: string;
  mudancas: string[];
}

const IGNORAR = new Set(["id", "created_at", "updated_at"]);

const ROTULOS: Record<string, string> = {
  descricao: "descrição",
  valor: "valor",
  data: "data",
  status: "situação",
  tipo: "tipo",
  categoria_id: "categoria",
  conta_id: "conta",
  cliente_id: "cliente",
  processo_id: "processo",
  recorrente_id: "custo fixo",
  observacoes: "observações",
  competencia: "competência",
  pago_em: "pago em",
  origem: "origem",
  origem_ref: "referência de origem",
  criado_por: "autor",
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dia = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
};

export function rotuloCampo(campo: string): string {
  return ROTULOS[campo] ?? campo;
}

/**
 * O valor de um campo como ele deve aparecer na linha do histórico.
 *
 * Nulo e string vazia viram "vazio" em vez de sumirem: "observações: vazio →
 * conferido com o extrato" conta uma história; "observações: → conferido"
 * parece defeito.
 */
export function valorDoCampo(campo: string, valor: unknown, dic: Dicionarios = {}): string {
  if (valor === null || valor === undefined || valor === "") return "vazio";

  if (campo === "valor") {
    const n = Number(valor);
    return Number.isFinite(n) ? brl(n) : String(valor);
  }
  if (campo === "data" || campo === "pago_em") return dia(String(valor));
  if (campo === "competencia") {
    const s = String(valor);
    return /^\d{4}-\d{2}/.test(s) ? `${s.slice(5, 7)}/${s.slice(0, 4)}` : s;
  }
  if (campo === "status") return valor === "previsto" ? "ainda vai acontecer" : "já aconteceu";
  if (campo === "tipo") return valor === "saida" ? "saída" : "entrada";

  if (campo === "categoria_id") return dic.categoria?.(String(valor)) ?? String(valor);
  if (campo === "conta_id") return dic.conta?.(String(valor)) ?? String(valor);
  if (campo === "cliente_id") return dic.cliente?.(String(valor)) ?? String(valor);

  if (typeof valor === "boolean") return valor ? "sim" : "não";
  return String(valor);
}

const quandoTexto = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Sem fuso fixo de propósito: o relógio do navegador é o do escritório, e é
  // o horário dele que a pessoa reconhece.
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).replace(", ", " às ");
};

const TITULOS: Record<string, string> = {
  create: "registrou o lançamento",
  update: "editou",
  delete: "excluiu",
};

export function descreverEvento(e: EventoBruto, dic: Dicionarios = {}): EventoLegivel {
  const acao = (["create", "update", "delete"].includes(e.acao) ? e.acao : "outro") as EventoLegivel["acao"];
  const mudancas: string[] = [];

  for (const [campo, m] of Object.entries(e.mudancas ?? {})) {
    if (IGNORAR.has(campo)) continue;
    const antes = valorDoCampo(campo, m?.before, dic);
    const depois = valorDoCampo(campo, m?.after, dic);
    if (antes === depois) continue;
    mudancas.push(`${rotuloCampo(campo)}: ${antes} → ${depois}`);
  }
  mudancas.sort();

  return {
    quando: e.quando,
    quandoTexto: quandoTexto(e.quando),
    quem: e.quem?.trim() || "sistema",
    acao,
    // uma edição que não sobrou nada pra mostrar (só campo ignorado) ainda é
    // uma edição — some o detalhe, não o evento
    titulo: TITULOS[acao] ?? e.acao,
    mudancas,
  };
}

/** A lista inteira, do mais antigo pro mais novo, como a RPC devolve. */
export function lerHistorico(bruto: unknown, dic: Dicionarios = {}): EventoLegivel[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((e): e is EventoBruto => !!e && typeof e === "object" && typeof (e as EventoBruto).quando === "string")
    .map((e) => descreverEvento(e, dic));
}
