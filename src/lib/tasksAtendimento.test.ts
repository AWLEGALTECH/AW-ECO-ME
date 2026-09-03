import { describe, it, expect } from "bun:test";
import {
  CADENCIA, rodadasDevidas, esfriou, proximaCobranca, followUpsDoDia,
  ordenarTasks, progressoTasks, horaBonita, type LeadParado, type Task,
} from "./tasksAtendimento";

const lead = (o: Partial<LeadParado> & Pick<LeadParado, "id">): LeadParado => ({
  nome: "Fulano", diasParado: 0, followUpsFeitos: 0, ativo: true, ...o,
});
const task = (o: Partial<Task> & Pick<Task, "id" | "tipo">): Task => ({
  leadId: "l1", lead: "Fulano", titulo: "", detalhe: "", data: "2026-09-02", feita: false, ...o,
});

describe("a cadência abre o intervalo", () => {
  it("os passos ficam cada vez mais espaçados", () => {
    // cobrar todo dia queima o lead; o espaçamento é o desenho
    const saltos = CADENCIA.slice(1).map((d, i) => d - CADENCIA[i]);
    for (let i = 1; i < saltos.length; i++) {
      expect(saltos[i]).toBeGreaterThanOrEqual(saltos[i - 1]);
    }
  });

  it("cabe em um mês", () => {
    expect(CADENCIA[CADENCIA.length - 1]).toBeLessThanOrEqual(31);
  });
});

describe("quantas cobranças o lead já deveria ter recebido", () => {
  it("lead que acabou de parar não deve nenhuma", () => {
    expect(rodadasDevidas(0)).toBe(0);
    expect(rodadasDevidas(1)).toBe(0);
  });

  it("no dia exato do passo, ele já conta", () => {
    expect(rodadasDevidas(2)).toBe(1);
    expect(rodadasDevidas(5)).toBe(2);
    expect(rodadasDevidas(30)).toBe(5);
  });

  it("é acumulado: quem sumiu por 12 dias deve três, não uma", () => {
    // é o que faz os atrasados aparecerem quando alguém volta de férias, em vez
    // de sumirem por não ser exatamente o dia deles
    expect(rodadasDevidas(12)).toBe(3);
  });
});

describe("quando o lead esfria", () => {
  it("depois do último passo, para de gerar cobrança", () => {
    expect(esfriou(30)).toBe(false);
    expect(esfriou(31)).toBe(true);
    expect(followUpsDoDia([lead({ id: "a", diasParado: 45 })], "2026-09-02")).toEqual([]);
  });

  it("a próxima cobrança some quando a cadência acaba", () => {
    expect(proximaCobranca(0)).toEqual({ emDias: 2, rodada: 1 });
    expect(proximaCobranca(3)).toEqual({ emDias: 2, rodada: 2 });
    expect(proximaCobranca(30)).toBeNull();
  });
});

describe("os follow-ups que entram no dia", () => {
  const hoje = "2026-09-02";

  it("lead parado além do passo entra com a rodada certa", () => {
    const [t] = followUpsDoDia([lead({ id: "a", nome: "Rita", diasParado: 6 })], hoje);
    expect(t.tipo).toBe("follow_up");
    expect(t.rodada).toBe(1);
    expect(t.titulo).toBe("1ª cobrança");
    expect(t.data).toBe(hoje);
  });

  it("quem já foi cobrado na volta certa não aparece de novo", () => {
    // parado há 3 dias deve 1 cobrança; se ela já saiu, não há o que fazer hoje
    expect(followUpsDoDia([lead({ id: "a", diasParado: 3, followUpsFeitos: 1 })], hoje)).toEqual([]);
    // mas ao chegar no passo seguinte ele volta
    const [t] = followUpsDoDia([lead({ id: "a", diasParado: 5, followUpsFeitos: 1 })], hoje);
    expect(t.rodada).toBe(2);
  });

  it("um lead gera UMA linha por dia, mesmo devendo três", () => {
    const saida = followUpsDoDia([lead({ id: "a", diasParado: 12 })], hoje);
    expect(saida).toHaveLength(1);
    expect(saida[0].rodada).toBe(1);
    expect(saida[0].detalhe).toContain("3 cobranças atrasadas");
  });

  it("lead fechado ou perdido não é cobrado", () => {
    expect(followUpsDoDia([lead({ id: "a", diasParado: 10, ativo: false })], hoje)).toEqual([]);
  });

  it("com uma cobrança só devendo, o detalhe é só o tempo parado", () => {
    // parado há 3 dias deve exatamente uma (o passo de 2 dias); nada de atraso
    const [t] = followUpsDoDia([lead({ id: "a", diasParado: 3 })], hoje);
    expect(t.detalhe).toBe("parado há 3 dias");
  });
});

