import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { tocarSomNotificacao } from "@/lib/som";

export interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string | null;
  dados: Record<string, any> | null;
  link: string | null;
  actor_nome: string | null;
  created_at: string;
  lida: boolean;
}

// Central de notificações (o "sininho"). A RLS já filtra o que cada usuário
// pode ver (admin vê tudo; usuário comum só os tipos liberados na admin).
// O estado de "lida" é POR usuário, guardado em notificacao_lida.
export function useNotificacoes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["notificacoes", user?.id];

  const query = useQuery({
    queryKey: key,
    enabled: !!user,
    staleTime: 20_000,
    queryFn: async (): Promise<Notificacao[]> => {
      const [notifsRes, lidasRes] = await Promise.all([
        (supabase.from("notificacoes" as any) as any)
          .select("id,tipo,titulo,corpo,dados,link,actor_nome,created_at")
          .order("created_at", { ascending: false })
          .limit(50),
        (supabase.from("notificacao_lida" as any) as any)
          .select("notificacao_id")
          .eq("user_id", user!.id),
      ]);
      if (notifsRes.error) throw notifsRes.error;
      const lidas = new Set<string>((lidasRes.data || []).map((l: any) => l.notificacao_id));
      return (notifsRes.data || []).map((n: any) => ({ ...n, lida: lidas.has(n.id) }));
    },
  });

  // Realtime: novo insert em notificacoes -> refaz a query (respeitando RLS).
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("notificacoes-rt")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notificacoes" },
        () => {
          // Chegou notificação com o app aberto → toca o som e atualiza.
          tocarSomNotificacao();
          qc.invalidateQueries({ queryKey: ["notificacoes", user.id] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const notificacoes = query.data || [];
  const unread = notificacoes.filter((n) => !n.lida).length;

  const marcarUma = async (id: string) => {
    if (!user) return;
    qc.setQueryData<Notificacao[]>(key, (old) =>
      (old || []).map((n) => (n.id === id ? { ...n, lida: true } : n)));
    await (supabase.from("notificacao_lida" as any) as any)
      .upsert({ notificacao_id: id, user_id: user.id }, { onConflict: "notificacao_id,user_id" });
  };

  const marcarTodas = async () => {
    if (!user) return;
    const ids = notificacoes.filter((n) => !n.lida).map((n) => n.id);
    if (!ids.length) return;
    qc.setQueryData<Notificacao[]>(key, (old) =>
      (old || []).map((n) => ({ ...n, lida: true })));
    await (supabase.from("notificacao_lida" as any) as any)
      .upsert(ids.map((id) => ({ notificacao_id: id, user_id: user.id })), { onConflict: "notificacao_id,user_id" });
  };

  return { notificacoes, unread, isLoading: query.isLoading, marcarUma, marcarTodas };
}
