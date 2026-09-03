// Leitura e escrita da caixa de entrada do WhatsApp.
//
// A tela não fala com o Supabase direto: ela pede conversas e mensagens aqui, e
// recebe no formato da maquete (src/lib/atendimentoMock.ts). Enquanto a
// Evolution não estiver ligada, `wa_conversas` volta vazia e a tela cai na
// maquete sozinha — sem tela de erro e sem "nenhuma conversa" pra quem só quer
// discutir o formato.
//
// Por que polling e não realtime: o resto do sistema já é assim (a sidebar
// atualiza os contadores a cada 30s) e realtime traz reconexão, canal por aba e
// estado que some quando o Wi-Fi pisca. Chat aberto recarrega a cada 5s, lista
// a cada 10s — de sobra pra um atendimento humano, e sem peça nova.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  horaDaLista, horasSemResposta, previaDe, separadorDeDia,
  type ConversaRow, type MensagemRow,
} from "@/lib/wa";
import type { Lead, Mensagem, Origem } from "@/lib/atendimentoMock";

const tabela = (nome: string) => (supabase.from(nome as never) as never as any);

export function useConversas(instancia: string | null) {
  return useQuery({
    queryKey: ["wa", "conversas", instancia],
    refetchInterval: 10_000,
    queryFn: async (): Promise<ConversaRow[]> => {
      let q = tabela("wa_conversas")
        .select("id, instancia, telefone, jid, nome_wa, foto_url, nao_lidas, ultima_em, ultima_previa, arquivada, cliente_id, created_at")
        .eq("arquivada", false)
        .order("ultima_em", { ascending: false, nullsFirst: false })
        .limit(200);
      // ILIKE e não EQ: o nome da instância na Evolution é digitado à mão e
      // ninguém garante a caixa. "PORTAL DIREITO ABERTO" e "Portal Direito
      // Aberto" são a mesma coisa pra quem configurou, e um EQ devolveria zero
      // conversa sem dizer por quê — o pior tipo de tela vazia.
      if (instancia) q = q.ilike("instancia", instancia);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ConversaRow[];
    },
  });
}

export function useMensagens(conversaId: string | null) {
  return useQuery({
    queryKey: ["wa", "mensagens", conversaId],
    enabled: !!conversaId,
    refetchInterval: 5_000,
    queryFn: async (): Promise<MensagemRow[]> => {
      const { data, error } = await tabela("wa_mensagens")
        .select("id, conversa_id, direcao, tipo, texto, midia_path, midia_mime, midia_nome, duracao, criada_em")
        .eq("conversa_id", conversaId)
        .order("criada_em", { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data || []) as MensagemRow[];
    },
  });
}

/** O bucket é privado: a tela precisa de link assinado, que vale uma hora. */
export function useMidiaUrl(path: string | null) {
  return useQuery({
    queryKey: ["wa", "midia", path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.storage.from("wa-midia").createSignedUrl(path!, 3600);
      if (error) return null;
      return data?.signedUrl ?? null;
    },
  });
}

/** Abrir a conversa zera o não-lidas — é o gesto que diz "eu vi". */
export async function marcarLida(conversaId: string) {
  await tabela("wa_conversas").update({ nao_lidas: 0 }).eq("id", conversaId);
}

/**
 * Envia pelo WhatsApp e registra a saída.
 *
 * A ordem importa: só grava depois que a Evolution aceitou. Gravar antes
 * deixaria na tela uma mensagem que o cliente nunca recebeu — e é pior que o
 * erro, porque ninguém reenvia o que parece enviado.
 */
export async function enviarWhatsapp(args: {
  conversaId: string; telefone: string; texto: string; enviadoPor?: string | null;
}) {
  const { error } = await supabase.functions.invoke("send-whatsapp", {
    body: {
      telefone: args.telefone,
      mensagem: args.texto,
      contexto: "atendimento",
      enviado_por: args.enviadoPor ?? null,
    },
  });
  if (error) throw new Error(error.message);

  const { error: eIns } = await tabela("wa_mensagens").insert({
    conversa_id: args.conversaId,
    direcao: "saida",
    tipo: "texto",
    texto: args.texto,
    enviado_por: args.enviadoPor ?? null,
  });
  if (eIns) throw new Error(eIns.message);
}

export function useInvalidarWa() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["wa"] });
}

/**
 * A conversa do banco no formato que a tela já sabe desenhar.
 *
 * O que o WhatsApp sabe (nome, telefone, mensagens, quem falou por último) vem
 * preenchido; o que é do atendimento (etapa, banco, descontos, perfil) nasce
 * vazio, porque ninguém perguntou ainda — e a tela já mostra "não perguntado"
 * nesse caso. Inventar aqui seria pior que deixar em branco.
 */
export function conversaParaLead(c: ConversaRow, msgs: MensagemRow[], agora = new Date()): Lead {
  const conversa: Mensagem[] = [];
  let anterior: string | null = null;
  for (const m of msgs) {
    const dia = separadorDeDia(m.criada_em, anterior, agora);
    anterior = m.criada_em;
    conversa.push({
      de: m.direcao === "entrada" ? "lead" : "nos",
      texto: m.texto ?? previaDe(m),
      hora: new Date(m.criada_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      ...(dia ? { dia } : {}),
    });
  }

  const ultima = msgs[msgs.length - 1];
  const origem: Origem = c.instancia.toLowerCase().includes("escrit") ? "escritorio" : "pda";
  const diasParado = c.ultima_em
    ? Math.max(0, Math.floor((agora.getTime() - new Date(c.ultima_em).getTime()) / 86400000))
    : 0;

  return {
    id: c.id,
    nome: c.nome_wa?.trim() || c.telefone,
    telefone: c.telefone,
    origem,
    estagio: "chegou",
    ultimaFoi: ultima?.direcao === "entrada" ? "lead" : "nos",
    horasSemResposta: horasSemResposta(msgs, agora),
    ultimaHora: horaDaLista(c.ultima_em, agora),
    naoLidas: c.nao_lidas ?? 0,
    temProximaAcao: false,
    diasParado,
    followUpsFeitos: 0,
    chegouEm: c.created_at.slice(0, 10),
    dossie: { banco: null, descontos: [], inss: null, consignado: null, obs: null },
    conversa,
  };
}
