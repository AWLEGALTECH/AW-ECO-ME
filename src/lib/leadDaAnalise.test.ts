import { test, expect } from "bun:test";
import {
  nomeParecido, esperaAnalise, ordenarCandidatos, filtrarCandidatos, telefoneNaTela, tel8,
  type LeadCandidato,
} from "./leadDaAnalise";

const lead = (o: Partial<LeadCandidato> & { id: string }): LeadCandidato => ({
  nome: null, telefone: "5592900000000", instancia: "PDA",
  etapa: "aguardando_analise", jornada: "bradesco", ultimaEm: "2026-09-10T12:00:00Z", ...o,
});

test("o nome do extrato e o do WhatsApp são a mesma pessoa escrita por duas mãos", () => {
  expect(nomeParecido("almyr Lopes", "JOSÉ ALMYR ARAÚJO LOPES")).toBe(true);
  expect(nomeParecido("José Almyr Araújo Lopes", "JOSE ALMYR ARAUJO LOPES")).toBe(true);
  expect(nomeParecido("Jose Lopes", "JOSE ALMYR ARAUJO LOPES")).toBe(true);
});

test("nomes de gente diferente não casam", () => {
  expect(nomeParecido("Maria Silva", "JOSE ALMYR ARAUJO LOPES")).toBe(false);
  // primeiro nome igual e sobrenome diferente não basta
  expect(nomeParecido("Jose Ferreira", "Jose Almyr Lopes")).toBe(false);
  // um nome só é fraco demais para casar com qualquer coisa
  expect(nomeParecido("Jose", "JOSE ALMYR ARAUJO LOPES")).toBe(false);
  expect(nomeParecido("", "JOSE")).toBe(false);
  expect(nomeParecido("🩸", "JOSE ALMYR")).toBe(false);
});

test("quem espera análise depende da régua em que está", () => {
  expect(esperaAnalise(lead({ id: "a", jornada: "bradesco", etapa: "aguardando_analise" }))).toBe(true);
  expect(esperaAnalise(lead({ id: "b", jornada: "bradesco", etapa: "aguardando_documentos" }))).toBe(false);
  expect(esperaAnalise(lead({ id: "c", jornada: "bradesco", etapa: "assinado" }))).toBe(false);
  expect(esperaAnalise(lead({ id: "d", jornada: "padrao", etapa: "extrato" }))).toBe(true);
  expect(esperaAnalise(lead({ id: "e", jornada: "padrao", etapa: "proposta" }))).toBe(false);
  // jornada estranha cai na padrão em vez de sumir da lista
  expect(esperaAnalise(lead({ id: "f", jornada: "sei_la", etapa: "chegou" }))).toBe(true);
});

test("o provável vem primeiro, e o improvável continua na lista", () => {
  const lista = [
    lead({ id: "recente", nome: "Outra Pessoa", etapa: "assinado", ultimaEm: "2026-09-10T23:00:00Z" }),
    lead({ id: "passou", nome: "almyr Lopes", etapa: "assinado" }),
    lead({ id: "certo", nome: "almyr Lopes", etapa: "aguardando_analise" }),
    lead({ id: "esperando", nome: "Zé Ninguém", etapa: "aguardando_extrato" }),
  ];
  expect(ordenarCandidatos(lista, "JOSÉ ALMYR ARAÚJO LOPES").map((l) => l.id))
    .toEqual(["certo", "passou", "esperando", "recente"]);
});

test("sem palpite de nome, sobra quem espera e depois a data", () => {
  const lista = [
    lead({ id: "velho", nome: null, etapa: "aguardando_extrato", ultimaEm: "2026-01-01T00:00:00Z" }),
    lead({ id: "novo", nome: null, etapa: "assinado", ultimaEm: "2026-09-10T23:00:00Z" }),
  ];
  expect(ordenarCandidatos(lista, "FULANO").map((l) => l.id)).toEqual(["velho", "novo"]);
});

test("a busca acha por nome e por telefone", () => {
  const lista = [
    lead({ id: "a", nome: "almyr Lopes", telefone: "5592991165782" }),
    lead({ id: "b", nome: "Maria", telefone: "5592984253852" }),
  ];
  expect(filtrarCandidatos(lista, "almyr").map((l) => l.id)).toEqual(["a"]);
  expect(filtrarCandidatos(lista, "91165782").map((l) => l.id)).toEqual(["a"]);
  expect(filtrarCandidatos(lista, "(92) 98425").map((l) => l.id)).toEqual(["b"]);
  expect(filtrarCandidatos(lista, "")).toHaveLength(2);
  expect(filtrarCandidatos(lista, "zzz")).toHaveLength(0);
});

test("o telefone aparece como se lê", () => {
  expect(telefoneNaTela("5592991165782")).toBe("(92) 99116-5782");
  expect(telefoneNaTela("559299116578")).toBe("(92) 9911-6578");
  expect(telefoneNaTela("abc")).toBe("abc");
  expect(tel8("(92) 99116-5782")).toBe("91165782");
});
