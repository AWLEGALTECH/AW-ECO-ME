// AS TASKS DO ATENDIMENTO, AGORA GRAVADAS.
//
// Antes elas viviam em estado de componente e sumiam ao recarregar. Servia pra
// discutir o formato; não serve pra trabalhar. A Adria marca "ligar pra dona
// Maria amanhã às 15h" e isso tem que estar lá amanhã, na máquina dela e na de
// quem mais abrir a tela.
//
// AGORA O FOLLOW-UP TAMBÉM VEM DAQUI, e essa é a virada.
// Antes ele era CALCULADO: "esse lead está parado há 12 dias, logo devia ter
// levado três cobranças". A conta não sabe o que foi realmente feito, não sabe
// quem fez, e o "feito" morria ao recarregar a página. Agora cada cobrança é
// uma linha, criada pela cadência no banco (fn_wa_followups_sincronizar) e
// concluída de verdade — concluir uma abre a próxima.
// As duas verdades que eu temia aqui deixaram de existir porque sobrou uma só:
// a linha. A conta saiu.
//
// A JANELA DE 60 DIAS PRA TRÁS E 180 PRA FRENTE existe pro calendário. Ele
// precisa saber em quais dias há task pra pintar o pontinho, e isso é a lista
// inteira, não só a do dia aberto. Como é um lembrete por lead e por dia, o
// volume cabe folgado numa consulta só — paginar aqui seria complicar por
// esporte.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { telefoneBonito } from "@/lib/wa";
import type { Task } from "@/lib/tasksAtendimento";

const tabela = (nome: string) => (supabase.from(nome as never) as never as any);

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export interface TaskRow {
  id: string;
  conversa_id: string;
  titulo: string;
  detalhe: string | null;
  dia: string;
  hora: string | null;
  feita: boolean;
  tipo: string;
  rodada: number | null;
  wa_conversas: { instancia: string; nome_wa: string | null; telefone: string } | null;
}

/** O nome que a task mostra. Sem nome no WhatsApp, o telefone formatado. */
export function nomeDoLead(nome: string | null | undefined, telefone: string): string {
  const n = String(nome || "").trim();
  return n.length > 0 ? n : telefoneBonito(telefone);
}

/** A linha do banco no formato que a fila do dia já sabe ordenar e desenhar. */
export function taskDaLinha(r: TaskRow): Task {
  return {
    id: r.id,
    tipo: r.tipo === "follow_up" ? "follow_up" : "lembrete",
    rodada: r.rodada ?? undefined,
    leadId: r.conversa_id,
    lead: nomeDoLead(r.wa_conversas?.nome_wa, r.wa_conversas?.telefone ?? ""),
    titulo: r.titulo,
    detalhe: r.detalhe ?? "",
    data: r.dia,
    // Postgres devolve `time` como "15:00:00"; a tela e a ordenação só querem
    // HH:MM, e comparar "15:00" com "15:00:00" daria diferente sem motivo.
    hora: r.hora ? r.hora.slice(0, 5) : null,
    feita: r.feita,
  };
}

export function useTasksWa(instancia: string | null) {
  return useQuery({
    queryKey: ["wa", "tasks", instancia],
    enabled: !!instancia,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Task[]> => {
      const hoje = new Date();
      const de = new Date(hoje); de.setDate(de.getDate() - 60);
      const ate = new Date(hoje); ate.setDate(ate.getDate() + 180);

      const { data, error } = await tabela("wa_tasks")
        // !inner porque a task só existe se a conversa existir, e é o join que
        // permite filtrar pela instância — task da PDA não aparece no dia de
        // quem está olhando o número do escritório.
        .select("id, conversa_id, titulo, detalhe, dia, hora, feita, tipo, rodada, wa_conversas!inner(instancia, nome_wa, telefone)")
        // CANCELADA NÃO É TASK. Ela existe pro histórico saber por que a
        // cobrança deixou de fazer sentido — não pra reaparecer numa fila que
        // ninguém pode trabalhar.
        .is("cancelada_em", null)
        .ilike("wa_conversas.instancia", instancia!)
        .gte("dia", iso(de))
        .lte("dia", iso(ate))
        .order("dia")
        .order("hora", { nullsFirst: false });
      if (error) throw error;
      return ((data || []) as TaskRow[]).map(taskDaLinha);
    },
  });
}

