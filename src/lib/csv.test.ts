import { describe, it, expect } from "bun:test";
import { lerCsv, csvParaPlanilha } from "./csv";

describe("ler CSV", () => {
  it("linha simples", () => {
    expect(lerCsv("a,b,c")).toEqual([["a", "b", "c"]]);
  });

  it("campo entre aspas com vírgula dentro — o caso que quebra o split", () => {
    // é literalmente a coluna "Respostas" da landing
    const csv = 'Nome,Respostas,Telefone\n'
      + 'Adryel,"Conta: Sim, tenho uma conta | Tempo: Entre 1 e 3 anos",92988124471';
    expect(lerCsv(csv)).toEqual([
      ["Nome", "Respostas", "Telefone"],
      ["Adryel", "Conta: Sim, tenho uma conta | Tempo: Entre 1 e 3 anos", "92988124471"],
    ]);
  });

  it("aspas dobradas viram uma aspa só", () => {
    expect(lerCsv('a,"ele disse ""oi""",b')).toEqual([["a", 'ele disse "oi"', "b"]]);
  });

  it("quebra de linha dentro da célula não vira linha nova", () => {
    const csv = 'Nome,Obs\nMaria,"mora no interior\nvolta segunda"';
    expect(lerCsv(csv)).toEqual([["Nome", "Obs"], ["Maria", "mora no interior\nvolta segunda"]]);
  });

  it("aceita CRLF", () => {
    expect(lerCsv("a,b\r\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("quebra de linha no fim não vira linha vazia", () => {
    expect(lerCsv("a,b\nc,d\n")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("célula vazia continua sendo célula", () => {
    expect(lerCsv("a,,c")).toEqual([["a", "", "c"]]);
  });

  it("texto vazio não quebra", () => {
    expect(lerCsv("")).toEqual([]);
  });
});

describe("CSV vira planilha", () => {
  it("primeira linha é cabeçalho e as outras contam a partir da 2", () => {
    const r = csvParaPlanilha("Data/Hora,Nome,Telefone\n01/09/2026 10:00:00,Maria,92988124471");
    expect(r.cabecalho).toEqual(["Data/Hora", "Nome", "Telefone"]);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].linha).toBe(2);
    expect(r.linhas[0].celulas[1]).toBe("Maria");
  });

  it("cabeçalho com espaço sobrando não atrapalha a busca por nome", () => {
    expect(csvParaPlanilha(" Nome , Telefone \nx,y").cabecalho).toEqual(["Nome", "Telefone"]);
  });

  it("arquivo vazio devolve vazio em vez de estourar", () => {
    expect(csvParaPlanilha("")).toEqual({ cabecalho: [], linhas: [] });
  });
});
