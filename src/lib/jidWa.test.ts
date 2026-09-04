import { describe, it, expect } from "bun:test";
import { canonicoWa, leituraDoJid, telefoneDoJid, explicaDescarte } from "./jidWa";

describe("canonicoWa", () => {
  it("normaliza celular com e sem 55", () => {
    expect(canonicoWa("92991234567")).toBe("5592991234567");
    expect(canonicoWa("5592991234567")).toBe("5592991234567");
    expect(canonicoWa("+55 (92) 99123-4567")).toBe("5592991234567");
  });

  it("põe o nono dígito em fixo antigo de dez", () => {
    expect(canonicoWa("9231234567")).toBe("5592931234567");
  });

  it("devolve vazio no que não fecha em celular", () => {
    expect(canonicoWa("")).toBe("");
    expect(canonicoWa("123")).toBe("");
    expect(canonicoWa("86930255515862")).toBe("");
  });
});

describe("leituraDoJid", () => {
  it("lê telefone de verdade", () => {
    expect(leituraDoJid("5592991234567@s.whatsapp.net")).toEqual({
      tipo: "telefone",
      telefone: "5592991234567",
    });
    expect(leituraDoJid("5592991234567@c.us")).toEqual({
      tipo: "telefone",
      telefone: "5592991234567",
    });
  });

  it("ignora o sufixo de dispositivo", () => {
    expect(leituraDoJid("5592991234567:12@s.whatsapp.net")).toEqual({
      tipo: "telefone",
      telefone: "5592991234567",
    });
  });

  it("aceita número solto, sem domínio", () => {
    expect(leituraDoJid("5592991234567")).toEqual({ tipo: "telefone", telefone: "5592991234567" });
  });

  // O caso que motivou o arquivo: este JID virou o telefone 5523428626450,
  // que não existe, e ganhou uma conversa com botão de enviar mensagem.
  it("NUNCA transforma @lid em telefone", () => {
    expect(leituraDoJid("86930255515862@lid")).toEqual({ tipo: "lid" });
    expect(leituraDoJid("23428626450@lid")).toEqual({ tipo: "lid" });
    expect(telefoneDoJid("86930255515862@lid")).toBeNull();
  });

  it("separa grupo, status e transmissão", () => {
    expect(leituraDoJid("120363000000000000@g.us")).toEqual({ tipo: "grupo" });
    expect(leituraDoJid("status@broadcast")).toEqual({ tipo: "status" });
    expect(leituraDoJid("120363@newsletter")).toEqual({ tipo: "status" });
  });

  it("recusa domínio desconhecido em vez de chutar", () => {
    expect(leituraDoJid("5592991234567@qualquercoisa")).toEqual({ tipo: "invalido" });
  });

  it("recusa dígitos que não formam celular brasileiro", () => {
    expect(leituraDoJid("12345@s.whatsapp.net")).toEqual({ tipo: "invalido" });
    expect(leituraDoJid("")).toEqual({ tipo: "vazio" });
    expect(leituraDoJid(null)).toEqual({ tipo: "vazio" });
  });

  it("não se importa com caixa", () => {
    expect(leituraDoJid("5592991234567@S.WhatsApp.net")).toEqual({
      tipo: "telefone",
      telefone: "5592991234567",
    });
    expect(leituraDoJid("86930255515862@LID")).toEqual({ tipo: "lid" });
  });
});

describe("explicaDescarte", () => {
  it("não fala nada quando nada foi descartado", () => {
    expect(explicaDescarte({})).toBe("");
  });

  it("explica o @lid em português, não em jargão", () => {
    const frase = explicaDescarte({ lid: 14 });
    expect(frase).toContain("14");
    expect(frase).toContain("@lid");
    expect(frase).toContain("mandarem mensagem");
  });

  it("junta os motivos numa frase só", () => {
    const frase = explicaDescarte({ lid: 2, grupo: 3, invalido: 1 });
    expect(frase).toContain("2");
    expect(frase).toContain("3 de grupo");
    expect(frase).toContain("1 sem telefone brasileiro válido");
  });
});
