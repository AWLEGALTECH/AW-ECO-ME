import { describe, it, expect } from "bun:test";
import {
  tipoDoMime, instanteDe, motivoDeNaoAgendar, faltaPara, quandoBonito,
} from "./retencao";

describe("o tipo do arquivo", () => {
  it("concorda com o que a entrada e a saída já usam", () => {
    expect(tipoDoMime("image/jpeg")).toBe("imagem");
    expect(tipoDoMime("video/mp4")).toBe("video");
    expect(tipoDoMime("audio/ogg; codecs=opus")).toBe("audio");
    expect(tipoDoMime("application/pdf")).toBe("documento");
  });

  it("o que não se reconhece vira documento, e não erro", () => {
    expect(tipoDoMime("")).toBe("documento");
    expect(tipoDoMime("aplicacao/desconhecida")).toBe("documento");
  });
});

describe("quando a mensagem sai", () => {
  // A DECISÃO QUE PROTEGE O CLIENTE: lembrete sem hora não pode virar WhatsApp
  // à meia-noite. Ninguém escolheu madrugada; a ausência de hora quer dizer
  // "durante o dia".
  it("sem hora, sai ao meio-dia e nunca de madrugada", () => {
    const d = instanteDe("2026-09-10", null);
    expect(d.getHours()).toBe(12);
    expect(d.getMinutes()).toBe(0);
  });

  it("com hora, respeita a hora escolhida", () => {
    const d = instanteDe("2026-09-10", "07:30");
    expect(d.getHours()).toBe(7);
    expect(d.getMinutes()).toBe(30);
  });

  it("não pula de dia por causa de fuso", () => {
    const d = instanteDe("2026-09-10", "00:30");
    expect(d.getDate()).toBe(10);
    expect(d.getMonth()).toBe(8);
  });
});

describe("o que impede um agendamento", () => {
  const agora = new Date("2026-09-06T12:00:00");
  const daqui = (min: number) => new Date(agora.getTime() + min * 60000);

  it("deixa passar o que está em ordem", () => {
    expect(motivoDeNaoAgendar({
      tipo: "texto", texto: "bom dia", temArquivo: false, quando: daqui(30), agora,
    })).toBeNull();
  });

  it("texto vazio não vira mensagem", () => {
    expect(motivoDeNaoAgendar({
      tipo: "texto", texto: "   ", temArquivo: false, quando: daqui(30), agora,
    })).toContain("Escreva a mensagem");
  });

  it("mídia sem arquivo não vira mensagem", () => {
    expect(motivoDeNaoAgendar({
      tipo: "imagem", texto: "olha isso", temArquivo: false, quando: daqui(30), agora,
    })).toContain("Anexe o arquivo");
  });

  // Imagem com legenda é UMA mensagem, como no WhatsApp: o texto não é
  // obrigatório e a foto sozinha basta.
  it("imagem sem legenda pode", () => {
    expect(motivoDeNaoAgendar({
      tipo: "imagem", texto: null, temArquivo: true, quando: daqui(30), agora,
    })).toBeNull();
  });

  it("passado não se agenda", () => {
    expect(motivoDeNaoAgendar({
      tipo: "texto", texto: "oi", temArquivo: false, quando: daqui(-5), agora,
    })).toContain("um minuto à frente");
  });

  // A margem existe pra que a mesma escolha não seja aceita ou recusada
  // conforme a velocidade do clique.
  it("agendar pra daqui a trinta segundos também não", () => {
    expect(motivoDeNaoAgendar({
      tipo: "texto", texto: "oi", temArquivo: false,
      quando: new Date(agora.getTime() + 30_000), agora,
    })).toContain("um minuto à frente");
  });

  it("mais de um ano à frente é erro de digitação, não agendamento", () => {
    expect(motivoDeNaoAgendar({
      tipo: "texto", texto: "oi", temArquivo: false, quando: daqui(400 * 24 * 60), agora,
    })).toContain("um ano");
  });
});

describe("como o tempo é dito", () => {
  const agora = new Date("2026-09-06T12:00:00");

  it("conta em minutos, horas e dias", () => {
    expect(faltaPara("2026-09-06T12:40:00", agora)).toBe("em 40 min");
    expect(faltaPara("2026-09-06T15:00:00", agora)).toBe("em 3 horas");
    expect(faltaPara("2026-09-08T12:00:00", agora)).toBe("em 2 dias");
  });

  it("uma hora e um dia ficam no singular", () => {
    expect(faltaPara("2026-09-06T13:00:00", agora)).toBe("em 1 hora");
    expect(faltaPara("2026-09-07T12:00:00", agora)).toBe("em 1 dia");
  });

  it("o que já venceu está saindo, e não atrasado", () => {
    expect(faltaPara("2026-09-06T11:00:00", agora)).toBe("saindo agora");
  });

  it("o rótulo traz dia e hora", () => {
    expect(quandoBonito("2026-09-07T14:00:00")).toBe("07/09 às 14:00");
  });
});
