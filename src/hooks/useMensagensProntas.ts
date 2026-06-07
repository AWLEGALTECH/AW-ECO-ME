import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Carrega as mensagens prontas de um usuário como um mapa chave -> conteúdo.
// Usado pra preencher a saudação no botão de WhatsApp e copiar a do
// Instagram. Cacheado por 60s (muda pouco).
export function useMensagensProntas(uid: string | null) {
  const q = useQuery({
    queryKey: ["mensagens-prontas", uid],
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("mensagens_prontas" as any)
        .select("chave, conteudo")
        .eq("user_id", uid);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const r of (data || []) as any[]) map[r.chave] = r.conteudo;
      return map;
    },
  });
  return { mensagens: q.data || {}, isLoading: q.isLoading, refetch: q.refetch };
}
