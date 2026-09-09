import { test, expect } from "bun:test";
import {
  taxa, resumo, porMateria, porRequerido, porMes, rotuloDoMes, type LinhaDesfecho, type Desfecho,
} from "./procedencia";

const linha = (desfecho: Desfecho, extra: Partial<LinhaDesfecho> = {}): LinhaDesfecho => ({
  materia: "DÉBITOS AUTOMÁTICOS", requeridos: ["BANCO_BRADESCO"], fase_processual: null,
  desfecho, dt_desfecho: "2026-08-10", executado: false, valor_sentenca: null, no_tracker: false,
  ...extra,
});

/* Taxa sem denominador não é 0%, é "não sei". Um 0% aqui faria uma matéria
   recém-ajuizada parecer uma matéria perdida. */
test("taxa sem decisão é null, não zero", () => {
  expect(taxa(0, 0)).toBeNull();
  expect(taxa(3, 1)).toBe(75);
  expect(taxa(1, 2)).toBe(33);
});

/* O ponto todo da regra: acordo, sem mérito, pago e em andamento NÃO entram no
   denominador. Aqui são 2 ganhos e 2 perdas = 50%, e as outras quatro linhas não
   mexem no número. */
test("só o decidido no mérito entra na taxa", () => {
  const r = resumo([
    linha("procedente"), linha("parcial"), linha("improcedente"), linha("improcedente"),
    linha("acordo"), linha("sem_merito"), linha("pago_sem_sentenca"), linha("em_andamento"),
  ]);
  expect(r.total).toBe(8);
  expect(r.decididos).toBe(4);
  expect(r.ganhos).toBe(2);
  expect(r.taxa).toBe(50);
  expect(r.acordos).toBe(1);
  expect(r.semMerito).toBe(1);
  expect(r.pagosSemSentenca).toBe(1);
  expect(r.emAndamento).toBe(1);
});

test("parcial conta como ganho", () => {
  expect(resumo([linha("parcial"), linha("parcial")]).taxa).toBe(100);
});

test("suspenso é o em andamento com fase SUSPENSO", () => {
  const r = resumo([
    linha("em_andamento", { fase_processual: "SUSPENSO" }),
    linha("em_andamento", { fase_processual: "AG. SENTENÇA" }),
  ]);
  expect(r.suspensos).toBe(1);
  expect(r.emAndamento).toBe(2);
});

test("valor ganho soma as sentenças, aceitando numeric como string", () => {
  const r = resumo([linha("procedente", { valor_sentenca: "1500.50" }), linha("parcial", { valor_sentenca: 500 })]);
  expect(r.valorGanho).toBe(2000.5);
});

test("vitória fora do Tracker é contada", () => {
  const r = resumo([linha("procedente", { no_tracker: true }), linha("procedente", { no_tracker: false }), linha("improcedente", { no_tracker: false })]);
  expect(r.ganhosForaDoTracker).toBe(1);
});

/* Matéria com um processo tem taxa de 0% ou 100%, e nenhum dos dois informa
   nada. Abaixo do corte elas somam em OUTRAS, que continua contando no total. */
test("porMateria dobra a cauda em OUTRAS e mantém o total", () => {
  const rows = [
    linha("procedente"), linha("improcedente"), linha("procedente"),          // DÉBITOS: 3
    linha("improcedente", { materia: "TARIFAS BANCÁRIAS" }),                  // 1
    linha("procedente", { materia: "ANUIDADE CARTÃO" }),                      // 1
    linha("em_andamento", { materia: "SEGURO" }),                             // não decidido: não conta
  ];
  const f = porMateria(rows, 3);
  expect(f.map((x) => x.nome)).toEqual(["DÉBITOS AUTOMÁTICOS", "OUTRAS (2)"]);
  expect(f[0].taxa).toBe(67);
  expect(f[1].decididos).toBe(2);
  expect(f[1].taxa).toBe(50);
  expect(f.reduce((s, x) => s + x.decididos, 0)).toBe(5);
});

test("porMateria sem cauda não inventa OUTRAS", () => {
  const f = porMateria([linha("procedente"), linha("procedente"), linha("improcedente")], 3);
  expect(f).toHaveLength(1);
});

/* Litisconsórcio: o processo conta para cada réu, porque cada réu o enfrentou. */
test("porRequerido traduz chave em nome e conta o litisconsórcio nos dois", () => {
  const nomes = { BANCO_BRADESCO: "BANCO BRADESCO", DETRAN_AM: "DETRAN/AM", ESTADO: "ESTADO DO AMAZONAS" };
  const f = porRequerido([
    linha("procedente"),
    linha("improcedente", { requeridos: ["DETRAN_AM", "ESTADO"] }),
  ], nomes);
  expect(f.map((x) => x.nome).sort()).toEqual(["BANCO BRADESCO", "DETRAN/AM", "ESTADO DO AMAZONAS"]);
  expect(f.find((x) => x.nome === "DETRAN/AM")?.improcedentes).toBe(1);
});

test("porMes ordena cronologicamente e rotula em português", () => {
  const m = porMes([
    linha("procedente", { dt_desfecho: "2026-08-03" }),
    linha("improcedente", { dt_desfecho: "2026-07-20" }),
    linha("improcedente", { dt_desfecho: "2026-08-15" }),
    linha("acordo", { dt_desfecho: "2026-08-20" }),          // fora do mérito: não conta
    linha("procedente", { dt_desfecho: null }),               // sem data: não tem mês
  ]);
  expect(m.map((x) => x.rotulo)).toEqual(["jul/26", "ago/26"]);
  expect(m[1]).toMatchObject({ ganhos: 1, perdidos: 1, taxa: 50 });
});

test("rotuloDoMes", () => {
  expect(rotuloDoMes("2025-11")).toBe("nov/25");
  expect(rotuloDoMes("xxxx")).toBe("xxxx");
});
