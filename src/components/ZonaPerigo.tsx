import { useState, type ReactNode } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Gaveta fechada no rodapé da ficha, com as ações que mudam o cliente de
 * estado.
 *
 * Ela é deliberadamente apagada. A versão anterior era vermelha, e vermelho é
 * alarme: chamava atenção justamente para o que deve passar despercebido até
 * ser procurado. O que segura a ação aqui não é a cor — é estar fechada, no
 * fim da página, e exigir um clique para abrir. A cor forte fica reservada
 * para os botões lá dentro, quando a pessoa já decidiu entrar.
 */
export function ZonaPerigo({ children, subtitulo }: { children: ReactNode; subtitulo?: string }) {
  const [aberta, setAberta] = useState(false);

  return (
    <section className="mt-10 rounded-xl border border-border/60 bg-muted/[0.12] overflow-hidden">
      <button
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/25 transition-colors group"
      >
        <span className="h-8 w-8 rounded-lg bg-muted/40 ring-1 ring-border/60 text-muted-foreground grid place-items-center shrink-0 group-hover:text-foreground/70 transition-colors">
          <Settings2 className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-medium text-muted-foreground group-hover:text-foreground/80 transition-colors">
            Mais ações
          </span>
          <span className="block text-[11px] text-muted-foreground/70">
            {subtitulo ?? "Arquivar e outras mudanças de estado do cliente."}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground/40 shrink-0 transition-transform", aberta && "rotate-180")} />
      </button>

      {aberta && (
        <div className="border-t border-border/50 p-4 space-y-3">
          {children}
        </div>
      )}
    </section>
  );
}

/** Uma ação dentro da área restrita: o que é, o que faz, e o botão. */
export function AcaoPerigosa({ titulo, descricao, icone, children }: {
  titulo: string;
  descricao: string;
  icone?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="min-w-0 flex-1 flex items-start gap-2.5">
        {icone && <span className="shrink-0 mt-0.5">{icone}</span>}
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-foreground">{titulo}</p>
          <p className="text-[11.5px] text-muted-foreground leading-snug mt-0.5">{descricao}</p>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
