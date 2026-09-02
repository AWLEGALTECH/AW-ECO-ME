import { describe, it, expect } from "bun:test";
import {
  ordenarMissoes, progressoDoDia, patenteDaSequencia, emRisco, PONTOS, type Missao,
} from "./missoes";

const m = (over: Partial<Missao> & Pick<Missao, "id" | "tipo">): Missao => ({
  leadId: "l" + over.id, lead: "Fulano", detalhe: "", horas: 1, feita: false, ...over,
});

describe("a ordem da fila é a ordem da culpa", () => {
  it("quem falou com a gente e não foi respondido vem primeiro", () => {
    const fila = ordenarMissoes([
      m({ id: "3", tipo: "ligar" }),
      m({ id: "1", tipo: "sem_resposta" }),
      m({ id: "2", tipo: "cobrar_extrato" }),
    ]);
    expect(fila[0].tipo).toBe("sem_resposta");
  });

  it("lead sem próximo passo vem antes do trabalho normal", () => {
    const fila = ordenarMissoes([
      m({ id: "1", tipo: "follow_up" }),
      m({ id: "2", tipo: "sem_proxima_acao" }),
      m({ id: "3", tipo: "cobrar_extrato" }),
    ]);
    expect(fila.map((x) => x.tipo)).toEqual(["sem_proxima_acao", "cobrar_extrato", "follow_up"]);
  });

  it("dentro do mesmo tipo, quem espera há mais tempo vem antes", () => {
    const fila = ordenarMissoes([
      m({ id: "a", tipo: "sem_resposta", horas: 2 }),
      m({ id: "b", tipo: "sem_resposta", horas: 9 }),
      m({ id: "c", tipo: "sem_resposta", horas: 5 }),
    ]);
    expect(fila.map((x) => x.horas)).toEqual([9, 5, 2]);
  });

  it("o que já foi feito cai pro fim, mas não some", () => {
    const fila = ordenarMissoes([
      m({ id: "1", tipo: "sem_resposta", feita: true }),
      m({ id: "2", tipo: "ligar" }),
    ]);
    expect(fila.map((x) => x.id)).toEqual(["2", "1"]);
    expect(fila).toHaveLength(2);
  });

  it("empate total não faz a lista dançar entre renders", () => {
    const iguais = [m({ id: "b", tipo: "ligar" }), m({ id: "a", tipo: "ligar" })];
    expect(ordenarMissoes(iguais).map((x) => x.id)).toEqual(["a", "b"]);
    expect(ordenarMissoes(iguais.slice().reverse()).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("não mexe no array que recebeu", () => {
    const orig = [m({ id: "2", tipo: "ligar" }), m({ id: "1", tipo: "sem_resposta" })];
    ordenarMissoes(orig);
    expect(orig[0].id).toBe("2");
  });
});

describe("o que conta como risco", () => {
  it("são os dois alarmes que o escritório escolheu, e só eles", () => {
    expect(emRisco({ tipo: "sem_resposta" })).toBe(true);
    expect(emRisco({ tipo: "sem_proxima_acao" })).toBe(true);
    expect(emRisco({ tipo: "cobrar_extrato" })).toBe(false);
    expect(emRisco({ tipo: "follow_up" })).toBe(false);
    expect(emRisco({ tipo: "ligar" })).toBe(false);
  });

  it("responder vale mais ponto que qualquer outra coisa", () => {
    const outros = Object.entries(PONTOS).filter(([k]) => k !== "sem_resposta");
    for (const [, v] of outros) expect(PONTOS.sem_resposta).toBeGreaterThan(v);
  });
});

describe("o progresso do dia", () => {
  it("conta feitas, total e pontos ganhos", () => {
    const p = progressoDoDia([
      m({ id: "1", tipo: "sem_resposta", feita: true }),
      m({ id: "2", tipo: "ligar" }),
      m({ id: "3", tipo: "cobrar_extrato", feita: true }),
    ]);
    expect(p.feitas).toBe(2);
    expect(p.total).toBe(3);
    expect(p.pct).toBe(67);
    expect(p.pontos).toBe(PONTOS.sem_resposta + PONTOS.cobrar_extrato);
    expect(p.pontosPossiveis).toBe(PONTOS.sem_resposta + PONTOS.ligar + PONTOS.cobrar_extrato);
  });

  it("dia sem missão nenhuma é 100%, não zero", () => {
    // barra vazia num dia limpo faria a tela cobrar o que não existe
    const p = progressoDoDia([]);
    expect(p.pct).toBe(100);
    expect(p.zerado).toBe(true);
  });

  it("o dia só está zerado quando nenhum RISCO sobrou", () => {
    const comRisco = progressoDoDia([m({ id: "1", tipo: "sem_resposta" })]);
    expect(comRisco.zerado).toBe(false);

    // uma ligação pendente não segura o dia: ela não é alarme
    const soTrabalho = progressoDoDia([m({ id: "1", tipo: "ligar" })]);
    expect(soTrabalho.zerado).toBe(true);
    expect(soTrabalho.pct).toBe(0);
  });
});

describe("a sequência de dias limpos", () => {
  it("começa do zero e sobe de patente", () => {
    expect(patenteDaSequencia(0).rotulo).toBe("Começando");
    expect(patenteDaSequencia(3).rotulo).toBe("Constante");
    expect(patenteDaSequencia(7).rotulo).toBe("Semana limpa");
    expect(patenteDaSequencia(15).rotulo).toBe("Quinzena limpa");
    expect(patenteDaSequencia(30).rotulo).toBe("Mês inteiro");
  });

  it("diz quanto falta pra próxima", () => {
    expect(patenteDaSequencia(5).proxima).toBe("Semana limpa");
    expect(patenteDaSequencia(5).faltam).toBe(2);
  });

  it("no topo não promete uma próxima que não existe", () => {
    expect(patenteDaSequencia(45).faltam).toBeNull();
    expect(patenteDaSequencia(45).proxima).toBeNull();
    expect(patenteDaSequencia(45).rotulo).toBe("Mês inteiro");
  });

  it("número torto não quebra a patente", () => {
    expect(patenteDaSequencia(-3).rotulo).toBe("Começando");
    expect(patenteDaSequencia(7.9).rotulo).toBe("Semana limpa");
  });
});
