import { test, expect } from "bun:test";
import {
  minutosDe, horaDe, faixaEm, normalizar, pintar, copiarDia, blocosDoDia,
  proximaAbertura, resumoDoDia, horasPorFaixa, comVariaveis, doDia, momentoEm,
  avisoDaRegua,
  type Horario,
} from "./horarioAtendimento";

/* Uma segunda-feira comum: 8h às 9h avisando que já abrimos, 9h às 18h com
   gente atendendo. O resto do dia é fechado por não estar aqui. */
const SEGUNDA: Horario[] = [
  { dia: 1, inicio: "08:00", fim: "09:00", faixa: "direcionamento" },
  { dia: 1, inicio: "09:00", fim: "18:00", faixa: "atendimento" },
];

const h = (m: number) => m * 60;

test("hora vira minuto e volta", () => {
  expect(minutosDe("08:30")).toBe(510);
  expect(minutosDe("00:00")).toBe(0);
  expect(horaDe(510)).toBe("08:30");
  expect(horaDe(0)).toBe("00:00");
  expect(horaDe(1440)).toBe("24:00");
  // lixo não derruba a tela
  expect(minutosDe("")).toBe(0);
  expect(minutosDe("abc")).toBe(0);
});

test("o que não está na grade é fechado", () => {
  expect(faixaEm(SEGUNDA, 1, h(7))).toBe("fechado");
  expect(faixaEm(SEGUNDA, 1, h(8))).toBe("direcionamento");
  expect(faixaEm(SEGUNDA, 1, h(12))).toBe("atendimento");
  // o fim é exclusivo: às 18:00 em ponto já fechou
  expect(faixaEm(SEGUNDA, 1, h(18))).toBe("fechado");
  // outro dia da semana não tem nada
  expect(faixaEm(SEGUNDA, 0, h(12))).toBe("fechado");
});

test("na dúvida entre duas faixas no mesmo minuto, o atendimento ganha", () => {
  const sobreposto: Horario[] = [
    { dia: 1, inicio: "08:00", fim: "12:00", faixa: "direcionamento" },
    { dia: 1, inicio: "09:00", fim: "18:00", faixa: "atendimento" },
  ];
  expect(faixaEm(sobreposto, 1, h(10))).toBe("atendimento");
});

test("faixas vizinhas do mesmo tipo viram uma só", () => {
  const picotado: Horario[] = [
    { dia: 1, inicio: "09:00", fim: "09:30", faixa: "atendimento" },
    { dia: 1, inicio: "09:30", fim: "10:00", faixa: "atendimento" },
    { dia: 1, inicio: "10:00", fim: "18:00", faixa: "atendimento" },
  ];
  expect(normalizar(picotado)).toEqual([{ dia: 1, inicio: "09:00", fim: "18:00", faixa: "atendimento" }]);
});

test("faixa de duração zero não sobrevive", () => {
  expect(normalizar([{ dia: 1, inicio: "09:00", fim: "09:00", faixa: "atendimento" }])).toEqual([]);
});

test("pintar por cima recorta o que estava embaixo", () => {
  // almoço fechado no meio do atendimento
  const comAlmoco = pintar(SEGUNDA, 1, h(12), h(13), "fechado");
  expect(faixaEm(comAlmoco, 1, h(11))).toBe("atendimento");
  expect(faixaEm(comAlmoco, 1, h(12))).toBe("fechado");
  expect(faixaEm(comAlmoco, 1, h(14))).toBe("atendimento");
  expect(doDia(comAlmoco, 1)).toHaveLength(3);
});

test("pintar não mexe no minuto digitado do outro lado do dia", () => {
  const fino: Horario[] = [{ dia: 1, inicio: "08:15", fim: "09:00", faixa: "direcionamento" }];
  const depois = pintar(fino, 1, h(14), h(18), "atendimento");
  expect(doDia(depois, 1)[0]).toEqual({ dia: 1, inicio: "08:15", fim: "09:00", faixa: "direcionamento" });
});

test("pintar não vaza para os outros dias", () => {
  const semana = [...SEGUNDA, { dia: 2, inicio: "09:00", fim: "18:00", faixa: "atendimento" as const }];
  const depois = pintar(semana, 1, 0, h(24), "fechado");
  expect(doDia(depois, 1)).toEqual([]);
  expect(doDia(depois, 2)).toHaveLength(1);
});

test("pintar de trás para a frente é a mesma coisa", () => {
  expect(pintar(SEGUNDA, 1, h(13), h(12), "fechado")).toEqual(pintar(SEGUNDA, 1, h(12), h(13), "fechado"));
});

test("copiar um dia substitui os outros e não toca no que ficou de fora", () => {
  const semana = [...SEGUNDA, { dia: 6, inicio: "08:00", fim: "12:00", faixa: "atendimento" as const }];
  const depois = copiarDia(semana, 1, [2, 3, 4, 5]);
  expect(doDia(depois, 3)).toHaveLength(2);
  expect(faixaEm(depois, 3, h(12))).toBe("atendimento");
  // sábado não estava na lista de destinos
  expect(doDia(depois, 6)).toHaveLength(1);
  // e a origem continua igual
  expect(doDia(depois, 1)).toHaveLength(2);
});

test("o dia inteiro em blocos cobre da meia-noite à meia-noite", () => {
  const blocos = blocosDoDia(SEGUNDA, 1);
  expect(blocos[0]).toEqual({ de: 0, ate: h(8), faixa: "fechado" });
  expect(blocos[blocos.length - 1]).toEqual({ de: h(18), ate: h(24), faixa: "fechado" });
  expect(blocos.reduce((s, b) => s + (b.ate - b.de), 0)).toBe(24 * 60);
});

