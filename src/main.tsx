import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Pré-registra Service Worker no boot pra ter pushManager disponivel
// imediatamente quando o user clicar "Ativar notificações".
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then((reg) => { console.log("[push] SW registered scope=", reg.scope); })
      .catch((err) => { console.error("[push] SW register failed:", err); });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
