// wa-foto
//
// Puxa a foto de perfil dos contatos na Evolution, guarda a IMAGEM no balde da
// mídia e aponta a conversa pra ela.
//
// POR QUE A IMAGEM E NÃO A URL. O que a Evolution devolve é um endereço do
// WhatsApp com credencial temporária: funciona hoje e morre em alguns dias.
// Gravar a URL faria os avatares virarem imagem quebrada semanas depois, sem
// nada dizendo por quê. Baixar custa uma vez; a URL custaria para sempre.
//
// DOIS JEITOS DE CHAMAR:
//   { conversas: [id, ...] }  as que vieram na lista (o gatilho usa assim)
//   { limite: 10 }            as N mais recentes que ainda não têm foto
//
// UM DE CADA VEZ, COM RESPIRO. Cada busca faz a Evolution conversar com o
// WhatsApp; cento e vinte de uma vez é o tipo de rajada que já derrubou este
// número antes. O intervalo entre uma e outra é barato e evita o prejuízo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
};

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Conversa { id: string; instancia: string; telefone: string }

type Desfecho = "guardada" | "sem_foto" | "erro";

/* NÃO CHEGAMOS A PERGUNTAR: limpa o carimbo para tentar de novo depois.
   O gatilho carimba ANTES de chamar (senão dez mensagens seguidas viram dez
   buscas), então uma queda da Evolution deixaria o contato marcado como
   "perguntado" para sempre. Desfazer o carimbo é o que separa "não tem foto"
   de "não deu para perguntar". */
async function naoPerguntamos(sb: ReturnType<typeof createClient>, id: string): Promise<Desfecho> {
  const { error } = await sb.from("wa_conversas").update({ foto_em: null }).eq("id", id);
  if (error) console.error("[wa-foto] destimbrar:", error.message);
  return "erro";
}

/** Uma conversa: pergunta, baixa, guarda e carimba. Nunca lança. */
async function puxarFoto(
  sb: ReturnType<typeof createClient>,
  base: string,
  key: string,
  c: Conversa,
): Promise<Desfecho> {
  let caminho: string | null = null;
  try {
    const r = await fetch(
      `${base}/chat/fetchProfilePictureUrl/${encodeURIComponent(c.instancia)}`,
      {
        method: "POST",
        headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify({ number: c.telefone }),
      },
    );

    // 400/404 aqui é o normal de quem não tem foto ou escondeu, e não erro
    // nosso: carimbamos como perguntado pra não voltar a perguntar sempre.
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      const url: string = j?.profilePictureUrl ?? j?.profilePicUrl ?? "";
      if (url) {
        const img = await fetch(url);
        if (img.ok) {
          const mime = (img.headers.get("content-type") ?? "image/jpeg").split(";")[0];
          const bin = new Uint8Array(await img.arrayBuffer());
          // Foto de perfil é pequena; algo grande demais aqui é resposta de
          // erro disfarçada de imagem.
          if (bin.byteLength > 0 && bin.byteLength < 5_000_000) {
            const alvo = `fotos/${c.id}.${EXT[mime] ?? "jpg"}`;
            const up = await sb.storage.from("wa-midia")
              .upload(alvo, bin, { contentType: mime, upsert: true });
            if (up.error) console.error("[wa-foto] storage:", up.error.message);
            else caminho = alvo;
          }
        }
      }
    } else if (r.status >= 500) {
      // A Evolution caiu ou a instância está fora: não é "não tem foto".
      console.error("[wa-foto] evolution", r.status, await r.text());
      return await naoPerguntamos(sb, c.id);
    }
  } catch (e) {
    console.error("[wa-foto] falhou:", (e as Error).message);
    return await naoPerguntamos(sb, c.id);
  }

  const patch: Record<string, unknown> = { foto_em: new Date().toISOString() };
  if (caminho) patch.foto_path = caminho;
  const { error } = await sb.from("wa_conversas").update(patch).eq("id", c.id);
  if (error) console.error("[wa-foto] update:", error.message);
  return caminho ? "guardada" : "sem_foto";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const base = (Deno.env.get("EVOLUTION_URL") ?? "").replace(/\/$/, "");
    /* A CHAVE GLOBAL PRIMEIRO, pelo mesmo motivo da mídia no webhook: chave de
       instância morre junto com a instância, e o sintoma seria a foto sumir só
       para o número recriado. */
    const key = Deno.env.get("EVOLUTION_APIKEY_GLOBAL") || Deno.env.get("EVOLUTION_APIKEY");
    if (!base || !key) return json({ error: "Evolution não configurada" }, 500);

    const corpo = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(corpo?.conversas) ? corpo.conversas.filter(Boolean) : [];
    const limite = Math.min(Math.max(Number(corpo?.limite) || 0, 0), 50);

    let q = sb.from("wa_conversas").select("id, instancia, telefone");
    if (ids.length > 0) {
      q = q.in("id", ids);
    } else {
      // As mais recentes primeiro: é a foto de quem está na frente da fila que
      // muda o dia de quem atende.
      q = q.is("foto_path", null).is("foto_em", null)
        .order("ultima_em", { ascending: false, nullsFirst: false })
        .limit(limite || 10);
    }
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const conversas = (data ?? []) as Conversa[];
    const conta: Record<Desfecho, number> = { guardada: 0, sem_foto: 0, erro: 0 };
    for (let i = 0; i < conversas.length; i++) {
      conta[await puxarFoto(sb, base, key, conversas[i])]++;
      if (i < conversas.length - 1) await espera(400);
    }

    return json({ ok: true, tentadas: conversas.length, ...conta });
  } catch (e) {
    console.error("[wa-foto]", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
