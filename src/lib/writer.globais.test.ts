// Os arquivos do AW Writer são <script> clássicos, não módulos: todos dividem
// o mesmo escopo léxico global. Um `const` no topo de um arquivo com nome já
// usado no topo de outro é SyntaxError — e o SyntaxError não mata só a linha,
// mata o ARQUIVO INTEIRO que carrega depois, com todas as funções dele.
//
// Foi assim que a geração de contratos caiu para o escritório todo: um
// `const MESES_PT` no docx.js colidiu com o do kit.js, o kit.js parou de
// executar, e os cards de modalidade viraram enfeite — o onclick chamava uma
// função que não existia mais. Nada disso aparece num syntax check, porque
// cada arquivo é válido sozinho; só a combinação quebra.
//
// Este teste lê a ORDEM REAL de carga do index.html e falha em qualquer
// redeclaração léxica entre arquivos.

import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";

const RAIZ = new URL("../../public/writer-app/", import.meta.url);

function scriptsNaOrdemDeCarga(): string[] {
  const html = readFileSync(new URL("index.html", RAIZ), "utf8");
  return [...html.matchAll(/<script defer src="(src\/[^"?]+)/g)].map((m) => m[1]);
}

/** Declarações na coluna 0 — as que realmente vão pro escopo global do script. */
function declaracoesGlobais(fonte: string) {
  const out: { nome: string; tipo: string }[] = [];
  for (const linha of fonte.split("\n")) {
    const m = /^(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/.exec(linha);
    if (m) out.push({ tipo: m[1], nome: m[2] });
  }
  return out;
}

const LEXICAS = new Set(["const", "let", "class"]);

test("index.html lista os scripts do Writer", () => {
  const scripts = scriptsNaOrdemDeCarga();
  expect(scripts.length).toBeGreaterThan(5);
  expect(scripts).toContain("src/docx.js");
  expect(scripts).toContain("src/kit.js");
});

test("nenhum const/let/class global é declarado em dois arquivos", () => {
  const porNome = new Map<string, { arquivo: string; tipo: string }[]>();
  for (const arquivo of scriptsNaOrdemDeCarga()) {
    const fonte = readFileSync(new URL(arquivo, RAIZ), "utf8");
    for (const { nome, tipo } of declaracoesGlobais(fonte)) {
      if (!porNome.has(nome)) porNome.set(nome, []);
      porNome.get(nome)!.push({ arquivo, tipo });
    }
  }

  const fatais: string[] = [];
  for (const [nome, ocorrencias] of porNome) {
    if (ocorrencias.length < 2) continue;
    if (!ocorrencias.some((o) => LEXICAS.has(o.tipo))) continue;
    fatais.push(`${nome} → ` + ocorrencias.map((o) => `${o.tipo} em ${o.arquivo}`).join(", "));
  }

  // A mensagem precisa dizer o que fazer: quem cai aqui está com o app quebrado
  // em produção e não vai adivinhar que o culpado é o escopo compartilhado.
  expect(
    fatais,
    fatais.length
      ? `Redeclaração léxica entre scripts do Writer — o arquivo que carrega DEPOIS ` +
        `não vai executar, e todas as funções dele somem:\n  ${fatais.join("\n  ")}\n` +
        `Renomeie, ou mova a constante para dentro da função que a usa.`
      : undefined,
  ).toEqual([]);
});

test("toda função chamada por onclick inline existe em algum script carregado", () => {
  // Os cards de modalidade e de origem usam onclick inline, que só enxerga o
  // escopo global. Se a função sumir — porque foi renomeada, ou porque o
  // arquivo dela morreu numa colisão — o HTML continua renderizando igual e o
  // clique vira no-op. É falha silenciosa: a tela parece viva e não é.
  const scripts = scriptsNaOrdemDeCarga();
  const fontes = scripts.map((f) => readFileSync(new URL(f, RAIZ), "utf8"));
  const tudo = fontes.join("\n");

  const chamadas = new Set<string>();
  for (const fonte of fontes) {
    for (const m of fonte.matchAll(/on(?:click|change|input)="([a-zA-Z_$][\w$]*)\(/g)) {
      chamadas.add(m[1]);
    }
  }
  // âncoras: se estas sumirem, o caminho do contrato quebrou
  expect(chamadas).toContain("selecionarModalidade");
  expect(chamadas).toContain("selecionarOrigemCliente");

  const semDono = [...chamadas].filter(
    (fn) => !new RegExp(`^\\s*(async\\s+)?function\\s+${fn}\\b`, "m").test(tudo),
  );
  expect(
    semDono,
    semDono.length ? `onclick inline sem função definida: ${semDono.join(", ")}` : undefined,
  ).toEqual([]);
});
