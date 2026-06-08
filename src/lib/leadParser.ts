// Parser de listas de leads coladas como texto livre. Pensado pra ser
// TOLERANTE a variacoes — o mesmo lead pode vir como:
//
//   Número de contato: +55 92 98438-7420
//   Tel: +55 92 98438-7420
//   Telefone -  92 98438 7420
//   fone +5592984387420
//   Contato | 92 98438-7420
//
// e tudo deve cair como telefone. Estrategia:
//   1. Normalizamos cada linha (lowercase, sem acento) so pra MATCHAR a
//      label — o valor preserva o texto original.
//   2. Cada campo tem uma lista de aliases (telefone => tel, fone, ...).
//   3. O separador apos a label pode ser qualquer um de `: - – — = |`
//      ou simples espaco.
//   4. Se o bloco nao tem labels formais, ainda detectamos: URLs soltas
//      (classificadas como insta/wa/site/maps), telefones soltos no
//      formato BR, emails, @handles, avaliacao tipo "5.0" / "⭐ 4.9".

export interface LeadParsed {
  nome: string;
  telefone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  email: string | null;
  site: string | null;
  google_maps_url: string | null;
  avaliacao: number | null;
  horario_funcionamento: string | null;
  endereco: string | null;
}

const NAO_DISPONIVEL = /n[aã]o\s+dispon[ií]vel|sem\s+(informacao|informa[cç][aã]o|registro)|—|--|n\/?d|n\/?a/i;

// Aliases por campo. Ordem importa quando ha sobreposicao (mais
// especifico primeiro). Todos aqui ja sao normalizados (lowercase,
// sem acento).
const ALIASES: Record<string, string[]> = {
  telefone: [
    "numero de contato", "numero do contato",
    "telefone", "tel", "fone", "celular", "cel",
    "contato", "whatsapp", "wpp", "zap", "wa",
    "numero", "n°", "nº", "n.",
  ],
  site: [
    "site", "website", "url", "pagina", "link", "homepage", "www",
  ],
  instagram: [
    "instagram", "insta", "ig", "@",
  ],
  email: [
    "email", "e-mail", "mail",
  ],
  avaliacao: [
    "avaliacao", "nota", "rating", "estrela", "estrelas", "review", "reviews",
  ],
  funcionamento: [
    "funcionamento", "horario", "horarios", "atendimento", "expediente", "abre",
  ],
  endereco: [
    "endereco", "localizacao", "local", "rua", "av", "av.", "avenida",
    "endereço", "localização",
  ],
};

// Separadores aceitos entre label e valor: `:`, `-`, `–`, `—`, `=`, `|`.
// Tambem aceita um ou mais espacos (pra casos tipo "Tel +55 92...").
const SEP = String.raw`[\s:|\-=–—]+`;

