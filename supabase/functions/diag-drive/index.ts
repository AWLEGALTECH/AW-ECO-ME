// diag-drive — o que o Google diz sobre a nossa pasta.
//
// Existe porque "não sobe arquivo no Drive" tem três causas possíveis e elas
// pedem correções diferentes (drive compartilhado, delegação, ou OAuth do
// usuário). Adivinhar custa uma rodada de conversa por tentativa. Esta função
// pergunta direto à API e devolve o que decide a escolha:
//
//   driveId presente  -> a pasta ESTÁ num drive compartilhado
//   driveId ausente   -> é My Drive de alguém, e conta de serviço não pode ser
//                        dona de bytes lá dentro
//   owners            -> de quem é a pasta (o domínio diz se é Workspace ou
//                        Gmail comum, e é isso que elimina uma das saídas)
//   impersonando      -> se GOOGLE_IMPERSONATE está posto e se o token saiu
//
//   POST { folder_id?, pre_cliente_id? }
//
// Somente leitura. Não cria, não move, não apaga nada.

import { create, getNumericDate, type Header, type Payload } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

interface SA { client_email: string; private_key: string; token_uri?: string }

async function token(comSub: boolean): Promise<string> {
  const sa: SA = JSON.parse(Deno.env.get("GOOGLE_SA_JSON")!);
  const pem = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const quem = (Deno.env.get("GOOGLE_IMPERSONATE") || "").trim();
  const header: Header = { alg: "RS256", typ: "JWT" };
  const payload: Payload = {
    iss: sa.client_email,
    ...(comSub && quem ? { sub: quem } : {}),
    scope: "https://www.googleapis.com/auth/drive",
    aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: getNumericDate(0),
    exp: getNumericDate(60 * 10),
  };
  const assertion = await create(header, payload, key);
  const r = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    let folderId: string | null = body?.folder_id ?? null;

    if (!folderId && body?.pre_cliente_id) {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { persistSession: false } });
      const { data } = await sb.from("pre_clientes")
        .select("drive_folder_url").eq("id", body.pre_cliente_id).single();
      folderId = String((data as any)?.drive_folder_url || "").match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] ?? null;
    }
    if (!folderId) folderId = Deno.env.get("DRIVE_PRE_CLIENTES_FOLDER_ID") ?? null;
    if (!folderId) return j({ error: "sem folder_id, pre_cliente_id ou DRIVE_PRE_CLIENTES_FOLDER_ID" }, 400);

    const sa: SA = JSON.parse(Deno.env.get("GOOGLE_SA_JSON")!);
    const quem = (Deno.env.get("GOOGLE_IMPERSONATE") || "").trim();

    // A delegação é testada à parte: sem ela configurada no admin, o próprio
    // pedido do token falha com `unauthorized_client`, e é esse o veredito.
    let delegacao = quem ? "nao testada" : "GOOGLE_IMPERSONATE nao esta posto";
    if (quem) {
      try { await token(true); delegacao = "funciona"; }
      catch (e) { delegacao = `falhou -> ${(e as Error).message}`; }
    }

    const t = await token(false);
    const campos = "id,name,driveId,mimeType,owners(emailAddress,displayName),capabilities(canAddChildren,canEdit),permissions(emailAddress,role)";
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true&fields=${encodeURIComponent(campos)}`,
      { headers: { Authorization: `Bearer ${t}` } });
    const info = await r.json();
    if (!r.ok) return j({ error: "drive recusou", status: r.status, detalhe: info }, 200);

    const emShared = !!info.driveId;
    return j({
      pasta: { id: info.id, nome: info.name },
      conta_de_servico: sa.client_email,
      em_drive_compartilhado: emShared,
      drive_id: info.driveId ?? null,
      donos: (info.owners ?? []).map((o: any) => o.emailAddress),
      pode_criar_dentro: info.capabilities?.canAddChildren ?? null,
      delegacao,
      veredito: emShared
        ? "A pasta esta num drive compartilhado: subir arquivo deveria funcionar."
        : "A pasta e My Drive de alguem. Conta de servico nao pode ser dona de bytes ai dentro: ou a pasta vai para um drive compartilhado, ou se liga a delegacao (GOOGLE_IMPERSONATE).",
    });
  } catch (e) {
    return j({ error: String((e as Error)?.message || e) }, 500);
  }
});
