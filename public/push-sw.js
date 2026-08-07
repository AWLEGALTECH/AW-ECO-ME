// Service worker SÓ de push — sem fetch/cache handler de propósito, pra não
// reintroduzir o cache travado que já deu problema. Só reage a push e a clique.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_e) { data = {}; }
  const title = data.title || "AW ECO";

  // Contrato fechado (cliente assinou) = notificação COMEMORATIVA, diferente das
  // demais, e que se destaca NO PRÓPRIO PUSH (fora do app): vibração de festa,
  // imagem grande, fica fixada na tela e ganha um botão de ação. O SO não deixa
  // trocar o som do push, então a diferença é vibração + visual + comportamento.
  const ehFechamento = data.tipo === "cliente_assinou";

  const options = ehFechamento
    ? {
        body: data.body || "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        image: "/icon-512.png",                 // banner grande no Android
        data: { link: data.link || "/" },
        tag: data.tipo,
        renotify: true,
        requireInteraction: true,               // fica na tela até tocar (dopamina)
        silent: false,
        // vibração "ta-ta-ta-tááá" comemorativa (bem diferente da padrão)
        vibrate: [0, 90, 45, 90, 45, 90, 45, 90, 60, 320],
        actions: [{ action: "abrir", title: "🎉 Ver" }],
      }
    : {
        body: data.body || "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { link: data.link || "/" },
        tag: data.tipo || undefined,
        renotify: !!data.tipo,
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
