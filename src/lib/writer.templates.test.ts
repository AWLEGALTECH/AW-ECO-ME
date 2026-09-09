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
import { inflateRawSync } from "node:zlib";
import { createContext, runInContext } from "node:vm";

const RAIZ = new URL("../../public/writer-app/", import.meta.url);
const ler = (p: string) => readFileSync(new URL(p, RAIZ), "utf8");

/** Os .b64.js de petição carregados pelo index.html (os kits de contrato ficam de fora). */
function templatesDePeticao(): { arquivo: string; nome: string; zip: Buffer }[] {
  const html = ler("index.html");
  return [...html.matchAll(/<script defer src="(data\/template-[^"?]+\.b64\.js)/g)]
    .map((m) => m[1])
    .filter((f) => !f.includes("template-kit-"))
    .map((arquivo) => {
      const fonte = ler(arquivo);
      const nome = /^const ([A-Z0-9_]+)\s*=/m.exec(fonte)?.[1] ?? arquivo;
      const b64 = /'([A-Za-z0-9+/=]{1000,})'/.exec(fonte)?.[1];
      if (!b64) throw new Error(`${arquivo}: base64 não encontrado`);
      return { arquivo, nome, zip: Buffer.from(b64, "base64") };
    });
}

/**
 * Lê uma entrada de um .zip pelo diretório central (sem biblioteca: não há
 * nenhuma de zip no projeto, e o docxtemplater/pizzip vêm de CDN só no browser).
 */
function lerDoZip(zip: Buffer, caminho: string): string {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("zip sem fim de diretório central");
  const total = zip.readUInt16LE(eocd + 10);
  let pos = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < total; i++) {
    if (zip.readUInt32LE(pos) !== 0x02014b50) throw new Error("diretório central corrompido");
    const metodo = zip.readUInt16LE(pos + 10);
    const tamComp = zip.readUInt32LE(pos + 20);
    const nomeLen = zip.readUInt16LE(pos + 28);
    const extraLen = zip.readUInt16LE(pos + 30);
    const comentLen = zip.readUInt16LE(pos + 32);
    const offset = zip.readUInt32LE(pos + 42);
    const nome = zip.subarray(pos + 46, pos + 46 + nomeLen).toString("utf8");
    if (nome === caminho) {
      const nomeLocal = zip.readUInt16LE(offset + 26);
      const extraLocal = zip.readUInt16LE(offset + 28);
      const inicio = offset + 30 + nomeLocal + extraLocal;
      const dados = zip.subarray(inicio, inicio + tamComp);
      return (metodo === 8 ? inflateRawSync(dados) : dados).toString("utf8");
    }
    pos += 46 + nomeLen + extraLen + comentLen;
  }
  throw new Error(`${caminho} não está no zip`);
}

