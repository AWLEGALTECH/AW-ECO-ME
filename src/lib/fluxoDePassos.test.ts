import { test, expect } from "bun:test";
import {
  todosOsPassos, contarPassos, encontrarPasso, posicaoDoPasso, rotuloDaPosicao,
  atualizarPasso, removerPasso, inserirPasso, achatar, variaveisDoTexto,
  type PassoComRamos,
} from "./fluxoDePassos";

interface P extends PassoComRamos { texto?: string; entao?: P[]; senao?: P[] }

const m = (id: string, texto = ""): P => ({ id, tipo: "mensagem", texto });
const se = (id: string, entao: P[], senao: P[]): P => ({ id, tipo: "se", entao, senao });

/* Um fluxo de referência: mensagem, "Se" com um passo de cada lado, mensagem. */
const fluxo: P[] = [m("a"), se("s", [m("s1")], [m("n1"), m("n2")]), m("z")];

test("todosOsPassos lê na ordem: cada Se seguido do sim e do não", () => {
  expect(todosOsPassos(fluxo).map((p) => p.id)).toEqual(["a", "s", "s1", "n1", "n2", "z"]);
  expect(contarPassos(fluxo)).toBe(6);
  expect(contarPassos([])).toBe(0);
});

test("encontrarPasso acha dentro do lado, e devolve null para o que não existe", () => {
  expect(encontrarPasso(fluxo, "n2")?.id).toBe("n2");
  expect(encontrarPasso(fluxo, "s")?.tipo).toBe("se");
  expect(encontrarPasso(fluxo, "x")).toBeNull();
});

test("posição e rótulo: principal numera direto, lado numera do 1 dentro do pai", () => {
  expect(rotuloDaPosicao(fluxo, "a")).toBe("Passo 1");
  expect(rotuloDaPosicao(fluxo, "s")).toBe("Passo 2");
  expect(rotuloDaPosicao(fluxo, "s1")).toBe("Passo 2 · sim 1");
  expect(rotuloDaPosicao(fluxo, "n2")).toBe("Passo 2 · não 2");
  expect(rotuloDaPosicao(fluxo, "z")).toBe("Passo 3");
  expect(rotuloDaPosicao(fluxo, "x")).toBe("Passo");

  const pos = posicaoDoPasso(fluxo, "n1")!;
  expect(pos.pai?.id).toBe("s");
  expect(pos.ramo).toBe("senao");
  expect(pos.indice).toBe(0);
  expect(pos.indiceDoPai).toBe(1);
});

test("atualizarPasso troca só o alvo, também quando ele está num lado, sem mexer no original", () => {
  const novo = atualizarPasso(fluxo, "n1", { texto: "oi" });
  expect(encontrarPasso(novo, "n1")?.texto).toBe("oi");
  expect(encontrarPasso(fluxo, "n1")?.texto).toBe("");
  expect(encontrarPasso(novo, "s1")?.texto).toBe("");
  expect(novo).not.toBe(fluxo);
  // nada mudou de lugar
  expect(todosOsPassos(novo).map((p) => p.id)).toEqual(todosOsPassos(fluxo).map((p) => p.id));
});

test("removerPasso tira de dentro do lado; remover o Se leva os dois lados junto", () => {
  expect(todosOsPassos(removerPasso(fluxo, "n1")).map((p) => p.id)).toEqual(["a", "s", "s1", "n2", "z"]);
  expect(todosOsPassos(removerPasso(fluxo, "s")).map((p) => p.id)).toEqual(["a", "z"]);
  expect(removerPasso(fluxo, "x")).toHaveLength(3);
});

test("inserirPasso na principal respeita o índice e trava nas pontas", () => {
  expect(inserirPasso(fluxo, m("b"), { indice: 1 }).map((p) => p.id)).toEqual(["a", "b", "s", "z"]);
  expect(inserirPasso(fluxo, m("b"), { indice: 99 }).map((p) => p.id)).toEqual(["a", "s", "z", "b"]);
  expect(inserirPasso(fluxo, m("b"), { indice: -5 }).map((p) => p.id)).toEqual(["b", "a", "s", "z"]);
});

test("inserirPasso dentro de um lado entra na posição pedida", () => {
  const novo = inserirPasso(fluxo, m("n0"), { indice: 0, dentroDe: { id: "s", ramo: "senao" } });
  expect(encontrarPasso(novo, "s")?.senao?.map((p) => p.id)).toEqual(["n0", "n1", "n2"]);
  expect(encontrarPasso(novo, "s")?.entao?.map((p) => p.id)).toEqual(["s1"]);
  const fim = inserirPasso(fluxo, m("s9"), { indice: 5, dentroDe: { id: "s", ramo: "entao" } });
  expect(encontrarPasso(fim, "s")?.entao?.map((p) => p.id)).toEqual(["s1", "s9"]);
});

test("um Se não entra dentro de outro Se, e pai que não existe não engole o passo", () => {
  const aninhado = inserirPasso(fluxo, se("s2", [], []), { indice: 0, dentroDe: { id: "s", ramo: "entao" } });
  expect(aninhado).toBe(fluxo);
  const semPai = inserirPasso(fluxo, m("b"), { indice: 0, dentroDe: { id: "nao-existe", ramo: "entao" } });
  expect(semPai).toBe(fluxo);
  // e um passo comum não vira lado de quem não é Se
  const emMensagem = inserirPasso(fluxo, m("b"), { indice: 0, dentroDe: { id: "a", ramo: "entao" } });
  expect(emMensagem).toBe(fluxo);
});

test("achatar: Se sem decisão é só marcador; decidido, traz o lado escolhido logo atrás", () => {
  expect(achatar(fluxo, {}).map((p) => p.id)).toEqual(["a", "s", "z"]);
  expect(achatar(fluxo, null).map((p) => p.id)).toEqual(["a", "s", "z"]);
  expect(achatar(fluxo, { s: "entao" }).map((p) => p.id)).toEqual(["a", "s", "s1", "z"]);
  expect(achatar(fluxo, { s: "senao" }).map((p) => p.id)).toEqual(["a", "s", "n1", "n2", "z"]);
});

test("achatar: decidir não mexe em índice anterior (é o que deixa retomar pelo número)", () => {
  const antes = achatar(fluxo, {});
  const depois = achatar(fluxo, { s: "senao" });
  // o Se está no índice 1 nas duas listas; tudo até ele é igual
  expect(antes.slice(0, 2).map((p) => p.id)).toEqual(depois.slice(0, 2).map((p) => p.id));
  // e o que vem depois dele cresceu, sem empurrar nada para trás
  expect(depois.length).toBe(antes.length + 2);
});

test("achatar ignora decisão com valor estranho", () => {
  expect(achatar(fluxo, { s: "talvez" as never }).map((p) => p.id)).toEqual(["a", "s", "z"]);
});

test("variaveisDoTexto acha o que está entre chaves, sem repetir e sem chave dentro de chave", () => {
  expect(variaveisDoTexto("Olá {nome}, vi que a {Empresa} tem {Funcionários}. {nome}!"))
    .toEqual(["nome", "Empresa", "Funcionários"]);
  expect(variaveisDoTexto("sem nada")).toEqual([]);
  expect(variaveisDoTexto(null)).toEqual([]);
  expect(variaveisDoTexto("{ espaço }")).toEqual(["espaço"]);
  expect(variaveisDoTexto("{}")).toEqual([]);
  expect(variaveisDoTexto("{a{b}c}")).toEqual(["b"]);
});
