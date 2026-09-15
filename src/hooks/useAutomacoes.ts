/* AS AUTOMAÇÕES, DO LADO DO NAVEGADOR.
 *
 * Três consultas porque as três mudam em ritmos diferentes: a LISTA muda quando
 * alguém salva um fluxo (raro), o RESUMO muda a cada lead que passa (o dia
 * inteiro), e as EXECUÇÕES só interessam com um fluxo aberto na tela.
 *
 * Quem escreve na tabela de execuções é o executor, com a chave de serviço — a
 * política do banco só deixa esta camada LER. É de propósito: uma tela que
 * pudesse marcar uma execução como concluída faria o histórico do robô deixar
 * de ser histórico.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  type Automacao, type Execucao, type Gatilho, type Passo, type ConfigDoGatilho,
  type Condicoes, CONDICOES_PADRAO, gatilhoValido, tipoDePassoValido, novoIdDePasso,
} from "@/lib/automacoes";

const tabela = (nome: string) => (supabase.from(nome as never) as never as any);

export interface ResumoAutomacao {
  automacao_id: string;
  total: number;
  hoje: number;
  falhas: number;
  ultima: string | null;
}

/**
 * O que vem do banco vira uma automação utilizável, ou é descartado.
 *
 * `passos` é jsonb: nada garante que o que está lá dentro seja o que a tela
 * espera. Um passo de tipo desconhecido (escrito por uma versão futura, ou por
 * um dedo errado no SQL) é jogado fora aqui em vez de virar um cartão em branco
 * no meio do fluxo.
 */
function daLinha(l: Record<string, unknown>): Automacao | null {
  const g = l.gatilho;
  if (!gatilhoValido(g)) return null;

  const passos: Passo[] = (Array.isArray(l.passos) ? l.passos : [])
    .filter((p: unknown) => !!p && tipoDePassoValido((p as Passo).tipo))
    .map((p: Passo) => ({ ...p, id: p.id || novoIdDePasso() }));

  const c = (l.condicoes ?? {}) as Partial<Condicoes>;
  return {
    id: String(l.id),
    nome: String(l.nome ?? ""),
    instancia: String(l.instancia ?? ""),
    ativa: !!l.ativa,
    gatilho: g as Gatilho,
    gatilho_config: (l.gatilho_config ?? {}) as ConfigDoGatilho,
    condicoes: {
      so_horario_comercial: c.so_horario_comercial !== false,
      teto_dia: Number(c.teto_dia ?? CONDICOES_PADRAO.teto_dia),
    },
    passos,
    updated_at: (l.updated_at as string) ?? null,
  };
}

const COLUNAS = "id, nome, instancia, ativa, gatilho, gatilho_config, condicoes, passos, updated_at";

export function useAutomacoes(instancia: string | null) {
  return useQuery({
    queryKey: ["wa", "automacoes", instancia],
    enabled: !!instancia,
    staleTime: 15_000,
    queryFn: async (): Promise<Automacao[]> => {
      const { data, error } = await tabela("wa_automacoes")
        .select(COLUNAS).ilike("instancia", instancia!).order("created_at");
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(daLinha).filter(Boolean) as Automacao[];
    },
  });
}

export function useResumoAutomacoes(instancia: string | null, aoVivo: boolean) {
  return useQuery({
    queryKey: ["wa", "automacoes", "resumo", instancia],
    enabled: !!instancia,
    refetchInterval: aoVivo ? 30_000 : false,
    queryFn: async (): Promise<Record<string, ResumoAutomacao>> => {
      const { data, error } = await (supabase.rpc as never as any)("fn_wa_automacoes_resumo", {
        p_instancia: instancia,
      });
      if (error) throw error;
      const mapa: Record<string, ResumoAutomacao> = {};
      for (const r of (data ?? []) as ResumoAutomacao[]) {
        mapa[r.automacao_id] = {
          ...r,
          total: Number(r.total), hoje: Number(r.hoje), falhas: Number(r.falhas),
        };
      }
      return mapa;
    },
  });
}

