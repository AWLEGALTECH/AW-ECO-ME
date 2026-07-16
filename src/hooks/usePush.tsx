import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// Chave PÚBLICA VAPID (pode ficar no cliente — não é segredo). O par privado
// vive na tabela push_vapid, lido só pela edge function send-push.
const VAPID_PUBLIC_KEY =
  "BFojPPtFXEmVQqrm7MXoEDmWZvNuneDiqb0sXNyTISOjcbiwFuVBP0YkyVZrSekGoIW4GOiLmGQBWFfMKkdlzt0";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Push por aparelho (Web Push). No iPhone só funciona no app instalado na tela
// inicial (iOS 16.4+); no Safari-aba o PushManager nem existe (supported=false).
export function usePush() {
  const { user } = useAuth();
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const [permission, setPermission] = useState<NotificationPermission>(
    supported ? Notification.permission : "denied",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, [supported]);

  const ativar = useCallback(async () => {
    if (!supported || !user) {
      toast.error("Este aparelho/navegador não suporta push.");
      return;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        toast.error("Permissão de notificação negada.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/push-sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const json: any = sub.toJSON();
      const { error } = await (supabase.from("push_subscriptions" as any) as any).upsert(
        {
          user_id: user.id,
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
          user_agent: navigator.userAgent,
        },
        { onConflict: "endpoint" },
      );
      if (error) throw error;
      setSubscribed(true);
      toast.success("Notificações ativadas neste aparelho ✅");
    } catch (e: any) {
      toast.error("Falha ao ativar: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [supported, user]);

  const desativar = useCallback(async () => {
    if (!supported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await (supabase.from("push_subscriptions" as any) as any).delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast.success("Notificações desativadas neste aparelho");
    } catch (e: any) {
      toast.error("Falha: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }, [supported]);

  return { supported, permission, subscribed, busy, ativar, desativar };
}
