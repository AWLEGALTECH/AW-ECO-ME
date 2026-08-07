import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Radar, Loader2 } from "lucide-react";

// Barra flutuante no topo enquanto há análise(s) do Spy rodando em segundo
// plano. Mostra etapa atual, tempo de rodagem e barra de progresso — para o
// usuário navegar pelo Eco sem perder de vista a análise. Some sozinha quando
// termina (a linha sai de 'processando'). Só admin (RLS já restringe).
interface Proc { id: string; created_at: string; progresso: any; clientes: { nome: string | null } | null; }

export function SpyProgressBar() {
  const { isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [agora, setAgora] = useState(() => Date.now());

  const { data: procs = [] } = useQuery({
    queryKey: ["spy-processando"],
    enabled: isAdmin,
    queryFn: async (): Promise<Proc[]> => {
      const { data, error } = await (supabase.from("spy_analise" as any) as any)
        .select("id, created_at, progresso, clientes(nome)")
        .eq("status", "processando").order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as any;
    },
    refetchInterval: 2500,
  });

  useEffect(() => {
    if (!procs.length) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [procs.length]);

  if (!isAdmin || procs.length === 0) return null;
  if (location.pathname.startsWith("/spy")) return null;

  const p = procs[0];
  const extras = procs.length - 1;
  const pct = Math.min(100, Math.max(2, Number(p.progresso?.pct) || 2));
  const segs = Math.max(0, Math.floor((agora - new Date(p.created_at).getTime()) / 1000));
  const tempo = `${Math.floor(segs / 60).toString().padStart(2, "0")}:${(segs % 60).toString().padStart(2, "0")}`;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] w-[min(92vw,440px)]">
      <button
        onClick={() => navigate("/spy")}
        className="w-full text-left rounded-xl border border-primary/40 bg-primary/15 backdrop-blur shadow-lg px-3 py-2 hover:bg-primary/25 transition-colors"
      >
        <div className="flex items-center gap-2 text-[12px]">
          <Radar className="h-4 w-4 text-primary shrink-0" />
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
          <span className="font-medium">Spy analisando</span>
          <span className="opacity-60">·</span>
          <span className="truncate flex-1 min-w-0">{p.clientes?.nome || "cliente"}</span>
          <span className="tabular-nums opacity-80 shrink-0">{tempo}</span>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex-1 h-1.5 rounded-full bg-white/15 overflow-hidden">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] tabular-nums text-foreground/70 shrink-0">{pct}%</span>
        </div>
        <p className="text-[10px] text-foreground/70 mt-0.5 truncate">
          {p.progresso?.detalhe || "processando"}{extras > 0 ? ` · +${extras} na fila` : ""}
        </p>
      </button>
    </div>
  );
}
