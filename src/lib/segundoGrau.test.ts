import { test, expect } from "bun:test";
import { ehSegundoGrau, exigeOrgaoJulgador, normalizarOrgao, diasNoSegundoGrau } from "./segundoGrau";

test("acórdão exige câmara ou turma, o resto não", () => {
  expect(exigeOrgaoJulgador("AG. ACÓRDÃO")).toBe(true);
  expect(exigeOrgaoJulgador("AG. TJ ACÓRDÃO")).toBe(true);
  expect(exigeOrgaoJulgador("JULGADO ACÓRDÃO")).toBe(true);
  expect(exigeOrgaoJulgador("ag. acordao")).toBe(true);
  expect(exigeOrgaoJulgador("AG. DISTRIBUIÇÃO 2º GRAU")).toBe(false);
  expect(exigeOrgaoJulgador("AG. SENTENÇA")).toBe(false);
  expect(exigeOrgaoJulgador("")).toBe(false);
  expect(exigeOrgaoJulgador(null)).toBe(false);
});

test("o card de segundo grau aparece do remessa em diante", () => {
  expect(ehSegundoGrau("AG. REMESSA AO 2º GRAU")).toBe(true);
  expect(ehSegundoGrau("AG. TJ SENTENÇA")).toBe(true);
  expect(ehSegundoGrau("AG. EMBARGOS")).toBe(true);
  // recurso ainda sendo interposto é primeiro grau
  expect(ehSegundoGrau("AG. RECURSO INOMINADO")).toBe(false);
  expect(ehSegundoGrau("AG. CONTRARRAZÕES")).toBe(false);
  expect(ehSegundoGrau("SUSPENSO")).toBe(false);
});

test("órgão sai em caixa alta e sem espaço duplicado", () => {
  expect(normalizarOrgao("  2ª  turma   recursal ")).toBe("2ª TURMA RECURSAL");
  expect(normalizarOrgao("primeira câmara cível")).toBe("PRIMEIRA CÂMARA CÍVEL");
});

test("dias no segundo grau contam da data em que subiu", () => {
  const hoje = new Date(2026, 8, 9);
  expect(diasNoSegundoGrau("2026-08-08", hoje)).toBe(32);
  expect(diasNoSegundoGrau("2026-09-09", hoje)).toBe(0);
  expect(diasNoSegundoGrau("", hoje)).toBeNull();
  expect(diasNoSegundoGrau("lixo", hoje)).toBeNull();
});
