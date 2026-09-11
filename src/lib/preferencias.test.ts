import { test, expect } from "bun:test";
import { ordenarPorPreferencia, paletaValida, mesmaOrdem , FUNDOS, fundoValido, fundoOuPadrao } from "./preferencias";

const itens = ["dashboard", "clientes", "atendimento", "esteira", "processos"];
const id = (s: string) => s;

test("sem ordem salva, a lista padrão fica como está", () => {
  expect(ordenarPorPreferencia(itens, null, id)).toEqual(itens);
  expect(ordenarPorPreferencia(itens, [], id)).toEqual(itens);
});

test("a ordem salva manda", () => {
  expect(ordenarPorPreferencia(itens, ["processos", "dashboard", "esteira", "clientes", "atendimento"], id))
    .toEqual(["processos", "dashboard", "esteira", "clientes", "atendimento"]);
});

test("chave salva que não existe mais é ignorada", () => {
  expect(ordenarPorPreferencia(itens, ["processos", "spy", "dashboard", "esteira", "clientes", "atendimento"], id))
    .toEqual(["processos", "dashboard", "esteira", "clientes", "atendimento"]);
});

test("item novo entra logo depois do vizinho de cima que tinha na lista padrão", () => {
  // salvou sem "atendimento" (módulo liberado depois): ele fica depois de clientes
  expect(ordenarPorPreferencia(itens, ["processos", "esteira", "clientes", "dashboard"], id))
    .toEqual(["processos", "esteira", "clientes", "atendimento", "dashboard"]);
});

test("item novo que é o primeiro da lista padrão entra no topo", () => {
  expect(ordenarPorPreferencia(itens, ["processos", "clientes", "esteira", "atendimento"], id))
    .toEqual(["dashboard", "processos", "clientes", "esteira", "atendimento"]);
});

test("chave repetida na ordem salva não duplica o item", () => {
  expect(ordenarPorPreferencia(itens, ["clientes", "clientes", "dashboard"], id).filter((x) => x === "clientes")).toHaveLength(1);
});

test("paleta só aceita as cinco conhecidas", () => {
  expect(paletaValida("sei")).toBe(true);
  expect(paletaValida("default")).toBe(true);
  expect(paletaValida("rosa")).toBe(false);
  expect(paletaValida(null)).toBe(false);
});

test("mesmaOrdem compara posição a posição e trata nulo como vazio", () => {
  expect(mesmaOrdem(["a", "b"], ["a", "b"])).toBe(true);
  expect(mesmaOrdem(["a", "b"], ["b", "a"])).toBe(false);
  expect(mesmaOrdem(null, [])).toBe(true);
});

/* ── O FUNDO DA CONVERSA ── */
test("o fundo salvo só vale se a tela souber desenhá-lo", () => {
  expect(fundoValido("granulado")).toBe(true);
  expect(fundoValido("solido")).toBe(true);
  // chave de uma versão futura, ou lixo: a tela não pode ficar sem fundo
  expect(fundoValido("holograma")).toBe(false);
  expect(fundoValido(null)).toBe(false);
  expect(fundoValido(42)).toBe(false);
});

test("sem escolha, o fundo é o sólido de sempre", () => {
  expect(fundoOuPadrao(null)).toBe("solido");
  expect(fundoOuPadrao("holograma")).toBe("solido");
  expect(fundoOuPadrao("bruma")).toBe("bruma");
});

test("toda opção da lista é válida, e o sólido é a primeira", () => {
  for (const f of FUNDOS) expect(fundoValido(f.chave)).toBe(true);
  expect(FUNDOS[0].chave).toBe("solido");
  // nome e descrição existem para todas: opção sem legenda vira adivinhação
  for (const f of FUNDOS) { expect(f.nome.length).toBeGreaterThan(2); expect(f.descricao.length).toBeGreaterThan(5); }
});
