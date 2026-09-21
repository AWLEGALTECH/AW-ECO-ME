import { test, expect } from "bun:test";
import {
  escalaDeCobertura, tamanhoNoQuadro, limitarDeslocamento, recorteNaImagem,
} from "./recorteDeFoto";

/* AS DUAS REGRAS DO ENCAIXE: a foto nunca fica menor que o círculo, e nunca
   desgruda da borda. Sem elas, "arrastar e dar zoom" vira fundo vazio dentro
   da bola de perfil. */

const Q = 300; // o quadro da tela

test("a escala de cobertura é a que fecha o lado MENOR no quadro", () => {
  // paisagem 1200x600 num quadro de 300: a altura (600) tem que virar 300
  expect(escalaDeCobertura(1200, 600, Q)).toBe(0.5);
  // retrato 600x1200: a largura tem que virar 300
  expect(escalaDeCobertura(600, 1200, Q)).toBe(0.5);
  // quadrada: as duas
  expect(escalaDeCobertura(900, 900, Q)).toBeCloseTo(1 / 3, 6);
});

test("zoom 1 cobre o quadro exatamente; zoom 2 dobra", () => {
  expect(tamanhoNoQuadro(1200, 600, Q, 1)).toEqual({ w: 600, h: 300, escala: 0.5 });
  expect(tamanhoNoQuadro(1200, 600, Q, 2)).toEqual({ w: 1200, h: 600, escala: 1 });
});

test("zoom abaixo de 1 é levado a 1: a foto nunca fica menor que a bola", () => {
  const e = limitarDeslocamento(1200, 600, Q, { zoom: 0.4, dx: 0, dy: 0 });
  expect(e.zoom).toBe(1);
  expect(tamanhoNoQuadro(1200, 600, Q, e.zoom).h).toBe(Q);
});

test("a foto para quando a borda dela encosta na borda do quadro", () => {
  // paisagem em zoom 1: 600 de largura num quadro de 300, pode andar 150 para cada lado
  const e = limitarDeslocamento(1200, 600, Q, { zoom: 1, dx: 999, dy: 999 });
  expect(e.dx).toBe(150);
  // na altura ela é exatamente o quadro: não anda
  expect(e.dy).toBe(0);
  const f = limitarDeslocamento(1200, 600, Q, { zoom: 1, dx: -999, dy: -50 });
  expect(f.dx).toBe(-150);
  expect(f.dy).toBe(0);
});

test("com zoom, sobra folga para andar nas duas direções", () => {
  // 1200x600 em zoom 2 vira 1200x600 no quadro: 450 de folga em x, 150 em y
  const e = limitarDeslocamento(1200, 600, Q, { zoom: 2, dx: 1000, dy: -1000 });
  expect(e.dx).toBe(450);
  expect(e.dy).toBe(-150);
});

/* ── o recorte que sai para o canvas ── */

test("centrado e sem zoom, o recorte é o quadrado central da imagem", () => {
  const r = recorteNaImagem(1200, 600, Q, { zoom: 1, dx: 0, dy: 0 });
  // lado = 300 / 0.5 = 600 px da imagem, centrado em x: começa em 300
  expect(r).toEqual({ sx: 300, sy: 0, sw: 600, sh: 600 });
});

test("arrastar a foto para a DIREITA mostra o lado ESQUERDO dela", () => {
  /* É o gesto do WhatsApp: você puxa a foto, e o que entra no círculo é o
     que estava do outro lado. Errar o sinal aqui faz o rosto sair do quadro
     no momento em que a pessoa achou que tinha encaixado. */
  const r = recorteNaImagem(1200, 600, Q, { zoom: 1, dx: 150, dy: 0 });
  expect(r.sx).toBe(0);
  const l = recorteNaImagem(1200, 600, Q, { zoom: 1, dx: -150, dy: 0 });
  expect(l.sx).toBe(600);
});

test("com zoom, o recorte encolhe na imagem e segue o centro do quadro", () => {
  const r = recorteNaImagem(1200, 600, Q, { zoom: 2, dx: 0, dy: 0 });
  // escala 1: lado = 300 px da imagem, centrado em (600, 300)
  expect(r).toEqual({ sx: 450, sy: 150, sw: 300, sh: 300 });
});

test("o recorte nunca sai da imagem, mesmo com deslocamento absurdo", () => {
  const r = recorteNaImagem(1200, 600, Q, { zoom: 1, dx: 99999, dy: -99999 });
  expect(r.sx).toBeGreaterThanOrEqual(0);
  expect(r.sy).toBeGreaterThanOrEqual(0);
  expect(r.sx + r.sw).toBeLessThanOrEqual(1200);
  expect(r.sy + r.sh).toBeLessThanOrEqual(600);
});

test("imagem menor que o quadro é ampliada em vez de deixar fundo vazio", () => {
  const { w, h } = tamanhoNoQuadro(100, 80, Q, 1);
  expect(Math.min(w, h)).toBe(Q);
  const r = recorteNaImagem(100, 80, Q, { zoom: 1, dx: 0, dy: 0 });
  expect(r.sh).toBe(80);
});