/**
 * As últimas passagens por um fluxo.
 *
 * Com o nome de quem passou: sem ele a lista é uma coluna de horários, e
 * "quem recebeu isso?" é a primeira pergunta de qualquer um que abra esta aba.
 */
export interface ExecucaoComNome extends Execucao {
  nome_do_lead: string | null;
}

export function useExecucoes(automacaoId: string | null, aoVivo: boolean) {
  return useQuery({
    queryKey: ["wa", "automacoes", "execucoes", automacaoId],
    enabled: !!automacaoId,
    refetchInterval: aoVivo ? 20_000 : false,
    queryFn: async (): Promise<ExecucaoComNome[]> => {
      const { data, error } = await tabela("wa_automacao_execucoes")
        .select("id, automacao_id, conversa_id, telefone, status, passo, detalhe, erro, disparada_em, rodar_em, terminada_em")
        .eq("automacao_id", automacaoId)
        .order("disparada_em", { ascending: false })
        .limit(60);
      if (error) throw error;

      const linhas = (data ?? []) as Execucao[];
      const ids = [...new Set(linhas.map((l) => l.conversa_id).filter(Boolean))] as string[];
      const nomes: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: convs } = await tabela("wa_conversas")
          .select("id, nome_real, nome_wa, telefone").in("id", ids);
        for (const c of ((convs ?? []) as Record<string, string>[])) {
          nomes[c.id] = c.nome_real || c.nome_wa || c.telefone || "";
        }
      }
      return linhas.map((l) => ({
        ...l,
        nome_do_lead: l.conversa_id ? (nomes[l.conversa_id] ?? null) : null,
      }));
    },
  });
}

/* ── escrita ──────────────────────────────────────────────────────────────── */

export interface Rascunho {
  nome: string;
  gatilho: Gatilho;
  gatilho_config: ConfigDoGatilho;
  condicoes: Condicoes;
  passos: Passo[];
}

export async function criarAutomacao(instancia: string, r: Rascunho, criadaPor?: string | null) {
  const { data, error } = await tabela("wa_automacoes").insert({
    instancia,
    nome: r.nome.trim(),
    gatilho: r.gatilho,
    gatilho_config: r.gatilho_config,
    condicoes: r.condicoes,
    passos: r.passos,
    criada_por: criadaPor ?? null,
    // Nasce desligada, sempre. Ligar é um gesto à parte, com o aviso do que vai
    // acontecer — e não um efeito colateral de clicar em salvar.
    ativa: false,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function salvarAutomacao(id: string, r: Rascunho) {
  const { error } = await tabela("wa_automacoes").update({
    nome: r.nome.trim(),
    gatilho: r.gatilho,
    gatilho_config: r.gatilho_config,
    condicoes: r.condicoes,
    passos: r.passos,
  }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Liga e desliga.
 *
 * `ligada_em` é escrito pelo gatilho do banco, e não daqui: é a trava que
 * impede uma base antiga de disparar tudo de uma vez ao ligar, e trava que o
 * cliente preenche não é trava.
 */
export async function alternarAutomacao(id: string, ativa: boolean) {
  const { error } = await tabela("wa_automacoes").update({ ativa }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function apagarAutomacao(id: string) {
  const { error } = await tabela("wa_automacoes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Duplicar é como se cria a segunda versão de um fluxo que já funciona. */
export async function duplicarAutomacao(a: Automacao, criadaPor?: string | null) {
  return criarAutomacao(a.instancia, {
    nome: `${a.nome} (cópia)`.slice(0, 80),
    gatilho: a.gatilho,
    gatilho_config: a.gatilho_config,
    condicoes: a.condicoes,
    passos: a.passos.map((p) => ({ ...p, id: novoIdDePasso() })),
  }, criadaPor);
}

export function useInvalidarAutomacoes() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["wa", "automacoes"] });
}
