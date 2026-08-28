// O diálogo de ações ajuizáveis zera seu estado quando abre. A regra de QUANDO
// zerar já falhou em produção, e a falha não foi visual: o diálogo reabria com
// o `selOriginal` da sessão anterior — a foto contra a qual o diff calcula o
// que SAI da leva. A conferência mostrava ações saindo de uma leva que a pessoa
// não tinha aberto, e confirmar removia rubricas de verdade do fechamento.
//
// A causa foi gravar a chave só com o diálogo aberto: duas aberturas seguidas
// davam a mesma chave, e a segunda não era reconhecida como nova.

import { test, expect } from "bun:test";
import { decidirReinicio } from "@/lib/analiseLevas";

/** Roda uma sequência de estados e devolve em quais passos houve reinício. */
function sequencia(passos: { cliente?: string; aberto: boolean }[]) {
  let chave = "";
  return passos.map((p) => {
    const r = decidirReinicio(chave, p.cliente, p.aberto);
    chave = r.chave;
    return r.reiniciar;
  });
}

test("abrir pela primeira vez reinicia", () => {
  expect(sequencia([{ cliente: "c1", aberto: true }])).toEqual([true]);
});

// A regressão: abre, fecha, abre de novo. O terceiro passo TEM que reiniciar.
test("abrir de novo depois de fechar reinicia outra vez", () => {
  expect(
    sequencia([
      { cliente: "c1", aberto: true },
      { cliente: "c1", aberto: false },
      { cliente: "c1", aberto: true },
    ]),
  ).toEqual([true, true, true]);
});

test("re-render com o diálogo parado não reinicia", () => {
  expect(
    sequencia([
      { cliente: "c1", aberto: true },
      { cliente: "c1", aberto: true },
      { cliente: "c1", aberto: true },
    ]),
  ).toEqual([true, false, false]);
});

test("trocar de cliente com o diálogo aberto reinicia", () => {
  expect(
    sequencia([
      { cliente: "c1", aberto: true },
      { cliente: "c2", aberto: true },
    ]),
  ).toEqual([true, true]);
});

test("abre e fecha várias vezes: toda abertura reinicia", () => {
  const passos = [];
  for (let i = 0; i < 4; i++) {
    passos.push({ cliente: "c1", aberto: true }, { cliente: "c1", aberto: false });
  }
  const r = sequencia(passos);
  // todos os passos alternam, então todos mudam de chave
  expect(r).toEqual([true, true, true, true, true, true, true, true]);
  // e o que importa: nenhuma das 4 aberturas ficou sem reinício
  expect([r[0], r[2], r[4], r[6]]).toEqual([true, true, true, true]);
});

test("sem cliente não confunde com cliente vazio aberto", () => {
  expect(
    sequencia([
      { cliente: undefined, aberto: false },
      { cliente: undefined, aberto: true },
    ]),
  ).toEqual([true, true]);
});
