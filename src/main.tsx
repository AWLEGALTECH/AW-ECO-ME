import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { RootErrorBoundary } from "./components/RootErrorBoundary";
import "./index.css";

// Service workers:
//  - Remove QUALQUER SW antigo que não seja o nosso push-sw.js (eram SWs de
//    cache legados que serviam versão quebrada do app).
//  - Registra o push-sw.js — que NÃO faz cache (só push), então não reintroduz
//    o problema. É ele que recebe as notificações com o app fechado.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => {
      regs.forEach((r) => {
        const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
        if (!url.endsWith("/push-sw.js")) r.unregister();
      });
      // updateViaCache:'none' → o script do SW é sempre baixado da rede,
      // ignorando o cache HTTP (senão uma versão velha/quebrada fica presa).
      navigator.serviceWorker.register("/push-sw.js", { updateViaCache: "none" })
        .then((reg) => { reg.update().catch(() => {}); })
        .catch(() => {});
    })
    .catch(() => {});
}

// Captura erros sincronos no boot do React (antes da arvore montar).
// Se algo explodir aqui (ex: chunk faltando, localStorage corrompido),
// mostramos uma tela minima de recuperacao em vez de pagina preta.
const rootEl = document.getElementById("root");
const showFallback = (err: any) => {
  console.error("[boot] falha critica:", err);
  if (!rootEl) return;
  rootEl.innerHTML = `
    <div style="min-height:100vh;background:#0a0a0a;color:#fafafa;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,sans-serif;">
      <div style="max-width:560px;width:100%;background:#171717;border:1px solid #2a2a2a;border-radius:12px;padding:24px;">
        <h1 style="font-size:18px;font-weight:600;margin:0 0 8px;">Falha ao iniciar o app</h1>
        <p style="font-size:13px;color:#a3a3a3;margin:0 0 16px;">Provavelmente cache antigo do navegador. Limpar resolve.</p>
        <pre style="font-size:11px;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:6px;padding:12px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;margin:0 0 16px;color:#fca5a5;">${String(err?.message || err)}</pre>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button onclick="window.location.reload()" style="padding:8px 14px;background:#fafafa;color:#0a0a0a;border:0;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;">Recarregar</button>
          <button onclick="(function(){try{localStorage.clear()}catch(e){};try{sessionStorage.clear()}catch(e){};if('caches' in window){caches.keys().then(function(k){return Promise.all(k.map(function(x){return caches.delete(x)}))}).finally(function(){window.location.reload()})}else{window.location.reload()}})()" style="padding:8px 14px;background:transparent;color:#fafafa;border:1px solid #2a2a2a;border-radius:6px;font-size:13px;cursor:pointer;">Limpar cache e recarregar</button>
        </div>
      </div>
    </div>
  `;
};

try {
  if (!rootEl) throw new Error("#root nao encontrado no DOM");
  createRoot(rootEl).render(
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  );
} catch (err) {
  showFallback(err);
}

// Captura erros nao-tratados (promises rejeitadas, erros assincronos)
// Nao mostra fallback (a app pode estar OK), so loga.
window.addEventListener("unhandledrejection", (e) => {
  console.error("[unhandledrejection]", e.reason);
});
