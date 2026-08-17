// projeto-drive
//
// Explorador de arquivos do projeto sobre o Google Drive. Uma função só, com
// ações, porque todas compartilham o mesmo custo caro: montar o JWT da service
// account e trocar por access token.
//
// Ações:
//   listar        { folder_id }                  -> pastas e arquivos daquele nível
//   criar_subpasta{ parent_id, nome }            -> cria subpasta
//   renomear      { file_id, nome }              -> renomeia pasta ou arquivo
//   mover         { file_ids[], destino_id }     -> move arquivos entre pastas
//   criar_raiz    { projeto_id }                 -> cria a pasta do projeto e grava nele
//   vincular      { projeto_id, folder_url }     -> aponta pra uma pasta que já existe
//
// Secrets: GOOGLE_SA_JSON (mesmo das demais), DRIVE_PROJETOS_FOLDER_ID (só
// necessário pra criar_raiz; vincular funciona sem ele).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { create, getNumericDate, type Header, type Payload } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

interface ServiceAccount { client_email: string; private_key: string; token_uri?: string }

async function parseSA(): Promise<ServiceAccount> {
  const raw = Deno.env.get("GOOGLE_SA_JSON");
  if (!raw) throw new Error("GOOGLE_SA_JSON nao configurado");
  return JSON.parse(raw);
}

