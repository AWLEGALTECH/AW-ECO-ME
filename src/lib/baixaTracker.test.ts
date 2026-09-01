import { describe, it, expect } from "bun:test";
import {
  STATUS_ALVARA_PAGO, STATUS_ACORDO_PAGO,
  viaDeBaixa, ehStatusDeBaixa, jaSaiuDoTracker, decidirBaixa, dividirBaixa,
  valorPrevistoDoProcesso, ganhoDoProcesso,
} from "./baixaTracker";

describe("viaDeBaixa", () => {
  it("reconhece as duas vias", () => {
    expect(viaDeBaixa(STATUS_ALVARA_PAGO)).toBe("alvara");
    expect(viaDeBaixa(STATUS_ACORDO_PAGO)).toBe("acordo");
  });

  it("não confunde com o status anterior de cada via", () => {
    // é aqui que o dinheiro AINDA não entrou; baixar nesses seria lançar caixa
    // que não existe
    expect(viaDeBaixa("ALVARÁ EXPEDIDO")).toBeNull();
    expect(viaDeBaixa("AG. PAGAMENTO ACORDO")).toBeNull();
    expect(viaDeBaixa("AG. EXPEDIÇÃO ALVARÁ")).toBeNull();
  });

  it("tolera caixa e espaço, que é como a planilha chega", () => {
    expect(viaDeBaixa("  alvará pago ")).toBe("alvara");
    expect(viaDeBaixa("Acordo Pago")).toBe("acordo");
  });

  it("aguenta vazio e nulo", () => {
    expect(viaDeBaixa(null)).toBeNull();
    expect(viaDeBaixa(undefined)).toBeNull();
    expect(viaDeBaixa("")).toBeNull();
    expect(ehStatusDeBaixa("AG. SENTENÇA")).toBe(false);
  });
});

describe("jaSaiuDoTracker", () => {
  it("sai quem foi pago", () => {
    expect(jaSaiuDoTracker(STATUS_ALVARA_PAGO)).toBe(true);
    expect(jaSaiuDoTracker(STATUS_ACORDO_PAGO)).toBe(true);
  });

  it("sai quem foi arquivado pelas duas vias", () => {
    expect(jaSaiuDoTracker("ARQUIVADO")).toBe(true);
    expect(jaSaiuDoTracker("ARQUIVADO ACORDO")).toBe(true);
  });

  it("continua no Tracker quem ainda espera dinheiro", () => {
    expect(jaSaiuDoTracker("ALVARÁ EXPEDIDO")).toBe(false);
    expect(jaSaiuDoTracker("AG. PAGAMENTO ACORDO")).toBe(false);
    expect(jaSaiuDoTracker("AG. PAGAMENTO VOLUNTÁRIO")).toBe(false);
    expect(jaSaiuDoTracker(null)).toBe(false);
  });
});

