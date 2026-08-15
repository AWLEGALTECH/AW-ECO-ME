import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// Vocabulário visual dos diálogos da esteira. Nasceu no card de Análise
// Primária e agora é compartilhado com o de Peça Pronta pra Protocolar, pra
// que os dois se leiam do mesmo jeito: seções com fio + botões em duas colunas.

// Rótulo de seção com fio: separa visualmente os tipos de interação
// (cadastral, fluxo da matéria, conclusão) sem pesar o card.
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground whitespace-nowrap">
        {children}
      </span>
      <span className="h-px flex-1 bg-border/60" />
    </div>
  );
}

// Botão-linha padronizado, inspirado nos cards do Dashboard: fundo neutro
// glassy (a cor NÃO preenche a linha) e só o chip do ícone carrega o tom.
// `hero` liga o tratamento de destaque (borda + gradiente + fio primário)
// reservado à ação principal do card.
export function ActionRow({
  icon: Icon,
  title,
  subtitle,
  onClick,
  href,
  external,
  tone = "primary",
  hero = false,
  disabled,
  trailing,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  tone?: "primary" | "amber" | "emerald" | "rose" | "muted";
  hero?: boolean;
  disabled?: boolean;
  trailing?: ReactNode;
}) {
  // Chip do ícone — único elemento que "colore" a linha.
  const iconChip = {
    primary: "bg-primary/12 ring-1 ring-primary/25 text-primary",
    amber: "bg-amber-400/12 ring-1 ring-amber-400/30 text-amber-400",
    emerald: "bg-emerald-500/12 ring-1 ring-emerald-500/30 text-emerald-400",
    rose: "bg-rose-500/12 ring-1 ring-rose-500/30 text-rose-400",
    muted: "bg-white/[0.04] ring-1 ring-white/10 text-muted-foreground",
  }[tone];

  // Fundo da linha. Neutro por padrão (glassy). Hero ganha destaque primário;
  // as conclusões (amber/emerald/rose) levam só um véu de cor pra se reconhecer.
  let wrap: string;
  if (hero) {
    wrap =
      "relative border-primary/30 bg-gradient-to-br from-primary/[0.13] via-primary/[0.05] to-transparent " +
      "hover:border-primary/55 hover:from-primary/[0.18] shadow-lg shadow-black/20";
  } else if (tone === "amber") {
    wrap = "border-amber-400/20 bg-amber-400/[0.04] hover:bg-amber-400/[0.07] hover:border-amber-400/40";
  } else if (tone === "emerald") {
    wrap = "border-emerald-500/20 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.07] hover:border-emerald-500/40";
  } else if (tone === "rose") {
    wrap = "border-rose-500/20 bg-rose-500/[0.04] hover:bg-rose-500/[0.08] hover:border-rose-500/45";
  } else {
    wrap = "border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.05] hover:border-white/[0.12]";
  }

  const chipSize = hero ? "h-11 w-11" : "h-10 w-10";
  const pad = hero ? "px-4 py-3.5" : "px-4 py-3";
  const titleSize = hero ? "text-[15px]" : "text-sm";
  const titleColor = tone === "rose" && !hero ? "text-rose-200" : "text-foreground";

  const inner = (
    <>
      {hero && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-xl bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      )}
      <div className={`${chipSize} rounded-xl flex items-center justify-center shrink-0 ${iconChip}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className={`${titleSize} font-semibold ${titleColor}`}>{title}</p>
        <p className="text-[11px] text-muted-foreground leading-snug">{subtitle}</p>
      </div>
      {trailing}
    </>
  );

  const base = `w-full flex items-center gap-3 rounded-xl border transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none ${pad} ${wrap}`;

  if (href) {
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className={base}
        onClick={(e) => e.stopPropagation()}
      >
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={base}>
      {inner}
    </button>
  );
}
