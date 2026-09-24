import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

// Boundary de ultimo recurso. Envolve a app inteira (acima de Router,
// AuthProvider, etc) pra impedir que qualquer crash deixe a tela
// totalmente preta sem saida. Mostra o erro + botoes de recovery
// (recarregar / limpar cache local) pra o usuario nao ficar travado.
export class RootErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RootBoundary] crash fatal:", error, info);
  }

  limparTudo = () => {
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations()
        .then(regs => Promise.all(regs.map(r => r.unregister())))
        .finally(() => {
          if ("caches" in window) {
            caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
              .finally(() => window.location.reload());
          } else {
            window.location.reload();
          }
        });
    } else {
      if ("caches" in window) {
        caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
          .finally(() => window.location.reload());
      } else {
        window.location.reload();
      }
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    /* Esta tela não usa o CSS do app (ele pode ser justamente o que quebrou),
       então as cores são escritas à mão. Mas seguem o tema: quem trabalha no
       branco não leva um clarão preto quando algo trava. */
    const C = temaClaro() ? CORES_CLARAS : CORES_ESCURAS;
    return (
      <div style={{
        minHeight: "100vh",
        background: C.fundo,
        color: C.texto,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}>
        <div style={{
          maxWidth: 560,
          width: "100%",
          background: C.cartao,
          border: `1px solid ${C.borda}`,
          borderRadius: 12,
          padding: 24,
        }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 8 }}>
            Algo travou ao carregar o app
          </h1>
          <p style={{ fontSize: 13, color: C.apagado, margin: 0, marginBottom: 16 }}>
            Geralmente é cache antigo do navegador. Recarregar resolve. Se persistir, limpe os dados locais.
          </p>
          {this.state.error && (
            <pre style={{
              fontSize: 11,
              background: C.fundo,
              border: `1px solid ${C.borda}`,
              borderRadius: 6,
              padding: 12,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              margin: 0,
              marginBottom: 16,
              color: C.erro,
            }}>
              {this.state.error.message}
            </pre>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "8px 14px",
                background: C.botao,
                color: C.botaoTexto,
                border: 0,
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Recarregar
            </button>
            <button
              onClick={this.limparTudo}
              style={{
                padding: "8px 14px",
                background: "transparent",
                color: C.texto,
                border: `1px solid ${C.borda}`,
                borderRadius: 6,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Limpar cache e recarregar
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const CORES_ESCURAS = {
  fundo: "#0a0a0a", texto: "#fafafa", cartao: "#171717", borda: "#2a2a2a",
  apagado: "#a3a3a3", erro: "#fca5a5", botao: "#fafafa", botaoTexto: "#0a0a0a",
};
const CORES_CLARAS = {
  fundo: "#ffffff", texto: "#171717", cartao: "#fafafa", borda: "#e3e3e3",
  apagado: "#666666", erro: "#b91c1c", botao: "#171717", botaoTexto: "#ffffff",
};
function temaClaro(): boolean {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "branco" || t === "sei";
}
