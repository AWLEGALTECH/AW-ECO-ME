import { test, expect, mock } from "bun:test";

/* A ponte importa o cliente do Supabase; aqui só interessam as regras puras,
   então o cliente vira um objeto vazio. */
mock.module("@/integrations/supabase/client", () => ({ supabase: {} }));
const { descricaoDaVinculada, caminhoDaPlanilha, contarVinculados, SEPARADOR_DE_DESCONTOS } = await import("./ponteAw");

test("a descrição da vinculada tem o formato que a esteira já mostra", () => {
  expect(descricaoDaVinculada(10, 283.2)).toBe("10 lançamento(s) · total R$ 283,20");
  expect(descricaoDaVinculada(2, null)).toBe("2 lançamento(s)");
  expect(descricaoDaVinculada(null, 50)).toBeNull();
});

test("o nome da planilha no bucket: carimbo, sorteio e nome limpo", () => {
  const c = caminhoDaPlanilha("Pacotes e Cestas.xlsx", 1790379136137, 0.123456789);
  expect(c.startsWith("1790379136137-")).toBe(true);
  expect(c.endsWith("-Pacotes_e_Cestas.xlsx")).toBe(true);
  expect(caminhoDaPlanilha(null, 1, 0.5)).toMatch(/^1-[a-z0-9]+-analise\.xlsx$/);
});

test("vinculados: cada rubrica conta uma vez por demanda, quebrando por ' + '", () => {
  expect(SEPARADOR_DE_DESCONTOS).toBe(" + ");
  const m = contarVinculados([
    { desconto: "Encargos + Pacotes e Cestas" },
    { desconto: "Encargos" },
    { desconto: null },
  ]);
  expect(m.get("Encargos")).toBe(2);
  expect(m.get("Pacotes e Cestas")).toBe(1);
  expect(m.size).toBe(2);
});
