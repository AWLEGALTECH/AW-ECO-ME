// list-drive-files
//
// Recebe { folder_id, mime_filter? }, retorna lista de arquivos da pasta
// (sem baixar binarios). Usado pelo Finder pra mostrar opcoes de arquivos
// pra analisar direto do Drive, sem o usuario precisar baixar pro HD.
//
// Secrets: GOOGLE_SA_JSON (mesmo do create-drive-folder)

import { create, getNumericDate, type Header, type Payload } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

interface ServiceAccount { client_email: string; private_key: string; token_uri?: string; }

async function parseSA(): Promise<ServiceAccount> {
  const raw = Deno.env.get("GOOGLE_SA_JSON");
  if (!raw) throw new Error("GOOGLE_SA_JSON nao configurado");
  return JSON.parse(raw);
}

async function importKey(pem: string): Promise<CryptoKey> {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return await crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

async function getToken(sa: ServiceAccount): Promise<string> {
  const key = await importKey(sa.private_key);
  const header: Header = { alg: "RS256", typ: "JWT" };
  const payload: Payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: getNumericDate(0),
    exp: getNumericDate(60 * 30),
  };
  const assertion = await create(header, payload, key);
  const r = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!r.ok) throw new Error(`token ${r.status}: ${await r.text()}`);
  return (await r.json()).access_token;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const folderId = body.folder_id as string | undefined;
    if (!folderId) return j({ error: "folder_id obrigatorio" }, 400);
    const mimeFilter = body.mime_filter as string[] | undefined;

    const sa = await parseSA();
    const token = await getToken(sa);

    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`);
    const fields = encodeURIComponent("files(id,name,mimeType,size,modifiedTime,iconLink,thumbnailLink)");
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=200&orderBy=name`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) {
      const t = await r.text();
      return j({ error: `Drive list ${r.status}: ${t}` }, 500);
    }
    const data = await r.json();
    let files = (data.files || []) as Array<{ id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; }>;
    if (mimeFilter && mimeFilter.length) {
      files = files.filter(f => mimeFilter.includes(f.mimeType));
    }
    return j({ ok: true, folder_id: folderId, total: files.length, files });
  } catch (e) {
    console.error("[list-drive-files]", e);
    return j({ error: String((e as Error)?.message || e) }, 500);
  }
});
