/* O PRIMEIRO ATENDIMENTO, do lado do navegador.
 *
 * Três coisas por número: os interruptores, a grade de horários e as três
 * mensagens. Ficam em consultas separadas porque mudam em ritmos diferentes: a
 * grade se mexe uma vez por mês, o "estou fora agora" se mexe no meio da tarde.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { midiasDaLinha, resumoDasMidias, type AnexoLocal, type Midia } from "@/lib/anexos";
import { subirAnexos } from "@/lib/anexosBucket";
import type { Faixa, Horario } from "@/lib/horarioAtendimento";

const tabela = (nome: string) => (supabase.from(nome as never) as never as any);

export interface AtendimentoConfig {
  instancia: string;
  ativo: boolean;
  fuso: string;
  /** a data marcada como fechada; quando é hoje, o dia inteiro é fechado */
  fechado_em: string | null;
  fora_agora: boolean;
  fora_desde: string | null;
}

export interface MsgDaFaixa {
  faixa: Faixa;
  texto: string;
  midias: Midia[];
}

export function useAtendimentoConfig(instancia: string | null) {
  return useQuery({
    queryKey: ["wa", "atendimento", "config", instancia],
    enabled: !!instancia,
    staleTime: 30_000,
    queryFn: async (): Promise<AtendimentoConfig | null> => {
      const { data, error } = await tabela("wa_atendimento_config")
        .select("instancia, ativo, fuso, fechado_em, fora_agora, fora_desde")
        .eq("instancia", instancia).maybeSingle();
      if (error) throw error;
      return (data ?? null) as AtendimentoConfig | null;
    },
  });
}

export function useHorarios(instancia: string | null) {
  return useQuery({
    queryKey: ["wa", "atendimento", "horarios", instancia],
    enabled: !!instancia,
    staleTime: 30_000,
    queryFn: async (): Promise<Horario[]> => {
      const { data, error } = await tabela("wa_horarios")
        .select("id, dia, inicio, fim, faixa")
        .eq("instancia", instancia).order("dia").order("inicio");
      if (error) throw error;
      // O banco devolve "08:00:00"; a grade trabalha em "08:00".
      return ((data ?? []) as Record<string, string>[]).map((h) => ({
        id: h.id, dia: Number(h.dia), faixa: h.faixa as Horario["faixa"],
        inicio: String(h.inicio).slice(0, 5), fim: String(h.fim).slice(0, 5),
      }));
    },
  });
}

export function useMsgsDoAtendimento(instancia: string | null) {
  return useQuery({
    queryKey: ["wa", "atendimento", "msgs", instancia],
    enabled: !!instancia,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, MsgDaFaixa>> => {
      const { data, error } = await tabela("wa_atendimento_msgs")
        .select("faixa, texto, tipo, midia_path, midia_mime, midia_nome, duracao, midias")
        .eq("instancia", instancia);
      if (error) throw error;
      const mapa: Record<string, MsgDaFaixa> = {};
      for (const l of (data ?? []) as Record<string, unknown>[]) {
        mapa[String(l.faixa)] = {
          faixa: l.faixa as Faixa,
          texto: String(l.texto ?? ""),
          midias: midiasDaLinha(l as never),
        };
      }
      return mapa;
    },
  });
}

export async function salvarConfigAtendimento(
  instancia: string, patch: Partial<Omit<AtendimentoConfig, "instancia">>, userId?: string | null,
) {
  const { error } = await tabela("wa_atendimento_config")
    .upsert({ instancia, ...patch, atualizado_por: userId ?? null, updated_at: new Date().toISOString() },
      { onConflict: "instancia" });
  if (error) throw error;
}

/**
 * A grade inteira daquele número, de uma vez.
 *
 * Apaga e regrava, em vez de acertar linha por linha: a tela trabalha pintando,
 * e depois de um arrasto não existe "a faixa que mudou" — existe um dia novo.
 * Comparar para descobrir o mínimo de comandos seria trabalho para chegar ao
 * mesmo lugar, com mais chance de deixar sobra.
 */
export async function salvarHorarios(instancia: string, horarios: Horario[]) {
  const { error: eDel } = await tabela("wa_horarios").delete().eq("instancia", instancia);
  if (eDel) throw eDel;
  if (horarios.length === 0) return;
  const linhas = horarios.map((h) => ({
    instancia, dia: h.dia, inicio: h.inicio, fim: h.fim, faixa: h.faixa,
  }));
  const { error } = await tabela("wa_horarios").insert(linhas);
  if (error) throw error;
}

export async function salvarMsgDaFaixa(args: {
  instancia: string;
  faixa: Faixa;
  texto: string;
  anexosMantidos?: Midia[];
  anexosNovos?: AnexoLocal[];
  userId?: string | null;
}) {
  /* Sobe antes de gravar: um caminho na linha que não existe no balde só
     apareceria na hora de a mensagem sair, de madrugada, sem ninguém olhando. */
  const subidos = await subirAnexos(args.anexosNovos ?? [], `atendimento/${args.instancia}/${args.faixa}`);
  const midias = [...(args.anexosMantidos ?? []), ...subidos];
  const { error } = await tabela("wa_atendimento_msgs").upsert({
    instancia: args.instancia,
    faixa: args.faixa,
    texto: args.texto,
    ...resumoDasMidias(midias),
    atualizado_por: args.userId ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "instancia,faixa" });
  if (error) throw error;
}

export function useInvalidarAtendimento() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["wa", "atendimento"] });
}
