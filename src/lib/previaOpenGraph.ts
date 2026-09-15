/* AS ETIQUETAS QUE VIRAM O CARTÃO DO LINK.
 *
 * Open Graph: `og:title`, `og:description`, `og:image`, `og:site_name`. É o que
 * o WhatsApp, o Slack e o Telegram leem, e é o que quase todo site publica.
 *
 * Mora aqui, e não dentro da edge function, porque é a parte que ERRA: ler HTML
 * de terceiro com expressão regular acerta em noventa por cento dos sites e
 * inventa coisa nos outros dez. Cada modo de inventar que aparecer vira um teste
 * neste arquivo, e a função `link-previa` lê o mesmo arquivo por link simbólico.
 *
 * ───────────────────── o que já tentou passar por etiqueta ──────────────────
 *
 * O portal do TJAM devolveu título "+ title +" e imagem
 * "https://www.tjam.jus.br/+%20image%20+". Não é bug do site: ele monta as
 * etiquetas por JavaScript, e o que está escrito no HTML é o CÓDIGO que monta,
 * não o resultado. Uma expressão regular solta não distingue as duas coisas,
 * então o script sai fora antes de qualquer leitura.
 */

export interface PreviaDoLink {
  titulo: string | null;
  descricao: string | null;
  imagem: string | null;
  site: string | null;
  erro: string | null;
}

/**
 * Tira do HTML o que não é conteúdo de verdade.
 *
 * Script e comentário contêm `<meta …>` escrito como texto o tempo todo: em
 * template de JavaScript, em exemplo comentado, em código morto. Ler dali é ler
 * a receita achando que é o bolo.
 */
export function semScriptNemComentario(html: string): string {
  return String(html ?? "")
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

/**
 * Isto parece conteúdo, ou parece o código que ia gerar o conteúdo?
 *
 * "+ title +", "${titulo}", "{{ page.title }}" e "%TITLE%" são placeholders que
 * sobraram. Mostrar um deles como título é pior que não mostrar título nenhum:
 * o cartão fica com cara de defeito e ninguém sabe se o link presta.
 */
export function ehPlaceholder(valor: string): boolean {
  const v = String(valor ?? "").trim();
  if (!v) return true;
  return /^\+.*\+$/.test(v)          // + title +
    || /\$\{[^}]*\}/.test(v)          // ${titulo}
    || /\{\{[^}]*\}\}/.test(v)        // {{ page.title }}
    || /^%[A-Z_]+%$/.test(v)          // %TITLE%
    || /^<%=?[\s\S]*%>$/.test(v)      // <%= titulo %>
    || /\+\s*\w+\s*\+/.test(v);       // ...+ image +...
}

/** Entidades que aparecem em título de página. Sem biblioteca: são estas. */
export function semEntidades(t: string): string {
  return String(t ?? "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

/** O conteúdo de uma etiqueta meta, por propriedade ou por nome. */
export function metaDoHtml(html: string, chave: string): string | null {
  /* Duas ordens porque as duas existem no mundo real: `property` antes de
     `content` e o contrário. Uma regex só, com a ordem fixa, perde metade dos
     sites. As aspas podem ser simples, duplas ou nenhuma. */
  const escapada = chave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const padroes = [
    new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']?${escapada}["'\\s>][^>]*content\\s*=\\s*["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']?${escapada}["'\\s>]`, "i"),
  ];
  for (const re of padroes) {
    const m = html.match(re);
    const v = m?.[1];
    if (v && !ehPlaceholder(v)) return v;
  }
  return null;
}

const corta = (t: string | null, n: number): string | null => {
  const v = semEntidades(String(t ?? ""));
  if (!v || ehPlaceholder(v)) return null;
  return v.length <= n ? v : `${v.slice(0, n - 1).trimEnd()}…`;
};

/**
 * O cartão, a partir do HTML.
 *
 * `podeBuscar` é a mesma peneira de endereço interno que a função usa para si:
 * a imagem vira o `src` de um `<img>` na tela de quem atende, e apontar para a
 * rede interna faria o NAVEGADOR dele buscar o que o servidor recusou.
 */
export function extrairPrevia(
  html: string,
  urlFinal: string,
  podeBuscar: (u: string) => boolean = () => true,
): PreviaDoLink {
  const limpo = semScriptNemComentario(html);

  const doTitulo = limpo.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
  const titulo = corta(metaDoHtml(limpo, "og:title"), 120)
    ?? corta(metaDoHtml(limpo, "twitter:title"), 120)
    ?? corta(doTitulo, 120);

  const descricao = corta(metaDoHtml(limpo, "og:description"), 200)
    ?? corta(metaDoHtml(limpo, "twitter:description"), 200)
    ?? corta(metaDoHtml(limpo, "description"), 200);

  let dominio = "";
  try { dominio = new URL(urlFinal).hostname.replace(/^www\./i, ""); } catch { /* endereço estranho */ }
  const site = corta(metaDoHtml(limpo, "og:site_name"), 60) ?? (dominio || null);

  let imagem: string | null = null;
  const bruta = metaDoHtml(limpo, "og:image")
    ?? metaDoHtml(limpo, "og:image:url")
    ?? metaDoHtml(limpo, "twitter:image");
  if (bruta) {
    try {
      const abs = new URL(semEntidades(bruta), urlFinal).toString();
      if (abs.length <= 1000 && podeBuscar(abs)) imagem = abs;
    } catch { /* endereço de imagem quebrado: fica sem imagem */ }
  }

  if (!titulo && !descricao && !imagem) {
    return { titulo: null, descricao: null, imagem: null, site: null, erro: "Essa página não tem prévia." };
  }
  return { titulo, descricao, imagem, site, erro: null };
}
