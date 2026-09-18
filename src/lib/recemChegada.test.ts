import { test, expect } from "bun:test";
import { recemChegada, compararNaCaixa, type LinhaDaCaixa } from "./recemChegada";

/* O CASO REAL: a Ediene repassada para o Dr. Matheus Enes Corporativo em
   18/09. Conversa criada, linha certa, e invisível — porque `ultima_em` era
   nulo e o nulo vale zero na ordenação por última mensagem. Ela era a última
   de sessenta e nove. */

const CHEGADA = "2026-09-18T20:32:50Z";

const linha = (o: Partial<LinhaDaCaixa> = {}): LinhaDaCaixa => ({
  fixadaEm: null, movidaEm: null, movidaDe: null,
  podeEscrever: true, ultimaEm: null, ...o,
});

const recebida = (o: Partial<LinhaDaCaixa> = {}) =>
  linha({ movidaEm: CHEGADA, movidaDe: "PORTAL DIREITO ABERTO 2", ...o });

test("repassada e sem mensagem nenhuma: é recém-chegada", () => {
  expect(recemChegada(recebida())).toBe(true);
});

test("a conversa comum não é", () => {
  expect(recemChegada(linha({ ultimaEm: "2026-09-18T17:00:00Z" }))).toBe(false);
});

test("mensagem DEPOIS do repasse tira ela da faixa", () => {
  /* É o que esvazia a faixa sozinha: no instante em que alguém responde, ou o
     lead escreve, a conversa passa a ter carimbo próprio. */
  expect(recemChegada(recebida({ ultimaEm: "2026-09-18T21:00:00Z" }))).toBe(false);
});

test("mensagem ANTES do repasse não conta: ela veio do número antigo", () => {
  /* A conversa já existia lá e foi movida com histórico. O carimbo velho não
     prova que alguém trabalhou nela AQUI. */
  expect(recemChegada(recebida({ ultimaEm: "2026-09-18T17:11:11Z" }))).toBe(true);
});

test("no número que ENTREGOU, não sobe", () => {
  // Lá ela é só leitura, e não é tarefa de ninguém.
  expect(recemChegada(recebida({ podeEscrever: false }))).toBe(false);
});

test("sem carimbo de repasse, não é repasse", () => {
  expect(recemChegada(linha({ movidaDe: "PORTAL DIREITO ABERTO" }))).toBe(false);
  expect(recemChegada(recebida({ movidaEm: "não é data" }))).toBe(false);
});

/* ── a ordem ── */

test("a recém-chegada passa na frente de quem falou hoje cedo", () => {
  const nova = recebida();
  const hoje = linha({ ultimaEm: "2026-09-18T19:00:00Z" });
  expect([hoje, nova].sort(compararNaCaixa)[0]).toBe(nova);
});

test("mas nunca na frente de uma fixada", () => {
  const nova = recebida();
  const presa = linha({ fixadaEm: "2026-09-01T10:00:00Z", ultimaEm: "2026-08-01T10:00:00Z" });
  expect([nova, presa].sort(compararNaCaixa)[0]).toBe(presa);
});

test("entre recém-chegadas, a última a chegar fica em cima", () => {
  const antes = recebida({ movidaEm: "2026-09-18T10:00:00Z" });
  const depois = recebida({ movidaEm: "2026-09-18T20:32:50Z" });
  expect([antes, depois].sort(compararNaCaixa)[0]).toBe(depois);
});

test("o resto da caixa continua pela última mensagem", () => {
  const velha = linha({ ultimaEm: "2026-09-10T10:00:00Z" });
  const nova = linha({ ultimaEm: "2026-09-18T10:00:00Z" });
  expect([velha, nova].sort(compararNaCaixa)[0]).toBe(nova);
});

test("a caixa inteira, na ordem: fixada, chegou agora, o resto por recência", () => {
  const presa = linha({ fixadaEm: "2026-09-01T10:00:00Z" });
  const chegou = recebida();
  const falouAgora = linha({ ultimaEm: "2026-09-18T21:30:00Z" });
  const falouOntem = linha({ ultimaEm: "2026-09-17T09:00:00Z" });
  const semNada = linha();
  const ordenada = [falouOntem, semNada, chegou, falouAgora, presa].sort(compararNaCaixa);
  expect(ordenada).toEqual([presa, chegou, falouAgora, falouOntem, semNada]);
});

test("conversa sem mensagem que NÃO veio de repasse continua no fim", () => {
  /* A criada pelo "+" e ainda sem resposta não tem por que furar a fila: ela
     está ali porque alguém acabou de criá-la e sabe onde procurar. */
  const criada = linha();
  const chegou = recebida();
  expect([criada, chegou].sort(compararNaCaixa)[0]).toBe(chegou);
});
