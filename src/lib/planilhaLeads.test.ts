import { describe, it, expect } from "bun:test";
import {
  chaveDeColuna, mapearColunas, dataDaPlanilha, leadDaLinha, lerPlanilha, resumoDasRespostas,
  dossieExtra, resumoDoDossie, colunasEscolhiveis,
} from "./planilhaLeads";

/* O cabeçalho real da planilha da LP (LEADS BANCARIOS): */
const CABECALHO = ["Data/Hora", "Nome", "Telefone", "Cidade", "Respostas", "Origem"];

describe("comparar nome de coluna", () => {
  it("ignora acento, caixa e pontuação", () => {
    expect(chaveDeColuna("Data/Hora")).toBe("data hora");
    expect(chaveDeColuna("  MUNICÍPIO ")).toBe("municipio");
    expect(chaveDeColuna("WhatsApp com DDD")).toBe("whatsapp com ddd");
  });
});

describe("achar as colunas", () => {
  it("acha as da planilha da LP", () => {
    const m = mapearColunas(CABECALHO);
    expect(m.chegouEm).toBe(0);
    expect(m.nome).toBe(1);
    expect(m.telefone).toBe(2);
    expect(m.cidade).toBe(3);
    expect(m.respostas).toBe(4);
    expect(m.origem).toBe(5);
  });

  it("aguenta a coluna com outro nome", () => {
    // é o cabeçalho do formulário de estágio: mesma ideia, outras palavras
    const m = mapearColunas(["Carimbo de data/hora", "Nome completo", "WhatsApp com DDD", "E-mail"]);
    expect(m.chegouEm).toBe(0);
    expect(m.nome).toBe(1);
    expect(m.telefone).toBe(2);
  });

  it("coluna inserida no meio não desloca nada", () => {
    // ESTE é o ponto de ler por nome: por posição, a fila inteira passaria a
    // discar a cidade achando que é telefone
    const m = mapearColunas(["Data/Hora", "Nome", "E-mail", "Telefone", "Cidade"]);
    expect(m.telefone).toBe(3);
  });

  it("campo que não existe volta -1, não 0", () => {
    expect(mapearColunas(["Nome", "Telefone"]).cidade).toBe(-1);
  });
});

describe("a data da planilha", () => {
  it("lê dia/mês/ano com hora", () => {
    const iso = dataDaPlanilha("01/09/2026 10:58:39");
    expect(new Date(iso!).getDate()).toBe(1);
    expect(new Date(iso!).getMonth()).toBe(8);   // setembro
    expect(new Date(iso!).getHours()).toBe(10);
  });

  it("dia 09 do mês 01 não vira 9 de janeiro invertido", () => {
    // o erro que ninguém percebe: as duas leituras dão datas plausíveis
    const iso = dataDaPlanilha("09/01/2026");
    expect(new Date(iso!).getDate()).toBe(9);
    expect(new Date(iso!).getMonth()).toBe(0);
  });

  it("aceita vírgula entre data e hora", () => {
    expect(dataDaPlanilha("20/08/2026, 09:48:12")).not.toBeNull();
  });

  it("o que não é data vira null em vez de data errada", () => {
    expect(dataDaPlanilha("")).toBeNull();
    expect(dataDaPlanilha("ontem")).toBeNull();
  });
});

describe("a linha vira lead", () => {
  const mapa = mapearColunas(CABECALHO);
  const linha = (t: string, nome = "Adryel Melo") =>
    leadDaLinha(CABECALHO, mapa, 3, ["01/09/2026 16:42:57", nome, t, "Manaus/AM", "Conta: Sim", "Resolva Já"]);

  it("telefone é canonicalizado como no resto do sistema", () => {
    expect(linha("(92) 98812-4471")!.telefone).toBe("5592988124471");
    expect(linha("92988124471")!.telefone).toBe("5592988124471");
  });

  it("guarda a linha inteira no bruto, inclusive o que eu não li", () => {
    const l = linha("92988124471")!;
    expect(l.bruto["Cidade"]).toBe("Manaus/AM");
    expect(l.bruto["Origem"]).toBe("Resolva Já");
  });

  it("telefone que não presta derruba a linha em vez de virar cartão quebrado", () => {
    expect(linha("99999999999")).not.toBeNull();  // 11 dígitos: passa
    expect(linha("123")).toBeNull();
    expect(linha("")).toBeNull();
  });

  it("campo vazio vira null, não string vazia", () => {
    expect(linha("92988124471", "  ")!.nome).toBeNull();
  });
});

describe("a planilha inteira", () => {
  it("a pessoa que preencheu duas vezes é uma pessoa, e vale a linha mais nova", () => {
    const { leads } = lerPlanilha(CABECALHO, [
      { linha: 2, celulas: ["01/09/2026 10:00:00", "Maria", "92988124471", "Manaus/AM", "primeira vez", "LP"] },
      { linha: 3, celulas: ["02/09/2026 09:00:00", "Maria Silva", "92988124471", "Manaus/AM", "voltou", "LP"] },
    ]);
    expect(leads).toHaveLength(1);
    expect(leads[0].nome).toBe("Maria Silva");
    expect(leads[0].respostas).toBe("voltou");
  });

  it("conta as linhas que teve que ignorar em vez de escondê-las", () => {
    const { leads, ignoradas } = lerPlanilha(CABECALHO, [
      { linha: 2, celulas: ["01/09/2026 10:00:00", "Maria", "92988124471", "", "", ""] },
      { linha: 3, celulas: ["01/09/2026 11:00:00", "Sem telefone", "abc", "", "", ""] },
      { linha: 4, celulas: ["", "", "", "", "", ""] },
    ]);
    expect(leads).toHaveLength(1);
    expect(ignoradas).toBe(1);   // a linha 4 é vazia: não conta como problema
  });

  it("guarda o número da linha da planilha, não o índice", () => {
    const { leads } = lerPlanilha(CABECALHO, [
      { linha: 7, celulas: ["01/09/2026 10:00:00", "Maria", "92988124471", "", "", ""] },
    ]);
    expect(leads[0].linha).toBe(7);
  });
});

