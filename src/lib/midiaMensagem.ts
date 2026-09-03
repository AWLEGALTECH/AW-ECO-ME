// O QUE A BOLHA PRECISA SABER SOBRE UM ANEXO.
//
// Decisões pequenas e chatas — "isso é áudio ou documento?", "que nome dou pro
// arquivo que a pessoa vai baixar?", "essa duração dá pra confiar?" — que
// erradas viram bug visível: um PDF virando bolha de texto, um download
// chamado "blob", um player marcando "Infinity:NaN".
//
// Moram aqui, e não dentro do componente, porque são as únicas partes com
// resposta certa e errada. O resto (lightbox, barra de progresso) é layout, e
// layout se confere olhando.
//
// A ESTRUTURA VEIO DO AW-ECO (ChatMediaRenderer do João), mas a fonte é outra:
// lá a mídia vem como base64 dentro da coluna `conteudo`, o que obrigou um
// lazy-load por IntersectionObserver pra tela não travar carregando megabytes.
// Aqui o arquivo mora no Storage e chega como URL assinada — o peso nunca passa
// pelo banco, então nada disso é necessário.

import { duracaoCurta, type TipoMsg } from "./wa";

export type Familia = "audio" | "imagem" | "video" | "documento" | "texto";

/**
 * A família do anexo.
 *
 * O `tipo` gravado pelo webhook manda, porque ele veio da chave que a Evolution
 * usou (`audioMessage`, `imageMessage`) — é a informação mais direta que existe.
 * O mime só entra quando o tipo veio como "outro": versão nova da Evolution com
 * chave que a gente ainda não conhece não pode derrubar o anexo pra texto.
 */
export function familiaDaMidia(tipo: TipoMsg | string | null, mime?: string | null): Familia {
  switch (tipo) {
    case "audio":     return "audio";
    case "imagem":    return "imagem";
    case "video":     return "video";
    case "documento": return "documento";
    case "sticker":   return "imagem"; // figurinha é imagem — só menor
    case "texto":     return "texto";
  }
  const m = (mime || "").toLowerCase();
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("image/")) return "imagem";
  if (m.startsWith("video/")) return "video";
  if (m) return "documento";
  return "texto";
}

const POR_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/zip": "zip",
  "text/plain": "txt",
  "text/csv": "csv",
};

/** A extensão, em minúsculo e sem ponto. "" quando não dá pra saber. */
export function extensaoDe(nome?: string | null, mime?: string | null, path?: string | null): string {
  for (const fonte of [nome, path]) {
    const m = String(fonte || "").match(/\.([a-zA-Z0-9]{1,5})$/);
    if (m) return m[1].toLowerCase();
  }
  const limpo = String(mime || "").split(";")[0].trim().toLowerCase();
  if (POR_MIME[limpo]) return POR_MIME[limpo];
  const sub = limpo.split("/")[1];
  if (sub && /^[a-z0-9]+$/.test(sub)) return sub;
  return "";
}

/**
 * O nome com que o arquivo é salvo.
 *
 * Documento quase sempre chega nomeado pelo WhatsApp e esse nome é o que a
 * pessoa reconhece — "extrato março.pdf" diz mais que qualquer coisa que eu
 * invente. Sem nome, monta um: baixar um arquivo chamado "download" e não saber
 * o que é dentro da pasta de Downloads é pior que um nome genérico com extensão.
 */
export function nomeDoArquivo(
  familia: Familia,
  nome?: string | null,
  mime?: string | null,
  path?: string | null,
): string {
  const dado = String(nome || "").trim();
  if (dado) return dado;
  const ext = extensaoDe(null, mime, path);
  const base =
    familia === "audio" ? "audio" :
    familia === "imagem" ? "imagem" :
    familia === "video" ? "video" : "documento";
  return ext ? `${base}.${ext}` : base;
}

/**
 * A duração que o player mostra.
 *
 * O áudio do WhatsApp é opus em contêiner ogg/webm, e contêiner de gravação
 * costuma vir SEM o cabeçalho de duração: o elemento <audio> devolve Infinity
 * até a faixa tocar até o fim. Mostrar "Infinity" ou "0:00" numa mensagem que
 * dura meio minuto faz a pessoa achar que o áudio não carregou.
 *
 * Então: o que o elemento diz vale quando é um número finito e positivo; senão
 * cai na duração que a Evolution mandou junto com a mensagem. Se nem isso
 * existir, devolve null e o player esconde o número em vez de mentir.
 */
export function duracaoExibida(doElemento: number | null | undefined, gravada: number | null | undefined): string | null {
  const e = Number(doElemento);
  if (Number.isFinite(e) && e > 0) return duracaoCurta(e);
  const g = Number(gravada);
  if (Number.isFinite(g) && g > 0) return duracaoCurta(g);
  return null;
}

/** Quanto da faixa já tocou, de 0 a 100. Sem duração conhecida, fica em 0. */
export function progressoDoAudio(
  atual: number | null | undefined,
  doElemento: number | null | undefined,
  gravada: number | null | undefined,
): number {
  const a = Number(atual);
  if (!Number.isFinite(a) || a <= 0) return 0;
  const e = Number(doElemento);
  const total = Number.isFinite(e) && e > 0 ? e : Number(gravada);
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, (a / total) * 100));
}

/**
 * As barrinhas do áudio.
 *
 * Não é a onda real do arquivo: ler a amostra exigiria decodificar o áudio
 * inteiro na abertura da conversa, e um chat com trinta áudios travaria pra
 * desenhar um enfeite. É um desenho estável derivado do id da mensagem — o
 * mesmo áudio tem sempre a mesma silhueta, áudios diferentes têm silhuetas
 * diferentes, e é isso que o olho usa pra distinguir uma bolha da outra.
 */
export function barrasDoAudio(semente: string, n = 28): number[] {
  let h = 2166136261;
  for (let i = 0; i < semente.length; i++) {
    h ^= semente.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const barras: number[] = [];
  for (let i = 0; i < n; i++) {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    barras.push(0.25 + (Math.abs(h) % 1000) / 1000 * 0.75);
  }
  return barras;
}
