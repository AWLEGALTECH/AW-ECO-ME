import { test, expect } from "bun:test";
import {
  escalaDeCobertura, tamanhoNoQuadro, limitarDeslocamento, posicaoNoQuadro,
  ZOOM_MINIMO, ZOOM_MAXIMO,
} from "./recorteDeFoto";

/* AS DUAS REGRAS DO ENCAIXE: a foto recua até um limite (metade do quadro), e
   nunca desgruda da borda. A primeira queixa real foi uma foto quadrada que
   nascia colada no círculo, sem nada para personalizar. */

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

test("a foto recua até metade do quadro, e não mais que isso", () => {
  /* Recuar é o que faltava; recuar sem limite viraria um selo no meio do
     círculo. Meio quadro é o ponto em que a foto inteira cabe com folga. */
  expect(limitarDeslocamento(1200, 600, Q, { zoom: 0.1, dx: 0, dy: 0 }).zoom).toBe(ZOOM_MINIMO);
  expect(limitarDeslocamento(1200, 600, Q, { zoom: 99, dx: 0, dy: 0 }).zoom).toBe(ZOOM_MAXIMO);
  // foto quadrada recuada a 0.5 mede metade do quadro
  expect(tamanhoNoQuadro(900, 900, Q, 0.5).w).toBe(Q / 2);
});

test("menor que o quadro, a foto anda até encostar por DENTRO", () => {
  // quadrada em 0.5: mede 150 num quadro de 300, pode andar 75 para cada lado
  const e = limitarDeslocamento(900, 900, Q, { zoom: 0.5, dx: 999, dy: -999 });
  expect(e.dx).toBe(75);
  expect(e.dy).toBe(-75);
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

/* ── a posição que a tela desenha e o canvas repete ── */

test("centrada e sem zoom, a foto paisagem fica encostada em cima e centrada em x", () => {
  const p = posicaoNoQuadro(1200, 600, Q, { zoom: 1, dx: 0, dy: 0 });
  expect(p).toEqual({ x: -150, y: 0, w: 600, h: 300 });
});

test("arrastar para a DIREITA move a foto para a direita, e é o lado esquerdo dela que entra no círculo", () => {
  /* É o gesto do WhatsApp. O que se testa é o sinal: com dx positivo a borda
     esquerda da foto (x) aproxima-se de zero, ou seja, o começo da foto entra
     no quadro. Errar o sinal faria o rosto sair no instante em que a pessoa
     achou que tinha encaixado. */
  const p = posicaoNoQuadro(1200, 600, Q, { zoom: 1, dx: 150, dy: 0 });
  expect(p.x).toBe(0);
  const l = posicaoNoQuadro(1200, 600, Q, { zoom: 1, dx: -150, dy: 0 });
  expect(l.x).toBe(-300);
});

test("com zoom, a foto cresce em volta do centro", () => {
  const p = posicaoNoQuadro(1200, 600, Q, { zoom: 2, dx: 0, dy: 0 });
  expect(p).toEqual({ x: -450, y: -150, w: 1200, h: 600 });
});

test("recuada, a foto fica inteira dentro do quadro, com fundo em volta", () => {
  const p = posicaoNoQuadro(900, 900, Q, { zoom: 0.5, dx: 0, dy: 0 });
  expect(p).toEqual({ x: 75, y: 75, w: 150, h: 150 });
});

test("imagem menor que o quadro é ampliada em vez de deixar fundo vazio", () => {
  const { w, h } = tamanhoNoQuadro(100, 80, Q, 1);
  expect(Math.min(w, h)).toBe(Q);
});
