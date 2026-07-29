import { useState } from "react";
import { motion } from "framer-motion";
import { Circle, CheckCircle2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Demanda {
  id: string;
  titulo: string;
  concluida?: boolean;
  prazo?: string;
}

export interface Movimento {
  id: string;
  data: string;        // dd/mm/aaaa
  titulo: string;
  descricao?: string;
  tipo?: "inicial" | "andamento" | "decisao" | "atual";
  demandas?: Demanda[];
}

const EASE = [0.22, 1, 0.36, 1] as const;

// Cor do nó na espinha por tipo de marco processual.
const dotClass: Record<string, string> = {
  inicial: "bg-muted-foreground",
  andamento: "bg-primary",
  decisao: "bg-amber-400",
  atual: "bg-primary",
};

/**
 * Espinha dorsal do processo: rail vertical à direita, avanços à esquerda
 * pontuados por data, e — nos vãos entre um avanço e outro — as demandas
 * que se abrem e podem ser conclusas. As demandas alternam concluída/aberta
 * ao clique (simulação interativa).
 */
export function ProcessoTimeline({ movimentos }: { movimentos: Movimento[] }) {
  const [concluidas, setConcluidas] = useState<Set<string>>(
    () => new Set(movimentos.flatMap((m) => (m.demandas ?? []).filter((d) => d.concluida).map((d) => d.id))),
  );
  const toggle = (id: string) =>
    setConcluidas((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="mt-1">
      {movimentos.map((m, i) => {
        const last = i === movimentos.length - 1;
        const lineCls = last
          ? "absolute top-0 h-3 w-px left-1/2 -translate-x-1/2 bg-border"
          : i === 0
            ? "absolute top-2 bottom-0 w-px left-1/2 -translate-x-1/2 bg-border"
            : "absolute top-0 bottom-0 w-px left-1/2 -translate-x-1/2 bg-border";

        return (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: EASE, delay: i * 0.06 }}
            className="grid grid-cols-[1fr_1.75rem] gap-x-3"
          >
            {/* ── Avanço + demandas (à esquerda da espinha) ── */}
            <div className={cn("min-w-0", last ? "pb-1" : "pb-6")}>
              <p className="text-[11px] font-mono text-muted-foreground">{m.data}</p>
              <p className="text-sm font-medium mt-0.5 leading-tight">{m.titulo}</p>
              {m.descricao && <p className="text-xs text-muted-foreground mt-1 leading-snug">{m.descricao}</p>}

              {/* Demandas no vão até o próximo avanço */}
              <div className="mt-2.5 space-y-1.5">
                {(m.demandas ?? []).map((d) => {
                  const done = concluidas.has(d.id);
                  return (
                    <button
                      key={d.id}
                      onClick={() => toggle(d.id)}
                      className={cn(
                        "group flex items-center gap-2 w-full text-left rounded-lg border border-dashed px-2.5 py-1.5 transition-colors",
                        done
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-border hover:border-primary/40 hover:bg-primary/[0.04]",
                      )}
                    >
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                      )}
                      <span className={cn("text-xs", done ? "line-through text-muted-foreground" : "text-foreground")}>
                        {d.titulo}
                      </span>
                      {d.prazo && !done && (
                        <span className="ml-auto text-[10px] text-amber-400 shrink-0">{d.prazo}</span>
                      )}
                    </button>
                  );
                })}
                {!last && (
                  <button className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors pl-1 pt-0.5">
                    <Plus className="h-3 w-3" /> adicionar demanda
                  </button>
                )}
              </div>
            </div>

            {/* ── Espinha (rail à direita) ── */}
            <div className="relative flex justify-center">
              <div className={lineCls} />
              <span className={cn("relative z-10 mt-1 h-3.5 w-3.5 rounded-full ring-4 ring-card", dotClass[m.tipo ?? "andamento"])}>
                {m.tipo === "atual" && (
                  <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-60" />
                )}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
