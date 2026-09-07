/* AS MENSAGENS PADRÃO DA RÉGUA, do lado do navegador.
 *
 * Uma por rodada. O que muda entre a cobrança de 1 dia e a de 60 é o TOM — a
 * primeira retoma, a última encerra — e tom é decisão do escritório, tomada uma
 * vez e escrita num lugar só. O que muda entre dois leads da mesma rodada é o
 * nome, e disso o próprio texto dá conta.
 *
 * POR ORA É MODELO, NÃO DISPARO. Nada aqui sai sozinho: quem manda continua
 * sendo uma pessoa olhando a conversa. Isso é deliberado — a retenção já mostrou
 * o tamanho do cuidado que uma mensagem automática exige, e ligar cinco delas de
 * uma vez, para toda a carteira, seria começar pelo lado perigoso. Guardar o
 * texto já resolve sozinho o problema de hoje: cinco pessoas escrevendo a mesma
 * cobrança de cinco jeitos.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TipoRetido } from "@/lib/retencao";
import { resumoDasMidias, type AnexoLocal, type Midia } from "@/lib/anexos";
import { subirAnexos } from "@/lib/anexosBucket";

const tabela = (nome: string) => (supabase.from(nome as never) as never as any);

export interface ModeloFollowUp {
  rodada: number;
  tipo: TipoRetido;
  texto: string | null;
  midia_path: string | null;
  midia_mime: string | null;
  midia_nome: string | null;
  duracao: number | null;
  /* Todos os anexos da mensagem padrão, em ordem. As colunas `midia_*` acima
     guardam o primeiro deles. */
  midias: Midia[];
  ativo: boolean;
  atualizado_por: string | null;
  updated_at: string;
}

export function useModelosFollowUp() {
  return useQuery({
    queryKey: ["wa", "followup", "modelos"],
    // Não recarrega sozinho: isto muda quando alguém decide mudar, não com o
    // tempo. Um intervalo aqui seria consulta ao banco para não ver diferença.
    staleTime: 60_000,
    queryFn: async (): Promise<ModeloFollowUp[]> => {
      const { data, error } = await tabela("wa_followup_modelos")
        .select("rodada, tipo, texto, midia_path, midia_mime, midia_nome, duracao, midias, ativo, atualizado_por, updated_at")
        .order("rodada");
      if (error) throw error;
      return (data || []) as ModeloFollowUp[];
    },
  });
}

export function useInvalidarModelos() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["wa", "followup", "modelos"] });
}

/**
 * Grava a mensagem padrão de uma rodada.
 *
 * `upsert` pela rodada: a linha existe ou não, e quem escreve não deveria
 * precisar saber disso. Os arquivos sobem antes, no MESMO bucket das mensagens
 * enviadas à mão — quando isto virar disparo, o despachante vai lê-los pelos
 * caminhos que já conhece.
 *
 * O QUE ESTÁ NO EDITOR É O QUE FICA GRAVADO, inclusive a ausência de anexo:
 * o editor abre com os anexos atuais, então salvar sem eles é uma decisão de
 * tirar. Preservar o que não veio faria a rodada mandar um arquivo que ninguém
 * escolheu, e sem lugar nenhum na tela pra descobrir isso antes do cliente.
 */
export async function salvarModeloFollowUp(args: {
  rodada: number;
  texto?: string | null;
  /** os que ainda estão no computador de quem escreve */
  anexosNovos?: AnexoLocal[];
  /** os que já estavam gravados e a pessoa manteve */
  anexosMantidos?: Midia[];
  por?: string | null;
}) {
  const subidos = await subirAnexos(args.anexosNovos ?? [], `agendados/modelos/${args.rodada}`);
  const midias = [...(args.anexosMantidos ?? []), ...subidos];

  const { error } = await tabela("wa_followup_modelos").upsert({
    rodada: args.rodada,
    texto: args.texto?.trim() || null,
    ...resumoDasMidias(midias),
    ativo: true,
    atualizado_por: args.por ?? null,
  }, { onConflict: "rodada" });
  if (error) throw new Error(error.message);
}

/**
 * Desliga a mensagem de uma rodada, sem apagar o texto.
 *
 * Apagar para "desligar" perderia o que já foi escrito — e a decisão de não usar
 * agora quase nunca é a decisão de jogar fora.
 */
export async function alternarModeloAtivo(rodada: number, ativo: boolean) {
  const { error } = await tabela("wa_followup_modelos")
    .update({ ativo }).eq("rodada", rodada);
  if (error) throw new Error(error.message);
}
