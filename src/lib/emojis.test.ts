import { describe, it, expect } from "bun:test";
import { EMOJIS, MAX_RECENTES, comOEscolhido } from "./emojis";

describe("a galeria", () => {
  it("é uma lista só, sem repetição", () => {
    // Repetido não dá erro, dá confusão: o mesmo emoji em dois pontos da rolagem
    // faz a pessoa achar que perdeu o lugar.
    expect(new Set(EMOJIS).size).toBe(EMOJIS.length);
  });

  it("tem tamanho de galeria, não de lista curta", () => {
    expect(EMOJIS.length).toBeGreaterThan(400);
  });

  it("não guarda espaço em branco no meio", () => {
    for (const e of EMOJIS) expect(e.trim()).toBe(e);
    expect(EMOJIS.some((e) => e === "")).toBe(false);
  });
});

describe("o histórico de usados", () => {
  it("põe o escolhido na frente", () => {
    expect(comOEscolhido(["🙏", "❤️"], "👍")).toEqual(["👍", "🙏", "❤️"]);
  });

  /* Sem tirar a repetição, mandar "👍" cinco vezes enche a primeira linha de
     cinco polegares iguais e empurra pra fora os outros que a pessoa usa. */
  it("não repete: escolher de novo só sobe", () => {
    expect(comOEscolhido(["🙏", "👍", "❤️"], "👍")).toEqual(["👍", "🙏", "❤️"]);
  });

  it("corta no limite, jogando fora o mais antigo", () => {
    const cheio = EMOJIS.slice(0, MAX_RECENTES);
    const novo = comOEscolhido(cheio, "🆕");
    expect(novo.length).toBe(MAX_RECENTES);
    expect(novo[0]).toBe("🆕");
    expect(novo).not.toContain(cheio[MAX_RECENTES - 1]);
  });

  it("começa do zero sem quebrar", () => {
    expect(comOEscolhido([], "👍")).toEqual(["👍"]);
  });
});
