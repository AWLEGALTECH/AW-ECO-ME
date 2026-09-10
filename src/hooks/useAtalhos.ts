/* OS ATALHOS DE MENSAGEM, do lado do navegador.
 *
 * A lista é curta, é a mesma para todo mundo e muda pouco: uma consulta só,
 * cacheada, servindo todas as conversas. Recarregar por conversa aberta seria
 * pagar cinquenta vezes pela mesma lista de dez linhas.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Atalho } from "@/lib/atalhos";

const tabela = (nome: string) => (supabase.from(nome as never) as never as any);

export function useAtalhos() {
  return useQuery({
    queryKey: ["wa", "atalhos"],
    // Muda quando alguém cria um atalho, e quem cria é quem está olhando: a
    // invalidação depois de salvar chega antes de qualquer intervalo.
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Atalho[]> => {
      const { data, error } = await tabela("wa_atalhos")
        .select("id, comando, conteudo")
        .order("comando");
      if (error) throw error;
      return (data || []) as Atalho[];
    },
  });
}

/** Cria ou atualiza. O comando já vem normalizado e conferido pela tela. */
export async function salvarAtalho(args: {
  id?: string | null;
  comando: string;
  conteudo: string;
  criadoPor?: string | null;
}): Promise<void> {
  const campos = { comando: args.comando, conteudo: args.conteudo };
  const { error } = args.id
    ? await tabela("wa_atalhos").update(campos).eq("id", args.id)
    : await tabela("wa_atalhos").insert({ ...campos, criado_por: args.criadoPor ?? null });
  if (error) {
    // 23505 = o índice único do comando. Duas pessoas criando "/extrato" no
    // mesmo minuto é o caso que a tela não tem como prever sozinha.
    if ((error as { code?: string }).code === "23505") throw new Error(`Já existe um atalho /${args.comando}.`);
    throw error;
  }
}

export async function removerAtalho(id: string): Promise<void> {
  const { error } = await tabela("wa_atalhos").delete().eq("id", id);
  if (error) throw error;
}

export function useInvalidarAtalhos() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["wa", "atalhos"] });
}
