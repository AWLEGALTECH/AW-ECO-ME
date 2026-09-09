import { test, expect } from "bun:test";
import { ordenarPorPreferencia, paletaValida, mesmaOrdem } from "./preferencias";

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
