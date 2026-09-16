import { test, expect } from "bun:test";
import {
  impedimentos, passoNovo, casoNovo, colunasDosBrutos, resumoDoFluxo, resumoDoPasso,
  fraseDoCaso, rotuloDoCaso, MAX_VALORES_POR_COLUNA, CONDICOES_PADRAO,
  type Passo, type Automacao,
} from "./automacoes";

/* LIGAR UM FLUXO QUEBRADO CUSTA MENSAGEM ENVIADA PARA GENTE DE VERDADE.
 *
 * A "Escolha" trouxe um jeito novo de quebrar em silêncio: um caso que nunca
 * casa não dá erro nenhum, só manda todo mundo para "os demais". Estes testes
 * travam o que a tela consegue perceber antes. */

const base = (passos: Passo[]): Parameters<typeof impedimentos>[0] => ({
  nome: "Recepção",
  gatilho: "lead_novo_na_base",
  gatilho_config: { fonte_ids: ["f1"] },
  condicoes: { ...CONDICOES_PADRAO },
  passos,
});

const msg = (texto = "oi"): Passo => ({ ...passoNovo("mensagem"), texto });

const escolha = (campo: string, casos: { valor: string; passos?: Passo[] }[], senao: Passo[] = []): Passo => ({
  ...passoNovo("escolha"),
  campo,
  casos: casos.map((c) => ({ ...casoNovo(c.valor), passos: c.passos ?? [msg()] })),
  senao,
});

test("escolha sem coluna não liga", () => {
  const e = impedimentos(base([escolha("", [{ valor: "a" }])]));
  expect(e.some((x) => x.includes("qual coluna"))).toBe(true);
});

test("caso com valor vazio não liga: ele casaria com tudo ou com nada", () => {
  const p = escolha("Situação", [{ valor: "" }]);
  expect(impedimentos(base([p])).some((x) => x.includes("valor vazio"))).toBe(true);
});

test("dois casos idênticos acusam, porque o segundo é código morto", () => {
  /* Quem decide é o primeiro que casar. O segundo caso igual nunca roda, e
     quem o escreveu está convencido de que escreveu dois caminhos. */
  const p = escolha("Situação", [{ valor: "processo" }, { valor: "PROCESSO" }]);
  expect(impedimentos(base([p])).some((x) => x.includes("nunca vai ser usado"))).toBe(true);
});

test("escolha sem nada em caso nenhum não liga", () => {
  const p = escolha("Situação", [{ valor: "a", passos: [] }, { valor: "b", passos: [] }]);
  expect(impedimentos(base([p])).some((x) => x.includes("sem nada em caso nenhum"))).toBe(true);
});

test("uma escolha bem montada liga", () => {
  const p = escolha("Situação", [{ valor: "processo" }, { valor: "demitir" }], [msg("genérica")]);
  expect(impedimentos(base([p]))).toEqual([]);
});

test("coluna que não existe em base nenhuma é acusada quando a tela sabe as colunas", () => {
  const p = escolha("Coluna Fantasma", [{ valor: "x" }]);
  expect(impedimentos(base([p]), ["Situação", "Nome"]).some((x) => x.includes("Fantasma"))).toBe(true);
  // sem a lista de colunas a tela não sabe, e não acusa por não saber
  expect(impedimentos(base([p])).some((x) => x.includes("Fantasma"))).toBe(false);
});

test("a validação enxerga a mensagem que está dentro de um caso", () => {
  const p = escolha("Situação", [{ valor: "a", passos: [msg("")] }]);
  const e = impedimentos(base([p]));
  expect(e.some((x) => x.includes("mensagem vazia"))).toBe(true);
});

test("o erro diz QUAL cartão, mesmo no fundo da árvore", () => {
  /* Um erro que não localiza o cartão obriga a pessoa a abrir os dezesseis
     passos um por um até achar. */
  const se: Passo = {
    ...passoNovo("se"),
    entao: [escolha("Situação", [{ valor: "a", passos: [msg("")] }])],
    senao: [msg("ok")],
  };
  const e = impedimentos(base([se]));
  const linha = e.find((x) => x.includes("mensagem vazia")) ?? "";
  expect(linha).toContain("passo 1");
  expect(linha).toContain("sim");
  expect(linha).not.toBe("O passo é uma mensagem vazia.");
});

