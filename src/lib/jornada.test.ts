import { describe, it, expect } from "bun:test";
import {
  passagensPorEtapa, vezesNaEtapa, quandoDaPassagem, tempoNaEtapa,
  type PassagemDeEtapa,
} from "./jornada";

const CHAVES = ["chegou", "triagem", "extrato", "proposta", "fechado"] as const;

const p = (etapa: string, de: string | null, entrou_em: string, estimado = false): PassagemDeEtapa =>
  ({ etapa, de, entrou_em, estimado });

/* A HISTÓRIA DE UM LEAD QUE VOLTOU. É o caso que a coluna `etapa` sozinha
   apagava: ele chegou em Proposta, voltou pra Extrato e subiu de novo, e a
   palavra guardada no fim conta só o último pedaço disso. */
const historia: PassagemDeEtapa[] = [
  p("chegou",   null,       "2026-08-01T10:00:00Z"),
  p("triagem",  "chegou",   "2026-08-02T11:00:00Z"),
  p("extrato",  "triagem",  "2026-08-05T09:00:00Z"),
  p("proposta", "extrato",  "2026-08-20T15:00:00Z"),
  p("extrato",  "proposta", "2026-08-28T16:00:00Z"),
  p("proposta", "extrato",  "2026-09-03T14:00:00Z"),
];

describe("as passagens por etapa", () => {
  it("agrupa por etapa e numera cada passagem", () => {
    const m = passagensPorEtapa(historia, CHAVES);
    expect(m.get("proposta")?.map((x) => x.vez)).toEqual([1, 2]);
    expect(m.get("extrato")?.map((x) => x.vez)).toEqual([1, 2]);
    expect(m.get("chegou")?.map((x) => x.vez)).toEqual([1]);
    expect(m.get("fechado")).toBeUndefined();
  });

  it("marca como VOLTA quem entrou vindo de uma etapa mais adiante", () => {
    const m = passagensPorEtapa(historia, CHAVES);
    const extrato = m.get("extrato")!;
    expect(extrato[0].voltou).toBe(false);   // veio da triagem, que é antes
    expect(extrato[1].voltou).toBe(true);    // veio da proposta, que é depois
    expect(extrato[1].de).toBe("proposta");
    // subir de novo não é voltar
    expect(m.get("proposta")![1].voltou).toBe(false);
  });

  it("a primeira passagem de todas não é volta, mesmo sem `de`", () => {
    const m = passagensPorEtapa([p("chegou", null, "2026-08-01T10:00:00Z")], CHAVES);
    expect(m.get("chegou")![0].voltou).toBe(false);
  });

  /* A consulta pode chegar em qualquer ordem, e a numeração depende inteiramente
     da sequência estar certa: fora de ordem, a "2ª vez" cairia na passagem
     errada e a data da volta apontaria pro dia errado. */
  it("ordena por data antes de contar, venha o log como vier", () => {
    const bagunçado = [...historia].reverse();
    const m = passagensPorEtapa(bagunçado, CHAVES);
    expect(m.get("proposta")!.map((x) => x.entrouEm)).toEqual([
      "2026-08-20T15:00:00Z", "2026-09-03T14:00:00Z",
    ]);
  });

  it("etapa desconhecida na régua não vira volta por acidente", () => {
    // Uma etapa que saiu da jornada continua no log das conversas antigas.
    const m = passagensPorEtapa([p("arquivada", "proposta", "2026-08-01T10:00:00Z")], CHAVES);
    expect(m.get("arquivada")![0].voltou).toBe(false);
  });

  it("conta quantas vezes o lead bateu na etapa", () => {
    expect(vezesNaEtapa(historia, "proposta")).toBe(2);
    expect(vezesNaEtapa(historia, "chegou")).toBe(1);
    expect(vezesNaEtapa(historia, "fechado")).toBe(0);
  });
});

describe("as datas do log", () => {
  it("dia e hora curtos", () => {
    expect(quandoDaPassagem("2026-08-20T15:30:00")).toBe("20/08 às 15:30");
  });

  it("data inválida não vira 'Invalid Date' na tela", () => {
    expect(quandoDaPassagem("nada disso")).toBe("");
    expect(tempoNaEtapa("nada disso")).toBe("");
  });

  /* Em dias e não em horas: o que se decide olhando isso é "está parado
     demais?", e essa pergunta não muda entre as onze e as quinze horas. */
  it("o tempo na etapa fala como gente", () => {
    const agora = new Date(2026, 8, 7, 10, 0);
    expect(tempoNaEtapa(new Date(2026, 8, 7, 3, 0).toISOString(), agora)).toBe("hoje");
    expect(tempoNaEtapa(new Date(2026, 8, 6, 23, 0).toISOString(), agora)).toBe("há 1 dia");
    expect(tempoNaEtapa(new Date(2026, 7, 28, 9, 0).toISOString(), agora)).toBe("há 10 dias");
  });
});
