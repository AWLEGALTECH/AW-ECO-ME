// AS ANOTAÇÕES DA CONVERSA.
//
// Antes era um campo de texto só. Escrever a segunda coisa exigia decidir onde
// enfiá-la no meio da primeira, ninguém sabia quem tinha escrito o quê, e apagar
// sem querer não deixava rastro.
//
// Agora é lista: cada nota é uma linha, com autor e hora. Um atendimento é uma
// sequência de conversas ao longo de semanas, e a pergunta que se faz toda vez
// é "o que ficou combinado da última vez" — que um bloco de texto corrido
// responde mal e uma lista em ordem responde na primeira linha.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const tabela = (nome: string) => (supabase.from(nome as never) as never as any);

export interface Anotacao {
  id: string;
  texto: string;
  autor: string | null;
  quando: string;
}

interface AnotacaoRow {
  id: string;
  texto: string;
  created_at: string;
  autor_id: string | null;
  profiles: { nome: string | null } | null;
}

/** "hoje 15:12", "ontem 09:40", "28/08 17:03" — data curta e hora sempre. */
export function quandoDaNota(iso: string, agora = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const atras = Math.round((dia(agora) - dia(d)) / 86400000);
  if (atras <= 0) return `hoje ${hora}`;
  if (atras === 1) return `ontem ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

export function useAnotacoes(conversaId: string | null, ligado: boolean) {
  return useQuery({
    queryKey: ["wa", "anotacoes", conversaId],
    enabled: !!conversaId && ligado,
    queryFn: async (): Promise<Anotacao[]> => {
      const { data, error } = await tabela("wa_anotacoes")
        .select("id, texto, created_at, autor_id, profiles:autor_id(nome)")
        .eq("conversa_id", conversaId)
        // Mais nova primeiro: o que ficou combinado da última vez é a primeira
        // coisa que alguém procura ao abrir a conversa.
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return ((data || []) as AnotacaoRow[]).map((r) => ({
        id: r.id,
        texto: r.texto,
        autor: r.profiles?.nome ?? null,
        quando: r.created_at,
      }));
    },
  });
}

export async function postarAnotacao(conversaId: string, texto: string, autorId?: string | null) {
  const { error } = await tabela("wa_anotacoes").insert({
    conversa_id: conversaId,
    texto: texto.trim(),
    autor_id: autorId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function apagarAnotacao(id: string) {
  const { error } = await tabela("wa_anotacoes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export function useInvalidarAnotacoes() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["wa", "anotacoes"] });
}
