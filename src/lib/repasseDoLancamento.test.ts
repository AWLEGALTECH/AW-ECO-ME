import { describe, it, expect } from "bun:test";
import { indexarRepasses, parteDoCliente, type RepasseLancamento } from "./repasseDoLancamento";

const rep = (over: Partial<RepasseLancamento> = {}): RepasseLancamento => ({
  id: "r1",
  lancamento_entrada_id: "L1",
  valor_devido: 2037.79,
  status: "pendente",
  pago_em: null,
  ...over,
});

const entrada = (over: Partial<{ id: string; valor: number | string }> = {}) => ({
  id: "L1", tipo: "entrada" as const, valor: 4075.59, ...over,
});

describe("o caso real que motivou a tela", () => {
  // VANDERGLAUCIA: entraram 4.075,59 do alvará, metade é dela.
  const ix = indexarRepasses([rep()]);
  const p = parteDoCliente(entrada(), ix)!;

  it("diz quanto é do cliente", () => {
    expect(p.devido).toBe(2037.79);
    expect(p.pendente).toBe(true);
  });

  it("diz quanto sobra pro escritório, e a conta fecha", () => {
    expect(p.doEscritorio).toBe(2037.80);
    expect(Number((p.devido + p.doEscritorio).toFixed(2))).toBe(4075.59);
  });

  it("o resumo cabe num selo e já traz o valor", () => {
    expect(p.resumo).toContain("2.037,79");
    expect(p.resumo).toContain("do cliente");
  });

  it("na coluna vai só o número — o cabeçalho já diz do que se trata", () => {
    // o espaço depois de "R$" é NBSP: é o que o Intl produz, e comparar com
    // espaço comum falha por um caractere invisível
    expect(p.curto.replace(/ /g, " ")).toBe("R$ 2.037,79");
    expect(p.curto).not.toContain("cliente");
  });
});

describe("quando não há aviso a dar", () => {
  it("entrada sem repasse é só entrada", () => {
    expect(parteDoCliente(entrada(), indexarRepasses([]))).toBeNull();
  });

  it("a saída que quita o repasse não se anuncia como dinheiro de cliente", () => {
    // ela É o dinheiro do cliente saindo; avisar aqui seria contar duas vezes
    const ix = indexarRepasses([rep()]);
    expect(parteDoCliente({ id: "L1", tipo: "saida", valor: 2037.79 }, ix)).toBeNull();
  });

  it("repasse de valor zero ou inválido não vira aviso", () => {
    expect(parteDoCliente(entrada(), indexarRepasses([rep({ valor_devido: 0 })]))).toBeNull();
    expect(parteDoCliente(entrada(), indexarRepasses([rep({ valor_devido: -10 })]))).toBeNull();
    expect(parteDoCliente(entrada(), indexarRepasses([rep({ valor_devido: "abc" })]))).toBeNull();
  });

  it("repasse de outro lançamento não contamina este", () => {
    const ix = indexarRepasses([rep({ lancamento_entrada_id: "OUTRO" })]);
    expect(parteDoCliente(entrada(), ix)).toBeNull();
  });
});

describe("repasse já pago", () => {
  const ix = indexarRepasses([rep({ status: "pago", pago_em: "2026-08-31" })]);
  const p = parteDoCliente(entrada(), ix)!;

  it("continua aparecendo, mas como fato consumado", () => {
    expect(p.pendente).toBe(false);
    expect(p.resumo).toBe("já repassado");
    // sem valor na coluna: repetir o número sugeriria que ainda há o que pagar
    expect(p.curto).toBe("repassado");
  });

  it("o aviso conta quando saiu", () => {
    expect(p.aviso).toContain("31/08");
    expect(p.aviso).toContain("já foram repassados");
  });

  it("sem data de pagamento, não inventa uma", () => {
    const semData = parteDoCliente(entrada(), indexarRepasses([rep({ status: "pago" })]))!;
    expect(semData.aviso).not.toContain("em ");
    expect(semData.aviso).toContain("já foram repassados");
  });
});

describe("dado torto não vira número negativo na tela", () => {
  it("repasse maior que a entrada zera a parte do escritório", () => {
    const ix = indexarRepasses([rep({ valor_devido: 9000 })]);
    const p = parteDoCliente(entrada(), ix)!;
    expect(p.doEscritorio).toBe(0);
    expect(p.devido).toBe(9000);
  });
});

describe("o índice", () => {
  it("aguenta lista nula", () => {
    expect(indexarRepasses(null).size).toBe(0);
    expect(indexarRepasses(undefined).size).toBe(0);
  });

  it("ignora repasse sem lançamento de origem", () => {
    expect(indexarRepasses([rep({ lancamento_entrada_id: "" as string })]).size).toBe(0);
  });

  it("dois repasses no mesmo lançamento: fica com o primeiro, não soma", () => {
    // somar esconderia o dado duplicado; a aba de repasses mostra os dois
    const ix = indexarRepasses([rep({ id: "a" }), rep({ id: "b", valor_devido: 500 })]);
    expect(ix.size).toBe(1);
    expect(ix.get("L1")!.id).toBe("a");
  });

  it("valores em string (como vêm do Postgres numeric) somam certo", () => {
    const ix = indexarRepasses([rep({ valor_devido: "2037.79" })]);
    const p = parteDoCliente({ id: "L1", tipo: "entrada", valor: "4075.59" }, ix)!;
    expect(p.devido).toBe(2037.79);
    expect(p.doEscritorio).toBe(2037.80);
  });
});
