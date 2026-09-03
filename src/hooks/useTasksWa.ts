// AS TASKS DO ATENDIMENTO, AGORA GRAVADAS.
//
// Antes elas viviam em estado de componente e sumiam ao recarregar. Servia pra
// discutir o formato; não serve pra trabalhar. A Adria marca "ligar pra dona
// Maria amanhã às 15h" e isso tem que estar lá amanhã, na máquina dela e na de
// quem mais abrir a tela.
//
// SÓ LEMBRETE VEM DAQUI. Follow-up continua sendo calculado da cadência de dias
// parados (src/lib/tasksAtendimento.ts) e nunca é gravado: guardar os dois no
// banco criaria duas verdades sobre o mesmo lead — a linha de ontem e a conta
// de hoje — que divergem no primeiro dia em que alguém mexer na conversa.
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
    tipo: "lembrete",
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
        .select("id, conversa_id, titulo, detalhe, dia, hora, feita, wa_conversas!inner(instancia, nome_wa, telefone)")
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
  const { error } = await tabela("wa_tasks").insert({
    conversa_id: args.conversaId,
    titulo: args.titulo.trim(),
    detalhe: args.detalhe?.trim() || null,
    dia: args.dia,
    hora: args.hora || null,
    criado_por: args.criadoPor ?? null,
  });
  if (error) throw new Error(error.message);
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

export async function apagarTaskWa(id: string) {
  const { error } = await tabela("wa_tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export function useInvalidarTasksWa() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["wa", "tasks"] });
}
