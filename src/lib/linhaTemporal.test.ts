import { describe, it, expect } from "bun:test";
import { podeGravarLinha } from "./linhaTemporal";

const P1 = "516b1625-236e-4cc9-9c85-a9cd2c8b0b84";
const P2 = "aa1dceb6-0000-0000-0000-000000000000";

describe("podeGravarLinha", () => {
  it("não grava enquanto o processo ainda está carregando", () => {
    // Este é o caso que apagou a linha da MIRACELVA: o debounce venceu antes
    // do load terminar e gravou o `[]` inicial do useState.
    expect(podeGravarLinha(null, P1, false)).toBe(false);
  });

  it("grava depois que o load do processo aberto terminou", () => {
    expect(podeGravarLinha(P1, P1, false)).toBe(true);
  });

  it("não grava a linha de um processo em cima de outro", () => {
    // Trocar de processo sem desmontar a tela: a linha em memória ainda é a do
    // anterior.
    expect(podeGravarLinha(P1, P2, false)).toBe(false);
  });

  it("não grava na tela de processo novo", () => {
    expect(podeGravarLinha(null, undefined, true)).toBe(false);
    expect(podeGravarLinha(P1, P1, true)).toBe(false);
  });

  it("não grava sem id na rota", () => {
    expect(podeGravarLinha(P1, undefined, false)).toBe(false);
  });

  it("simula a corrida: só o segundo disparo (pós-load) grava", () => {
    // Montagem: etapas = [], nada carregado.
    let prontaPara: string | null = null;
    const gravacoes: string[] = [];
    const tentarGravar = (etapas: string) => {
      if (podeGravarLinha(prontaPara, P1, false)) gravacoes.push(etapas);
    };

    tentarGravar("[]"); // debounce vence antes do load
    prontaPara = P1; // load termina
    tentarGravar("[13 etapas]");

    expect(gravacoes).toEqual(["[13 etapas]"]);
  });
});
