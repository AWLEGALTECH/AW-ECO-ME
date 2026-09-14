import { test, expect } from "bun:test";
import { parseExtrato, analisarExtrato } from "./parseExtrato";

/* Trechos de extratos reais do Bradesco (nome e conta trocados), com o texto
   exatamente como o pdf.js entrega: data numa linha, histórico em outra, e a
   linha `docto valor saldo` no fim. */

const CABECALHO = (tipo: string, folha: string) => `Bradesco Celular

Data: 28/07/2026 - 22h48

Nome: FULANO DE TAL

Extrato de: Agência: 320 | Conta: 1234-5 | ${tipo} Folha: ${folha}

Data Histórico Docto. Crédito (R$) Débito (R$) Saldo (R$)
`;

/** A página "Últimos Lançamentos" que veio nos QUATRO extratos do mesmo cliente:
    a conta em zero e o banco lançando R$ 34 mil de operações vencidas e mora. */
const ULTIMOS_VENCIDAS = `${CABECALHO("Últimos Lancamentos", "2/2")}
16/04/2025 COD. LANC. 0 0,00

28/07/2026 OPERACOES VENCIDAS 3100208 32.722,37 32.722,37

MORA CREDITO PESSOAL 7000208 227,57 32.949,94

MORA CREDITO PESSOAL 7000208 232,37 33.182,31

MORA CREDITO PESSOAL 7000208 603,07 33.785,38

MORA CREDITO PESSOAL 7000208 615,15 34.400,53

Total 34.400,53 34.400,53
`;

const ANO_2025 = `${CABECALHO("Movimentação entre: 01/01/2025 e 31/12/2025", "1/2")}
31/12/2024 COD. LANC. 0 0,00 0,00

16/04/2025
RECEBIMENTO FORNECEDOR

BRADESCO VIDA E PREVIDENCIA SA
6120067 200,54 200,54

OPERACOES VENCIDAS

CONTR. 3996642
0010106 200,54 0,00

Total 200,54 200,54 0,00
`;

test("operações vencidas e mora saindo de uma conta em zero são DÉBITOS", () => {
  const p = parseExtrato(ANO_2025 + ULTIMOS_VENCIDAS);
  expect(p.reconciliado).toBe(true);
  expect(p.matchRate).toBe(1);
  expect(p.semMovimento).toBe(false);

  const mov = p.transacoes.filter((t) => t.bloco === "movimento");
  expect(mov.map((t) => [t.data, t.valor, t.saldo])).toEqual([
    ["2025-04-16", 200.54, 200.54],
    ["2025-04-16", -200.54, 0],
  ]);
  expect(mov[0].descricao).toBe("RECEBIMENTO FORNECEDOR BRADESCO VIDA E PREVIDENCIA SA");
  // o débito que a IA tinha deixado passar: o banco tomou os 200,54 que entraram
  expect(mov[1].descricao).toBe("OPERACOES VENCIDAS CONTR. 3996642");

  const ult = p.transacoes.filter((t) => t.bloco === "ultimos");
  expect(ult.map((t) => t.valor)).toEqual([-32722.37, -227.57, -232.37, -603.07, -615.15]);
  expect(ult.map((t) => t.saldo)).toEqual([-32722.37, -32949.94, -33182.31, -33785.38, -34400.53]);
  expect(ult[0].data).toBe("2026-07-28");
  // valor igual ao saldo não vaza para a descrição
  expect(ult[0].descricao).toBe("OPERACOES VENCIDAS");
});

test("a página Últimos Lançamentos não puxa o período para o ano da impressão", () => {
  const a = analisarExtrato("EXTRATOS", ANO_2025 + ULTIMOS_VENCIDAS);
  expect(a.periodo).toBe("2025");
  expect(a.semMovimento).toBe(false);
  expect(a.resumo.saidas).toBeCloseTo(200.54 + 34400.53, 2);
});

/* ── conta no vermelho: o saldo devedor vem impresso sem sinal ───────────── */

