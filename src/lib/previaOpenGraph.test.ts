import { test, expect } from "bun:test";
import {
  extrairPrevia, metaDoHtml, ehPlaceholder, semEntidades, semScriptNemComentario,
} from "./previaOpenGraph";

const pagina = (head: string) => `<!doctype html><html><head>${head}</head><body>oi</body></html>`;

test("lê as etiquetas nas duas ordens de atributo", () => {
  // os dois jeitos existem no mundo real; uma regex só perde metade dos sites
  expect(metaDoHtml(pagina('<meta property="og:title" content="Um título">'), "og:title")).toBe("Um título");
  expect(metaDoHtml(pagina('<meta content="Outro" property="og:title">'), "og:title")).toBe("Outro");
  expect(metaDoHtml(pagina("<meta name='og:title' content='Com aspas simples'>"), "og:title")).toBe("Com aspas simples");
  expect(metaDoHtml(pagina('<meta property="og:title" content="x">'), "og:description")).toBeNull();
});

test("o cartão sai completo quando o site publica tudo", () => {
  const p = extrairPrevia(pagina(`
    <title>ignorado</title>
    <meta property="og:title" content="Processo 0164684-53">
    <meta property="og:description" content="Consulta pública de processo">
    <meta property="og:image" content="/img/capa.png">
    <meta property="og:site_name" content="TJAM">
  `), "https://www.tjam.jus.br/processo/1");
  expect(p.titulo).toBe("Processo 0164684-53");
  expect(p.descricao).toBe("Consulta pública de processo");
  expect(p.imagem).toBe("https://www.tjam.jus.br/img/capa.png");
  expect(p.site).toBe("TJAM");
  expect(p.erro).toBeNull();
});

test("o CÓDIGO que monta a etiqueta não é a etiqueta", () => {
  /* O portal do TJAM devolveu título "+ title +" e imagem
     ".../+%20image%20+": ele monta as meta por JavaScript, e o que está no HTML
     é a receita, não o bolo. Isto foi encontrado chamando a função de verdade. */
  const html = pagina(`
    <title>Tribunal de Justiça do Amazonas</title>
    <script>
      var m = '<meta property="og:title" content="' + title + '">';
      document.head.innerHTML += '<meta property="og:image" content="' + image + '">';
    </script>
  `);
  const p = extrairPrevia(html, "https://www.tjam.jus.br/");
  expect(p.titulo).toBe("Tribunal de Justiça do Amazonas");
  expect(p.imagem).toBeNull();
});

test("placeholder de template nunca vira conteúdo", () => {
  for (const v of ["+ title +", "${titulo}", "{{ page.title }}", "%TITLE%", "<%= titulo %>", "   "]) {
    expect(ehPlaceholder(v)).toBe(true);
  }
  for (const v of ["Título de verdade", "Lei 8.078/90", "A + B é a soma"]) {
    expect(ehPlaceholder(v)).toBe(false);
  }
});

test("meta dentro de comentário também não conta", () => {
  const html = pagina(`
    <title>Verdadeiro</title>
    <!-- <meta property="og:title" content="Comentado"> -->
  `);
  expect(extrairPrevia(html, "https://x.com").titulo).toBe("Verdadeiro");
  expect(semScriptNemComentario("<script>a</script>b<!--c-->d")).not.toContain("a");
});

test("sem nenhuma etiqueta e sem título, o cartão não existe", () => {
  const p = extrairPrevia(pagina("<meta charset='utf-8'>"), "https://x.com");
  expect(p.erro).toBe("Essa página não tem prévia.");
  expect(p.titulo).toBeNull();
});

test("só o título já faz um cartão, e o site vira o domínio", () => {
  const p = extrairPrevia(pagina("<title>Só isso</title>"), "https://www.exemplo.com.br/a");
  expect(p.titulo).toBe("Só isso");
  expect(p.site).toBe("exemplo.com.br");
  expect(p.erro).toBeNull();
});

test("a imagem passa pela mesma peneira do servidor", () => {
  /* Ela vira o src de um <img> na tela de quem atende: apontar para a rede
     interna faria o navegador dele buscar o que o servidor recusou. */
  const html = pagina('<title>t</title><meta property="og:image" content="http://169.254.169.254/x.png">');
  const recusando = (u: string) => !u.includes("169.254");
  expect(extrairPrevia(html, "https://x.com", recusando).imagem).toBeNull();
  // e passa quando o endereço é de fora
  const bom = pagina('<title>t</title><meta property="og:image" content="https://cdn.x.com/a.png">');
  expect(extrairPrevia(bom, "https://x.com", recusando).imagem).toBe("https://cdn.x.com/a.png");
});

test("entidade vira o caractere que ela representa", () => {
  expect(semEntidades("Justi&ccedil;a")).toBe("Justi&ccedil;a"); // a que não conheço fica como está
  expect(semEntidades("A &amp; B")).toBe("A & B");
  expect(semEntidades("&quot;aspas&quot;")).toBe('"aspas"');
  expect(semEntidades("caf&#233;")).toBe("café");
  expect(semEntidades("caf&#xe9;")).toBe("café");
  expect(semEntidades("  muito   espaço  ")).toBe("muito espaço");
});

test("texto comprido é cortado, e o corte aparece", () => {
  const longo = "a".repeat(300);
  const p = extrairPrevia(pagina(`<meta property="og:description" content="${longo}"><title>t</title>`), "https://x.com");
  expect(p.descricao!.length).toBeLessThanOrEqual(200);
  expect(p.descricao!.endsWith("…")).toBe(true);
});
