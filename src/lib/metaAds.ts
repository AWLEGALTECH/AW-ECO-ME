/* META ADS: A REGRA DOS NÚMEROS, FORA DA TELA.
 *
 * A Meta devolve os dados de campanha num formato que muda de campanha para
 * campanha: o que conta como "resultado" depende do objetivo (lead, conversa,
 * alcance), o gasto vem como texto ("55.35"), e as ações vêm numa lista de
 * pares tipo/valor onde o mesmo lead pode aparecer em três nomes diferentes.
 * Esta é a única tradução dessas coisas para o vocabulário da casa, e ela tem
 * teste. A edge function que puxa os dados e a tela que os mostra leem daqui.
 *
 * O QUE ESTE ARQUIVO NÃO FAZ: falar com a Meta. Ele só recebe o que veio de lá
 * e responde perguntas.
 */

/** Uma ação como a Graph API entrega dentro de `actions`. */
export interface AcaoMeta {
  action_type: string;
  value: string | number;
}

/** Uma linha de `meta_campanhas_diario`, do jeito que o banco devolve. */
export interface DiaDeCampanha {
  campanha_id: string;
  dia: string;              // YYYY-MM-DD
  gasto: number;
  impressoes: number;
  alcance: number;
  cliques: number;
  resultados: number;
}

export interface Campanha {
  id: string;
  nome: string;
  status: string;           // ACTIVE | PAUSED | ARCHIVED | ...
  objetivo: string | null;  // OUTCOME_LEADS | OUTCOME_TRAFFIC | ...
  orcamento_diario: number | null;
  atualizado_em?: string | null;
}

/* ── o que conta como resultado ─────────────────────────────────────────────
 *
 * A Meta mostra uma coluna "Resultados" no Gerenciador, mas ela não existe na
 * API: lá vem `actions`, e é preciso escolher qual ação é o resultado daquela
 * campanha. A escolha é pelo OBJETIVO, que é o que a pessoa configurou.
 *
 * Os nomes são listas porque o mesmo evento aparece com nomes diferentes
 * conforme a origem (pixel do site, formulário nativo, conversão
 * personalizada). Somar os três não dobra a conta: cada lead entra numa
 * dessas chaves, não em todas.
 */
const RESULTADO_POR_OBJETIVO: Record<string, string[]> = {
  OUTCOME_LEADS: ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped", "leadgen_grouped"],
  LEAD_GENERATION: ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped", "leadgen_grouped"],
  OUTCOME_ENGAGEMENT: ["onsite_conversion.messaging_conversation_started_7d", "post_engagement"],
  MESSAGES: ["onsite_conversion.messaging_conversation_started_7d"],
  OUTCOME_TRAFFIC: ["link_click"],
  LINK_CLICKS: ["link_click"],
  OUTCOME_AWARENESS: [],       // resultado é alcance, que já é coluna própria
  REACH: [],
  OUTCOME_SALES: ["purchase", "offsite_conversion.fb_pixel_purchase"],
};

/** O nome curto do que a campanha conta, para a tela dizer "43 leads" em vez de "43". */
export function rotuloDoResultado(objetivo: string | null | undefined): string {
  const o = String(objetivo ?? "").toUpperCase();
  if (o.includes("LEAD")) return "leads";
  if (o.includes("ENGAGEMENT") || o === "MESSAGES") return "conversas";
  if (o.includes("TRAFFIC") || o === "LINK_CLICKS") return "cliques no link";
  if (o.includes("AWARENESS") || o === "REACH") return "alcance";
  if (o.includes("SALES")) return "vendas";
  return "resultados";
}

