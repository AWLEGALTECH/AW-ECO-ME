import { describe, it, expect } from "bun:test";
import { hojeISO, dataISO, mesDeHoje } from "./hoje";

/* O caso que quebrou de verdade: 31/08/2026 às 20:18 em Manaus. Nesse instante
   o relógio UTC já marca 01/09, e era isso que o app carimbava — um fechamento
   feito em agosto nasceu em setembro, e a tela abriu no mês errado.

   Os testes constroem a data com new Date(ano, mês, dia, hora), que é sempre
   interpretada no fuso local de quem roda. Então eles verificam a propriedade
   que importa: o que sai é o dia do CALENDÁRIO, não o do meridiano de
   Greenwich. */

describe("hojeISO", () => {
  it("às 20:18 do dia 31 ainda é dia 31", () => {
    expect(hojeISO(new Date(2026, 7, 31, 20, 18))).toBe("2026-08-31");
  });

  it("às 23:59 do último dia do mês ainda é aquele mês", () => {
    expect(hojeISO(new Date(2026, 7, 31, 23, 59, 59))).toBe("2026-08-31");
    expect(mesDeHoje(new Date(2026, 7, 31, 23, 59, 59))).toBe("2026-08");
  });

  it("vira só depois da meia-noite local", () => {
    expect(hojeISO(new Date(2026, 8, 1, 0, 0, 1))).toBe("2026-09-01");
    expect(mesDeHoje(new Date(2026, 8, 1, 0, 0, 1))).toBe("2026-09");
  });

  it("não é o mesmo que toISOString em horário noturno de fuso negativo", () => {
    // A garantia central: sob UTC-3/-4, toISOString já pulou o dia e hojeISO
    // não. Em UTC ou fuso positivo os dois coincidem, e o teste se cala.
    const noite = new Date(2026, 7, 31, 22, 0);
    if (noite.getTimezoneOffset() > 0) {
      expect(hojeISO(noite)).not.toBe(noite.toISOString().slice(0, 10));
    }
    // e, em qualquer fuso, hojeISO devolve o dia do calendário local
    expect(hojeISO(noite)).toBe("2026-08-31");
  });

  it("zero à esquerda em mês e dia de um dígito", () => {
    expect(hojeISO(new Date(2026, 0, 5, 12, 0))).toBe("2026-01-05");
  });

  it("aguenta a virada do ano", () => {
    expect(hojeISO(new Date(2026, 11, 31, 21, 30))).toBe("2026-12-31");
    expect(hojeISO(new Date(2027, 0, 1, 0, 30))).toBe("2027-01-01");
  });
});

describe("dataISO", () => {
  it("formata sem passar por UTC", () => {
    expect(dataISO(new Date(2026, 1, 29 - 1, 23, 0))).toBe("2026-02-28");
    expect(dataISO(new Date(2024, 1, 29, 23, 0))).toBe("2024-02-29");
  });
});
