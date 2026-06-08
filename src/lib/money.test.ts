import { test, expect } from "bun:test";
import { parseMoneyBR } from "./money";

const casos: [string | number | null | undefined, number][] = [
  // O bug original: String(number) pré-preenchido (ponto decimal) NÃO pode inflar
  ["15772.66", 15772.66],
  ["10202.42", 10202.42],
  ["2242.02", 2242.02],
  ["3361.2", 3361.2],
  // Formato BR digitado
  ["15.772,66", 15772.66],
  ["1.234,56", 1234.56],
  ["15772,66", 15772.66],
  ["3361,2", 3361.2],
  // Milhar sem decimal
  ["1.577.266", 1577266],
  ["1,577,266", 1577266],
  ["1.577", 1577],
  // US misto
  ["1,234.56", 1234.56],
  // Sem separador
  ["1577266", 1577266],
  ["0", 0],
  // Com símbolo e espaços
  ["R$ 1.234,56", 1234.56],
  ["  R$15772.66 ", 15772.66],
  // Número direto e vazios
  [15772.66, 15772.66],
  [0, 0],
  ["", 0],
  [null, 0],
  [undefined, 0],
  // Negativo
  ["-1.234,56", -1234.56],
];

test("parseMoneyBR interpreta BR e US sem inflar", () => {
  for (const [entrada, esperado] of casos) {
    expect(parseMoneyBR(entrada)).toBeCloseTo(esperado, 2);
  }
});

test("nunca infla um valor com centavos pré-preenchido (regressão do bug)", () => {
  // Estes são exatamente os valores que o bug transformou em ×100/×10
  expect(parseMoneyBR(String(15772.66))).toBe(15772.66);
  expect(parseMoneyBR(String(10202.42))).toBe(10202.42);
  expect(parseMoneyBR(String(2242.02))).toBe(2242.02);
  expect(parseMoneyBR(String(3361.2))).toBe(3361.2);
});
