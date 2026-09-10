import { test, expect } from "bun:test";
import {
  normalizarRubrica, canonizar, resumoDaAnalise, acoesDaAnalise,
  ordenarAnalises, filtrarAnalises, type AnaliseSalva,
} from "./analiseParaAcoes";

/* O catálogo real, encurtado: repare nas três Moras. É por causa delas que
   "Mora de Crédito" não pode virar "Mora" por adivinhação. */
const CATALOGO = [
  "Mora", "Mora - operações", "Mora - cartão de crédito",
  "Emissão de extrato", "Saque em terminal", "Parcela de crédito pessoal",
  "Título de capitalização", "Reorganização financeira",
];

const analise = (over: Partial<AnaliseSalva> = {}): AnaliseSalva => ({
  id: "a1",
  nome: "JOSE ALMYR ARAUJO LOPES",
  rubricas: [
    { rubrica: "Emissão de Extrato", valor: 12.5, bloqueada: false, motivo: null },
    { rubrica: "Mora de Crédito", valor: 3811.07, bloqueada: true, motivo: "rubrica_invalida" },
  ],
  created_at: "2026-09-10T16:14:50Z",
  ...over,
});

test("o nome da rubrica perde acento, caixa e pontuação", () => {
  expect(normalizarRubrica("Emissão de Extrato")).toBe("emissao de extrato");
  expect(normalizarRubrica("RMC - Reserva de Margem")).toBe("rmc reserva de margem");
  expect(normalizarRubrica("")).toBe("");
});

test("o que é a mesma rubrica escrita diferente vira o nome do catálogo", () => {
  expect(canonizar("Emissão de Extrato", CATALOGO)).toBe("Emissão de extrato");
  expect(canonizar("TITULO DE CAPITALIZACAO", CATALOGO)).toBe("Título de capitalização");
});

test("o que não bate exatamente entra com o nome da análise", () => {
  // três Moras no catálogo: escolher uma seria trocar a ação contratada
  expect(canonizar("Mora de Crédito", CATALOGO)).toBe("Mora de Crédito");
  expect(canonizar("Pacotes e Cestas", CATALOGO)).toBe("Pacotes e Cestas");
  expect(canonizar("  ", CATALOGO)).toBe("");
});

test("a análise vira ações com o réu que se escolheu", () => {
  const { acoes, repetidas } = acoesDaAnalise(analise(), {
    catalogo: CATALOGO, requerido: "Bradesco", contratoId: "ct1", grupoId: null,
  });
  expect(repetidas).toBe(0);
  expect(acoes).toHaveLength(2);
  expect(acoes[0].rubrica).toBe("Emissão de extrato");
  expect(acoes[0].requerido).toBe("Bradesco");
  expect(acoes[0].contrato_id).toBe("ct1");
  expect(acoes[0].id).toBeNull();
  // o bloqueio e o motivo vêm da análise, não se perdem no caminho
  expect(acoes[1].bloqueada).toBe(true);
  expect(acoes[1].motivo).toBe("rubrica_invalida");
});

test("o valor do extrato vira o detalhe da ação", () => {
  const { acoes } = acoesDaAnalise(analise(), { catalogo: CATALOGO });
  expect(acoes[0].detalhe).toContain("12,50");
  // sem valor, o detalhe fica vazio em vez de "extrato: —"
  const semValor = acoesDaAnalise(analise({ rubricas: [{ rubrica: "X" }] }), {});
  expect(semValor.acoes[0].detalhe).toBe("");
});

test("motivo estranho vira o padrão, e não quebra a linha", () => {
  const { acoes } = acoesDaAnalise(
    analise({ rubricas: [{ rubrica: "X", bloqueada: true, motivo: "sei_la" }] }), {});
  expect(acoes[0].motivo).toBe("rubrica_invalida");
});

