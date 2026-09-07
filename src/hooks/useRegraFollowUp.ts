/* A REGRA DE FOLLOW-UP DE CADA NÚMERO, e a exceção de cada contato.
 *
 * ─────────────────────────── a decisão do meio ──────────────────────────────
 *
 * Cada número escolhe de que lado começa: por padrão TODO MUNDO entra na régua,
 * ou por padrão NINGUÉM entra. São dois jeitos opostos e os dois são certos,
 * dependendo do número. No Portal, cobrar todo mundo é o certo: são leads de
 * anúncio, e sumir é o comportamento normal deles. No número do escritório é o
 * contrário — a maioria é cliente com processo andando, e uma cobrança
 * automática ali constrange quem já pagou.
 *
 * Sem essa chave, um dos dois números fica errado o tempo todo, e a única saída
 * seria desligar na mão, um por um, para sempre.
 *
 * ─────────────────────── e por que o contato tem TRÊS estados ───────────────
 *
 * `followup_ativo` é null, true ou false, e o null é o estado que faz o resto
 * funcionar: ele quer dizer "faço o que o número mandar". Se toda conversa
 * nascesse com true ou false gravado, mudar a regra do número não pegaria em
 * ninguém que já existe — a chave viraria enfeite no dia seguinte à instalação.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const tabela = (nome: string) => (supabase.from(nome as never) as never as any);

export interface RegraFollowUp {
  instancia: string;
  padrao_ativo: boolean;
  updated_at: string;
}

/**
 * A regra de um número. Sem linha gravada, ligado — que é como o sistema sempre
 * funcionou, e o que faz número novo já começar cobrando.
 */
export function useRegraFollowUp(instancia: string | null) {
  return useQuery({
    queryKey: ["wa", "followup", "regra", instancia],
    enabled: !!instancia,
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await tabela("wa_followup_regras")
        .select("padrao_ativo").ilike("instancia", instancia!).maybeSingle();
      if (error) throw error;
      return (data as RegraFollowUp | null)?.padrao_ativo ?? true;
    },
  });
}

export function useInvalidarRegra() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["wa", "followup", "regra"] });
}

export async function salvarRegraFollowUp(
  instancia: string, padraoAtivo: boolean, por?: string | null,
) {
  if (!instancia) throw new Error("Escolha o número antes de mudar a regra.");
  const { error } = await tabela("wa_followup_regras").upsert({
    instancia, padrao_ativo: padraoAtivo, atualizado_por: por ?? null,
  }, { onConflict: "instancia" });
  if (error) throw new Error(error.message);
}

/**
 * Liga, desliga ou devolve UM contato à regra do número.
 *
 * `null` é o terceiro estado e não um jeito de dizer "desliga": ele apaga a
 * opinião do contato e faz a conversa voltar a obedecer o número.
 *
 * A FUNÇÃO MORA NO BANCO porque desligar tem que cancelar as cobranças abertas
 * na MESMA transação. Fosse só um update na coluna, a cobrança já marcada
 * continuaria viva — e a pessoa seria cobrada amanhã depois de alguém dizer
 * hoje que não.
 *
 * Devolve se o contato ficou dentro ou fora da régua, já resolvendo os três
 * estados: quem chamou não precisa refazer a conta pra saber o que mostrar.
 */
export async function followUpDoContato(conversaId: string, ativo: boolean | null) {
  const { data, error } = await supabase.rpc("fn_wa_followup_do_contato" as never, {
    p_conversa: conversaId, p_ativo: ativo,
  } as never);
  if (error) throw new Error(error.message);
  return Boolean(data);
}
