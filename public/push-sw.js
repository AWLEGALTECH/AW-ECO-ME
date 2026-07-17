// Service worker SÓ de push — sem fetch/cache handler de propósito, pra não
// reintroduzir o cache travado que já deu problema. Só reage a push e a clique.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_e) { data = {}; }
  const title = data.title || "AW ECO";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { link: data.link || "/" },
    tag: data.tipo || undefined,
    renotify: !!data.tipo,
    // Não silenciar (deixa o SO tocar o som padrão de notificação) + vibração
    // no Android. iOS ignora vibrate, mas toca o som do sistema.
    silent: false,
    vibrate: [120, 60, 120],
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
