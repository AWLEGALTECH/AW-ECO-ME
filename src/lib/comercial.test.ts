import { test, expect } from "bun:test";
import {
  primeiroNome, ultimosMeses, mesVizinho, porMesComercial, resumoComercial, porResponsavel, rubricasMaisFechadas,
  type FechamentoLinha,
} from "./comercial";

const f = (competencia: string, rubricas: string[], responsavel = "Adria Mota", user_id: string | null = "u1", pendencia = false): FechamentoLinha =>
  ({ data: `${competencia}-10`, competencia, rubricas, responsavel, user_id, pendencia });

test("primeiroNome junta as grafias da mesma pessoa", () => {
  expect(primeiroNome("Adria Mota")).toBe("Adria");
  expect(primeiroNome("adria")).toBe("Adria");
  expect(primeiroNome("Diego da Gama Ismael")).toBe("Diego");
  expect(primeiroNome(null)).toBe("Sem responsável");
});

test("ultimosMeses e mesVizinho cruzam a virada do ano", () => {
  expect(ultimosMeses("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  expect(mesVizinho("2026-01", -1)).toBe("2025-12");
  expect(mesVizinho("2026-12", 1)).toBe("2027-01");
});

/* A meta é em AÇÕES (rubricas), não em fechamentos. Um fechamento com três
   rubricas conta três. */
test("porMesComercial soma ações, e não fechamentos, e preenche zero", () => {
  const fs = [f("2026-08", ["A", "B", "C"]), f("2026-08", ["A"]), f("2026-06", ["A"])];
  const contratos = [
    { data_assinatura: "2026-08-03", status: "ativo" },
    { data_assinatura: "2026-07-20", status: "ativo" },
    { data_assinatura: null, status: "ativo" },
  ];
  const regras = [{ mes: "2026-08", meta_geral: "100" }, { mes: "2026-07", meta_geral: null }];
  const s = porMesComercial(fs, contratos, regras, "2026-09", 4);
  expect(s.map((m) => m.mes)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09"]);
  expect(s[2]).toMatchObject({ fechamentos: 2, acoes: 4, meta: 100, contratos: 1 });
  expect(s[1]).toMatchObject({ fechamentos: 0, acoes: 0, meta: null, contratos: 1 });
  expect(s[3]).toMatchObject({ fechamentos: 0, acoes: 0, contratos: 0 });
});

test("resumoComercial: percentual da meta, variação e contratos", () => {
  const fs = [f("2026-09", ["A", "B"]), f("2026-09", ["A"], "Diego", "u2", true), f("2026-08", ["A"])];
  const contratos = [
    { data_assinatura: "2026-09-01", status: "ativo" },
    { data_assinatura: "2026-08-02", status: "ativo" },
    { data_assinatura: "2026-09-04", status: "cancelado" },
  ];
  const r = resumoComercial(fs, contratos, [{ mes: "2026-09", meta_geral: 10 }], "2026-09");
  expect(r.fechamentos).toBe(2);
  expect(r.acoes).toBe(3);
  expect(r.pctMeta).toBe(30);
  expect(r.acoesMesAnterior).toBe(1);
  expect(r.variacao).toBe(200);
  expect(r.pendentes).toBe(1);
  expect(r.contratosNoMes).toBe(2);
  expect(r.contratosAtivos).toBe(2);
  expect(r.acoesPorFechamento).toBe(1.5);
});

/* Sem meta e sem mês anterior não se inventa zero: é "sem dado". */
test("resumoComercial sem meta e sem anterior devolve null", () => {
  const r = resumoComercial([f("2026-09", ["A"])], [], [], "2026-09");
  expect(r.pctMeta).toBeNull();
  expect(r.variacao).toBeNull();
});

/* Agrupar por user_id é o que junta "Adria" e "Adria Mota" sem depender de
   parecer com o nome; o nome vem do perfil. */
test("porResponsavel agrupa por user_id, nomeia pelo perfil e ordena por ações", () => {
  const fs = [
    f("2026-09", ["A", "B"], "Diego Ismael", "u2"),
    f("2026-09", ["A"], "Adria", "u1"),
    f("2026-09", ["A", "B", "C"], "adria mota", "u1"),
    f("2026-09", ["A"], "Fulano", null),
    f("2026-08", ["A"], "Luan", "u3"),
  ];
  const r = porResponsavel(fs, "2026-09", { u1: "Adria Mota", u2: "Diego da Gama Ismael" });
  expect(r).toEqual([
    { nome: "Adria Mota", fechamentos: 2, acoes: 4 },
    { nome: "Diego da Gama Ismael", fechamentos: 1, acoes: 2 },
    { nome: "Fulano", fechamentos: 1, acoes: 1 },
  ]);
});

test("rubricasMaisFechadas traduz pelo catálogo e corta no máximo", () => {
  const fs = [f("2026-09", ["CESTA", "MORA"]), f("2026-09", ["CESTA"]), f("2026-08", ["RMC"])];
  const r = rubricasMaisFechadas(fs, { CESTA: "Cesta de tarifas", MORA: "Mora" }, 2);
  expect(r).toEqual([{ nome: "Cesta de tarifas", n: 2 }, { nome: "Mora", n: 1 }]);
});