export async function criarTaskWa(args: {
  conversaId: string;
  titulo: string;
  detalhe?: string | null;
  dia: string;
  hora?: string | null;
  criadoPor?: string | null;
}) {
  // Devolve o id porque as mensagens retidas se penduram nele: sem o vínculo,
  // reabrir o lembrete não encontraria o que ele mandou agendar.
  const { data, error } = await tabela("wa_tasks").insert({
    conversa_id: args.conversaId,
    titulo: args.titulo.trim(),
    detalhe: args.detalhe?.trim() || null,
    dia: args.dia,
    hora: args.hora || null,
    criado_por: args.criadoPor ?? null,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/**
 * Marca ou desmarca.
 *
 * `feita_em` e `feita_por` acompanham o estado em vez de só serem preenchidos:
 * desmarcar e deixar o carimbo antigo faria o histórico dizer que alguém
 * concluiu uma task que está aberta.
 */
export async function alternarTaskWa(id: string, feita: boolean, quem?: string | null) {
  const { error } = await tabela("wa_tasks").update({
    feita,
    feita_em: feita ? new Date().toISOString() : null,
    feita_por: feita ? (quem ?? null) : null,
  }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Edita um lembrete que já existe.
 *
 * Só os campos passados mudam. O `feita` fica de fora de propósito: concluir
 * tem caminho próprio (com confirmação, e no follow-up abrindo a próxima da
 * régua), e deixar que uma edição de texto marque algo como feito seria a porta
 * de entrada pro tipo de engano que a confirmação existe pra evitar.
 */
export async function atualizarTaskWa(id: string, campos: {
  titulo?: string;
  detalhe?: string | null;
  dia?: string;
  hora?: string | null;
}) {
  const { error } = await tabela("wa_tasks").update({
    ...(campos.titulo !== undefined ? { titulo: campos.titulo } : {}),
    ...(campos.detalhe !== undefined ? { detalhe: campos.detalhe } : {}),
    ...(campos.dia !== undefined ? { dia: campos.dia } : {}),
    ...(campos.hora !== undefined ? { hora: campos.hora } : {}),
  }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function apagarTaskWa(id: string) {
  const { error } = await tabela("wa_tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export function useInvalidarTasksWa() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["wa", "tasks"] });
}

/**
 * Põe a cadência em dia: cria a cobrança de quem acabou de silenciar e cancela
 * a de quem respondeu, fechou ou foi arquivado.
 *
 * É chamada ao abrir a tela, e é idempotente — rodar duas vezes seguidas não
 * muda nada na segunda. Devolve os dois números porque "rodou e não fez nada"
 * e "rodou e criou sete" precisam ser distinguíveis de fora.
 */
export async function sincronizarFollowUps(instancia: string | null) {
  const { data, error } = await supabase.rpc("fn_wa_followups_sincronizar" as never, {
    p_instancia: instancia,
  } as never);
  if (error) throw new Error(error.message);
  // A função devolve uma linha só, mas o PostgREST embrulha `returns table`
  // num array — e devolve null quando não há linha nenhuma. Os dois casos
  // precisam sobreviver, senão a tela quebra por causa de um contador.
  const bruto = data as unknown;
  const linha = (Array.isArray(bruto) ? bruto[0] : bruto) as
    { criadas?: number; canceladas?: number } | null | undefined;
  return { criadas: linha?.criadas ?? 0, canceladas: linha?.canceladas ?? 0 };
}

/**
 * Conclui uma cobrança e abre a próxima da régua.
 *
 * O próximo vencimento conta do dia de HOJE — de quando a cobrança foi
 * realmente feita — e não do calendário original. Uma cobrança atrasada não
 * pode empurrar a seguinte pro dia seguinte.
 *
 * Devolve o id da próxima, ou null quando a régua acabou: aí o lead sai da
 * cadência com as cinco tentativas registradas, que é o desfecho e não um
 * sumiço.
 */
export async function concluirFollowUp(taskId: string, quem?: string | null) {
  const { data, error } = await supabase.rpc("fn_wa_followup_concluir" as never, {
    p_task: taskId, p_por: quem ?? null,
  } as never);
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

/**
 * A TRAVA: "esse atendimento acabou".
 *
 * A única saída automática da régua é o lead responder. Mas há uma saída
 * humana que o sistema não tinha: cliente que virou processo, pessoa que pediu
 * pra não insistir, caso que morreu por fora do chat. Sem isso o lead fica na
 * fila para sempre, inflando a métrica com trabalho que ninguém vai fazer.
 *
 * Não é o mesmo que `etapa = 'fechado'`: aquilo quer dizer VIROU CLIENTE, e
 * "não insiste mais" acontece muito com quem não fechou. Juntar os dois faria
 * a taxa de fechamento subir toda vez que alguém desistisse de um lead.
 */
export async function finalizarAtendimento(conversaId: string, finalizado: boolean, quem?: string | null) {
  const { data, error } = await supabase.rpc("fn_wa_atendimento_finalizar" as never, {
    p_conversa: conversaId, p_finalizado: finalizado, p_por: quem ?? null,
  } as never);
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}
