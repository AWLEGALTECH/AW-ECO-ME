import { describe, expect, it } from "bun:test";
import { derivarVitorias, type ProcRow, type EtapaLT } from "./tracker";

// Monta um processo com só o que interessa para a conta.
function proc(id: string, etapas: EtapaLT[]): ProcRow {
  return {
    id,
    numero_processo: `n-${id}`,
    materia: "Consumidor",
    comarca_uf: "Manaus/AM",
    fase_processual: null,
    linha_temporal: etapas,
    cliente: { id: `c-${id}`, nome: `Cliente ${id}` },
  };
}
const sentenca = (valor: number, data = "2026-05-10", status = "pendente"): EtapaLT =>
  ({ titulo: "Sentença", status, sentenca: { resultado: "procedente", valor, data } });
const acordo = (
  valor: number, fechamento = "2026-08-01", previsao?: string,
  status = "atual", statusProcessual = "AG. PAGAMENTO ACORDO",
): EtapaLT =>
  ({ titulo: "Acordo", status, statusProcessual, acordo: { valor, dataFechamento: fechamento, previsaoPagamento: previsao } });

describe("derivarVitorias — acordo", () => {
  it("acordo sem sentença já é vitória, com o valor do acordo", () => {
    const [v] = derivarVitorias([proc("a", [
      { titulo: "Contestação", status: "pulada" },
      acordo(6000, "2026-08-01", "2026-09-15"),
    ])]);
    expect(v.origem).toBe("acordo");
    expect(v.valor).toBe(6000);
    expect(v.valorSentenca).toBe(0);
    expect(v.faseAtual).toBe("Acordo");
    expect(v.acordo).toEqual({
      valor: 6000, fechamento: "2026-08-01", previsao: "2026-09-15",
      status: "AG. PAGAMENTO ACORDO", pago: false,
    });
    // A data que posiciona a vitória no gráfico por mês é a do fechamento.
    expect(v.data).toBe("2026-08-01");
  });

  it("acordo depois da sentença manda no valor, mas a condenação continua registrada", () => {
    const [v] = derivarVitorias([proc("b", [
      sentenca(10000, "2026-05-10", "concluida"),
      acordo(6000),
    ])]);
    expect(v.valor).toBe(6000);        // é o que vai ser pago
    expect(v.valorSentenca).toBe(10000); // e o 1º grau segue contando como ganho
    expect(v.origem).toBe("acordo");
  });

  it("sem acordo nada muda: continua valendo a sentença", () => {
    const [v] = derivarVitorias([proc("c", [
      sentenca(4200, "2026-04-01", "atual"),
      { titulo: "Acordo", status: "pendente" },   // etapa existe, vazia
    ])]);
    expect(v.origem).toBe("sentenca");
    expect(v.valor).toBe(4200);
    expect(v.acordo).toBeNull();
    expect(v.faseAtual).toBe("Sentença");
  });

  it("etapa de acordo vazia ou zerada não inventa vitória", () => {
    expect(derivarVitorias([
      proc("d", [{ titulo: "Acordo", status: "pendente" }]),
      proc("e", [{ titulo: "Acordo", status: "atual", acordo: { valor: 0 } }]),
      proc("f", [{ titulo: "Sentença", status: "atual", sentenca: { resultado: "improcedente", valor: 0 } }]),
    ])).toEqual([]);
  });

  it("improcedente que virou acordo entra pelo acordo", () => {
    const [v] = derivarVitorias([proc("g", [
      { titulo: "Sentença", status: "concluida", sentenca: { resultado: "improcedente", valor: 0, data: "2026-03-01" } },
      acordo(2500, "2026-07-20"),
    ])]);
    expect(v.origem).toBe("acordo");
    expect(v.valor).toBe(2500);
    expect(v.valorSentenca).toBe(0);
  });

  it("previsão de pagamento ausente vira null, sem quebrar a vitória", () => {
    const [v] = derivarVitorias([proc("h", [acordo(900, "2026-08-05")])]);
    expect(v.acordo?.previsao).toBeNull();
  });

  it("acordo não é cumprimento: o rótulo de valor quase certo não vaza", () => {
    const [v] = derivarVitorias([proc("i", [acordo(3000)])]);
    expect(v.emCumprimento).toBe(false);
  });

  it("no cumprimento, o valor executado ainda prevalece sobre o acordo", () => {
    const [v] = derivarVitorias([proc("j", [
      sentenca(8000, "2026-02-02", "concluida"),
      acordo(6000, "2026-06-01", undefined, "concluida"),
      { titulo: "Cumprimento de sentença", status: "atual", execucao: { valor: 6400, data: "2026-08-10" } },
    ])]);
    expect(v.valor).toBe(6000);
    expect(v.emCumprimento).toBe(true);
    expect(v.valorCumprimento).toBe(6400);
  });

  it("ordena da vitória mais recente para a mais antiga, misturando as origens", () => {
    const vs = derivarVitorias([
      proc("velha", [sentenca(1000, "2026-01-01", "atual")]),
      proc("nova", [acordo(500, "2026-08-15")]),
      proc("meio", [sentenca(2000, "2026-04-04", "atual")]),
    ]);
    expect(vs.map((v) => v.id)).toEqual(["nova", "meio", "velha"]);
  });

  it("linha temporal ausente não derruba a derivação", () => {
    const sem = { ...proc("k", []), linha_temporal: null };
    expect(derivarVitorias([sem])).toEqual([]);
  });
});

// O Tracker separa os acordos por "o dinheiro entrou ou não". Quem decide isso
// é o status da milestone, e errar aqui é contar como recebido o que ainda vai
// ser cobrado — ou o contrário.
describe("derivarVitorias — pago x a receber", () => {
  const comStatus = (s?: string) => derivarVitorias([proc("x", [
    { titulo: "Acordo", status: "atual", ...(s ? { statusProcessual: s } : {}),
      acordo: { valor: 1000, dataFechamento: "2026-07-01" } },
  ])])[0];

  it("arquivado é o único que conta como pago", () => {
    expect(comStatus("ARQUIVADO ACORDO").acordo?.pago).toBe(true);
    expect(comStatus("AG. PAGAMENTO ACORDO").acordo?.pago).toBe(false);
    expect(comStatus("EM TRATATIVA DE ACORDO").acordo?.pago).toBe(false);
  });

  it("sem status gravado, o dinheiro NÃO é dado por recebido", () => {
    const v = comStatus(undefined);
    expect(v.acordo?.pago).toBe(false);
    expect(v.acordo?.status).toBe("EM TRATATIVA DE ACORDO");
  });
});
