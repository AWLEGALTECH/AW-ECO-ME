// A tarefa deitada, em colunas.
//
// Mora fora da tela de Tarefas porque a mesma linha aparece na ficha do cliente,
// agrupada por processo. Duplicar significaria que a próxima coluna nova entra
// num lugar e some no outro.

import { CalendarDays, ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { DESFECHOS, ICONE_TIPO, LABEL_TIPO, prazoInfo } from "@/components/ProcessoTimeline";
import type { ItemTarefa } from "@/lib/tarefas";

// Abre o processo em outra guia sem tirar a pessoa da tela — o filtro que ela
// acabou de montar continua montado. É <a> de verdade, e não navigate(), pra
// que ctrl+clique, clique do meio e "abrir em nova janela" também funcionem.
export function LinkProcesso({ id, className }: { id: string; className?: string }) {
  return (
    <a
      href={`/processos/${id}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Abrir o processo em outra guia"
      aria-label="Abrir o processo em outra guia"
      className={cn(
        "shrink-0 rounded-md p-1 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors",
        className,
      )}
    >
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

// Chip de status na cor do tema (mesmo do card de tarefa no processo).
export function StatusChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 bg-primary/15 text-primary ring-primary/30 whitespace-nowrap max-w-full truncate">
      {label}
    </span>
  );
}

// O card empilha tudo em 188px de altura, o que é bom pra folhear e ruim pra
// comparar: com dez cards na tela não dá pra correr o olho pelos prazos. Aqui
// cada informação tem sua coluna, então a leitura é vertical dentro de cada uma.
//
// As colunas do meio somem no estreito em vez de espremer: sobram título e uma
// segunda linha com prazo e processo, que é o mínimo pra decidir se abre.
export const COLS_LISTA =
  "grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-cols-[auto_minmax(0,1fr)_6.5rem_8.5rem_10rem_13rem_auto]";


export function TarefaLinha({
  it, onClick, mostrarProcesso = true,
}: {
  it: ItemTarefa;
  onClick: () => void;
  /** Some quando a lista já está agrupada por processo. */
  mostrarProcesso?: boolean;
}) {
  const Icon = ICONE_TIPO[it.tipo];
  const d = it.desfecho ? DESFECHOS[it.desfecho] : null;
  const DIcon = d?.icon;
  const prazo = it.tipo !== "pendencia" && !d ? prazoInfo(it.prazo) : null;
  // Div com papel de botão, e não <button>: dentro dela vive o link para o
  // processo, e âncora dentro de botão é HTML inválido — além de quebrar
  // ctrl+clique e clique do meio, que é o que se quer preservar.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className={cn(
        "w-full grid items-center gap-x-3 text-left rounded-xl border border-white/[0.06] bg-white/[0.02] cursor-pointer",
        "px-3 py-2 transition-colors hover:border-primary/30 hover:bg-white/[0.045]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        COLS_LISTA, d && "opacity-70",
      )}
    >
      <span className="h-7 w-7 rounded-lg bg-primary/12 ring-1 ring-primary/25 grid place-items-center shrink-0">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </span>

      <span className="min-w-0">
        <span className={cn("block text-[13px] font-medium truncate", d && "line-through")}>{it.titulo}</span>
        {it.conteudo && (
          <span className="hidden lg:block text-[11px] text-muted-foreground truncate">{it.conteudo}</span>
        )}
        {/* No estreito, o essencial das colunas escondidas vem pra cá */}
        <span className="lg:hidden flex items-center gap-1.5 text-[10.5px] text-muted-foreground truncate">
          {prazo && <span className={prazo.cls}>{prazo.label}</span>}
          {prazo && mostrarProcesso && <span className="opacity-40">·</span>}
          {mostrarProcesso && <span className="font-mono truncate">{it.processoNumero}</span>}
          {!mostrarProcesso && !prazo && <span>{it.etapaTitulo}</span>}
        </span>
      </span>

      <span className="hidden lg:block text-[10.5px] uppercase tracking-wide text-muted-foreground truncate">
        {LABEL_TIPO[it.tipo]}
      </span>

      <span className="hidden lg:flex min-w-0">
        {d && DIcon ? (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 truncate", d.chip)}>
            <DIcon className="h-3 w-3 shrink-0" /> {d.label}
          </span>
        ) : (
          <StatusChip label={it.tipo === "pendencia" ? "Pendente" : it.status} />
        )}
      </span>

      <span className={cn("hidden lg:flex items-center gap-1.5 text-[11px] min-w-0", prazo ? prazo.cls : "text-muted-foreground/50")}>
        {prazo ? (
          <>
            <CalendarDays className="h-3 w-3 shrink-0" />
            <span className="truncate">{prazo.label}</span>
          </>
        ) : "—"}
      </span>

      {/* Agrupado por processo, repetir o número em toda linha seria dizer o que
          o cabeçalho do grupo já disse — a coluna passa a mostrar a etapa, que
          é o que ainda distingue uma linha da outra ali dentro. */}
      <span className="hidden lg:block min-w-0 text-[10.5px] text-muted-foreground">
        {mostrarProcesso ? (
          <>
            <span className="block font-mono truncate">{it.processoNumero}</span>
            {it.clienteNome && <span className="block truncate">{it.clienteNome}</span>}
          </>
        ) : (
          <span className="block truncate">{it.etapaTitulo}</span>
        )}
      </span>

      <span className="flex items-center gap-0.5 shrink-0">
        <LinkProcesso id={it.processoId} />
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
      </span>
    </div>
  );
}
