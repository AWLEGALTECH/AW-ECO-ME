import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Etapa {
  id: string;
  titulo: string;
  status: "concluida" | "atual" | "pendente";
  inicio?: string;        // dd/mm/aaaa
  conclusao?: string;     // dd/mm/aaaa
  prazoAlvoDias?: number;
  // Marca o início de um bloco de fase (ex.: "Fase recursal", "Cumprimento").
  // É o gancho que agrupa e puxa os atos de fases eventuais do processo.
  secao?: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;

function parseBR(d?: string): Date | null {
  if (!d) return null;
  const [dd, mm, yy] = d.split("/").map(Number);
  if (!dd || !mm || !yy) return null;
  return new Date(yy, mm - 1, dd);
}
function diffDias(a?: string, b?: string): number {
  const A = parseBR(a);
  const B = parseBR(b);
  if (!A || !B) return 0;
  return Math.max(0, Math.round((B.getTime() - A.getTime()) / 86400000));
}
function hojeBR(): string {
  const t = new Date();
  return `${String(t.getDate()).padStart(2, "0")}/${String(t.getMonth() + 1).padStart(2, "0")}/${t.getFullYear()}`;
}

/**
 * Linha do tempo do processo como sequência de etapas "cravadas" — pontos que
 * NÃO dependem da gente (atos da vara/partes). Rail vertical à esquerda (na cor
 * do tema) com o estado de cada etapa (concluída/atual/pendente); na etapa
 * ATUAL um pulso desce pela linha, dando a sensação de continuidade aguardada.
 * O campo `secao` abre um bloco de fase (ex.: recursal), servindo de gancho pra
 * puxar os atos dessa fase quando ela existir.
 */
export function ProcessoTimeline({ etapas, badge }: { etapas: Etapa[]; badge?: string }) {
  const concluidas = etapas.filter((e) => e.status === "concluida").length;

  return (
    <div>
      {/* Cabeçalho */}
      <div className="flex items-baseline justify-between gap-3 mb-5">
        <h3 className="font-display text-lg font-medium tracking-tight flex items-center gap-2">
          Linha do tempo do processo
          {badge && (
            <span className="text-[10px] uppercase tracking-wider bg-primary/10 text-primary rounded-full px-2 py-0.5 font-sans font-normal">
              {badge}
            </span>
          )}
        </h3>
        <span className="text-xs text-muted-foreground shrink-0">
          {concluidas} de {etapas.length} etapas cravadas
        </span>
      </div>

      {/* Etapas */}
      <div>
        {etapas.map((e, i) => {
          const last = i === etapas.length - 1;
          const lineCls = e.status === "concluida" ? "bg-primary/50" : "bg-border";
          const sub =
            e.status === "concluida"
              ? `iniciada em ${e.inicio ?? "sem data"} · levou ${diffDias(e.inicio, e.conclusao)} dia(s)`
              : e.status === "atual"
                ? `em curso desde ${e.inicio ?? "sem data"} · ${diffDias(e.inicio, hojeBR())} dia(s)`
                : `prazo-alvo de ${e.prazoAlvoDias ?? 0} dias`;

          return (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE, delay: i * 0.04 }}
                className="grid grid-cols-[1.5rem_1fr] gap-x-3"
              >
                {/* Rail à esquerda (cor do tema) */}
                <div className="relative flex justify-center">
                  {!last && (
                    e.status === "atual" ? (
                      <div className="absolute top-5 bottom-0 w-px left-1/2 -translate-x-1/2 bg-border overflow-hidden">
                        <span className="absolute inset-x-0 h-8 flow-down bg-gradient-to-b from-transparent via-primary to-transparent" />
                      </div>
                    ) : (
                      <div className={cn("absolute top-5 bottom-0 w-px left-1/2 -translate-x-1/2", lineCls)} />
                    )
                  )}
                  {e.status === "concluida" ? (
                    <span className="relative z-10 mt-1 h-4 w-4 rounded-full bg-primary grid place-items-center ring-4 ring-card">
                      <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
                    </span>
                  ) : e.status === "atual" ? (
                    <span className="relative z-10 mt-1 h-4 w-4 rounded-full border-2 border-primary bg-card ring-4 ring-card">
                      <span className="absolute -inset-px rounded-full border-2 border-primary animate-ping opacity-60" />
                    </span>
                  ) : (
                    <span className="relative z-10 mt-1 h-4 w-4 rounded-full border-2 border-muted-foreground/30 bg-card ring-4 ring-card" />
                  )}
                </div>

                {/* Conteúdo + status */}
                <div className={cn("flex items-start justify-between gap-4", !last && "border-b border-border/40", last ? "pb-1" : "pb-6")}>
                  <div className="min-w-0">
                    <p className={cn("text-sm font-medium leading-tight", e.status === "pendente" ? "text-muted-foreground" : "text-foreground")}>
                      {e.titulo}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
                  </div>
                  <div className="text-right shrink-0 max-w-[42%]">
                    {e.status === "concluida" && (
                      <>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Concluída em</p>
                        <p className="text-sm font-medium tabular-nums mt-0.5">{e.conclusao}</p>
                      </>
                    )}
                    {e.status === "atual" && (
                      <p className="text-[10px] uppercase tracking-wider text-primary">Aguardando conclusão</p>
                    )}
                  </div>
                </div>
              </motion.div>
          );
        })}
      </div>
    </div>
  );
}
