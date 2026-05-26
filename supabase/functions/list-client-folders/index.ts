// list-client-folders
//
// Faz BFS de subpastas dentro de DRIVE_CLIENTES_FOLDER_ID, ate 2 niveis
// de profundidade. Retorna { root_folder_id, tree }.
//
// Usado pra mapear clientes -> drive_folder_url em lote.
//
// Secrets: GOOGLE_SA_JSON, DRIVE_CLIENTES_FOLDER_ID

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

interface Folder { id: string; name: string; webViewLink?: string; children?: Folder[]; }

async function listSubfolders(token: string, parentId: string): Promise<Folder[]> {
  const q = encodeURIComponent(`'${parentId}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`);
  const fields = encodeURIComponent("nextPageToken,files(id,name,webViewLink)");
  const out: Folder[] = [];
  let pageToken: string | undefined;
  do {
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`drive list ${r.status}: ${await r.text()}`);
    const data = await r.json();
    for (const f of (data.files || [])) out.push({ id: f.id, name: f.name, webViewLink: f.webViewLink });
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
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
  try {
    const body = await req.json().catch(() => ({}));
    const rootOverride = body.root_folder_id as string | undefined;
    const rootId = rootOverride || Deno.env.get("DRIVE_CLIENTES_FOLDER_ID");
    if (!rootId) return j({ error: "root folder id ausente" }, 400);

    const depth = Math.max(1, Math.min(3, Number(body.depth || 2)));

    const sa = await parseSA();
    const token = await getToken(sa);

    const level1 = await listSubfolders(token, rootId);
    if (depth >= 2) {
      // BFS nivel 2 — paralelizado
      await Promise.all(level1.map(async f => {
        f.children = await listSubfolders(token, f.id);
      }));
    }
    return j({
      ok: true,
      root_folder_id: rootId,
      level1_count: level1.length,
      total_folders: level1.reduce((s, f) => s + 1 + (f.children?.length || 0), 0),
      tree: level1,
    });
  } catch (e) {
    console.error("[list-client-folders]", e);
    return j({ error: String((e as Error)?.message || e) }, 500);
  }
});
