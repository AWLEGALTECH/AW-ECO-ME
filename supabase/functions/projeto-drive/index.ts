// projeto-drive
//
// Explorador de arquivos do projeto sobre o Google Drive. Uma função só, com
// ações, porque todas compartilham o mesmo custo caro: montar o JWT da service
// account e trocar por access token.
//
// Ações:
//   listar        { folder_id }                  -> pastas e arquivos daquele nível
//   criar_subpasta{ parent_id, nome }            -> cria subpasta
//   upload        multipart: parent_id, arquivo  -> manda arquivo pro Drive
//   renomear      { file_id, nome }              -> renomeia pasta ou arquivo
//   mover         { file_ids[], destino_id }     -> move arquivos entre pastas
//   criar_raiz    { projeto_id }                 -> cria a pasta do projeto e grava nele
//   vincular      { projeto_id, folder_url }     -> aponta pra uma pasta que já existe
//   definir_raiz  { folder_url }                 -> troca onde ficam todos os projetos
//   raiz          {}                             -> lê a raiz configurada
//
// Secrets: GOOGLE_SA_JSON (mesmo das demais). A raiz dos projetos se cria
// sozinha (PROJETOS - AW, ao lado das pastas de cliente) e fica guardada em
// app_config.drive_projetos_folder_id; o secret DRIVE_PROJETOS_FOLDER_ID
// ainda é aceito e tem precedência.

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

const CHAVE_RAIZ = "drive_projetos_folder_id";
const NOME_RAIZ = "PROJETOS - AW";

// O secret vence, se existir; senão vale o que já foi guardado.
async function lerRaiz(sb: any): Promise<string | null> {
  const env = Deno.env.get("DRIVE_PROJETOS_FOLDER_ID");
  if (env) return env;
  const { data } = await sb.from("app_config").select("valor").eq("chave", CHAVE_RAIZ).maybeSingle();
  return data?.valor || null;
}

async function drive(token: string, url: string, init?: RequestInit) {
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!r.ok) throw new Error(`Drive ${r.status}: ${await r.text()}`);
  return await r.json();
}

