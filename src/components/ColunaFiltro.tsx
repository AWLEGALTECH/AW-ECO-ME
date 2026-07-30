import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Filtro de coluna estilo planilha: busca + checklist multi-seleção.
// `chip` = trigger em forma de pílula com rótulo (barra de filtros);
// sem `chip` = só o funil (cabeçalho de tabela).
export function ColunaFiltro({ label, options, selected, onChange, chip }: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  chip?: boolean;
}) {
  const [q, setQ] = useState("");
  const active = selected.length > 0;
  const shown = q ? options.filter((o) => o.toLowerCase().includes(q.toLowerCase())) : options;
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        {chip ? (
          <button
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
              active ? "border-primary/50 bg-primary/[0.08] text-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30",
            )}
          >
            <Filter className="h-3 w-3" />
            {label}
            {active && <span className="ml-0.5 rounded-full bg-primary/20 text-primary px-1.5 text-[10px] font-medium tabular-nums">{selected.length}</span>}
          </button>
        ) : (
          <button
            className={cn("relative ml-1 inline-flex h-5 w-5 items-center justify-center rounded transition-colors align-middle",
              active ? "text-primary" : "text-muted-foreground/40 hover:text-foreground")}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Filtrar ${label}`}
          >
            <Filter className="h-3 w-3" />
            {active && <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0" onClick={(e) => e.stopPropagation()}>
        <div className="p-2 border-b border-border/60">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filtrar ${label}…`} className="h-8 text-xs" />
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {shown.length === 0 && <p className="text-xs text-muted-foreground text-center py-3">nada encontrado</p>}
          {shown.slice(0, 300).map((o) => (
            <button key={o} onClick={() => toggle(o)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-white/[0.05]">
              <span className={cn("h-3.5 w-3.5 rounded border grid place-items-center shrink-0", selected.includes(o) ? "bg-primary border-primary" : "border-border")}>
                {selected.includes(o) && <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />}
              </span>
              <span className="truncate" title={o}>{o}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between p-2 border-t border-border/60">
          <span className="text-[11px] text-muted-foreground">{active ? `${selected.length} selecionado(s)` : "todos"}</span>
          {active && <button onClick={() => onChange([])} className="text-[11px] text-primary hover:underline">limpar</button>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
