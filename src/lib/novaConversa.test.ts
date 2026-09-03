import { describe, it, expect } from "bun:test";
import { mascaraTelefone, aferirTelefone, nomeDaConversaNova } from "./novaConversa";

describe("a máscara enquanto digita", () => {
  it("vai se formando aos poucos", () => {
    expect(mascaraTelefone("")).toBe("");
    expect(mascaraTelefone("9")).toBe("(9");
    expect(mascaraTelefone("92")).toBe("(92");
    expect(mascaraTelefone("92988")).toBe("(92) 988");
    expect(mascaraTelefone("92988124471")).toBe("(92) 98812-4471");
  });

  it("número colado com o 55 na frente não come o DDD", () => {
    expect(mascaraTelefone("5592988124471")).toBe("(92) 98812-4471");
    expect(mascaraTelefone("+55 (92) 98812-4471")).toBe("(92) 98812-4471");
  });

  it("para de aceitar depois do 11º dígito", () => {
    expect(mascaraTelefone("929881244719999")).toBe("(92) 98812-4471");
  });

  it("ignora o que não é dígito", () => {
    expect(mascaraTelefone("92 abc 98812")).toBe("(92) 98812");
  });
});

describe("o número serve?", () => {
  it("celular com DDD passa e vira canônico", () => {
    const r = aferirTelefone("(92) 98812-4471");
    expect(r.ok).toBe(true);
    expect(r.canonico).toBe("5592988124471");
  });

  it("com ou sem o 55 dá no mesmo", () => {
    expect(aferirTelefone("5592988124471").canonico).toBe("5592988124471");
  });

  it("dez dígitos ganham o 9 — é o celular antigo de Manaus", () => {
    // a razão de o canonicalizador existir (ver src/lib/phone.ts)
    expect(aferirTelefone("9288124471").canonico).toBe("5592988124471");
  });

  it("vazio é recusado com recado, não em silêncio", () => {
    expect(aferirTelefone("")).toMatchObject({ ok: false });
    expect(aferirTelefone("").erro).toContain("Digite");
  });

  it("curto e comprido demais são recusados", () => {
    expect(aferirTelefone("9298812").ok).toBe(false);
    expect(aferirTelefone("929881244719").ok).toBe(false);
  });

  it("DDD que não existe é recusado", () => {
    // "011 98812-4471" — hábito antigo de pôr a operadora na frente
    const r = aferirTelefone("01198812447");
    expect(r.ok).toBe(false);
    expect(r.erro).toContain("DDD");
  });

  it("fixo de 11 dígitos é recusado em vez de virar celular inventado", () => {
    expect(aferirTelefone("9232145678 9").ok).toBe(false);
    expect(aferirTelefone("92321456789").erro).toContain("9");
  });
});

describe("o nome da conversa nova", () => {
  it("o que a pessoa digitou, sem sobra de espaço", () => {
    expect(nomeDaConversaNova("  Dona Maria  ")).toBe("Dona Maria");
  });

  it("sem nome fica null pro WhatsApp preencher depois", () => {
    expect(nomeDaConversaNova("")).toBeNull();
    expect(nomeDaConversaNova("   ")).toBeNull();
    expect(nomeDaConversaNova(undefined)).toBeNull();
  });
});
