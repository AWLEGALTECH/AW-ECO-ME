import { describe, it, expect } from "bun:test";
import {
  novaPendente, podeSerAConfirmacao, aindaPendentes, daConversa,
  marcarFalha, remover, bolhaDaPendente, type Pendente, type LinhaEnviada,
} from "./envioOtimista";

const p = (texto: string, criadaEm: string, id = texto + criadaEm, conversaId = "c1"): Pendente =>
  ({ id, conversaId, texto, criadaEm, estado: "pendente" });

const saida = (texto: string, criada_em: string): LinhaEnviada =>
  ({ direcao: "saida", texto, criada_em });

describe("novaPendente", () => {
  it("nasce pendente, com id que não parece uuid do banco", () => {
    const x = novaPendente("c1", "oi", new Date("2026-09-05T12:00:00Z"));
    expect(x.estado).toBe("pendente");
    expect(x.id.startsWith("pend:")).toBe(true);
    expect(x.criadaEm).toBe("2026-09-05T12:00:00.000Z");
  });

  it("dois envios seguidos não colidem de id", () => {
    const t = new Date("2026-09-05T12:00:00Z");
    expect(novaPendente("c1", "ok", t).id).not.toBe(novaPendente("c1", "ok", t).id);
  });
});

describe("podeSerAConfirmacao", () => {
  const x = p("bom dia", "2026-09-05T12:00:00.000Z");

  it("casa saída com mesmo texto e hora posterior", () => {
    expect(podeSerAConfirmacao(x, saida("bom dia", "2026-09-05T12:00:03Z"))).toBe(true);
  });

  it("ignora espaço em volta", () => {
    expect(podeSerAConfirmacao(x, saida("  bom dia  ", "2026-09-05T12:00:03Z"))).toBe(true);
  });

  it("não casa mensagem que ENTROU", () => {
    expect(podeSerAConfirmacao(x, { direcao: "entrada", texto: "bom dia", criada_em: "2026-09-05T12:00:03Z" })).toBe(false);
  });

  it("não casa texto diferente", () => {
    expect(podeSerAConfirmacao(x, saida("boa noite", "2026-09-05T12:00:03Z"))).toBe(false);
  });

  // A mensagem idêntica de ONTEM não pode apagar o relógio da de agora.
  it("não casa mensagem anterior à pendência", () => {
    expect(podeSerAConfirmacao(x, saida("bom dia", "2026-09-04T09:00:00Z"))).toBe(false);
  });

  // O relógio de quem digita pode estar adiantado — sem folga, a confirmação
  // legítima chegaria "no passado" e a bolha ficaria pendurada pra sempre.
  it("tolera o relógio local adiantado em até dois minutos", () => {
    expect(podeSerAConfirmacao(x, saida("bom dia", "2026-09-05T11:59:00Z"))).toBe(true);
    expect(podeSerAConfirmacao(x, saida("bom dia", "2026-09-05T11:55:00Z"))).toBe(false);
  });

  it("não quebra com data ilegível", () => {
    expect(podeSerAConfirmacao(x, saida("bom dia", "vixe"))).toBe(false);
  });
});

describe("aindaPendentes", () => {
  it("some quando a confirmação aparece", () => {
    const ps = [p("oi", "2026-09-05T12:00:00.000Z")];
    expect(aindaPendentes(ps, [saida("oi", "2026-09-05T12:00:02Z")])).toHaveLength(0);
  });

  it("continua enquanto o banco não tem", () => {
    const ps = [p("oi", "2026-09-05T12:00:00.000Z")];
    expect(aindaPendentes(ps, [])).toHaveLength(1);
  });

  // O caso que motivou o "consumo": dois "ok" iguais. Sem consumir a linha, as
  // duas pendências casariam com a mesma e uma ficaria com relógio eterno.
  it("duas mensagens iguais resolvem uma de cada vez", () => {
    const ps = [
      p("ok", "2026-09-05T12:00:00.000Z", "a"),
      p("ok", "2026-09-05T12:00:01.000Z", "b"),
    ];
    const sobra = aindaPendentes(ps, [saida("ok", "2026-09-05T12:00:04Z")]);
    expect(sobra).toHaveLength(1);
    expect(sobra[0].id).toBe("b");           // a mais antiga foi a que casou

    expect(aindaPendentes(ps, [
      saida("ok", "2026-09-05T12:00:04Z"),
      saida("ok", "2026-09-05T12:00:05Z"),
    ])).toHaveLength(0);
  });

  // Falha não se reconcilia: o texto só existe naquela bolha, e sumir com ela
  // faria quem escreveu ter que lembrar de cabeça o que tinha escrito.
  it("mantém na tela a que falhou, mesmo com linha parecida no banco", () => {
    const ps: Pendente[] = [{ ...p("oi", "2026-09-05T12:00:00.000Z"), estado: "falhou", erro: "401" }];
    const sobra = aindaPendentes(ps, [saida("oi", "2026-09-05T12:00:02Z")]);
    expect(sobra).toHaveLength(1);
    expect(sobra[0].estado).toBe("falhou");
  });

  it("não deixa uma confirmação resolver pendência de texto diferente", () => {
    const ps = [p("a", "2026-09-05T12:00:00.000Z", "x"), p("b", "2026-09-05T12:00:01.000Z", "y")];
    const sobra = aindaPendentes(ps, [saida("b", "2026-09-05T12:00:05Z")]);
    expect(sobra.map((s) => s.id)).toEqual(["x"]);
  });
});

describe("daConversa", () => {
  it("filtra e ordena por chegada", () => {
    const ps = [
      p("2", "2026-09-05T12:00:05.000Z", "b", "c1"),
      p("outro", "2026-09-05T12:00:00.000Z", "z", "c2"),
      p("1", "2026-09-05T12:00:01.000Z", "a", "c1"),
    ];
    expect(daConversa(ps, "c1").map((x) => x.id)).toEqual(["a", "b"]);
    expect(daConversa(ps, null)).toEqual([]);
  });
});

describe("marcarFalha e remover", () => {
  it("marca só a pendência do id, guardando o erro", () => {
    const ps = [p("a", "2026-09-05T12:00:00.000Z", "x"), p("b", "2026-09-05T12:00:01.000Z", "y")];
    const r = marcarFalha(ps, "x", "Evolution 401");
    expect(r[0]).toMatchObject({ estado: "falhou", erro: "Evolution 401" });
    expect(r[1].estado).toBe("pendente");
  });

  it("remove pelo id", () => {
    const ps = [p("a", "2026-09-05T12:00:00.000Z", "x"), p("b", "2026-09-05T12:00:01.000Z", "y")];
    expect(remover(ps, "x").map((z) => z.id)).toEqual(["y"]);
  });
});

describe("bolhaDaPendente", () => {
  it("vira envelope que a tela desenha como as outras", () => {
    const b = bolhaDaPendente(p("oi", "2026-09-05T15:30:00.000Z"));
    expect(b.de).toBe("nos");
    expect(b.texto).toBe("oi");
    expect(b.status).toBe("pendente");
    expect(b.hora).toMatch(/^\d{2}:\d{2}$/);
  });
});
