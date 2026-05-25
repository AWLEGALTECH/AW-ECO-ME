// upload-to-client-folder
//
// Recebe multipart FormData: { client_id, peca_name, file }
// Sobe o arquivo no Drive do cliente DENTRO de uma subpasta nova com nome
// "[peca_name] - [client_name]". Usado pelo writer ao finalizar a peca —
// substitui o fluxo manual de baixar -> subir -> colar URL.
//
// Secrets necessarios: GOOGLE_SA_JSON

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

async function uploadFile(token: string, name: string, mimeType: string, blob: Blob, parentId: string): Promise<{ id: string; webViewLink: string }> {
  const metadata = JSON.stringify({ name, parents: [parentId] });
  const boundary = "boundary-" + crypto.randomUUID();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const encoder = new TextEncoder();
  const head = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const tail = encoder.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);

  const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: {
      "Content-Type": `multipart/related; boundary=${boundary}`,
      Authorization: `Bearer ${token}`,
    },
    body,
  });
  if (!r.ok) throw new Error(`upload ${r.status}: ${await r.text()}`);
  return await r.json();
}

function sanitize(s: string): string {
  // Remove caracteres problematicos pra nome de pasta no Drive
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
    const form = await req.formData();
    const clienteId = form.get("client_id") as string | null;
    const pecaName = form.get("peca_name") as string | null;
    const file = form.get("file") as File | null;
    if (!clienteId || !pecaName || !file) {
      return j({ error: "client_id, peca_name e file sao obrigatorios" }, 400);
    }

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

    const fileName = (file as any).name || `${sanitize(pecaName)}.docx`;
    const mimeType = (file as any).type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const uploaded = await uploadFile(token, fileName, mimeType, file, subfolder.id);

    return j({
      ok: true,
      folder_id: subfolder.id,
      folder_url: subfolder.webViewLink,
      file_id: uploaded.id,
      file_url: uploaded.webViewLink,
      cliente_nome: cli.nome,
    });
  } catch (e) {
    console.error("[upload-to-client-folder]", e);
    return j({ error: String((e as Error)?.message || e) }, 500);
  }
});
