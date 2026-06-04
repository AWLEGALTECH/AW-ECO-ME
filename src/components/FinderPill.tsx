import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, CheckCircle2, X, ScanSearch } from "lucide-react";
import { useFinderSession } from "@/hooks/useFinderSession";

// Pill flutuante no topo da tela quando ha uma sessao Finder ativa mas
// o usuario nao esta em /finder. Mostra:
//   - "Rodando · Cliente Nome · 2m 30s"  (azul/spinner)
//   - "Pronto · Cliente Nome"             (verde/check)
// Click no pill = volta pra /finder. X = encerra a sessao.
export function FinderPill() {
  const { active, status, encerrar } = useFinderSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [agora, setAgora] = useState(() => Date.now());

  // Atualiza o cronometro a cada 1s enquanto rodando
  useEffect(() => {
    if (!active || status === "concluido") return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active, status]);

  if (!active) return null;
  if (location.pathname.startsWith("/finder")) return null;

  const segs = Math.max(0, Math.floor((agora - active.startedAt) / 1000));
  const mm = Math.floor(segs / 60).toString().padStart(2, "0");
  const ss = (segs % 60).toString().padStart(2, "0");
  const tempo = `${mm}:${ss}`;

  const reabrir = () => {
    const qs = new URLSearchParams();
    qs.set("cliente", active.clienteId);
    qs.set("nome", active.nome);
    navigate(`/finder?${qs.toString()}`);
  };

  const concluido = status === "concluido";

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60]">
      <div
        className={`flex items-center gap-2.5 pl-3 pr-1.5 py-1.5 rounded-full border shadow-lg backdrop-blur transition-colors ${
          concluido
            ? "border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-100"
            : "border-primary/40 bg-primary/15 hover:bg-primary/25 text-foreground"
        }`}
      >
        <button onClick={reabrir} className="flex items-center gap-2 text-left">
          {concluido ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
          <div className="flex items-center gap-1.5 text-[12px]">
            <ScanSearch className="h-3.5 w-3.5 opacity-70" />
            <span className="font-medium truncate max-w-[160px]">
              {concluido ? "Análise pronta" : "Finder rodando"}
            </span>
            <span className="text-[11px] opacity-70">·</span>
            <span className="text-[11px] truncate max-w-[180px]">{active.nome}</span>
            {!concluido && (
              <>
                <span className="text-[11px] opacity-70">·</span>
                <span className="text-[11px] tabular-nums opacity-80">{tempo}</span>
              </>
            )}
          </div>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); encerrar(); }}
          className="ml-1 h-6 w-6 inline-flex items-center justify-center rounded-full hover:bg-foreground/10 text-foreground/60 hover:text-foreground transition-colors"
          title="Encerrar sessão do Finder"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
