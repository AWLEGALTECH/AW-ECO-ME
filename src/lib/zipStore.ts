// ZIP sem compressão, escrito à mão.
//
// Existe por causa de uma limitação real do navegador: o MediaRecorder do
// Chrome não grava canal alpha. Vídeo gravado de um canvas transparente sai
// com o fundo preto, não vazado. Quem precisa de transparência de verdade num
// editor usa sequência de PNG, e sequência de PNG precisa de um .zip pra não
// virar 45 downloads.
//
// Sem compressão de propósito: PNG já é comprimido, então deflate gastaria CPU
// pra ganhar quase nada. O método "store" (0) cabe em cem linhas e dispensa
// dependência nova só pra isso.

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(dados: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// Escritor sequencial: o formato é todo little-endian e cheio de campos de
// tamanho fixo, então um cursor evita contas de offset espalhadas.
class Buffer {
  private partes: Uint8Array[] = [];
  tamanho = 0;
  u16(v: number) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); this.push(b); }
  u32(v: number) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); this.push(b); }
  push(b: Uint8Array) { this.partes.push(b); this.tamanho += b.length; }
  blob(tipo: string) { return new Blob(this.partes as BlobPart[], { type: tipo }); }
}

export interface ArquivoZip { nome: string; dados: Uint8Array }

/**
 * Monta um .zip com os arquivos dados, sem compactar.
 *
 * A data de modificação é fixa (1º de janeiro de 1980, o zero do formato) em
 * vez do relógio: dois exports do mesmo material geram bytes idênticos, o que
 * facilita conferir que nada mudou.
 */
export function zipStore(arquivos: ArquivoZip[]): Blob {
  const enc = new TextEncoder();
  const buf = new Buffer();
  const centrais: { nome: Uint8Array; crc: number; tam: number; offset: number }[] = [];

  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const crc = crc32(a.dados);
    const offset = buf.tamanho;

    buf.u32(0x04034B50);          // assinatura do cabeçalho local
    buf.u16(20);                  // versão mínima
    buf.u16(0);                   // flags
    buf.u16(0);                   // método: store
    buf.u16(0); buf.u16(0x21);    // hora e data (1980-01-01)
    buf.u32(crc);
    buf.u32(a.dados.length);      // tamanho comprimido
    buf.u32(a.dados.length);      // tamanho original
    buf.u16(nome.length);
    buf.u16(0);                   // extra
    buf.push(nome);
    buf.push(a.dados);

    centrais.push({ nome, crc, tam: a.dados.length, offset });
  }

  const inicioCentral = buf.tamanho;
  for (const c of centrais) {
    buf.u32(0x02014B50);          // assinatura do diretório central
    buf.u16(20); buf.u16(20);
    buf.u16(0); buf.u16(0);
    buf.u16(0); buf.u16(0x21);
    buf.u32(c.crc);
    buf.u32(c.tam); buf.u32(c.tam);
    buf.u16(c.nome.length);
    buf.u16(0);                   // extra
    buf.u16(0);                   // comentário
    buf.u16(0);                   // disco inicial
    buf.u16(0);                   // atributos internos
    buf.u32(0);                   // atributos externos
    buf.u32(c.offset);
    buf.push(c.nome);
  }
  const tamanhoCentral = buf.tamanho - inicioCentral;

  buf.u32(0x06054B50);            // fim do diretório central
  buf.u16(0); buf.u16(0);
  buf.u16(centrais.length); buf.u16(centrais.length);
  buf.u32(tamanhoCentral);
  buf.u32(inicioCentral);
  buf.u16(0);                     // comentário

  return buf.blob("application/zip");
}
