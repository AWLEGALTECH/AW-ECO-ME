import { test, expect } from "bun:test";
import {
  podeApagarParaTodos, podeEditar, minutosRestantesParaEditar,
  estadoDaApagada, textoDaTarja, detalheDaTarja,
  JANELA_APAGAR_HORAS, JANELA_EDITAR_MIN,
} from "./mensagemAcoes";

/* A JANELA É DO WHATSAPP, E ELE NÃO NEGOCIA.
 *
 * Fora dela a Evolution recusa, e o custo de errar não é um erro na tela: é
 * alguém achando que apagou uma mensagem que o cliente continua vendo. */

const agora = (minAtras: number) => new Date(Date.now() - minAtras * 60_000).toISOString();

const nossa = (o: Partial<Parameters<typeof podeApagarParaTodos>[0]> = {}) => ({
  id: "m1", de: "nos" as const, tipo: "texto", criadaEm: agora(1),
  apagada: false, idWhatsapp: "3EB0ABC", ...o,
});

test("mensagem nossa e recente pode ser apagada para todos", () => {
  expect(podeApagarParaTodos(nossa())).toBe(true);
});

test("a do cliente não: o WhatsApp não deixa apagar mensagem alheia", () => {
  /* Para essa existe o "apagar para mim", que é outra coisa: some daqui e
     continua lá. Oferecer "para todos" seria prometer o impossível. */
  expect(podeApagarParaTodos(nossa({ de: "lead" }))).toBe(false);
});

test("passou das 48 horas, some o item em vez de falhar depois", () => {
  expect(podeApagarParaTodos(nossa({ criadaEm: agora(JANELA_APAGAR_HORAS * 60 + 1) }))).toBe(false);
  expect(podeApagarParaTodos(nossa({ criadaEm: agora(JANELA_APAGAR_HORAS * 60 - 1) }))).toBe(true);
});

test("já apagada não apaga de novo", () => {
  expect(podeApagarParaTodos(nossa({ apagada: true }))).toBe(false);
});

test("bolha que ainda não virou linha não tem o que revogar", () => {
  /* Enquanto a Evolution não responde, a mensagem existe só na tela: não há
     id no banco nem chave no WhatsApp. */
  expect(podeApagarParaTodos(nossa({ id: null }))).toBe(false);
  expect(podeApagarParaTodos(nossa({ idWhatsapp: null }))).toBe(false);
});

test("sem carimbo de quando saiu, trava", () => {
  // Melhor não oferecer do que oferecer e a Evolution recusar.
  expect(podeApagarParaTodos(nossa({ criadaEm: null }))).toBe(false);
  expect(podeApagarParaTodos(nossa({ criadaEm: "não é data" }))).toBe(false);
});

/* ── editar ── */

test("texto nosso, dentro de 15 minutos, pode editar", () => {
  expect(podeEditar(nossa({ criadaEm: agora(14) }))).toBe(true);
  expect(podeEditar(nossa({ criadaEm: agora(16) }))).toBe(false);
});

test("a janela de editar é MUITO menor que a de apagar", () => {
  /* Uma hora depois ainda dá para apagar, e já não dá para editar. As duas
     regras não podem compartilhar a mesma constante. */
  const umaHora = nossa({ criadaEm: agora(60) });
  expect(podeApagarParaTodos(umaHora)).toBe(true);
  expect(podeEditar(umaHora)).toBe(false);
});

test("só texto se edita", () => {
  expect(podeEditar(nossa({ tipo: "imagem" }))).toBe(false);
  expect(podeEditar(nossa({ tipo: "audio" }))).toBe(false);
  expect(podeEditar(nossa({ tipo: "documento" }))).toBe(false);
  // tipo ausente é texto: é assim que as bolhas antigas estão no banco
  expect(podeEditar(nossa({ tipo: null }))).toBe(true);
});

test("a do cliente não se edita", () => {
  expect(podeEditar(nossa({ de: "lead" }))).toBe(false);
});

test("o que sobra da janela vem em minutos inteiros, e nunca negativo", () => {
  expect(minutosRestantesParaEditar(nossa({ criadaEm: agora(0) }))).toBe(JANELA_EDITAR_MIN);
  expect(minutosRestantesParaEditar(nossa({ criadaEm: agora(14.2) }))).toBe(1);
  expect(minutosRestantesParaEditar(nossa({ criadaEm: agora(600) }))).toBe(0);
});

/* ── a tarja: as três situações não podem se confundir ──────────────────────
 *
 * Trocar uma frase pela outra é o erro caro e silencioso desta tela: quem lê
 * "apagada para todos" numa mensagem que só foi tirada daqui vai parar de
 * cobrar uma resposta que o cliente ainda pode dar. */

test("o cliente apagou a mensagem DELE", () => {
  const m = { de: "lead" as const, apagada: true };
  expect(estadoDaApagada(m)).toBe("cliente");
  expect(textoDaTarja(estadoDaApagada(m))).toBe("Mensagem apagada pelo cliente");
  expect(detalheDaTarja(estadoDaApagada(m))).toContain("Aqui fica registrada");
});

test("nós apagamos para todos: a mesma marca, outra frase", () => {
  const m = { de: "nos" as const, apagada: true };
  expect(estadoDaApagada(m)).toBe("todos");
  expect(textoDaTarja(estadoDaApagada(m))).toBe("Mensagem apagada para todos");
});

test("só para mim não é apagar para todos, e a frase diz isso", () => {
  const m = { de: "nos" as const, soParaMim: true };
  expect(estadoDaApagada(m)).toBe("so_para_mim");
  expect(detalheDaTarja(estadoDaApagada(m))).toContain("continua normal");
});

test("apagada para todos manda na tarja, mesmo tendo sido tirada daqui antes", () => {
  /* Dá para apagar só para mim e depois apagar para todos. O que o cliente vê
     é o que importa na tarja, então "para todos" vence. */
  expect(estadoDaApagada({ de: "nos", apagada: true, soParaMim: true })).toBe("todos");
});

test("mensagem normal não tem tarja nenhuma", () => {
  expect(estadoDaApagada(nossa())).toBeNull();
  expect(textoDaTarja(null)).toBe("");
});