describe("o resumo das respostas", () => {
  it("troca as barras por pontos e junta o espaço", () => {
    expect(resumoDasRespostas("Conta: Sim  |  Tempo: 2 anos")).toBe("Conta: Sim · Tempo: 2 anos");
  });
  it("corta o que é longo demais pro cartão", () => {
    const r = resumoDasRespostas("a".repeat(200), 20);
    expect(r).toHaveLength(20);
    expect(r.endsWith("…")).toBe(true);
  });
  it("sem resposta, não escreve nada", () => {
    expect(resumoDasRespostas(null)).toBe("");
  });
});

describe("o que a planilha trouxe além do contato", () => {
  /* cabeçalho REAL da LP Bradesco — ela não tem coluna "Respostas": o que
     interessa está espalhado em colunas próprias */
  const bruto = {
    "Carimbo de data/hora": "04/09/2026 00:22:55",
    "NOME": "Gilson",
    "WHATSAPP": "92995072858",
    "DATA": "04/09/2026",
    "HORA": "00:22",
    "ORIGEM": "LP BRADESCO",
    "DESCONTOS": "Seguro, cesta de serviços",
    "TEMPO DE CONTA": "Mais de 5 anos",
    "USO DA CONTA": "Só recebo salário",
    "APP BRADESCO": "Sim",
    "SCORE": "8",
  };

  it("sobram as colunas que a ficha ainda não mostrou", () => {
    expect(dossieExtra(bruto).map((c) => c.rotulo)).toEqual([
      "DESCONTOS", "TEMPO DE CONTA", "USO DA CONTA", "APP BRADESCO", "SCORE",
    ]);
  });

  it("nome, telefone, data, hora e origem não se repetem", () => {
    const rotulos = dossieExtra(bruto).map((c) => c.rotulo);
    for (const r of ["NOME", "WHATSAPP", "DATA", "HORA", "ORIGEM", "Carimbo de data/hora"]) {
      expect(rotulos).not.toContain(r);
    }
  });

  it("coluna vazia não vira linha vazia na ficha", () => {
    expect(dossieExtra({ "SCORE": "   ", "DESCONTOS": "Seguro" }).map((c) => c.rotulo)).toEqual(["DESCONTOS"]);
  });

  it("sem nada extra, devolve lista vazia em vez de estourar", () => {
    expect(dossieExtra(null)).toEqual([]);
    expect(dossieExtra({})).toEqual([]);
  });

  it("o resumo do cartão pega os dois primeiros e cabe na linha", () => {
    const r = resumoDoDossie(bruto, 44);
    expect(r.startsWith("DESCONTOS:")).toBe(true);
    expect(r.length).toBeLessThanOrEqual(44);
  });

  it("sem campo extra, o resumo é vazio e o cartão cai no telefone", () => {
    expect(resumoDoDossie({})).toBe("");
  });
});

describe("escolher quais colunas aparecem", () => {
  const bruto = {
    "NOME": "Gilson", "WHATSAPP": "92995072858", "ORIGEM": "LP BRADESCO",
    "DESCONTOS": "Seguro de vida", "TEMPO DE CONTA": "Mais de 5 anos",
    "USO DA CONTA": "Só recebo salário", "SCORE": "93,1",
  };

  it("mostra só as escolhidas", () => {
    expect(dossieExtra(bruto, ["DESCONTOS", "SCORE"]).map((c) => c.rotulo))
      .toEqual(["DESCONTOS", "SCORE"]);
  });

  it("a ordem é a da escolha, não a da planilha nem o alfabeto", () => {
    // é a única informação que a escolha carrega além do sim/não
    expect(dossieExtra(bruto, ["SCORE", "DESCONTOS"]).map((c) => c.rotulo))
      .toEqual(["SCORE", "DESCONTOS"]);
  });

  it("escolha continua valendo se a planilha mudar o acento ou a caixa", () => {
    expect(dossieExtra({ "Tempo de Conta": "3 anos" }, ["TEMPO DE CONTA"]))
      .toEqual([{ rotulo: "Tempo de Conta", valor: "3 anos" }]);
  });

  it("coluna escolhida que veio vazia não vira linha em branco", () => {
    expect(dossieExtra({ "SCORE": "  " }, ["SCORE", "DESCONTOS"])).toEqual([]);
  });

  it("sem escolha, o comportamento de antes continua", () => {
    expect(dossieExtra(bruto).map((c) => c.rotulo))
      .toEqual(["DESCONTOS", "TEMPO DE CONTA", "USO DA CONTA", "SCORE"]);
    expect(dossieExtra(bruto, []).map((c) => c.rotulo)).toHaveLength(4);
  });

  it("a lista oferecida esconde o que a ficha já mostra em cima", () => {
    expect(colunasEscolhiveis(["Data/Hora", "Nome", "Telefone", "Origem", "DESCONTOS", "SCORE"]))
      .toEqual(["DESCONTOS", "SCORE"]);
  });

  it("coluna sem nome não entra na lista de escolha", () => {
    expect(colunasEscolhiveis(["DESCONTOS", "  ", ""])).toEqual(["DESCONTOS"]);
  });
});
