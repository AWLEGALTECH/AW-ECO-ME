import { useState, type ReactNode } from "react";
import { ChevronDown, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Área fechada no rodapé da ficha, no espírito da "danger zone" do GitHub: as
 * ações que mudam o cliente de estado moram aqui, longe do fluxo do dia a dia
 * e atrás de um clique deliberado.
 *
 * Ficar recolhida é o ponto. Aberta o tempo todo, uma ação rara e perigosa
 * divide atenção com o trabalho normal e um dia alguém clica sem querer.
 */
export function ZonaPerigo({ children, subtitulo }: { children: ReactNode; subtitulo?: string }) {
  const [aberta, setAberta] = useState(false);

  return (
    <section className="mt-10 rounded-xl border border-rose-500/20 bg-rose-500/[0.02] overflow-hidden">
      <button
        onClick={() => setAberta((v) => !v)}
        aria-expanded={aberta}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-rose-500/[0.05] transition-colors"
      >
        <span className="h-8 w-8 rounded-lg bg-rose-500/10 ring-1 ring-rose-500/25 text-rose-400 grid place-items-center shrink-0">
          <ShieldAlert className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-rose-200/90">Área restrita</span>
          <span className="block text-[11px] text-muted-foreground">
            {subtitulo ?? "Ações que mudam o estado do cliente. Abra só se for usar."}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground/60 shrink-0 transition-transform", aberta && "rotate-180")} />
      </button>

      {aberta && (
        <div className="border-t border-rose-500/15 p-4 space-y-3">
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
