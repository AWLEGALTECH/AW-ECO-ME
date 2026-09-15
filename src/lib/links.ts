/* ACHAR LINK NO MEIO DO TEXTO, SEM ACHAR O QUE NÃO É.
 *
 * A bolha da conversa mostrava o texto cru: um link chegava, e a única forma de
 * abri-lo era selecionar com o mouse e copiar. No WhatsApp ele é azul e clicável
 * desde sempre, e quem atende compara com o WhatsApp o tempo todo.
 *
 * ───────────────────── por que não vale "qualquer coisa com ponto" ──────────
 *
 * Este é um sistema jurídico. O texto das conversas está cheio de coisa com
 * ponto que NÃO é endereço:
 *
 *   Lei 8.078/90        art. 5º        CPF 123.456.789-00
 *   R$ 1.250,00         Súmula 297     contrato.pdf
 *
 * Transformar isso em link não dá erro nenhum: dá uma palavra azul que abre uma
 * aba em branco, e o texto da conversa passa a parecer quebrado. Por isso o
 * domínio sem "http" e sem "www" só é reconhecido quando termina numa das
 * terminações que a gente usa de verdade — a lista curta abaixo. "contrato.pdf"
 * não entra nela; "google.com" e "tjam.jus.br" entram.
 */

/* As terminações que valem para domínio escrito solto, sem http e sem www.
   Curta de propósito: cada entrada é uma chance de falso positivo, e a de
   verdade duvidosa fica de fora. */
const TERMINACOES = [
  "com.br", "gov.br", "jus.br", "org.br", "net.br", "adv.br", "edu.br",
  "com", "org", "net", "gov", "edu", "io", "app", "me", "co", "dev", "br",
];

const RE_LINK = new RegExp(
  [
    // 1. com esquema: o caso sem dúvida
    "https?://[^\\s<>\"']+",
    // 2. começando por www.
    "www\\.[^\\s<>\"']+",
    /* 3. domínio solto, só nas terminações conhecidas.
          O que vem ANTES do começo precisa ser espaço ou pontuação de frase:
          arroba, letra, ponto e HÍFEN barram. O hífen estava de fora e deixava
          escapar o meio de um e-mail de conta de serviço:
          "aw-eco-drive@aw-eco-drive-497216.iam.gserviceaccount.com" casava a
          partir de "eco-drive-497216…" e virava link. */
    `(?<![@\\w.-])[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\\.(?:${TERMINACOES.join("|")})(?![a-z])(?:/[^\\s<>"']*)?`,
  ].join("|"),
  "gi",
);

/**
 * A pontuação do FIM não faz parte do endereço.
 *
 * "Veja https://tjam.jus.br." termina numa frase, não num link que acaba em
 * ponto. O parêntese é o caso chato: em "(https://x.com/a)" o fecha é da frase,
 * mas em "https://pt.wikipedia.org/wiki/Lei_(norma)" ele é do endereço. A conta
 * é de equilíbrio: só tiro o fecha se não houver um abre correspondente dentro.
 */
function semPontuacaoFinal(bruto: string): string {
  let u = bruto;
  while (u.length > 0) {
    const fim = u[u.length - 1];
    if (".,;:!?".includes(fim)) { u = u.slice(0, -1); continue; }
    if ("\"'".includes(fim)) { u = u.slice(0, -1); continue; }
    if (fim === ")" || fim === "]" || fim === "}") {
      const abre = fim === ")" ? "(" : fim === "]" ? "[" : "{";
      const quantos = (u.match(new RegExp(`\\${abre}`, "g")) || []).length;
      const fecha = (u.match(new RegExp(`\\${fim}`, "g")) || []).length;
      if (fecha > quantos) { u = u.slice(0, -1); continue; }
    }
    break;
  }
  return u;
}

/** O endereço pronto para o href: o que não tem esquema ganha https. */
export function comEsquema(bruto: string): string {
  return /^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`;
}

export interface PedacoDeTexto {
  tipo: "texto" | "link";
  /** o que aparece na tela, exatamente como a pessoa escreveu */
  texto: string;
  /** só no link: o endereço com esquema, pronto para o href */
  href?: string;
}

/**
 * O texto partido em pedaços, na ordem, para a bolha desenhar.
 *
 * Devolver pedaços em vez de HTML pronto é o que mantém isto testável e longe
 * de `dangerouslySetInnerHTML` — texto de mensagem vem de fora, e montar HTML
 * com ele é como se escreve um buraco de segurança sem perceber.
 */
export function pedacosDoTexto(texto: string): PedacoDeTexto[] {
  const t = String(texto ?? "");
  if (!t) return [];

  const pedacos: PedacoDeTexto[] = [];
  let ultimo = 0;

  for (const achado of t.matchAll(RE_LINK)) {
    const inicio = achado.index ?? 0;
    const bruto = achado[0];
    const limpo = semPontuacaoFinal(bruto);
    if (!limpo) continue;

    if (inicio > ultimo) pedacos.push({ tipo: "texto", texto: t.slice(ultimo, inicio) });
    pedacos.push({ tipo: "link", texto: limpo, href: comEsquema(limpo) });
    ultimo = inicio + limpo.length;
  }

  if (ultimo < t.length) pedacos.push({ tipo: "texto", texto: t.slice(ultimo) });
  return pedacos;
}

/** Só os endereços, na ordem em que aparecem. */
export function linksDoTexto(texto: string): string[] {
  return pedacosDoTexto(texto).filter((p) => p.tipo === "link").map((p) => p.href!);
}

/**
 * O link que ganha a prévia: o PRIMEIRO.
 *
 * O WhatsApp faz igual, e pelo mesmo motivo: uma mensagem com cinco links
 * viraria cinco cartões e a conversa sumiria embaixo deles. O primeiro é o que
 * quem escreveu quis mostrar; os outros continuam clicáveis.
 */
export function linkParaPrevia(texto: string): string | null {
  return linksDoTexto(texto)[0] ?? null;
}

/** O domínio, como ele aparece no rodapé do cartão de prévia. */
export function dominioDoLink(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

/**
 * Cabe na bolha?
 *
 * Endereço comprido estoura a largura e empurra a conversa. No meio do texto
 * ele é cortado no visual (CSS), mas quando o link é a mensagem INTEIRA o corte
 * precisa preservar o começo e o fim: o começo diz de onde é, o fim costuma ser
 * o que identifica a coisa.
 */
export function linkEncurtado(texto: string, limite = 48): string {
  const t = String(texto ?? "");
  if (t.length <= limite) return t;
  const cabeca = Math.ceil((limite - 1) * 0.6);
  const cauda = limite - 1 - cabeca;
  return `${t.slice(0, cabeca)}…${t.slice(-cauda)}`;
}
