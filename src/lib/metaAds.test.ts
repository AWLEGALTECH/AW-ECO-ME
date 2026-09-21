import { test, expect } from "bun:test";
import {
  numero, resultadosDe, rotuloDoResultado, somar, ultimosDias, seriePorDia,
  ativaSemGastar, rotuloDoStatus, type DiaDeCampanha, type Campanha,
} from "./metaAds";

/* OS NÚMEROS DA META CHEGAM COMO TEXTO, e o "resultado" não existe na API: é
   uma escolha entre as ações, feita pelo objetivo. Errar aqui é mostrar um
   custo por lead errado para quem decide quanto investir amanhã. */

const dia = (o: Partial<DiaDeCampanha> = {}): DiaDeCampanha => ({
  campanha_id: "c1", dia: "2026-09-14", gasto: 0, impressoes: 0, alcance: 0, cliques: 0, resultados: 0, ...o,
});

test("texto com ponto, número e vazio viram número sem NaN", () => {
  expect(numero("55.35")).toBe(55.35);
  expect(numero("32,40")).toBe(32.4);
  expect(numero(43)).toBe(43);
  expect(numero("")).toBe(0);
  expect(numero(undefined)).toBe(0);
  expect(numero("Not available")).toBe(0);
});

test("campanha de leads conta o lead do pixel, e só ele", () => {
  /* É a campanha real do Bradesco: a Meta devolve o lead ao lado de cliques
     no link, visualizações de página e afins. Só o lead é resultado. */
  const acoes = [
    { action_type: "link_click", value: "105" },
    { action_type: "landing_page_view", value: "80" },
    { action_type: "offsite_conversion.fb_pixel_lead", value: "43" },
  ];
  expect(resultadosDe(acoes, "OUTCOME_LEADS")).toBe(43);
});

test("lead do formulário nativo e lead do pixel somam, porque são leads diferentes", () => {
  const acoes = [
    { action_type: "offsite_conversion.fb_pixel_lead", value: "40" },
    { action_type: "onsite_conversion.lead_grouped", value: "3" },
  ];
  expect(resultadosDe(acoes, "OUTCOME_LEADS")).toBe(43);
});

test("campanha de tráfego conta clique no link, e ignora lead", () => {
  const acoes = [
    { action_type: "link_click", value: "105" },
    { action_type: "offsite_conversion.fb_pixel_lead", value: "43" },
  ];
  expect(resultadosDe(acoes, "OUTCOME_TRAFFIC")).toBe(105);
});

test("alcance não tem ação: o resultado é a coluna própria, aqui vale zero", () => {
  expect(resultadosDe([{ action_type: "link_click", value: "9" }], "OUTCOME_AWARENESS")).toBe(0);
});

test("sem objetivo conhecido, conta como lead", () => {
  // É o que quase toda campanha da casa é, e errar para lead é melhor que zero.
  expect(resultadosDe([{ action_type: "lead", value: "7" }], null)).toBe(7);
  expect(resultadosDe([{ action_type: "lead", value: "7" }], "OBJETIVO_NOVO_DA_META")).toBe(7);
});

test("sem ações, zero e não erro", () => {
  expect(resultadosDe(null, "OUTCOME_LEADS")).toBe(0);
  expect(resultadosDe([], "OUTCOME_LEADS")).toBe(0);
});

test("o rótulo do resultado fala a língua da tela", () => {
  expect(rotuloDoResultado("OUTCOME_LEADS")).toBe("leads");
  expect(rotuloDoResultado("OUTCOME_TRAFFIC")).toBe("cliques no link");
  expect(rotuloDoResultado("OUTCOME_AWARENESS")).toBe("alcance");
  expect(rotuloDoResultado("MESSAGES")).toBe("conversas");
  expect(rotuloDoResultado(null)).toBe("resultados");
});

/* ── as contas ── */

test("os totais somam e derivam as razões", () => {
  const t = somar([
    dia({ gasto: 55.35, impressoes: 2476, alcance: 2000, cliques: 105, resultados: 43 }),
    dia({ dia: "2026-09-15", gasto: 32.4, impressoes: 1458, alcance: 1300, cliques: 72, resultados: 44 }),
  ]);
  expect(t.gasto).toBeCloseTo(87.75, 2);
  expect(t.resultados).toBe(87);
  expect(t.custoPorResultado).toBeCloseTo(1.0086, 3);
  expect(t.ctr).toBeCloseTo((177 / 3934) * 100, 3);
  expect(t.cpm).toBeCloseTo((87.75 / 3934) * 1000, 3);
});