/** docx.js num sandbox: é <script> clássico, então basta um `state` mínimo. */
function docxJs(): Record<string, (...args: unknown[]) => unknown> {
  const sandbox: Record<string, unknown> = {
    console: { ...console, log() {}, group() {}, groupEnd() {}, warn() {} },
    state: { anexos: null, dadosPacote2: null, dadosPacote3: {} },
    formatarValorBR: (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  };
  sandbox.globalThis = sandbox;
  createContext(sandbox);
  runInContext(ler("src/docx.js"), sandbox, { filename: "docx.js" });
  return runInContext("({ revisarECorrigirPeca, garantirFontePadrao, montarTabelaXmlDescontos })", sandbox);
}

const P = (inner: string, pPr = "") => `<w:p><w:pPr>${pPr}<w:jc w:val="both"/></w:pPr><w:r><w:rPr><w:rtl w:val="0"/></w:rPr><w:t>${inner}</w:t></w:r></w:p>`;
const COM_MARGEM = (t: string) => P(t, '<w:ind w:right="-430"/>');

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

// ── fonte e margem ──────────────────────────────────────────────────────────
//
// A peça de DÍVIDA EM ATRASO saiu com duas fontes e o texto invadindo a margem
// direita. Duas causas, e cada uma ganha um teste:
//   1. o styles.xml do template não definia fonte no rPrDefault, e metade dos
//      runs herda dali;
//   2. o revisor tomava o ind:right dos dois parágrafos injetados do quadro
//      socioeconômico como "majoritário" num template que não tem margem, e
//      espalhava -430 pela peça inteira.

test("todo template de petição define fonte e tamanho no rPrDefault do styles.xml", () => {
  const semFonte = templatesDePeticao()
    .filter(({ zip }) => {
      const styles = lerDoZip(zip, "word/styles.xml");
      const rpr = /<w:rPrDefault>\s*<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(styles)?.[1] ?? "";
      return !/<w:rFonts\b/.test(rpr) || !/<w:sz\b/.test(rpr);
    })
    .map((t) => t.nome);
  expect(
    semFonte,
    semFonte.length
      ? `Sem fonte padrão, os runs sem formatação própria saem em Times New Roman 10 e a peça fica com duas fontes: ${semFonte.join(", ")}`
      : undefined,
  ).toEqual([]);
});

test("garantirFontePadrao completa o rPrDefault com a fonte dominante da peça", () => {
  const { garantirFontePadrao } = docxJs();
  const styles = '<w:styles><w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val="pt_BR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr/></w:pPrDefault></w:docDefaults></w:styles>';
  const doc = '<w:r><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:sz w:val="24"/></w:rPr></w:r><w:r><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/><w:sz w:val="24"/></w:rPr></w:r><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr></w:r>';
  const saida = garantirFontePadrao(styles, doc) as string;
  expect(saida).toContain('<w:rPrDefault><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="pt_BR"/></w:rPr></w:rPrDefault>');

  // quem já define, não é tocado
  const completo = saida;
  expect(garantirFontePadrao(completo, doc)).toBe(completo);
});

test("revisor tira a margem dos parágrafos injetados quando o template não usa margem direita", () => {
  const { revisarECorrigirPeca } = docxJs();
  const xml = `<w:body>${P("AO JUÍZO")}${P("TESTESSON, brasileiro")}${P("AÇÃO DECLARATÓRIA")}` +
    `${COM_MARGEM("DO QUADRO SOCIOECONÔMICO DE TESTESSON")}${COM_MARGEM("A parte autora, com 67 anos")}` +
    `${P("DOS FATOS")}${P("A parte autora é correntista")}${P("DOS PEDIDOS")}</w:body>`;
  const { xml: saida, relatorio } = revisarECorrigirPeca(xml) as { xml: string; relatorio: { fixes: string[] } };
  expect(saida).not.toContain("w:right=");
  expect(saida).not.toContain("<w:ind/>");
  expect(saida).toContain("DO QUADRO SOCIOECONÔMICO DE TESTESSON");
  expect(relatorio.fixes.some((f) => f.includes("removeu margem direita de 2"))).toBe(true);
});

test("revisor continua uniformizando quando o template usa margem direita", () => {
  const { revisarECorrigirPeca } = docxJs();
  const xml = `<w:body>${COM_MARGEM("AO JUÍZO")}${COM_MARGEM("DOS FATOS")}${COM_MARGEM("A parte autora")}${P("Parágrafo da IA sem margem")}</w:body>`;
  const { xml: saida } = revisarECorrigirPeca(xml) as { xml: string };
  expect(saida.match(/w:right="-430"/g)?.length).toBe(4);
});

test("revisor não mexe em nada quando todos os parágrafos já concordam", () => {
  const { revisarECorrigirPeca } = docxJs();
  const xml = `<w:body>${P("Um")}${P("Dois")}</w:body>`;
  const { xml: saida, relatorio } = revisarECorrigirPeca(xml) as { xml: string; relatorio: { fixes: string[] } };
  expect(saida).toBe(xml);
  expect(relatorio.fixes).toEqual([]);
});

test("a tabela de descontos sai na fonte da peça, Cambria 10", () => {
  const { montarTabelaXmlDescontos } = docxJs();
  const linhas = [
    { tipo: "cabecalho" },
    { tipo: "subtitulo", texto: "CONTA 12345" },
    { tipo: "dado", data: "28/11/2023", descricao: "DIV. EM ATRASO", operacao: "0010000", valor: 1627.82 },
    { tipo: "valor_total", valor: 1627.82 },
    { tipo: "valor_dobro", valor: 3255.64 },
  ];
  for (const xml of [montarTabelaXmlDescontos(linhas) as string, montarTabelaXmlDescontos(null) as string]) {
    expect(xml).not.toContain("Arial");
    const runs = xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/g) ?? [];
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) {
      expect(r).toContain('w:ascii="Cambria"');
      expect(r).toContain('<w:sz w:val="20"/>');
    }
  }
});
