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

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  horaDaLista, horasSemResposta, previaDe, separadorDeDia, telefoneBonito,
  type ConversaRow, type MensagemRow,
} from "@/lib/wa";
import type { Estagio, Instancia, Lead, Mensagem, Origem } from "@/lib/atendimentoMock";

export interface InstanciaRow {
  nome: string;
  telefone: string | null;
  jid: string | null;
  perfil_nome: string | null;
  foto_url: string | null;
  status: string;
  contatos: number | null;
  conversas: number | null;
  mensagens: number | null;
  sincronizado_em: string;
}

/** Iniciais como reserva: instância sem foto não pode virar círculo vazio. */
function iniciaisDe(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

/** A instância do banco no formato que o card do topo já desenha. */
export function instanciaParaCard(i: InstanciaRow, agora = new Date()): Instancia {
  const min = Math.max(0, Math.round((agora.getTime() - new Date(i.sincronizado_em).getTime()) / 60000));
  return {
    id: i.nome,
    nome: i.nome,
    curto: i.nome.length > 14 ? iniciaisDe(i.nome) : i.nome,
    telefone: i.telefone ? telefoneBonito(i.telefone) : "sem número",
    status: i.status === "conectado" ? "conectado" : "desconectado",
    gateway: "Evolution API",
    sincronizadoEm: min < 1 ? "agora" : `há ${min} min`,
    conversas: i.conversas ?? 0,
    naoLidas: 0,
    avatar: iniciaisDe(i.perfil_nome || i.nome),
    fotoUrl: i.foto_url,
  };
}

const tabela = (nome: string) => (supabase.from(nome as never) as never as any);

/**
 * As instâncias conectadas, lidas do espelho `wa_instancias`.
 *
 * Ao montar, pede uma sincronização com a Evolution: nome, status e FOTO do
 * perfil mudam do lado de lá e a URL da foto do WhatsApp expira, então confiar
 * no que está gravado de ontem daria imagem quebrada. Se a Evolution não
 * responder, a tela segue com o que está no banco — degradar é melhor que
 * mostrar erro por causa de uma foto.
 */
export function useInstancias() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["wa", "instancias"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<InstanciaRow[]> => {
      const { data, error } = await tabela("wa_instancias")
        .select("nome, telefone, jid, perfil_nome, foto_url, status, contatos, conversas, mensagens, sincronizado_em")
        .eq("ativa", true)
        .order("nome");
      if (error) throw error;
      return (data || []) as InstanciaRow[];
    },
  });

  useEffect(() => {
    let vivo = true;
    supabase.functions
      .invoke("wa-instancia", { body: {} })
      .then(() => { if (vivo) qc.invalidateQueries({ queryKey: ["wa", "instancias"] }); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [qc]);

  return q;
}

export function useConversas(instancia: string | null) {
  return useQuery({
    queryKey: ["wa", "conversas", instancia],
    refetchInterval: 10_000,
    queryFn: async (): Promise<ConversaRow[]> => {
      let q = tabela("wa_conversas")
        .select("id, instancia, telefone, jid, nome_wa, foto_url, nao_lidas, ultima_em, ultima_previa, arquivada, cliente_id, origem, importada, fonte_id, presenca, presenca_em, visto_em, etapa, etapas_puladas, atendimento_finalizado_em, created_at")
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
        .select("id, conversa_id, direcao, tipo, texto, midia_path, midia_mime, midia_nome, duracao, status, criada_em")
        .eq("conversa_id", conversaId)
        .order("criada_em", { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data || []) as MensagemRow[];
    },
  });
}

/**
 * A presença de UMA conversa, olhada de perto.
 *
 * A lista inteira recarrega a cada 10 segundos, e "digitando" dura três: o
 * indicador nunca apareceria. Esta consulta pega uma linha só, a cada 3s, e
 * apenas enquanto a conversa está aberta — é barata porque é uma linha, e é
 * curta porque ninguém escreve por dez segundos sem parar.
 */
export function usePresencaDaConversa(conversaId: string | null, ligado: boolean) {
  return useQuery({
    queryKey: ["wa", "presenca", conversaId],
    enabled: !!conversaId && ligado,
    refetchInterval: 3_000,
    queryFn: async (): Promise<{ presenca: string | null; presenca_em: string | null; visto_em: string | null } | null> => {
      const { data, error } = await tabela("wa_conversas")
        .select("presenca, presenca_em, visto_em").eq("id", conversaId).maybeSingle();
      if (error) throw error;
      return data ?? null;
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
 * Envia pelo WhatsApp.
 *
 * Quem fala com a Evolution e quem grava a linha é a `wa-enviar` — daqui só sai
 * o pedido. O número não vai junto de propósito: a função lê instância e
 * telefone da própria conversa, então nada que o navegador mandar pode virar
 * mensagem pra outro destinatário.
 */
async function pedirEnvio(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("wa-enviar", { body });
  if (error) throw new Error(error.message);
  if (data && data.ok === false) throw new Error(String(data.error || "Falha no envio"));
  return data as { ok: true; aviso?: string };
}

/**
 * Abre conversa com quem ainda não escreveu — o "+" da caixa.
 *
 * Quem confere o número com o WhatsApp e cria a linha é a `wa-nova-conversa`:
 * a checagem precisa da chave da Evolution, que não pode viver no navegador.
 */
/**
 * Move a etapa do lead.
 *
 * `puladas` vai junto porque a jornada desenha o que foi pulado: quem foi de
 * "Chegou" direto pra "Proposta" tem uma história diferente de quem passou por
 * triagem e extrato, e é essa diferença que se olha depois pra entender o que
 * funcionou.
 */
export async function moverEtapaWa(conversaId: string, etapa: string, puladas: string[]) {
  const { error } = await tabela("wa_conversas")
    .update({ etapa, etapas_puladas: puladas }).eq("id", conversaId);
  if (error) throw new Error(error.message);
}

export async function criarConversa(args: { instancia: string; telefone: string; nome?: string | null }) {
  const { data, error } = await supabase.functions.invoke("wa-nova-conversa", {
    body: { instancia: args.instancia, telefone: args.telefone, nome: args.nome ?? null },
  });
  if (error) throw new Error(error.message);
  if (!data || data.ok === false) throw new Error(String(data?.error || "Não consegui abrir a conversa"));
  return data as { ok: true; conversa_id: string; ja_existia: boolean; aviso?: string | null };
}

export function enviarTexto(conversaId: string, texto: string) {
  return pedirEnvio({ conversa_id: conversaId, tipo: "texto", texto });
}

/** O tipo que a Evolution entende, a partir do arquivo que a pessoa escolheu. */
function tipoDoArquivo(mime: string): "imagem" | "video" | "audio" | "documento" {
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "documento";
}

/** Nome de arquivo que sobrevive a um path de Storage. */
function nomeSeguro(nome: string): string {
  return nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}

/**
 * Sobe o arquivo e manda.
 *
 * O upload vem primeiro porque a Evolution baixa a mídia por URL — e é bom que
 * seja assim: o arquivo enviado fica no mesmo bucket do recebido, então a mesma
 * bolha desenha os dois sem precisar saber de onde veio.
 */
export async function enviarArquivo(args: {
  conversaId: string;
  arquivo: Blob;
  nome: string;
  legenda?: string;
  /** segundos — só no áudio gravado, onde o webm não traz a duração no cabeçalho */
  duracao?: number | null;
}) {
  const mime = args.arquivo.type || "application/octet-stream";
  const tipo = tipoDoArquivo(mime);
  const path = `enviados/${args.conversaId}/${Date.now()}_${nomeSeguro(args.nome)}`;

  const { error: eUp } = await supabase.storage
    .from("wa-midia").upload(path, args.arquivo, { contentType: mime, upsert: false });
  if (eUp) throw new Error(`Não consegui subir o arquivo: ${eUp.message}`);

  return pedirEnvio({
    conversa_id: args.conversaId,
    tipo,
    texto: args.legenda?.trim() || null,
    midia_path: path,
    midia_nome: args.nome,
    mime,
    duracao: args.duracao ?? null,
  });
}

/* ── LIGAR UM NÚMERO NOVO ──
   Uma função só, com ações, porque as quatro chamadas são passos da MESMA
   conversa com a Evolution: criar, mostrar o QR, perguntar se já conectou,
   e (o passo que ninguém lembra) apontar o webhook. Separadas em quatro
   funções, a quarta seria a que alguém esqueceria de chamar — e é justamente a
   que quebra em silêncio. */
async function pedirConexao(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("wa-conectar", { body });
  if (error) throw new Error(error.message);
  if (!data || data.ok === false) throw new Error(String(data?.error || "Falhou"));
  return data as { ok: true; instancia: string; qr?: string | null; estado?: string; aviso?: string | null };
}

/* O número nasce no painel da Evolution; aqui ele só é REGISTRADO. A tabela
   `wa_instancias` é lista de permissão porque o servidor da Evolution é
   compartilhado com outros projetos — aparecer lá não pode significar
   aparecer aqui. Registrar também aponta o webhook, que é o passo que
   costuma faltar quando a instância nasce pelo painel. */
export const registrarInstancia = (nome: string) => pedirConexao({ acao: "registrar", instancia: nome });
export const criarInstancia = (nome: string) => pedirConexao({ acao: "criar", instancia: nome });
export const qrDaInstancia = (nome: string) => pedirConexao({ acao: "qr", instancia: nome });
export const estadoDaInstancia = (nome: string) => pedirConexao({ acao: "estado", instancia: nome });
export const reaplicarWebhook = (nome: string) => pedirConexao({ acao: "webhook", instancia: nome });
export const importarConversas = (nome: string) =>
  pedirConexao({ acao: "importar", instancia: nome }) as unknown as Promise<{
    ok: true; importadas: number; total: number; ignoradas: string | null;
  }>;

/** O que a Evolution TEM configurado, não o que deveria ter.
 *
 *  "Conectou mas não chega mensagem" tem quatro causas que se parecem na tela:
 *  URL errada, token errado, evento desmarcado, ou `webhookByEvents` ligado.
 *  Nenhuma aparece de fora, e deduzir de "não tem log" já me fez errar o
 *  diagnóstico aqui mais de uma vez — então em vez de inferir, pergunta. */
export type Diagnostico = {
  ok: true;
  instancia: string;
  estado: string;
  webhook: {
    configurado: boolean; ativo: boolean; url: string;
    apontaPraCa: boolean; tokenConfere: boolean; porEvento: boolean;
    eventos: string[]; faltando: string[];
  } | null;
  erroWebhook: string | null;
  recebidos: { evento: string; criado_em: string }[];
  conversas: number;
  exigidos: string[];
  urlEsperada: string;
};
export const diagnosticarInstancia = (nome: string) =>
  pedirConexao({ acao: "diagnostico", instancia: nome }) as unknown as Promise<Diagnostico>;

/**
 * ASSINAR A PRESENÇA DE UM CONTATO.
 *
 * O WhatsApp não conta "fulano está digitando" para quem não pediu: o Baileys
 * precisa chamar `presenceSubscribe` naquele número antes. Foi por isso que o
 * `PRESENCE_UPDATE` ficou marcado no painel da Evolution e nunca entregou uma
 * linha — a ausência de assinatura se parece com evento desmarcado, e eu
 * procurei no lugar errado.
 *
 * Silenciosa de propósito: a assinatura é um detalhe do protocolo, e um toast
 * de erro cada vez que se abre uma conversa seria barulho sobre algo que quem
 * atende não pode consertar. O resultado fica em `wa_eventos`.
 */
export async function assinarPresenca(conversaId: string) {
  const { data } = await supabase.functions.invoke("wa-presenca", {
    body: { conversa_id: conversaId },
  });
  return data as { ok: boolean; assinou?: boolean; rota?: string | null; diagnostico?: string | null } | null;
}
export const desconectarInstancia = (nome: string) => pedirConexao({ acao: "desconectar", instancia: nome });

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
export function conversaParaLead(
  c: ConversaRow,
  msgs: MensagemRow[],
  agora = new Date(),
  /** nome da base pelo id, pra etiqueta não virar um uuid na tela */
  basePorId?: Record<string, string>,
): Lead {
  const conversa: Mensagem[] = [];
  let anterior: string | null = null;
  for (const m of msgs) {
    const dia = separadorDeDia(m.criada_em, anterior, agora);
    anterior = m.criada_em;
    conversa.push({
      de: m.direcao === "entrada" ? "lead" : "nos",
      // Com anexo, `texto` é a LEGENDA — e legenda vazia é o normal. A etiqueta
      // ("🎵 Áudio") só entra quando não há anexo pra desenhar, senão a bolha
      // mostraria o rótulo e o player da mesma coisa.
      texto: m.texto ?? (m.midia_path ? "" : previaDe(m)),
      hora: new Date(m.criada_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      ...(dia ? { dia } : {}),
      id: m.id,
      tipo: m.tipo,
      midiaPath: m.midia_path,
      midiaMime: m.midia_mime,
      midiaNome: m.midia_nome,
      duracao: m.duracao,
      status: m.status,
    });
  }

  const ultima = msgs[msgs.length - 1];
  const origem: Origem = c.instancia.toLowerCase().includes("escrit") ? "escritorio" : "pda";
  const diasParado = c.ultima_em
    ? Math.max(0, Math.floor((agora.getTime() - new Date(c.ultima_em).getTime()) / 86400000))
    : 0;

  return {
    id: c.id,
    // Sem nome no WhatsApp, o telefone FORMATADO — "(92) 99165-3608" se lê como
    // um número de telefone; "5592991653608" se lê como um código de erro.
    nome: c.nome_wa?.trim() || telefoneBonito(c.telefone),
    telefone: c.telefone,
    origem,
    estagio: (c.etapa || "chegou") as Estagio,
    ultimaFoi: ultima?.direcao === "entrada" ? "lead" : "nos",
    horasSemResposta: horasSemResposta(msgs, agora),
    ultimaHora: horaDaLista(c.ultima_em, agora),
    ultimaEm: c.ultima_em,
    naoLidas: c.nao_lidas ?? 0,
    temProximaAcao: false,
    diasParado,
    followUpsFeitos: 0,
    chegouEm: c.created_at.slice(0, 10),
    previa: c.ultima_previa,
    origemContato: c.origem === "outbound" ? "outbound" : "inbound",
    importada: !!c.importada,
    etapasPuladas: (c.etapas_puladas ?? []) as Estagio[],
    base: c.fonte_id ? (basePorId?.[c.fonte_id] ?? null) : null,
    presenca: c.presenca,
    presencaEm: c.presenca_em,
    vistoEm: c.visto_em,
    atendimentoFinalizadoEm: c.atendimento_finalizado_em ?? null,
    dossie: { banco: null, descontos: [], inss: null, consignado: null, obs: null },
    conversa,
  };
}