test("sem resultado, o custo por resultado é nulo, e não zero nem infinito", () => {
  /* R$ 50 gastos e zero leads: o CPL não é R$ 0. É "não houve lead", e a
     tela precisa poder dizer isso em vez de mostrar um número bom mentiroso. */
  const t = somar([dia({ gasto: 50, impressoes: 100, cliques: 3, resultados: 0 })]);
  expect(t.custoPorResultado).toBeNull();
  expect(t.ctr).toBe(3);
});

test("sem impressão, CTR e CPM são nulos", () => {
  const t = somar([dia({ gasto: 0 })]);
  expect(t.ctr).toBeNull();
  expect(t.cpm).toBeNull();
});

test("a janela conta de hoje para trás, inclusive", () => {
  const hoje = new Date(2026, 8, 21); // 21/09
  const linhas = [
    dia({ dia: "2026-09-14" }), dia({ dia: "2026-09-15" }),
    dia({ dia: "2026-09-20" }), dia({ dia: "2026-09-21" }),
  ];
  expect(ultimosDias(linhas, 7, hoje).map((l) => l.dia)).toEqual(["2026-09-15", "2026-09-20", "2026-09-21"]);
  expect(ultimosDias(linhas, 2, hoje).map((l) => l.dia)).toEqual(["2026-09-20", "2026-09-21"]);
});

test("a série do gráfico preenche os dias vazios com zero", () => {
  /* Sem isso o gráfico pula os dias em que a campanha não rodou e o buraco
     fica invisível, que é o oposto do que se quer ver. */
  const hoje = new Date(2026, 8, 17);
  const s = seriePorDia([
    dia({ dia: "2026-09-14", gasto: 55.35, resultados: 43 }),
    dia({ dia: "2026-09-15", gasto: 32.4, resultados: 44 }),
  ], 4, hoje);
  expect(s.map((p) => p.dia)).toEqual(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"]);
  expect(s[2]).toEqual({ dia: "2026-09-16", gasto: 0, resultados: 0, cliques: 0 });
});

test("duas campanhas no mesmo dia somam num ponto só", () => {
  const hoje = new Date(2026, 8, 14);
  const s = seriePorDia([
    dia({ campanha_id: "a", gasto: 10, resultados: 1 }),
    dia({ campanha_id: "b", gasto: 5, resultados: 2 }),
  ], 1, hoje);
  expect(s).toEqual([{ dia: "2026-09-14", gasto: 15, resultados: 3, cliques: 0 }]);
});

/* ── o alerta ── */

const bradesco: Campanha = { id: "c1", nome: "[LEADS] Bradesco", status: "ACTIVE", objetivo: "OUTCOME_LEADS", orcamento_diario: 50 };

test("ativa que gastava e parou: alarma", () => {
  /* O caso real de 21/09: R$ 55, R$ 32, R$ 0,10 e depois nada, com a Meta
     dizendo "Ativa". */
  const hoje = new Date(2026, 8, 21);
  const dias = [
    dia({ dia: "2026-09-14", gasto: 55.35 }), dia({ dia: "2026-09-15", gasto: 32.4 }),
    dia({ dia: "2026-09-16", gasto: 0.1 }), dia({ dia: "2026-09-17" }),
    dia({ dia: "2026-09-18" }), dia({ dia: "2026-09-19" }), dia({ dia: "2026-09-20" }),
  ];
  expect(ativaSemGastar(bradesco, dias, 2, hoje)).toBe(true);
});

test("ativa gastando normalmente: não alarma", () => {
  const hoje = new Date(2026, 8, 21);
  expect(ativaSemGastar(bradesco, [dia({ dia: "2026-09-20", gasto: 40 })], 2, hoje)).toBe(false);
});

test("pausada não alarma, por mais que esteja parada", () => {
  const hoje = new Date(2026, 8, 21);
  const dias = [dia({ dia: "2026-09-14", gasto: 55 }), dia({ dia: "2026-09-20" })];
  expect(ativaSemGastar({ ...bradesco, status: "PAUSED" }, dias, 2, hoje)).toBe(false);
});

test("ativa que nunca gastou não alarma: pode estar em análise", () => {
  const hoje = new Date(2026, 8, 21);
  expect(ativaSemGastar(bradesco, [dia({ dia: "2026-09-20" }), dia({ dia: "2026-09-21" })], 2, hoje)).toBe(false);
  expect(ativaSemGastar(bradesco, [], 2, hoje)).toBe(false);
});

test("o status vem em português, sem inventar estado", () => {
  expect(rotuloDoStatus("ACTIVE")).toBe("Ativa");
  expect(rotuloDoStatus("PAUSED")).toBe("Pausada");
  expect(rotuloDoStatus("WITH_ISSUES")).toBe("Com problema");
  expect(rotuloDoStatus("ALGO_NOVO")).toBe("Algo_novo");
});
