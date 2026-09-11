import { test, expect } from "bun:test";
import { paraBusca, combina } from "./buscaSemAcento";

test("o acento sai dos dois lados, e é isso que salva o chamado", () => {
  // o extrato guarda sem acento; quem procura escreve com
  const noBanco = paraBusca("OPERACOES VENCIDAS CONTR. 5090675");
  expect(combina(noBanco, "OPERAÇÕES VENCIDAS")).toBe(true);
  expect(combina(noBanco, "operacoes vencidas")).toBe(true);
  // e o contrário também: dado acentuado, busca sem acento
  expect(combina(paraBusca("TARIFA MANUTENÇÃO"), "manutencao")).toBe(true);
});

test("cedilha, til e crase caem todos na mesma peneira", () => {
  expect(paraBusca("Ação Ç ã é í ô ü à")).toBe("acao c a e i o u a");
});

test("as palavras podem vir em qualquer ordem, mas todas têm que estar", () => {
  const t = paraBusca("OPERACOES VENCIDAS CONTR. 5090675");
  expect(combina(t, "vencidas operacoes")).toBe(true);
  expect(combina(t, "5090675 vencidas")).toBe(true);
  // uma palavra que não está derruba a combinação inteira
  expect(combina(t, "vencidas consignado")).toBe(false);
});

test("busca vazia não filtra nada", () => {
  expect(combina(paraBusca("qualquer coisa"), "")).toBe(true);
  expect(combina(paraBusca("qualquer coisa"), "   ")).toBe(true);
});

test("espaço dobrado e sobra nas pontas não mudam o resultado", () => {
  expect(paraBusca("  DOIS   ESPACOS  ")).toBe("dois espacos");
  expect(combina(paraBusca("DOIS ESPACOS"), "  dois   espacos ")).toBe(true);
});

test("texto ausente não quebra", () => {
  expect(paraBusca(null)).toBe("");
  expect(paraBusca(undefined)).toBe("");
  expect(combina("", "algo")).toBe(false);
});
