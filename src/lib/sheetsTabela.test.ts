import { test, expect } from "bun:test";
import {
  chaveDaRubrica, porRubrica, montarCatalogo, montarTabela, totaisDeColuna, codigosRepartidos,
} from "./sheetsTabela";
import type { Contracheque, RubricaCC } from "./parseContracheque";

const d = (competencia: string, rubricas: RubricaCC[]): Contracheque => ({
  name: `${competencia}.pdf`, competencia, competenciaLabel: competencia,
  nome: "FULANO DE TAL", cpf: null, rubricas,
  totalReceitas: null, totalDespesas: null, totalLiquido: null, ok: true,
});
const desc = (codigo: string, descricao: string, valor: number): RubricaCC =>
  ({ codigo, descricao, tipo: "desconto", valor });

/* O CASO REAL QUE QUEBRAVA: um código, dois consignatários. É o desconto que o
   escritório persegue, e era o que sumia. */
const CONSIGNADO = [
  d("2024-01", [desc("ND0141", "EMPRESTIMO BANCO A", 100), desc("ND0141", "EMPRESTIMO BANCO B", 200)]),
  d("2024-02", [desc("ND0141", "EMPRESTIMO BANCO A", 100), desc("ND0141", "EMPRESTIMO BANCO B", 200)]),
];

test("a identidade é código E descrição, não só o código", () => {
  expect(chaveDaRubrica({ codigo: "ND0141", descricao: "EMPRESTIMO BANCO A" }))
    .not.toBe(chaveDaRubrica({ codigo: "ND0141", descricao: "EMPRESTIMO BANCO B" }));
  // espaço sobrando, acento e caixa não criam rubrica nova
  expect(chaveDaRubrica({ codigo: "nd0141", descricao: "  Empréstimo   Banco A " }))
    .toBe(chaveDaRubrica({ codigo: "ND0141", descricao: "EMPRESTIMO BANCO A" }));
});

test("dois consignatários no mesmo código viram duas rubricas, e nenhuma some", () => {
  const cat = montarCatalogo(CONSIGNADO);
  expect(cat).toHaveLength(2);
  expect(cat.map((c) => c.descricao)).toEqual(["EMPRESTIMO BANCO A", "EMPRESTIMO BANCO B"]);
  expect(cat.map((c) => c.total)).toEqual([200, 400]);
  expect(cat.map((c) => c.meses)).toEqual([2, 2]);
});

/* A GARANTIA. Era exatamente ela que estava quebrada: a lista dizia R$ 600 e a
   coluna somava R$ 400, porque o `new Map` deixava o último ganhar. */
test("o total que a lista mostra é a soma da coluna, sempre", () => {
  const cat = montarCatalogo(CONSIGNADO);
  const tab = montarTabela(CONSIGNADO, cat);
  const totais = totaisDeColuna(tab, cat.length);
  cat.forEach((c, i) => expect(totais[i]).toBe(c.total));
});

test("a mesma rubrica lançada duas vezes no mês é somada, não sobrescrita", () => {
  // parcela e retroativo do mesmo empréstimo: saíram os dois do bolso
  const docs = [d("2024-01", [desc("ND0200", "PENSAO", 50), desc("ND0200", "PENSAO", 70)])];
  expect(porRubrica(docs[0]).get(chaveDaRubrica({ codigo: "ND0200", descricao: "PENSAO" }))).toBe(120);
  const cat = montarCatalogo(docs);
  expect(cat[0].total).toBe(120);
  expect(cat[0].meses).toBe(1);
  expect(montarTabela(docs, cat)[0].celulas).toEqual([120]);
});

test("mês sem a rubrica fica vazio, e não zero", () => {
  const docs = [
    d("2024-01", [desc("ND0141", "EMPRESTIMO", 100)]),
    d("2024-02", []),
  ];
  const cat = montarCatalogo(docs);
  const tab = montarTabela(docs, cat);
  expect(tab[0].celulas).toEqual([100]);
  // vazio se lê como "não teve"; zero se leria como "teve e foi zero"
  expect(tab[1].celulas).toEqual([null]);
  expect(tab[1].totalLinha).toBe(0);
});

test("o total da linha soma só as colunas escolhidas", () => {
  const docs = [d("2024-01", [
    desc("ND0141", "EMPRESTIMO", 100),
    desc("ND0999", "OUTRA COISA", 999),
  ])];
  const cat = montarCatalogo(docs);
  const soUma = cat.filter((c) => c.codigo === "ND0141");
  expect(montarTabela(docs, soUma)[0].totalLinha).toBe(100);
});

test("as colunas saem em ordem de código, e o desempate é a descrição", () => {
  const docs = [d("2024-01", [
    desc("ND0300", "ZEBRA", 1), desc("ND0100", "COISA", 2), desc("ND0300", "ABACAXI", 3),
  ])];
  expect(montarCatalogo(docs).map((c) => `${c.codigo} ${c.descricao}`))
    .toEqual(["ND0100 COISA", "ND0300 ABACAXI", "ND0300 ZEBRA"]);
});

test("o código que virou duas rubricas é sinalizado", () => {
  const cat = montarCatalogo(CONSIGNADO);
  expect([...codigosRepartidos(cat)]).toEqual(["ND0141"]);
  const simples = montarCatalogo([d("2024-01", [desc("ND0100", "COISA", 1)])]);
  expect(codigosRepartidos(simples).size).toBe(0);
});

test("receita e desconto não se misturam nem com o mesmo texto", () => {
  const docs = [d("2024-01", [
    { codigo: "NR0001", descricao: "SOLDO", tipo: "receita", valor: 1765 },
    desc("ND0001", "FUSEX", 68.84),
  ])];
  const cat = montarCatalogo(docs);
  expect(cat.filter((c) => c.tipo === "desconto").map((c) => c.total)).toEqual([68.84]);
  expect(cat.filter((c) => c.tipo === "receita").map((c) => c.total)).toEqual([1765]);
});

test("sem contracheque nenhum não derruba nada", () => {
  expect(montarCatalogo([])).toEqual([]);
  expect(montarTabela([], [])).toEqual([]);
  expect(totaisDeColuna([], 0)).toEqual([]);
});