test("variável inexistente dentro de um caso também é acusada", () => {
  const p = escolha("Situação", [{ valor: "a", passos: [msg("Olá {Faturamento}")] }]);
  expect(impedimentos(base([p]), ["Situação", "nome"]).some((x) => x.includes("Faturamento"))).toBe(true);
});

test("ramo dentro de caso é recusado: a árvore vai até dois níveis", () => {
  const p: Passo = {
    ...passoNovo("escolha"),
    campo: "Situação",
    casos: [{ ...casoNovo("a"), passos: [passoNovo("se")] }],
    senao: [],
  };
  expect(impedimentos(base([p])).some((x) => x.includes("dois níveis"))).toBe(true);
});

test("o resumo conta o PIOR caminho, e não a soma dos casos", () => {
  /* Somar faria uma escolha de três casos parecer três vezes mais agressiva do
     que é, e quem lesse isso não ligaria um fluxo perfeitamente seguro. */
  const p = escolha("Situação", [
    { valor: "a", passos: [msg(), msg()] },
    { valor: "b", passos: [msg()] },
    { valor: "c", passos: [msg()] },
  ], [msg()]);
  expect(resumoDoFluxo([p]).mensagens).toBe(2);
});

test("a duração também é a do pior caminho", () => {
  const espera = (min: number): Passo => ({ ...passoNovo("esperar"), minutos: min });
  const p = escolha("X", [
    { valor: "a", passos: [espera(60)] },
    { valor: "b", passos: [espera(600)] },
  ]);
  expect(resumoDoFluxo([p]).duracaoMin).toBe(600);
});

test("no desenho, o caso mostra só o que o distingue dos irmãos", () => {
  /* A coluna já está no cartão da Escolha. Repetir "quando Situação contém"
     em cada caso fazia os três começarem iguais, e o valor, a única parte que
     muda, era o que o truncate cortava. */
  expect(rotuloDoCaso(casoNovo("processo trabalhista"))).toBe("“processo trabalhista”");
  expect(rotuloDoCaso({ ...casoNovo(""), op: "vazio" })).toBe("está vazia");
  expect(rotuloDoCaso(casoNovo(""))).toBe("(falta o valor)");
});

test("o cartão se lê sem abrir", () => {
  const p = escolha("Situação", [{ valor: "a" }, { valor: "b" }], [msg()]);
  expect(resumoDoPasso(p)).toBe("por Situação · 2 casos + os demais");
  expect(fraseDoCaso("Situação", casoNovo("processo"))).toBe("quando Situação contém “processo”");
});

/* ── as respostas que viram atalho na tela ── */

test("as colunas trazem as respostas distintas, e não só um exemplo", () => {
  const cols = colunasDosBrutos([
    { Nome: "Ana", "Situação": "Quero me proteger", Whatsapp: "999" },
    { Nome: "Bia", "Situação": "Estou respondendo a um processo" },
    { Nome: "Cid", "Situação": "Quero me proteger" },
  ]);
  const sit = cols.find((c) => c.coluna === "Situação")!;
  expect(sit.valores).toEqual(["Quero me proteger", "Estou respondendo a um processo"]);
  expect(sit.exemplo).toBe("Quero me proteger");
  // o telefone continua fora: ninguém escreve o número da pessoa numa mensagem
  expect(cols.map((c) => c.coluna)).not.toContain("Whatsapp");
});

test("texto livre não vira botão, senão seria um botão por lead", () => {
  const longo = "x".repeat(200);
  const cols = colunasDosBrutos([{ Conte: longo }, { Conte: "curto" }]);
  const c = cols.find((x) => x.coluna === "Conte")!;
  expect(c.valores).toEqual(["curto"]);
  // mas o exemplo continua sendo o que chegou primeiro: ele só ilustra
  expect(c.exemplo).toBe(longo);
});

test("a lista de respostas tem teto", () => {
  const brutos = Array.from({ length: 40 }, (_, i) => ({ Col: `v${i}` }));
  expect(colunasDosBrutos(brutos)[0].valores.length).toBe(MAX_VALORES_POR_COLUNA);
});

test("coluna sem nenhuma resposta preenchida não inventa valores", () => {
  const cols = colunasDosBrutos([{ Vazia: "" }, { Vazia: null }]);
  expect(cols.find((c) => c.coluna === "Vazia")?.valores).toEqual([]);
});
