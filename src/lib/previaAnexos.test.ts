import { test, expect } from "bun:test";
import {
  tipoDaPrevia, tamanhoLegivel, paginaVizinha, indiceAposRemover, rotuloDaPagina, nomeEncurtado,
} from "./previaAnexos";

test("o mime manda quando existe", () => {
  expect(tipoDaPrevia("image/png", "x")).toBe("imagem");
  expect(tipoDaPrevia("video/mp4", "x")).toBe("video");
  expect(tipoDaPrevia("audio/ogg; codecs=opus", "x")).toBe("audio");
  expect(tipoDaPrevia("application/pdf", "x")).toBe("pdf");
  expect(tipoDaPrevia("application/vnd.ms-excel", "x")).toBe("outro");
});

test("sem mime, a extensão salva", () => {
  // documento arrastado do Explorer às vezes chega com mime vazio
  expect(tipoDaPrevia("", "extrato.PDF")).toBe("pdf");
  expect(tipoDaPrevia(null, "foto.jpeg")).toBe("imagem");
  expect(tipoDaPrevia(undefined, "video.MOV")).toBe("video");
  expect(tipoDaPrevia("", "audio.opus")).toBe("audio");
  expect(tipoDaPrevia("", "planilha.xlsx")).toBe("outro");
  expect(tipoDaPrevia("", "")).toBe("outro");
});

test("o tamanho se lê sem contar zeros", () => {
  expect(tamanhoLegivel(800)).toBe("800 B");
  expect(tamanhoLegivel(2048)).toBe("2 KB");
  expect(tamanhoLegivel(1_500_000)).toBe("1,4 MB");
  // sem tamanho, não se escreve "0 B"
  expect(tamanhoLegivel(0)).toBe("");
  expect(tamanhoLegivel(null)).toBe("");
});

test("a seta não circula: na última, fica na última", () => {
  expect(paginaVizinha(0, 3, 1)).toBe(1);
  expect(paginaVizinha(2, 3, 1)).toBe(2);
  expect(paginaVizinha(0, 3, -1)).toBe(0);
  expect(paginaVizinha(0, 0, 1)).toBe(0);
});

test("removendo, o dedo fica parado", () => {
  // do meio: a de trás ocupa o lugar e o índice não muda
  expect(indiceAposRemover(1, 4)).toBe(1);
  // a última: volta para a anterior
  expect(indiceAposRemover(3, 4)).toBe(2);
  // a única: não sobra página
  expect(indiceAposRemover(0, 1)).toBe(0);
});

test("contar até um é ruído", () => {
  expect(rotuloDaPagina(0, 1)).toBe("");
  expect(rotuloDaPagina(2, 7)).toBe("3 de 7");
});

test("o nome corta no meio e guarda a extensão", () => {
  expect(nomeEncurtado("extrato.pdf")).toBe("extrato.pdf");
  const cortado = nomeEncurtado("contrato-assinado-joao-da-silva-versao-final-revisada.pdf", 30);
  expect(cortado).toContain("…");
  expect(cortado.endsWith(".pdf")).toBe(true);
  expect(cortado.length).toBeLessThanOrEqual(30);
  // no tamanho de verdade da tela, dois nomes parecidos continuam distinguíveis
  const a = nomeEncurtado("contrato-assinado-joao-da-silva-revisado.pdf");
  const b = nomeEncurtado("contrato-assinado-maria-da-silva-revisado.pdf");
  expect(a).not.toBe(b);
});

test("nome sem extensão e nome vazio não quebram", () => {
  expect(nomeEncurtado("")).toBe("");
  // sem extensão o corte é no meio do mesmo jeito, e o fim é preservado
  const semExt = nomeEncurtado("umnomemuitolongosemextensaonenhumaaqui", 20);
  expect(semExt).toContain("…");
  expect(semExt.length).toBeLessThanOrEqual(20);
  expect(semExt.endsWith("umaaqui")).toBe(true);
});
