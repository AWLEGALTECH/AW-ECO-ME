import { describe, it, expect } from "bun:test";
import {
  telefoneBonito, horaDaLista, separadorDeDia, horasSemResposta, previaDe, duracaoCurta,
  type MensagemRow,
} from "./wa";

const m = (o: Partial<MensagemRow> & Pick<MensagemRow, "criada_em">): MensagemRow => ({
  id: "m", conversa_id: "c", direcao: "entrada", tipo: "texto", texto: null,
  midia_path: null, midia_mime: null, midia_nome: null, duracao: null, ...o,
});

// Todo teste de data fixa o "agora": relógio real em teste é o jeito mais fácil
// de escrever uma suíte que passa hoje e quebra sozinha amanhã.
const AGORA = new Date(2026, 8, 3, 14, 30);   // 03/09/2026, quinta, 14:30 local

describe("o telefone que a tela mostra", () => {
  it("vira máscara brasileira", () => {
    expect(telefoneBonito("5592988124471")).toBe("(92) 98812-4471");
  });
  it("aceita sem o 55", () => {
    expect(telefoneBonito("92988124471")).toBe("(92) 98812-4471");
  });
  it("fora do formato, devolve como veio em vez de inventar", () => {
    expect(telefoneBonito("123")).toBe("123");
    expect(telefoneBonito("")).toBe("");
  });
});

describe("a hora na lista de conversas", () => {
  it("hoje mostra a hora", () => {
    expect(horaDaLista(new Date(2026, 8, 3, 9, 14).toISOString(), AGORA)).toBe("09:14");
  });

  it("ontem diz Ontem, mesmo com duas horas de diferença", () => {
    // 23h de ontem e 1h de hoje distam 2 horas e são dias diferentes: a conta
    // tem que ser por dia de calendário, não por diferença de horas
    const meiaNoiteMenos1 = new Date(2026, 8, 2, 23, 0).toISOString();
    expect(horaDaLista(meiaNoiteMenos1, new Date(2026, 8, 3, 1, 0))).toBe("Ontem");
  });

  it("nesta semana diz o dia", () => {
    expect(horaDaLista(new Date(2026, 7, 31, 10, 0).toISOString(), AGORA).toLowerCase()).toContain("segunda");
  });

  it("mais velho vira data", () => {
    expect(horaDaLista(new Date(2026, 7, 18, 10, 0).toISOString(), AGORA)).toBe("18/08");
  });

  it("sem data não quebra a linha", () => {
    expect(horaDaLista(null, AGORA)).toBe("");
    expect(horaDaLista("nada", AGORA)).toBe("");
  });
});

describe("o separador de dia dentro da conversa", () => {
  it("só aparece quando o dia vira", () => {
    const a = new Date(2026, 8, 3, 9, 0).toISOString();
    const b = new Date(2026, 8, 3, 17, 0).toISOString();
    expect(separadorDeDia(a, null, AGORA)).toBe("Hoje");
    expect(separadorDeDia(b, a, AGORA)).toBeNull();
  });

  it("dia anterior reabre o separador", () => {
    const ontem = new Date(2026, 8, 2, 22, 0).toISOString();
    const hoje = new Date(2026, 8, 3, 8, 0).toISOString();
    expect(separadorDeDia(hoje, ontem, AGORA)).toBe("Hoje");
    expect(separadorDeDia(ontem, null, AGORA)).toBe("Ontem");
  });

  it("dia da semana entra com maiúscula", () => {
    expect(separadorDeDia(new Date(2026, 7, 31, 10, 0).toISOString(), null, AGORA)).toBe("Segunda");
  });

  it("mais de uma semana vira data cheia", () => {
    expect(separadorDeDia(new Date(2026, 7, 18, 10, 0).toISOString(), null, AGORA)).toBe("18/08/2026");
  });
});

describe("quanto tempo ele está esperando", () => {
  it("conta da última mensagem DELE", () => {
    const msgs = [m({ criada_em: new Date(2026, 8, 3, 10, 30).toISOString(), direcao: "entrada" })];
    expect(horasSemResposta(msgs, AGORA)).toBe(4);
  });

  it("se a gente respondeu por último, a bola é dele e não há espera", () => {
    const msgs = [
      m({ criada_em: new Date(2026, 8, 3, 10, 0).toISOString(), direcao: "entrada" }),
      m({ criada_em: new Date(2026, 8, 3, 10, 5).toISOString(), direcao: "saida" }),
    ];
    expect(horasSemResposta(msgs, AGORA)).toBe(0);
  });

  it("conversa vazia não quebra", () => {
    expect(horasSemResposta([], AGORA)).toBe(0);
  });

  it("menos de uma hora ainda é zero, não negativo", () => {
    const msgs = [m({ criada_em: new Date(2026, 8, 3, 14, 10).toISOString() })];
    expect(horasSemResposta(msgs, AGORA)).toBe(0);
  });
});

describe("a prévia da conversa", () => {
  it("mídia vira etiqueta, não texto vazio", () => {
    expect(previaDe(m({ criada_em: "x", tipo: "audio" }))).toBe("🎵 Áudio");
    expect(previaDe(m({ criada_em: "x", tipo: "imagem" }))).toBe("📷 Imagem");
    expect(previaDe(m({ criada_em: "x", tipo: "documento", midia_nome: "extrato.pdf" }))).toBe("📄 extrato.pdf");
    expect(previaDe(m({ criada_em: "x", tipo: "documento" }))).toBe("📄 Documento");
  });

  it("texto é o próprio texto", () => {
    expect(previaDe(m({ criada_em: "x", texto: "oi" }))).toBe("oi");
  });

  it("conversa sem mensagem não vira 'undefined' na tela", () => {
    expect(previaDe(undefined)).toBe("");
  });
});

describe("a duração do áudio", () => {
  it("vira minuto:segundo com dois dígitos", () => {
    expect(duracaoCurta(32)).toBe("0:32");
    expect(duracaoCurta(95)).toBe("1:35");
    expect(duracaoCurta(60)).toBe("1:00");
  });
  it("nulo e negativo viram zero em vez de NaN", () => {
    expect(duracaoCurta(null)).toBe("0:00");
    expect(duracaoCurta(-5)).toBe("0:00");
  });
});
