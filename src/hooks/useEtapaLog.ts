/* O LOG DA JORNADA, do lado do navegador.
 *
 * A jornada mostrava onde o lead ESTÁ. Isso responde "e o Joel?" e não responde
 * o que se pergunta em seguida: há quanto tempo ele está parado em Extrato, se
 * já chegou em Proposta e voltou, quantas vezes passou pelo mesmo lugar. Um
 * lead que bateu duas vezes em Proposta e voltou nas duas tem uma história, e
 * ela estava sendo sobrescrita a cada mudança.
 *
 * DE UMA CONVERSA SÓ, e não de todas. O log é lido quando alguém abre a ficha
 * de alguém; carregar o histórico das cinquenta conversas da caixa para desenhar
 * a de uma seria pagar por quarenta e nove que ninguém vai olhar.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const tabela = (nome: string) => (supabase.from(nome as never) as never as any);

export interface PassagemDeEtapa {
  id: string;
  conversa_id: string;
  etapa: string;
  /** de onde veio; nulo na primeira passagem da conversa */
  de: string | null;
  entrou_em: string;
  por: string | null;
  /** veio da carga inicial: a etapa é certa, a data não */
  estimado: boolean;
}

export function useEtapaLog(conversaId: string | null) {
  return useQuery({
    queryKey: ["wa", "etapaLog", conversaId],
    enabled: !!conversaId,
    // Muda quando alguém move a etapa, e quem move é quem está olhando: a
    // invalidação depois do movimento chega antes de qualquer intervalo.
    staleTime: 30_000,
    queryFn: async (): Promise<PassagemDeEtapa[]> => {
      const { data, error } = await tabela("wa_etapa_log")
        .select("id, conversa_id, etapa, de, entrou_em, por, estimado")
        .eq("conversa_id", conversaId!)
        .order("entrou_em");
      if (error) throw error;
      return (data || []) as PassagemDeEtapa[];
    },
  });
}

export function useInvalidarEtapaLog() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["wa", "etapaLog"] });
}
