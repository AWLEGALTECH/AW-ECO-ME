// diag-extrato (DIAGNÓSTICO, pode ser apagada)
//
// Baixa um PDF do Drive pela conta de serviço (mesma credencial do
// fetch-drive-file) e devolve o binário em base64 dentro de um JSON, para
// poder ser lido de dentro do banco (pg_net só guarda texto). Serve para
// conferir o que o extrato original diz quando o mapeamento sai errado.
//
// Secrets: GOOGLE_SA_JSON

import { create, getNumericDate, type Header, type Payload } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

interface ServiceAccount { client_email: string; private_key: string; token_uri?: string; }

async function importKey(pem: string): Promise<CryptoKey> {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
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

function b64(bytes: Uint8Array): string {
  let s = "";
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) s += String.fromCharCode(...bytes.subarray(i, i + passo));
  return btoa(s);
}

const j = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const fileId = body.file_id as string | undefined;
    if (!fileId) return j({ error: "file_id obrigatorio" }, 400);
    const raw = Deno.env.get("GOOGLE_SA_JSON");
    if (!raw) return j({ error: "GOOGLE_SA_JSON nao configurado" }, 500);
    const token = await getToken(JSON.parse(raw));
    const metaR = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
    if (!metaR.ok) return j({ error: `meta ${metaR.status}: ${await metaR.text()}` }, 500);
    const meta = await metaR.json();
    const dlR = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
    if (!dlR.ok) return j({ error: `download ${dlR.status}: ${await dlR.text()}` }, 500);
    const bytes = new Uint8Array(await dlR.arrayBuffer());
    return j({ name: meta.name, mime: meta.mimeType, size: bytes.length, base64: b64(bytes) });
  } catch (e) {
    return j({ error: String((e as Error)?.message || e) }, 500);
  }
});
