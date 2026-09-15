import { test, expect } from "bun:test";
import {
  pedacosDoTexto, linksDoTexto, linkParaPrevia, comEsquema, dominioDoLink, linkEncurtado,
} from "./links";

const links = (t: string) => linksDoTexto(t);
const soTexto = (t: string) => pedacosDoTexto(t).map((p) => p.texto).join("");

test("o texto reconstruído é IGUAL ao original, sempre", () => {
  /* É a garantia que importa mais que todas: se os pedaços não remontarem a
     mensagem, a bolha passa a mostrar coisa diferente do que a pessoa escreveu,
     e ninguém percebe olhando um caso. */
  for (const t of [
    "veja https://tjam.jus.br/processo?n=123 e me diga",
    "sem link nenhum aqui",
    "Lei 8.078/90, art. 5º, CPF 123.456.789-00",
    "www.google.com",
    "dois https://a.com e http://b.com.br/x seguidos",
    "termina em link https://x.com",
    "(https://pt.wikipedia.org/wiki/Lei_(norma))",
    "",
    "linha 1\nhttps://a.com\nlinha 3",
  ]) expect(soTexto(t)).toBe(t);
});

test("acha link com esquema, com www e domínio solto conhecido", () => {
  expect(links("abre https://tjam.jus.br/x aqui")).toEqual(["https://tjam.jus.br/x"]);
  expect(links("abre www.google.com aqui")).toEqual(["https://www.google.com"]);
  expect(links("abre google.com aqui")).toEqual(["https://google.com"]);
  expect(links("abre tjam.jus.br aqui")).toEqual(["https://tjam.jus.br"]);
  expect(links("http://x.com.br/a/b?c=1#d")).toEqual(["http://x.com.br/a/b?c=1#d"]);
});

test("o que é jurídico e tem ponto NÃO vira link", () => {
  /* Cada um destes já apareceu em conversa de verdade. Virar palavra azul que
     abre aba em branco faria o texto parecer quebrado. */
  for (const t of [
    "Lei 8.078/90",
    "art. 5º da Constituição",
    "CPF 123.456.789-00",
    "R$ 1.250,00",
    "Súmula 297 do STJ",
    "contrato.pdf",
    "foto.jpeg",
    "extrato.xlsx",
    "Processo 0164684-53.2024.8.04.0001",
    "Dr. Matheus vai responder",
    "às 14.30 eu ligo",
  ]) expect(links(t)).toEqual([]);
});

test("e-mail não vira link de site", () => {
  // o domínio de um e-mail é parte do endereço da pessoa, não um site para abrir
  expect(links("escreva para contato@escritorio.com.br")).toEqual([]);
  expect(links("aw-eco-drive@aw-eco-drive-497216.iam.gserviceaccount.com")).toEqual([]);
});

test("a pontuação da frase não entra no endereço", () => {
  expect(links("veja https://tjam.jus.br.")).toEqual(["https://tjam.jus.br"]);
  expect(links("veja https://tjam.jus.br, depois")).toEqual(["https://tjam.jus.br"]);
  expect(links("é aqui: https://x.com/a!")).toEqual(["https://x.com/a"]);
  expect(links('disse "https://x.com/a"')).toEqual(["https://x.com/a"]);
  expect(links("(https://x.com/a)")).toEqual(["https://x.com/a"]);
});

test("parêntese que é DO endereço fica", () => {
  // o corte é por equilíbrio: só sai o fecha que não tem abre dentro do link
  expect(links("https://pt.wikipedia.org/wiki/Lei_(norma)"))
    .toEqual(["https://pt.wikipedia.org/wiki/Lei_(norma)"]);
  expect(links("(veja https://pt.wikipedia.org/wiki/Lei_(norma))"))
    .toEqual(["https://pt.wikipedia.org/wiki/Lei_(norma)"]);
});

test("os pedaços saem na ordem, com o href pronto", () => {
  const p = pedacosDoTexto("oi www.google.com tchau");
  expect(p.map((x) => x.tipo)).toEqual(["texto", "link", "texto"]);
  expect(p[1]).toEqual({ tipo: "link", texto: "www.google.com", href: "https://www.google.com" });
  expect(p[0].texto).toBe("oi ");
  expect(p[2].texto).toBe(" tchau");
});

test("o que não tem esquema ganha https, e o que tem fica como está", () => {
  expect(comEsquema("google.com")).toBe("https://google.com");
  expect(comEsquema("www.google.com")).toBe("https://www.google.com");
  expect(comEsquema("http://google.com")).toBe("http://google.com");
  expect(comEsquema("https://google.com")).toBe("https://google.com");
});

test("a prévia é do PRIMEIRO link, e os outros continuam clicáveis", () => {
  const t = "olha https://a.com e também https://b.com";
  expect(linkParaPrevia(t)).toBe("https://a.com");
  expect(links(t)).toHaveLength(2);
  expect(linkParaPrevia("sem link")).toBeNull();
});

test("o domínio do cartão sai sem www e sem caminho", () => {
  expect(dominioDoLink("https://www.tjam.jus.br/processo/1")).toBe("tjam.jus.br");
  expect(dominioDoLink("http://google.com")).toBe("google.com");
  expect(dominioDoLink("isso não é url")).toBe("");
});

test("link comprido preserva o começo e o fim", () => {
  const longo = "https://app.zapsign.com.br/verificar/6b06eb84-9b62-424b-9567-badf55d25a2a";
  const curto = linkEncurtado(longo, 40);
  expect(curto.length).toBeLessThanOrEqual(40);
  expect(curto).toContain("…");
  // o começo diz de onde é
  expect(curto.startsWith("https://app.zapsign")).toBe(true);
  // e o fim costuma ser o que identifica a coisa
  expect(curto.endsWith("25a2a")).toBe(true);
  // o que cabe não é mexido
  expect(linkEncurtado("https://x.com", 40)).toBe("https://x.com");
});
