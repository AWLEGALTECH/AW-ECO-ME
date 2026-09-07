/* A RÉGUA AJUSTÁVEL, do lado do navegador.
 *
 * De quantos em quantos dias cobrar quem sumiu não é uma constante do sistema:
 * é uma decisão do escritório, e ela muda com o mês. Estava escrita em `const`,
 * o que significava que mudá-la custava um deploy — e por custar um deploy,
 * nunca mudava.
 *
 * QUEM MANDA CONTINUA SENDO O BANCO. `fn_wa_cadencia()` lê da mesma tabela, e é
 * ela que agenda a próxima cobrança quando alguém conclui uma. Isto aqui é só a
 * leitura da tela: mudar o número na tela muda a fila de amanhã porque os dois
 * lados olham a mesma linha, não porque a tela avisou o banco.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { reguaValida, TOTAL_RODADAS, type Regua } from "@/lib/followUp";

const tabela = (nome: string) => (supabase.from(nome as never) as never as any);

export interface DegrauDaRegua {
  rodada: number;
  dias: number;
  updated_at: string;
  atualizado_por: string | null;
}

/**
 * A régua em uso, sempre com as cinco rodadas.
 *
 * O `select` devolve o array já completado pelo padrão: quem consome não pode
 * ter que decidir o que fazer com uma régua de três degraus, e a alternativa
 * (não mostrar nada) esconderia a fila do dia por causa de uma linha faltando.
 */
export function useCadenciaFollowUp() {
  return useQuery({
    queryKey: ["wa", "followup", "cadencia"],
    // Como as mensagens padrão: isto muda quando alguém decide mudar, não com
    // o tempo. Recarregar sozinho seria consulta ao banco pra não ver diferença.
    staleTime: 60_000,
    queryFn: async (): Promise<Regua> => {
      const { data, error } = await tabela("wa_followup_cadencia")
        .select("rodada, dias").order("rodada");
      if (error) throw error;
      const linhas = (data || []) as DegrauDaRegua[];
      const dias: number[] = [];
      for (const l of linhas) if (l.rodada >= 1 && l.rodada <= TOTAL_RODADAS) dias[l.rodada - 1] = l.dias;
      return reguaValida(dias);
    },
  });
}

export function useInvalidarCadencia() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["wa", "followup", "cadencia"] });
}

/**
 * Muda o degrau de uma rodada.
 *
 * A ORDEM É COBRADA PELO BANCO, por um gatilho, e não aqui: a tela é um dos
 * lugares de onde essa linha pode ser escrita, e a regra que sustenta o
 * agendamento não pode morar só no lugar mais fácil de contornar. O que sobra
 * aqui é traduzir a recusa para uma frase que se entenda sem saber o que é
 * `check_violation`.
 */
export async function salvarDegrauDaRegua(rodada: number, dias: number, por?: string | null) {
  if (!Number.isFinite(dias) || dias < 1 || dias > 365) {
    throw new Error("O degrau precisa estar entre 1 e 365 dias.");
  }
  const { error } = await tabela("wa_followup_cadencia")
    .upsert({ rodada, dias: Math.round(dias), atualizado_por: por ?? null }, { onConflict: "rodada" });
  if (error) {
    throw new Error(/precisa subir|check/i.test(error.message)
      ? "Cada rodada tem que esperar mais dias que a anterior."
      : error.message);
  }
}
