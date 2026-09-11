// diag-doc — o que tem dentro do documento que o lead mandou.
//
// A pergunta que decide o projeto de raspagem: os PDFs que chegam pelo WhatsApp
// têm CAMADA DE TEXTO ou são foto dentro de um PDF?
//
//   com texto  -> um parser lê tudo, de graça, em milissegundos e sem errar
//   só imagem  -> precisa de OCR ou modelo de visão, que custa e erra
//
// Ninguém responde isso de fora: o nome do arquivo é um uuid e o mime é
// `application/pdf` nos dois casos. Esta função abre o arquivo e conta o que há.
//
//   POST { conversa_id }  -> um resumo por anexo daquela conversa
//
// Somente leitura. Não grava nada, não manda nada para fora.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/* Um PDF é texto ASCII com streams binários no meio. Estas marcas dizem, sem
   interpretar o arquivo, com que tipo de PDF estamos lidando. */
function radiografia(bytes: Uint8Array) {
  // `latin1` porque só interessam as marcas ASCII; o binário vira lixo inofensivo.
  const cru = new TextDecoder("latin1").decode(bytes);
  const quantos = (re: RegExp) => (cru.match(re) ?? []).length;

  const fontes = quantos(/\/(BaseFont|FontFile|FontFile2|FontFile3)/g);
  const imagens = quantos(/\/Subtype\s*\/Image/g);
  const desenhaTexto = quantos(/\bT[Jj]\b/g);
  const jpegDentro = quantos(/\/DCTDecode/g);
  const comprimido = quantos(/\/FlateDecode/g);

  /* O VEREDITO. Fonte declarada e operador de desenhar texto é o que separa um
     PDF gerado por sistema (extrato de banco, contracheque) de uma foto que
     alguém salvou como PDF pelo próprio celular. */
  const temTexto = fontes > 0 && desenhaTexto > 0;
  return {
    fontes, imagens, operadores_de_texto: desenhaTexto,
    jpeg_dentro: jpegDentro, streams_comprimidos: comprimido,
    paginas: quantos(/\/Type\s*\/Page[^s]/g),
    veredito: temTexto
      ? (imagens > 0 ? "texto + imagem (parser lê o texto)" : "texto puro (parser lê tudo)")
      : imagens > 0 ? "SÓ IMAGEM (precisa de OCR ou visão)" : "não reconheci",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  try {
    const { conversa_id, limite = 20 } = await req.json().catch(() => ({}));
    if (!conversa_id) return j({ error: "conversa_id e obrigatorio" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } });

    const { data: msgs, error } = await sb.from("wa_mensagens")
      .select("id, criada_em, direcao, tipo, midia_mime, midia_path")
      .eq("conversa_id", conversa_id)
      .not("midia_path", "is", null)
      .eq("direcao", "entrada")
      .order("criada_em")
      .limit(limite);
    if (error) return j({ error: error.message }, 500);

    const saida: unknown[] = [];
    for (const m of (msgs ?? []) as Record<string, string>[]) {
      const { data: blob, error: eDl } = await sb.storage.from("wa-midia").download(m.midia_path);
      if (eDl || !blob) { saida.push({ path: m.midia_path, erro: eDl?.message ?? "nao baixou" }); continue; }
      const bytes = new Uint8Array(await blob.arrayBuffer());

      if ((m.midia_mime || "").includes("pdf")) {
        const r = radiografia(bytes);
        /* Uma amostra do texto legível ajuda a reconhecer O QUE é o documento
           (extrato, comprovante, identidade) sem abrir cada um à mão. */
        const cru = new TextDecoder("latin1").decode(bytes.slice(0, 4000));
        const pistas = [...new Set(
          (cru.match(/[A-Za-zÀ-ÿ]{5,}/g) ?? []).filter((p) => !/^(obj|endobj|stream|Filter|Decode|Length|Type|Page|Font|Contents|MediaBox|Resources|Parent|Kids|Catalog|Producer|Creator|CreationDate|ModDate|Metadata|XObject|Group|Transparency|DeviceRGB|ColorSpace|Interpolate|BitsPerComponent|Width|Height|Subtype|Image|FlateDecode|DCTDecode|Linearized)$/i.test(p)),
        )].slice(0, 12);
        saida.push({ quando: m.criada_em, tamanho: bytes.length, tipo: "pdf", ...r, pistas });
      } else {
        saida.push({
          quando: m.criada_em, tamanho: bytes.length, tipo: m.tipo,
          mime: m.midia_mime,
          veredito: "IMAGEM (precisa de OCR ou visão)",
        });
      }
    }
    return j({ conversa_id, anexos: saida.length, detalhe: saida });
  } catch (e) {
    return j({ error: String((e as Error)?.message || e) }, 500);
  }
});
