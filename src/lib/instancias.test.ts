import { describe, it, expect } from "bun:test";
import {
  listaDeInstancias, mesmaInstancia, contemInstancia, juntarPorRecente,
  apelidoDeInstancia, apelidosDeInstancias, corDaInstancia, rotuloDaSelecao,
} from "./instancias";

describe("a lista de números escolhidos", () => {
  it("aceita um só, vários, ou nenhum", () => {
    expect(listaDeInstancias("PDA")).toEqual(["PDA"]);
    expect(listaDeInstancias(["A", "B"])).toEqual(["A", "B"]);
    expect(listaDeInstancias(null)).toEqual([]);
    expect(listaDeInstancias([])).toEqual([]);
  });

  it("tira vazio e repetido, inclusive repetido só na caixa", () => {
    expect(listaDeInstancias(["A", "", "  ", "a", "B"])).toEqual(["A", "B"]);
  });

  it("mantém a ordem em que foram escolhidos", () => {
    expect(listaDeInstancias(["Z", "A", "M"])).toEqual(["Z", "A", "M"]);
  });
});

describe("comparar nome de instância", () => {
  /* O nome é digitado à mão na Evolution e ninguém garante a caixa. Comparar
     exato faria uma conversa não encontrar o próprio número e sumir da caixa. */
  it("ignora caixa e espaço nas pontas", () => {
    expect(mesmaInstancia("PORTAL DIREITO ABERTO", "Portal Direito Aberto")).toBe(true);
    expect(mesmaInstancia(" PDA ", "pda")).toBe(true);
    expect(mesmaInstancia("PDA", "PDA 2")).toBe(false);
    expect(mesmaInstancia(null, "PDA")).toBe(false);
  });

  it("procurar na lista usa a mesma regra", () => {
    expect(contemInstancia(["Portal Direito Aberto"], "PORTAL DIREITO ABERTO")).toBe(true);
    expect(contemInstancia(["A"], "B")).toBe(false);
  });
});

describe("a caixa cruzada", () => {
  const c = (id: string, ultima_em: string | null) => ({ id, ultima_em });

  it("junta os números numa lista só, mais recente primeiro", () => {
    const fora = juntarPorRecente([
      [c("a", "2026-09-05T10:00:00Z"), c("b", "2026-09-01T10:00:00Z")],
      [c("c", "2026-09-07T10:00:00Z"), c("d", "2026-09-03T10:00:00Z")],
    ]);
    expect(fora.map((x) => x.id)).toEqual(["c", "a", "d", "b"]);
  });

  /* Conversa sem data nunca teve mensagem — importada e nunca tocada. No topo
     ela empurraria pra baixo quem está esperando resposta agora. */
  it("quem nunca falou vai pro fim", () => {
    const fora = juntarPorRecente([[c("a", null)], [c("b", "2026-09-01T10:00:00Z")]]);
    expect(fora.map((x) => x.id)).toEqual(["b", "a"]);
  });

  /* Sem desempate estável, duas conversas com o mesmo carimbo trocam de lugar
     entre duas atualizações e a lista pisca sozinha a cada dez segundos. */
  it("empate desempata pelo id, sempre igual", () => {
    const iguais = [[c("z", "2026-09-05T10:00:00Z")], [c("a", "2026-09-05T10:00:00Z")]];
    expect(juntarPorRecente(iguais).map((x) => x.id)).toEqual(["a", "z"]);
    expect(juntarPorRecente([...iguais].reverse()).map((x) => x.id)).toEqual(["a", "z"]);
  });

  it("uma lista só continua funcionando", () => {
    expect(juntarPorRecente([[c("a", "2026-09-05T10:00:00Z")]]).map((x) => x.id)).toEqual(["a"]);
    expect(juntarPorRecente([])).toEqual([]);
  });
});

describe("o apelido curto do número", () => {
  it("são as iniciais, com o número do fim junto", () => {
    expect(apelidoDeInstancia("PORTAL DIREITO ABERTO")).toBe("PDA");
    expect(apelidoDeInstancia("PORTAL DIREITO ABERTO 2")).toBe("PDA2");
    expect(apelidoDeInstancia("Dr. Matheus Enes")).toBe("ME");
  });

  it("palavrinha de ligação não vira inicial", () => {
    expect(apelidoDeInstancia("Portal de Direito")).toBe("PD");
  });

  it("não estoura o selo: no máximo três letras", () => {
    expect(apelidoDeInstancia("Um Nome Bem Comprido De Verdade").length).toBeLessThanOrEqual(4);
  });

  it("nome esquisito não vira vazio", () => {
    expect(apelidoDeInstancia("")).toBe("?");
    expect(apelidoDeInstancia("   ")).toBe("?");
    expect(apelidoDeInstancia("---")).toBe("?");
    expect(apelidoDeInstancia("5511999")).toBe("551");
  });

  /* O apelido existe pro caso em que a FOTO não distingue — duas instâncias do
     mesmo escritório, mesma logo. Dois selos "PDA" não resolveriam nada: a tela
     continuaria sem dizer qual é qual, agora com mais tinta. */
  it("dentro do conjunto escolhido, nunca se repete", () => {
    const m = apelidosDeInstancias(["Portal Direito Aberto", "Posto Delta Alfa"]);
    const valores = [...m.values()];
    expect(new Set(valores).size).toBe(2);
    expect(valores[0]).toBe("PDA");
    expect(valores[1]).toBe("PDA·2");
  });

  it("o conjunto normal sai limpo", () => {
    const m = apelidosDeInstancias(["PORTAL DIREITO ABERTO 2", "Dr. Matheus Enes"]);
    expect(m.get("PORTAL DIREITO ABERTO 2")).toBe("PDA2");
    expect(m.get("Dr. Matheus Enes")).toBe("ME");
  });
});

describe("a cor do número", () => {
  /* Derivada do nome e não da posição: pela posição, tirar um número da seleção
     repintaria os outros, e a cor deixaria de ser atalho. */
  it("é a mesma sempre, para o mesmo nome", () => {
    expect(corDaInstancia("PDA")).toEqual(corDaInstancia("PDA"));
    expect(corDaInstancia("PDA")).toEqual(corDaInstancia("pda"));
  });

  it("nomes diferentes tendem a cores diferentes", () => {
    const cores = new Set(
      ["PORTAL DIREITO ABERTO", "PORTAL DIREITO ABERTO 2", "Dr. Matheus Enes"]
        .map((n) => corDaInstancia(n).fundo));
    expect(cores.size).toBeGreaterThan(1);
  });
});

describe("o rótulo do cartão", () => {
  it("um número mostra o nome dele", () => {
    expect(rotuloDaSelecao(["PDA"], "PORTAL DIREITO ABERTO")).toBe("PORTAL DIREITO ABERTO");
    expect(rotuloDaSelecao([], "PORTAL DIREITO ABERTO")).toBe("PORTAL DIREITO ABERTO");
  });

  it("mais de um diz quantos são", () => {
    expect(rotuloDaSelecao(["A", "B"], "A")).toBe("2 números");
    expect(rotuloDaSelecao(["A", "B", "C"], "A")).toBe("3 números");
  });
});
