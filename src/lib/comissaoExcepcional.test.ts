import { describe, it, expect } from "bun:test";
import { valorDaRubrica, comissaoDoMes, type FaixaMes } from "./comissaoExcepcional";

/* O mês de agosto do escritório: R$ 5,00 por rubrica, sem faixa especial. */
const SIMPLES: FaixaMes = {
  valorBase: 5, especialAtivo: false, valorEspecial: 0, especialLimite: null,
};
/* Um mês com degrau geral: base até 20, R$ 6,00 do 21º em diante. */
const COM_DEGRAU: FaixaMes = {
  valorBase: 5, especialAtivo: true, valorEspecial: 6, especialLimite: 20,
};

describe("sem nada individual", () => {
  it("vale o base", () => {
    expect(valorDaRubrica(6, SIMPLES).valor).toBe(5);
    expect(valorDaRubrica(6, SIMPLES).origem).toBe("base");
  });

  it("o degrau geral só vale depois do limite", () => {
    expect(valorDaRubrica(20, COM_DEGRAU).valor).toBe(5);
    expect(valorDaRubrica(21, COM_DEGRAU).valor).toBe(6);
    expect(valorDaRubrica(21, COM_DEGRAU).origem).toBe("especial-geral");
  });
});

describe("faixa especial própria", () => {
  it("sobrepõe a geral", () => {
    const v = valorDaRubrica(30, COM_DEGRAU, { especialAtivo: true, valorEspecial: 8, especialLimite: 10 });
    expect(v.valor).toBe(8);
    expect(v.origem).toBe("especial-propria");
    expect(v.individual).toBe(true);
  });

  it("abaixo do próprio limite, cai no base do mês", () => {
    const v = valorDaRubrica(5, COM_DEGRAU, { especialAtivo: true, valorEspecial: 8, especialLimite: 10 });
    expect(v.valor).toBe(5);
  });
});

describe("valor excepcional", () => {
  it("vale do início ao fim, sem degrau", () => {
    const p = { excepcionalAtivo: true, excepcionalValor: 9 };
    expect(valorDaRubrica(1, SIMPLES, p).valor).toBe(9);
    expect(valorDaRubrica(200, SIMPLES, p).valor).toBe(9);
    expect(valorDaRubrica(1, SIMPLES, p).limite).toBeNull();
  });

  it("ganha da faixa especial própria e da geral", () => {
    // O caso que a ordem existe pra proteger: quem produz muito receberia 8 ou
    // 6 pela regra automática, mas a direção decidiu 9 — e é 9.
    const v = valorDaRubrica(50, COM_DEGRAU, {
      excepcionalAtivo: true, excepcionalValor: 9,
      especialAtivo: true, valorEspecial: 8, especialLimite: 10,
    });
    expect(v.valor).toBe(9);
    expect(v.origem).toBe("excepcional");
  });

  it("ganha mesmo quando é MENOR que o degrau — decisão é decisão", () => {
    const v = valorDaRubrica(50, COM_DEGRAU, { excepcionalAtivo: true, excepcionalValor: 3 });
    expect(v.valor).toBe(3);
  });

  it("carrega o recado de quem atribuiu", () => {
    const v = valorDaRubrica(6, SIMPLES, {
      excepcionalAtivo: true, excepcionalValor: 9, excepcionalObs: "Combinado na reunião de 28/08.",
    });
    expect(v.observacao).toBe("Combinado na reunião de 28/08.");
  });

  it("ligado sem valor não vale nada: cai na regra normal", () => {
    // Marcar a caixa e não digitar o valor não pode zerar a comissão de
    // ninguém — o estado meio preenchido é comum e não pode custar dinheiro.
    expect(valorDaRubrica(30, COM_DEGRAU, { excepcionalAtivo: true }).origem).toBe("especial-geral");
    expect(valorDaRubrica(30, COM_DEGRAU, { excepcionalAtivo: true, excepcionalValor: 0 }).valor).toBe(6);
    expect(valorDaRubrica(6, SIMPLES, { excepcionalAtivo: true, excepcionalValor: null }).valor).toBe(5);
  });

  it("desligado é ignorado, mesmo com valor gravado", () => {
    const v = valorDaRubrica(6, SIMPLES, { excepcionalAtivo: false, excepcionalValor: 9 });
    expect(v.valor).toBe(5);
    expect(v.origem).toBe("base");
  });
});

describe("comissaoDoMes", () => {
  it("é rubricas × valor + bônus", () => {
    // a Adria em agosto: 6 rubricas a R$ 5,00
    expect(comissaoDoMes(6, SIMPLES).total).toBe(30);
    expect(comissaoDoMes(6, SIMPLES, undefined, 100).total).toBe(130);
  });

  it("o excepcional reprecifica tudo, não só o excedente", () => {
    const { total, vigente } = comissaoDoMes(6, SIMPLES, { excepcionalAtivo: true, excepcionalValor: 12 });
    expect(total).toBe(72);
    expect(vigente.origem).toBe("excepcional");
  });

  it("zero rubricas com bônus paga só o bônus", () => {
    expect(comissaoDoMes(0, SIMPLES, { excepcionalAtivo: true, excepcionalValor: 9 }, 250).total).toBe(250);
  });
});
