import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

// Sessao Finder global: permite ao usuario "minimizar" a analise pra rodar
// em segundo plano. O iframe do finder fica montado num host persistente
// no SidebarLayout, e uma pill flutuante no topo da tela mostra status
// (rodando → concluido). Click na pill = volta pra /finder e reabre.

export interface FinderSession {
  clienteId: string;
  nome: string;
  driveUrl?: string | null;
  driveFolderId?: string | null;
  startedAt: number;
}

export type FinderStatus = "rodando" | "concluido";

interface Ctx {
  active: FinderSession | null;
  status: FinderStatus;
  iniciar: (s: FinderSession) => void;
  marcarConcluido: () => void;
  encerrar: () => void;
}

const FinderSessionContext = createContext<Ctx | null>(null);

const SS_KEY = "finder-session-v1";
const SS_STATUS_KEY = "finder-status-v1";

export function FinderSessionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<FinderSession | null>(() => {
    try {
      const raw = sessionStorage.getItem(SS_KEY);
      return raw ? (JSON.parse(raw) as FinderSession) : null;
    } catch {
      return null;
    }
  });
  const [status, setStatus] = useState<FinderStatus>(() => {
    return (sessionStorage.getItem(SS_STATUS_KEY) as FinderStatus) || "rodando";
  });

  useEffect(() => {
    if (active) sessionStorage.setItem(SS_KEY, JSON.stringify(active));
    else sessionStorage.removeItem(SS_KEY);
  }, [active]);

  useEffect(() => {
    sessionStorage.setItem(SS_STATUS_KEY, status);
  }, [status]);

  // Heuristica de auto-detect: a cada 8s, checa se foi criada alguma
  // demanda nova (analise_documental, analise_vinculada) pra esse cliente
  // depois do startedAt. Se sim, a analise produziu output -> "concluido".
  // O Finder gera planilhas + dispara o salvarAnaliseVinculada via o
  // fluxo do cliente perfil, entao essa heuristica costuma pegar quando
  // a sessao realmente terminou.
  useEffect(() => {
    if (!active || status === "concluido") return;
    let cancelado = false;
    const startedIso = new Date(active.startedAt).toISOString();
    const tick = async () => {
      if (cancelado) return;
      const { data } = await supabase
        .from("demandas" as any)
        .select("id")
        .eq("cliente_id", active.clienteId)
        .in("etapa", ["analise_vinculada", "fluxo_artesanal"])
        .neq("status", "cancelada")
        .gte("created_at", startedIso)
        .limit(1);
      if (cancelado) return;
      if (data && data.length > 0) setStatus("concluido");
    };
    tick();
    const id = setInterval(tick, 8_000);
    return () => { cancelado = true; clearInterval(id); };
  }, [active, status]);

  const iniciar = useCallback((s: FinderSession) => {
    setActive(s);
    setStatus("rodando");
  }, []);
  const marcarConcluido = useCallback(() => setStatus("concluido"), []);
  const encerrar = useCallback(() => {
    setActive(null);
    setStatus("rodando");
    sessionStorage.removeItem(SS_KEY);
    sessionStorage.removeItem(SS_STATUS_KEY);
  }, []);

  return (
    <FinderSessionContext.Provider value={{ active, status, iniciar, marcarConcluido, encerrar }}>
      {children}
    </FinderSessionContext.Provider>
  );
}

export function useFinderSession() {
  const ctx = useContext(FinderSessionContext);
  if (!ctx) throw new Error("useFinderSession sem Provider");
  return ctx;
}
