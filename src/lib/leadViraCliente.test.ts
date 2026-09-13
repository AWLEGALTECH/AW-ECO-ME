import { test, expect } from "bun:test";
import {
  primeiroNome, mensagemDeBoasVindas, destinosPossiveis,
  impedimentoDaVirada, explicarImpedimento, motivoDoDescarte,
  BOAS_VINDAS_PADRAO,
} from "./leadViraCliente";

test("o primeiro nome é como se fala com alguém, não como está no extrato", () => {
  expect(primeiroNome("JEFFERSON WOLLACE FERREIRA DE ARAUJO")).toBe("Jefferson");
  expect(primeiroNome("maria da silva")).toBe("Maria");
  expect(primeiroNome("  Ana  ")).toBe("Ana");
  expect(primeiroNome("")).toBe("");
  expect(primeiroNome(null)).toBe("");
  // inicial solta não é nome: "J. Souza" saudado como "J" é pior que sem nome
  expect(primeiroNome("J Souza")).toBe("");
});

test("a mensagem sai com o primeiro nome no lugar do buraco", () => {
  const m = mensagemDeBoasVindas(null, "JEFFERSON WOLLACE FERREIRA DE ARAUJO");
  expect(m).toContain("Jefferson");
  expect(m).not.toContain("{nome}");
  expect(m.startsWith("Olá, Jefferson!")).toBe(true);
});

test("sem nome, a vírgula órfã não fica denunciando o buraco", () => {
  const m = mensagemDeBoasVindas(null, null);
  expect(m).not.toContain("{nome}");
  expect(m).not.toContain(", !");
  expect(m.startsWith("Olá!")).toBe(true);
});

test("o número com mensagem própria manda, e o padrão só cobre o vazio", () => {
  expect(mensagemDeBoasVindas("Dr. Enes na área, {nome}.", "ana paula"))
    .toBe("Dr. Enes na área, Ana.");
  // vazio e só espaço caem no padrão, JÁ SUBSTITUÍDO: o que chega na barra
  // nunca é o modelo cru, é o texto pronto
  const padraoComNome = mensagemDeBoasVindas(BOAS_VINDAS_PADRAO, "Ana");
  expect(mensagemDeBoasVindas("", "Ana")).toBe(padraoComNome);
  expect(mensagemDeBoasVindas("   ", "Ana")).toBe(padraoComNome);
  expect(padraoComNome).not.toContain("{nome}");
  // modelo sem o buraco vai inteiro, sem inventar nome
  expect(mensagemDeBoasVindas("Bem-vindo!", "Ana")).toBe("Bem-vindo!");
});

test("o destino não pode ser o número de onde ele sai, nem um desligado", () => {
  const insts = [
    { id: "1", nome: "PORTAL DIREITO ABERTO" },
    { id: "2", nome: "Dr. Matheus Enes Corporativo" },
    { id: "3", nome: "NÚMERO VELHO", ativa: false },
  ];
  const d = destinosPossiveis(insts, "PORTAL DIREITO ABERTO");
  expect(d.map((i) => i.id)).toEqual(["2"]);
  // a comparação não tropeça em caixa nem em espaço nas pontas
  expect(destinosPossiveis(insts, "  portal direito aberto ").map((i) => i.id)).toEqual(["2"]);
});

test("quem já é cliente não vira de novo, e sem destino não há para onde ir", () => {
  const um = [{ id: "2", nome: "Corporativo" }];
  expect(impedimentoDaVirada({ destinos: um })).toBeNull();
  expect(impedimentoDaVirada({ jaVirouEm: "2026-09-13", destinos: um })).toBe("ja_e_cliente");
  expect(impedimentoDaVirada({ destinos: [] })).toBe("sem_destino");
  // já cliente vence: é o motivo mais informativo dos dois
  expect(impedimentoDaVirada({ jaVirouEm: "2026-09-13", destinos: [] })).toBe("ja_e_cliente");
});

test("todo impedimento sabe se explicar, e 'nenhum' não vira texto", () => {
  expect(explicarImpedimento("ja_e_cliente").length).toBeGreaterThan(10);
  expect(explicarImpedimento("sem_destino").length).toBeGreaterThan(10);
  expect(explicarImpedimento(null)).toBe("");
});

test("o motivo do descarte junta a escolha com o detalhe, e aguenta faltar um", () => {
  expect(motivoDoDescarte("Desistiu", "achou caro")).toBe("Desistiu: achou caro");
  expect(motivoDoDescarte("Desistiu", "")).toBe("Desistiu");
  expect(motivoDoDescarte("", "sumiu do mapa")).toBe("sumiu do mapa");
  expect(motivoDoDescarte("", "")).toBe("");
  // espaço dobrado no detalhe não vira ruído na contagem por motivo
  expect(motivoDoDescarte("Desistiu", "  achou   caro  ")).toBe("Desistiu: achou caro");
});