async function importKey(pem: string): Promise<CryptoKey> {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey("pkcs8", der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

// Escopo completo: mover e renomear arquivo que a service account não criou
// exige mais que drive.file. Vale pro que estiver compartilhado com ela.
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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const PASTA = "application/vnd.google-apps.folder";
const API = "https://www.googleapis.com/drive/v3/files";
const EXTRA = "supportsAllDrives=true&includeItemsFromAllDrives=true";

// Aceita link completo do Drive ou o id cru.
function extrairFolderId(v: string): string | null {
  const s = (v || "").trim();
  if (!s) return null;
  const m = s.match(/\/folders\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

async function drive(token: string, url: string, init?: RequestInit) {
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!r.ok) throw new Error(`Drive ${r.status}: ${await r.text()}`);
  return await r.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({} as any));
    const acao = String(body.acao || "");
    if (!acao) return j({ error: "acao obrigatoria" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const sa = await parseSA();
    const token = await getToken(sa);

    // ── LISTAR ───────────────────────────────────────────────────────────
    if (acao === "listar") {
      const folderId = body.folder_id as string;
      if (!folderId) return j({ error: "folder_id obrigatorio" }, 400);

      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
      const fields = encodeURIComponent(
        "files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink)");
      const data = await drive(token,
        `${API}?q=${q}&fields=${fields}&${EXTRA}&pageSize=500&orderBy=folder,name`);

      const itens = (data.files || []) as any[];
      // Nome da pasta atual, pro cabeçalho e o caminho de volta.
      const meta = await drive(token,
        `${API}/${folderId}?fields=id,name,parents,webViewLink&${EXTRA}`);

      return j({
        ok: true,
        pasta: { id: meta.id, nome: meta.name, url: meta.webViewLink, pai: (meta.parents || [])[0] || null },
        pastas: itens.filter((f) => f.mimeType === PASTA),
        arquivos: itens.filter((f) => f.mimeType !== PASTA),
      });
    }

    // ── CRIAR SUBPASTA ───────────────────────────────────────────────────
    if (acao === "criar_subpasta") {
      const parentId = body.parent_id as string;
      const nome = String(body.nome || "").trim();
      if (!parentId || !nome) return j({ error: "parent_id e nome obrigatorios" }, 400);
      const nova = await drive(token, `${API}?${EXTRA}&fields=id,name,webViewLink`, {
        method: "POST",
        body: JSON.stringify({ name: nome, mimeType: PASTA, parents: [parentId] }),
      });
      return j({ ok: true, pasta: nova });
    }

    // ── RENOMEAR ─────────────────────────────────────────────────────────
    if (acao === "renomear") {
      const fileId = body.file_id as string;
      const nome = String(body.nome || "").trim();
      if (!fileId || !nome) return j({ error: "file_id e nome obrigatorios" }, 400);
      const upd = await drive(token, `${API}/${fileId}?${EXTRA}&fields=id,name`, {
        method: "PATCH",
        body: JSON.stringify({ name: nome }),
      });
      return j({ ok: true, item: upd });
    }

    // ── MOVER ────────────────────────────────────────────────────────────
    // O Drive move trocando `parents`: precisa saber de onde sai pra remover.
    if (acao === "mover") {
      const ids = (body.file_ids || []) as string[];
      const destino = body.destino_id as string;
      if (!ids.length || !destino) return j({ error: "file_ids e destino_id obrigatorios" }, 400);

      let movidos = 0;
      const erros: string[] = [];
      for (const id of ids) {
        try {
          const meta = await drive(token, `${API}/${id}?fields=id,parents&${EXTRA}`);
          const antigos = (meta.parents || []).join(",");
          await drive(token,
            `${API}/${id}?addParents=${destino}&removeParents=${encodeURIComponent(antigos)}&${EXTRA}&fields=id,parents`,
            { method: "PATCH", body: JSON.stringify({}) });
          movidos++;
        } catch (e) {
          erros.push(`${id}: ${String((e as Error)?.message || e)}`);
        }
      }
      return j({ ok: erros.length === 0, movidos, erros });
    }

    // ── CRIAR A PASTA RAIZ DO PROJETO ────────────────────────────────────
    if (acao === "criar_raiz") {
      const projetoId = body.projeto_id as string;
      if (!projetoId) return j({ error: "projeto_id obrigatorio" }, 400);

      const { data: proj } = await sb.from("projetos")
        .select("id, nome, drive_folder_id, drive_folder_url").eq("id", projetoId).single();
      if (!proj) return j({ error: "projeto nao encontrado" }, 404);
      if (proj.drive_folder_id) {
        return j({ ok: true, ja_existia: true, folder_id: proj.drive_folder_id, folder_url: proj.drive_folder_url });
      }

      const raiz = Deno.env.get("DRIVE_PROJETOS_FOLDER_ID");
      if (!raiz) {
        return j({
          error: "DRIVE_PROJETOS_FOLDER_ID nao configurado",
          dica: "Configure a raiz dos projetos ou use Vincular pasta existente, colando o link.",
        }, 400);
      }

      const nova = await drive(token, `${API}?${EXTRA}&fields=id,name,webViewLink`, {
        method: "POST",
        body: JSON.stringify({ name: proj.nome || "Projeto", mimeType: PASTA, parents: [raiz] }),
      });
      await sb.from("projetos")
        .update({ drive_folder_id: nova.id, drive_folder_url: nova.webViewLink })
        .eq("id", projetoId);
      return j({ ok: true, folder_id: nova.id, folder_url: nova.webViewLink });
    }

    // ── VINCULAR UMA PASTA QUE JÁ EXISTE ─────────────────────────────────
    if (acao === "vincular") {
      const projetoId = body.projeto_id as string;
      const id = extrairFolderId(String(body.folder_url || ""));
      if (!projetoId || !id) return j({ error: "projeto_id e link válido do Drive obrigatorios" }, 400);

      // Confere acesso antes de gravar: link certo mas sem permissão daria
      // uma barra lateral eternamente vazia, sem explicação.
      let meta: any;
      try {
        meta = await drive(token, `${API}/${id}?fields=id,name,mimeType,webViewLink&${EXTRA}`);
      } catch {
        return j({
          error: "Não consegui abrir essa pasta",
          dica: `Compartilhe a pasta com ${sa.client_email} como Editor e tente de novo.`,
        }, 403);
      }
      if (meta.mimeType !== PASTA) return j({ error: "O link precisa ser de uma pasta, não de um arquivo" }, 400);

      await sb.from("projetos")
        .update({ drive_folder_id: meta.id, drive_folder_url: meta.webViewLink })
        .eq("id", projetoId);
      return j({ ok: true, folder_id: meta.id, folder_url: meta.webViewLink, nome: meta.name });
    }

    return j({ error: `acao desconhecida: ${acao}` }, 400);
  } catch (e) {
    console.error("[projeto-drive]", e);
    return j({ error: String((e as Error)?.message || e) }, 500);
  }
});
