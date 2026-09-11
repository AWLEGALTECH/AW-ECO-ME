import { test, expect } from "bun:test";
import {
  lerRespostaDoModelo, normalizarCampo, conferirCampo, montarKit,
  resumoDaLeitura, faltaParaOWriter, CAMPOS_DO_KIT,
  type LeituraBruta,
} from "./leituraDeDocumentos";

/* 529.982.247-25 fecha os dois dígitos verificadores; o -26 não fecha.
   É a diferença que este módulo inteiro existe para enxergar. */
const CPF_BOM = "529.982.247-25";
const CPF_RUIM = "529.982.247-26";

const doc = (nome: string, campos: LeituraBruta["campos"]): LeituraBruta => ({ documento: nome, campos });

/* ── o envelope ───────────────────────────────────────────────────────────── */

test("o JSON vem embrulhado de todo jeito e ainda assim se lê", () => {
  expect(lerRespostaDoModelo('{"cpf":"1"}')).toEqual({ cpf: "1" });
  expect(lerRespostaDoModelo('```json\n{"cpf":"1"}\n```')).toEqual({ cpf: "1" });
  expect(lerRespostaDoModelo('Aqui está:\n{"cpf":"1"}\nEspero ter ajudado.')).toEqual({ cpf: "1" });
});

test("resposta que não tem JSON nenhum devolve nada, e não explode", () => {
  expect(lerRespostaDoModelo("não consegui ler a imagem")).toBeNull();
  expect(lerRespostaDoModelo("")).toBeNull();
  expect(lerRespostaDoModelo("{isto não é json}")).toBeNull();
});

test("lista de um objeto se aproveita: é o mesmo documento embrulhado", () => {
  // cada chamada lê UM documento, então uma lista só pode ser o embrulho errado
  expect(lerRespostaDoModelo('[{"cpf":"1"}]')).toEqual({ cpf: "1" });
});

/* ── normalização ─────────────────────────────────────────────────────────── */

test("o modelo diz 'não encontrado' de cinco maneiras, e todas viram vazio", () => {
  for (const v of ["", "-", "N/A", "não informado", "NAO CONSTA", "null", "  "]) {
    expect(normalizarCampo("profissao", v)).toBe("");
  }
  expect(normalizarCampo("cpf", null)).toBe("");
  expect(normalizarCampo("cpf", undefined)).toBe("");
});

test("CPF e CEP saem formatados como se escreve", () => {
  expect(normalizarCampo("cpf", "52998224725")).toBe(CPF_BOM);
  expect(normalizarCampo("cep", "69083000")).toBe("69083-000");
  // o que não tem o tamanho certo passa cru, para a conferência recusar depois
  expect(normalizarCampo("cpf", "5299822472")).toBe("5299822472");
});

test("a data vem ISO ou brasileira e sai brasileira", () => {
  expect(normalizarCampo("nascimento", "1985-03-12")).toBe("12/03/1985");
  expect(normalizarCampo("nascimento", "12/3/1985")).toBe("12/03/1985");
  expect(normalizarCampo("nascimento", "12.03.1985")).toBe("12/03/1985");
  // ano de dois dígitos: 85 é 1985, 05 é 2005
  expect(normalizarCampo("nascimento", "12/03/85")).toBe("12/03/1985");
});

test("estado civil cai numa das seis ou fica como veio", () => {
  expect(normalizarCampo("estado_civil", "solteira")).toBe("Solteiro(a)");
  expect(normalizarCampo("estado_civil", "VIÚVO")).toBe("Viúvo(a)");
  expect(normalizarCampo("estado_civil", "convivente")).toBe("União estável");
  // "casado em união estável" é união estável, não casado: o CASAD vem depois
  expect(normalizarCampo("estado_civil", "casado em união estável")).toBe("União estável");
  expect(normalizarCampo("estado_civil", "amigado")).toBe("amigado");
});

test("órgão expedidor vira SIGLA/UF", () => {
  expect(normalizarCampo("orgao_expedidor", "ssp am")).toBe("SSP/AM");
  expect(normalizarCampo("orgao_expedidor", "SSP-AM")).toBe("SSP/AM");
  expect(normalizarCampo("orgao_expedidor", "Detran/am")).toBe("DETRAN/AM");
});

test("o nome perde o caixa alta e guarda as partículas", () => {
  expect(normalizarCampo("nome", "JOSE ALMYR DA SILVA")).toBe("Jose Almyr da Silva");
  // lixo de OCR no meio do nome não vira letra
  expect(normalizarCampo("nome", "JEFFERSON 1 WOLLACE")).toBe("Jefferson Wollace");
});

/* ── a prova, campo a campo ───────────────────────────────────────────────── */

test("CPF que não fecha é RECUSADO, não é sugestão", () => {
  expect(conferirCampo("cpf", CPF_BOM).estado).toBe("conferido");
  expect(conferirCampo("cpf", CPF_RUIM).estado).toBe("recusado");
});

test("data que não existe no calendário é recusada", () => {
  expect(conferirCampo("nascimento", "31/02/1985").estado).toBe("recusado");
  expect(conferirCampo("nascimento", "12/03/2099").estado).toBe("recusado");
  expect(conferirCampo("nascimento", "12/03/1985").estado).toBe("conferido");
  // existe no calendário mas daria uma criança: passa, marcada
  expect(conferirCampo("nascimento", "12/03/2020").estado).toBe("revisar");
});