const ANO_2017_DEVEDOR = `${CABECALHO("Movimentação entre: 01/01/2017 e 31/12/2017", "1/1")}
29/12/2016 COD. LANC. 0 0,00 331,49

02/01/2017
ENCARGOS LIMITE DE CRED

ENCARGO - 13,55%
2004050 157,03 488,52

03/01/2017 IOF S/ UTILIZACAO LIMITE 2004050 4,28 492,80

11/01/2017
TRANSF SALDO C/SAL P/CC

BCO:237 AGE:03707 CTA:0706054-8
1103707 1.087,99 595,19

12/01/2017
SAQUE DIN CORBAN CARTAO

ESPECIE
3707114 200,00 395,19

SAQUE DIN CORBAN CARTAO

ESPECIE
3707114 1.000,00 604,81

13/01/2017
TARIFA BANCARIA

CESTA B.EXPRESSO1
0110117 14,20 619,01

Total 1.087,99 1.375,51 619,01
`;

const SINAIS_2017 = [-157.03, -4.28, 1087.99, -200, -1000, -14.2];
const SALDOS_2017 = [-488.52, -492.8, 595.19, 395.19, -604.81, -619.01];

test("conta que abre devedora: encargo não é entrada, e o salário cruza o zero", () => {
  // pelo módulo dos saldos a tarifa "aumentava" o saldo e virava crédito
  const p = parseExtrato(ANO_2017_DEVEDOR);
  expect(p.saldoInicial).toBe(-331.49);
  expect(p.transacoes.map((t) => t.valor)).toEqual(SINAIS_2017);
  expect(p.transacoes.map((t) => t.saldo)).toEqual(SALDOS_2017);
  expect(p.saldoFinal).toBe(-619.01);
  expect(p.reconciliado).toBe(true);
  expect(p.matchRate).toBe(1);
});

test("sem a linha Total, o vocabulário das rubricas decide a orientação", () => {
  const semTotal = ANO_2017_DEVEDOR.replace(/^Total.*$/m, "");
  const p = parseExtrato(semTotal);
  expect(p.saldoInicial).toBe(-331.49);
  expect(p.transacoes.map((t) => t.valor)).toEqual(SINAIS_2017);
});

test("sem rubrica conhecida, a linha Total decide a orientação sozinha", () => {
  const anonimo = ANO_2017_DEVEDOR
    .replace(/ENCARGOS LIMITE DE CRED|IOF S\/ UTILIZACAO LIMITE|TRANSF SALDO C\/SAL P\/CC|SAQUE DIN CORBAN CARTAO|TARIFA BANCARIA/g, "LANCAMENTO QUALQUER")
    .replace(/ENCARGO - 13,55%|ESPECIE|CESTA B\.EXPRESSO1|BCO:237 AGE:03707 CTA:0706054-8/g, "");
  const p = parseExtrato(anonimo);
  expect(p.transacoes.map((t) => t.valor)).toEqual(SINAIS_2017);
  // e, sem Total nem rubrica, fica a conta no azul, que é o normal de um extrato
  const cego = anonimo.replace(/^Total.*$/m, "");
  expect(parseExtrato(cego).saldoInicial).toBe(331.49);
});

/* ── vários extratos no mesmo PDF ────────────────────────────────────────── */

const ULTIMOS_PIX = `${CABECALHO("Últimos Lancamentos", "2/2")}
07/04/2026 COD. LANC. 0 1.476,79

10/04/2026
TRANSFERENCIA PIX

DES: FULANO DE TAL 10/04
1657274 70,00 1.546,79

Total 70,00 1.546,79
`;

const ANO_2018 = `${CABECALHO("Movimentação entre: 01/01/2018 e 31/12/2018", "1/1")}
28/12/2017 COD. LANC. 0 0,00 619,01

05/01/2018 INSS 1234567 1.500,00 880,99

Total 1.500,00 0,00 880,99
`;

