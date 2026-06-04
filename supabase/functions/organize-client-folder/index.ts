// organize-client-folder
//
// Recebe { pre_cliente_id }, classifica e renomeia os arquivos na pasta do
// Drive do pre_cliente via Gemini Vision, e move a pasta de PRE-CLIENTES
// pra CLIENTES EFETIVOS.
//
// Secrets necessarios:
//   - GOOGLE_SA_JSON                    (JSON do service account)
//   - GEMINI_API_KEY                    (chave Gemini pra classificar)
//   - DRIVE_CLIENTES_EFETIVOS_FOLDER_ID (ID da pasta destino "Clientes Efetivos")

import { create, getNumericDate, type Header, type Payload } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

type Categoria = "rg" | "cnh" | "cpf" | "comprovante" | "contrato" | "procuracao" | "extrato" | "outro";

const NOMES_CANONICOS: Record<Exclude<Categoria, "outro">, string> = {
  rg: "RG",
  cnh: "CNH",
  cpf: "CPF",
  comprovante: "COMPROVANTE DE RESIDENCIA",
  contrato: "CONTRATO ASSINADO",
  procuracao: "PROCURACAO E DECLARACAO",
  extrato: "EXTRATO BANCARIO",
};

const PROMPT_GEMINI = `Voce e um classificador de documentos juridicos brasileiros.

Classifique este arquivo em UMA das categorias:
- rg: Carteira de Identidade (Registro Geral, qualquer estado)
- cnh: Carteira Nacional de Habilitacao
- cpf: Comprovante de Inscricao no CPF (Receita Federal)
- comprovante: Comprovante de residencia (conta de luz/agua/telefone, declaracao de residencia)
- contrato: Contrato de prestacao de servicos advocaticios
- procuracao: Procuracao ad judicia ou Declaracao de hipossuficiencia
- extrato: Extrato bancario (Bradesco, Itau, etc)
- outro: Nao se encaixa em nenhuma das anteriores

Importante:
- CPF da Receita Federal NAO e RG.
- Foto de RG mesmo borrada deve ser 'rg'.
- Conta de luz com nome do cliente e 'comprovante'.

Responda APENAS o nome da categoria, em minusculas, sem acentos, sem mais nada.`;

async function parseServiceAccount(): Promise<ServiceAccount> {
  const raw = Deno.env.get("GOOGLE_SA_JSON");
  if (!raw) throw new Error("GOOGLE_SA_JSON nao configurado");
  return JSON.parse(raw);
}

async function importSAKey(pem: string): Promise<CryptoKey> {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
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
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!tokenResp.ok) throw new Error(`Falha ao obter access_token: ${tokenResp.status} ${await tokenResp.text()}`);
  return (await tokenResp.json()).access_token as string;
}

interface DriveFile { id: string; name: string; mimeType: string; size?: string; parents?: string[]; }

async function listarArquivos(token: string, folderId: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`);
  const fields = encodeURIComponent("files(id,name,mimeType,size,parents)");
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=100`, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`list ${resp.status}: ${await resp.text()}`);
  return (await resp.json()).files || [];
}

async function baixarArquivo(token: string, fileId: string): Promise<Uint8Array> {
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`download ${resp.status}: ${await resp.text()}`);
  return new Uint8Array(await resp.arrayBuffer());
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

const MIMES_VISION_OK = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function normalizarTexto(s: string): string {
  // Remove acentos, lowercase, trim
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

async function classificarComGemini(
  apiKey: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ categoria: Categoria; debug: string }> {
  if (!MIMES_VISION_OK.has(mimeType)) return { categoria: "outro", debug: `mime ${mimeType} nao suportado` };
  if (bytes.length > 15 * 1024 * 1024) return { categoria: "outro", debug: `arquivo ${bytes.length}b > 15MB` };

  const b64 = bytesToBase64(bytes);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  // REST API expects camelCase: inlineData, mimeType
  const body = {
    contents: [{
      parts: [
        { text: PROMPT_GEMINI },
        { inlineData: { mimeType, data: b64 } },
      ],
    }],
    generationConfig: { temperature: 0, maxOutputTokens: 200 },
  };
  // Retry com backoff exponencial em 429 (rate limit do free tier eh 10 RPM)
  // e em 5xx. 2 tentativas total pra nao estourar wall-clock de 150s: imediata,
  // depois 8s. Se falhar, marca como 'outro' — preferimos arquivo nao
  // classificado a funcao timeout (que deixa a pasta sem mover).
  const delays = [0, 8000];
  let lastErr = "";
  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) await new Promise((r) => setTimeout(r, delays[attempt]));
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (resp.ok) {
      const data = await resp.json();
      const rawText = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "");
      const text = normalizarTexto(rawText);
      const validas: Categoria[] = ["rg", "cnh", "cpf", "comprovante", "contrato", "procuracao", "extrato"];
      const found = validas.find((c) => text.includes(c)) as Categoria | undefined;
      return { categoria: found || "outro", debug: `gemini="${rawText.trim().slice(0, 60)}"` };
    }
    const t = await resp.text();
    lastErr = `gemini ${resp.status}: ${t.slice(0, 200)}`;
    console.warn(`[gemini] tentativa ${attempt + 1} falhou: ${lastErr}`);
    if (resp.status !== 429 && resp.status < 500) break; // 4xx (exceto 429) nao tenta de novo
  }
  return { categoria: "outro", debug: lastErr };
}

