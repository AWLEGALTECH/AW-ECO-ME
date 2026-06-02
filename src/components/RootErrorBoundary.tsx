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
    return (
      <div style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#fafafa",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}>
        <div style={{
          maxWidth: 560,
          width: "100%",
          background: "#171717",
          border: "1px solid #2a2a2a",
          borderRadius: 12,
          padding: 24,
        }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, marginBottom: 8 }}>
            Algo travou ao carregar o app
          </h1>
          <p style={{ fontSize: 13, color: "#a3a3a3", margin: 0, marginBottom: 16 }}>
            Geralmente é cache antigo do navegador. Recarregar resolve. Se persistir, limpe os dados locais.
          </p>
          {this.state.error && (
            <pre style={{
              fontSize: 11,
              background: "#0a0a0a",
              border: "1px solid #2a2a2a",
              borderRadius: 6,
              padding: 12,
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              margin: 0,
              marginBottom: 16,
              color: "#fca5a5",
            }}>
              {this.state.error.message}
            </pre>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "8px 14px",
                background: "#fafafa",
                color: "#0a0a0a",
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
                color: "#fafafa",
                border: "1px solid #2a2a2a",
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