test("o nome se prova cruzando, não sozinho", () => {
  const ctx = { nomeConhecido: "Jefferson Wollace de Souza" };
  // primeiro e último nome batem, o do meio pode faltar num dos documentos
  expect(conferirCampo("nome", "Jefferson Wollace Souza", ctx).estado).toBe("conferido");
  expect(conferirCampo("nome", "Maria Souza", ctx).estado).toBe("revisar");
  // sem nada com que cruzar, ninguém confere nada
  expect(conferirCampo("nome", "Jefferson Wollace Souza").estado).toBe("revisar");
  // nome de uma palavra só é rótulo cortado, não gente
  expect(conferirCampo("nome", "Jefferson", ctx).estado).toBe("revisar");
});

test("RG e endereço nunca se conferem sozinhos", () => {
  expect(conferirCampo("rg", "1234567").estado).toBe("revisar");
  expect(conferirCampo("orgao_expedidor", "SSP/AM").estado).toBe("revisar");
  expect(conferirCampo("endereco", "Rua das Flores, 100, Centro").estado).toBe("revisar");
  // mas o que é curto demais para ser a coisa é recusado
  expect(conferirCampo("rg", "12").estado).toBe("recusado");
  expect(conferirCampo("endereco", "Rua").estado).toBe("recusado");
});

/* ── juntar os documentos ─────────────────────────────────────────────────── */

test("o kit sai sempre inteiro, mesmo sem documento nenhum", () => {
  const kit = montarKit([]);
  expect(kit.map((c) => c.campo)).toEqual(CAMPOS_DO_KIT);
  expect(kit.every((c) => c.valor === "")).toBe(true);
});

test("o CPF recusado perde para o que fecha, venha de onde vier", () => {
  const kit = montarKit([
    doc("foto-do-rg.pdf", { cpf: CPF_RUIM }),
    doc("cpf.pdf", { cpf: CPF_BOM }),
  ]);
  const cpf = kit.find((c) => c.campo === "cpf")!;
  expect(cpf.valor).toBe(CPF_BOM);
  expect(cpf.estado).toBe("conferido");
  expect(cpf.documento).toBe("cpf.pdf");
  // o que foi recusado não some: aparece ao lado para a pessoa ver o que houve
  expect(cpf.divergentes).toEqual([{ valor: CPF_RUIM, documento: "foto-do-rg.pdf" }]);
});

test("dois documentos discordando derrubam o conferido", () => {
  const ctx = { nomeConhecido: "Jefferson Wollace de Souza" };
  const kit = montarKit([
    doc("rg.pdf", { nome: "JEFFERSON WOLLACE DE SOUZA" }),
    doc("conta-de-luz.pdf", { nome: "MARIA APARECIDA DE SOUZA" }),
  ], ctx);
  const nome = kit.find((c) => c.campo === "nome")!;
  expect(nome.valor).toBe("Jefferson Wollace de Souza");
  expect(nome.estado).toBe("revisar");
  expect(nome.porque).toBe("outro documento diz coisa diferente");
  expect(nome.divergentes[0].valor).toBe("Maria Aparecida de Souza");
});

test("no CPF a discordância não derruba nada: ali a prova é aritmética", () => {
  const kit = montarKit([doc("a.pdf", { cpf: CPF_BOM }), doc("b.pdf", { cpf: CPF_RUIM })]);
  expect(kit.find((c) => c.campo === "cpf")!.estado).toBe("conferido");
});

test("quando ninguém se prova, ganha o que mais documentos repetiram", () => {
  const kit = montarKit([
    doc("a.pdf", { rg: "1234567" }),
    doc("b.pdf", { rg: "7654321" }),
    doc("c.pdf", { rg: "7654321" }),
  ]);
  const rg = kit.find((c) => c.campo === "rg")!;
  expect(rg.valor).toBe("7654321");
  expect(rg.estado).toBe("revisar");
  expect(rg.divergentes).toEqual([{ valor: "1234567", documento: "a.pdf" }]);
});

test("o mesmo valor escrito diferente não conta como divergência", () => {
  const kit = montarKit([
    doc("a.pdf", { estado_civil: "solteiro" }),
    doc("b.pdf", { estado_civil: "SOLTEIRA" }),
  ]);
  const ec = kit.find((c) => c.campo === "estado_civil")!;
  expect(ec.estado).toBe("conferido");
  expect(ec.divergentes).toEqual([]);
});

test("todo mundo recusado: o campo aparece mesmo assim, marcado", () => {
  const kit = montarKit([doc("a.pdf", { cpf: CPF_RUIM })]);
  const cpf = kit.find((c) => c.campo === "cpf")!;
  expect(cpf.valor).toBe(CPF_RUIM);
  expect(cpf.estado).toBe("recusado");
});

/* ── o que a tela diz ─────────────────────────────────────────────────────── */

test("o resumo conta o que existe e não conta o que não existe", () => {
  const kit = montarKit([doc("a.pdf", { cpf: CPF_BOM, rg: "1234567" })]);
  expect(resumoDaLeitura(kit)).toBe("1 conferido, 1 para revisar, 7 em branco");
  expect(resumoDaLeitura(montarKit([]))).toBe("9 em branco");
});

test("sem nome e CPF a peça não sai, o resto pode ir em branco", () => {
  expect(faltaParaOWriter(montarKit([]))).toEqual(["nome", "cpf"]);
  const ctx = { nomeConhecido: "Jefferson Wollace" };
  const completo = montarKit([doc("a.pdf", { nome: "JEFFERSON WOLLACE", cpf: CPF_BOM })], ctx);
  expect(faltaParaOWriter(completo)).toEqual([]);
  // CPF recusado é o mesmo que não ter CPF
  const ruim = montarKit([doc("a.pdf", { nome: "JEFFERSON WOLLACE", cpf: CPF_RUIM })], ctx);
  expect(faltaParaOWriter(ruim)).toEqual(["cpf"]);
});
