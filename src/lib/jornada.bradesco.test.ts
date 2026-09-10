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
    "na_base", "triagem", "aguardando_extrato", "aguardando_analise", "aguardando_documentos", "aguardando_assinatura", "assinado",
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
  expect(avancaBradesco("aguardando_documentos", "aguardando_documentos")).toBe(false);
  expect(avancaBradesco("perdido", "assinado")).toBe(false);
  expect(avancaBradesco(null, "aguardando_analise")).toBe(true);
});

test("as duas réguas têm etapas de nome parecido e chave diferente", () => {
  // 'proposta' na padrão é "sabe o que pedir, falta fechar"; na Bradesco o
  // mesmo momento se chama 'aguardando_documentos' e espera outra coisa.
  expect(rotuloDaEtapa("bradesco", "aguardando_documentos")).toBe("Aguardando documentação");
  expect(rotuloDaEtapa("padrao", "proposta")).toBe("Proposta");
  expect(ETAPAS_BRADESCO.some((e) => e.chave === "proposta")).toBe(false);
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

/* A RÉGUA PADRÃO TAMBÉM ANDA.
   Um lead recebeu seis mensagens pedindo o extrato e continuou em "Chegou":
   a regra só existia na Bradesco, e as 61 conversas da padrão estavam todas
   na primeira etapa. */
test("na régua padrão a mensagem move com os nomes dela", () => {
  expect(alvoDaMensagem({ direcao: "saida", tipo: "texto", texto: "Boa tarde" }, "padrao")).toBe("triagem");
  expect(alvoDaMensagem({ direcao: "saida", tipo: "texto", texto: "manda o EXTRATO" }, "padrao")).toBe("extrato");
  expect(alvoDaMensagem({ direcao: "entrada", tipo: "texto", texto: "oi" }, "padrao")).toBeNull();
});

test("o PDF não move a régua padrão, porque ela não tem etapa pra ele", () => {
  // na Bradesco existe "Aguardando análise"; na padrão, depois de Extrato vem
  // Proposta, que quer dizer "já sei o que dá pra pedir"
  expect(alvoDaMensagem({ direcao: "entrada", tipo: "documento", midiaMime: "application/pdf" }, "padrao")).toBeNull();
  expect(alvoDaMensagem({ direcao: "entrada", tipo: "documento", midiaMime: "application/pdf" }, "bradesco"))
    .toBe("aguardando_analise");
});

test("resposta automática não é atendimento, em nenhuma das duas", () => {
  const auto = { direcao: "saida" as const, tipo: "texto", texto: "Estamos fora do horário", automatica: true };
  expect(alvoDaMensagem(auto, "padrao")).toBeNull();
  expect(alvoDaMensagem(auto, "bradesco")).toBeNull();
  // a mesma frase escrita por gente conta
  expect(alvoDaMensagem({ ...auto, automatica: false }, "padrao")).toBe("triagem");
});
