import { test, expect } from "bun:test";
import { jaRecebido, emAberto, ACORDO_TRATATIVA, type Vitoria } from "./tracker";

/* O TRACKER É SOBRE O QUE AINDA VAI ENTRAR.
 *
 * Antes, o "total ganho em 1º grau" somava toda sentença procedente, inclusive
 * as já recebidas — uma condenação paga em março continuava no número de
 * setembro. A previsão do mês virava um alvo que ninguém batia, porque metade
 * dele já estava na conta. Estes testes travam as duas portas de saída. */

const v = (o: Partial<Vitoria> = {}): Vitoria => ({
  id: "p", numero_processo: "0000001-11.2026.8.04.0001", materia: "Cível",
  comarca_uf: "Manaus/AM", cliente_nome: "Fulano", cliente_id: null,
  valor: 1000, valorSentenca: 1000, origem: "sentenca", data: "2026-03-01",
  faseAtual: "Sentença", emCumprimento: false, valorCumprimento: 0,
  acordo: null, baixado: false, viaBaixa: null,
  ...o,
});

test("quem não recebeu continua na conta", () => {
  expect(jaRecebido(v())).toBe(false);
  expect(jaRecebido(v({ acordo: { valor: 500, fechamento: null, previsao: null, status: ACORDO_TRATATIVA, pago: false } }))).toBe(false);
});

test("a baixa tira da conta: o alvará caiu e o processo foi para o Wallet", () => {
  expect(jaRecebido(v({ baixado: true }))).toBe(true);
});

test("o acordo pago também tira, e é a porta que estava esquecida", () => {
  /* Olhar só a baixa deixava os acordos quitados dentro da previsão: o card
     mostrava "aguardando pagamento R$ 0" e mesmo assim contava o valor deles
     no total fechado. */
  expect(jaRecebido(v({ acordo: { valor: 500, fechamento: null, previsao: null, status: "ACORDO PAGO", pago: true } }))).toBe(true);
});

test("basta uma das duas portas", () => {
  expect(jaRecebido(v({ baixado: true, acordo: { valor: 500, fechamento: null, previsao: null, status: ACORDO_TRATATIVA, pago: false } }))).toBe(true);
});

test("emAberto separa a previsão do histórico, e não perde ninguém", () => {
  const lista = [
    v({ id: "a" }),
    v({ id: "b", baixado: true }),
    v({ id: "c", acordo: { valor: 500, fechamento: null, previsao: null, status: "ACORDO PAGO", pago: true } }),
    v({ id: "d" }),
  ];
  const abertos = emAberto(lista);
  expect(abertos.map((x) => x.id)).toEqual(["a", "d"]);
  // o que saiu não sumiu do mundo: continua na lista original, para o bloco
  // de recebidos mostrar o giro
  expect(lista.length - abertos.length).toBe(2);
});

test("lista vazia não quebra", () => {
  expect(emAberto([])).toEqual([]);
});
