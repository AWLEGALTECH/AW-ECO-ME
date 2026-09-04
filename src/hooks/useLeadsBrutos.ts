// O BANCO DE LEAD BRUTO — quem deixou o número na landing e nunca escreveu.
//
// A planilha sabe QUEM CHEGOU. Só o sistema sabe QUEM JÁ FOI ABORDADO — e é
// justamente essa metade que faltava: sem ela, ou a atendente marca à mão na
// planilha (e esquece), ou a lista repete todo dia quem já foi chamado ontem.
//
// A SINCRONIZAÇÃO É UM BOTÃO, NÃO UM ROBÔ. Por enquanto: a edge function lê a
// planilha, o navegador interpreta (src/lib/planilhaLeads.ts, testado) e grava.
// Um cron faria o mesmo sem alguém clicar, mas exigiria uma segunda cópia do
// interpretador dentro do Deno — e duas cópias da mesma regra é o jeito
// conhecido de elas discordarem seis meses depois, uma corrigida e a outra não.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { lerPlanilha } from "@/lib/planilhaLeads";
import { csvParaPlanilha } from "@/lib/csv";

const tabela = (nome: string) => (supabase.from(nome as never) as never as any);

export interface Fonte {
  id: string;
  nome: string;
  planilha_id: string;
  aba: string | null;
  instancia: string;
  ativa: boolean;
  ultimo_sync: string | null;
  ultimo_erro: string | null;
  /** antes disso o lead não conta como novo (base já trabalhada); nulo = tudo conta */
  novos_desde: string | null;
}

export interface LeadBruto {
  id: string;
  fonte_id: string;
  telefone: string;
  nome: string | null;
  cidade: string | null;
  respostas: string | null;
  origem_texto: string | null;
  chegou_em: string | null;
  linha: number | null;
  situacao: "novo" | "abordado" | "descartado";
  conversa_id: string | null;
  /* A linha inteira da planilha, coluna por coluna. É aqui que mora o que cada
     landing pergunta do seu jeito — DESCONTOS, TEMPO DE CONTA, SCORE — e é
     justamente esse conteúdo que decide como abrir a conversa. */
  bruto: Record<string, string> | null;
}

export function useFontes(instancia: string | null) {
  return useQuery({
    queryKey: ["leads", "fontes", instancia],
    enabled: !!instancia,
    queryFn: async (): Promise<Fonte[]> => {
      const { data, error } = await tabela("leads_fontes")
        .select("id, nome, planilha_id, aba, instancia, ativa, ultimo_sync, ultimo_erro, novos_desde")
        .ilike("instancia", instancia!)
        .eq("ativa", true)
        .order("nome");
      if (error) throw error;
      return (data || []) as Fonte[];
    },
  });
}

export function useLeadsBrutos(fonteIds: string[]) {
  const chave = [...fonteIds].sort().join(",");
  return useQuery({
    queryKey: ["leads", "brutos", chave],
    enabled: fonteIds.length > 0,
    refetchInterval: 60_000,
    queryFn: async (): Promise<LeadBruto[]> => {
      const { data, error } = await tabela("leads_brutos")
        .select("id, fonte_id, telefone, nome, cidade, respostas, origem_texto, chegou_em, linha, situacao, conversa_id, bruto")
        .in("fonte_id", fonteIds)
        // Só os que ainda esperam. Trazer os já abordados custava metade do
        // limite: a LP Bradesco sozinha tem 635 linhas, e o teto de 500 cortava
        // a fila sem avisar.
        .eq("situacao", "novo")
        // Mais recente primeiro: lead da landing esfria rápido, e quem chegou
        // hoje de manhã tem chance muito maior de responder que o de semana
        // passada.
        .order("chegou_em", { ascending: false, nullsFirst: false })
        .limit(2000);
      if (error) throw error;
      return (data || []) as LeadBruto[];
    },
  });
}

export interface ResumoBase {
  fonte_id: string;
  total: number;
  novos: number;
  antigos: number;
}

/**
 * Quantos leads cada base tem, e quantos contam como novos.
 *
 * Vem de uma função no banco em vez de ser contado no navegador porque o
 * navegador só recebe a fila (os que esperam) — contar "total da base" com ela
 * daria o número dos que sobraram, não o da base.
 */
