import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Hash, ChevronLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CounterStudio } from "@/components/marketing/CounterStudio";

const EASE = [0.22, 1, 0.36, 1] as const;

// Acervo de animações. Hoje uma; o formato é de catálogo porque a próxima
// entra como mais um item, sem mexer na página.
const ANIMACOES = [
  {
    chave: "counter",
    nome: "Counter",
    resumo: "Contagem rápida de zero até o valor, com cor e fundo à escolha.",
    icone: Hash,
    pronto: true,
  },
] as const;

export default function Marketing() {
  useEffect(() => { document.title = "Marketing · AW ECO ME"; }, []);
  const [aberta, setAberta] = useState<string | null>(null);

  const atual = ANIMACOES.find((a) => a.chave === aberta) ?? null;

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
        <h2 className="font-display text-3xl font-medium tracking-tight">Marketing</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Material para edição: animações prontas para configurar e baixar.
        </p>
      </motion.div>

      <AnimatePresence mode="wait">
        {atual ? (
          <motion.div key="estudio"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setAberta(null)}
                className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors shrink-0">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="h-8 w-8 rounded-xl bg-primary/12 ring-1 ring-primary/25 grid place-items-center shrink-0">
                <atual.icone className="h-4 w-4 text-primary" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">{atual.nome}</p>
                <p className="text-[11.5px] text-muted-foreground truncate">{atual.resumo}</p>
              </div>
            </div>

            {atual.chave === "counter" && <CounterStudio />}
          </motion.div>
        ) : (
          <motion.div key="acervo"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Material para edição</p>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {ANIMACOES.map((a) => (
                <button key={a.chave} onClick={() => setAberta(a.chave)}
                  className={cn(
                    "group flex flex-col text-left rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 min-h-[140px]",
                    "transition-all hover:border-primary/40 hover:bg-white/[0.05] hover:-translate-y-0.5",
                  )}>
                  <span className="h-9 w-9 rounded-xl bg-primary/12 ring-1 ring-primary/25 grid place-items-center">
                    <a.icone className="h-4 w-4 text-primary" />
                  </span>
                  <p className="text-sm font-medium mt-3">{a.nome}</p>
                  <p className="text-[11.5px] text-muted-foreground mt-1 leading-snug flex-1">{a.resumo}</p>
                </button>
              ))}

              {/* O vazio conta o plano, em vez de fingir que o acervo acabou. */}
              <Card className="border-dashed grid place-items-center min-h-[140px] p-4 text-center">
                <div>
                  <Sparkles className="h-5 w-5 text-muted-foreground/40 mx-auto" />
                  <p className="text-[11.5px] text-muted-foreground mt-2">Mais animações entram aqui</p>
                </div>
              </Card>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