describe("decidirBaixa", () => {
  it("pergunta ao chegar em ALVARÁ PAGO", () => {
    const d = decidirBaixa({ de: "ALVARÁ EXPEDIDO", para: STATUS_ALVARA_PAGO, valor: 3327.13 });
    expect(d).toEqual({ pedirBaixa: true, via: "alvara" });
  });

  it("pergunta ao chegar em ACORDO PAGO", () => {
    const d = decidirBaixa({ de: "AG. PAGAMENTO ACORDO", para: STATUS_ACORDO_PAGO, valor: 1500 });
    expect(d).toEqual({ pedirBaixa: true, via: "acordo" });
  });

  it("não pergunta em status que não é de baixa", () => {
    const d = decidirBaixa({ de: "AG. SENTENÇA", para: "ALVARÁ EXPEDIDO", valor: 5000 });
    expect(d.pedirBaixa).toBe(false);
    expect(d.motivo).toBe("nao-e-status-de-baixa");
  });

  it("não repergunta quando o processo já foi baixado", () => {
    // clicar duas vezes não pode lançar o alvará duas vezes no Wallet
    const d = decidirBaixa({ de: "ALVARÁ EXPEDIDO", para: STATUS_ALVARA_PAGO, valor: 3327.13, jaBaixado: true });
    expect(d.pedirBaixa).toBe(false);
    expect(d.motivo).toBe("ja-baixado");
  });

  it("não repergunta ao reaplicar o mesmo status", () => {
    const d = decidirBaixa({ de: STATUS_ALVARA_PAGO, para: STATUS_ALVARA_PAGO, valor: 3327.13 });
    expect(d.pedirBaixa).toBe(false);
    expect(d.motivo).toBe("sem-mudanca");
  });

  it("não pergunta sem valor: não há o que lançar", () => {
    expect(decidirBaixa({ para: STATUS_ALVARA_PAGO, valor: 0 }).motivo).toBe("sem-valor");
    expect(decidirBaixa({ para: STATUS_ALVARA_PAGO }).motivo).toBe("sem-valor");
  });

  it("as duas portas decidem igual", () => {
    // a mesma mudança, venha do Tracker ou da ficha, dá a mesma resposta
    const args = { de: "ALVARÁ EXPEDIDO", para: STATUS_ALVARA_PAGO, valor: 9533.67 };
    expect(decidirBaixa(args)).toEqual(decidirBaixa({ ...args }));
  });
});

describe("dividirBaixa", () => {
  it("reparte nos percentuais que agosto mostrou", () => {
    // DARLENE: contrato de 30% pro escritório
    expect(dividirBaixa(9533.67, 6673.57)).toEqual({
      valido: true, doEscritorio: 2860.10, percentualCliente: 70,
    });
    // MARIA DE LOURDES: contrato de 40%
    expect(dividirBaixa(4048.41, 2429.05)).toEqual({
      valido: true, doEscritorio: 1619.36, percentualCliente: 60,
    });
    // MIRACELVA: meio a meio
    expect(dividirBaixa(3327.13, 1663.56)).toEqual({
      valido: true, doEscritorio: 1663.57, percentualCliente: 50,
    });
  });

  it("aceita o alvará que é todo do escritório", () => {
    const d = dividirBaixa(2000, 0);
    expect(d.valido).toBe(true);
    expect(d.doEscritorio).toBe(2000);
    expect(d.percentualCliente).toBe(0);
  });

  it("recusa a parte do cliente maior que o recebido", () => {
    const d = dividirBaixa(1000, 1500);
    expect(d.valido).toBe(false);
    expect(d.erro).toContain("não cabe");
  });

  it("recusa valor negativo e zero", () => {
    expect(dividirBaixa(0, 0).valido).toBe(false);
    expect(dividirBaixa(-100, 0).valido).toBe(false);
    expect(dividirBaixa(1000, -1).valido).toBe(false);
  });

  it("não perde centavo na divisão", () => {
    const bruto = 3305.32;
    const cliente = 1652.66;
    const d = dividirBaixa(bruto, cliente);
    expect(d.doEscritorio + cliente).toBeCloseTo(bruto, 2);
  });
});

