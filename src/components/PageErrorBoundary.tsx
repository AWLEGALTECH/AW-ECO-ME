import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props { children: ReactNode; pageName: string }
interface State { hasError: boolean; error: Error | null }

// Boundary leve pra impedir que um crash na pagina deixe a tela inteira
// preta. Renderiza uma mensagem com o erro e botao pra recarregar.
export class PageErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.pageName}] crash:`, error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h2 className="text-lg font-semibold">Erro ao carregar {this.props.pageName}</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Algo deu errado ao renderizar esta página. Recarregar costuma resolver.
          </p>
          {this.state.error && (
            <pre className="text-[11px] bg-muted/40 p-3 rounded-md overflow-x-auto whitespace-pre-wrap break-all">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
            >
              Recarregar
            </button>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 rounded-md border border-border text-sm"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    );
  }
}
