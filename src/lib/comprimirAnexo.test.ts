import { test, expect } from "bun:test";
import {
  vaiComprimir, dimensaoAlvo, nomeComprimido, tamanhoBonito,
  caminhoDoAnexo, tipoDoAnexo, MINIMO_PARA_COMPRIMIR, LADO_MAXIMO,
} from "./comprimirAnexo";

const KB = 1024;
const MB = 1024 * 1024;

/* A COMPRESSÃO É O QUE FAZ O ANEXO CABER NO PLANO: ~15 MB por mês em vez de
   ~150 MB. Mas a regra é conservadora de propósito: na dúvida, sobe como veio.
   Anexo pesado é problema de conta no fim do mês; anexo ilegível é um chamado
   que não dá para responder. */

test("print de Mac em PNG é exatamente o caso que interessa", () => {
  expect(vaiComprimir("image/png", 3 * MB)).toBe(true);
  expect(vaiComprimir("image/jpeg", 1.2 * MB)).toBe(true);
});

test("imagem pequena fica como está", () => {
  // Reprocessar uma de 80 KB costuma AUMENTAR o arquivo.
  expect(vaiComprimir("image/png", 80 * KB)).toBe(false);
  expect(vaiComprimir("image/png", MINIMO_PARA_COMPRIMIR)).toBe(false);
  expect(vaiComprimir("image/png", MINIMO_PARA_COMPRIMIR + 1)).toBe(true);
});

test("PDF, áudio e vídeo não passam por aqui", () => {
  expect(vaiComprimir("application/pdf", 5 * MB)).toBe(false);
  expect(vaiComprimir("audio/webm", 5 * MB)).toBe(false);
  expect(vaiComprimir("video/mp4", 5 * MB)).toBe(false);
});

test("GIF fica de fora: virar WebP estático mataria a animação", () => {
  expect(vaiComprimir("image/gif", 5 * MB)).toBe(false);
});

test("o mime vem com sujeira do navegador e a conta aguenta", () => {
  expect(vaiComprimir("IMAGE/PNG", 3 * MB)).toBe(true);
  expect(vaiComprimir("image/jpeg; charset=binary", 3 * MB)).toBe(true);
  expect(vaiComprimir(null, 3 * MB)).toBe(false);
  expect(vaiComprimir(undefined, 3 * MB)).toBe(false);
});

/* ── o tamanho ── */

test("print grande encolhe mantendo a proporção", () => {
  // 2880x1800 (tela cheia de Mac) vira 1600x1000
  expect(dimensaoAlvo(2880, 1800)).toEqual({ largura: LADO_MAXIMO, altura: 1000 });
});

test("imagem em pé também respeita o maior lado", () => {
  expect(dimensaoAlvo(900, 3200)).toEqual({ largura: 450, altura: LADO_MAXIMO });
});

test("imagem menor que o teto NÃO é ampliada", () => {
  /* Esticar um print de 800px para 1600 gastaria quatro vezes mais bytes para
     mostrar a mesma coisa, borrada. */
  expect(dimensaoAlvo(800, 600)).toEqual({ largura: 800, altura: 600 });
});

test("nunca devolve lado zero", () => {
  // Uma faixa de 4000x1 não pode virar altura 0, que o canvas recusa.
  expect(dimensaoAlvo(4000, 1).altura).toBe(1);
});

/* ── nome e caminho ── */

test("a extensão vira webp, o resto do nome fica", () => {
  expect(nomeComprimido("Captura de Tela 2026-09-19.png")).toBe("Captura de Tela 2026-09-19.webp");
  expect(nomeComprimido("print")).toBe("print.webp");
  expect(nomeComprimido("")).toBe("imagem.webp");
});

test("o caminho não carrega o nome original", () => {
  /* Nome de arquivo tem acento, espaço e barra; o path do Storage aceita bem
     menos que isso. Guarda só a extensão. */
  const p = caminhoDoAnexo("abc-123", "Ação do usuário (1).PNG", 1789800000000);
  expect(p).toStartWith("abc-123/1789800000000-");
  expect(p).toEndWith(".png");
  expect(p).not.toContain(" ");
  expect(p).not.toContain("ç");
});

test("arquivo sem extensão não vira caminho com ponto solto", () => {
  const p = caminhoDoAnexo("abc", "arquivo", 1);
  expect(p).toMatch(/^abc\/1-[a-z0-9]+$/);
});

test("dois anexos no mesmo milissegundo não colidem", () => {
  const a = caminhoDoAnexo("x", "a.png", 1789800000000);
  const b = caminhoDoAnexo("x", "a.png", 1789800000000);
  expect(a).not.toBe(b);
});

/* ── rótulos ── */

test("o tipo sai do mime, no vocabulário da tabela", () => {
  expect(tipoDoAnexo("image/webp")).toBe("imagem");
  expect(tipoDoAnexo("audio/webm;codecs=opus")).toBe("audio");
  expect(tipoDoAnexo("application/pdf")).toBe("documento");
  expect(tipoDoAnexo(null)).toBe("documento");
});

test("o tamanho é lido por gente", () => {
  expect(tamanhoBonito(512)).toBe("512 B");
  expect(tamanhoBonito(240 * KB)).toBe("240 KB");
  expect(tamanhoBonito(2.4 * MB)).toBe("2,4 MB");
});
