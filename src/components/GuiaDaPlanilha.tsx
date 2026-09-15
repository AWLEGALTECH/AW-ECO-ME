/* O QUE FAZER, QUANDO A PLANILHA NÃO ABRE.
 *
 * Passos numerados, o e-mail da conta de serviço num campo de copiar, e a frase
 * crua do Google dobrada embaixo. A ordem importa: quem está travado quer a
 * receita primeiro, e o código de erro só se o resto não bastar.
 *
 * Mora fora das duas telas porque as duas ligam planilha: a caixa Base e a aba
 * Automações. O texto de cada problema é de `src/lib/diagnosticoPlanilha.ts`,
 * que é testado; aqui é só o desenho.
 */
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { DiagnosticoDaPlanilha } from "@/lib/diagnosticoPlanilha";

const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };

/** O sinal de pendência: um ponto, e não um bloco pintado. */
function Pendente() {
  return <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-amber-400/80" aria-hidden />;
}

export function GuiaDaPlanilha({ diagnostico: d, className }: {
  diagnostico: DiagnosticoDaPlanilha;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const [verDetalhe, setVerDetalhe] = useState(false);

  const copiar = async () => {
    if (!d.copiar) return;
    try {
      await navigator.clipboard.writeText(d.copiar);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* Sem permissão de área de transferência (acontece em http e em alguns
         navegadores), o e-mail continua selecionável na tela: o caminho manual
         não deixa de existir porque o atalho falhou. */
      toast.error("Não consegui copiar. Selecione o e-mail e copie à mão.");
    }
  };

  return (
    <div className={cn("rounded-lg ring-1 ring-white/[0.08] bg-white/[0.02] px-3 py-2.5", className)}>
      <p className="text-[12px] font-medium flex items-center gap-1.5">
        <Pendente /> {d.titulo}
      </p>

      {d.passos.length > 0 && (
        <ol className="mt-2 space-y-1">
          {d.passos.map((passo, i) => (
            <li key={passo} className="flex items-start gap-2 text-[11px] text-muted-foreground leading-snug">
              <span className="mt-[1px] h-4 w-4 shrink-0 rounded-full grid place-items-center
                               bg-white/[0.06] text-[9px] font-semibold text-foreground/70 tabular-nums">
                {i + 1}
              </span>
              <span>{passo}</span>
            </li>
          ))}
        </ol>
      )}

      {d.copiar && (
        <div className="mt-2.5 flex items-center gap-1.5">
          {/* `select-all` porque copiar à mão precisa continuar possível: é o
              plano B de toda área de transferência bloqueada. */}
          <code className="flex-1 min-w-0 truncate rounded-md bg-black/40 ring-1 ring-white/[0.08]
                           px-2 py-1.5 text-[11px] font-mono select-all" title={d.copiar}>
            {d.copiar}
          </code>
          <Button size="sm" variant="outline" className="h-8 text-[11px] shrink-0" onClick={copiar}>
            {copiado
              ? <><Check className="h-3.5 w-3.5 mr-1 text-emerald-400" /> Copiado</>
              : <><Copy className="h-3.5 w-3.5 mr-1" /> Copiar</>}
          </Button>
        </div>
      )}

      {d.detalhe && (
        <>
          <button type="button" onClick={() => setVerDetalhe((v) => !v)}
            className="mt-2 text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors">
            {verDetalhe ? "Esconder o que o Google respondeu" : "Ver o que o Google respondeu"}
          </button>
          <AnimatePresence initial={false}>
            {verDetalhe && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={MOLA}
                className="overflow-hidden text-[10px] text-muted-foreground/60 leading-snug font-mono pt-1">
                {d.detalhe}
              </motion.p>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