/** Converte "55.35" / 55.35 / "" / undefined em número, sem NaN. */
export function numero(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Quantos resultados uma linha de insight tem, dado o objetivo da campanha.
 *
 * Sem objetivo conhecido, conta os leads: é o que noventa por cento das
 * campanhas da casa fazem, e errar para lead é melhor que devolver zero.
 */
export function resultadosDe(acoes: AcaoMeta[] | null | undefined, objetivo: string | null | undefined): number {
  const chaves = RESULTADO_POR_OBJETIVO[String(objetivo ?? "").toUpperCase()] ?? RESULTADO_POR_OBJETIVO.OUTCOME_LEADS;
  if (chaves.length === 0) return 0;
  return (acoes ?? [])
    .filter((a) => chaves.includes(a.action_type))
    .reduce((s, a) => s + numero(a.value), 0);
}

/* ── as contas da tela ─────────────────────────────────────────────────────── */

export interface Totais {
  gasto: number;
  impressoes: number;
  alcance: number;
  cliques: number;
  resultados: number;
  /** custo por resultado; null quando não houve resultado (dividir por zero não é zero) */
  custoPorResultado: number | null;
  /** cliques / impressões, em %; null sem impressão */
  ctr: number | null;
  /** gasto / (impressões / 1000); null sem impressão */
  cpm: number | null;
}

export function somar(dias: DiaDeCampanha[]): Totais {
  const t = dias.reduce(
    (acc, d) => ({
      gasto: acc.gasto + numero(d.gasto),
      impressoes: acc.impressoes + numero(d.impressoes),
      alcance: acc.alcance + numero(d.alcance),
      cliques: acc.cliques + numero(d.cliques),
      resultados: acc.resultados + numero(d.resultados),
    }),
    { gasto: 0, impressoes: 0, alcance: 0, cliques: 0, resultados: 0 },
  );
  return {
    ...t,
    custoPorResultado: t.resultados > 0 ? t.gasto / t.resultados : null,
    ctr: t.impressoes > 0 ? (t.cliques / t.impressoes) * 100 : null,
    cpm: t.impressoes > 0 ? (t.gasto / t.impressoes) * 1000 : null,
  };
}

/** Só os dias dentro da janela, contando de hoje para trás (inclusive). */
export function ultimosDias<T extends { dia: string }>(linhas: T[], dias: number, hoje = new Date()): T[] {
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - (dias - 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const a = iso(inicio), b = iso(fim);
  return linhas.filter((l) => l.dia >= a && l.dia <= b);
}

/**
 * A série do gráfico: um ponto por dia, com os dias sem linha preenchidos com
 * zero. Sem isso o gráfico "pula" os dias em que a campanha não rodou, e o
 * buraco fica invisível, que é o oposto do que se quer ver.
 */
export function seriePorDia(linhas: DiaDeCampanha[], dias: number, hoje = new Date()): { dia: string; gasto: number; resultados: number; cliques: number }[] {
  const fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const mapa = new Map<string, { gasto: number; resultados: number; cliques: number }>();
  for (const l of linhas) {
    const atual = mapa.get(l.dia) ?? { gasto: 0, resultados: 0, cliques: 0 };
    mapa.set(l.dia, {
      gasto: atual.gasto + numero(l.gasto),
      resultados: atual.resultados + numero(l.resultados),
      cliques: atual.cliques + numero(l.cliques),
    });
  }
  const saida: { dia: string; gasto: number; resultados: number; cliques: number }[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(fim);
    d.setDate(d.getDate() - i);
    const chave = d.toISOString().slice(0, 10);
    saida.push({ dia: chave, ...(mapa.get(chave) ?? { gasto: 0, resultados: 0, cliques: 0 }) });
  }
  return saida;
}

/* ── o alerta que a integração existe para dar ────────────────────────────── */

/**
 * Campanha marcada ACTIVE que não gastou nada nos últimos N dias.
 *
 * É o caso real de 21/09/2026: a única campanha ativa da conta parou de rodar
 * no dia 16 (R$ 55 → R$ 32 → R$ 0,10 → zero) e o Gerenciador continuava
 * dizendo "Ativa". Por dentro pode ser saldo, cartão, conjunto pausado ou
 * rejeição de anúncio; por fora é a mesma coisa: ninguém está vendo o anúncio
 * e ninguém foi avisado. Dois dias de silêncio numa campanha que gastava
 * todo dia já é anormal.
 */
export function ativaSemGastar(campanha: Campanha, dias: DiaDeCampanha[], janelaDias = 2, hoje = new Date()): boolean {
  if (String(campanha.status).toUpperCase() !== "ACTIVE") return false;
  const dela = dias.filter((d) => d.campanha_id === campanha.id);
  if (dela.length === 0) return false;             // nunca rodou aqui: não há o que comparar
  const recentes = ultimosDias(dela, janelaDias, hoje);
  const gastouRecente = recentes.some((d) => numero(d.gasto) > 0);
  if (gastouRecente) return false;
  // Só alarma se ela JÁ gastou alguma vez: campanha ativa que nunca gastou
  // pode estar em análise ou agendada, e isso não é defeito.
  return dela.some((d) => numero(d.gasto) > 0);
}

/** "R$ 1,37" */
export const brl = (v: number | null | undefined) =>
  v == null ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "13.285" */
export const inteiro = (v: number | null | undefined) =>
  v == null ? "" : Math.round(v).toLocaleString("pt-BR");

/** Status da Meta em português, sem inventar estados que não existem lá. */
export function rotuloDoStatus(status: string | null | undefined): string {
  const s = String(status ?? "").toUpperCase();
  if (s === "ACTIVE") return "Ativa";
  if (s === "PAUSED") return "Pausada";
  if (s === "ARCHIVED") return "Arquivada";
  if (s === "DELETED") return "Excluída";
  if (s === "IN_PROCESS") return "Processando";
  if (s === "WITH_ISSUES") return "Com problema";
  return s ? s.charAt(0) + s.slice(1).toLowerCase() : "";
}
