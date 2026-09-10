/* DO CONTRACHEQUE LIDO ATÉ A TABELA, sem passar pela tela.
 *
 * A lista de rubricas dizia uma coisa e a tabela mostrava outra. Quem escolhia
 * "ND0141 EMPRÉSTIMO, 12 meses, R$ 3.600" via na célula R$ 100, e não tinha
 * como saber de onde aquele número saiu.
 *
 * ─────────────────────────── a causa ────────────────────────────────────────
 *
 * O CÓDIGO NÃO IDENTIFICA UMA RUBRICA. Num contracheque militar o mesmo código
 * se repete para consignatários diferentes, que é justamente o desconto que
 * este escritório persegue:
 *
 *     ND0141  EMPRESTIMO BANCO A     100,00
 *     ND0141  EMPRESTIMO BANCO B     200,00
 *
 * A lista somava os dois (R$ 300, parecia certo) e a tabela montava um
 * `new Map(rubricas.map(r => [r.codigo, r.valor]))`, onde **a chave repetida
 * faz o último ganhar**: a célula ficava com 200 e os 100 sumiam sem aviso. Em
 * doze meses, um empréstimo inteiro desaparecia da conta.
 *
 * Aqui a identidade é CÓDIGO + DESCRIÇÃO, e a repetição de verdade (a mesma
 * rubrica lançada duas vezes no mesmo mês) é SOMADA em vez de sobrescrita.
 *
 * ─── a garantia que os testes trancam ───────────────────────────────────────
 *
 * Para toda rubrica escolhida, o total que a lista mostra é igual à soma da
 * coluna dela na tabela. Sem isso, as duas telas podem divergir de novo e
 * ninguém percebe até alguém somar à mão.
 */
import type { Contracheque, RubricaCC } from "@/lib/parseContracheque";

export interface ItemCatalogo {
  /** identidade de verdade: código E descrição */
  chave: string;
  codigo: string;
  descricao: string;
  tipo: "receita" | "desconto";
  /** em quantos contracheques ela aparece */
  meses: number;
  /** somando todos os contracheques */
  total: number;
}

export interface LinhaDaTabela {
  doc: Contracheque;
  /** um valor por coluna, na ordem delas; `null` quando não houve no mês */
  celulas: (number | null)[];
  totalLinha: number;
}

/** Espaço sobrando e caixa não fazem duas rubricas diferentes. */
const normalizar = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim();

export function chaveDaRubrica(r: Pick<RubricaCC, "codigo" | "descricao">): string {
  return `${(r.codigo || "").toUpperCase().trim()}|${normalizar(r.descricao)}`;
}

/**
 * As rubricas de UM contracheque somadas por identidade.
 *
 * Somar e não sobrescrever: a mesma rubrica lançada duas vezes no mesmo mês
 * (parcelas, retroativos) é dinheiro descontado duas vezes, e a célula tem que
 * dizer quanto saiu do bolso, não quanto saiu na última linha.
 */
export function porRubrica(d: Contracheque): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of d.rubricas ?? []) {
    const k = chaveDaRubrica(r);
    m.set(k, (m.get(k) ?? 0) + r.valor);
  }
  return m;
}

/** A união das rubricas de todos os contracheques, em ordem de código. */
export function montarCatalogo(docs: Contracheque[]): ItemCatalogo[] {
  const m = new Map<string, ItemCatalogo>();
  for (const d of docs) {
    for (const [chave, valor] of porRubrica(d)) {
      const r = (d.rubricas ?? []).find((x) => chaveDaRubrica(x) === chave)!;
      const e = m.get(chave) ?? {
        chave, codigo: r.codigo, descricao: r.descricao, tipo: r.tipo, meses: 0, total: 0,
      };
      e.total += valor;
      // Uma vez por contracheque: `porRubrica` já juntou as repetições do mês.
      e.meses += 1;
      m.set(chave, e);
    }
  }
  return [...m.values()].sort((a, b) =>
    a.codigo.localeCompare(b.codigo, "pt-BR") || a.descricao.localeCompare(b.descricao, "pt-BR"));
}

/** Meses nas linhas, rubricas escolhidas nas colunas. */
export function montarTabela(docs: Contracheque[], colunas: ItemCatalogo[]): LinhaDaTabela[] {
  return docs.map((d) => {
    const valores = porRubrica(d);
    const celulas = colunas.map((c) => valores.get(c.chave) ?? null);
    return { doc: d, celulas, totalLinha: celulas.reduce((s: number, v) => s + (v ?? 0), 0) };
  });
}

export function totaisDeColuna(tabela: LinhaDaTabela[], nColunas: number): number[] {
  return Array.from({ length: nColunas }, (_, i) =>
    tabela.reduce((s, l) => s + (l.celulas[i] ?? 0), 0));
}

/**
 * O mesmo código com descrições diferentes, que é o caso que quebrava tudo.
 * A tela usa para avisar que aquelas duas linhas são duas coisas, e não uma
 * repetida por engano.
 */
export function codigosRepartidos(catalogo: ItemCatalogo[]): Set<string> {
  const conta = new Map<string, number>();
  for (const c of catalogo) conta.set(c.codigo, (conta.get(c.codigo) ?? 0) + 1);
  return new Set([...conta].filter(([, n]) => n > 1).map(([cod]) => cod));
}
