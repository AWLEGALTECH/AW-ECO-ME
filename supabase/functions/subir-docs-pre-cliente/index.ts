// subir-docs-pre-cliente
//
// Sobe anexos da conversa do WhatsApp para a pasta do Drive do PRÉ-CLIENTE,
// dentro de uma subpasta "Documentos do cliente".
//
// O QUE ELA RECEBE SÃO CAMINHOS, NÃO ARQUIVOS: os anexos já estão no nosso
// storage (bucket `wa-midia`), e mandar o conteúdo de volta pela requisição
// seria trafegar duas vezes o mesmo PDF, com base64 inchando 33% no caminho.
// A função baixa do storage com a service role e empurra pro Drive.
//
//   POST { pre_cliente_id, arquivos: [{ path, nome, mime }] }
//   -> { ok, folder_url, subidos: [{ nome, file_url }], falhas: [{ nome, erro }] }
//
// Uma falha isolada NÃO derruba o lote: quem mandou cinco documentos e teve um
// problema no terceiro precisa saber qual foi, com os outros quatro já lá
// dentro. Refazer os cinco por causa de um seria pior.
//
// Secrets: GOOGLE_SA_JSON (a mesma conta de serviço das outras funções do Drive)

import { create, getNumericDate, type Header, type Payload } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const BUCKET = "wa-midia";
const SUBPASTA = "Documentos do cliente";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

interface ServiceAccount { client_email: string; private_key: string; token_uri?: string }

async function getToken(): Promise<string> {
  const raw = Deno.env.get("GOOGLE_SA_JSON");
  if (!raw) throw new Error("GOOGLE_SA_JSON nao configurado");
  const sa: ServiceAccount = JSON.parse(raw);
  const pem = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
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

/** A subpasta, reusada quando já existe: confirmar duas vezes não cria duas. */
async function acharOuCriarSubpasta(token: string, pai: string, nome: string): Promise<{ id: string; url: string }> {
  const q = encodeURIComponent(
    `'${pai}' in parents and name = '${nome.replace(/'/g, "\\'")}' ` +
    `and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const busca = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,webViewLink)`,
    { headers: { Authorization: `Bearer ${token}` } });
  if (busca.ok) {
    const achou = (await busca.json())?.files?.[0];
    if (achou?.id) return { id: achou.id, url: achou.webViewLink };
  }
  const r = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: nome, mimeType: "application/vnd.google-apps.folder", parents: [pai] }),
  });
  if (!r.ok) throw new Error(`criar subpasta ${r.status}: ${await r.text()}`);
  const nova = await r.json();
  return { id: nova.id, url: nova.webViewLink };
}

async function subir(token: string, nome: string, mime: string, bytes: Uint8Array, pai: string) {
  const boundary = "b-" + crypto.randomUUID();
  const enc = new TextEncoder();
  const meta = JSON.stringify({ name: nome, parents: [pai] });
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`);
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0); body.set(bytes, head.length); body.set(tail, head.length + bytes.length);

  const r = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink",
    { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}`, Authorization: `Bearer ${token}` }, body });
  if (!r.ok) throw new Error(`upload ${r.status}: ${await r.text()}`);
  return await r.json();
}

const limpo = (s: string) => (s || "").replace(/[\\/:*?"<>|]/g, "").trim();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  try {
    const { pre_cliente_id, arquivos } = await req.json().catch(() => ({}));
    if (!pre_cliente_id || !Array.isArray(arquivos) || arquivos.length === 0) {
      return j({ error: "pre_cliente_id e arquivos sao obrigatorios" }, 400);
    }
    if (arquivos.length > 30) return j({ error: "no maximo 30 arquivos por vez" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } });

    const { data: pre, error: ePre } = await sb
      .from("pre_clientes").select("nome, drive_folder_url").eq("id", pre_cliente_id).single();
    if (ePre || !pre) return j({ error: "pre-cliente nao encontrado", details: ePre?.message }, 404);

    const pastaId = String((pre as any).drive_folder_url || "").match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1];
    if (!pastaId) return j({ error: "pre-cliente sem pasta do Drive" }, 400);

    const token = await getToken();
    const sub = await acharOuCriarSubpasta(token, pastaId, SUBPASTA);

    const subidos: { nome: string; file_url: string }[] = [];
    const falhas: { nome: string; erro: string }[] = [];

    for (const a of arquivos) {
      const nome = limpo(String(a?.nome || "")) || "documento";
      try {
        if (!a?.path) throw new Error("sem caminho no storage");
        const { data: blob, error: eDl } = await sb.storage.from(BUCKET).download(String(a.path));
        if (eDl || !blob) throw new Error(eDl?.message || "nao consegui baixar do storage");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const enviado = await subir(token, nome, String(a?.mime || blob.type || "application/octet-stream"), bytes, sub.id);
        subidos.push({ nome, file_url: enviado.webViewLink });
      } catch (e) {
        console.error("[subir-docs-pre-cliente]", nome, (e as Error).message);
        falhas.push({ nome, erro: (e as Error).message });
      }
    }

    return j({ ok: falhas.length === 0, folder_url: sub.url, subidos, falhas });
  } catch (e) {
    console.error("[subir-docs-pre-cliente]", e);
    return j({ error: String((e as Error)?.message || e) }, 500);
  }
});