// A raiz se cria sozinha, como as pastas de pré-cliente. Ninguém devia ter que
// colar link nenhum pra começar a usar o módulo.
//
// Onde criar: ao lado das pastas de cliente, que é a parte do Drive que a
// service account comprovadamente administra. Se ela não puder escrever no
// nível de cima, cria dentro da própria pasta de clientes: pior lugar, mas
// funcionando. Procura antes de criar, senão duas chamadas simultâneas
// deixariam duas pastas com o mesmo nome.
async function garantirRaiz(sb: any, token: string): Promise<string> {
  const jaTem = await lerRaiz(sb);
  if (jaTem) return jaTem;

  const clientes = Deno.env.get("DRIVE_CLIENTES_FOLDER_ID")
    || Deno.env.get("DRIVE_PRE_CLIENTES_FOLDER_ID")
    || Deno.env.get("DRIVE_CLIENTES_EFETIVOS_FOLDER_ID");
  if (!clientes) throw new Error("sem_referencia");

  const candidatos: string[] = [];
  try {
    const meta = await drive(token, `${API}/${clientes}?fields=id,parents&${EXTRA}`);
    for (const p of (meta.parents || [])) candidatos.push(p);
  } catch { /* sem acesso ao nível de cima: sobra a própria pasta */ }
  candidatos.push(clientes);

  for (const pai of candidatos) {
    try {
      const q = encodeURIComponent(
        `'${pai}' in parents and name = '${NOME_RAIZ}' and mimeType = '${PASTA}' and trashed = false`);
      const achou = await drive(token, `${API}?q=${q}&fields=files(id,name)&${EXTRA}&pageSize=1`);
      let id: string | undefined = achou.files?.[0]?.id;
      if (!id) {
        const nova = await drive(token, `${API}?${EXTRA}&fields=id,name,webViewLink`, {
          method: "POST",
          body: JSON.stringify({ name: NOME_RAIZ, mimeType: PASTA, parents: [pai] }),
        });
        id = nova.id;
      }
      await sb.from("app_config").upsert({
        chave: CHAVE_RAIZ, valor: id, rotulo: NOME_RAIZ, atualizado_em: new Date().toISOString(),
      }, { onConflict: "chave" });
      return id!;
    } catch { /* esse pai não aceita: tenta o próximo */ }
  }
  throw new Error("sem_permissao");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  try {
    // Upload chega como multipart, o resto como JSON. Ler o corpo errado
    // consome o stream e não dá segunda chance, então decide pelo content-type.
    const multipart = (req.headers.get("content-type") || "").includes("multipart/form-data");
    const form = multipart ? await req.formData() : null;
    const body: any = form
      ? { acao: String(form.get("acao") || ""), parent_id: String(form.get("parent_id") || "") }
      : await req.json().catch(() => ({} as any));

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
      // Nome da pasta atual, pro cabeçalho e o caminho de volta. driveId diz
      // se estamos numa unidade compartilhada, o que decide se a service
      // account pode ou não subir arquivo aqui.
      const meta = await drive(token,
        `${API}/${folderId}?fields=id,name,parents,webViewLink,driveId&${EXTRA}`);

      return j({
        ok: true,
        pasta: {
          id: meta.id, nome: meta.name, url: meta.webViewLink,
          pai: (meta.parents || [])[0] || null,
          drive_id: meta.driveId || null,
        },
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

    // ── UPLOAD ───────────────────────────────────────────────────────────
    // Multipart montado na mão: a API de upload do Drive quer metadados e
    // bytes no mesmo corpo, e o Blob evita carregar o arquivo em memória
    // como string.
    if (acao === "upload") {
      const parentId = body.parent_id as string;
      const arquivo = form?.get("arquivo");
      if (!parentId || !(arquivo instanceof File)) {
        return j({ error: "parent_id e arquivo obrigatorios" }, 400);
      }

      const linha = `aw${crypto.randomUUID().replace(/-/g, "")}`;
      const meta = JSON.stringify({ name: arquivo.name, parents: [parentId] });
      const corpo = new Blob([
        `--${linha}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
        `--${linha}\r\nContent-Type: ${arquivo.type || "application/octet-stream"}\r\n\r\n`,
        arquivo,
        `\r\n--${linha}--`,
      ]);

      const r = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart"
        + "&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": `multipart/related; boundary=${linha}`,
          },
          body: corpo,
        },
      );
      if (!r.ok) {
        const detalhe = await r.text();
        // Service account não tem cota de armazenamento própria: ela cria
        // pastas em qualquer lugar, mas só consegue gravar bytes dentro de
        // uma unidade compartilhada, onde o espaço é da organização.
        if (detalhe.includes("storage quota")) {
          return j({
            error: "O Drive não deixa esta conta guardar arquivos aqui",
            dica: `A pasta dos projetos precisa estar numa unidade compartilhada com ${sa.client_email} como Gerenciador de conteúdo.`,
            sem_cota: true,
            service_account: sa.client_email,
          }, 403);
        }
        return j({ error: `Não consegui enviar ${arquivo.name}`, dica: detalhe.slice(0, 200) }, 502);
      }
      return j({ ok: true, arquivo: await r.json() });
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

      // Só cai no pedido manual se nem a criação automática der certo.
      let raiz: string;
      try {
        raiz = await garantirRaiz(sb, token);
      } catch {
        return j({
          error: `Não consegui criar a pasta ${NOME_RAIZ} sozinho`,
          dica: "Cole o link da pasta do Drive que vai guardar os projetos.",
          precisa_raiz: true,
          service_account: sa.client_email,
        }, 400);
      }

      let nova: any;
      try {
        nova = await drive(token, `${API}?${EXTRA}&fields=id,name,webViewLink`, {
          method: "POST",
          body: JSON.stringify({ name: proj.nome || "Projeto", mimeType: PASTA, parents: [raiz] }),
        });
      } catch {
        return j({
          error: "Não consegui criar a pasta dentro da raiz dos projetos",
          dica: `Compartilhe a pasta raiz com ${sa.client_email} como Editor, ou defina outra raiz.`,
          precisa_raiz: true,
          service_account: sa.client_email,
        }, 403);
      }
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

    // ── ONDE FICAM TODOS OS PROJETOS ─────────────────────────────────────
    // Normalmente automática. Isso aqui é pra trocar de lugar, ou pro caso
    // raro de a service account não poder criar sozinha. Confere o acesso
    // antes de gravar, porque uma raiz que ela não enxerga só falharia no
    // projeto seguinte, longe de onde o erro foi cometido.
    if (acao === "definir_raiz") {
      const id = extrairFolderId(String(body.folder_url || ""));
      if (!id) return j({ error: "Cole um link válido de pasta do Drive" }, 400);

      let meta: any;
      try {
        meta = await drive(token, `${API}/${id}?fields=id,name,mimeType,webViewLink&${EXTRA}`);
      } catch {
        return j({
          error: "Não consegui abrir essa pasta",
          dica: `Compartilhe a pasta com ${sa.client_email} como Editor e tente de novo.`,
          service_account: sa.client_email,
        }, 403);
      }
      if (meta.mimeType !== PASTA) return j({ error: "O link precisa ser de uma pasta, não de um arquivo" }, 400);

      await sb.from("app_config").upsert({
        chave: CHAVE_RAIZ,
        valor: meta.id,
        rotulo: meta.name,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: "chave" });

      return j({ ok: true, folder_id: meta.id, nome: meta.name, url: meta.webViewLink });
    }

    if (acao === "raiz") {
      const raiz = await lerRaiz(sb);
      return j({ ok: true, folder_id: raiz, service_account: sa.client_email });
    }

    return j({ error: `acao desconhecida: ${acao}` }, 400);
  } catch (e) {
    console.error("[projeto-drive]", e);
    return j({ error: String((e as Error)?.message || e) }, 500);
  }
});
