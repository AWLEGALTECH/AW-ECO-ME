import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pin, User, Users, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Botão de fixar processo. Dois modos: pessoal (só pra si) e geral (todos veem).
// O pin fica amarelo quando fixado por qualquer um dos modos.
export function PinButton({
  fixadoPessoal, fixadoGeral, onTogglePessoal, onToggleGeral, size = "md",
}: {
  fixadoPessoal: boolean;
  fixadoGeral: boolean;
  onTogglePessoal: () => void;
  onToggleGeral: () => void;
  size?: "sm" | "md";
}) {
  const fixado = fixadoPessoal || fixadoGeral;
  const icon = size === "sm" ? "h-4 w-4" : "h-[18px] w-[18px]";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          title={fixado ? "Fixado" : "Fixar processo"}
          className={cn(
            "inline-flex items-center justify-center rounded-md transition-colors",
            size === "sm" ? "h-8 w-8" : "h-9 w-9",
            fixado ? "text-yellow-400" : "text-muted-foreground/50 hover:text-yellow-400",
          )}
        >
          <Pin className={cn(icon, fixado && "fill-yellow-400")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-1.5" onClick={(e) => e.stopPropagation()}>
        <p className="px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground">Fixar processo</p>
        <button
          onClick={onTogglePessoal}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-white/[0.05] transition-colors"
        >
          <span className={cn("h-7 w-7 rounded-lg grid place-items-center shrink-0 ring-1", fixadoPessoal ? "bg-yellow-400/15 ring-yellow-400/40 text-yellow-400" : "bg-white/[0.04] ring-white/10 text-muted-foreground")}>
            <User className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Fixar só pra mim</span>
            <span className="block text-[11px] text-muted-foreground">acesso rápido, ninguém mais vê</span>
          </span>
          {fixadoPessoal && <Check className="h-4 w-4 text-yellow-400 shrink-0" />}
        </button>
        <button
          onClick={onToggleGeral}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-white/[0.05] transition-colors"
        >
          <span className={cn("h-7 w-7 rounded-lg grid place-items-center shrink-0 ring-1", fixadoGeral ? "bg-yellow-400/15 ring-yellow-400/40 text-yellow-400" : "bg-white/[0.04] ring-white/10 text-muted-foreground")}>
            <Users className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Fixar para todos</span>
            <span className="block text-[11px] text-muted-foreground">aparece pra todo o escritório</span>
          </span>
          {fixadoGeral && <Check className="h-4 w-4 text-yellow-400 shrink-0" />}
        </button>
      </PopoverContent>
    </Popover>
  );
}
