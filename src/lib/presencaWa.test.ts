import { describe, it, expect } from "bun:test";
import {
  vistoDaMensagem, rotuloDoStatus, marcaDeEnvio, situacaoDoContato, quandoFoi,
  estaOnline, estaDigitando,
} from "./presencaWa";

const AGORA = new Date(2026, 8, 4, 15, 0);          // 04/09/2026 15:00
const atras = (min: number) => new Date(AGORA.getTime() - min * 60_000).toISOString();

describe("os vistinhos da mensagem", () => {
  it("um risco quando saiu, dois quando chegou, azul quando leu", () => {
    expect(vistoDaMensagem("enviada")).toEqual({ riscos: 1, lida: false });
    expect(vistoDaMensagem("entregue")).toEqual({ riscos: 2, lida: false });
    expect(vistoDaMensagem("lida")).toEqual({ riscos: 2, lida: true });
  });

  it("áudio ouvido conta como lido", () => {
    expect(vistoDaMensagem("tocada")).toEqual({ riscos: 2, lida: true });
  });

  it("sem confirmação não desenha nada — nem um risco de consolo", () => {
    // um visto simples aqui diria "chegou no servidor" sem ninguém ter dito
    expect(vistoDaMensagem(null)).toBeNull();
    expect(vistoDaMensagem(undefined)).toBeNull();
    expect(vistoDaMensagem("qualquer")).toBeNull();
  });

  it("o rótulo explica o que o desenho quer dizer", () => {
    expect(rotuloDoStatus("entregue")).toBe("entregue no aparelho");
    expect(rotuloDoStatus(null)).toBe("");
  });
});

describe("a marca de quem ainda não saiu", () => {
  it("pendente é relógio, falha é erro", () => {
    expect(marcaDeEnvio("pendente")).toBe("relogio");
    expect(marcaDeEnvio("falhou")).toBe("erro");
  });

  // O estado local não pode invadir o vocabulário do servidor, nem o contrário:
  // "enviada" já é notícia da Evolution e merece risco, não relógio.
  it("não se mistura com o que o servidor respondeu", () => {
    expect(marcaDeEnvio("enviada")).toBeNull();
    expect(marcaDeEnvio("lida")).toBeNull();
    expect(marcaDeEnvio(null)).toBeNull();
    expect(vistoDaMensagem("pendente")).toBeNull();
    expect(vistoDaMensagem("falhou")).toBeNull();
  });

  it("os dois estados locais têm rótulo em português", () => {
    expect(rotuloDoStatus("pendente")).toBe("enviando…");
    expect(rotuloDoStatus("falhou")).toContain("não saiu");
  });
});

describe("o que aparece embaixo do nome", () => {
  it("o que está acontecendo agora ganha do que aconteceu", () => {
    const r = situacaoDoContato({
      presenca: "digitando", presencaEm: atras(0), vistoEm: atras(1), agora: AGORA,
    });
    expect(r).toEqual({ texto: "digitando…", aoVivo: true });
  });

  it("gravando áudio é dito com todas as letras", () => {
    expect(situacaoDoContato({ presenca: "gravando", presencaEm: atras(1), agora: AGORA })?.texto)
      .toBe("gravando áudio…");
  });

  it("online só vale enquanto é notícia fresca", () => {
    expect(situacaoDoContato({ presenca: "disponivel", presencaEm: atras(1), agora: AGORA })?.texto)
      .toBe("online");
    // dez minutos depois, "online" é chute
    expect(situacaoDoContato({ presenca: "disponivel", presencaEm: atras(10), agora: AGORA }))
      .toBeNull();
  });

  it("sem presença fresca, cai no visto por último", () => {
    const r = situacaoDoContato({ presenca: "indisponivel", presencaEm: atras(30), vistoEm: atras(30), agora: AGORA });
    expect(r?.aoVivo).toBe(false);
    expect(r?.texto).toBe("visto há 30 min");
  });

  it("SEM NADA, FICA CALADO — não escreve 'offline'", () => {
    // a maioria dos contatos esconde o status; ausência de evento é "não sei",
    // e dizer offline seria inventar um fato sobre uma pessoa real
    expect(situacaoDoContato({ agora: AGORA })).toBeNull();
    expect(situacaoDoContato({ presenca: "indisponivel", presencaEm: atras(2), agora: AGORA })).toBeNull();
  });
});

