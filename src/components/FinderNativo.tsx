/* O FINDER NOVO, carregado sob demanda.
 *
 * São quase cinco mil linhas de leitor de extrato; quem nunca abre o Finder
 * não baixa nada disso. A ponte com o banco é a do AW, com o login de quem
 * usa (src/apps/finder/ponteAw.ts). */
import { lazy, Suspense, type ReactNode } from "react";
import { ponteAw } from "@/apps/finder/ponteAw";

/** Busca o código do Finder sem mostrar nada (chamado depois do login). */
export const carregarFinder = () => import("@/apps/finder/App.jsx");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const App = lazy(carregarFinder) as any;

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
  /** o botão da análise comercial, que vai para a barra de decisão do relatório */
  acaoComercial?: ReactNode;
}) {
  return (
    /* Sem tela de "carregando": o código do Finder já foi buscado em segundo
       plano logo depois do login (SidebarLayout), então aqui ele abre direto.
       O fundo liso só aparece se alguém abrir o Finder nos primeiros segundos. */
    <Suspense fallback={<div className="h-full w-full bg-background" />}>
      <App ponte={ponteAw} {...props} />
    </Suspense>
  );
}
