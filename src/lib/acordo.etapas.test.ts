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

  it("os três status de acordo levam o processo direto para a milestone", () => {
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

  it("os três status estão na lista geral (a planilha usa) e são exatamente três", () => {
    expect(STATUS_ACORDO).toEqual([
      "EM TRATATIVA DE ACORDO",
      "AG. PAGAMENTO ACORDO",
      "ARQUIVADO ACORDO",
    ]);
    for (const s of STATUS_ACORDO) expect(STATUS_PROCESSUAIS).toContain(s);
  });

  it("status de cumprimento continua no cumprimento — o acordo não os roubou", () => {
    for (const s of ["AG. CUMPRIMENTO SENTENÇA", "AG. PAGAMENTO VOLUNTÁRIO", "ALVARÁ EXPEDIDO"]) {
      expect(montarEtapasPadrao(s).find((e) => e.status === "atual")?.titulo).toBe(ETAPA_CUMPRIMENTO);
    }
  });

  it("toda etapa tem id único, inclusive a nova", () => {
    const ids = montarEtapasPadrao("AG. CONTESTAÇÃO").map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(ETAPAS_TITULOS.length);
  });
});
