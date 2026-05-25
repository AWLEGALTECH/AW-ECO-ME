// create-peca-subfolder
//
// Variante leve do upload-to-client-folder. Como Service Accounts nao tem
// quota de armazenamento (limitacao do Google), nao podemos subir o
// binario pelo SA. Mas o SA PODE criar pastas (metadado puro, sem quota).
//
// Recebe { client_id, peca_name } e cria a subpasta
// "[peca_name] - [client_name]" dentro da pasta do cliente. Retorna a URL
// pra que o frontend abra em nova aba e o usuario arraste manualmente o
// .docx baixado.
//
// Secrets: GOOGLE_SA_JSON

import { create, getNumericDate, type Header, type Payload } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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
    scope: "https://www.googleapis.com/auth/drive",
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

async function createSubfolder(token: string, name: string, parentId: string): Promise<{ id: string; webViewLink: string }> {
  const r = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (!r.ok) throw new Error(`createSubfolder ${r.status}: ${await r.text()}`);
  return await r.json();
}

function sanitize(s: string): string {
  return (s || "").replace(/[\\/:*?"<>|]/g, "").trim();
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
    const clienteId = body.client_id as string | undefined;
    const pecaName = body.peca_name as string | undefined;
    if (!clienteId || !pecaName) return j({ error: "client_id e peca_name sao obrigatorios" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: cli, error: cliErr } = await sb
      .from("clientes")
      .select("nome, drive_folder_url")
      .eq("id", clienteId)
      .single();
    if (cliErr || !cli) return j({ error: "cliente nao encontrado", details: cliErr?.message }, 404);

    const url = (cli as any).drive_folder_url || "";
    const m = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (!m) return j({ error: "cliente sem drive_folder_url valido" }, 400);
    const parentFolderId = m[1];

    const sa = await parseSA();
    const token = await getToken(sa);

    const pasta = sanitize(`${pecaName} - ${cli.nome}`);
    const subfolder = await createSubfolder(token, pasta, parentFolderId);

    return j({
      ok: true,
      folder_id: subfolder.id,
      folder_url: subfolder.webViewLink,
      folder_name: pasta,
      cliente_nome: cli.nome,
    });
  } catch (e) {
    console.error("[create-peca-subfolder]", e);
    return j({ error: String((e as Error)?.message || e) }, 500);
  }
});
