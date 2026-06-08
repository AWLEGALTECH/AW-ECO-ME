// move-drive-folder
//
// Move uma pasta do Google Drive para um novo pai (default: pasta-pai dos
// clientes oficiais, DRIVE_CLIENTES_FOLDER_ID). Usado pra corrigir pastas
// que ficaram na pasta PRE-CLIENTES depois que o pre-cliente virou cliente.
//
// Body: { folder_id: string, destino_parent_id?: string }
// Reaproveita a mesma auth via service account (GOOGLE_SA_JSON) das demais
// edge functions de Drive.

import { create, getNumericDate, type Header, type Payload } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function parseServiceAccount(): ServiceAccount {
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

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const folderId = body.folder_id as string | undefined;
    const destino = (body.destino_parent_id as string | undefined) || Deno.env.get("DRIVE_CLIENTES_FOLDER_ID");

    if (!folderId) return json({ error: "folder_id obrigatorio" }, 400);
    if (!destino) return json({ error: "destino_parent_id ausente e DRIVE_CLIENTES_FOLDER_ID nao configurado" }, 400);

    const sa = parseServiceAccount();
    const accessToken = await obterAccessToken(sa);

    // 1. pega os pais atuais da pasta
    const metaResp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,parents&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!metaResp.ok) {
      const t = await metaResp.text();
      return json({ error: `nao consegui ler a pasta: ${metaResp.status} ${t}`, folder_id: folderId }, 502);
    }
    const meta = await metaResp.json();
    const parentsAtuais: string[] = meta.parents || [];

    // modo inspeção: só retorna metadados (id, nome, pais), não move
    if (body.inspect) {
      return json({ ok: true, inspect: true, folder_id: folderId, name: meta.name, parents: parentsAtuais });
    }

    // ja esta no destino e so nele? nada a fazer
    if (parentsAtuais.length === 1 && parentsAtuais[0] === destino) {
      return json({ ok: true, skipped: "ja_no_destino", folder_id: folderId, name: meta.name, parent: destino });
    }

    // 2. move: adiciona o destino, remove os pais antigos
    const removeParents = parentsAtuais.join(",");
    const moveResp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?addParents=${encodeURIComponent(destino)}` +
      `&removeParents=${encodeURIComponent(removeParents)}&supportsAllDrives=true&fields=id,name,parents`,
      { method: "PATCH", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: "{}" },
    );
    if (!moveResp.ok) {
      const t = await moveResp.text();
      return json({ error: `falha ao mover: ${moveResp.status} ${t}`, folder_id: folderId }, 502);
    }
    const moved = await moveResp.json();
    return json({ ok: true, folder_id: folderId, name: moved.name, de: parentsAtuais, para: moved.parents });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
