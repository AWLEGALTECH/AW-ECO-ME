import { test, expect } from "bun:test";
import { escalaDaMiniatura } from "./miniaturaPdf";

test("um A4 encolhe para caber na largura pedida", () => {
  // 595 pontos é a largura de um A4 em retrato, que é o que quase todo
  // documento escaneado vira
  expect(escalaDaMiniatura(595, 120)).toBeCloseTo(0.2017, 3);
  expect(escalaDaMiniatura(595, 60)).toBeCloseTo(0.1008, 3);
});

test("NUNCA aumenta: página estreita fica no tamanho dela", () => {
  // um comprovante de meia folha ampliado ficaria borrado e gastaria mais
  // memória para mostrar menos
  expect(escalaDaMiniatura(80, 120)).toBe(1);
  expect(escalaDaMiniatura(120, 120)).toBe(1);
});

test("há um piso, senão a tela sai com zero pixel e o navegador reclama", () => {
  expect(escalaDaMiniatura(100000, 120)).toBe(0.05);
});

test("medida sem sentido não quebra a lista inteira", () => {
  expect(escalaDaMiniatura(0, 120)).toBe(1);
  expect(escalaDaMiniatura(-10, 120)).toBe(1);
  expect(escalaDaMiniatura(NaN, 120)).toBe(1);
  // largura alvo estragada cai no padrão de 120
  expect(escalaDaMiniatura(595, 0)).toBeCloseTo(0.2017, 3);
  expect(escalaDaMiniatura(595, NaN)).toBeCloseTo(0.2017, 3);
});
