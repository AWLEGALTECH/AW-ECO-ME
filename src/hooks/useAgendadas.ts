/* AS MENSAGENS RETIDAS, do lado do navegador.
 *
 * Uma mensagem retida é diferente de tudo que este módulo faz: ela sai sozinha,
 * possivelmente com o escritório fechado. Duas consequências práticas moram
 * aqui:
 *
 * 1. O ARQUIVO SOBE ANTES DE A LINHA EXISTIR. Fosse ao contrário, uma falha no
 *    upload deixaria uma retenção agendada apontando pra um arquivo que nunca
 *    chegou — e ela só falharia na hora do disparo, de madrugada, quando não há
 *    ninguém pra reanexar.
 *
 * 2. CANCELAR SÓ VALE ENQUANTO ESTÁ `pendente`. Depois que o despachante toma a
 *    linha, o WhatsApp já está a caminho e não existe desfazer. A condição está
 *    no `.eq("status", "pendente")` do update, e não num `if` antes dele: entre
 *    ler e escrever cabe exatamente o segundo em que o cron passa.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TipoRetido } from "@/lib/retencao";

const tabela = (nome: string) => (supabase.from(nome as never) as never as any);

export interface AgendadaRow {
  id: string;
  conversa_id: string;
  task_id: string | null;
  quando: string;
  tipo: TipoRetido;
  texto: string | null;
  midia_path: string | null;
  midia_mime: string | null;
  midia_nome: string | null;
  duracao: number | null;
  status: "pendente" | "enviando" | "enviada" | "cancelada" | "falhou";
  tentativas: number;
  erro: string | null;
  enviada_em: string | null;
  criada_por: string | null;
  created_at: string;
}

/**
 * As retenções que ainda vão acontecer, ou que falharam.
 *
 * As enviadas ficam de fora de propósito: elas já viraram mensagem de verdade
 * na conversa, e mostrá-las de novo faria a mesma mensagem aparecer duas vezes
 * na tela. As que FALHARAM entram porque são a única forma de alguém descobrir
 * que um envio não aconteceu.
 */
export function useAgendadas(instancia: string | null) {
  return useQuery({
    queryKey: ["wa", "agendadas", instancia],
    enabled: !!instancia,
    // Mais curto que o das tasks: uma retenção que sai às 14:00 precisa sumir
    // da tela por volta das 14:00, e não no minuto seguinte ao próximo café.
    refetchInterval: 30_000,
    queryFn: async (): Promise<AgendadaRow[]> => {
      const { data, error } = await tabela("wa_agendadas")
        .select("id, conversa_id, task_id, quando, tipo, texto, midia_path, midia_mime, midia_nome, duracao, status, tentativas, erro, enviada_em, criada_por, created_at, wa_conversas!inner(instancia)")
        .ilike("wa_conversas.instancia", instancia!)
        .in("status", ["pendente", "enviando", "falhou"])
        .order("quando");
      if (error) throw error;
      return (data || []) as AgendadaRow[];
    },
  });
}

export function useInvalidarAgendadas() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["wa", "agendadas"] });
}

/** Nome de arquivo que sobrevive a um caminho de URL. */
const nomeSeguro = (n: string) =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(-80);

/**
 * Retém uma mensagem para sair na hora marcada.
 *
 * O arquivo, quando há, sobe primeiro — para o MESMO bucket das mensagens
 * enviadas à mão. Isso não é economia de código: é o que faz a bolha da
 * conversa desenhar a mensagem agendada exatamente como desenharia a enviada,
 * sem precisar saber qual das duas ela é.
 */
export async function reterMensagem(args: {
  conversaId: string;
  taskId?: string | null;
  quando: Date;
  texto?: string | null;
  arquivo?: Blob | null;
  nomeArquivo?: string | null;
  tipo: TipoRetido;
  duracao?: number | null;
  criadaPor?: string | null;
}) {
  let midiaPath: string | null = null;
  let mime: string | null = null;

  if (args.arquivo) {
    mime = args.arquivo.type || "application/octet-stream";
    const nome = args.nomeArquivo || "arquivo";
    midiaPath = `agendados/${args.conversaId}/${Date.now()}_${nomeSeguro(nome)}`;
    const { error } = await supabase.storage
      .from("wa-midia").upload(midiaPath, args.arquivo, { contentType: mime, upsert: false });
    if (error) throw new Error(`Não consegui subir o arquivo: ${error.message}`);
  }

  const { data, error } = await tabela("wa_agendadas").insert({
    conversa_id: args.conversaId,
    task_id: args.taskId ?? null,
    quando: args.quando.toISOString(),
    tipo: args.tipo,
    texto: args.texto?.trim() || null,
    midia_path: midiaPath,
    midia_mime: mime,
    midia_nome: args.arquivo ? (args.nomeArquivo || "arquivo") : null,
    duracao: args.duracao ?? null,
    criada_por: args.criadaPor ?? null,
  }).select("id").single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

/**
 * Edita uma mensagem retida que ainda não saiu.
 *
 * O `.eq("status", "pendente")` é a mesma trava do cancelamento, e pelo mesmo
 * motivo: entre ler o status e escrever cabe o segundo em que o despachante
 * toma a linha. Editar depois disso mudaria a linha do banco sem mudar o que o
 * cliente já recebeu — a tela mostraria uma mensagem que nunca foi mandada.
 *
 * O arquivo não se troca por aqui. Trocar mídia é subir outra e apagar a
 * anterior do bucket; enquanto ninguém pedir isso, quem quer outro arquivo
 * cancela e agenda de novo, que é explícito e não deixa lixo.
 */
export async function editarAgendada(id: string, campos: { texto?: string | null; quando?: Date }) {
  const { data, error } = await tabela("wa_agendadas")
    .update({
      ...(campos.texto !== undefined ? { texto: campos.texto?.trim() || null } : {}),
      ...(campos.quando !== undefined ? { quando: campos.quando.toISOString() } : {}),
    })
    .eq("id", id).eq("status", "pendente")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Essa mensagem já saiu — não dá mais pra editar.");
  }
}

/**
 * Cancela antes da hora.
 *
 * O `.eq("status", "pendente")` é a trava, e ela precisa estar no UPDATE: ler o
 * status e depois decidir deixaria aberta a fração de segundo em que o
 * despachante toma a linha — e o cancelamento diria "cancelei" para uma
 * mensagem que já saiu.
 */
export async function cancelarAgendada(id: string) {
  const { data, error } = await tabela("wa_agendadas")
    .update({ status: "cancelada" })
    .eq("id", id).eq("status", "pendente")
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Essa mensagem já saiu — não dá mais pra cancelar.");
  }
}
