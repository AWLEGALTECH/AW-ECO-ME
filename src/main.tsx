import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Desregistra qualquer service worker antigo (legado, ainda nao temos
// /sw.js servido). Garante que o navegador nao fique servindo cache
// quebrado de uma versao antiga do app.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations()
    .then((regs) => { regs.forEach((r) => r.unregister()); })
    .catch(() => {});
}

createRoot(document.getElementById("root")!).render(<App />);
