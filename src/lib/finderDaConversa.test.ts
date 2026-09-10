import { test, expect } from "bun:test";
import {
  ehPdf, nomeDoDocumento, documentosDaConversa, selecaoInicial, linkDoFinder, docsDaUrl,
  type AnexoDaConversa,
} from "./finderDaConversa";

const anexo = (p: Partial<AnexoDaConversa>): AnexoDaConversa => ({
  id: "m1", de: "lead", midiaPath: "wa/1.pdf", midiaMime: "application/pdf", ...p,
});

test("só PDF com arquivo guardado entra", () => {
  expect(ehPdf(anexo({}))).toBe(true);
  // imagem do RG não é extrato, e o Finder nem leria
  expect(ehPdf(anexo({ midiaMime: "image/jpeg" }))).toBe(false);
  // mensagem de texto não tem arquivo
  expect(ehPdf(anexo({ midiaPath: null }))).toBe(false);
  // sem mime, vale a extensão
  expect(ehPdf(anexo({ midiaMime: null, midiaNome: "extrato.PDF" }))).toBe(true);
  expect(ehPdf(anexo({ midiaMime: null, midiaNome: "foto.jpg" }))).toBe(false);
});

test("nome de uuid vira extrato numerado; nome de gente é preservado", () => {
  expect(nomeDoDocumento("1c1af6ec-d04b-47fe-a800-acfd77aa91c7.pdf", 1)).toBe("extrato-1.pdf");
  expect(nomeDoDocumento("298194bb-322a-4592-a140-87de2beddbfe (2).pdf", 2)).toBe("extrato-2.pdf");
  expect(nomeDoDocumento(null, 3)).toBe("extrato-3.pdf");
  expect(nomeDoDocumento("  ", 1)).toBe("extrato-1.pdf");
  expect(nomeDoDocumento("657962190_DED.pdf", 1)).toBe("657962190_DED.pdf");
  // sem extensão, ganha uma: o Finder filtra por .pdf
  expect(nomeDoDocumento("EXTRATO BRADESCO", 1)).toBe("EXTRATO BRADESCO.pdf");
});

test("a lista sai na ordem em que chegou, numerando só os sem nome", () => {
  const docs = documentosDaConversa([
    anexo({ id: "a", midiaNome: "oi.txt", midiaMime: "text/plain" }),
    anexo({ id: "b", midiaNome: "1c1af6ec-d04b-47fe-a800-acfd77aa91c7.pdf", hora: "20:53" }),
    anexo({ id: "c", midiaNome: "657962190_DED.pdf", de: "nos" }),
    anexo({ id: "d", midiaNome: "298194bb-322a-4592-a140-87de2beddbfe.pdf" }),
  ]);
  expect(docs.map((d) => [d.id, d.nome, d.de])).toEqual([
    ["b", "extrato-1.pdf", "lead"],
    ["c", "657962190_DED.pdf", "nos"],
    ["d", "extrato-3.pdf", "lead"],
  ]);
  expect(docs[0].hora).toBe("20:53");
});

test("a seleção começa nos recebidos; sem recebidos, em tudo", () => {
  const doLead = anexo({ id: "a" });
  const nosso = anexo({ id: "b", de: "nos" });
  expect(selecaoInicial(documentosDaConversa([doLead, nosso]))).toEqual(["a"]);
  expect(selecaoInicial(documentosDaConversa([nosso]))).toEqual(["b"]);
  expect(selecaoInicial([])).toEqual([]);
});

test("o link leva a conversa, o nome e os ids", () => {
  const url = linkDoFinder({ conversaId: "c1", nome: "Luan Ásaf", docs: ["m1", "m2"] });
  expect(url.startsWith("/finder?")).toBe(true);
  const qs = new URLSearchParams(url.slice(url.indexOf("?") + 1));
  expect(qs.get("conversa")).toBe("c1");
  expect(qs.get("nome")).toBe("Luan Ásaf");
  expect(qs.get("docs")).toBe("m1,m2");
  // sem documento escolhido, o parâmetro nem entra
  expect(new URLSearchParams(linkDoFinder({ conversaId: "c1", nome: null, docs: [] }).split("?")[1]).has("docs")).toBe(false);
});

test("a leitura da URL descarta vazio e repetido", () => {
  expect(docsDaUrl("m1,m2,m1,,  m3 ")).toEqual(["m1", "m2", "m3"]);
  expect(docsDaUrl(null)).toEqual([]);
  expect(docsDaUrl("")).toEqual([]);
});

test("mensagem sem id fica de fora: sem id não dá para pedir o anexo depois", () => {
  // a maquete do atendimento monta mensagens à mão, sem id
  expect(ehPdf({ de: "lead", midiaPath: "wa/1.pdf", midiaMime: "application/pdf" })).toBe(false);
  expect(documentosDaConversa([
    { de: "lead", midiaPath: "wa/1.pdf", midiaMime: "application/pdf" },
    anexo({ id: "b", midiaNome: "extrato.pdf" }),
  ])).toHaveLength(1);
});
