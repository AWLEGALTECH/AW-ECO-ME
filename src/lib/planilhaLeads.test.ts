import { describe, it, expect } from "bun:test";
import {
  chaveDeColuna, mapearColunas, dataDaPlanilha, leadDaLinha, lerPlanilha, resumoDasRespostas,
  dossieExtra, resumoDoDossie, colunasEscolhiveis, idDaPlanilha, opcoesDoDossie,
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
  /* ESTE TESTE AFIRMA O INSTANTE, e não `getHours()`. A versão anterior dele
     usava a hora local de quem roda — a mesma suposição que o código tinha —
     e por isso passava com o bug de fuso dentro: os dois erravam juntos e
     concordavam. Instante em ISO não tem essa saída. */
  it("lê dia/mês/ano com hora, no relógio do escritório", () => {
    // 10:58:39 em Manaus (UTC-4) é 14:58:39 em UTC
    expect(dataDaPlanilha("01/09/2026 10:58:39")).toBe("2026-09-01T14:58:39.000Z");
  });

  it("dia 09 do mês 01 não vira 9 de janeiro invertido", () => {
    // o erro que ninguém percebe: as duas leituras dão datas plausíveis
    expect(dataDaPlanilha("09/01/2026")).toBe("2026-01-09T04:00:00.000Z");
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

it("o link inteiro da planilha vira id, e id já pronto passa intacto", () => {
  // ninguém decora que o id é o pedaço entre /d/ e /edit
  expect(idDaPlanilha("https://docs.google.com/spreadsheets/d/1AbC-dEf_9/edit#gid=0")).toBe("1AbC-dEf_9");
  expect(idDaPlanilha("https://docs.google.com/spreadsheets/d/1AbC-dEf_9")).toBe("1AbC-dEf_9");
  expect(idDaPlanilha("  1AbC-dEf_9  ")).toBe("1AbC-dEf_9");
  expect(idDaPlanilha("")).toBe("");
});

/* ── o fuso da planilha, que custou um bug de quatro horas ─────────────────
 *
 * A versão anterior usava `new Date(ano, mes, dia, hora)`, que monta no fuso de
 * QUEM RODA. No navegador isso era Manaus e dava certo por acaso; na edge
 * function, que roda em UTC, o "22:40" do formulário virou 22:40 UTC — 18:40
 * em Manaus. Todo lead passou a chegar quatro horas no passado, e isso quebrou
 * a trava do aviso de lead novo, a contagem de "esta semana" e o filtro de
 * data. Estes testes existem para o relógio da planilha continuar sendo o
 * relógio do escritório, rode onde rodar. */

it("a hora da planilha é a hora do escritório, e não a de quem roda", () => {
  // 22:40 em Manaus (UTC-4) é 02:40 do dia seguinte em UTC
  expect(dataDaPlanilha("15/09/2026 22:40:00")).toBe("2026-09-16T02:40:00.000Z");
  // meio-dia daqui é 16h em UTC
  expect(dataDaPlanilha("15/09/2026 12:00:00")).toBe("2026-09-15T16:00:00.000Z");
});

it("sem hora, o dia começa à meia-noite DAQUI", () => {
  // 00:00 de Manaus é 04:00 UTC do mesmo dia
  expect(dataDaPlanilha("15/09/2026")).toBe("2026-09-15T04:00:00.000Z");
});

it("a leitura não depende do fuso da máquina: o fuso é dito, não herdado", () => {
  /* O mesmo texto, pedido em dois fusos, dá dois instantes diferentes — e é
     isso que prova que a função não está mais usando o relógio de quem roda. */
  expect(dataDaPlanilha("15/09/2026 22:40:00", "UTC")).toBe("2026-09-15T22:40:00.000Z");
  expect(dataDaPlanilha("15/09/2026 22:40:00", "America/Sao_Paulo")).toBe("2026-09-16T01:40:00.000Z");
});

it("dia/mês continua sendo dia/mês, e não a leitura americana", () => {
  // 09/01 é 9 de janeiro, e não 1º de setembro
  expect(dataDaPlanilha("09/01/2026 10:00:00")).toBe("2026-01-09T14:00:00.000Z");
});

it("o que não é data continua devolvendo nulo", () => {
  expect(dataDaPlanilha("")).toBeNull();
  expect(dataDaPlanilha("ontem")).toBeNull();
  expect(dataDaPlanilha("2026-09-15")).toBeNull();
});

/* ── AS COLUNAS NO DOSSIÊ DA CONVERSA ──────────────────────────────────────
   Pedido de 23/09: o dossiê do lead não mostrava nada da planilha. O cabeçalho
   abaixo é o da base real do Bradesco. */

const BRADESCO = [
  "Carimbo de data/hora", "NOME", "WHATSAPP", "DATA", "HORA", "ORIGEM",
  "DESCONTOS", "TEMPO DE CONTA", "USO DA CONTA", "APP BRADESCO", "SCORE",
];

describe("as colunas que o dossiê oferece", () => {
  it("oferece a planilha inteira, na ordem dela, e não só as extras", () => {
    /* O cartão da fila esconde ORIGEM porque o selo já diz de onde veio. No
       dossiê a escolha é da pessoa: "Instagram · anúncio 3" é informação que
       o selo não dá. */
    expect(opcoesDoDossie(BRADESCO, null, null)).toEqual(BRADESCO);
  });

  it("sem cabeçalho (a planilha não abriu), usa as colunas da própria linha", () => {
    expect(opcoesDoDossie(null, { DESCONTOS: "Seguro", SCORE: "700" }, null))
      .toEqual(["DESCONTOS", "SCORE"]);
  });

  it("não repete coluna que só muda de acento ou de caixa", () => {
    expect(opcoesDoDossie(["Tempo de conta"], { "TEMPO DE CONTA": "5 anos" }, ["tempo de conta"]))
      .toEqual(["Tempo de conta"]);
  });

  /* Coluna renomeada na planilha deixaria uma escolha fantasma: não aparece na
     lista, não aparece no dossiê, e não sai nunca. Ela continua na lista para
     poder ser desmarcada. */
  it("a escolhida que sumiu da planilha continua na lista, no fim", () => {
    expect(opcoesDoDossie(["DESCONTOS"], null, ["COLUNA ANTIGA", "DESCONTOS"]))
      .toEqual(["DESCONTOS", "COLUNA ANTIGA"]);
  });

  it("ignora cabeçalho vazio, que a planilha às vezes tem no fim", () => {
    expect(opcoesDoDossie(["DESCONTOS", "", "  "], null, null)).toEqual(["DESCONTOS"]);
  });
});

describe("o que o dossiê mostra", () => {
  const linha = {
    "NOME": "Maria", "WHATSAPP": "92999990000", "ORIGEM": "Instagram · anúncio 3",
    "DESCONTOS": "Cesta, seguro", "SCORE": "640", "TEMPO DE CONTA": "8 anos",
  };

  it("escolhida a mão, até ORIGEM aparece, na ordem da escolha", () => {
    expect(dossieExtra(linha, ["SCORE", "ORIGEM"])).toEqual([
      { rotulo: "SCORE", valor: "640" },
      { rotulo: "ORIGEM", valor: "Instagram · anúncio 3" },
    ]);
  });

  it("sem escolha, mostra o que vai além do contato", () => {
    expect(dossieExtra(linha).map((c) => c.rotulo)).toEqual(["DESCONTOS", "SCORE", "TEMPO DE CONTA"]);
  });

  it("coluna escolhida e vazia nesta linha não vira linha em branco", () => {
    expect(dossieExtra(linha, ["USO DA CONTA", "SCORE"])).toEqual([{ rotulo: "SCORE", valor: "640" }]);
  });
});
