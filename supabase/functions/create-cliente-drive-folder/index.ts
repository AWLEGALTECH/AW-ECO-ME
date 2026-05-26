// create-cliente-drive-folder
//
// Recebe { cliente_id, override_nome?, parent_folder_id? }, cria uma pasta
// no Google Drive dentro da pasta-pai dos clientes oficiais (DRIVE_CLIENTES_FOLDER_ID),
// e atualiza a linha de clientes com drive_folder_id + drive_folder_url.
//
// Versao da create-drive-folder dedicada pra tabela `clientes` (nao `pre_clientes`).
// Mesmo padrao de auth via service account e mesmas envs.

import { create, getNumericDate, type Header, type Payload } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

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
    scope: "https://www.googleapis.com/auth/drive.file",
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

async function criarPastaDrive(
  accessToken: string,
  nome: string,
  parentId: string,
): Promise<{ id: string; webViewLink: string }> {
  const resp = await fetch(
    "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name: nome,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    },
  );
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Drive API ${resp.status}: ${t}`);
  }
  return await resp.json();
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const clienteId = body.cliente_id as string | undefined;
    const overrideNome = body.override_nome as string | undefined;
    const overrideParent = body.parent_folder_id as string | undefined;

    if (!clienteId) {
      return new Response(JSON.stringify({ error: "cliente_id obrigatorio" }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const { data: cli, error: cliErr } = await sb
      .from("clientes")
      .select("id, nome, drive_folder_id, drive_folder_url")
      .eq("id", clienteId)
      .single();
    if (cliErr || !cli) {
      return new Response(JSON.stringify({ error: "cliente nao encontrado", details: cliErr?.message }), {
        status: 404,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Idempotencia
    if (cli.drive_folder_id && cli.drive_folder_url) {
      return new Response(JSON.stringify({
        ok: true,
        already_existed: true,
        folder_id: cli.drive_folder_id,
        folder_url: cli.drive_folder_url,
      }), { headers: { ...corsHeaders(), "Content-Type": "application/json" } });
    }

    const parentId = overrideParent || Deno.env.get("DRIVE_CLIENTES_FOLDER_ID");
    if (!parentId) {
      return new Response(JSON.stringify({ error: "DRIVE_CLIENTES_FOLDER_ID nao configurado" }), {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const sa = await parseServiceAccount();
    const accessToken = await obterAccessToken(sa);

    const nome = overrideNome || cli.nome || "Cliente sem nome";
    const pasta = await criarPastaDrive(accessToken, nome, parentId);

    const { error: updErr } = await sb
      .from("clientes")
      .update({ drive_folder_id: pasta.id, drive_folder_url: pasta.webViewLink })
      .eq("id", clienteId);
    if (updErr) {
      console.error("[create-cliente-drive-folder] erro update", updErr);
    }

    return new Response(JSON.stringify({
      ok: true,
      folder_id: pasta.id,
      folder_url: pasta.webViewLink,
    }), { headers: { ...corsHeaders(), "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[create-cliente-drive-folder] erro", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
});
