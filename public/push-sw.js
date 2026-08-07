// Service worker SÓ de push — sem fetch/cache handler de propósito, pra não
// reintroduzir o cache travado que já deu problema. Só reage a push e a clique.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_e) { data = {}; }
  const title = data.title || "AW ECO";

  // Contrato fechado (cliente assinou) = notificação COMEMORATIVA. A diferença
  // fica na VIBRAÇÃO de festa e no comportamento (fica fixada). Antes usávamos
  // `image` (banner) e `actions` (botão), mas o iOS/PWA não suporta esses
  // campos e o showNotification falhava em silêncio — o push nem aparecia. Sem
  // eles, a notificação renderiza em todo aparelho, igual às demais.
  const ehFechamento = data.tipo === "cliente_assinou";

  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { link: data.link || "/" },
    tag: data.tipo || undefined,
    renotify: !!data.tipo,
    silent: false,
    // vibração comemorativa "ta-ta-ta-tááá" só no contrato; padrão nas demais.
    vibrate: ehFechamento ? [0, 90, 45, 90, 45, 90, 45, 90, 60, 320] : [120, 60, 120],
    // fica na tela até tocar (dopamina) — ignorado onde não houver suporte.
    requireInteraction: ehFechamento,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of wins) {
      if ("focus" in c) {
        try { await c.focus(); } catch (_e) {}
        if ("navigate" in c) { try { await c.navigate(link); } catch (_e) {} }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(link);
  })());
});
