import { test, expect } from "bun:test";
import {
  normalizarComando, comandoValido, termoDoRascunho, filtrarAtalhos,
  comandoDuplicado, indiceNaLista, type Atalho,
} from "./atalhos";

const a = (comando: string, conteudo = "texto"): Atalho => ({ id: comando, comando, conteudo });

const LISTA: Atalho[] = [
  a("extrato", "Me manda o extrato dos últimos 5 anos, por favor."),
  a("bomdia", "Bom dia! Tudo bem?"),
  a("prazo", "O processo leva de 6 a 12 meses."),
  a("ext2", "Extrato pelo aplicativo do banco."),
];

test("o comando aceita o que dá pra digitar correndo", () => {
  expect(normalizarComando("Extrato")).toBe("extrato");
  expect(normalizarComando("/extrato")).toBe("extrato");
  expect(normalizarComando("//extrato")).toBe("extrato");
  expect(normalizarComando("Ação Judicial")).toBe("acao-judicial");
  expect(normalizarComando("  bom dia  ")).toBe("bom-dia");
  expect(normalizarComando("pra!ç@")).toBe("prac");
  expect(normalizarComando("a".repeat(40))).toHaveLength(24);
});

test("o que o banco aceita, a tela recusa antes", () => {
  expect(comandoValido("extrato")).toBe(true);
  expect(comandoValido("bom-dia")).toBe(true);
  expect(comandoValido("ext_2")).toBe(true);
  expect(comandoValido("")).toBe(false);
  expect(comandoValido("-comeca-com-traco")).toBe(false);
  expect(comandoValido("com espaço")).toBe(false);
  expect(comandoValido("Extrato")).toBe(false);
  expect(comandoValido("a".repeat(25))).toBe(false);
});

test("a lista abre na barra do começo, e só nela", () => {
  expect(termoDoRascunho("/")).toBe("");
  expect(termoDoRascunho("/ext")).toBe("ext");
  expect(termoDoRascunho("/EXT")).toBe("ext");
  // barra no meio da mensagem não é comando
  expect(termoDoRascunho("prazo de 24/48h")).toBeNull();
  expect(termoDoRascunho("e/ou")).toBeNull();
  // espaço depois da barra fecha: virou mensagem de verdade
  expect(termoDoRascunho("/ manda o extrato")).toBeNull();
  expect(termoDoRascunho("/extrato agora")).toBeNull();
  expect(termoDoRascunho("")).toBeNull();
  expect(termoDoRascunho("oi")).toBeNull();
});

test("termo vazio mostra tudo, em ordem", () => {
  expect(filtrarAtalhos(LISTA, "").map((x) => x.comando)).toEqual(["bomdia", "ext2", "extrato", "prazo"]);
});

test("quem começa com o termo vem antes de quem só o contém", () => {
  expect(filtrarAtalhos(LISTA, "ext").map((x) => x.comando)).toEqual(["ext2", "extrato"]);
  // "extrato" está no TEXTO do ext2 e no comando do extrato: os dois entram
  expect(filtrarAtalhos(LISTA, "extrato").map((x) => x.comando)).toEqual(["extrato", "ext2"]);
});

test("também acha pela frase, que é como se lembra do assunto", () => {
  expect(filtrarAtalhos(LISTA, "meses").map((x) => x.comando)).toEqual(["prazo"]);
  expect(filtrarAtalhos(LISTA, "banco").map((x) => x.comando)).toEqual(["ext2"]);
  expect(filtrarAtalhos(LISTA, "zzzz")).toEqual([]);
});

test("comando repetido é recusado, menos quando é ele mesmo sendo editado", () => {
  expect(comandoDuplicado(LISTA, "extrato")).toBe(true);
  expect(comandoDuplicado(LISTA, "novo")).toBe(false);
  // editando a própria linha, o comando dela não conta como duplicado
  expect(comandoDuplicado(LISTA, "extrato", "extrato")).toBe(false);
});

test("a escolha do teclado não escapa da lista quando ela encolhe", () => {
  expect(indiceNaLista(5, 2)).toBe(1);
  expect(indiceNaLista(-1, 3)).toBe(0);
  expect(indiceNaLista(1, 3)).toBe(1);
  expect(indiceNaLista(2, 0)).toBe(0);
});