function normalizar(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// Procura a linha que contem um campo do tipo dado. Retorna o valor
// (texto original, nao normalizado), ou null. Aceita variacoes no
// separador e espacamento.
function extrairCampo(linhas: string[], tipo: keyof typeof ALIASES): string | null {
  const aliases = ALIASES[tipo];
  for (const linhaRaw of linhas) {
    const linha = linhaRaw.trim();
    const norm = normalizar(linha);
    for (const alias of aliases) {
      // Constroi regex: ^<alias><sep>(valor)$  case-insensitive.
      // Alias precisa estar como palavra inteira (boundary), exceto
      // pra "@" que eh sempre prefixo.
      const aliasEsc = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const boundary = alias === "@" ? "" : "\\b";
      const re = new RegExp(`^${aliasEsc}${boundary}${SEP}(.+)$`, "i");
      const m = norm.match(re);
      if (!m) continue;
      // Calcula o valor original (o regex casou no normalizado; precisamos
      // pegar o substring equivalente na linha original).
      // Como normalizar nao muda o comprimento (so lowercase + remove diacrticos),
      // podemos cortar pelo mesmo offset.
      const valorNorm = m[1].trim();
      if (!valorNorm || NAO_DISPONIVEL.test(valorNorm)) return null;
      // Pega o valor original cortando depois do separador
      // (busca a posicao do separador na linha original).
      const sepMatch = linha.match(new RegExp(`^.{${alias.length}}${SEP}`, "i"));
      const valor = sepMatch ? linha.slice(sepMatch[0].length).trim() : valorNorm;
      return valor;
    }
  }
  return null;
}

// Telefones BR soltos no texto: detecta "+55 92 98438-7420", "92 98438 7420",
// "(92) 98438-7420", "5592984387420", etc. Retorna a primeira ocorrencia.
function extrairFoneSolto(bloco: string): string | null {
  // Padrao: opcional +55, DDD (2 digitos), 8-9 digitos. Aceita separadores
  // como espaco, hifen, parenteses.
  const re = /(?:\+?55\s*)?\(?[1-9]\d\)?[\s.\-]*9?\d{4}[\s.\-]*\d{4}/g;
  const m = bloco.match(re);
  if (!m) return null;
  // Pega o primeiro que tem pelo menos 10 digitos (descarta falsos positivos)
  for (const cand of m) {
    const digits = cand.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 13) return cand.trim();
  }
  return null;
}

function extrairEmailSolto(bloco: string): string | null {
  const m = bloco.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

// Encontra a primeira URL no texto. Classifica depois.
function extrairUrls(bloco: string): string[] {
  const re = /https?:\/\/[^\s)\]>]+/gi;
  return Array.from(bloco.matchAll(re)).map(m => m[0].replace(/[.,;]+$/, ""));
}

// "@handle" solto (linha tipo "@dra_julianachaves" ou no meio de texto).
function extrairInstaSolto(bloco: string): string | null {
  const m = bloco.match(/(?:^|\s)@([A-Za-z0-9._-]{2,})/);
  return m ? m[1] : null;
}

// Avaliacao solta: "5.0", "4,9", "⭐ 4.9", "Nota 5.0", linha so com numero
function extrairAvaliacaoSolta(linhas: string[]): number | null {
  for (const l of linhas) {
    // Linha so com numero (com ou sem virgula)
    const onlyNum = l.trim().match(/^[⭐\s]*(\d(?:[.,]\d)?)\s*(?:\/\s*5)?\s*[⭐\s]*$/);
    if (onlyNum) {
      const n = parseFloat(onlyNum[1].replace(",", "."));
      if (n >= 0 && n <= 5) return n;
    }
  }
  return null;
}

export function normalizarFone(s: string | null): string | null {
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function extrairInstagramDeUrl(url: string): string | null {
  const m = url.match(/instagram\.com\/([A-Za-z0-9._-]+)/i);
  if (!m) return null;
  return m[1].replace(/\?.*$/, "");
}

// Separa blocos por linha em branco, mas tambem aceita separadores
// alternativos: linha com ---, ===, ___, ou inicio de "[Nome]".
function splitBlocos(texto: string): string[] {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const blocos: string[][] = [];
  let atual: string[] = [];
  const finalizar = () => { if (atual.some(l => l.trim())) blocos.push(atual); atual = []; };
  const isSeparator = (l: string) => /^[\s\-_=]{3,}$/.test(l.trim());
  for (const l of linhas) {
    if (!l.trim() || isSeparator(l)) finalizar();
    else atual.push(l);
  }
  finalizar();
  return blocos.map(b => b.join("\n"));
}

function limparNome(linha: string): string {
  let s = linha.trim();
  // Remove `[` inicial
  s = s.replace(/^\[+/, "");
  // Se tem `](url)`, corta no `](`
  const idx = s.indexOf("](");
  if (idx >= 0) s = s.slice(0, idx);
  // Remove `]` solto no fim
  s = s.replace(/]+$/, "");
  // Remove numeracao tipo "1.", "1)", "•", "-" no inicio
  s = s.replace(/^(?:\d+[.)]\s*|[\-•*]\s+)/, "");
  return s.trim();
}