function extensaoDe(name: string, mimeType: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  if (m) return "." + m[1].toLowerCase();
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return "";
}

async function renomear(token: string, fileId: string, novoNome: string): Promise<void> {
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: novoNome }),
  });
  if (!resp.ok) throw new Error(`rename ${resp.status}: ${await resp.text()}`);
}

async function moverPasta(token: string, folderId: string, novoPai: string, paiAtual: string): Promise<void> {
  const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?addParents=${novoPai}&removeParents=${paiAtual}&supportsAllDrives=true&fields=id,parents`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({}),
  });
  if (!resp.ok) throw new Error(`move ${resp.status}: ${await resp.text()}`);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const preClienteId = body.pre_cliente_id as string | undefined;
    if (!preClienteId) return jsonResponse({ error: "pre_cliente_id obrigatorio" }, 400);
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) return jsonResponse({ error: "GEMINI_API_KEY nao configurado" }, 500);
    const destFolderId = Deno.env.get("DRIVE_CLIENTES_EFETIVOS_FOLDER_ID");
    if (!destFolderId) return jsonResponse({ error: "DRIVE_CLIENTES_EFETIVOS_FOLDER_ID nao configurado" }, 500);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: pre, error: preErr } = await sb.from("pre_clientes").select("id, nome, drive_folder_id, drive_folder_url").eq("id", preClienteId).single();
    if (preErr || !pre) return jsonResponse({ error: "pre_cliente nao encontrado", details: preErr?.message }, 404);
    if (!pre.drive_folder_id) return jsonResponse({ error: "pre_cliente sem drive_folder_id" }, 400);
    const sa = await parseServiceAccount();
    const token = await obterAccessToken(sa);

    // 1) MOVE A PASTA PRIMEIRO. Garante que mesmo se a classificacao com
    // Gemini estourar wall-clock (150s), a pasta ja estara em CLIENTES
    // EFETIVOS. O loop antigo deixava a pasta orfa em PRE-CLIENTES quando
    // dava timeout.
    const folderInfoResp = await fetch(`https://www.googleapis.com/drive/v3/files/${pre.drive_folder_id}?fields=parents,webViewLink&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
    if (!folderInfoResp.ok) throw new Error(`folder info ${folderInfoResp.status}: ${await folderInfoResp.text()}`);
    const folderInfo = await folderInfoResp.json();
    const paiAtual = (folderInfo.parents || [])[0];
    let folderMovido = false;
    if (paiAtual && paiAtual !== destFolderId) {
      await moverPasta(token, pre.drive_folder_id, destFolderId, paiAtual);
      folderMovido = true;
    }

    // 2) Lista e classifica os arquivos respeitando o limite de 10 RPM do
    // Gemini free tier. Paralelismo 2 + delay 12s entre lotes = exatamente
    // 10 req/min. Pra 12 arquivos: 6 lotes * 12s = 72s + overhead ~80s,
    // cabe no wall-clock de 150s.
    //
    // IDEMPOTENCIA: arquivos ja com nome canonico (ex: "RG.pdf",
    // "CPF (2).pdf") sao pulados na classificacao — economiza chamadas
    // Gemini em re-runs e deixa a contagem de sufixo consistente.
    //
    // BUDGET DE TEMPO: paramos de classificar antes do wall-clock 150s
    // do Supabase. O que sobrar fica com nome original e a resposta vem
    // com parcial=true, pra o frontend mostrar "X de Y classificados" e
    // permitir re-rodar depois (cheio de re-runs e barato, pq os ja
    // classificados sao pulados).
    const arquivos = await listarArquivos(token, pre.drive_folder_id);
    console.log(`[organize] ${arquivos.length} arquivos em ${pre.drive_folder_id}`);

    // Detecta nome canonico (ex: "RG.pdf", "CPF (2).pdf"). Re-popula
    // contador `usados` pra novos arquivos nao colidirem com os antigos.
    const usados: Record<string, number> = {};
    const renames: Array<{ id: string; de: string; para: string; categoria: Categoria; debug?: string }> = [];

    const NOMES_BASE = Object.values(NOMES_CANONICOS).map(n =>
      n.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"),
    ).join("|");
    const RE_CANONICO = new RegExp(`^(${NOMES_BASE})(?:\\s*\\((\\d+)\\))?\\.[a-z0-9]+$`, "i");

    const jaCanonicos: DriveFile[] = [];
    const aClassificar: DriveFile[] = [];
    const baseDeNomeCanonico = (nome: string): string | null => {
      const m = nome.match(RE_CANONICO);
      if (!m) return null;
      // Acha o nome canonico exato (case-insensitive)
      const canon = Object.values(NOMES_CANONICOS).find(
        n => n.toLowerCase() === m[1].toLowerCase(),
      );
      return canon || null;
    };
    for (const arq of arquivos) {
      const base = baseDeNomeCanonico(arq.name);
      if (base) {
        jaCanonicos.push(arq);
        usados[base] = (usados[base] || 0) + 1;
      } else {
        aClassificar.push(arq);
      }
    }
    console.log(`[organize] ${jaCanonicos.length} ja canonicos, ${aClassificar.length} pra classificar`);

    const CONCORRENCIA = 2;
    const DELAY_ENTRE_LOTES_MS = 12_000;
    // Buffer pra renames + resposta. Edge function tem 150s wall-clock;
    // queremos terminar classificacao em ~125s pra ter ~25s pros renames.
    const T0 = Date.now();
    const BUDGET_CLASSIFICACAO_MS = 125_000;
    const tempoRestante = () => BUDGET_CLASSIFICACAO_MS - (Date.now() - T0);

    type Classificado = { arq: DriveFile; cat: Categoria; debug?: string; erro?: string };
    const classificados: Classificado[] = [];
    const naoProcessados: DriveFile[] = [];

    for (let i = 0; i < aClassificar.length; i += CONCORRENCIA) {
      // Se ja nao cabe mais um lote (com seu delay), encerra aqui e marca
      // o restante como nao processado.
      if (tempoRestante() < 18_000) {
        naoProcessados.push(...aClassificar.slice(i));
        console.warn(`[organize] budget esgotado, ${naoProcessados.length} arquivos ficam pra re-run`);
        break;
      }
      const lote = aClassificar.slice(i, i + CONCORRENCIA);
      const resultados = await Promise.all(lote.map(async (arq): Promise<Classificado> => {
        try {
          const bytes = await baixarArquivo(token, arq.id);
          const { categoria, debug } = await classificarComGemini(geminiKey, bytes, arq.mimeType);
          return { arq, cat: categoria, debug };
        } catch (e) {
          const erro = String((e as Error)?.message || e).slice(0, 200);
          console.warn(`[organize] erro arquivo ${arq.name}: ${erro}`);
          return { arq, cat: "outro", erro };
        }
      }));
      classificados.push(...resultados);
      // Espera entre lotes pra nao estourar 10 RPM do Gemini free tier.
      // Pula o delay no ultimo lote.
      if (i + CONCORRENCIA < aClassificar.length) {
        await new Promise((r) => setTimeout(r, DELAY_ENTRE_LOTES_MS));
      }
    }

    // 3) Renomeia serialmente (rapido, ~200ms cada) pra contagem de sufixo
    // ficar deterministica. Pula os ja canonicos (nao precisam de rename).
    for (const arq of jaCanonicos) {
      renames.push({ id: arq.id, de: arq.name, para: arq.name, categoria: "outro", debug: "ja canonico" });
    }
    for (const { arq, cat, debug, erro } of classificados) {
      if (cat === "outro") {
        renames.push({ id: arq.id, de: arq.name, para: arq.name, categoria: "outro", debug: erro ? `excecao: ${erro}` : debug });
        continue;
      }
      const base = NOMES_CANONICOS[cat];
      const ext = extensaoDe(arq.name, arq.mimeType);
      usados[base] = (usados[base] || 0) + 1;
      const sufixo = usados[base] > 1 ? ` (${usados[base]})` : "";
      const novoNome = `${base}${sufixo}${ext}`;
      try {
        if (novoNome !== arq.name) await renomear(token, arq.id, novoNome);
        renames.push({ id: arq.id, de: arq.name, para: novoNome, categoria: cat, debug });
      } catch (e) {
        renames.push({ id: arq.id, de: arq.name, para: arq.name, categoria: cat, debug: `rename falhou: ${String((e as Error)?.message || e).slice(0, 200)}` });
      }
    }
    // Arquivos que ficaram pra re-run aparecem com flag pro frontend
    // saber que ainda ha trabalho. NAO sao erro — sao backlog.
    for (const arq of naoProcessados) {
      renames.push({ id: arq.id, de: arq.name, para: arq.name, categoria: "outro", debug: "nao processado (budget)" });
    }

    const parcial = naoProcessados.length > 0;
    return jsonResponse({
      ok: true,
      total_arquivos: arquivos.length,
      classificados_agora: classificados.length,
      ja_canonicos: jaCanonicos.length,
      nao_processados: naoProcessados.length,
      parcial,
      renames,
      folder_movido: folderMovido,
      folder_url: folderInfo.webViewLink,
    });
  } catch (e) {
    console.error("[organize-client-folder] erro", e);
    return jsonResponse({ error: String((e as Error)?.message || e) }, 500);
  }
});