describe("valorPrevistoDoProcesso", () => {
  const comSentenca = [{ titulo: "Sentença", sentenca: { valor: 3305.32, resultado: "procedente" } }];

  it("pela via do acordo, é o valor acordado", () => {
    const lt = [...comSentenca, { titulo: "Acordo", acordo: { valor: 1500 } }];
    expect(valorPrevistoDoProcesso(lt, "acordo")).toBe(1500);
  });

  it("pela via litigiosa, o executado ganha do julgado e do sentenciado", () => {
    const lt = [
      { titulo: "Sentença", sentenca: { valor: 3305.32, resultado: "procedente" } },
      { titulo: "Julgamento em 2º grau", julgamento: { valor: 4000, resultado: "procedente" } },
      { titulo: "Cumprimento de sentença", execucao: { valor: 3305.48 } },
    ];
    expect(valorPrevistoDoProcesso(lt, "alvara")).toBe(3305.48);
  });

  it("sem execução, cai no 2º grau", () => {
    const lt = [
      { titulo: "Sentença", sentenca: { valor: 3305.32, resultado: "procedente" } },
      { titulo: "Julgamento em 2º grau", julgamento: { valor: 4000, resultado: "procedente" } },
    ];
    expect(valorPrevistoDoProcesso(lt, "alvara")).toBe(4000);
  });

  it("ignora improcedente: não se recebe o que se perdeu", () => {
    const lt = [
      { titulo: "Sentença", sentenca: { valor: 3305.32, resultado: "procedente" } },
      { titulo: "Julgamento em 2º grau", julgamento: { valor: 9000, resultado: "improcedente" } },
    ];
    expect(valorPrevistoDoProcesso(lt, "alvara")).toBe(3305.32);
  });

  it("devolve zero quando não há o que prever", () => {
    expect(valorPrevistoDoProcesso([], "alvara")).toBe(0);
    expect(valorPrevistoDoProcesso(null, "acordo")).toBe(0);
    expect(valorPrevistoDoProcesso(comSentenca, "acordo")).toBe(0);
  });
});

describe("ganhoDoProcesso — o que a capa mostra", () => {
  const sent = { titulo: "Sentença", sentenca: { valor: 10000, resultado: "procedente" } };

  it("sem nada ganho, não inventa vitória", () => {
    expect(ganhoDoProcesso([], null)).toBeNull();
    expect(ganhoDoProcesso(null, "AG. SENTENÇA")).toBeNull();
    expect(ganhoDoProcesso([{ titulo: "Sentença", sentenca: { valor: 0, resultado: "improcedente" } }], null)).toBeNull();
  });

  it("com sentença procedente, é litigiosa", () => {
    const g = ganhoDoProcesso([sent], "AG. CUMPRIMENTO SENTENÇA");
    expect(g).toEqual({ valor: 10000, via: "alvara", rotulo: "Litigiosa", recebido: false });
  });

  it("o acordo manda quando existe, mesmo com condenação maior", () => {
    // condenação de 10 mil acertada por 6 mil vale 6 mil: é o que vai entrar
    const g = ganhoDoProcesso([sent, { titulo: "Acordo", acordo: { valor: 6000 } }], null);
    expect(g?.valor).toBe(6000);
    expect(g?.rotulo).toBe("Acordo");
  });

  it("o executado manda sobre a condenação na via litigiosa", () => {
    const g = ganhoDoProcesso([
      sent,
      { titulo: "Cumprimento de sentença", execucao: { valor: 10480.22 } },
    ], null);
    expect(g?.valor).toBe(10480.22);
  });

  it("marca recebido em ALVARÁ PAGO", () => {
    const lt = [{ ...sent, status: "concluida" },
                { titulo: "Cumprimento de sentença", status: "atual", statusProcessual: "ALVARÁ PAGO" }];
    expect(ganhoDoProcesso(lt, null)?.recebido).toBe(true);
  });

  it("marca recebido em ACORDO PAGO e no arquivado do acordo", () => {
    const base = { titulo: "Acordo", status: "atual", acordo: { valor: 1500 } };
    expect(ganhoDoProcesso([{ ...base, statusProcessual: "ACORDO PAGO" }], null)?.recebido).toBe(true);
    expect(ganhoDoProcesso([{ ...base, statusProcessual: "ARQUIVADO ACORDO" }], null)?.recebido).toBe(true);
    expect(ganhoDoProcesso([{ ...base, statusProcessual: "AG. PAGAMENTO ACORDO" }], null)?.recebido).toBe(false);
  });

  it("não confunde as vias: alvará pago não marca acordo como recebido", () => {
    const lt = [{ titulo: "Acordo", status: "atual", statusProcessual: "ALVARÁ PAGO", acordo: { valor: 1500 } }];
    expect(ganhoDoProcesso(lt, null)?.recebido).toBe(false);
  });

  it("cai na fase da ficha quando não há etapa atual", () => {
    expect(ganhoDoProcesso([sent], "ALVARÁ PAGO")?.recebido).toBe(true);
  });
});
