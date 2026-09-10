import { test, expect } from "bun:test";
import {
  cpfValido, formatarCpf, formatarCep, acharCpf, acharCep, acharNome, acharRg,
  acharOrgaoExpedidor, acharNascimento, acharEndereco, camposDoTexto, juntarAchados,
  type Achado, type CampoDoLead,
} from "./dadosDoDocumento";

/* Um comprovante de residência com camada de texto: é o caso fácil, e é o mais
   comum, porque conta de luz e de água saem em PDF de verdade. */
const COMPROVANTE = `
AMAZONAS ENERGIA S/A
CONTA DE ENERGIA ELETRICA
CLIENTE: ELIZABETH BEZERRA LIMA
CPF/CNPJ: 123.456.789-09
ENDERECO: RUA SAO JOAO, 123 - COROADO
CEP: 69083-000 MANAUS/AM
VENCIMENTO 10/03/2026
TOTAL A PAGAR R$ 187,45
`;

/* Um RG fotografado e passado por OCR: linhas soltas, sem acento, com o nome
   da mãe logo abaixo do nome. */
const RG_OCR = `
REPUBLICA FEDERATIVA DO BRASIL
REGISTRO GERAL 1234567 SSP/AM
NOME
MARIA DAS GRACAS BENTES
FILIACAO
JOSE BENTES SOBRINHO
ANA MARIA BENTES
DATA DE NASCIMENTO 12/03/1958
CPF 111.444.777-35
`;

const valorDe = (achados: Achado[], campo: CampoDoLead) => achados.find((a) => a.campo === campo)?.valor;

test("CPF só passa quando os dígitos verificadores fecham", () => {
  expect(cpfValido("111.444.777-35")).toBe(true);
  expect(cpfValido("12345678909")).toBe(true);
  // um dígito trocado (o que o OCR faz) não fecha a conta
  expect(cpfValido("111.444.777-36")).toBe(false);
  expect(cpfValido("123.456.789-00")).toBe(false);
  // sequência repetida fecha a conta e não existe
  expect(cpfValido("111.111.111-11")).toBe(false);
  expect(cpfValido("000.000.000-00")).toBe(false);
  expect(cpfValido("123")).toBe(false);
  expect(cpfValido("")).toBe(false);
});

test("formata como se escreve", () => {
  expect(formatarCpf("11144477735")).toBe("111.444.777-35");
  expect(formatarCep("69083000")).toBe("69083-000");
  expect(formatarCep("690")).toBe("690");
});

test("CPF com rótulo vale mais que CPF solto, e CPF inválido não entra", () => {
  const comRotulo = acharCpf("CPF 111.444.777-35");
  expect(comRotulo[0].valor).toBe("111.444.777-35");
  expect(comRotulo[0].confianca).toBeGreaterThan(0.9);

  const solto = acharCpf("documento 111.444.777-35 emitido");
  expect(solto[0].confianca).toBeLessThan(0.9);
  expect(solto[0].confianca).toBeGreaterThan(0.5);

  expect(acharCpf("CPF 111.444.777-36")).toEqual([]);
  expect(acharCpf("protocolo 000.000.000-00")).toEqual([]);
});

test("o trecho que sustenta o achado vem junto, pra conferir sem abrir o documento", () => {
  const [a] = acharCpf("CADASTRO DE PESSOA FISICA CPF 111.444.777-35 EMITIDO EM MANAUS");
  expect(a.trecho).toContain("111.444.777-35");
});

test("CEP precisa de separador ou de rótulo; oito dígitos soltos não bastam", () => {
  expect(acharCep("CEP: 69083-000")[0].valor).toBe("69083-000");
  expect(acharCep("CEP 69083000")[0].valor).toBe("69083-000");
  // número solto de oito dígitos pode ser qualquer coisa
  expect(acharCep("protocolo 69083000 registrado")).toEqual([]);
  // e o que parece CEP dentro de um CPF não é CEP
  expect(acharCep("CPF 111.444.777-35").length).toBe(0);
});

test("no comprovante, cada campo sai do seu rótulo", () => {
  const campos = camposDoTexto(COMPROVANTE);
  expect(valorDe(campos, "nome")).toBe("ELIZABETH BEZERRA LIMA");
  expect(valorDe(campos, "cpf")).toBe("123.456.789-09");
  expect(valorDe(campos, "cep")).toBe("69083-000");
  expect(valorDe(campos, "endereco")).toBe("RUA SAO JOAO, 123 - COROADO");
  // a data de vencimento da conta não é data de nascimento
  expect(valorDe(campos, "nascimento")).toBeUndefined();
});