describe("a ordem do dia", () => {
  it("o que falta vem antes do que já foi feito", () => {
    const f = ordenarTasks([
      task({ id: "1", tipo: "follow_up", feita: true, rodada: 1 }),
      task({ id: "2", tipo: "lembrete" }),
    ]);
    expect(f.map((t) => t.id)).toEqual(["2", "1"]);
  });

  it("follow-up vem antes de lembrete", () => {
    const f = ordenarTasks([
      task({ id: "1", tipo: "lembrete" }),
      task({ id: "2", tipo: "follow_up", rodada: 1 }),
    ]);
    expect(f[0].tipo).toBe("follow_up");
  });

  it("entre follow-ups, a rodada mais avançada vem primeiro", () => {
    // quem já está na 4ª tentativa corre mais risco de nunca mais responder
    const f = ordenarTasks([
      task({ id: "a", tipo: "follow_up", rodada: 1 }),
      task({ id: "b", tipo: "follow_up", rodada: 4 }),
      task({ id: "c", tipo: "follow_up", rodada: 2 }),
    ]);
    expect(f.map((t) => t.rodada)).toEqual([4, 2, 1]);
  });

  it("empate não faz a lista dançar entre renders", () => {
    const iguais = [task({ id: "b", tipo: "lembrete" }), task({ id: "a", tipo: "lembrete" })];
    expect(ordenarTasks(iguais).map((t) => t.id)).toEqual(["a", "b"]);
    expect(ordenarTasks(iguais.slice().reverse()).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("não mexe no array que recebeu", () => {
    const orig = [task({ id: "1", tipo: "lembrete" }), task({ id: "2", tipo: "follow_up" })];
    ordenarTasks(orig);
    expect(orig[0].id).toBe("1");
  });
});

describe("a barra de conclusão", () => {
  it("conta feitas sobre o total do dia", () => {
    const p = progressoTasks([
      task({ id: "1", tipo: "follow_up", feita: true }),
      task({ id: "2", tipo: "lembrete" }),
      task({ id: "3", tipo: "lembrete", feita: true }),
    ]);
    expect(p.feitas).toBe(2);
    expect(p.total).toBe(3);
    expect(p.pct).toBe(67);
    expect(p.concluido).toBe(false);
  });

  it("dia sem task é 100%, não zero", () => {
    // barra vazia num dia limpo cobraria o que não existe
    const p = progressoTasks([]);
    expect(p.pct).toBe(100);
    expect(p.concluido).toBe(false);
  });

  it("dia inteiro fechado é concluído", () => {
    const p = progressoTasks([task({ id: "1", tipo: "lembrete", feita: true })]);
    expect(p.pct).toBe(100);
    expect(p.concluido).toBe(true);
  });
});

describe("a hora do lembrete", () => {
  it("hora redonda sai sem os dois zeros", () => {
    // é como se combina em voz alta: "ligo às 15h"
    expect(horaBonita("15:00")).toBe("15h");
    expect(horaBonita("15:00:00")).toBe("15h");
    expect(horaBonita("09:00")).toBe("9h");
  });

  it("com minuto, mantém o minuto", () => {
    expect(horaBonita("15:30")).toBe("15h30");
    expect(horaBonita("08:05")).toBe("8h05");
  });

  it("sem hora não escreve nada", () => {
    expect(horaBonita(null)).toBe("");
    expect(horaBonita("")).toBe("");
    expect(horaBonita("qualquer coisa")).toBe("");
  });
});

describe("a ordem entre lembretes com hora", () => {
  const lb = (id: string, hora: string | null): Task => ({
    id, tipo: "lembrete", leadId: "l1", lead: "Fulano",
    titulo: id, detalhe: "", data: "2026-09-03", hora, feita: false,
  });

  it("quem tem hora vem antes de quem não tem", () => {
    const ordem = ordenarTasks([lb("b-sem", null), lb("a-com", "15:00")]).map((t) => t.id);
    expect(ordem).toEqual(["a-com", "b-sem"]);
  });

  it("entre os que têm hora, vale o relógio e não o alfabeto", () => {
    const ordem = ordenarTasks([lb("z", "09:00"), lb("a", "15:00")]).map((t) => t.id);
    expect(ordem).toEqual(["z", "a"]);
  });

  it("feita continua indo pro fim, com hora ou sem", () => {
    const feita = { ...lb("cedo", "07:00"), feita: true };
    const ordem = ordenarTasks([feita, lb("tarde", "18:00")]).map((t) => t.id);
    expect(ordem).toEqual(["tarde", "cedo"]);
  });
});
