import { describe, it, expect } from "bun:test";
import {
  CADENCIA, TOTAL_RODADAS, rotuloDaRodada, rotuloDoDegrau, diasDaRodada, INTENCAO, somaDias,
  vencimentoDaPrimeira, vencimentoDaProxima, entraNaCadencia, motivoDeFora,
  urgenciaDaTask, diasDeAtraso, type SituacaoDaConversa,
} from "./followUp";

describe("a régua", () => {
  it("são cinco degraus, subindo", () => {
    expect(CADENCIA).toEqual([1, 5, 15, 30, 60]);
    expect(TOTAL_RODADAS).toBe(5);
    for (let i = 1; i < CADENCIA.length; i++) {
      expect(CADENCIA[i]).toBeGreaterThan(CADENCIA[i - 1]);
    }
  });

  it("cada rodada tem intenção própria — cinco cobranças iguais não movem ninguém", () => {
    for (let r = 1; r <= TOTAL_RODADAS; r++) {
      expect(INTENCAO[r]?.titulo).toBeTruthy();
      expect(INTENCAO[r]?.detalhe.length).toBeGreaterThan(30);
    }
    const titulos = new Set(Object.values(INTENCAO).map((i) => i.titulo));
    expect(titulos.size).toBe(TOTAL_RODADAS);
  });

  it("o rótulo segue o vocabulário da planilha", () => {
    expect(rotuloDaRodada(1)).toBe("UP01");
    expect(rotuloDaRodada(5)).toBe("UP05");
  });

  // O cartão fala em DIAS, não em posição na fila: "UP01 de 5" não muda o que
  // se escreve, "de 1 dia" e "de 60 dias" mudam tudo.
  it("o cartão diz o degrau da régua, e o singular do primeiro", () => {
    expect(rotuloDoDegrau(1)).toBe("Follow-up de 1 dia");
    expect(rotuloDoDegrau(2)).toBe("Follow-up de 5 dias");
    expect(rotuloDoDegrau(5)).toBe("Follow-up de 60 dias");
  });

  it("rodada fora da régua não inventa degrau", () => {
    expect(diasDaRodada(0)).toBeNull();
    expect(diasDaRodada(6)).toBeNull();
    expect(rotuloDoDegrau(9)).toBe("Follow-up");
  });
});

describe("quando vence cada cobrança", () => {
  it("a primeira cai um dia depois do silêncio", () => {
    expect(vencimentoDaPrimeira("2026-09-10")).toBe("2026-09-11");
  });

  it("atravessa a virada do mês sem inventar dia 31", () => {
    expect(somaDias("2026-09-28", 5)).toBe("2026-10-03");
    expect(somaDias("2026-12-30", 5)).toBe("2027-01-04");
  });

  // O CASO QUE A PLANILHA NÃO RESOLVE. Ela calcula datas a partir do primeiro
  // contato e não registra o que foi feito; então uma cobrança atrasada empurra
  // a seguinte pro mesmo dia, e a régua inteira desaba numa tarde.
  it("a próxima conta do dia em que a anterior foi FEITA, não do calendário", () => {
    // UP01 venceu em 11/09 mas só foi feito em 14/09.
    // O degrau de 1 para 5 são quatro dias: 14 + 4 = 18, e não 15.
    expect(vencimentoDaProxima(1, "2026-09-14")).toBe("2026-09-18");
  });

  it("cada degrau é a diferença entre dois passos da régua", () => {
    expect(vencimentoDaProxima(1, "2026-09-01")).toBe("2026-09-05");   // 5−1  = 4
    expect(vencimentoDaProxima(2, "2026-09-01")).toBe("2026-09-11");   // 15−5 = 10
    expect(vencimentoDaProxima(3, "2026-09-01")).toBe("2026-09-16");   // 30−15 = 15
    expect(vencimentoDaProxima(4, "2026-09-01")).toBe("2026-10-01");   // 60−30 = 30
  });

  it("depois da última não há próxima — o lead sai da cadência", () => {
    expect(vencimentoDaProxima(5, "2026-09-01")).toBeNull();
    expect(vencimentoDaProxima(99, "2026-09-01")).toBeNull();
    expect(vencimentoDaProxima(0, "2026-09-01")).toBeNull();
  });
});

describe("quem entra na cadência", () => {
  const base: SituacaoDaConversa = {
    ultimaFoi: "nos", ultimaEm: "2026-09-10", etapa: "triagem", arquivada: false,
  };

  it("entra quem ficou sem resposta depois de uma mensagem nossa", () => {
    expect(entraNaCadencia(base)).toBe(true);
    expect(motivoDeFora(base)).toBeNull();
  });

  // A distinção que sustenta a central inteira: lead que ESCREVEU e não foi
  // respondido é falha nossa, urgência de hoje — não cadência. Juntar os dois
  // faria o caso urgente sumir embaixo da fila de cobrança.
  it("NÃO entra quem está esperando resposta NOSSA", () => {
    expect(entraNaCadencia({ ...base, ultimaFoi: "lead" })).toBe(false);
    expect(motivoDeFora({ ...base, ultimaFoi: "lead" })).toContain("bola está com a gente");
  });

  it("sai quem fechou", () => {
    expect(entraNaCadencia({ ...base, etapa: "fechado" })).toBe(false);
    expect(motivoDeFora({ ...base, etapa: "fechado" })).toBe("já fechou");
  });

  it("sai quem foi arquivado", () => {
    expect(entraNaCadencia({ ...base, arquivada: true })).toBe(false);
    expect(motivoDeFora({ ...base, arquivada: true })).toBe("conversa arquivada");
  });

  it("conversa que nunca aconteceu não entra", () => {
    expect(entraNaCadencia({ ...base, ultimaEm: null })).toBe(false);
    expect(motivoDeFora({ ...base, ultimaEm: null })).toContain("ainda não houve");
  });

  // Base fria segue a mesma régua: quem foi abordado e não respondeu está
  // exatamente na situação que a cadência existe pra tratar.
  it("lead de base fria abordado e calado entra igual", () => {
    expect(entraNaCadencia({ ...base, etapa: "chegou" })).toBe(true);
  });
});

describe("urgência", () => {
  it("separa atrasada, hoje e futura", () => {
    expect(urgenciaDaTask("2026-09-09", "2026-09-10")).toBe("atrasada");
    expect(urgenciaDaTask("2026-09-10", "2026-09-10")).toBe("hoje");
    expect(urgenciaDaTask("2026-09-11", "2026-09-10")).toBe("futura");
  });

  it("conta o atraso em dias, e nunca negativo", () => {
    expect(diasDeAtraso("2026-09-01", "2026-09-10")).toBe(9);
    expect(diasDeAtraso("2026-09-10", "2026-09-10")).toBe(0);
    expect(diasDeAtraso("2026-09-20", "2026-09-10")).toBe(0);
  });
});
