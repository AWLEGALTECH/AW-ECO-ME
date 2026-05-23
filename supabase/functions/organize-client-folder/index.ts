// organize-client-folder
//
// Recebe { pre_cliente_id }, classifica e renomeia os arquivos na pasta do
// Drive do pre_cliente via Gemini Vision, e move a pasta de PRE-CLIENTES
// pra CLIENTES EFETIVOS.
//
// Secrets necessarios:
//   - GOOGLE_SA_JSON                    (JSON do service account)
//   - GEMINI_API_KEY                    (chave Gemini pra classificar)
//   - DRIVE_CLIENTES_EFETIVOS_FOLDER_ID (ID da pasta destino "Clientes Efetivos")
//
// O SA precisa ter acesso de Editor a pasta-pai que contem PRE-CLIENTES
// e CLIENTES EFETIVOS (ja garantido pelo compartilhamento de "CLIENTES").

import { create, getNumericDate, type Header, type Payload } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

type Categoria = "rg" | "cnh" | "cpf" | "comprovante" | "contrato" | "procuracao" | "extrato" | "outro";

const NOMES_CANONICOS: Record<Exclude<Categoria, "outro">, string> = {
  rg: "RG",
  cnh: "CNH",
  cpf: "CPF",
  comprovante: "COMPROVANTE DE RESIDENCIA",
  contrato: "CONTRATO ASSINADO",
  procuracao: "PROCURACAO E DECLARACAO",
  extrato: "EXTRATO BANCARIO",
};

const PROMPT_GEMINI = `Voce e um classificador de documentos juridicos brasileiros.

Classifique este arquivo em UMA das categorias:
- rg: Carteira de Identidade (Registro Geral, qualquer estado)
- cnh: Carteira Nacional de Habilitacao
- cpf: Comprovante de Inscricao no CPF (Receita Federal)
- comprovante: Comprovante de residencia (conta de luz/agua/telefone, declaracao de residencia)
- contrato: Contrato de prestacao de servicos advocaticios
- procuracao: Procuracao ad judicia ou Declaracao de hipossuficiencia
- extrato: Extrato bancario (Bradesco, Itau, etc)
- outro: Nao se encaixa em nenhuma das anteriores

Importante:
- CPF da Receita Federal NAO e RG.
- Foto de RG mesmo borrada deve ser 'rg'.
- Conta de luz com nome do cliente e 'comprovante'.

Responda APENAS o nome da categoria, em minusculas, sem mais nada.`;

async function parseServiceAccount(): Promise<ServiceAccount> {
  const raw = Deno.env.get("GOOGLE_SA_JSON");
  if (!raw) throw new Error("GOOGLE_SA_JSON nao configurado");
  return JSON.parse(raw);
}

async function importSAKey(pem: string): Promise<CryptoKey> {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function obterAccessToken(sa: ServiceAccount): Promise<string> {
  const key = await importSAKey(sa.private_key);
  const header: Header = { alg: "RS256", typ: "JWT" };
  const payload: Payload = {
    iss: sa.client_email,
    // Scope full: precisa renomear/mover arquivos que o SA nao criou
    scope: "https://www.googleapis.com/auth/drive",
    aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: getNumericDate(0),
    exp: getNumericDate(60 * 30),
  };
  const assertion = await create(header, payload, key);
  const tokenResp = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!tokenResp.ok) {
    const t = await tokenResp.text();
    throw new Error(`Falha ao obter access_token: ${tokenResp.status} ${t}`);
  }
  const data = await tokenResp.json();
  return data.access_token as string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  parents?: string[];
}

async function listarArquivos(token: string, folderId: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`);
  const fields = encodeURIComponent("files(id,name,mimeType,size,parents)");
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!resp.ok) throw new Error(`list ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return data.files || [];
}

async function baixarArquivo(token: string, fileId: string): Promise<Uint8Array> {
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!resp.ok) throw new Error(`download ${resp.status}: ${await resp.text()}`);
  return new Uint8Array(await resp.arrayBuffer());
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunk pra evitar stack overflow em arquivos grandes
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

const MIMES_VISION_OK = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

