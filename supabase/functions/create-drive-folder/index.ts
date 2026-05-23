// create-drive-folder
//
// Recebe { pre_cliente_id, override_nome?, parent_folder_id? }, cria uma pasta
// no Google Drive dentro da pasta-pai dos pre-clientes (definida em env), e
// atualiza a linha de pre_clientes com drive_folder_id + drive_folder_url.
//
// Secrets necessarios (configure via Supabase dashboard > Edge Functions > Secrets):
//   - GOOGLE_SA_JSON               (JSON completo do service account)
//   - DRIVE_PRE_CLIENTES_FOLDER_ID (ID da pasta-pai onde criar subpastas)
//
// Pre-requisitos no Google:
//   1. Criar service account no Google Cloud
//   2. Habilitar Drive API no projeto
//   3. Compartilhar a pasta-pai "Pre-clientes" com o email do SA (permissao Editor)

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

// Importa a chave privada PKCS#8 PEM do SA pra um CryptoKey RS256
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
    exp: getNumericDate(60 * 30), // 30 min
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
    const preClienteId = body.pre_cliente_id as string | undefined;
    const overrideNome = body.override_nome as string | undefined;
    const overrideParent = body.parent_folder_id as string | undefined;

    if (!preClienteId) {
      return new Response(JSON.stringify({ error: "pre_cliente_id obrigatorio" }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    // Carrega o pre_cliente — usa service role pra contornar RLS
    const { data: pre, error: preErr } = await sb
      .from("pre_clientes")
      .select("id, nome, drive_folder_id, drive_folder_url")
      .eq("id", preClienteId)
      .single();
    if (preErr || !pre) {
      return new Response(JSON.stringify({ error: "pre_cliente nao encontrado", details: preErr?.message }), {
        status: 404,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    // Idempotencia: ja tem pasta? retorna a existente
    if (pre.drive_folder_id && pre.drive_folder_url) {
      return new Response(JSON.stringify({
        ok: true,
        already_existed: true,
        folder_id: pre.drive_folder_id,
        folder_url: pre.drive_folder_url,
      }), { headers: { ...corsHeaders(), "Content-Type": "application/json" } });
    }

    const parentId = overrideParent || Deno.env.get("DRIVE_PRE_CLIENTES_FOLDER_ID");
    if (!parentId) {
      return new Response(JSON.stringify({ error: "DRIVE_PRE_CLIENTES_FOLDER_ID nao configurado" }), {
        status: 500,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    const sa = await parseServiceAccount();
    const accessToken = await obterAccessToken(sa);

    const nome = overrideNome || pre.nome || "Pre-cliente sem nome";
    const pasta = await criarPastaDrive(accessToken, nome, parentId);

    // Atualiza o pre_cliente com os dados da pasta
    const { error: updErr } = await sb
      .from("pre_clientes")
      .update({ drive_folder_id: pasta.id, drive_folder_url: pasta.webViewLink })
      .eq("id", preClienteId);
    if (updErr) {
      console.error("[create-drive-folder] erro update", updErr);
      // pasta foi criada mas n conseguimos salvar — retorna a info pra o caller
    }

    return new Response(JSON.stringify({
      ok: true,
      folder_id: pasta.id,
      folder_url: pasta.webViewLink,
    }), { headers: { ...corsHeaders(), "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[create-drive-folder] erro", e);
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
});
