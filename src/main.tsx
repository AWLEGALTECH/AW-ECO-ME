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
  // Segue o tema escolhido (o pré-pintura do index.html já pôs o data-theme).
  const t = document.documentElement.getAttribute("data-theme");
  const C = t === "branco" || t === "sei"
    ? { fundo: "#ffffff", texto: "#171717", cartao: "#fafafa", borda: "#e3e3e3", apagado: "#666666", erro: "#b91c1c", botao: "#171717", botaoTexto: "#ffffff" }
    : { fundo: "#0a0a0a", texto: "#fafafa", cartao: "#171717", borda: "#2a2a2a", apagado: "#a3a3a3", erro: "#fca5a5", botao: "#fafafa", botaoTexto: "#0a0a0a" };
  rootEl.innerHTML = `
    <div style="min-height:100vh;background:${C.fundo};color:${C.texto};display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,sans-serif;">
      <div style="max-width:560px;width:100%;background:${C.cartao};border:1px solid ${C.borda};border-radius:12px;padding:24px;">
        <h1 style="font-size:18px;font-weight:600;margin:0 0 8px;">Falha ao iniciar o app</h1>
        <p style="font-size:13px;color:${C.apagado};margin:0 0 16px;">Provavelmente cache antigo do navegador. Limpar resolve.</p>
        <pre style="font-size:11px;background:${C.fundo};border:1px solid ${C.borda};border-radius:6px;padding:12px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;margin:0 0 16px;color:${C.erro};">${String(err?.message || err)}</pre>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button onclick="window.location.reload()" style="padding:8px 14px;background:${C.botao};color:${C.botaoTexto};border:0;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;">Recarregar</button>
          <button onclick="(function(){try{localStorage.clear()}catch(e){};try{sessionStorage.clear()}catch(e){};if('caches' in window){caches.keys().then(function(k){return Promise.all(k.map(function(x){return caches.delete(x)}))}).finally(function(){window.location.reload()})}else{window.location.reload()}})()" style="padding:8px 14px;background:transparent;color:${C.texto};border:1px solid ${C.borda};border-radius:6px;font-size:13px;cursor:pointer;">Limpar cache e recarregar</button>
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
