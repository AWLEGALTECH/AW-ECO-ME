// Extração de texto de PDF no NAVEGADOR (pdf.js roda liso aqui, ao contrário do
// servidor, onde travava). Mandamos só o TEXTO pro OpenAI, não o PDF inteiro:
// cada extrato cai de ~99k tokens (arquivo) para ~5-15k (texto), ficando bem
// mais barato e sem estourar o limite de tokens por minuto.

import * as pdfjs from "pdfjs-dist";
// Worker empacotado pelo Vite (sem CDN, sem rede externa).
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();

export interface TextoExtrato {
  name: string;
  texto: string;
  paginas: number;
  vazio: boolean; // true quando o PDF não tem camada de texto (provável escaneado)
}

// Extrai o texto de um PDF já em memória (ArrayBuffer).
export async function extrairTextoPdf(name: string, buf: ArrayBuffer): Promise<TextoExtrato> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true, isEvalSupported: false }).promise;
  const partes: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      let linha = "";
      let ultimoY: number | null = null;
      for (const item of content.items as any[]) {
        const str = item.str ?? "";
        const y = item.transform?.[5] ?? null;
        // Quebra de linha aproximada quando o Y muda (mantém a leitura de extrato).
        if (ultimoY !== null && y !== null && Math.abs(y - ultimoY) > 3) {
          partes.push(linha.trim());
          linha = "";
        }
        linha += str + " ";
        ultimoY = y;
        if (item.hasEOL) { partes.push(linha.trim()); linha = ""; }
      }
      if (linha.trim()) partes.push(linha.trim());
      page.cleanup();
    }
  } finally {
    doc.destroy();
  }
  const texto = partes.join("\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return { name, texto, paginas: doc.numPages, vazio: texto.replace(/\s/g, "").length < 40 };
}

// Itens POSICIONADOS (x/y/largura) — para PDFs em colunas (ex.: SEMAD), onde a
// coluna de cada célula importa e o texto plano embaralha tudo.
export interface ItemPdfPos { page: number; x: number; y: number; w: number; str: string }
export async function extrairItensPdf(buf: ArrayBuffer): Promise<ItemPdfPos[]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), disableFontFace: true, isEvalSupported: false }).promise;
  const out: ItemPdfPos[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      for (const it of tc.items as any[]) {
        const s = String(it.str || "").trim();
        if (!s) continue;
        out.push({ page: p, x: it.transform[4], y: it.transform[5], w: it.width || 0, str: s });
      }
    }
  } finally { try { await doc.destroy(); } catch { /* melhor esforço */ } }
  return out;
}
