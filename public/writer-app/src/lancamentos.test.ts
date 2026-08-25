// O Writer é vanilla JS carregado por <script> — não tem import/export. Pra
// testar as funções puras do docx.js sem transformar o arquivo em módulo (o
// que quebraria os outros nove que dependem dele no escopo global), a fonte é
// avaliada num contexto de VM com um `state` falso no lugar da planilha.
//
// O que se testa aqui é o que a peça de DÍVIDA EM ATRASO AFIRMA sobre os
// fatos: quantos lançamentos foram, em que janela caíram, do menor ao maior
// valor, e se subiram em rampa. Cada um desses vira frase na petição, e cada
// erro vira um número errado num documento protocolado.

import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

const fonte = readFileSync(new URL("./docx.js", import.meta.url), "utf8");

interface Linha {
  tipo: string;
  data?: string;
  valor?: number;
  operacao?: string;
  descricao?: string;
  rubricaKey?: string;
}

const sandbox: Record<string, unknown> = {
  state: { anexos: {} as { tabelaXlsx?: { linhasClassificadas: Linha[] } | null } },
  document: { querySelector: () => null },
  window: {},
  console,
  navigator: {},
  alert: () => {},
  fetch: () => {},
  setTimeout,
  clearTimeout,
};
sandbox.globalThis = sandbox;
createContext(sandbox);
runInContext(fonte, sandbox, { filename: "docx.js" });

const numeroPorExtensoMasc = sandbox.numeroPorExtensoMasc as (n: number) => string;
const valorPorExtenso = sandbox.valorPorExtenso as (v: number) => string;
const dataBRPorExtenso = sandbox.dataBRPorExtenso as (d: string) => string;
const montarDadosDosLancamentos = sandbox.montarDadosDosLancamentos as () => Record<string, string | boolean>;

const estado = sandbox.state as { anexos: { tabelaXlsx?: { linhasClassificadas: Linha[] } | null } };
function planilha(linhas: Linha[] | null) {
  estado.anexos.tabelaXlsx = linhas ? { linhasClassificadas: linhas } : null;
}
const dado = (data: string, valor: number, operacao = "0010000", rubricaKey = "divida_atraso"): Linha =>
  ({ tipo: "dado", data, valor, operacao, descricao: "DIV. EM ATRASO", rubricaKey });

test("inteiro por extenso, no masculino", () => {
  expect(numeroPorExtensoMasc(0)).toBe("zero");
  expect(numeroPorExtensoMasc(1)).toBe("um");
  expect(numeroPorExtensoMasc(2)).toBe("dois");
  expect(numeroPorExtensoMasc(14)).toBe("quatorze");
  expect(numeroPorExtensoMasc(68)).toBe("sessenta e oito");
  expect(numeroPorExtensoMasc(100)).toBe("cem");
  expect(numeroPorExtensoMasc(101)).toBe("cento e um");
  expect(numeroPorExtensoMasc(348)).toBe("trezentos e quarenta e oito");
  expect(numeroPorExtensoMasc(1000)).toBe("mil");
  expect(numeroPorExtensoMasc(2000000)).toBe("dois milhões");
});

test("a vírgula entre grupos vira 'e' quando o último grupo é pequeno ou redondo", () => {
  expect(numeroPorExtensoMasc(1005)).toBe("mil e cinco");
  expect(numeroPorExtensoMasc(1500)).toBe("mil e quinhentos");
  expect(numeroPorExtensoMasc(14348)).toBe("quatorze mil, trezentos e quarenta e oito");
  expect(numeroPorExtensoMasc(1000001)).toBe("um milhão e um");
});

// A peça original escreve três valores por extenso, de próprio punho. Se o
// helper diverge do que o advogado escreveu, é o helper que está errado.
test("valores por extenso batem com o que a peça original escreveu", () => {
  expect(valorPorExtenso(14348.75))
    .toBe("quatorze mil, trezentos e quarenta e oito reais e setenta e cinco centavos");
  expect(valorPorExtenso(28697.5))
    .toBe("vinte e oito mil, seiscentos e noventa e sete reais e cinquenta centavos");
  expect(valorPorExtenso(36697.5))
    .toBe("trinta e seis mil, seiscentos e noventa e sete reais e cinquenta centavos");
});

test("singular e plural de real e centavo", () => {
  expect(valorPorExtenso(8000)).toBe("oito mil reais");
  expect(valorPorExtenso(1)).toBe("um real");
  expect(valorPorExtenso(0.01)).toBe("um centavo");
  expect(valorPorExtenso(0.09)).toBe("nove centavos");
  expect(valorPorExtenso(0)).toBe("zero real");
});

