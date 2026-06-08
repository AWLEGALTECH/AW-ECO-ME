import type { LeadParsed } from "./leadParser";
import { normalizarFone, extrairInstagramDeUrl } from "./leadParser";

// xlsx (SheetJS) é pesado (~xxxKB) e só é usado quando o user sobe uma
// planilha — carrega sob demanda pra não inchar o bundle inicial.

// Parser da PLANILHA PADRÃO de leads (export do Google Maps). Colunas
// esperadas (cabeçalho na 1ª linha, case-insensitive):
//
//   nome | telefones | instagram | site | horario | url
//
// - telefones: pode vir como número (notação científica do Excel) ou texto.
// - instagram: URL do perfil — extraímos o @handle.
// - horario: string do Maps com glifo  entre os dias — limpamos.
// - url: link do Google Maps.

// glifos de área de uso privado (ícones) coladas pelo Maps entre os dias
const PUA = new RegExp("[\\uE000-\\uF8FF]", "g");

// Telefone pode chegar como number (Excel) ou string. Devolve só dígitos
// (primeiro telefone válido encontrado) ou null.
function telDigitos(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = String(Math.round(v));
    return d.length >= 10 && d.length <= 13 ? d : null;
  }
  const s = String(v);
  // primeiro bloco que pareça um telefone BR
  const m = s.match(/(\+?\d[\d\s().\-]{8,}\d)/);
  const d = (m ? m[1] : s).replace(/\D/g, "");
  return d.length >= 10 && d.length <= 13 ? d : null;
}

// "55 92 98438-7420" -> "(92) 98438-7420" pra exibição.
function formatBR(digits: string): string {
  let x = digits;
  if (x.startsWith("55") && x.length >= 12) x = x.slice(2);
  const dd = x.slice(0, 2);
  const rest = x.slice(2);
  const mid = rest.length > 8 ? rest.slice(0, 5) : rest.slice(0, 4);
  const end = rest.slice(mid.length);
  return `(${dd}) ${mid}-${end}`;
}

function limparHorarioCell(s: string): string | null {
  if (!s) return null;
  let t = s.replace(PUA, " ");
  // espaço entre o nome do dia e o que vem depois (hora ou "Fechado")
  t = t.replace(/(domingo|segunda-feira|terça-feira|terca-feira|quarta-feira|quinta-feira|sexta-feira|sábado|sabado)/gi, " $1 ");
  // separa intervalos colados ("12:0013:00" -> "12:00, 13:00")
  t = t.replace(/(\d{2}:\d{2})(\d{1,2}:\d{2})/g, "$1, $2");
  t = t.replace(/\s*\|\s*/g, " | ").replace(/\s+/g, " ").trim();
  return t || null;
}

function instaHandle(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const fromUrl = extrairInstagramDeUrl(v);
  if (fromUrl) return fromUrl.replace(/\?.*$/, "").replace(/\/.*$/, "");
  return v.replace(/^@/, "").replace(/\?.*$/, "").replace(/\/.*$/, "") || null;
}

export async function parsePlanilhaPadrao(file: File): Promise<LeadParsed[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  const out: LeadParsed[] = [];
  for (const row of linhas) {
    // acesso case-insensitive às colunas
    const get = (col: string): unknown => {
      const k = Object.keys(row).find(x => x.trim().toLowerCase() === col);
      return k ? row[k] : "";
    };
    const nome = String(get("nome") ?? "").trim();
    if (!nome) continue;

    const digits = telDigitos(get("telefones"));
    let instagram = instaHandle(String(get("instagram") ?? ""));
    let site = String(get("site") ?? "").trim() || null;
    if (site && /instagram\.com/i.test(site)) {
      instagram = instagram || extrairInstagramDeUrl(site);
      site = null;
    }
    const url = String(get("url") ?? "").trim() || null;

    out.push({
      nome,
      telefone: digits ? formatBR(digits) : null,
      whatsapp: digits ? normalizarFone(digits) : null,
      instagram: instagram || null,
      email: null,
      site,
      google_maps_url: url,
      avaliacao: null,
      horario_funcionamento: limparHorarioCell(String(get("horario") ?? "")),
      endereco: null,
    });
  }
  return out;
}