test("dia vazio é um bloco de fechado só", () => {
  expect(blocosDoDia([], 3)).toEqual([{ de: 0, ate: 1440, faixa: "fechado" }]);
});

test("a próxima abertura pula o resto do dia e a semana quando precisa", () => {
  // domingo de madrugada: abre segunda às 8h, um dia depois
  expect(proximaAbertura(SEGUNDA, 0, h(3))).toEqual({ dia: 1, minuto: h(8), faixa: "direcionamento", emDias: 1 });
  // durante o direcionamento, a próxima é o atendimento do mesmo dia
  expect(proximaAbertura(SEGUNDA, 1, h(8) + 30)).toEqual({ dia: 1, minuto: h(9), faixa: "atendimento", emDias: 0 });
  // depois das 18h de segunda, só na segunda seguinte
  expect(proximaAbertura(SEGUNDA, 1, h(19))?.emDias).toBe(7);
  // filtrando por atendimento, o direcionamento não conta
  expect(proximaAbertura(SEGUNDA, 0, h(3), "atendimento")).toEqual(
    { dia: 1, minuto: h(9), faixa: "atendimento", emDias: 1 });
  // grade vazia não abre nunca
  expect(proximaAbertura([], 1, h(9))).toBeNull();
});

test("o resumo do dia se lê sem legenda", () => {
  expect(resumoDoDia(SEGUNDA, 1)).toBe("08:00 às 09:00, 09:00 às 18:00");
  expect(resumoDoDia(SEGUNDA, 0)).toBe("fechado o dia todo");
});

test("as horas de cada tipo batem com o desenho", () => {
  expect(horasPorFaixa(SEGUNDA, 1)).toEqual({ direcionamento: 1, atendimento: 9 });
  expect(horasPorFaixa(SEGUNDA, 0)).toEqual({ direcionamento: 0, atendimento: 0 });
});

test("as variáveis viram o que o lead vai ler", () => {
  expect(comVariaveis("Olá {nome}, atendemos às {horario}.", { nome: "Joana Ribeiro", horario: "09:00" }))
    .toBe("Olá Joana, atendemos às 09:00.");
  // sem nome, a saudação some inteira em vez de virar "Olá, !"
  expect(comVariaveis("Olá, {nome}! Tudo bem?", { nome: null, horario: null }))
    .toBe("Olá! Tudo bem?");
  // sem horário conhecido, a frase continua de pé
  expect(comVariaveis("Atendemos às {horario}.", { nome: "X" })).toBe("Atendemos às em breve.");
  expect(comVariaveis("", { nome: "X" })).toBe("");
});

test("o agora é o do escritório, não o de quem abriu a tela", () => {
  // segunda, 21/09/2026, meio-dia em Manaus (UTC-4) = 16:00 UTC
  const meioDia = new Date("2026-09-21T16:00:00Z");
  expect(momentoEm("America/Manaus", meioDia)).toEqual({ dia: 1, minuto: 12 * 60 });
  // o mesmo instante em São Paulo (UTC-3) é uma hora depois
  expect(momentoEm("America/Sao_Paulo", meioDia)).toEqual({ dia: 1, minuto: 13 * 60 });
  // e o dia vira antes lá: 23h de Manaus na segunda já é terça em São Paulo? não,
  // é meia-noite em ponto, que é o caso que quebra a conta da hora
  const virada = new Date("2026-09-22T03:00:00Z");
  expect(momentoEm("America/Sao_Paulo", virada)).toEqual({ dia: 2, minuto: 0 });
  expect(momentoEm("America/Manaus", virada)).toEqual({ dia: 1, minuto: 23 * 60 });
});

test("régua configurada e desligada é aviso, tela em branco não é", () => {
  // foi o caso real: grade pintada, três mensagens escritas, interruptor off
  expect(avisoDaRegua({ ativo: false, grade: SEGUNDA, comMensagem: ["fechado", "direcionamento"] }))
    .toBe("desligada");
  // só a mensagem escrita, sem grade ainda: continua sendo aviso
  expect(avisoDaRegua({ ativo: false, grade: [], comMensagem: ["fechado"] })).toBe("desligada");
  // nada começado: quem abriu a tela sabe que ela está vazia
  expect(avisoDaRegua({ ativo: false, grade: [], comMensagem: [] })).toBeNull();
});

test("ligada sem grade manda o fechado o dia inteiro, e isso se avisa", () => {
  expect(avisoDaRegua({ ativo: true, grade: [], comMensagem: ["fechado"] })).toBe("sem_grade");
  // faixa de duração zero não é grade
  expect(avisoDaRegua({
    ativo: true,
    grade: [{ dia: 1, inicio: "09:00", fim: "09:00", faixa: "atendimento" }],
    comMensagem: ["fechado"],
  })).toBe("sem_grade");
});

test("ligada sem mensagem nenhuma não tem o que mandar", () => {
  expect(avisoDaRegua({ ativo: true, grade: SEGUNDA, comMensagem: [] })).toBe("sem_mensagens");
});

test("ligada, com grade e com mensagem, não avisa nada", () => {
  expect(avisoDaRegua({ ativo: true, grade: SEGUNDA, comMensagem: ["direcionamento"] })).toBeNull();
});
