import { test, expect } from "bun:test";
import {
  chaveDeRequerido, nomesDaLista, listaDosNomes, nomesDasChaves, mesmasChaves, fonteDoRequerido,
} from "./requeridos";

/* A CHAVE PRECISA BATER COM A DO BANCO, senão o mesmo réu entra no catálogo
   duas vezes — uma pela tela e uma pelo gatilho da publicação. Os casos aqui
   são os nomes reais da carteira, com os acentos e a pontuação que o tribunal
   escreve. */
test("a chave espelha fn_requerido_chave", () => {
  expect(chaveDeRequerido("Banco Bradesco")).toBe("BANCO_BRADESCO");
  expect(chaveDeRequerido("Bradesco Vida e Previdência")).toBe("BRADESCO_VIDA_E_PREVIDENCIA");
  expect(chaveDeRequerido("Amazonas Energia (Âmbar)")).toBe("AMAZONAS_ENERGIA_AMBAR");
  expect(chaveDeRequerido("POUPEX / FHE")).toBe("POUPEX_FHE");
  expect(chaveDeRequerido("Itaú Unibanco")).toBe("ITAU_UNIBANCO");
  expect(chaveDeRequerido("J.r. da Silva Locação de Automoveis Eireli"))
    .toBe("J_R_DA_SILVA_LOCACAO_DE_AUTOMOVEIS_EIRELI");
});

test("a chave não começa nem termina em separador", () => {
  expect(chaveDeRequerido("  (Âmbar)  ")).toBe("AMBAR");
  expect(chaveDeRequerido("- BMG -")).toBe("BMG");
});

/* BANCO BRADESCO e BRADESCO VIDA E PREVIDÊNCIA são pessoas jurídicas
   diferentes, e a distinção sustenta o produto "Vida e Previdência" do Writer.
   Se um dia a canonização juntar as duas, este teste cai antes de a carteira
   perder a diferença. */
test("Bradesco e Bradesco Vida não colidem", () => {
  expect(chaveDeRequerido("Banco Bradesco")).not.toBe(chaveDeRequerido("Bradesco Vida e Previdência"));
});

test("a lista digitada separa por vírgula e limpa espaço", () => {
  expect(nomesDaLista("Banco Bradesco, Banco BMG")).toEqual(["Banco Bradesco", "Banco BMG"]);
  expect(nomesDaLista("  Estado do Amazonas ,, DETRAN/AM ")).toEqual(["Estado do Amazonas", "DETRAN/AM"]);
  expect(nomesDaLista("")).toEqual([]);
});

/* Razão social COM vírgula é o caso que dói: quem digitar o nome inteiro da
   Facta vai ver três chips em vez de um. É consequência aceita da regra — o
   teste existe pra deixar isso escrito, não pra fingir que não acontece. */
test("razão social com vírgula parte em pedaços — comportamento conhecido", () => {
  expect(nomesDaLista("FACTA FINANCEIRA S.A. CREDITO, FINANCIAMENTO E INVESTIMENTO"))
    .toEqual(["FACTA FINANCEIRA S.A. CREDITO", "FINANCIAMENTO E INVESTIMENTO"]);
});

test("ida e volta entre lista e nomes", () => {
  const nomes = ["Banco Bradesco", "Banco BMG"];
  expect(nomesDaLista(listaDosNomes(nomes))).toEqual(nomes);
});

test("chave sem catálogo mostra a si mesma em vez de sumir", () => {
  expect(nomesDasChaves(["BANCO_BRADESCO", "XPTO"], { BANCO_BRADESCO: "Banco Bradesco" }))
    .toEqual(["Banco Bradesco", "XPTO"]);
  expect(nomesDasChaves(null, {})).toEqual([]);
});

/* Ordem não conta: litisconsórcio não tem primeiro réu, e comparar em ordem
   marcaria o processo como alterado toda vez que o banco devolvesse o array
   noutra sequência — gravando origem "manual" sobre um "djen" sem ninguém ter
   editado nada. */
test("mesmasChaves ignora a ordem", () => {
  expect(mesmasChaves(["A", "B"], ["B", "A"])).toBe(true);
  expect(mesmasChaves(["A"], ["A", "B"])).toBe(false);
  expect(mesmasChaves(null, [])).toBe(true);
});

test("a fonte vira frase, e o herdado avisa que não foi conferido", () => {
  expect(fonteDoRequerido("djen")).toContain("tribunal");
  expect(fonteDoRequerido("contrato")).toContain("não conferido");
  expect(fonteDoRequerido(null)).toBeNull();
});