test("puxar duas vezes não duplica a leva", () => {
  const primeira = acoesDaAnalise(analise(), { catalogo: CATALOGO, requerido: "Bradesco" });
  const segunda = acoesDaAnalise(analise(), {
    catalogo: CATALOGO, requerido: "Bradesco",
    jaNaLeva: primeira.acoes.map((a) => ({ rubrica: a.rubrica, requerido: a.requerido })),
  });
  expect(segunda.acoes).toHaveLength(0);
  expect(segunda.repetidas).toBe(2);
});

test("a mesma rubrica contra outro réu não é repetição", () => {
  const primeira = acoesDaAnalise(analise(), { catalogo: CATALOGO, requerido: "Bradesco" });
  const outra = acoesDaAnalise(analise(), {
    catalogo: CATALOGO, requerido: "Itaú",
    jaNaLeva: primeira.acoes.map((a) => ({ rubrica: a.rubrica, requerido: a.requerido })),
  });
  expect(outra.acoes).toHaveLength(2);
  expect(outra.repetidas).toBe(0);
});

test("rubrica sem nome não vira ação", () => {
  const { acoes } = acoesDaAnalise(analise({ rubricas: [{ rubrica: "   " }, { rubrica: "Ok" }] }), {});
  expect(acoes).toHaveLength(1);
});

test("análise vazia não derruba nada", () => {
  expect(acoesDaAnalise({ id: "x", nome: "", rubricas: [] }, {})).toEqual({ acoes: [], repetidas: 0 });
});

test("o resumo se lê sem legenda", () => {
  expect(resumoDaAnalise(analise())).toBe("2 rubricas · 1 não ajuizável");
  expect(resumoDaAnalise(analise({ rubricas: [{ rubrica: "X" }] }))).toBe("1 rubrica");
});

test("a análise deste cliente vem primeiro, depois a do nome dele", () => {
  const lista: AnaliseSalva[] = [
    analise({ id: "velha", nome: "OUTRA PESSOA", created_at: "2026-01-01T00:00:00Z" }),
    analise({ id: "nova", nome: "ALGUEM MAIS", created_at: "2026-09-01T00:00:00Z" }),
    analise({ id: "donome", nome: "José Almyr Araújo Lopes", created_at: "2026-02-01T00:00:00Z" }),
    analise({ id: "dele", nome: "QUALQUER", cliente_id: "c1", created_at: "2025-01-01T00:00:00Z" }),
  ];
  const ordem = ordenarAnalises(lista, { id: "c1", nome: "JOSÉ ALMYR ARAÚJO LOPES" })
    .map((a) => a.id);
  expect(ordem).toEqual(["dele", "donome", "nova", "velha"]);
});

test("nome escrito por outra mão ainda sobe na lista", () => {
  const lista: AnaliseSalva[] = [
    analise({ id: "recente", nome: "ZZZ", created_at: "2026-09-09T00:00:00Z" }),
    analise({ id: "parcial", nome: "Jose Almyr Lopes", created_at: "2026-01-01T00:00:00Z" }),
  ];
  expect(ordenarAnalises(lista, { nome: "JOSE ALMYR ARAUJO LOPES" })[0].id).toBe("parcial");
});

test("sem cliente para comparar, sobra a data", () => {
  const lista: AnaliseSalva[] = [
    analise({ id: "a", created_at: "2026-01-01T00:00:00Z" }),
    analise({ id: "b", created_at: "2026-09-01T00:00:00Z" }),
  ];
  expect(ordenarAnalises(lista).map((x) => x.id)).toEqual(["b", "a"]);
});

test("a busca acha por nome, por CPF e pela rubrica que a análise contém", () => {
  const lista = [analise({ id: "a", cpf_cnpj: "390.003.629-20" }), analise({ id: "b", nome: "MARIA" , rubricas: []})];
  expect(filtrarAnalises(lista, "almyr").map((x) => x.id)).toEqual(["a"]);
  expect(filtrarAnalises(lista, "39000362920").map((x) => x.id)).toEqual(["a"]);
  expect(filtrarAnalises(lista, "mora").map((x) => x.id)).toEqual(["a"]);
  expect(filtrarAnalises(lista, "")).toHaveLength(2);
  expect(filtrarAnalises(lista, "zzz")).toHaveLength(0);
});
