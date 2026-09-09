/* MÉTRICAS COMERCIAIS, a partir dos fechamentos e dos contratos.
 *
 * O fechamento é a unidade do time comercial: um cliente fechado numa data,
 * com uma ou mais AÇÕES (as rubricas). Um fechamento com três rubricas são
 * três ações. A meta do mês (`fechamentos_meses.meta_geral`) é contada em
 * ações, então aqui "ações" é o número que se compara com a meta.
 *
 * O CONTRATO é o documento assinado depois. Fechamento e contrato não são a
 * mesma coisa nem o mesmo dia; aparecem lado a lado, como duas séries.
 *
 * O QUE NÃO ENTRA, DE PROPÓSITO:
 *   `fechamentos.valor_acao` não é receita, é a comissão por ação (R$ 5).
 *   `contratos.valor_total` está vazio em 95 dos 100 contratos. Um "valor
 *   contratado" somado a partir de 5 linhas seria um número que parece total
 *   e não é. Quando o campo for preenchido, a métrica volta.
 */
import { rotuloDoMes } from "./procedencia";

export interface FechamentoLinha {
  data: string | null;
  competencia: string;
  rubricas: string[] | null;
  responsavel: string | null;
  user_id: string | null;
  pendencia: boolean | null;
}

export interface RegraMesLinha {
  mes: string;
  meta_geral: number | string | null;
}

export interface ContratoLinha {
  data_assinatura: string | null;
  status: string | null;
}

const acoesDe = (f: FechamentoLinha) => f.rubricas?.length ?? 0;
const num = (v: number | string | null | undefined) => Number(v) || 0;

/**
 * Primeiro nome, para quando não há `user_id`. O campo `responsavel` é texto
 * livre e a mesma pessoa aparece como "Adria" e "Adria Mota". Hoje todo
 * fechamento tem `user_id`, então isto é só a rede de segurança.
 */
export function primeiroNome(responsavel: string | null | undefined): string {
  const t = (responsavel ?? "").trim();
  if (!t) return "Sem responsável";
  const p = t.split(/\s+/)[0];
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

/** "2026-09" para um ISO "2026-09-08". */
export const mesDe = (iso: string) => iso.slice(0, 7);

/** Os últimos `n` meses terminando em `ate` (inclusive), do mais antigo ao mais novo. */
export function ultimosMeses(ate: string, n: number): string[] {
  const [a, m] = ate.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** O mês seguinte e o anterior, para navegar. */
export function mesVizinho(mes: string, passo: 1 | -1): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + passo, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface MesComercial {
  mes: string;
  rotulo: string;
  fechamentos: number;
  acoes: number;
  meta: number | null;
  contratos: number;
}

/** Série mensal fechada nos últimos `n` meses, com zero onde não houve nada. */
export function porMesComercial(
  fs: FechamentoLinha[], contratos: ContratoLinha[], regras: RegraMesLinha[], mesAtual: string, n = 12,
): MesComercial[] {
  const meses = ultimosMeses(mesAtual, n);
  const metas = new Map(regras.map((r) => [r.mes, r.meta_geral == null ? null : num(r.meta_geral)]));
  const base = new Map<string, MesComercial>(meses.map((mes) => [mes, {
    mes, rotulo: rotuloDoMes(mes), fechamentos: 0, acoes: 0, meta: metas.get(mes) ?? null, contratos: 0,
  }]));
  for (const f of fs) {
    const b = base.get(f.competencia);
    if (!b) continue;
    b.fechamentos++;
    b.acoes += acoesDe(f);
  }
  for (const c of contratos) {
    if (!c.data_assinatura) continue;
    const b = base.get(mesDe(c.data_assinatura));
    if (b) b.contratos++;
  }
  return meses.map((m) => base.get(m)!);
}

export interface ResumoComercial {
  mes: string;
  fechamentos: number;
  acoes: number;
  meta: number | null;
  /** 0..100+, ou null sem meta */
  pctMeta: number | null;
  acoesMesAnterior: number;
  /** variação percentual de ações contra o mês anterior; null se o anterior foi zero */
  variacao: number | null;
  pendentes: number;
  contratosNoMes: number;
  contratosAtivos: number;
  acoesPorFechamento: number | null;
}

export function resumoComercial(
  fs: FechamentoLinha[], contratos: ContratoLinha[], regras: RegraMesLinha[], mesAtual: string,
): ResumoComercial {
  const doMes = fs.filter((f) => f.competencia === mesAtual);
  const anterior = ultimosMeses(mesAtual, 2)[0];
  const doAnterior = fs.filter((f) => f.competencia === anterior);
  const acoes = doMes.reduce((s, f) => s + acoesDe(f), 0);
  const acoesAnt = doAnterior.reduce((s, f) => s + acoesDe(f), 0);
  const regra = regras.find((r) => r.mes === mesAtual);
  const meta = regra?.meta_geral == null ? null : num(regra.meta_geral);
  return {
    mes: mesAtual,
    fechamentos: doMes.length,
    acoes,
    meta,
    pctMeta: meta && meta > 0 ? Math.round((100 * acoes) / meta) : null,
    acoesMesAnterior: acoesAnt,
    variacao: acoesAnt === 0 ? null : Math.round((100 * (acoes - acoesAnt)) / acoesAnt),
    pendentes: doMes.filter((f) => f.pendencia).length,
    contratosNoMes: contratos.filter((c) => c.data_assinatura && mesDe(c.data_assinatura) === mesAtual).length,
    contratosAtivos: contratos.filter((c) => (c.status ?? "ativo") === "ativo").length,
    acoesPorFechamento: doMes.length ? Math.round((10 * acoes) / doMes.length) / 10 : null,
  };
}

export interface ResponsavelComercial { nome: string; fechamentos: number; acoes: number }

/**
 * Quem fechou no mês, mais ações primeiro.
 *
 * Agrupa por `user_id` e mostra o nome do perfil: é o identificador que não
 * varia com a grafia. Sem `user_id`, cai no primeiro nome do campo livre.
 */
export function porResponsavel(
  fs: FechamentoLinha[], mes: string, nomes: Record<string, string> = {},
): ResponsavelComercial[] {
  const m = new Map<string, ResponsavelComercial>();
  for (const f of fs) {
    if (f.competencia !== mes) continue;
    const chave = f.user_id ?? `nome:${primeiroNome(f.responsavel)}`;
    const nome = (f.user_id && nomes[f.user_id]) || primeiroNome(f.responsavel);
    const r = m.get(chave) ?? { nome, fechamentos: 0, acoes: 0 };
    r.fechamentos++;
    r.acoes += acoesDe(f);
    m.set(chave, r);
  }
  return [...m.values()].sort((a, b) => b.acoes - a.acoes || a.nome.localeCompare(b.nome));
}

/** As rubricas mais fechadas no período, com rótulo do catálogo quando houver. */
export function rubricasMaisFechadas(
  fs: FechamentoLinha[], rotulos: Record<string, string>, maximo = 10,
): { nome: string; n: number }[] {
  const m = new Map<string, number>();
  for (const f of fs) for (const r of f.rubricas ?? []) m.set(r, (m.get(r) ?? 0) + 1);
  return [...m.entries()]
    .map(([k, n]) => ({ nome: rotulos[k] ?? k, n }))
    .sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome))
    .slice(0, maximo);
}
