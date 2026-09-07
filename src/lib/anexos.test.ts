import { describe, it, expect } from "bun:test";
import { midiasDaLinha, resumoDasMidias, nomeSeguro, type Midia } from "./anexos";

const doc = (nome: string): Midia => ({
  path: `agendados/x/${nome}`, mime: "application/pdf", nome, tipo: "documento",
});

describe("o resumo das mídias", () => {
  /* As colunas antigas continuam existindo e guardam o PRIMEIRO anexo. Não é
     gentileza com código velho: é o que deixa quem ainda lê a forma singular
     mandar algo certo, ainda que incompleto, em vez de mandar nada. */
  it("as colunas antigas espelham o primeiro anexo", () => {
    const r = resumoDasMidias([doc("peticao.pdf"), doc("procuracao.pdf")]);
    expect(r.midia_path).toBe("agendados/x/peticao.pdf");
    expect(r.midia_nome).toBe("peticao.pdf");
    expect(r.tipo).toBe("documento");
    expect(r.midias).toHaveLength(2);
  });

  it("sem anexo nenhum a mensagem é de texto", () => {
    const r = resumoDasMidias([]);
    expect(r.tipo).toBe("texto");
    expect(r.midia_path).toBeNull();
    expect(r.midia_mime).toBeNull();
    expect(r.midia_nome).toBeNull();
    expect(r.duracao).toBeNull();
    expect(r.midias).toEqual([]);
  });

  it("a duração acompanha o áudio quando ele é o primeiro", () => {
    const audio: Midia = {
      path: "agendados/x/a.webm", mime: "audio/webm", nome: "a.webm",
      tipo: "audio", duracao: 32,
    };
    expect(resumoDasMidias([audio]).duracao).toBe(32);
    // e não vaza para uma mensagem cujo primeiro anexo não é voz
    expect(resumoDasMidias([doc("p.pdf"), audio]).duracao).toBeNull();
  });
});

describe("ler os anexos de uma linha", () => {
  it("lê a forma nova", () => {
    const lista = midiasDaLinha({ midias: [doc("a.pdf"), doc("b.pdf")] });
    expect(lista.map((m) => m.nome)).toEqual(["a.pdf", "b.pdf"]);
  });

  /* Uma linha marcada antes desta mudança tem só `midia_path`. Ignorá-la faria
     toda mensagem já agendada com anexo sair sem ele — e ninguém descobriria
     antes do cliente. */
  it("lê a forma antiga como uma lista de um", () => {
    const lista = midiasDaLinha({
      midia_path: "agendados/y/contrato.pdf",
      midia_mime: "application/pdf",
      midia_nome: "contrato.pdf",
      tipo: "documento",
    });
    expect(lista).toHaveLength(1);
    expect(lista[0].path).toBe("agendados/y/contrato.pdf");
    expect(lista[0].tipo).toBe("documento");
  });

  it("mensagem só de texto não tem anexo", () => {
    expect(midiasDaLinha({ midia_path: null, midias: [] })).toEqual([]);
    expect(midiasDaLinha({})).toEqual([]);
  });

  it("descarta item sem caminho em vez de quebrar na hora de mandar", () => {
    const lista = midiasDaLinha({ midias: [{ nome: "sem path" }, doc("ok.pdf")] as unknown as Midia[] });
    expect(lista).toHaveLength(1);
    expect(lista[0].nome).toBe("ok.pdf");
  });
});

describe("o nome do arquivo no bucket", () => {
  it("tira acento e espaço, que viram lixo no caminho da URL", () => {
    expect(nomeSeguro("Petição inicial (2).pdf")).toBe("Peticao_inicial_2_.pdf");
  });

  it("corta o nome comprido pelo fim, que é onde mora a extensão", () => {
    const n = nomeSeguro("a".repeat(200) + ".pdf");
    expect(n.length).toBeLessThanOrEqual(80);
    expect(n.endsWith(".pdf")).toBe(true);
  });
});
