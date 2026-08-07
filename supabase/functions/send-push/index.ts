// send-push
//
// Chamada pelo trigger trg_disparar_push quando uma notificação é inserida.
// Body: { notificacao_id }. Destinatários = admins (sempre) + usuários com o
// tipo permitido em notificacao_user_prefs. Pega as inscrições push desses
// usuários e entrega o Web Push.
//
// Chave VAPID vem da tabela push_vapid (lida com service role). Inscrições
// expiradas (404/410) são removidas.

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
    const body = await req.json().catch(() => ({} as any));

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // ── MODO TESTE: push DIRETO pros user_ids informados, sem criar notificação.
    //    Alvo exato (nao dispara o som in-app de ninguem, nao vaza pra outros). ──
    if (Array.isArray(body.test_user_ids) && body.test_user_ids.length) {
      const { data: subsT } = await sb
        .from("push_subscriptions").select("id, endpoint, p256dh, auth")
        .in("user_id", body.test_user_ids);
      if (!subsT || !subsT.length) return j({ ok: true, teste: true, sent: 0, motivo: "sem_inscricoes" });
      const { data: vrowT, error: eVT } = await sb.from("push_vapid").select("keys").eq("id", 1).single();
      if (eVT || !vrowT?.keys) return j({ error: "vapid ausente", detail: eVT?.message }, 500);
      const vapidKeysT = await webpush.importVapidKeys(vrowT.keys, { extractable: false });
      const appServerT = await webpush.ApplicationServer.new({ contactInformation: "mailto:awlegaltech@gmail.com", vapidKeys: vapidKeysT });
      const payloadT = JSON.stringify({
        title: body.titulo || "Notificação de teste",
        body: body.corpo || "",
        link: body.link || "/",
        tipo: body.tipo || "teste",
      });
      let sentT = 0, goneT = 0, failedT = 0;
      for (const s of subsT) {
        const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
        try { await appServerT.subscribe(subscription as any).pushTextMessage(payloadT, {}); sentT++; }
        catch (err: any) {
          const status = err?.response?.status ?? err?.status;
          if (status === 404 || status === 410) { await sb.from("push_subscriptions").delete().eq("id", s.id); goneT++; }
          else { failedT++; console.error("[send-push/teste] falha", s.endpoint, status, String(err)); }
        }
      }
      return j({ ok: true, teste: true, destinatarios: body.test_user_ids.length, inscricoes: subsT.length, sent: sentT, gone: goneT, failed: failedT });
    }

    const notificacao_id = body.notificacao_id;
    if (!notificacao_id) return j({ error: "notificacao_id obrigatorio" }, 400);

    // 1. Notificação
    const { data: notif, error: eN } = await sb
      .from("notificacoes")
      .select("id, tipo, titulo, corpo, link")
      .eq("id", notificacao_id)
      .single();
    if (eN || !notif) return j({ error: "notificacao nao encontrada", detail: eN?.message }, 404);

    // 2. Tipo ativo?
    const { data: cfg } = await sb
      .from("notificacao_config")
      .select("ativo")
      .eq("tipo", notif.tipo)
      .single();
    if (cfg && cfg.ativo === false) return j({ ok: true, skipped: "tipo_inativo" });

    // 3. Destinatários: admins (sempre) + usuários com o tipo permitido.
    const [{ data: admins }, { data: prefs }] = await Promise.all([
      sb.from("profiles").select("id").eq("approved", true).eq("role", "admin"),
      sb.from("notificacao_user_prefs").select("user_id").eq("tipo", notif.tipo).eq("permitido", true),
    ]);
    const set = new Set<string>([
      ...(admins || []).map((a: any) => a.id),
      ...(prefs || []).map((p: any) => p.user_id),
    ]);
    const userIds = [...set];
    if (!userIds.length) return j({ ok: true, sent: 0, motivo: "sem_destinatarios" });

    // 4. Inscrições desses usuários
    const { data: subs } = await sb
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", userIds);
    if (!subs || !subs.length) return j({ ok: true, sent: 0, motivo: "sem_inscricoes" });

    // 5. VAPID + servidor de aplicação
    const { data: vrow, error: eV } = await sb.from("push_vapid").select("keys").eq("id", 1).single();
    if (eV || !vrow?.keys) return j({ error: "vapid ausente", detail: eV?.message }, 500);
    const vapidKeys = await webpush.importVapidKeys(vrow.keys, { extractable: false });
    const appServer = await webpush.ApplicationServer.new({
      contactInformation: "mailto:awlegaltech@gmail.com",
      vapidKeys,
    });

    const payload = JSON.stringify({
      title: notif.titulo,
      body: notif.corpo || "",
      link: notif.link || "/",
      tipo: notif.tipo,
    });

    // 6. Envia; remove inscrições mortas.
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
          console.error("[send-push] falha", s.endpoint, status, String(err));
        }
      }
    }
    return j({ ok: true, sent, gone, failed, destinatarios: userIds.length, inscricoes: subs.length });
  } catch (e) {
    console.error("[send-push]", e);
    return j({ error: String((e as Error)?.message || e) }, 500);
  }
});