test("no RG, o nome da mãe não vira o nome do cliente", () => {
  const campos = camposDoTexto(RG_OCR);
  expect(valorDe(campos, "nome")).toBe("MARIA DAS GRACAS BENTES");
  expect(valorDe(campos, "rg")).toBe("1234567");
  expect(valorDe(campos, "cpf")).toBe("111.444.777-35");
  expect(valorDe(campos, "orgao_expedidor")).toBe("SSP/AM");
  expect(valorDe(campos, "nascimento")).toBe("12/03/1958");
});

test("filiação sozinha não produz nome nenhum", () => {
  expect(acharNome("FILIACAO\nJOSE BENTES SOBRINHO\nANA MARIA BENTES")).toEqual([]);
  expect(acharNome("NOME DA MAE: ANA MARIA BENTES")).toEqual([]);
});

test("nome de uma palavra só é rótulo cortado, não gente", () => {
  expect(acharNome("NOME: MARIA")).toEqual([]);
  expect(acharNome("NOME: MARIA SILVA")[0].valor).toBe("MARIA SILVA");
});

test("o nome preserva acento, mesmo com o rótulo sem acento no documento", () => {
  expect(acharNome("Nome: José Antônio da Conceição")[0].valor).toBe("José Antônio da Conceição");
});

test("RG não é CPF, e RG sem rótulo não entra", () => {
  expect(acharRg("RG 111.444.777-35")).toEqual([]);
  expect(acharRg("1234567 SSP/AM")).toEqual([]);
  expect(acharRg("IDENTIDADE: 12.345.678-9")[0].valor).toBe("12.345.678-9");
});

test("data de nascimento só com rótulo por perto", () => {
  expect(acharNascimento("DATA DE NASCIMENTO 12/03/1958")[0].valor).toBe("12/03/1958");
  expect(acharNascimento("NASC 12/03/1958")[0].valor).toBe("12/03/1958");
  expect(acharNascimento("EMISSAO 12/03/2020")).toEqual([]);
  expect(acharNascimento("VENCIMENTO 10/03/2026")).toEqual([]);
  // data impossível não passa
  expect(acharNascimento("NASCIMENTO 45/13/1958")).toEqual([]);
});

test("o órgão sai como SSP/AM mesmo escrito de outro jeito", () => {
  expect(acharOrgaoExpedidor("ORGAO EXPEDIDOR SSP AM")[0].valor).toBe("SSP/AM");
  expect(acharOrgaoExpedidor("RG 123 SSP-AM")[0].valor).toBe("SSP/AM");
  expect(acharOrgaoExpedidor("DETRAN/AM")[0].valor).toBe("DETRAN/AM");
});

test("endereço vem inteiro, por rótulo ou por logradouro", () => {
  expect(acharEndereco("ENDERECO: RUA SAO JOAO, 123 - COROADO")[0].valor).toBe("RUA SAO JOAO, 123 - COROADO");
  expect(acharEndereco("AV DJALMA BATISTA, 500 APT 302")[0].valor).toBe("AV DJALMA BATISTA, 500 APT 302");
  expect(acharEndereco("TOTAL A PAGAR R$ 187,45")).toEqual([]);
});

test("dois documentos que concordam valem mais que um", () => {
  const doRg = camposDoTexto(RG_OCR, "rg.jpg");
  const outro = camposDoTexto("CPF 111.444.777-35", "cpf.pdf");
  const { campos } = juntarAchados([doRg, outro]);
  const cpf = campos.find((c) => c.campo === "cpf")!;
  expect(cpf.valor).toBe("111.444.777-35");
  expect(cpf.confianca).toBeGreaterThan(doRg.find((a) => a.campo === "cpf")!.confianca);
  expect(cpf.confianca).toBeLessThanOrEqual(0.98);
});

test("quando os documentos discordam, o mais confiável vence e o outro não some", () => {
  const a = camposDoTexto("CPF 111.444.777-35", "rg.jpg");
  const b = camposDoTexto("documento 123.456.789-09 anexo", "conta.pdf");
  const { campos, divergencias } = juntarAchados([a, b]);
  expect(campos.find((c) => c.campo === "cpf")!.valor).toBe("111.444.777-35");
  expect(divergencias.map((d) => d.valor)).toContain("123.456.789-09");
  expect(divergencias[0].documento).toBe("conta.pdf");
});

test("de qual documento veio cada achado", () => {
  const campos = camposDoTexto(COMPROVANTE, "conta-de-luz.pdf");
  expect(campos.every((c) => c.documento === "conta-de-luz.pdf")).toBe(true);
});

test("texto vazio não inventa campo nenhum", () => {
  expect(camposDoTexto("")).toEqual([]);
  expect(camposDoTexto("   \n  \n ")).toEqual([]);
});
