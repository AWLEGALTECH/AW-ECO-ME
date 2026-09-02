import { describe, it, expect } from "bun:test";
import {
  PASSO_PULADA, INICIO_CASCATA, cadeiaDoPulso, acendeEm, fimDaCascata, temFita,
} from "./cascataSalto";

const perto = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe("a cadeia do pulso", () => {
  it("começa na etapa concluída, não na primeira pulada", () => {
    // o trecho debaixo do check é o que acende primeiro; começar na primeira
    // pulada deixaria esse pedaço pronto e o corte pareceria brotar do meio
    expect(cadeiaDoPulso("e1", ["e2", "e3", "e4"])).toEqual(["e1", "e2", "e3", "e4"]);
  });

  it("sem pulada não há cascata — a fita é que assume", () => {
    expect(cadeiaDoPulso("e1", [])).toEqual([]);
    expect(temFita(0)).toBe(true);
  });

  it("com salto, a fita não toca", () => {
    expect(temFita(1)).toBe(false);
    expect(temFita(8)).toBe(false);
  });
});

describe("o encaixe dos tempos", () => {
  it("o primeiro trecho sai depois do respiro do check", () => {
    perto(acendeEm(0), INICIO_CASCATA);
  });

  it("cada trecho seguinte entra um passo depois", () => {
    perto(acendeEm(1) - acendeEm(0), PASSO_PULADA);
    perto(acendeEm(5) - acendeEm(4), PASSO_PULADA);
  });

  it("a etapa nova abre exatamente quando o último trecho termina", () => {
    // é ISTO que quebra se a conta escorregar meio passo: a etapa nova
    // aparecendo antes de o corte chegar nela
    for (const n of [1, 2, 3, 8]) {
      const ultimo = cadeiaDoPulso("e1", Array.from({ length: n }, (_, i) => `p${i}`)).length - 1;
      perto(acendeEm(ultimo) + PASSO_PULADA, fimDaCascata(n));
    }
  });

  it("sem salto o fim da cascata é zero — nada pra esperar", () => {
    expect(fimDaCascata(0)).toBe(0);
  });

  it("o salto grande do acordo (8 puladas) não passa de um segundo e meio", () => {
    // acima disso o usuário larga a tela antes de a animação acabar
    expect(fimDaCascata(8)).toBeLessThan(1.5);
  });
});

describe("o X de cada pulada carimba quando o pulso chega nela", () => {
  it("a primeira pulada é carimbada no fim do trecho da concluída", () => {
    const cadeia = cadeiaDoPulso("e1", ["p0", "p1"]);
    // p0 está na posição 1: o trecho de cima (o da concluída, posição 0)
    // termina em acendeEm(0) + PASSO, que é exatamente acendeEm(1)
    perto(acendeEm(0) + PASSO_PULADA, acendeEm(cadeia.indexOf("p0")));
  });

  it("nenhuma pulada é carimbada antes do respiro inicial", () => {
    const cadeia = cadeiaDoPulso("e1", ["p0", "p1", "p2"]);
    for (const id of ["p0", "p1", "p2"]) {
      expect(acendeEm(cadeia.indexOf(id))).toBeGreaterThan(INICIO_CASCATA);
    }
  });
});
