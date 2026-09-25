/* O FINDER NOVO, carregado sob demanda.
 *
 * São quase cinco mil linhas de leitor de extrato; quem nunca abre o Finder
 * não baixa nada disso. A ponte com o banco é a do AW, com o login de quem
 * usa (src/apps/finder/ponteAw.ts). */
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ponteAw } from "@/apps/finder/ponteAw";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const App = lazy(() => import("@/apps/finder/App.jsx")) as any;

export interface ContextoDoFinder {
  clienteId: string;
  clienteNome: string;
  driveFolderId?: string | null;
  driveUrl?: string | null;
}

/** O que o Finder avisa quando a análise fica pronta (o antigo `aw-finder:analysis-ready`). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DetalheDaAnalise = Record<string, any>;

export function FinderNativo(props: {
  contexto?: ContextoDoFinder | null;
  arquivosIniciais?: File[] | null;
  anuladasIniciais?: Record<string, string> | null;
  onLiberarAnulada?: ((rubrica: string) => void) | null;
  onAnalisePronta?: ((d: DetalheDaAnalise) => void) | null;
  onReset?: (() => void) | null;
}) {
  return (
    <Suspense fallback={
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 bg-background">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">Carregando Finder…</p>
          <p className="text-xs text-muted-foreground mt-1">Inicializando motor de auditoria</p>
        </div>
      </div>
    }>
      <App ponte={ponteAw} {...props} />
    </Suspense>
  );
}
