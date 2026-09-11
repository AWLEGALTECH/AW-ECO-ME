import { test, expect } from "bun:test";
import {
  idadeEm, enderecoCompleto, civilDoWriter, qualificacaoParaOWriter, paramDaQualificacao,
} from "./kitParaOWriter";
import type { CampoLido, CampoDoKit } from "./leituraDeDocumentos";

const campo = (
  campo: CampoDoKit, valor: string, estado: CampoLido["estado"] = "conferido",
): CampoLido => ({ campo, valor, documento: "rg.pdf", estado, porque: "", divergentes: [] });

test("a idade sai da data, e data inválida não vira idade nenhuma", () => {
  const hoje = new Date(2026, 8, 11); // 11/09/2026
  expect(idadeEm("12/03/1985", hoje)).toBe(41);
  // aniversário ainda não chegou este ano
  expect(idadeEm("12/12/1985", hoje)).toBe(40);
  // no próprio dia, já conta
  expect(idadeEm("11/09/1985", hoje)).toBe(41);
  expect(idadeEm("31/02/1985", hoje)).toBeNull();
  expect(idadeEm("1985-03-12", hoje)).toBeNull(); // aqui já se espera dd/mm/aaaa
  expect(idadeEm("", hoje)).toBeNull();
});

test("o CEP entra na linha com o rótulo, que é como o Writer o acha depois", () => {
  expect(enderecoCompleto("Rua das Flores, 100, Centro", "69083-000"))
    .toBe("Rua das Flores, 100, Centro, CEP 69083-000");
  expect(enderecoCompleto("Rua das Flores, 100", "")).toBe("Rua das Flores, 100");
  expect(enderecoCompleto("", "69083-000")).toBe("CEP 69083-000");
  expect(enderecoCompleto("", "")).toBe("");
  // vírgula sobrando no fim do endereço não vira vírgula dupla
  expect(enderecoCompleto("Rua das Flores, 100, ", "69083-000"))
    .toBe("Rua das Flores, 100, CEP 69083-000");
});

test("CEP que já está dentro do endereço não entra duas vezes", () => {
  expect(enderecoCompleto("Rua das Flores, 100, CEP 69083-000", "69083-000"))
    .toBe("Rua das Flores, 100, CEP 69083-000");
  // mesmo escrito sem hífen de um lado e com do outro
  expect(enderecoCompleto("Rua das Flores, 100 - 69083000", "69083-000"))
    .toBe("Rua das Flores, 100 - 69083000");
});

test("o estado civil vira uma das opções do select, ou nada", () => {
  expect(civilDoWriter("Solteiro(a)")).toBe("solteiro");
  expect(civilDoWriter("União estável")).toBe("união estável");
  expect(civilDoWriter("Viúvo(a)")).toBe("viúvo");
  // "Separado(a)" não existe no select do Writer: vazio é melhor que errado
  expect(civilDoWriter("Separado(a)")).toBe("");
  expect(civilDoWriter("amigado")).toBe("");
  expect(civilDoWriter("")).toBe("");
});

test("a qualificação atravessa com os nomes que o Writer usa", () => {
  const q = qualificacaoParaOWriter([
    campo("nome", "Jefferson Wollace de Souza"),
    campo("cpf", "529.982.247-25"),
    campo("rg", "1234567", "revisar"),
    campo("orgao_expedidor", "SSP/AM", "revisar"),
    campo("profissao", "Aposentado", "revisar"),
    campo("estado_civil", "Casado(a)"),
    campo("endereco", "Rua das Flores, 100, Centro", "revisar"),
    campo("cep", "69083-000"),
    campo("nascimento", "12/03/1985"),
  ]);
  expect(q.pacote1.nome_completo).toBe("Jefferson Wollace de Souza");
  expect(q.pacote1.cpf).toBe("529.982.247-25");
  expect(q.pacote1.estado_civil).toBe("casado");
  expect(q.pacote1.endereco_completo).toBe("Rua das Flores, 100, Centro, CEP 69083-000");
  expect(q.pacote1.nacionalidade).toBe("brasileiro");
  // nascimento não existe na Etapa 01: vira idade, na Etapa 02
  expect(q.pacote2.idade).toBeTruthy();
  expect(q.pacote1).not.toHaveProperty("nascimento");
});

test("o que a máquina RECUSOU não atravessa", () => {
  const q = qualificacaoParaOWriter([
    campo("nome", "Jefferson Wollace"),
    campo("cpf", "529.982.247-26", "recusado"),
    campo("nascimento", "31/02/1985", "recusado"),
  ]);
  expect(q.pacote1.nome_completo).toBe("Jefferson Wollace");
  // em branco a pessoa percebe e digita; errado ela confia e assina
  expect(q.pacote1.cpf).toBeUndefined();
  expect(q.pacote2.idade).toBeUndefined();
});

test("campo vazio não vira chave vazia no formulário", () => {
  const q = qualificacaoParaOWriter([campo("nome", ""), campo("cpf", "")]);
  expect(Object.keys(q.pacote1)).toEqual([]);
  expect(Object.keys(q.pacote2)).toEqual([]);
});

test("o embrulho sobrevive a acento, e nada a levar não vira parâmetro", () => {
  const q = qualificacaoParaOWriter([campo("nome", "José Almyr da Conceição")]);
  const b64 = paramDaQualificacao(q);
  expect(b64).toBeTruthy();
  // o mesmo par que o Writer usa do outro lado
  const devolta = JSON.parse(decodeURIComponent(escape(atob(b64))));
  expect(devolta.pacote1.nome_completo).toBe("José Almyr da Conceição");

  expect(paramDaQualificacao({ pacote1: {}, pacote2: {} })).toBe("");
});

/* O Writer desmonta a linha de endereço com estas duas expressões (kit.js,
   `_parseEnderecoKit`) e, com oito dígitos de CEP, busca no ViaCEP e preenche
   logradouro, bairro, município e UF sozinho. Ou seja: a linha que sai daqui
   precisa sobreviver àquele parser, senão o auto-preenchimento não acontece e
   a pessoa digita o endereço inteiro à mão do outro lado. */
const cepDoWriter = (s: string) => s.match(/(\d{5}-?\d{3})/)?.[1] ?? null;
const numeroDoWriter = (s: string) => s.match(/n[ºo°.]?\s*(\d+)/i)?.[1] ?? null;

test("a linha de endereço sobrevive ao parser do Writer: CEP e número saem inteiros", () => {
  const q = qualificacaoParaOWriter([
    campo("endereco", "Rua das Flores, nº 422, Apto 2, Centro", "revisar"),
    campo("cep", "69093-020"),
  ]);
  const linha = q.pacote1.endereco_completo!;
  expect(cepDoWriter(linha)).toBe("69093-020");
  expect(numeroDoWriter(linha)).toBe("422");
});

test("sem número impresso, o CEP ainda atravessa sozinho", () => {
  // o CEP revela rua, bairro, município e UF; só o número ele não sabe
  const q = qualificacaoParaOWriter([
    campo("endereco", "Rua Canário, Cj. Hileia I, Redenção", "revisar"),
    campo("cep", "69093-020"),
  ]);
  expect(cepDoWriter(q.pacote1.endereco_completo!)).toBe("69093-020");
});

test("só o CEP, sem endereço nenhum, já vale a viagem", () => {
  const q = qualificacaoParaOWriter([campo("cep", "69093-020")]);
  expect(cepDoWriter(q.pacote1.endereco_completo!)).toBe("69093-020");
});
