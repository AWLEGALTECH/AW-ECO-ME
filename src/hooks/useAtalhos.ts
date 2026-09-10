/* OS ATALHOS DE MENSAGEM, do lado do navegador.
 *
 * A lista é curta, é a mesma para todo mundo e muda pouco: uma consulta só,
 * cacheada, servindo todas as conversas. Recarregar por conversa aberta seria
 * pagar cinquenta vezes pela mesma lista de dez linhas.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Atalho } from "@/lib/atalhos";
import { midiasDaLinha, resumoDasMidias, type AnexoLocal, type Midia } from "@/lib/anexos";
import { subirAnexos } from "@/lib/anexosBucket";

const tabela = (nome: string) => (supabase.from(nome as never) as never as any);

export function useAtalhos() {
  return useQuery({
    queryKey: ["wa", "atalhos"],
    // Muda quando alguém cria um atalho, e quem cria é quem está olhando: a
    // invalidação depois de salvar chega antes de qualquer intervalo.
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Atalho[]> => {
      const { data, error } = await tabela("wa_atalhos")
        .select("id, comando, conteudo, tipo, midia_path, midia_mime, midia_nome, duracao, midias")
        .order("comando");
      if (error) throw error;
      // `midiasDaLinha` aceita as duas formas: a lista nova e a coluna solta
      // das linhas antigas. Quem desenha a tela não precisa saber a época.
      return (data || []).map((l: Record<string, unknown>) => ({
        id: String(l.id),
        comando: String(l.comando),
        conteudo: String(l.conteudo ?? ""),
        midias: midiasDaLinha(l as never),
      })) as Atalho[];
    },
  });
}

/** Cria ou atualiza. O comando já vem normalizado e conferido pela tela. */
export async function salvarAtalho(args: {
  id?: string | null;
  comando: string;
  conteudo: string;
  criadoPor?: string | null;
  /** os anexos que já estavam no atalho e ficam */
  anexosMantidos?: Midia[];
  /** os arquivos novos, ainda no computador */
  anexosNovos?: AnexoLocal[];
}): Promise<void> {
  /* Sobe ANTES de gravar: um caminho na linha que não existe no balde é pior
     que não gravar nada, porque só aparece na hora de usar o atalho, na frente
     do cliente. */
  const subidos = await subirAnexos(args.anexosNovos ?? [], `atalhos/${args.comando}`);
  const midias = [...(args.anexosMantidos ?? []), ...subidos];
  const campos = {
    comando: args.comando,
    conteudo: args.conteudo,
    ...resumoDasMidias(midias),
  };
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
