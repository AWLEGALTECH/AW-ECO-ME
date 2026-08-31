import { describe, it, expect } from "bun:test";
import { mesAtual, mesDeslocado, mesPorExtenso, janelaDoMes } from "./mesRef";

describe("mesDeslocado", () => {
  it("anda pra frente e pra trás dentro do ano", () => {
    expect(mesDeslocado("2026-08", 1)).toBe("2026-09");
    expect(mesDeslocado("2026-08", -1)).toBe("2026-07");
    expect(mesDeslocado("2026-08", 0)).toBe("2026-08");
  });

  it("vira o ano em dezembro e em janeiro", () => {
    expect(mesDeslocado("2026-12", 1)).toBe("2027-01");
    expect(mesDeslocado("2026-01", -1)).toBe("2025-12");
  });

  it("aguenta salto de vários meses", () => {
    expect(mesDeslocado("2026-08", 12)).toBe("2027-08");
    expect(mesDeslocado("2026-08", -12)).toBe("2025-08");
    expect(mesDeslocado("2026-02", -14)).toBe("2024-12");
  });

  it("nunca produz mês fora de 01..12", () => {
    let r = "2026-01";
    for (let i = 0; i < 40; i++) {
      r = mesDeslocado(r, 1);
      const m = Number(r.split("-")[1]);
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(12);
    }
  });
});

describe("janelaDoMes", () => {
  it("pega o mês inteiro", () => {
    expect(janelaDoMes("2026-08")).toEqual({ de: "2026-08-01", ate: "2026-08-31" });
    expect(janelaDoMes("2026-09")).toEqual({ de: "2026-09-01", ate: "2026-09-30" });
  });

  it("acerta fevereiro, inclusive bissexto", () => {
    expect(janelaDoMes("2026-02").ate).toBe("2026-02-28");
    expect(janelaDoMes("2024-02").ate).toBe("2024-02-29");
  });

  it("cobre os lançamentos do extrato de agosto", () => {
    const { de, ate } = janelaDoMes("2026-08");
    for (const d of ["2026-08-11", "2026-08-20", "2026-08-31"]) {
      expect(d >= de && d <= ate).toBe(true);
    }
    expect("2026-09-01" <= ate).toBe(false);
    expect("2026-07-31" >= de).toBe(false);
  });
});

describe("mesAtual", () => {
  it("usa horário local, não UTC", () => {
    // 31/08 às 21h em Manaus/São Paulo já é 01/09 em UTC. O mês corrente
    // continua sendo agosto: quem olha a tela está no fuso de casa.
    const fimDoMesANoite = new Date(2026, 7, 31, 21, 30);
    expect(mesAtual(fimDoMesANoite)).toBe("2026-08");
  });

  it("vira no primeiro dia do mês seguinte", () => {
    expect(mesAtual(new Date(2026, 8, 1, 0, 5))).toBe("2026-09");
  });

  it("formata com dois dígitos", () => {
    expect(mesAtual(new Date(2026, 0, 15))).toBe("2026-01");
  });
});

describe("mesPorExtenso", () => {
  it("escreve o nome em português", () => {
    expect(mesPorExtenso("2026-08")).toEqual({ nome: "Agosto", ano: 2026 });
    expect(mesPorExtenso("2026-03")).toEqual({ nome: "Março", ano: 2026 });
    expect(mesPorExtenso("2026-12")).toEqual({ nome: "Dezembro", ano: 2026 });
  });
});