// Detecta se uma linha eh um label conhecido (vai ser pulada na busca
// por nome). Mais tolerante: usa os aliases e separadores flexiveis.
function isLinhaLabel(linha: string): boolean {
  const norm = normalizar(linha);
  const todosAliases = Object.values(ALIASES).flat();
  for (const alias of todosAliases) {
    const aliasEsc = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const boundary = alias === "@" ? "" : "\\b";
    const re = new RegExp(`^${aliasEsc}${boundary}${SEP}`, "i");
    if (re.test(norm)) return true;
  }
  return false;
}

function extrairUrlMarkdown(linhas: string[]): string | null {
  for (const l of linhas) {
    const m = l.match(/\]\((https?:\/\/[^)]+)\)/);
    if (m) return m[1];
  }
  return null;
}

// Heuristicas pra descartar "lixo" tipico de scraping do Google Maps:
// "🩺 Médico", "💄 Loja", "Open", "Closed", "· Closes 8:00 PM", numeros
// soltos de avaliacao, etc.
function isLixo(linha: string): boolean {
  const t = linha.trim();
  if (!t) return true;
  if (/^[⭐\s]*\d(?:[.,]\d)?\s*(?:\/\s*5)?\s*[⭐\s]*$/.test(t)) return true; // avaliacao solta
  if (/^(open|closed|aberto|fechado|·|·)/i.test(t)) return true;
  if (/^(closes?|abre|fecha)\b/i.test(t)) return true;
  if (/^[🩺💄📍⭐⚕️🦷✨🌸💉]+\s*\w*$/.test(t)) return true; // emoji + 1 palavra
  return false;
}

// "@handle" puro numa linha (sem prefixo de label tipo "Insta:").
const HANDLE_PURO = /^@([A-Za-z0-9._]{2,30})$/;

// Modo "lista densa de @handles": user cola uma lista onde toda linha
// nao-vazia eh um @handle. Cada linha vira um lead independente, mesmo
// sem linha em branco entre elas. Saida no formato do parseLeads.
function tryListaDensaInsta(texto: string): LeadParsed[] | null {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n").map(l => l.trim()).filter(Boolean);
  if (linhas.length < 2) return null;
  if (!linhas.every(l => HANDLE_PURO.test(l))) return null;
  return linhas.map((l) => {
    const handle = l.replace(/^@/, "");
    return {
      nome: `@${handle}`,
      telefone: null,
      whatsapp: null,
      instagram: handle,
      email: null,
      site: null,
      google_maps_url: null,
      avaliacao: null,
      horario_funcionamento: null,
      endereco: null,
    };
  });
}