describe("quando foi", () => {
  it("menos de dois minutos é agora há pouco", () => {
    expect(quandoFoi(atras(1), AGORA)).toBe("agora há pouco");
  });
  it("minutos, depois horas", () => {
    expect(quandoFoi(atras(12), AGORA)).toBe("há 12 min");
    expect(quandoFoi(atras(180), AGORA)).toBe("há 3 h");
  });
  it("ontem leva a hora junto", () => {
    expect(quandoFoi(new Date(2026, 8, 3, 21, 4).toISOString(), AGORA)).toBe("ontem 21:04");
  });
  it("mais velho vira data e hora", () => {
    expect(quandoFoi(new Date(2026, 7, 28, 9, 12).toISOString(), AGORA)).toBe("28/08 09:12");
  });
  it("data inválida não vira 'NaN'", () => {
    expect(quandoFoi("nada", AGORA)).toBe("");
  });
});

describe("o pontinho de online na lista", () => {
  it("acende com presença fresca e positiva", () => {
    expect(estaOnline("disponivel", atras(1), AGORA)).toBe(true);
    expect(estaOnline("digitando", atras(1), AGORA)).toBe(true);
  });
  it("não acende por indisponível nem por evento velho", () => {
    expect(estaOnline("indisponivel", atras(1), AGORA)).toBe(false);
    expect(estaOnline("disponivel", atras(10), AGORA)).toBe(false);
  });
  it("sem informação, não acende", () => {
    expect(estaOnline(null, null, AGORA)).toBe(false);
  });
});

describe("está digitando agora", () => {
  const segAtras = (s: number) => new Date(AGORA.getTime() - s * 1000).toISOString();

  it("acende com composing e gravando frescos", () => {
    expect(estaDigitando("digitando", segAtras(1), AGORA)).toBe(true);
    expect(estaDigitando("gravando", segAtras(3), AGORA)).toBe(true);
  });

  // O WhatsApp REENVIA `composing` a cada ~10s enquanto a pessoa digita — não é
  // sinal contínuo. Com janela de 5s o balão apagava ENTRE dois reenvios, com o
  // contato ainda escrevendo. O maior intervalo medido na conversa real foi
  // 17,8s; vinte cobre com folga.
  it("aguenta o intervalo entre dois `composing`", () => {
    expect(estaDigitando("digitando", segAtras(10), AGORA)).toBe(true);
    expect(estaDigitando("digitando", segAtras(18), AGORA)).toBe(true);
  });

  // A janela longa não deixa o balão pendurado porque não é ela quem apaga: o
  // `available` chega ~1s depois da pausa e troca o estado. A validade é só a
  // rede de segurança pra quando evento nenhum chega.
  it("quem apaga é o evento de pausa, não o relógio", () => {
    expect(estaDigitando("disponivel", segAtras(1), AGORA)).toBe(false);
  });

  it("mas o relógio segura quem sumiu sem avisar", () => {
    expect(estaDigitando("digitando", segAtras(21), AGORA)).toBe(false);
    expect(estaDigitando("digitando", segAtras(3600), AGORA)).toBe(false);
  });

  it("não confunde estar online com estar digitando", () => {
    expect(estaDigitando("disponivel", segAtras(1), AGORA)).toBe(false);
    expect(estaOnline("disponivel", segAtras(1), AGORA)).toBe(true);
  });

  it("sem evento, não acende", () => {
    expect(estaDigitando(null, segAtras(1), AGORA)).toBe(false);
    expect(estaDigitando("digitando", null, AGORA)).toBe(false);
    expect(estaDigitando("digitando", "vixe", AGORA)).toBe(false);
  });
});
