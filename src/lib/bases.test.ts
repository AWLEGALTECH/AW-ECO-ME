import { test, expect } from "bun:test";
import { saudeDaBase } from "./bases";

test("nunca puxou é cinza, e diz isso", () => {
  const s = saudeDaBase({ ultimo_sync: null, ultimo_erro: null });
  expect(s.cor).toContain("muted-foreground");
  expect(s.titulo).toContain("Nunca");
});

test("puxou e deu certo é verde, com a hora do último puxão", () => {
  const s = saudeDaBase({ ultimo_sync: "2026-09-15T14:00:00Z", ultimo_erro: null }, () => "11:00");
  expect(s.cor).toContain("emerald");
  expect(s.titulo).toContain("11:00");
});

test("ressalva é âmbar, e o título é a ressalva inteira", () => {
  // o motivo de a fila estar vazia não pode virar um rótulo genérico: é ele que
  // diz o que consertar
  const erro = 'A aba lida ("Leads") só tem o cabeçalho e nenhuma linha de dados.';
  const s = saudeDaBase({ ultimo_sync: "2026-09-15T14:00:00Z", ultimo_erro: erro });
  expect(s.cor).toContain("amber");
  expect(s.titulo).toBe(erro);
});

test("erro vence a hora: base que puxou com ressalva não é verde", () => {
  const s = saudeDaBase({ ultimo_sync: "2026-09-15T14:00:00Z", ultimo_erro: "algo" }, () => "11:00");
  expect(s.cor).not.toContain("emerald");
});