export function useResumoBases(ligado: boolean) {
  return useQuery({
    queryKey: ["leads", "resumo"],
    enabled: ligado,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Record<string, ResumoBase>> => {
      const { data, error } = await (supabase.rpc as never as any)("fn_leads_resumo");
      if (error) throw error;
      const mapa: Record<string, ResumoBase> = {};
      for (const r of (data || []) as ResumoBase[]) {
        mapa[r.fonte_id] = { ...r, total: Number(r.total), novos: Number(r.novos), antigos: Number(r.antigos) };
      }
      return mapa;
    },
  });
}

/**
 * Liga a planilha — ou RELIGA a que já esteve ligada.
 *
 * Religar em vez de criar de novo é o que faz o "desligar" ser reversível de
 * verdade: a base volta com o registro de quem já foi abordado, em vez de
 * ressuscitar a fila inteira e mandar a atendente falar de novo com quem já
 * respondeu.
 */
export async function criarFonte(args: {
  nome: string; planilhaId: string; aba?: string | null; instancia: string;
}) {
  const planilhaId = args.planilhaId.trim();
  const aba = args.aba?.trim() || null;

  // A comparação de aba é feita aqui, e não na consulta, porque no Postgres
  // NULL não é igual a NULL: `eq("aba", null)` não acha a fonte sem aba.
  const { data: doArquivo } = await tabela("leads_fontes")
    .select("id, aba").eq("planilha_id", planilhaId);
  const jaTem = ((doArquivo || []) as { id: string; aba: string | null }[])
    .find((f) => (f.aba ?? null) === aba)
    // Sem aba igual, vale qualquer fonte da mesma planilha: quem religa está
    // apontando pro mesmo arquivo, e criar uma segunda duplicaria a fila.
    ?? ((doArquivo || []) as { id: string }[])[0];
  if (jaTem) {
    const { error } = await tabela("leads_fontes")
      .update({ ativa: true, nome: args.nome.trim(), instancia: args.instancia })
      .eq("id", jaTem.id);
    if (error) throw new Error(error.message);
    return jaTem.id as string;
  }

  const { data, error } = await tabela("leads_fontes").insert({
    nome: args.nome.trim(),
    planilha_id: planilhaId,
    aba,
    instancia: args.instancia,
  }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/**
 * Desligar NÃO apaga.
 *
 * A tabela de leads tem `on delete cascade` na fonte: apagar a linha da
 * planilha levava junto os 635 leads E o registro de quem já tinha sido
 * abordado — e foi o que aconteceu num clique sem querer. Um botão que destrói
 * meses de trabalho não devia ser do mesmo tamanho do que atualiza a lista.
 *
 * Agora ele só marca a fonte como inativa: ela some da tela, e religar a mesma
 * planilha traz tudo de volta como estava.
 */
export async function desativarFonte(id: string) {
  const { error } = await tabela("leads_fontes").update({ ativa: false }).eq("id", id);
  if (error) throw new Error(error.message);
}

export interface ResultadoSync {
  lidos: number;
  novos: number;
  ignoradas: number;
  /** o que atrapalhou sem impedir — aba errada, planilha vazia, linhas sem telefone */
  aviso: string | null;
}

/**
 * Puxa a planilha e atualiza o espelho.
 *
 * O upsert NÃO toca em `situacao` nem em `conversa_id`: a planilha não sabe
 * quem já foi abordado, e deixá-la sobrescrever isso faria a fila ressuscitar
 * todo mundo a cada sincronização — que é exatamente o problema que esta tela
 * existe pra resolver.
 */
export async function sincronizarFonte(fonte: Fonte): Promise<ResultadoSync> {
  const { data, error } = await supabase.functions.invoke("leads-planilha", {
    body: { planilha_id: fonte.planilha_id, aba: fonte.aba },
  });
  if (error) throw new Error(error.message);
  if (!data || data.ok === false) {
    await tabela("leads_fontes").update({ ultimo_erro: String(data?.error || "falhou") }).eq("id", fonte.id);
    throw new Error(String(data?.error || "Não consegui ler a planilha"));
  }

  /* A função lê por dois caminhos: pela API do Sheets (que devolve as células
     já separadas) ou, quando ela está desligada no projeto, pelo export do
     Drive (que devolve CSV). O CSV é convertido AQUI, com o mesmo leitor
     testado — a alternativa seria um segundo interpretador dentro do Deno, e
     duas cópias da mesma regra é o jeito conhecido de elas discordarem. */
  const planilha = data.csv
    ? csvParaPlanilha(String(data.csv))
    : { cabecalho: (data.cabecalho ?? []) as string[], linhas: (data.linhas ?? []) as { linha: number; celulas: string[] }[] };

  const { leads, ignoradas } = lerPlanilha(planilha.cabecalho, planilha.linhas);

  /* O QUE ATRAPALHOU FICA GRAVADO, NÃO SÓ NO TOAST.
     Fila vazia é indistinguível de "não tem ninguém aqui" — foi exatamente
     isso que aconteceu com a planilha do Bradesco. Cada motivo de a fila sair
     vazia (ou menor do que a planilha) vira uma frase que sobrevive ao
     recarregar, no cabeçalho da fonte. */
  const avisos: string[] = [];
  if (data.aviso) avisos.push(String(data.aviso));

  /* ZERO LINHA TAMBÉM PRECISA DE FRASE.
     Este era o buraco que sobrou: eu avisava quando havia linhas e nenhuma
     servia, mas quando a aba lida não tinha NENHUMA linha de dados a fila
     ficava vazia calada — de novo indistinguível de "não tem ninguém aqui".
     Foi o que aconteceu ao ler a primeira aba de uma planilha cujos leads
     estão em outra. */
  if (planilha.linhas.length === 0) {
    avisos.push(
      planilha.cabecalho.length > 0
        ? `A aba lida ("${data.aba ?? "primeira"}") só tem o cabeçalho (${planilha.cabecalho.join(", ")}) e nenhuma linha de dados.`
        : `A aba lida ("${data.aba ?? "primeira"}") está vazia.`,
    );
  } else if (leads.length === 0 && planilha.linhas.length > 0) {
    avisos.push(
      `Li ${planilha.linhas.length} linha(s) da aba "${data.aba ?? "primeira"}", mas nenhuma tinha`
      + ` telefone reconhecível. Colunas encontradas: ${planilha.cabecalho.join(", ") || "(nenhuma)"}.`,
    );
  } else if (ignoradas > 0) {
    avisos.push(`${ignoradas} linha(s) sem telefone válido ficaram de fora.`);
  }
  const aviso = avisos.length > 0 ? avisos.join(" ") : null;

  let novos = 0;
  if (leads.length > 0) {
    const { data: jaTem } = await tabela("leads_brutos")
      .select("telefone").eq("fonte_id", fonte.id);
    const conhecidos = new Set(((jaTem || []) as { telefone: string }[]).map((l) => l.telefone));
    novos = leads.filter((l) => !conhecidos.has(l.telefone)).length;

    const { error: eUp } = await tabela("leads_brutos").upsert(
      leads.map((l) => ({
        fonte_id: fonte.id,
        telefone: l.telefone,
        nome: l.nome,
        cidade: l.cidade,
        respostas: l.respostas,
        origem_texto: l.origemTexto,
        chegou_em: l.chegouEm,
        linha: l.linha,
        bruto: l.bruto,
      })),
      { onConflict: "fonte_id,telefone" },
    );
    if (eUp) throw new Error(eUp.message);
  }

  await tabela("leads_fontes")
    .update({
      ultimo_sync: new Date().toISOString(),
      ultimo_erro: aviso,
      // A aba que foi lida DE VERDADE volta pra fonte. Se o nome digitado não
      // existia, a próxima leitura já vai direto na certa em vez de repetir o
      // mesmo engano toda vez.
      ...(data.aba ? { aba: data.aba } : {}),
    })
    .eq("id", fonte.id);

  return { lidos: leads.length, novos, ignoradas, aviso };
}

/** O lead saiu da fila bruta: virou conversa. */
export async function marcarAbordado(id: string, conversaId: string, quem?: string | null) {
  const { error } = await tabela("leads_brutos").update({
    situacao: "abordado",
    conversa_id: conversaId,
    abordado_em: new Date().toISOString(),
    abordado_por: quem ?? null,
  }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Fora da fila sem virar conversa — número errado, já é cliente, não serve. */
export async function descartarLead(id: string) {
  const { error } = await tabela("leads_brutos").update({ situacao: "descartado" }).eq("id", id);
  if (error) throw new Error(error.message);
}

export function useInvalidarLeads() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["leads"] });
}
