// fetch-drive-file
//
// Recebe { file_id }, baixa o arquivo do Drive via SA e retorna binario
// (stream). Usado pelo Finder pra pegar PDFs direto do Drive sem o user
// precisar baixar pro HD.
//
// Secrets: GOOGLE_SA_JSON

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const fileId = body.file_id as string | undefined;
    if (!fileId) {
      return new Response(JSON.stringify({ error: "file_id obrigatorio" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const sa = await parseSA();
    const token = await getToken(sa);

    // 1. Pega metadados pra saber nome + mime
    const metaR = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!metaR.ok) {
      return new Response(JSON.stringify({ error: `meta ${metaR.status}: ${await metaR.text()}` }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    const meta = await metaR.json();

    // 2. Baixa o binario (stream)
    const dlR = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!dlR.ok) {
      return new Response(JSON.stringify({ error: `download ${dlR.status}: ${await dlR.text()}` }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(dlR.body, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": meta.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(meta.name || fileId)}"`,
        "X-File-Name": encodeURIComponent(meta.name || fileId),
        "X-File-Mime": meta.mimeType || "application/octet-stream",
      },
    });
  } catch (e) {
    console.error("[fetch-drive-file]", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