async function classificarComGemini(
  apiKey: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<Categoria> {
  if (!MIMES_VISION_OK.has(mimeType)) return "outro";
  // Gemini inline limit ~20MB. Pra >15MB, ignora (vira "outro")
  if (bytes.length > 15 * 1024 * 1024) return "outro";

  const b64 = bytesToBase64(bytes);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const body = {
    contents: [{
      parts: [
        { text: PROMPT_GEMINI },
        { inline_data: { mime_type: mimeType, data: b64 } },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 20 },
  };
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.warn(`[gemini] ${resp.status}: ${t}`);
    return "outro";
  }
  const data = await resp.json();
  const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim().toLowerCase();
  // Aceita so categorias validas
  const validas: Categoria[] = ["rg", "cnh", "cpf", "comprovante", "contrato", "procuracao", "extrato", "outro"];
  return (validas.find((c) => text.includes(c)) || "outro") as Categoria;
}

function extensaoDe(name: string, mimeType: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  if (m) return "." + m[1].toLowerCase();
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return "";
}

async function renomear(token: string, fileId: string, novoNome: string): Promise<void> {
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: novoNome }),
    },
  );
  if (!resp.ok) throw new Error(`rename ${resp.status}: ${await resp.text()}`);
}

async function moverPasta(
  token: string,
  folderId: string,
  novoPai: string,
  paiAtual: string,
): Promise<void> {
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}?addParents=${novoPai}&removeParents=${paiAtual}&supportsAllDrives=true&fields=id,parents`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    },
  );
  if (!resp.ok) throw new Error(`move ${resp.status}: ${await resp.text()}`);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const preClienteId = body.pre_cliente_id as string | undefined;
    if (!preClienteId) return jsonResponse({ error: "pre_cliente_id obrigatorio" }, 400);

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) return jsonResponse({ error: "GEMINI_API_KEY nao configurado" }, 500);

    const destFolderId = Deno.env.get("DRIVE_CLIENTES_EFETIVOS_FOLDER_ID");
    if (!destFolderId) return jsonResponse({ error: "DRIVE_CLIENTES_EFETIVOS_FOLDER_ID nao configurado" }, 500);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: pre, error: preErr } = await sb
      .from("pre_clientes")
      .select("id, nome, drive_folder_id, drive_folder_url")
      .eq("id", preClienteId)
      .single();
    if (preErr || !pre) return jsonResponse({ error: "pre_cliente nao encontrado", details: preErr?.message }, 404);
    if (!pre.drive_folder_id) return jsonResponse({ error: "pre_cliente sem drive_folder_id" }, 400);

    const sa = await parseServiceAccount();
    const token = await obterAccessToken(sa);

    // 1. Lista arquivos da pasta
    const arquivos = await listarArquivos(token, pre.drive_folder_id);
    console.log(`[organize] ${arquivos.length} arquivos em ${pre.drive_folder_id}`);

    // 2. Classifica + renomeia cada um
    const usados: Record<string, number> = {};
    const renames: Array<{ id: string; de: string; para: string; categoria: Categoria }> = [];

    for (const arq of arquivos) {
      try {
        const bytes = await baixarArquivo(token, arq.id);
        const cat = await classificarComGemini(geminiKey, bytes, arq.mimeType);
        if (cat === "outro") {
          renames.push({ id: arq.id, de: arq.name, para: arq.name, categoria: "outro" });
          continue;
        }
        const base = NOMES_CANONICOS[cat];
        const ext = extensaoDe(arq.name, arq.mimeType);
        usados[base] = (usados[base] || 0) + 1;
        const sufixo = usados[base] > 1 ? ` (${usados[base]})` : "";
        const novoNome = `${base}${sufixo}${ext}`;
        if (novoNome !== arq.name) {
          await renomear(token, arq.id, novoNome);
        }
        renames.push({ id: arq.id, de: arq.name, para: novoNome, categoria: cat });
      } catch (e) {
        console.warn(`[organize] erro arquivo ${arq.name}:`, e);
        renames.push({ id: arq.id, de: arq.name, para: arq.name, categoria: "outro" });
      }
    }

    // 3. Move a pasta de PRE-CLIENTES pra CLIENTES EFETIVOS
    // Precisa do pai atual: pega via files.get
    const folderInfoResp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${pre.drive_folder_id}?fields=parents,webViewLink&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!folderInfoResp.ok) {
      throw new Error(`folder info ${folderInfoResp.status}: ${await folderInfoResp.text()}`);
    }
    const folderInfo = await folderInfoResp.json();
    const paiAtual = (folderInfo.parents || [])[0];

    if (paiAtual && paiAtual !== destFolderId) {
      await moverPasta(token, pre.drive_folder_id, destFolderId, paiAtual);
    }

    return jsonResponse({
      ok: true,
      total_arquivos: arquivos.length,
      renames,
      folder_movido: paiAtual !== destFolderId,
      folder_url: folderInfo.webViewLink,
    });
  } catch (e) {
    console.error("[organize-client-folder] erro", e);
    return jsonResponse({ error: String((e as Error)?.message || e) }, 500);
  }
});