test("um PDF com dez anos não para no primeiro Total, e a página repetida entra uma vez", () => {
  // o parser antigo parava no primeiro "Total" e jogava fora os outros anos
  const p = parseExtrato(ANO_2017_DEVEDOR + ULTIMOS_PIX + ANO_2018 + ULTIMOS_PIX);
  const mov = p.transacoes.filter((t) => t.bloco === "movimento");
  const ult = p.transacoes.filter((t) => t.bloco === "ultimos");
  expect(mov).toHaveLength(7);
  expect(mov[6]).toMatchObject({ data: "2018-01-05", valor: 1500, saldo: 880.99, descricao: "INSS" });
  expect(ult).toHaveLength(1);
  // PIX para um destinatário (DES:) é saída, e a conta estava devedora
  expect(ult[0]).toMatchObject({ valor: -70, saldo: -1546.79 });
  expect(p.saldoInicial).toBe(-331.49);
  expect(p.saldoFinal).toBe(880.99);
  expect(analisarExtrato("EXTRATOS 2017-2026.pdf", ANO_2017_DEVEDOR + ULTIMOS_PIX + ANO_2018).periodo).toBe("2017–2018");
});

/* ── "Extrato inexistente" ───────────────────────────────────────────────── */

const INEXISTENTE = `${CABECALHO("Movimentação entre: 24/12/2017 e 29/11/2018", "1/2")}
Extrato inexistente
${CABECALHO("Últimos Lancamentos", "2/2")}
02/06/2026 COD. LANC. 0 1,94

03/06/2026
MORA CREDITO PESSOAL

CONTR 535525580 PARC 010/060
1234567 1,94 0,00

05/06/2026 MORA CREDITO PESSOAL 1234567 6,15 6,15

MORA CREDITO PESSOAL 1234567 398,70 404,85

Total 406,79 404,85
`;

test("extrato inexistente: sem movimento no período, e os últimos lançamentos são débitos", () => {
  // antes ia para a IA, que datava tudo no dia da impressão e chutava o sinal
  const p = parseExtrato(INEXISTENTE);
  expect(p.semMovimento).toBe(true);
  expect(p.reconciliado).toBe(true);
  expect(p.transacoes.every((t) => t.bloco === "ultimos")).toBe(true);
  expect(p.transacoes.map((t) => t.valor)).toEqual([-1.94, -6.15, -398.7]);
  expect(p.transacoes.map((t) => t.saldo)).toEqual([0, -6.15, -404.85]);
  expect(analisarExtrato("EXTRATOS", INEXISTENTE).periodo).toBe("2017–2018");
});

test("extrato inexistente sem lançamento nenhum é reconciliado vazio, não falha", () => {
  const p = parseExtrato(`${CABECALHO("Movimentação entre: 01/01/2020 e 31/12/2020", "1/1")}\nExtrato inexistente\n`);
  expect(p.transacoes).toEqual([]);
  expect(p.semMovimento).toBe(true);
  expect(p.reconciliado).toBe(true);
});

/* ── o que não muda ──────────────────────────────────────────────────────── */

test("layout sem COD. LANC.: a primeira linha de saldo continua sendo a abertura", () => {
  const p = parseExtrato(`01/02/2020 SALDO INICIAL 0 0,00 100,00\n02/02/2020 PIX RECEBIDO 111 50,00 150,00\n03/02/2020 PIX ENVIADO 222 30,00 120,00\n`);
  expect(p.saldoInicial).toBe(100);
  expect(p.transacoes.map((t) => t.valor)).toEqual([50, -30]);
});

test("texto sem extrato nenhum não é reconciliado", () => {
  const p = parseExtrato("CONTRATO DE HONORÁRIOS ADVOCATÍCIOS\nAssinado digitalmente na ZapSign\n");
  expect(p.transacoes).toEqual([]);
  expect(p.reconciliado).toBe(false);
  expect(p.semMovimento).toBe(false);
});

test("IOF de um centavo não vira crédito por tolerância folgada", () => {
  const p = parseExtrato(`${CABECALHO("Movimentação entre: 01/01/2024 e 31/12/2024", "1/1")}
31/12/2023 COD. LANC. 0 0,00 60,10

02/10/2024 IOF S/ UTILIZACAO LIMITE 1234567 0,01 60,09

Total 0,00 0,01 60,09
`);
  expect(p.transacoes.map((t) => t.valor)).toEqual([-0.01]);
});
