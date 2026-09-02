import { describe, it, expect } from "bun:test";
import { descreverEvento, lerHistorico, valorDoCampo, rotuloCampo } from "./historicoLancamento";

const dic = {
  categoria: (id: string) => (id === "cat1" ? "Alvará recebido" : undefined),
  conta: (id: string) => (id === "c1" ? "Caixa" : undefined),
  cliente: (id: string) => (id === "cl1" ? "VANDERGLAUCIA JACOB DE ANDRADE SOUZA" : undefined),
};

const semNbsp = (s: string) => s.replace(/ /g, " ");

describe("o valor de cada campo em português", () => {
  it("dinheiro vira moeda", () => {
    expect(semNbsp(valorDoCampo("valor", 4075.59))).toBe("R$ 4.075,59");
    expect(semNbsp(valorDoCampo("valor", "4075.59"))).toBe("R$ 4.075,59");
  });

  it("data ISO vira dia brasileiro", () => {
    expect(valorDoCampo("data", "2026-09-01")).toBe("01/09/2026");
    expect(valorDoCampo("pago_em", "2026-08-31")).toBe("31/08/2026");
  });

  it("competência vira mês", () => {
    expect(valorDoCampo("competencia", "2026-08")).toBe("08/2026");
  });

  it("situação e tipo saem por extenso, não pelo código", () => {
    expect(valorDoCampo("status", "previsto")).toBe("ainda vai acontecer");
    expect(valorDoCampo("status", "realizado")).toBe("já aconteceu");
    expect(valorDoCampo("tipo", "saida")).toBe("saída");
    expect(valorDoCampo("tipo", "entrada")).toBe("entrada");
  });

  it("id vira nome quando o dicionário conhece", () => {
    expect(valorDoCampo("categoria_id", "cat1", dic)).toBe("Alvará recebido");
    expect(valorDoCampo("conta_id", "c1", dic)).toBe("Caixa");
    expect(valorDoCampo("cliente_id", "cl1", dic)).toContain("VANDERGLAUCIA");
  });

  it("id desconhecido sai cru em vez de sumir", () => {
    // some seria pior: a linha diria que nada mudou
    expect(valorDoCampo("categoria_id", "xyz", dic)).toBe("xyz");
    expect(valorDoCampo("conta_id", "outra")).toBe("outra");
  });

  it("vazio é dito, não omitido", () => {
    expect(valorDoCampo("observacoes", null)).toBe("vazio");
    expect(valorDoCampo("observacoes", "")).toBe("vazio");
    expect(valorDoCampo("cliente_id", undefined)).toBe("vazio");
  });

  it("campo que eu não previ ainda tem rótulo e valor", () => {
    expect(rotuloCampo("coluna_nova")).toBe("coluna_nova");
    expect(valorDoCampo("coluna_nova", "algo")).toBe("algo");
  });
});

describe("um evento de criação", () => {
  const e = descreverEvento({
    quando: "2026-09-01T19:51:48.587759+00:00",
    acao: "create",
    quem: "Luan Ásaf Lima Fernandes",
    mudancas: null,
  });

  it("diz quem registrou", () => {
    expect(e.quem).toBe("Luan Ásaf Lima Fernandes");
    expect(e.titulo).toBe("registrou o lançamento");
    expect(e.acao).toBe("create");
  });

  it("não tenta listar mudanças", () => {
    expect(e.mudancas).toEqual([]);
  });
});

describe("um evento de edição", () => {
  const e = descreverEvento({
    quando: "2026-09-02T13:18:31.123966+00:00",
    acao: "update",
    quem: "Matheus Ferreira Enes",
    mudancas: {
      valor: { before: "4075.59", after: "4200.00" },
      observacoes: { before: null, after: "conferido com o extrato" },
      updated_at: { before: "a", after: "b" },
      id: { before: "x", after: "y" },
    },
  }, dic);

  it("lista só o que uma pessoa decidiu mudar", () => {
    expect(e.mudancas).toHaveLength(2);
    expect(e.mudancas.join(" ")).not.toContain("updated_at");
    expect(e.mudancas.join(" ")).not.toContain("id:");
  });

  it("escreve cada mudança como antes → depois", () => {
    expect(semNbsp(e.mudancas.join(" | "))).toContain("valor: R$ 4.075,59 → R$ 4.200,00");
    expect(e.mudancas.join(" | ")).toContain("observações: vazio → conferido com o extrato");
  });

  it("mudança que não mudou nada não vira linha", () => {
    const igual = descreverEvento({
      quando: "2026-09-02T13:00:00+00:00", acao: "update", quem: "x",
      mudancas: { valor: { before: 100, after: 100.0 } },
    });
    expect(igual.mudancas).toEqual([]);
    // mas o evento continua existindo: alguém salvou aquilo
    expect(igual.titulo).toBe("editou");
  });
});

describe("a lista inteira", () => {
  const bruto = [
    { quando: "2026-09-01T19:51:48+00:00", acao: "create", quem: "Luan", mudancas: null },
    { quando: "2026-09-02T13:18:31+00:00", acao: "update", quem: "Matheus",
      mudancas: { descricao: { before: "a", after: "b" } } },
  ];

  it("preserva a ordem que veio do banco", () => {
    const l = lerHistorico(bruto);
    expect(l.map((e) => e.acao)).toEqual(["create", "update"]);
  });

  it("aguenta resposta vazia ou torta sem quebrar a tela", () => {
    expect(lerHistorico(null)).toEqual([]);
    expect(lerHistorico([])).toEqual([]);
    expect(lerHistorico("nada")).toEqual([]);
    expect(lerHistorico([{ sem: "quando" }, null, 3])).toEqual([]);
  });

  it("sem autor identificado, o autor é o sistema — não fica em branco", () => {
    const [e] = lerHistorico([{ quando: "2026-09-01T00:00:00+00:00", acao: "create", quem: "  ", mudancas: null }]);
    expect(e.quem).toBe("sistema");
  });

  it("ação que eu não previ não vira linha em branco", () => {
    const [e] = lerHistorico([{ quando: "2026-09-01T00:00:00+00:00", acao: "restore", quem: "x", mudancas: null }]);
    expect(e.acao).toBe("outro");
    expect(e.titulo).toBe("restore");
  });
});
