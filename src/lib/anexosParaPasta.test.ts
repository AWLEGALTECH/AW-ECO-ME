import { test, expect } from "bun:test";
import {
  extensaoDe, podeIrParaPasta, nomeNaPasta, arquivosDaConversa,
  selecaoInicialDaPasta, nomesSemColisao, type AnexoCandidato,
} from "./anexosParaPasta";

const anexo = (o: Partial<AnexoCandidato> = {}): AnexoCandidato => ({
  id: "m1", tipo: "documento", midiaPath: "wa/1.pdf", midiaMime: "application/pdf",
  midiaNome: "657962190_DED.pdf", de: "lead", hora: "13:38", dia: "10/09", ...o,
});

test("a extensão vem do nome, e do mime quando o nome não tem", () => {
  expect(extensaoDe("extrato.PDF", null)).toBe("pdf");
  expect(extensaoDe(null, "image/jpeg")).toBe("jpg");
  expect(extensaoDe("sem-extensao", "application/pdf")).toBe("pdf");
  expect(extensaoDe(null, "coisa/estranha")).toBe("bin");
});

test("documento e foto vão; áudio e vídeo não são documento de ninguém", () => {
  expect(podeIrParaPasta(anexo())).toBe(true);
  expect(podeIrParaPasta(anexo({ tipo: "imagem", midiaMime: "image/jpeg" }))).toBe(true);
  expect(podeIrParaPasta(anexo({ tipo: "audio", midiaMime: "audio/ogg" }))).toBe(false);
  expect(podeIrParaPasta(anexo({ tipo: "video", midiaMime: "video/mp4" }))).toBe(false);
  // linha antiga, sem tipo: decide pelo mime
  expect(podeIrParaPasta(anexo({ tipo: null, midiaMime: "application/pdf" }))).toBe(true);
  expect(podeIrParaPasta(anexo({ tipo: null, midiaMime: "audio/ogg" }))).toBe(false);
  // sem id ou sem caminho não dá pra buscar o arquivo depois
  expect(podeIrParaPasta(anexo({ id: undefined }))).toBe(false);
  expect(podeIrParaPasta(anexo({ midiaPath: null }))).toBe(false);
});

test("nome de verdade é preservado, porque quem mandou escolheu aquilo", () => {
  expect(nomeNaPasta(anexo(), 1)).toBe("657962190_DED.pdf");
  // sem extensão no nome, ganha a do mime
  expect(nomeNaPasta(anexo({ midiaNome: "Extrato Bradesco" }), 1)).toBe("Extrato Bradesco.pdf");
});

test("o uuid do WhatsApp vira algo que se lê seis meses depois", () => {
  const uuid = "1c1af6ec-d04b-47fe-a800-acfd77aa91c7.pdf";
  expect(nomeNaPasta(anexo({ midiaNome: uuid }), 1)).toBe("documento 10-09 13h38.pdf");
  expect(nomeNaPasta(anexo({ midiaNome: uuid, tipo: "imagem", midiaMime: "image/jpeg" }), 1))
    .toBe("foto 10-09 13h38.jpg");
  // sem data conhecida, sobra a posição, que ainda distingue um do outro
  expect(nomeNaPasta(anexo({ midiaNome: null, dia: null, hora: undefined }), 3))
    .toBe("documento 3.pdf");
});

test("a lista sai na ordem em que chegou, sem o que não é documento", () => {
  const arqs = arquivosDaConversa([
    anexo({ id: "a" }),
    anexo({ id: "b", tipo: "audio", midiaMime: "audio/ogg" }),
    anexo({ id: "c", tipo: "imagem", midiaMime: "image/png", midiaNome: null }),
  ]);
  expect(arqs.map((a) => a.id)).toEqual(["a", "c"]);
  expect(arqs[1].tipo).toBe("imagem");
  expect(arqs[1].nome).toBe("foto 10-09 13h38.png");
});

test("já vem marcado o que o lead mandou, e só", () => {
  const arqs = arquivosDaConversa([
    anexo({ id: "dele", de: "lead" }),
    anexo({ id: "nosso", de: "nos", midiaNome: "kit_contrato.docx", midiaMime: "application/pdf" }),
  ]);
  // o kit que NÓS mandamos já está na pasta por outro caminho
  expect(selecaoInicialDaPasta(arqs)).toEqual(["dele"]);
});

test("dois arquivos com o mesmo nome não se sobrescrevem na pasta", () => {
  expect(nomesSemColisao(["rg.jpg", "rg.jpg", "extrato.pdf", "RG.JPG"]))
    .toEqual(["rg.jpg", "rg (2).jpg", "extrato.pdf", "RG (3).JPG"]);
  expect(nomesSemColisao(["sem-extensao", "sem-extensao"]))
    .toEqual(["sem-extensao", "sem-extensao (2)"]);
});

test("conversa sem anexo não derruba nada", () => {
  expect(arquivosDaConversa([])).toEqual([]);
  expect(selecaoInicialDaPasta([])).toEqual([]);
  expect(nomesSemColisao([])).toEqual([]);
});
