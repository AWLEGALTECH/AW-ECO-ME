import { describe, it, expect } from "bun:test";
import {
  familiaDaMidia, extensaoDe, nomeDoArquivo, duracaoExibida, progressoDoAudio, barrasDoAudio,
} from "./midiaMensagem";

describe("de que família é o anexo", () => {
  it("o tipo gravado pelo webhook manda", () => {
    expect(familiaDaMidia("audio")).toBe("audio");
    expect(familiaDaMidia("imagem")).toBe("imagem");
    expect(familiaDaMidia("video")).toBe("video");
    expect(familiaDaMidia("documento")).toBe("documento");
    expect(familiaDaMidia("texto")).toBe("texto");
  });

  it("figurinha é imagem", () => {
    expect(familiaDaMidia("sticker")).toBe("imagem");
  });

  it("tipo desconhecido cai no mime em vez de virar texto", () => {
    // Evolution nova com uma chave que a gente ainda não mapeou: o anexo não
    // pode sumir só porque o rótulo mudou de nome
    expect(familiaDaMidia("outro", "audio/ogg; codecs=opus")).toBe("audio");
    expect(familiaDaMidia("outro", "image/webp")).toBe("imagem");
    expect(familiaDaMidia("outro", "application/pdf")).toBe("documento");
  });

  it("sem tipo e sem mime é texto", () => {
    expect(familiaDaMidia("outro", null)).toBe("texto");
    expect(familiaDaMidia(null)).toBe("texto");
  });
});

describe("a extensão do arquivo", () => {
  it("sai do nome quando o nome tem uma", () => {
    expect(extensaoDe("extrato de março.PDF")).toBe("pdf");
  });

  it("sai do path quando o nome não veio", () => {
    expect(extensaoDe(null, null, "PDA/5592/1725.jpeg")).toBe("jpeg");
  });

  it("sai do mime quando não há nome nem path", () => {
    expect(extensaoDe(null, "application/pdf")).toBe("pdf");
    expect(extensaoDe(null, "audio/ogg; codecs=opus")).toBe("ogg");
    expect(
      extensaoDe(null, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ).toBe("xlsx");
  });

  it("mime esquisito não vira extensão esquisita", () => {
    expect(extensaoDe(null, "application/octet-stream")).toBe("");
    expect(extensaoDe(null, null, null)).toBe("");
  });
});

describe("o nome com que o arquivo é baixado", () => {
  it("o nome do WhatsApp ganha de tudo", () => {
    expect(nomeDoArquivo("documento", "extrato março.pdf", "application/pdf")).toBe("extrato março.pdf");
  });

  it("sem nome, monta um com extensão", () => {
    expect(nomeDoArquivo("imagem", null, "image/jpeg")).toBe("imagem.jpeg");
    expect(nomeDoArquivo("audio", null, "audio/ogg; codecs=opus")).toBe("audio.ogg");
    expect(nomeDoArquivo("documento", "  ", "application/pdf")).toBe("documento.pdf");
  });

  it("sem nem extensão, ainda devolve algo legível", () => {
    expect(nomeDoArquivo("video", null, null)).toBe("video");
  });
});

describe("a duração que o player mostra", () => {
  it("o elemento manda quando dá um número de verdade", () => {
    expect(duracaoExibida(95, 3)).toBe("1:35");
  });

  it("Infinity do opus cai na duração que a Evolution mandou", () => {
    // esse é o caso real: ogg/webm de gravação vem sem cabeçalho de duração
    expect(duracaoExibida(Infinity, 32)).toBe("0:32");
    expect(duracaoExibida(NaN, 32)).toBe("0:32");
    expect(duracaoExibida(0, 32)).toBe("0:32");
  });

  it("sem nenhuma das duas, esconde em vez de mentir", () => {
    expect(duracaoExibida(Infinity, null)).toBeNull();
    expect(duracaoExibida(null, 0)).toBeNull();
  });
});

describe("o quanto da faixa já tocou", () => {
  it("usa a duração do elemento quando ela presta", () => {
    expect(progressoDoAudio(5, 10, 99)).toBe(50);
  });

  it("com Infinity, usa a duração gravada", () => {
    expect(progressoDoAudio(8, Infinity, 32)).toBe(25);
  });

  it("não passa de 100 nem fica negativo", () => {
    expect(progressoDoAudio(40, 32, null)).toBe(100);
    expect(progressoDoAudio(-3, 32, null)).toBe(0);
  });

  it("sem duração nenhuma, fica parado em 0", () => {
    expect(progressoDoAudio(5, Infinity, null)).toBe(0);
  });
});

describe("as barrinhas do áudio", () => {
  it("o mesmo áudio desenha sempre a mesma silhueta", () => {
    expect(barrasDoAudio("msg-1")).toEqual(barrasDoAudio("msg-1"));
  });

  it("áudios diferentes desenham silhuetas diferentes", () => {
    expect(barrasDoAudio("msg-1")).not.toEqual(barrasDoAudio("msg-2"));
  });

  it("nenhuma barra some nem estoura a caixa", () => {
    for (const b of barrasDoAudio("qualquer", 40)) {
      expect(b).toBeGreaterThanOrEqual(0.25);
      expect(b).toBeLessThanOrEqual(1);
    }
    expect(barrasDoAudio("x", 40)).toHaveLength(40);
  });
});
