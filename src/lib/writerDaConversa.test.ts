import { test, expect } from "bun:test";
import { linkDoWriter } from "./writerDaConversa";

const params = (url: string) => new URLSearchParams(url.slice(url.indexOf("?") + 1));

test("o link leva a conversa, o nome e a análise daquele contato", () => {
  const url = linkDoWriter({ conversaId: "c1", nome: "Luan Ásaf", analiseId: "a9" });
  expect(url.startsWith("/writer?")).toBe(true);
  const qs = params(url);
  expect(qs.get("conversa")).toBe("c1");
  expect(qs.get("nome")).toBe("Luan Ásaf");
  expect(qs.get("analise_comercial")).toBe("a9");
});

test("sem análise, o Writer abre do mesmo jeito e o parâmetro não entra", () => {
  const qs = params(linkDoWriter({ conversaId: "c1", nome: "Luan", analiseId: null }));
  expect(qs.has("analise_comercial")).toBe(false);
  expect(qs.get("conversa")).toBe("c1");
});

test("nome em branco não vira parâmetro vazio", () => {
  expect(params(linkDoWriter({ conversaId: "c1", nome: "   " })).has("nome")).toBe(false);
});
