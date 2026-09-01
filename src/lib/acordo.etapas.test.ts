import { describe, expect, it } from "bun:test";
import {
  montarEtapasPadrao, ETAPAS_TITULOS, ETAPA_ACORDO, ETAPA_CUMPRIMENTO,
  STATUS_ACORDO, STATUS_PROCESSUAIS,
} from "@/components/ProcessoTimeline";

describe("milestone Acordo na espinha do processo", () => {
  it("é a última etapa — de qualquer ponto se salta para ela, nunca dela para frente", () => {
    expect(ETAPAS_TITULOS[ETAPAS_TITULOS.length - 1]).toBe(ETAPA_ACORDO);
    expect(ETAPAS_TITULOS.filter((t) => t === ETAPA_ACORDO)).toHaveLength(1);
  });

  it("os status de acordo levam o processo direto para a milestone", () => {
    for (const s of STATUS_ACORDO) {
      const linha = montarEtapasPadrao(s);
      const atual = linha.find((e) => e.status === "atual");
      expect(atual?.titulo).toBe(ETAPA_ACORDO);
      expect(atual?.statusProcessual).toBe(s);
      // Tudo que veio antes fica cravado como concluído: o processo não está
      // mais esperando contestação nem sentença.
      expect(linha.filter((e) => e.status === "pendente")).toHaveLength(0);
    }
  });

  it("a via do acordo tem quatro paradas, e ACORDO PAGO é a penúltima", () => {
    // ACORDO PAGO entrou entre aguardar e arquivar: é o momento em que o
    // dinheiro caiu, e é ele que tira o processo do Tracker. Arquivar vem
    // depois e é ato de organização, não de caixa.
    expect(STATUS_ACORDO).toEqual([
      "EM TRATATIVA DE ACORDO",
      "AG. PAGAMENTO ACORDO",
      "ACORDO PAGO",
      "ARQUIVADO ACORDO",
    ]);
    for (const s of STATUS_ACORDO) expect(STATUS_PROCESSUAIS).toContain(s);
  });

  it("ALVARÁ PAGO é o espelho de ACORDO PAGO na via litigiosa", () => {
    expect(STATUS_PROCESSUAIS).toContain("ALVARÁ PAGO");
    // e ele mora no cumprimento, não no acordo: quem recebeu por alvará nunca
    // passou por acordo nenhum
    expect(montarEtapasPadrao("ALVARÁ PAGO").find((e) => e.status === "atual")?.titulo)
      .toBe(ETAPA_CUMPRIMENTO);
  });

  it("status de cumprimento continua no cumprimento — o acordo não os roubou", () => {
    for (const s of ["AG. CUMPRIMENTO SENTENÇA", "AG. PAGAMENTO VOLUNTÁRIO", "ALVARÁ EXPEDIDO", "ALVARÁ PAGO"]) {
      expect(montarEtapasPadrao(s).find((e) => e.status === "atual")?.titulo).toBe(ETAPA_CUMPRIMENTO);
    }
  });

  it("toda etapa tem id único, inclusive a nova", () => {
    const ids = montarEtapasPadrao("AG. CONTESTAÇÃO").map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(ETAPAS_TITULOS.length);
  });
});
