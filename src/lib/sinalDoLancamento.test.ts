import { test, expect } from "bun:test";
import { sinalPeloHistorico, corrigirSinalPeloHistorico, historicoNormalizado } from "./sinalDoLancamento";

test("o que é sempre saída: rubricas reais da base do Spy", () => {
  for (const d of [
    "OPERACOES VENCIDAS CONTR. 3996642", "MORA CREDITO PESSOAL", "MORA CARTAO DE CREDITO", "MORA-ENC.S/SDO VINC-MES",
    "ENCARGOS LIMITE DE CRED", "IOF S/ UTILIZACAO LIMITE", "TARIFA BANCARIA", "TARIFA EMISSAO EXTRATO",
    "PACOTE DE SERVIÇOS", "PEND.TARIFAS BANCARIA", "TITULO DE CAPITALIZACAO", "PARCELA CREDITO PESSOAL",
    "SAQUE DIN CORBAN CARTAO", "SAQUE DINHEIRO ATM", "PIX ENVIADO", "PIX QR CODE DINAMICO DES: MERCADINHO",
    "TRANSFERENCIA PIX DES: Maria Gorete de Souza 17/01",
  ]) expect([d, sinalPeloHistorico(d)]).toEqual([d, -1]);
});

test("o que é sempre entrada", () => {
  for (const d of [
    "INSS", "TRANSF SALDO C/SAL P/CC", "PIX RECEBIDO", "RENDIMENTOS", "DEP DINHEIRO CAIXA AG",
    "TED-TRANSF ELET DISPON", "DOC CREDITO AUTOMATICO*", "RECEBIMENTO FORNECEDOR", "EMPRESTIMO PESSOAL",
    "TRANSFERENCIA PIX REM: ALLURA PARTICIPACOES 08/05", "PIX RECEBIDO REMT: SIMON DEIVES",
  ]) expect([d, sinalPeloHistorico(d)]).toEqual([d, 1]);
});

test("estorno de tarifa é entrada, mesmo tendo TARIFA no nome", () => {
  expect(sinalPeloHistorico("ESTORNO TARIFA BANCARIA")).toBe(1);
  expect(sinalPeloHistorico("DEVOLUCAO PIX")).toBe(1);
});

test("o que o texto sozinho não decide fica em zero, para o saldo decidir", () => {
  // o lançamento sem CONTR. é o banco jogando a dívida para "vencidas" (crédito
  // que zera a conta) ou cobrando (débito): os dois existem na base
  expect(sinalPeloHistorico("OPERACOES VENCIDAS")).toBe(0);
  expect(sinalPeloHistorico("TRANSF CC PARA CC")).toBe(0);
  expect(sinalPeloHistorico("COD. LANC.")).toBe(0);
  expect(sinalPeloHistorico("")).toBe(0);
});

test("acento e caixa não mudam a resposta", () => {
  expect(historicoNormalizado("Título de Capitalização")).toBe("TITULO DE CAPITALIZACAO");
  expect(sinalPeloHistorico("título de capitalização")).toBe(-1);
});

test("corrigir: rubrica inequívoca vence o sinal que veio; ambígua passa intacta", () => {
  expect(corrigirSinalPeloHistorico("MORA CREDITO PESSOAL", 227.57)).toBe(-227.57);
  expect(corrigirSinalPeloHistorico("MORA CREDITO PESSOAL", -227.57)).toBe(-227.57);
  expect(corrigirSinalPeloHistorico("INSS", -1212)).toBe(1212);
  expect(corrigirSinalPeloHistorico("OPERACOES VENCIDAS", 32722.37)).toBe(32722.37);
  expect(corrigirSinalPeloHistorico("OPERACOES VENCIDAS", -32722.37)).toBe(-32722.37);
});
