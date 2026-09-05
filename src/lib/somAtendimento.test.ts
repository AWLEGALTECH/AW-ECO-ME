import { describe, it, expect } from "bun:test";
import { somDaMensagem, DESENHO, duracaoTotal } from "./somAtendimento";

describe("qual som toca", () => {
  it("mensagem que eu mandei, na conversa aberta: confirmação", () => {
    expect(somDaMensagem({ direcao: "saida", conversaId: "c1", conversaAberta: "c1" }))
      .toBe("enviada");
  });

  it("mensagem que chegou na conversa que estou olhando: discreto", () => {
    expect(somDaMensagem({ direcao: "entrada", conversaId: "c1", conversaAberta: "c1" }))
      .toBe("recebida-aberta");
  });

  it("mensagem que chegou em OUTRA conversa: é a única notícia de verdade", () => {
    expect(somDaMensagem({ direcao: "entrada", conversaId: "c2", conversaAberta: "c1" }))
      .toBe("recebida-fechada");
  });

  it("sem conversa aberta, tudo que chega é notícia", () => {
    expect(somDaMensagem({ direcao: "entrada", conversaId: "c2", conversaAberta: null }))
      .toBe("recebida-fechada");
  });

  // Foi enviada de outro lugar — outra aba, o celular do escritório. Um bipe de
  // confirmação para um gesto que a pessoa não fez é ruído puro.
  it("mensagem NOSSA em conversa fechada não toca nada", () => {
    expect(somDaMensagem({ direcao: "saida", conversaId: "c2", conversaAberta: "c1" }))
      .toBeNull();
    expect(somDaMensagem({ direcao: "saida", conversaId: "c2", conversaAberta: null }))
      .toBeNull();
  });

  it("direção que eu não conheço não inventa som", () => {
    expect(somDaMensagem({ direcao: "qualquer", conversaId: "c1", conversaAberta: "c1" }))
      .toBeNull();
  });
});

describe("o peso de cada som", () => {
  // A regra de desenho, escrita como teste pra não se perder num ajuste
  // distraído de volume: o que interrompe tem que ser o mais alto, e o que só
  // confirma um gesto tem que ser o mais baixo.
  it("conversa fechada é o mais alto; envio é o mais baixo", () => {
    expect(DESENHO["recebida-fechada"].volume)
      .toBeGreaterThan(DESENHO["recebida-aberta"].volume);
    expect(DESENHO["recebida-aberta"].volume)
      .toBeGreaterThan(DESENHO["enviada"].volume);
  });

  // A primeira versão fixava o teto em 6% e passava nos testes soando NADA:
  // -29 dB num blip de 60ms não chega ao ouvido. Discreto é o som que não
  // assusta, não o que não existe — então a regra virou proporção, e ganhou um
  // piso audível junto.
  it("os discretos são fração do alto, mas continuam audíveis", () => {
    const alto = DESENHO["recebida-fechada"].volume;
    expect(DESENHO["enviada"].volume).toBeLessThan(alto / 3);
    expect(DESENHO["recebida-aberta"].volume).toBeLessThan(alto / 2);
    expect(DESENHO["enviada"].volume).toBeGreaterThanOrEqual(0.08);
    expect(DESENHO["recebida-aberta"].volume).toBeGreaterThanOrEqual(0.08);
  });

  it("só o de conversa fechada tem duas notas — as outras são um toque só", () => {
    expect(DESENHO["recebida-fechada"].notas).toHaveLength(2);
    expect(DESENHO["enviada"].notas).toHaveLength(1);
    expect(DESENHO["recebida-aberta"].notas).toHaveLength(1);
  });

  it("as duas notas SOBEM — descer soaria como erro", () => {
    const [a, b] = DESENHO["recebida-fechada"].notas;
    expect(b).toBeGreaterThan(a);
  });

  // Um bipe que dura meio segundo numa mesa de atendimento é uma tortura na
  // décima mensagem. Nenhum passa de 250ms.
  it("nenhum som passa de um quarto de segundo", () => {
    expect(duracaoTotal("enviada")).toBeLessThan(0.25);
    expect(duracaoTotal("recebida-aberta")).toBeLessThan(0.25);
    expect(duracaoTotal("recebida-fechada")).toBeLessThan(0.25);
  });

  it("o de conversa fechada dura mais que os discretos", () => {
    expect(duracaoTotal("recebida-fechada")).toBeGreaterThan(duracaoTotal("recebida-aberta"));
    expect(duracaoTotal("recebida-aberta")).toBeGreaterThan(duracaoTotal("enviada"));
  });
});
