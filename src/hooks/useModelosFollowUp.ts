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

const tabela = (nome: string) => (supabase.from(nome as never) as never as any);

export interface ModeloFollowUp {
  rodada: number;
  tipo: TipoRetido;
  texto: string | null;
  midia_path: string | null;
  midia_mime: string | null;
  midia_nome: string | null;
  duracao: number | null;
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
        .select("rodada, tipo, texto, midia_path, midia_mime, midia_nome, duracao, ativo, atualizado_por, updated_at")
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

const nomeSeguro = (n: string) =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(-80);

/**
 * Grava a mensagem padrão de uma rodada.
 *
 * `upsert` pela rodada: a linha existe ou não, e quem escreve não deveria
 * precisar saber disso. O arquivo sobe antes, no MESMO bucket das mensagens
 * enviadas à mão — quando isto virar disparo, o despachante vai lê-lo pelo
 * caminho que já conhece.
 */
export async function salvarModeloFollowUp(args: {
  rodada: number;
  texto?: string | null;
  arquivo?: Blob | null;
  nomeArquivo?: string | null;
  tipo: TipoRetido;
  duracao?: number | null;
  por?: string | null;
}) {
  let midiaPath: string | null = null;
  let mime: string | null = null;

  if (args.arquivo) {
    mime = args.arquivo.type || "application/octet-stream";
    const nome = args.nomeArquivo || "arquivo";
    midiaPath = `agendados/modelos/${args.rodada}_${Date.now()}_${nomeSeguro(nome)}`;
    const { error } = await supabase.storage
      .from("wa-midia").upload(midiaPath, args.arquivo, { contentType: mime, upsert: false });
    if (error) throw new Error(`Não consegui subir o arquivo: ${error.message}`);
  }

  const { error } = await tabela("wa_followup_modelos").upsert({
    rodada: args.rodada,
    tipo: args.tipo,
    texto: args.texto?.trim() || null,
    // Trocar de mídia limpa o caminho antigo; manter o anterior quando o novo
    // não veio faria a rodada mandar um arquivo que ninguém escolheu.
    midia_path: midiaPath,
    midia_mime: mime,
    midia_nome: args.arquivo ? (args.nomeArquivo || "arquivo") : null,
    duracao: args.duracao ?? null,
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
