/* O CABEÇALHO DE TODA ABA.
 *
 * Cada tela tinha o seu: uma com ícone ao lado do título, outra com título de
 * vitrine, outra com fonte menor, cada uma numa altura. Trocar de aba parecia
 * trocar de sistema. Este é o de Processos, que era o mais sóbrio, e vale para
 * todas: só o título na fonte da casa, sem ícone, uma frase opcional embaixo e
 * as ações à direita.
 *
 * A ALTURA É FIXA. O bloco do título tem altura mínima de título mais frase,
 * então a aba sem frase começa o conteúdo no mesmo ponto que a aba com frase,
 * e o título fica sempre no topo, sem ser centralizado num espaço vazio.
 */
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const CURVA = [0.22, 1, 0.36, 1] as const;

export function CabecalhoDaPagina({ titulo, subtitulo, acoes, className, animar = true }: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  acoes?: ReactNode;
  className?: string;
  /** desliga a entrada quando quem usa já anima o cabeçalho por conta própria */
  animar?: boolean;
}) {
  return (
    <motion.header
      initial={animar ? { opacity: 0, y: -8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: CURVA }}
      className={cn("flex items-start justify-between flex-wrap gap-x-4 gap-y-3", className)}
    >
      <div className="min-w-0 min-h-[3.75rem]">
        <h1 className="font-display text-3xl font-medium tracking-tight leading-9 break-words">{titulo}</h1>
        {subtitulo && <div className="text-sm text-muted-foreground mt-1">{subtitulo}</div>}
      </div>
      {acoes && <div className="flex items-center gap-2 flex-wrap">{acoes}</div>}
    </motion.header>
  );
}
