// send-trofeu
//
// Canal DIRETO e EXCLUSIVO: entrega um Web Push apenas às inscrições de UM
// usuário específico. Não passa pelo fluxo de notificacoes (que espalha para
// todos os admins) e não cria item no sininho — ninguém mais vê.
//
// Body: { user_id, titulo, corpo, link? }
// VAPID vem de push_vapid (service role). Inscrições mortas (404/410) removidas.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import * as webpush from "jsr:@negrel/webpush@0.3.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);

  try {
    const { user_id, titulo, corpo, link } = await req.json().catch(() => ({}));
    if (!user_id || !titulo) return j({ error: "user_id e titulo obrigatorios" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Inscrições SÓ desse usuário.
    const { data: subs } = await sb
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", user_id);
    if (!subs || !subs.length) return j({ ok: true, sent: 0, motivo: "sem_inscricoes" });

    const { data: vrow, error: eV } = await sb.from("push_vapid").select("keys").eq("id", 1).single();
    if (eV || !vrow?.keys) return j({ error: "vapid ausente", detail: eV?.message }, 500);
    const vapidKeys = await webpush.importVapidKeys(vrow.keys, { extractable: false });
    const appServer = await webpush.ApplicationServer.new({
      contactInformation: "mailto:awlegaltech@gmail.com",
      vapidKeys,
    });

    const payload = JSON.stringify({
      title: titulo,
      body: corpo || "",
      link: link || "/",
      tipo: "trofeu",
    });

    let sent = 0, gone = 0, failed = 0;
    for (const s of subs) {
      const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        const subscriber = appServer.subscribe(subscription as any);
        await subscriber.pushTextMessage(payload, {});
        sent++;
      } catch (err: any) {
        const status = err?.response?.status ?? err?.status;
        if (status === 404 || status === 410) {
          await sb.from("push_subscriptions").delete().eq("id", s.id);
          gone++;
        } else {
          failed++;
          console.error("[send-trofeu] falha", s.endpoint, status, String(err));
        }
      }
    }
    return j({ ok: true, sent, gone, failed });
  } catch (e) {
    console.error("[send-trofeu]", e);
    return j({ error: String((e as Error)?.message || e) }, 500);
  }
});
