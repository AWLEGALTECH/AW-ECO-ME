import { test, expect } from "bun:test";
import {
  etapasDaJornada, trilhoDaJornada, rotuloDaEtapa, jornadaDaBase, alvoDaMensagem, avancaBradesco,
  ETAPAS_BRADESCO, ehEtapaTerminal, rotuloDaBase,
} from "./jornada";

test("a base decide a jornada", () => {
  expect(jornadaDaBase("bradesco")).toBe("bradesco");
  expect(jornadaDaBase("indicacao")).toBe("padrao");
  expect(jornadaDaBase(null)).toBe("padrao");
});

test("a jornada Bradesco tem sete etapas no trilho e perdido fora dele", () => {
  expect(ETAPAS_BRADESCO).toHaveLength(8);
  expect(trilhoDaJornada("bradesco").map((e) => e.chave)).toEqual([
    "na_base", "triagem", "aguardando_extrato", "aguardando_analise", "proposta", "aguardando_assinatura", "assinado",
  ]);
  expect(ehEtapaTerminal("bradesco", "perdido")).toBe(true);
  expect(ehEtapaTerminal("bradesco", "assinado")).toBe(false);
  expect(etapasDaJornada("padrao").map((e) => e.chave)).toEqual(["chegou", "triagem", "extrato", "proposta", "fechado"]);
});

test("a primeira mensagem dele não tira da base; a nossa leva à triagem", () => {
  expect(alvoDaMensagem({ direcao: "entrada", tipo: "texto", texto: "oi, quero saber dos descontos" })).toBeNull();
  expect(alvoDaMensagem({ direcao: "saida", tipo: "texto", texto: "Boa tarde, tudo bem?" })).toBe("triagem");
  expect(alvoDaMensagem({ direcao: "saida", tipo: "audio" })).toBe("triagem");
});

test("pedir o extrato por texto leva a aguardando extrato; por áudio ainda não", () => {
  expect(alvoDaMensagem({ direcao: "saida", tipo: "texto", texto: "Me manda o EXTRATO dos últimos anos" })).toBe("aguardando_extrato");
  expect(alvoDaMensagem({ direcao: "saida", tipo: "audio", texto: null })).toBe("triagem");
});

test("PDF vindo dele leva a aguardando análise; imagem e PDF nosso não", () => {
  expect(alvoDaMensagem({ direcao: "entrada", tipo: "documento", midiaMime: "application/pdf" })).toBe("aguardando_analise");
  expect(alvoDaMensagem({ direcao: "entrada", tipo: "imagem", midiaMime: "image/jpeg" })).toBeNull();
  expect(alvoDaMensagem({ direcao: "saida", tipo: "documento", midiaMime: "application/pdf" })).toBe("triagem");
});

test("o automático só anda para a frente e não ressuscita perdido", () => {
  expect(avancaBradesco("na_base", "triagem")).toBe(true);
  expect(avancaBradesco("aguardando_analise", "triagem")).toBe(false);
  expect(avancaBradesco("proposta", "proposta")).toBe(false);
  expect(avancaBradesco("perdido", "assinado")).toBe(false);
  expect(avancaBradesco(null, "aguardando_analise")).toBe(true);
});

test("rótulos são achados na jornada certa, ou em qualquer uma quando o log mistura", () => {
  expect(rotuloDaEtapa("bradesco", "aguardando_extrato")).toBe("Aguardando extrato");
  expect(rotuloDaEtapa("padrao", "extrato")).toBe("Extrato");
  expect(rotuloDaEtapa("bradesco", "extrato")).toBe("Extrato");
  expect(rotuloDaEtapa(undefined, "na_base")).toBe("Na base");
  expect(rotuloDaEtapa("padrao", "coisa_estranha")).toBe("coisa_estranha");
  expect(rotuloDaBase("bradesco")).toBe("Base Bradesco");
  expect(rotuloDaBase(null)).toBeNull();
});
