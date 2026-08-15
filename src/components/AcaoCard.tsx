import { ArrowRight } from "lucide-react";

// AcaoCard: botao-cartao padronizado pros dialogs de pre-decisao
// (Esteira: pendencia, vinculada, artesanal, peca pronta).
// Mesmo formato visual em toda a app: icone redondo + titulo + hint + seta.
// Variantes:
//   default  = borda/bg discretos (acao secundaria)
//   primary  = realce primary (acao recomendada do dialog)
//   sucesso  = realce verde (acao terminal positiva, ex: marcar resolvida)
//   perigo   = realce vermelho (acao terminal negativa, ex: cancelar protocolo)
export function AcaoCard({
  icon: Icon,
  titulo,
  hint,
  onClick,
  href,
  external,
  variant = "default",
  disabled,
  acaoIcon: AcaoIcon = ArrowRight,
}: {
  icon: any;
  titulo: string;
  hint?: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  variant?: "default" | "primary" | "sucesso" | "perigo";
  disabled?: boolean;
  acaoIcon?: any;
}) {
  const base = "w-full flex items-center gap-3 rounded-xl px-4 py-3 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed";
  const variantClass =
    variant === "primary"
      ? "border-2 border-primary/40 bg-primary/5 hover:border-primary hover:bg-primary/10"
      : variant === "sucesso"
        ? "border-2 border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500 hover:bg-emerald-500/10"
        : variant === "perigo"
          ? "border border-rose-500/30 bg-rose-500/[0.04] hover:border-rose-500/60 hover:bg-rose-500/10"
          : "border border-border bg-card/40 hover:border-primary/40 hover:bg-card/60";
  const iconBg =
    variant === "primary" ? "bg-primary/20"
      : variant === "sucesso" ? "bg-emerald-500/20"
        : variant === "perigo" ? "bg-rose-500/15"
          : "bg-primary/15";
  const iconColor =
    variant === "sucesso" ? "text-emerald-500" : variant === "perigo" ? "text-rose-400" : "text-primary";
  const setaColor =
    variant === "primary" ? "text-primary"
      : variant === "sucesso" ? "text-emerald-500"
        : variant === "perigo" ? "text-rose-400/70"
          : "text-muted-foreground";
  const tituloColor = variant === "perigo" ? "text-rose-300" : "";

  const inner = (
    <>
      <div className={`h-10 w-10 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${tituloColor}`}>{titulo}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <AcaoIcon className={`h-4 w-4 shrink-0 ${setaColor}`} />
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className={`${base} ${variantClass}`}
        onClick={(e) => { e.stopPropagation(); }}
      >
        {inner}
      </a>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${variantClass}`}>
      {inner}
    </button>
  );
}
