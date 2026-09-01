import { describe, it, expect } from "bun:test";
import { sugerirRepasse } from "./repasseContrato";

/* A DIREÇÃO é o que estes testes travam. `percentual_exito` é a parte do
   ESCRITÓRIO; inverter significa repassar 30% onde eram 70% — o cliente recebe
   menos da metade do que tem direito, e ninguém percebe depois de pago. */

describe("a direção do percentual", () => {
  it("contrato de 30% de êxito deixa 70% pro cliente", () => {
    const s = sugerirRepasse(1000, [{ percentual_exito: 30 }]);
    expect(s.percentualCliente).toBe(70);
    expect(s.valor).toBe(700);
  });

  it("contrato de 40% deixa 60%", () => {
    expect(sugerirRepasse(1000, [{ percentual_exito: 40 }]).valor).toBe(600);
  });

  it("contrato de 50% deixa 50%", () => {
    expect(sugerirRepasse(1000, [{ percentual_exito: 50 }]).valor).toBe(500);
  });

  it("reproduz os repasses reais de agosto", () => {
    // DARLENE: entrou 9.533,67 e foram repassados 6.673,57 — contrato de 30%
    expect(sugerirRepasse(9533.67, [{ percentual_exito: 30 }]).valor).toBe(6673.57);
    // MARIA DE LOURDES: 4.048,41 → 2.429,05 — contrato de 40%
    expect(sugerirRepasse(4048.41, [{ percentual_exito: 40 }]).valor).toBe(2429.05);
    // MARTA: 10.000 → 5.000 — contrato de 50%
    expect(sugerirRepasse(10000, [{ percentual_exito: 50 }]).valor).toBe(5000);
  });

  it("no meio centavo, arredonda pra cima — e o escritório nem sempre fez assim", () => {
    // MIRACELVA: 3.327,13 × 50% = 1.663,565, exatamente meio centavo. A
    // sugestão dá 1.663,57; em agosto pagaram 1.663,56. Um centavo de
    // diferença, e nenhum dos dois é "errado" — não há prática consistente na
    // base (a da DARLENE foi arredondada pra cima). Como é sugestão que a
    // pessoa confirma, fica o arredondamento padrão e quem dá a baixa ajusta.
    expect(sugerirRepasse(3327.13, [{ percentual_exito: 50 }]).valor).toBe(1663.57);
  });

  it("a explicação diz os dois lados, pra um erro de direção ficar visível", () => {
    const s = sugerirRepasse(1000, [{ percentual_exito: 30 }]);
    expect(s.explicacao).toContain("30%");
    expect(s.explicacao).toContain("70%");
  });
});

describe("quando não dá pra sugerir", () => {
  it("sem contrato, não inventa", () => {
    const s = sugerirRepasse(1000, []);
    expect(s.valor).toBeNull();
    expect(s.explicacao).toContain("preencha à mão");
  });

  it("contrato sem percentual é ignorado", () => {
    expect(sugerirRepasse(1000, [{ percentual_exito: null }]).valor).toBeNull();
    expect(sugerirRepasse(1000, [{ percentual_exito: 0 }]).valor).toBeNull();
  });

  it("percentual de 100% ou mais é ignorado: zeraria o cliente", () => {
    expect(sugerirRepasse(1000, [{ percentual_exito: 100 }]).valor).toBeNull();
    expect(sugerirRepasse(1000, [{ percentual_exito: 150 }]).valor).toBeNull();
  });

  it("bruto zero ou negativo não sugere nada", () => {
    expect(sugerirRepasse(0, [{ percentual_exito: 30 }]).valor).toBeNull();
    expect(sugerirRepasse(-100, [{ percentual_exito: 30 }]).valor).toBeNull();
  });

  it("lista nula não quebra", () => {
    expect(sugerirRepasse(1000, null).valor).toBeNull();
    expect(sugerirRepasse(1000, undefined).valor).toBeNull();
  });
});

describe("mais de um contrato", () => {
  it("percentuais iguais não são ambíguos", () => {
    const s = sugerirRepasse(1000, [{ percentual_exito: 50 }, { percentual_exito: 50 }]);
    expect(s.ambiguo).toBe(false);
    expect(s.valor).toBe(500);
  });

  it("percentuais diferentes avisam em vez de decidir em silêncio", () => {
    const s = sugerirRepasse(1000, [{ percentual_exito: 30 }, { percentual_exito: 50 }]);
    expect(s.ambiguo).toBe(true);
    expect(s.explicacao).toContain("30%");
    expect(s.explicacao).toContain("50%");
    expect(s.explicacao).toContain("confira");
    // ainda sugere, pelo primeiro — melhor um campo preenchido e sinalizado
    // do que um campo vazio sem explicação
    expect(s.valor).toBe(700);
  });
});

describe("arredondamento", () => {
  it("não cria nem some centavo", () => {
    const bruto = 3305.33;
    const s = sugerirRepasse(bruto, [{ percentual_exito: 30 }]);
    expect(s.valor).toBe(2313.73);
    // o que sobra pro escritório fecha o bruto
    expect(Number((bruto - s.valor!).toFixed(2))).toBe(991.60);
  });
});
