/* OS NÚMEROS DA META, LIDOS DO BANCO.
 *
 * A tela nunca fala com a Meta. Ela lê a cópia que a `meta-sync` deixa aqui de
 * hora em hora, e isso é o que faz "na ponta da língua" ser verdade: abrir a
 * tela é uma consulta local, sem token, sem limite de chamadas, sem esperar a
 * Meta responder. O botão "atualizar agora" existe para o dia em que alguém
 * mexeu na campanha há dois minutos e quer ver refletido.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Campanha, DiaDeCampanha } from "@/lib/metaAds";

const tabela = (nome: string) => supabase.from(nome as never) as never as {
  select: (c: string) => {
    order: (c: string, o?: unknown) => Promise<{ data: unknown; error: unknown }> & {
      gte: (c: string, v: string) => Promise<{ data: unknown; error: unknown }>;
      limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

export function useMetaCampanhas() {
  return useQuery({
    queryKey: ["meta", "campanhas"],
    staleTime: 60_000,
    queryFn: async (): Promise<Campanha[]> => {
      const { data, error } = await tabela("meta_campanhas").select("*").order("status").limit(500);
      if (error) throw error;
      return (data || []) as Campanha[];
    },
  });
}

/** O diário dos últimos `dias` dias, de todas as campanhas. */
export function useMetaDiario(dias = 30) {
  const desde = new Date();
  desde.setDate(desde.getDate() - (dias - 1));
  const iso = desde.toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["meta", "diario", iso],
    staleTime: 60_000,
    queryFn: async (): Promise<DiaDeCampanha[]> => {
      const { data, error } = await tabela("meta_campanhas_diario").select("*").order("dia").gte("dia", iso);
      if (error) throw error;
      return (data || []) as DiaDeCampanha[];
    },
  });
}

export interface SyncLog {
  id: string; rodada_em: string; ok: boolean;
  campanhas: number | null; dias: number | null; erro: string | null; duracao_ms: number | null;
}

/** A última rodada, para a tela dizer "atualizado há 12 min" ou "a Meta recusou". */
export function useMetaUltimaRodada() {
  return useQuery({
    queryKey: ["meta", "sync-log"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<SyncLog | null> => {
      const { data, error } = await tabela("meta_sync_log").select("*").order("rodada_em", { ascending: false }).limit(1);
      if (error) throw error;
      return ((data || []) as SyncLog[])[0] ?? null;
    },
  });
}

export function useInvalidarMeta() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["meta"] });
}

/**
 * Pede uma descida agora. `dias` maior é a primeira carga (a Meta guarda
 * até 37 meses, mas 90 dias é o que cabe numa chamada sem paginar demais).
 */
export async function sincronizarMeta(dias = 3) {
  const { data, error } = await supabase.functions.invoke("meta-sync", { body: { dias } });
  if (error) throw new Error(error.message);
  if (data && data.ok === false) throw new Error(String(data.error || "A Meta não respondeu"));
  return data as { ok: true; campanhas: number; dias: number; janela: number };
}
