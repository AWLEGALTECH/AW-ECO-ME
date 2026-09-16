import { test, expect } from "bun:test";
import { periodoDoAtalho, rotuloDoPeriodo, dentroDoPeriodo } from "./periodoDaBase";

/* Uma quarta-feira às 15h, para os atalhos não dependerem de quando o teste
   roda: "ontem" é ontem em relação a ESTA data, e não à do relógio. */
const AGORA = new Date(2026, 8, 16, 15, 30, 0);

const dia = (d: Date) => `${d.getDate()}/${d.getMonth() + 1} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;

test("sem recorte, 'tudo' não devolve período nenhum", () => {
  expect(periodoDoAtalho("tudo", undefined, AGORA)).toBeNull();
});

test("hoje é o dia inteiro, da meia-noite ao último instante", () => {
  const p = periodoDoAtalho("hoje", undefined, AGORA)!;
  expect(dia(p.de)).toBe("16/9 0:00");
  expect(dia(p.ate)).toBe("16/9 23:59");
  // o próprio agora está dentro
  expect(AGORA.getTime()).toBeGreaterThan(p.de.getTime());
  expect(AGORA.getTime()).toBeLessThan(p.ate.getTime());
});

test("ontem é o dia anterior inteiro, e não as últimas 24 horas", () => {
  const p = periodoDoAtalho("ontem", undefined, AGORA)!;
  expect(dia(p.de)).toBe("15/9 0:00");
  expect(dia(p.ate)).toBe("15/9 23:59");
  // o agora fica de fora: "ontem" não pode incluir hoje
  expect(AGORA.getTime()).toBeGreaterThan(p.ate.getTime());
});

test("7 dias inclui hoje e conta sete dias, não oito", () => {
  const p = periodoDoAtalho("7dias", undefined, AGORA)!;
  expect(dia(p.de)).toBe("10/9 0:00");
  expect(dia(p.ate)).toBe("16/9 23:59");
  const dias = Math.round((p.ate.getTime() - p.de.getTime()) / 86_400_000);
  expect(dias).toBe(7);
});

test("30 dias, mesma conta", () => {
  const p = periodoDoAtalho("30dias", undefined, AGORA)!;
  expect(dia(p.de)).toBe("18/8 0:00");
  expect(Math.round((p.ate.getTime() - p.de.getTime()) / 86_400_000)).toBe(30);
});

test("um dia só escolhido no calendário vale o dia inteiro", () => {
  /* Quem clica em "12" quer o dia 12, e não a meia-noite dele: sem isto, a
     escolha de um dia só devolveria zero lead, o que pareceria defeito. */
  const p = periodoDoAtalho("escolhido", { from: new Date(2026, 8, 12, 9, 0) }, AGORA)!;
  expect(dia(p.de)).toBe("12/9 0:00");
  expect(dia(p.ate)).toBe("12/9 23:59");
});

test("intervalo escolhido inclui as duas pontas por inteiro", () => {
  const p = periodoDoAtalho("escolhido", {
    from: new Date(2026, 8, 10, 18, 0),
    to: new Date(2026, 8, 12, 7, 0),
  }, AGORA)!;
  expect(dia(p.de)).toBe("10/9 0:00");
  expect(dia(p.ate)).toBe("12/9 23:59");
});

test("calendário aberto e sem nada marcado não recorta nada", () => {
  expect(periodoDoAtalho("escolhido", undefined, AGORA)).toBeNull();
  expect(periodoDoAtalho("escolhido", {} as never, AGORA)).toBeNull();
});

test("o rótulo do botão diz o atalho, ou as datas quando é escolha", () => {
  expect(rotuloDoPeriodo("hoje", undefined)).toBe("Hoje");
  expect(rotuloDoPeriodo("7dias", undefined)).toBe("7 dias");
  expect(rotuloDoPeriodo("escolhido", undefined)).toBe("Período");
  expect(rotuloDoPeriodo("escolhido", { from: new Date(2026, 8, 12) })).toBe("12 de set");
  expect(rotuloDoPeriodo("escolhido", { from: new Date(2026, 8, 12), to: new Date(2026, 8, 18) }))
    .toBe("12 a 18 de set");
  // as duas pontas no mesmo dia não viram "12 a 12"
  expect(rotuloDoPeriodo("escolhido", { from: new Date(2026, 8, 12), to: new Date(2026, 8, 12, 20) }))
    .toBe("12 de set");
});

test("dentroDoPeriodo inclui as bordas e descarta quem não tem data", () => {
  const p = periodoDoAtalho("hoje", undefined, AGORA)!;
  expect(dentroDoPeriodo(new Date(2026, 8, 16, 0, 0, 0).toISOString(), p)).toBe(true);
  expect(dentroDoPeriodo(new Date(2026, 8, 16, 23, 59, 59).toISOString(), p)).toBe(true);
  expect(dentroDoPeriodo(new Date(2026, 8, 15, 23, 59, 59).toISOString(), p)).toBe(false);
  expect(dentroDoPeriodo(new Date(2026, 8, 17, 0, 0, 1).toISOString(), p)).toBe(false);
  /* Lead sem data de chegada fica de fora de QUALQUER recorte, e não dentro de
     todos: dizer "chegou hoje" de quem não tem data é inventar. */
  expect(dentroDoPeriodo(null, p)).toBe(false);
  expect(dentroDoPeriodo("data podre", p)).toBe(false);
});

test("sem recorte, todo mundo passa, inclusive quem não tem data", () => {
  expect(dentroDoPeriodo(null, null)).toBe(true);
  expect(dentroDoPeriodo(new Date().toISOString(), null)).toBe(true);
});

/* ── a semana do cartão da base ───────────────────────────────────────────── */

import { inicioDaSemana } from "./periodoDaBase";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${d.getHours()}h`;

test("a semana começa na segunda, à meia-noite", () => {
  // quarta, 16/09/2026
  expect(ymd(inicioDaSemana(new Date(2026, 8, 16, 15, 30)))).toBe("2026-09-14 0h");
  // a própria segunda devolve ela mesma
  expect(ymd(inicioDaSemana(new Date(2026, 8, 14, 8, 0)))).toBe("2026-09-14 0h");
  // sábado ainda é a mesma semana
  expect(ymd(inicioDaSemana(new Date(2026, 8, 19, 23, 59)))).toBe("2026-09-14 0h");
});

test("domingo pertence à semana que termina nele, e não à seguinte", () => {
  /* Sem isto a contagem zerava todo domingo: o dia mais movimentado de uma
     landing passaria a mostrar "0 esta semana" para quem abrisse a tela. */
  expect(ymd(inicioDaSemana(new Date(2026, 8, 20, 10, 0)))).toBe("2026-09-14 0h");
  // e a segunda seguinte já é outra semana
  expect(ymd(inicioDaSemana(new Date(2026, 8, 21, 0, 1)))).toBe("2026-09-21 0h");
});

test("a semana atravessa a virada do mês sem se perder", () => {
  // quinta, 01/10/2026 -> a semana começou na segunda, 28/09
  expect(ymd(inicioDaSemana(new Date(2026, 9, 1, 9, 0)))).toBe("2026-09-28 0h");
});
