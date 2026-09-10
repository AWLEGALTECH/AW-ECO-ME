import { test, expect } from "bun:test";
import { avancoEntre, duracaoDoPop } from "./avancoDeEtapa";

test("andar para frente é avanço, e ele sabe onde parou", () => {
  const a = avancoEntre("bradesco", "na_base", "triagem");
  expect(a).toEqual({
    de: "Na base", para: "Triagem", passos: 1, posicao: 2, total: 7, chegada: false,
  });
});

test("pular etapas conta os passos", () => {
  // o automático pula: quem manda o PDF na primeira mensagem sai de Na base
  // direto para Aguardando análise
  const a = avancoEntre("bradesco", "na_base", "aguardando_analise");
  expect(a?.passos).toBe(3);
  expect(a?.para).toBe("Aguardando análise");
});

test("chegar na última é a única festa grande", () => {
  const a = avancoEntre("bradesco", "aguardando_assinatura", "assinado");
  expect(a?.chegada).toBe(true);
  expect(a?.posicao).toBe(7);
  expect(duracaoDoPop(a!)).toBeGreaterThan(duracaoDoPop(avancoEntre("bradesco", "na_base", "triagem")!));
});

test("voltar não é avanço", () => {
  // corrigir etapa marcada por engano é rotina; comemorar correção ensina a
  // ignorar a comemoração
  expect(avancoEntre("bradesco", "aguardando_assinatura", "triagem")).toBeNull();
  expect(avancoEntre("bradesco", "triagem", "triagem")).toBeNull();
});

test("perdido não comemora, nem na ida nem na volta", () => {
  expect(avancoEntre("bradesco", "triagem", "perdido")).toBeNull();
  expect(avancoEntre("bradesco", "perdido", "triagem")).toBeNull();
});

test("primeira vez que se vê a conversa nunca conta", () => {
  // sem etapa anterior não dá para saber se andou, e chutar que sim faria um
  // pop a cada lead aberto na fila
  expect(avancoEntre("bradesco", null, "triagem")).toBeNull();
  expect(avancoEntre("bradesco", undefined, "assinado")).toBeNull();
  expect(avancoEntre("bradesco", "triagem", null)).toBeNull();
});

test("chave que não é desta jornada não vira avanço", () => {
  // conversa que trocou de base carrega chave da régua antiga no caminho
  expect(avancoEntre("bradesco", "aguardando_extrato", "proposta")).toBeNull();
  expect(avancoEntre("padrao", "chegou", "aguardando_analise")).toBeNull();
  expect(avancoEntre("bradesco", "sei_la", "triagem")).toBeNull();
});

test("a régua padrão também anda", () => {
  const a = avancoEntre("padrao", "extrato", "fechado");
  expect(a).toEqual({
    de: "Extrato", para: "Fechado", passos: 2, posicao: 5, total: 5, chegada: true,
  });
});

test("sem jornada, cai na padrão e continua respondendo", () => {
  expect(avancoEntre(null, "chegou", "triagem")?.para).toBe("Triagem");
});
