import { test, expect } from "bun:test";
import { diagnosticarPlanilha, contaDeServico, linhasLidas } from "./diagnosticoPlanilha";

/* A frase que o Google devolve de verdade quando a planilha não foi
   compartilhada. É a mais comum de todas, e a mais ilegível. */
const SEM_PERMISSAO = "A conta de serviço não consegue abrir a planilha. Compartilhe com "
  + "aw-eco-drive@aw-eco-drive-497216.iam.gserviceaccount.com (leitor). · "
  + "Sheets 403: The caller does not have permission · "
  + "Drive 404: File not found: 1GzHfefANFBjCpXWN1UwgWqI-58QYd48oliuyxn82WjE";

test("planilha não compartilhada vira instrução, e não código de erro", () => {
  const d = diagnosticarPlanilha({ ok: false, error: SEM_PERMISSAO, conta: "aw-eco-drive@aw-eco-drive-497216.iam.gserviceaccount.com" });
  expect(d.tipo).toBe("sem_permissao");
  expect(d.impede).toBe(true);
  expect(d.titulo).toContain("compartilhada");
  // o e-mail é o que a pessoa precisa copiar
  expect(d.copiar).toBe("aw-eco-drive@aw-eco-drive-497216.iam.gserviceaccount.com");
  // os passos são a receita, na ordem de fazer
  expect(d.passos.length).toBeGreaterThanOrEqual(4);
  expect(d.passos.join(" ")).toContain("Compartilhar");
  expect(d.passos.join(" ")).toContain("Leitor");
  // e a frase crua continua disponível
  expect(d.detalhe).toContain("403");
});

test("“não encontrada” oferece as DUAS saídas, porque as duas causas são iguais daqui", () => {
  /* Resposta real da leitura para um id que a conta não enxerga:
     {"ok":false,"conta":"aw-eco-drive@…","error":"Planilha não encontrada.
     Confira o link. (Google: Requested entity was not found.)"}

     O Google responde a mesma coisa para "não existe" e para "existe e você não
     pode ver". Mandar compartilhar seria adivinhar; mandar conferir o link
     sozinho deixaria metade dos casos sem saída. */
  const d = diagnosticarPlanilha({
    ok: false,
    conta: "aw-eco-drive@aw-eco-drive-497216.iam.gserviceaccount.com",
    error: "Planilha não encontrada. Confira o link. (Google: Requested entity was not found.)",
  });
  expect(d.tipo).toBe("nao_encontrada");
  expect(d.impede).toBe(true);
  expect(d.passos.join(" ")).toContain("link");
  expect(d.passos.join(" ")).toContain("Compartilhar");
  expect(d.copiar).toContain("@");
});

test("sem conta de serviço nenhuma, sobra só conferir o link", () => {
  const d = diagnosticarPlanilha({ ok: false, error: "Planilha não encontrada. Confira o link." });
  expect(d.tipo).toBe("nao_encontrada");
  expect(d.copiar).toBeNull();
  expect(d.passos.join(" ")).toContain("link");
});

test("o 403 do Sheets é permissão, e a receita é compartilhar", () => {
  const d = diagnosticarPlanilha({
    ok: false, conta: "x@y.iam.gserviceaccount.com",
    error: "Sheets 403: The caller does not have permission",
  });
  expect(d.tipo).toBe("sem_permissao");
  expect(d.copiar).toBe("x@y.iam.gserviceaccount.com");
});

test("API desligada é problema de projeto, e os passos dizem isso", () => {
  const d = diagnosticarPlanilha({
    ok: false,
    error: "A API do Google Sheets está desligada no projeto da conta de serviço.",
  });
  expect(d.tipo).toBe("api_desligada");
  expect(d.impede).toBe(true);
  expect(d.passos.join(" ")).toContain("Google Cloud");
  expect(d.copiar).toBeNull();
});

test("permissão vence API desligada: se as duas aparecem, compartilhar resolve", () => {
  const d = diagnosticarPlanilha({
    ok: false,
    error: "A API do Google Sheets está desligada. Compartilhe com x@y.iam.gserviceaccount.com (leitor).",
  });
  expect(d.tipo).toBe("sem_permissao");
});

test("planilha vazia não impede ligar: pode não ter chegado o primeiro lead", () => {
  const d = diagnosticarPlanilha({ ok: true, linhas: [], cabecalho: ["Nome"], aba: "Leads" });
  expect(d.tipo).toBe("vazia");
  expect(d.impede).toBe(false);
  expect(d.passos.join(" ")).toContain("Leads");
  expect(d.passos.join(" ")).toContain("ligar assim mesmo");
});

test("planilha lida não vira alarme nenhum", () => {
  const d = diagnosticarPlanilha({ ok: true, linhas: [{}, {}], cabecalho: ["Nome", "Telefone"] });
  expect(d.tipo).toBe("ok");
  expect(d.impede).toBe(false);
  expect(d.passos).toEqual([]);
});

test("o e-mail é pescado da frase quando o campo não veio", () => {
  // versão antiga da função, ou erro cedo demais: o e-mail só existe no texto
  expect(contaDeServico({ error: SEM_PERMISSAO })).toBe("aw-eco-drive@aw-eco-drive-497216.iam.gserviceaccount.com");
  expect(contaDeServico({ conta: "  novo@projeto.iam.gserviceaccount.com " }))
    .toBe("novo@projeto.iam.gserviceaccount.com");
  expect(contaDeServico({ error: "erro qualquer" })).toBeNull();
  // campo presente mas inútil não vira e-mail
  expect(contaDeServico({ conta: "(conta de serviço não lida)" })).toBeNull();
});

test("conta as linhas nos dois formatos de leitura", () => {
  expect(linhasLidas({ linhas: [{}, {}, {}] })).toBe(3);
  // pelo CSV, menos o cabeçalho
  expect(linhasLidas({ csv: "Nome,Telefone\nMaria,92\nJoão,92\n" })).toBe(2);
  expect(linhasLidas({ csv: "Nome,Telefone\n" })).toBe(0);
  expect(linhasLidas({})).toBe(0);
});
