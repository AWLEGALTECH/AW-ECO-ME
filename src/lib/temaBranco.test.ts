/* O TEMA BRANCO QUEBRA EM SILÊNCIO.
 *
 * Um tema escuro escrito à mão não avisa quando alguém escreve mais uma cor
 * escura à mão: no escuro ela fica perfeita, e no branco vira uma placa preta
 * no meio do papel. E a paleta mora em quatro lugares (a lista do código, o
 * CHECK do banco, a pré-pintura do index.html e os dois iframes), que já
 * desencontraram uma vez: o vermelho ficou meses fora da pré-pintura.
 *
 * Estes testes leem o código-fonte e travam as duas coisas. */
import { test, expect } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PALETAS, paletaClara } from "./preferencias";

const RAIZ = join(import.meta.dir, "..", "..");
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8");

function arquivos(dir: string, fora: string[] = []): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(join(RAIZ, dir))) {
    const rel = join(dir, nome);
    if (statSync(join(RAIZ, rel)).isDirectory()) saida.push(...arquivos(rel, fora));
    else if (/\.(tsx|ts)$/.test(nome) && !fora.some((f) => rel.includes(f))) saida.push(rel);
  }
  return saida;
}

const PINTADAS = PALETAS.filter((p) => p !== "default");

test("a pré-pintura do index.html conhece todas as paletas", () => {
  const html = ler("index.html");
  const lista = html.match(/var validas = \[([^\]]+)\]/)?.[1] ?? "";
  const nomes = [...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  expect(nomes).toEqual([...PINTADAS].sort());
});

test("o Writer e o Finder aceitam todas as paletas", () => {
  for (const arq of ["public/writer-app/index.html", "public/finder-app/index.html"]) {
    const html = ler(arq);
    for (const p of PINTADAS) expect(html.includes(`p === '${p}'`)).toBe(true);
  }
});

test("o CHECK do banco, na migração mais nova que o redefine, aceita todas as paletas", () => {
  const dir = "supabase/migrations";
  const ultima = readdirSync(join(RAIZ, dir))
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .filter((n) => ler(join(dir, n)).includes("preferencias_usuario_paleta_check"))
    .pop();
  expect(ultima).toBeTruthy();
  const sql = ler(join(dir, ultima!));
  for (const p of PALETAS) expect(sql.includes(`'${p}'`)).toBe(true);
});

test("sei e branco são as paletas claras; as outras continuam escuras", () => {
  expect(PALETAS.filter(paletaClara)).toEqual(["sei", "branco"]);
});

test("toda cor escura escrita à mão numa classe tem tradução no tema branco", () => {
  const css = ler("src/index.css");
  /* só cores escuras: # seguido de um primeiro dígito 0, 1 ou 2 é carvão */
  const CLASSE = /\b(bg|ring|outline|border|from|via|to|divide)-\[#([0-2][0-9a-fA-F]{2}(?:[0-9a-fA-F]{3})?)\](\/\d+)?/g;
  const sem: string[] = [];
  for (const arq of arquivos("src", ["integrations/supabase"])) {
    for (const m of ler(arq).matchAll(CLASSE)) {
      const [, util, hex, alfa = ""] = m;
      const seletor = `.${util}-\\[\\#${hex}\\]${alfa ? alfa.replace("/", "\\/") : ""}`;
      if (!css.includes(`[data-theme="branco"] ${seletor}`)) sem.push(`${arq}: ${m[0]}`);
    }
  }
  expect(sem).toEqual([]);
});

test("branco e preto do Tailwind vêm de variável, e o tema branco as redefine", () => {
  const cfg = ler("tailwind.config.ts");
  expect(cfg).toContain("rgb(var(--aw-branco)");
  expect(cfg).toContain("rgb(var(--aw-preto)");
  const css = ler("src/index.css");
  const bloco = css.slice(css.indexOf('[data-theme="branco"] {'));
  expect(bloco).toContain("--aw-branco: 0 0 0;");
});