test("data por extenso, e formato inesperado volta como veio", () => {
  expect(dataBRPorExtenso("28/11/2023")).toBe("28 de novembro de 2023");
  expect(dataBRPorExtenso("01/01/2024")).toBe("1 de janeiro de 2024");
  expect(dataBRPorExtenso("sem data")).toBe("sem data");
  expect(dataBRPorExtenso("")).toBe("");
});

test("rajada num dia só, valores em rampa — o caso que originou a peça", () => {
  planilha([
    { tipo: "cabecalho" },
    ...Array.from({ length: 68 }, (_, i) => dado("28/11/2023", Number((0.09 + i * 24).toFixed(2)))),
    { tipo: "valor_total", valor: 14348.75 },
  ]);
  const d = montarDadosDosLancamentos();
  expect(d.caso_qtd_lancamentos).toBe("68");
  expect(d.caso_qtd_lancamentos_frase).toBe("68 (sessenta e oito)");
  expect(d.caso_menor_lancamento).toBe("0,09");
  expect(d.caso_codigo_operacao).toBe("0010000");
  expect(d.caso_janela_lancamentos).toBe("no dia 28 de novembro de 2023");
  expect(d.caso_concentracao).toBe("concentrados em um único dia");
  expect(d.padrao_escalonado).toBe(true);
});

// O parágrafo que afirma "crescem de forma escalonada e contínua" é afirmação
// sobre os dados. Quando os dados não sustentam, o template troca de parágrafo.
test("valores fora de rampa desligam o parágrafo do padrão escalonado", () => {
  planilha([dado("28/11/2023", 500), dado("28/11/2023", 12), dado("28/11/2023", 300)]);
  const d = montarDadosDosLancamentos();
  expect(d.padrao_escalonado).toBe(false);
  expect(d.caso_menor_lancamento).toBe("12,00");
  expect(d.caso_maior_lancamento).toBe("500,00");
});

test("poucos lançamentos não bastam pra afirmar padrão", () => {
  planilha([dado("28/11/2023", 1), dado("28/11/2023", 2)]);
  expect(montarDadosDosLancamentos().padrao_escalonado).toBe(false);
});

test("lançamentos espalhados viram período, não dia único", () => {
  planilha([dado("05/03/2024", 10), dado("28/11/2023", 20), dado("14/07/2024", 30)]);
  const d = montarDadosDosLancamentos();
  expect(d.caso_data_evento).toBe("28/11/2023");
  expect(d.caso_janela_lancamentos).toBe("no período de 28/11/2023 a 14/07/2024");
  expect(d.caso_concentracao).toBe("lançados de forma reiterada");
});

test("no Mix, conta só as linhas da rubrica de dívida em atraso", () => {
  planilha([
    dado("01/02/2024", 100),
    dado("01/02/2024", 200),
    { tipo: "dado", data: "01/02/2024", valor: 999, operacao: "77", descricao: "CESTA B. EXPRESSO", rubricaKey: "cesta_servicos" },
  ]);
  const d = montarDadosDosLancamentos();
  expect(d.caso_qtd_lancamentos).toBe("2");
  expect(d.caso_maior_lancamento).toBe("200,00");
});

// O argumento é que o banco carimbou tudo com o MESMO código genérico. Se a
// planilha traz mais de um, vence o que mais repete e a frase segue verdadeira.
test("código de operação misturado: vence o mais frequente", () => {
  planilha([dado("01/02/2024", 1, "0010000"), dado("01/02/2024", 2, "0010000"), dado("01/02/2024", 3, "9999")]);
  expect(montarDadosDosLancamentos().caso_codigo_operacao).toBe("0010000");
});

// Sem planilha esta peça não tem o que afirmar. String vazia produziria prosa
// quebrada que passa numa leitura rápida; o colchete não passa.
test("sem planilha, avisa em colchete em vez de sair vazio", () => {
  planilha(null);
  const d = montarDadosDosLancamentos();
  expect(d.caso_qtd_lancamentos).toBe("[Nº DE LANÇAMENTOS]");
  expect(d.caso_janela_lancamentos).toBe("[PERÍODO DOS LANÇAMENTOS]");
  expect(d.padrao_escalonado).toBe(false);
});

test("planilha só com cabeçalho e totais não conta lançamento nenhum", () => {
  planilha([{ tipo: "cabecalho" }, { tipo: "valor_total", valor: 10 }, { tipo: "valor_dobro", valor: 20 }]);
  expect(montarDadosDosLancamentos().caso_qtd_lancamentos).toBe("[Nº DE LANÇAMENTOS]");
});
