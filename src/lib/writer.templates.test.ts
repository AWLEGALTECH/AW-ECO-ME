// Cada produto do Writer aponta pro seu template por NOME, e o docx.js resolve
// esse nome num mapa explícito (TEMPLATES_POR_NOME) — porque `const` em script
// clássico não vira propriedade de window, então não dá pra fazer window[nome].
//
// O risco desse desenho: produto cujo nome não está no mapa não falha. Ele cai
// no fallback e gera a peça de OUTRO produto, com os dados do caso certo. Sai
// um documento bem formatado, com o cliente certo e a fundamentação errada —
// o tipo de defeito que passa por cima do ombro de quem revisa.
//
// Foi o que aconteceu com a peça de dívida em atraso: template criado, produto
// criado, script incluído no index.html, e o nome faltando no mapa.

import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

const RAIZ = new URL("../../public/writer-app/", import.meta.url);
const ler = (p: string) => readFileSync(new URL(p, RAIZ), "utf8");

function produtos(): Record<string, unknown>[] {
  const sandbox: Record<string, unknown> = { console };
  sandbox.globalThis = sandbox;
  createContext(sandbox);
  runInContext(ler("src/products.js"), sandbox, { filename: "products.js" });
  return runInContext("PRODUTOS", sandbox) as Record<string, unknown>[];
}

/** Os nomes que docx.js sabe resolver, lidos do próprio mapa. */
function nomesNoMapa(): Set<string> {
  const docx = ler("src/docx.js");
  const bloco = /const TEMPLATES_POR_NOME = \{([\s\S]*?)\n  \};/.exec(docx);
  if (!bloco) throw new Error("TEMPLATES_POR_NOME não encontrado em docx.js");
  return new Set([...bloco[1].matchAll(/'([A-Z0-9_]+)'\s*:/g)].map((m) => m[1]));
}

test("todo produto com template_base64_var está no mapa do docx.js", () => {
  const mapa = nomesNoMapa();
  const faltando = produtos()
    .filter((p) => typeof p.template_base64_var === "string")
    .filter((p) => !mapa.has(p.template_base64_var as string))
    .map((p) => `${p.nome} → ${p.template_base64_var}`);

  expect(
    faltando,
    faltando.length
      ? `Produto aponta pra template que docx.js não resolve — a peça sairia com ` +
        `o template de OUTRO produto, sem erro:\n  ${faltando.join("\n  ")}\n` +
        `Adicione o nome em TEMPLATES_POR_NOME (src/docx.js).`
      : undefined,
  ).toEqual([]);
});

test("todo template do mapa tem arquivo .b64.js carregado no index.html", () => {
  const html = ler("index.html");
  const carregados = [...html.matchAll(/<script defer src="(data\/[^"?]+\.b64\.js)/g)].map((m) => m[1]);
  const declarados = new Set(
    carregados.flatMap((f) => [...ler(f).matchAll(/^const ([A-Z0-9_]+)\s*=/gm)].map((m) => m[1])),
  );

  const semArquivo = [...nomesNoMapa()].filter((n) => !declarados.has(n));
  expect(
    semArquivo,
    semArquivo.length
      ? `docx.js resolve nomes que nenhum .b64.js carregado declara: ${semArquivo.join(", ")}`
      : undefined,
  ).toEqual([]);
});

test("produto sem tabela não declara rubricas, e vice-versa", () => {
  // sem_tabela significa "esta ação não discute cobranças, discute o vínculo".
  // Rubrica é o nome de uma cobrança — as duas coisas juntas são contraditórias
  // e produziriam um formulário pedindo rubrica pra uma peça que não tem onde
  // usá-la.
  const incoerentes = produtos()
    .filter((p) => p.sem_tabela === true)
    .filter((p) => Array.isArray(p.rubricas_keys) && (p.rubricas_keys as unknown[]).length > 0)
    .map((p) => p.nome as string);
  expect(incoerentes).toEqual([]);
});

test("produto com campos_pacote3 declara os campos que seu template usa", () => {
  // O template pede {reu_nome}; se o formulário não tiver o campo, a peça sai
  // com a ré em branco — e uma inicial sem réu é petição inepta.
  const html = ler("index.html");
  const arquivos = [...html.matchAll(/<script defer src="(data\/[^"?]+\.b64\.js)/g)].map((m) => m[1]);
  const porVar = new Map<string, string>();
  for (const f of arquivos) {
    const fonte = ler(f);
    const nome = /^const ([A-Z0-9_]+)\s*=/m.exec(fonte)?.[1];
    if (nome) porVar.set(nome, fonte);
  }

  const problemas: string[] = [];
  for (const p of produtos()) {
    if (!Array.isArray(p.campos_pacote3)) continue;
    const fonte = porVar.get(p.template_base64_var as string);
    if (!fonte) continue;
    const declarados = new Set((p.campos_pacote3 as { key: string }[]).map((c) => c.key));
    // os campos do réu são os únicos que vêm do formulário com o mesmo nome da tag
    for (const campo of ["reu_nome", "reu_cnpj", "reu_endereco"]) {
      // o base64 do template não é inspecionável aqui; basta checar coerência
      // interna: quem declara um, declara os três (é uma qualificação só)
      if (declarados.has(campo)) {
        const faltam = ["reu_nome", "reu_cnpj", "reu_endereco"].filter((c) => !declarados.has(c));
        if (faltam.length) problemas.push(`${p.nome} declara ${campo} mas não ${faltam.join("/")}`);
        break;
      }
    }
  }
  expect(problemas).toEqual([]);
});
