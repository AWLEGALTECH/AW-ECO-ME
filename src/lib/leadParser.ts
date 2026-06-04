// Parser de listas de leads coladas como texto livre. Aceita formatos
// variados (com ou sem markdown link no nome) e extrai os campos
// principais. Pensado pra listas tipo "Negocios locais Google Maps":
//
//   [Nome do estabelecimento](https://maps.google...)
//   Número de contato: +55 92 9xxxx-xxxx
//   Site: https://exemplo.com
//   Funcionamento: Seg: 09:00 as 19:00; ...
//   Avaliação: 5.0
//
//   <linha em branco separa blocos>
//
// Blocos sem campos minimos (sem nome) sao descartados silenciosamente.
// Telefones "Não disponível" / sites "Não disponível" viram null.

export interface LeadParsed {
  nome: string;
  telefone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  site: string | null;
  google_maps_url: string | null;
  avaliacao: number | null;
  horario_funcionamento: string | null;
}

const NAO_DISPONIVEL = /n[aã]o\s+dispon[ií]vel/i;

// Normaliza telefone BR pra E.164. "+55 92 98438-7420" -> "5592984387420"
function normalizarFone(s: string | null): string | null {
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

// Extrai handle do Instagram a partir de uma URL. "instagram.com/foo" -> "foo"
function extrairInstagram(url: string): string | null {
  const m = url.match(/instagram\.com\/([A-Za-z0-9._-]+)/i);
  if (!m) return null;
  return m[1].replace(/\?.*$/, "");
}

// Tenta separar blocos olhando linhas em branco. Tambem aceita blocos
// que comecam com `[` (markdown link), tratando isso como inicio implicito.
function splitBlocos(texto: string): string[] {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const blocos: string[][] = [];
  let atual: string[] = [];
  const finalizar = () => { if (atual.some(l => l.trim())) blocos.push(atual); atual = []; };
  for (const l of linhas) {
    if (!l.trim()) finalizar();
    else atual.push(l);
  }
  finalizar();
  return blocos.map(b => b.join("\n"));
}

function limparNome(linha: string): string {
  // Remove `[` inicial e tudo apos `](...)` ou `]` solto
  let s = linha.trim();
  s = s.replace(/^\[+/, "");
  // Se tem `](url)`, corta no `](`
  const idx = s.indexOf("](");
  if (idx >= 0) s = s.slice(0, idx);
  // Remove `]` solto no fim
  s = s.replace(/]+$/, "");
  return s.trim();
}

function extrairCampo(bloco: string, label: string): string | null {
  const re = new RegExp(`^${label}\\s*:\\s*(.+)$`, "im");
  const m = bloco.match(re);
  if (!m) return null;
  const valor = m[1].trim();
  if (!valor || NAO_DISPONIVEL.test(valor)) return null;
  return valor;
}

// Extrai a URL do markdown link no nome, se houver: [Nome](URL)
function extrairUrlMarkdown(linhas: string[]): string | null {
  for (const l of linhas) {
    const m = l.match(/\]\((https?:\/\/[^)]+)\)/);
    if (m) return m[1];
  }
  return null;
}

export function parseLeads(texto: string): LeadParsed[] {
  const blocos = splitBlocos(texto);
  const out: LeadParsed[] = [];
  for (const blocoRaw of blocos) {
    const linhas = blocoRaw.split("\n").map(l => l.trim()).filter(Boolean);
    if (linhas.length === 0) continue;
    // Pega a primeira linha que parece um "nome" (i.e. nao comeca com
    // label conhecido). Util quando o bloco vem com lixo no topo
    // (Avaliacao 5.0, etiqueta de tipo, etc).
    const isLabel = (l: string) => /^(número\s+de\s+contato|site|funcionamento|avaliação|n[uú]mero|telefone|fone|whatsapp|instagram)\s*:/i.test(l);
    const nomeLinha = linhas.find(l => !isLabel(l) && !/^\d+\.\d+$/.test(l) && !/^(open|closed|·|🩺|💄|📍|⭐)/i.test(l));
    if (!nomeLinha) continue;
    const nome = limparNome(nomeLinha);
    if (!nome) continue;

    const blocoTxt = blocoRaw;
    const fone = extrairCampo(blocoTxt, "Número de contato") ?? extrairCampo(blocoTxt, "Telefone") ?? extrairCampo(blocoTxt, "Fone");
    const site = extrairCampo(blocoTxt, "Site");
    const funcionamento = extrairCampo(blocoTxt, "Funcionamento");
    const avalStr = extrairCampo(blocoTxt, "Avaliação");
    const aval = avalStr ? parseFloat(avalStr.replace(",", ".")) : NaN;

    // Site pode ser, na verdade, instagram ou WhatsApp wa.me — desambigua.
    let instagramHandle: string | null = null;
    let siteFinal: string | null = site;
    let waLink: string | null = null;
    if (site) {
      if (/instagram\.com/i.test(site)) {
        instagramHandle = extrairInstagram(site);
        siteFinal = null;
      } else if (/wa\.me|whatsapp\.com/i.test(site)) {
        waLink = site;
        siteFinal = null;
      }
    }

    const googleMaps = extrairUrlMarkdown(linhas);

    out.push({
      nome,
      telefone: fone ?? null,
      whatsapp: normalizarFone(fone) ?? (waLink ? waLink : null),
      instagram: instagramHandle,
      site: siteFinal,
      google_maps_url: googleMaps,
      avaliacao: Number.isFinite(aval) ? aval : null,
      horario_funcionamento: funcionamento,
    });
  }
  return out;
}
