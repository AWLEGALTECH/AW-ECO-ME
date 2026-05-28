// fetch-drive-file v2 — cache de token + cryptokey + meta paralelo
//
// Otimizações vs v1:
//   1. CryptoKey importada uma vez por instancia (cache de módulo)
//   2. access_token cacheado 25min (Google da 30min) — elimina OAuth roundtrip
//   3. meta + download em paralelo (Promise.all)
//   4. Aceita 'name' no body pra pular meta fetch quando o caller ja sabe

import { create, getNumericDate, type Header, type Payload } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

interface SA { client_email: string; private_key: string; token_uri?: string; }

function parseSA(): SA {
  const raw = Deno.env.get("GOOGLE_SA_JSON");
  if (!raw) throw new Error("GOOGLE_SA_JSON nao configurado");
  return JSON.parse(raw);
}

// === CACHE EM MEMORIA (sobrevive entre requests da mesma instancia) ===
let cachedKey: CryptoKey | null = null;
let cachedSA: SA | null = null;
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getKey(sa: SA): Promise<CryptoKey> {
  if (cachedKey && cachedSA?.private_key === sa.private_key) return cachedKey;
  const b64 = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  cachedKey = await crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  cachedSA = sa;
  return cachedKey;
}

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const sa = parseSA();
  const key = await getKey(sa);
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
  const data = await r.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + 25 * 60 * 1000 };
  return data.access_token;
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
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));
    const fileId = body.file_id as string | undefined;
    const knownName = body.name as string | undefined;
    const knownMime = body.mime as string | undefined;
    if (!fileId) {
      return new Response(JSON.stringify({ error: "file_id obrigatorio" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    const token = await getToken();
    const tToken = Date.now();

    const needsMeta = !knownName || !knownMime;
    const metaPromise = needsMeta ? fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    ) : Promise.resolve(null as any);

    const dlPromise = fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const [metaR, dlR] = await Promise.all([metaPromise, dlPromise]);

    if (!dlR.ok) {
      return new Response(JSON.stringify({ error: `download ${dlR.status}: ${await dlR.text()}` }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    let name = knownName, mime = knownMime;
    if (metaR) {
      if (!metaR.ok) {
        return new Response(JSON.stringify({ error: `meta ${metaR.status}: ${await metaR.text()}` }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
      }
      const meta = await metaR.json();
      name = name || meta.name;
      mime = mime || meta.mimeType;
    }

    const tEnd = Date.now();
    return new Response(dlR.body, {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": mime || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(name || fileId)}"`,
        "X-File-Name": encodeURIComponent(name || fileId),
        "X-File-Mime": mime || "application/octet-stream",
        "X-Timing-Total-Ms": String(tEnd - t0),
        "X-Timing-Token-Ms": String(tToken - t0),
        "X-Cache-Token": cachedToken ? "hit" : "miss",
      },
    });
  } catch (e) {
    console.error("[fetch-drive-file]", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