export function parseLeads(texto: string): LeadParsed[] {
  // Caso especial: lista densa de @handles (linha-por-linha sem nada mais).
  const listaInsta = tryListaDensaInsta(texto);
  if (listaInsta) return listaInsta;

  const blocos = splitBlocos(texto);
  const out: LeadParsed[] = [];
  for (const blocoRaw of blocos) {
    const linhas = blocoRaw.split("\n").map(l => l.trim()).filter(Boolean);
    if (linhas.length === 0) continue;

    // Caso bloco com 1 linha unica que eh @handle puro: vira lead so de Instagram.
    if (linhas.length === 1 && HANDLE_PURO.test(linhas[0])) {
      const handle = linhas[0].replace(/^@/, "");
      out.push({
        nome: `@${handle}`,
        telefone: null,
        whatsapp: null,
        instagram: handle,
        email: null,
        site: null,
        google_maps_url: null,
        avaliacao: null,
        horario_funcionamento: null,
        endereco: null,
      });
      continue;
    }

    // Acha o nome: primeira linha que NAO eh label, NAO eh lixo e
    // tem pelo menos um caractere alfabetico. Aceita tambem @handle puro
    // como nome (sera tratado depois pra extrair o instagram).
    const nomeLinha = linhas.find(l =>
      (!isLinhaLabel(l) || HANDLE_PURO.test(l)) && !isLixo(l) && /[a-zA-Z@À-ÿ]/.test(l),
    );
    if (!nomeLinha) continue;
    const nome = limparNome(nomeLinha);
    if (!nome || nome.length < 2) continue;

    // Campos com label
    const fone   = extrairCampo(linhas, "telefone");
    const siteL  = extrairCampo(linhas, "site");
    const instaL = extrairCampo(linhas, "instagram");
    const emailL = extrairCampo(linhas, "email");
    const aval   = extrairCampo(linhas, "avaliacao");
    const func   = extrairCampo(linhas, "funcionamento");
    const ender  = extrairCampo(linhas, "endereco");

    // Fallbacks "soltos": olha tudo que sobrou e tenta extrair sem label.
    const blocoSemNome = linhas.filter(l => l !== nomeLinha).join("\n");
    const foneFinal  = fone   || extrairFoneSolto(blocoSemNome);
    const emailFinal = emailL || extrairEmailSolto(blocoSemNome);

    // URLs do bloco (alem da do markdown link)
    const urls = extrairUrls(blocoSemNome);
    const markdown = extrairUrlMarkdown(linhas);

    // Classifica URLs (insta / wa / maps / site).
    let instagramHandle: string | null = instaL ? instaL.replace(/^@/, "") : null;
    let waLink: string | null = null;
    let siteFinal: string | null = siteL;
    let googleMaps: string | null = markdown && /maps|maps\.google|goo\.gl\/maps/i.test(markdown) ? markdown : null;

    if (siteFinal) {
      if (/instagram\.com/i.test(siteFinal)) {
        instagramHandle = instagramHandle || extrairInstagramDeUrl(siteFinal);
        siteFinal = null;
      } else if (/wa\.me|whatsapp\.com/i.test(siteFinal)) {
        waLink = siteFinal;
        siteFinal = null;
      }
    }
    for (const url of urls) {
      if (/instagram\.com/i.test(url)) {
        instagramHandle = instagramHandle || extrairInstagramDeUrl(url);
      } else if (/wa\.me|whatsapp\.com/i.test(url)) {
        waLink = waLink || url;
      } else if (/maps\.google|google\.com\/maps|goo\.gl\/maps/i.test(url)) {
        googleMaps = googleMaps || url;
      } else if (!siteFinal) {
        siteFinal = url;
      }
    }

    // Instagram solto (linha "@handle" sem label)
    if (!instagramHandle) {
      const instaSolto = extrairInstaSolto(blocoSemNome);
      if (instaSolto && !/^(\d{2,3}|tel|fone|whatsapp|wa|zap)$/i.test(instaSolto)) {
        instagramHandle = instaSolto;
      }
    }

    // Se o proprio nome eh um @handle puro, extrai o handle dele.
    if (!instagramHandle && HANDLE_PURO.test(nome)) {
      instagramHandle = nome.replace(/^@/, "");
    }

    // Avaliacao com label ou solta
    let avaliacao: number | null = null;
    if (aval) {
      const n = parseFloat(aval.replace(",", "."));
      if (Number.isFinite(n) && n >= 0 && n <= 5) avaliacao = n;
    }
    if (avaliacao == null) {
      avaliacao = extrairAvaliacaoSolta(linhas);
    }

    out.push({
      nome,
      telefone: foneFinal ?? null,
      whatsapp: normalizarFone(foneFinal) ?? (waLink ? waLink : null),
      instagram: instagramHandle,
      email: emailFinal ?? null,
      site: siteFinal,
      google_maps_url: googleMaps,
      avaliacao,
      horario_funcionamento: func,
      endereco: ender,
    });
  }
  return out;
}
