// O BANCO DE LEAD BRUTO — quem deixou o número na landing e nunca escreveu.
//
// A planilha sabe QUEM CHEGOU. Só o sistema sabe QUEM JÁ FOI ABORDADO — e é
// justamente essa metade que faltava: sem ela, ou a atendente marca à mão na
// planilha (e esquece), ou a lista repete todo dia quem já foi chamado ontem.
//
// A SINCRONIZAÇÃO VIROU ROBÔ, E CONTINUOU TENDO UM BOTÃO.
//
// Por muito tempo ela foi só botão, e a razão estava escrita aqui: um cron
// faria o mesmo sem ninguém clicar, mas exigiria uma segunda cópia do
// interpretador (src/lib/planilhaLeads.ts) dentro do Deno — e duas cópias da
// mesma regra é o jeito conhecido de elas discordarem seis meses depois, uma
// corrigida e a outra não.
//
// A saída não foi copiar: foi LIGAR. A edge function `leads-sync` lê
// `planilhaLeads.ts`, `csv.ts` e `phone.ts` por link simbólico, os mesmos
// arquivos desta pasta, com os mesmos testes. E o botão daqui passou a chamar
// ESSA função em vez de fazer o trabalho por conta própria: um robô e um botão
// que gravam cada um do seu jeito divergem no campo que um dos dois esquecer.
//
// Isso é o que faz o gatilho "chegou lead novo na base" existir: a linha nova
// só vira INSERT no banco quando alguém sincroniza, e agora isso acontece de
// cinco em cinco minutos sozinho.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { colunasEscolhiveis } from "@/lib/planilhaLeads";
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
  /** colunas da planilha que aparecem no cartão, na ordem escolhida; nulo = todas */
  colunas_exibidas: string[] | null;
  /** avisar no sino do AW quando um lead novo entrar nesta base */
  notificar: boolean;
  /** quando o aviso foi ligado; lead anterior a isso não avisa */
  notificar_desde: string | null;
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

/**
 * As bases da instância.
 *
 * `incluirInativas` existe porque as duas perguntas são diferentes: a LISTA da
 * aba Base só mostra as ligadas, mas a ETIQUETA do cartão de conversa precisa
 * do nome de qualquer base — uma pessoa que veio de uma base desligada
 * continua tendo vindo dela, e trocar o nome por um uuid na tela seria perder
 * a informação por causa de um filtro.
 */
export function useFontes(instancia: string | null, opcoes?: { incluirInativas?: boolean }) {
  const todas = !!opcoes?.incluirInativas;
  return useQuery({
    queryKey: ["leads", "fontes", instancia, todas],
    enabled: !!instancia,
    queryFn: async (): Promise<Fonte[]> => {
      let q = tabela("leads_fontes")
        .select("id, nome, planilha_id, aba, instancia, ativa, ultimo_sync, ultimo_erro, novos_desde, colunas_exibidas, notificar, notificar_desde")
        .ilike("instancia", instancia!);
      if (!todas) q = q.eq("ativa", true);
      const { data, error } = await q.order("nome");
      if (error) throw error;
      return (data || []) as Fonte[];
    },
  });
}

/**
 * O nome de cada base pelo id — de TODAS as instâncias, ligadas ou não.
 *
 * É a etiqueta do cartão de conversa, e ela responde a uma pergunta sobre o
 * PASSADO: de onde essa pessoa veio. `useFontes` responde a outra, sobre o
 * presente: qual fila este número trabalha agora. Usar a segunda para a
 * primeira funcionava só enquanto uma base nunca mudasse de número — no dia em
 * que a Bradesco saiu do PDA INBOUND para o PDA OUTBOUND, as 19 conversas que
 * ela já tinha aberto no número antigo perderiam a etiqueta e passariam a
 * parecer gente que apareceu do nada.
 *
 * Pelo mesmo motivo de as desligadas entrarem: quem veio de uma base continua
 * tendo vindo dela depois que ela é desligada, e continua depois que ela muda
 * de número.
 */
export function useNomesDasBases() {
  return useQuery({
    queryKey: ["leads", "fontes", "nomes"],
    // Nome de base muda quando alguém renomeia, o que é raro; recarregar sozinho
    // seria consulta ao banco pra não ver diferença.
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await tabela("leads_fontes").select("id, nome");
      if (error) throw error;
      const mapa: Record<string, string> = {};
      for (const f of (data || []) as { id: string; nome: string }[]) mapa[f.id] = f.nome;
      return mapa;
    },
  });
}

/**
 * As bases de TODOS os números, com o número de cada uma.
 *
 * `useFontes` responde "o que este número trabalha"; esta responde "onde
 * existem bases". São perguntas diferentes e a segunda só apareceu com as
 * automações: montar um fluxo de base num número sem base nenhuma é um beco
 * sem saída, e a única saída útil é dizer em quais números elas estão.
 */
export function useTodasAsFontes() {
  return useQuery({
    queryKey: ["leads", "fontes", "todas"],
    staleTime: 60_000,
    queryFn: async (): Promise<Fonte[]> => {
      const { data, error } = await tabela("leads_fontes")
        .select("id, nome, planilha_id, aba, instancia, ativa, ultimo_sync, ultimo_erro, novos_desde, colunas_exibidas, notificar, notificar_desde")
        .eq("ativa", true)
        .order("instancia").order("nome");
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

/**
 * A BASE INTEIRA, com o estado real de cada lead.
 *
 * `useLeadsBrutos` acima traz a FILA: só quem ainda não foi abordado. Como fila
 * está certa, e é o que a caixa usava. Só que a pergunta que se faz abrindo uma
 * base não é só "quem falta abordar": é "quem está aqui dentro, e em que pé
 * está cada um". Com metade escondida, 708 linhas viravam 78 na tela, e as
 * outras 630 não existiam em lugar nenhum.
 *
 * QUEM RESPONDE "JÁ ESCREVEU?" É O BANCO, e tem que ser: a resposta não está em
 * `leads_brutos`, está em haver conversa com mensagem de ENTRADA — e em
 * QUALQUER número do escritório, não só naquele em que a base está ligada. O
 * lead não sabe que temos dois números. Fazer essa conta no navegador exigiria
 * baixar as conversas todas para cruzar telefone a telefone.
 *
 * Só busca com uma base aberta: são centenas de linhas, e não faz sentido tê-las
 * na memória enquanto a pessoa está do outro lado da tela respondendo gente.
 */
export interface LeadDaBase extends LeadBruto {
  /** já mandou mensagem para algum número do escritório */
  escreveu: boolean;
  /** já existe conversa aberta com ele, tenha escrito ou não */
  tem_conversa: boolean;
  /** em qual número essa conversa está */
  conversa_instancia: string | null;
  /** o id dela, para o clique levar direto ao lugar certo */
  conversa_achada: string | null;
}

export function useBaseCompleta(fonteId: string | null) {
  return useQuery({
    queryKey: ["leads", "base-completa", fonteId],
    enabled: !!fonteId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<LeadDaBase[]> => {
      const { data, error } = await (supabase.rpc as never as any)("fn_leads_da_base", { p_fonte: fonteId });
      if (error) throw error;
      return (data ?? []) as LeadDaBase[];
    },
  });
}

/**
 * Só o cabeçalho da planilha, pra montar a lista de colunas na hora de ligar.
 *
 * Usa a mesma função de leitura — se ela consegue ler os leads, consegue ler o
 * cabeçalho, e um segundo caminho só pra isso seria mais uma coisa pra
 * discordar da primeira.
 */
export async function lerColunas(planilhaId: string, aba?: string | null): Promise<string[]> {
  const { data, error } = await supabase.functions.invoke("leads-planilha", {
    body: { planilha_id: planilhaId, aba: aba || null },
  });
  if (error) throw new Error(error.message);
  if (!data || data.ok === false) throw new Error(String(data?.error || "Não consegui ler a planilha"));
  const cabecalho: string[] = data.csv
    ? csvParaPlanilha(String(data.csv)).cabecalho
    : ((data.cabecalho ?? []) as string[]);
  return colunasEscolhiveis(cabecalho);
}

/**
 * A planilha abre? Pergunta feita ANTES de ligar a base.
 *
 * Ligar primeiro e descobrir depois é o que acontecia: a base entrava na lista,
 * a fila vinha vazia, e o motivo ficava numa frase do Google escondida no
 * cabeçalho da fonte. Quem estava ligando já tinha ido embora da tela.
 *
 * Devolve a resposta crua da leitura; quem traduz é `diagnosticarPlanilha`.
 */
export async function testarPlanilha(planilhaId: string, aba?: string | null) {
  const { data, error } = await supabase.functions.invoke("leads-planilha", {
    body: { planilha_id: planilhaId, aba: aba || null },
  });
  /* Erro de INVOCAÇÃO (rede, função fora do ar) não é erro de planilha, e não
     pode ser traduzido como "compartilhe com a conta de serviço": mandaria
     consertar o que não está quebrado. */
  if (error) throw new Error(error.message);
  return (data ?? { ok: false, error: "A leitura não respondeu." }) as Record<string, unknown>;
}

/**
 * Liga e desliga o aviso de lead novo no sino do AW.
 *
 * `notificar_desde` é escrito pelo GATILHO DO BANCO, e não daqui: é a trava
 * que impede uma base com 708 linhas de despejar 708 avisos ao ser ligada, e
 * trava que o cliente preenche não é trava.
 */
export async function alternarAviso(fonteId: string, notificar: boolean) {
  const { error } = await tabela("leads_fontes").update({ notificar }).eq("id", fonteId);
  if (error) throw new Error(error.message);
}

export async function salvarColunas(fonteId: string, colunas: string[]) {
  const { error } = await tabela("leads_fontes")
    .update({ colunas_exibidas: colunas.length > 0 ? colunas : null })
    .eq("id", fonteId);
  if (error) throw new Error(error.message);
}

export interface ResumoBase {
  fonte_id: string;
  total: number;
  /** a fila: ainda não abordado e depois do corte. Continua servindo a outras telas. */
  novos: number;
  antigos: number;
  /** quantos CHEGARAM no período pedido; 0 quando não se pediu período */
  no_periodo: number;
}

/**
 * Quantos leads cada base tem, e quantos contam como novos.
 *
 * Vem de uma função no banco em vez de ser contado no navegador porque o
 * navegador só recebe a fila (os que esperam) — contar "total da base" com ela
 * daria o número dos que sobraram, não o da base.
 */
/**
 * Os números de cada base.
 *
 * `desde` é opcional e vem do NAVEGADOR, não do banco: o servidor roda em UTC e
 * não sabe o fuso de quem está olhando. Segunda à meia-noite em Manaus não é
 * segunda à meia-noite em UTC, e as quatro horas de diferença jogariam os leads
 * da madrugada de segunda para a semana anterior.
 */
export function useResumoBases(ligado: boolean, desde?: Date | null) {
  const chave = desde ? desde.toISOString() : null;
  return useQuery({
    queryKey: ["leads", "resumo", chave],
    enabled: ligado,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Record<string, ResumoBase>> => {
      const { data, error } = await (supabase.rpc as never as any)("fn_leads_resumo",
        chave ? { p_desde: chave } : {});
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
  colunas?: string[] | null;
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
      .update({
        ativa: true, nome: args.nome.trim(), instancia: args.instancia,
        ...(args.colunas ? { colunas_exibidas: args.colunas.length > 0 ? args.colunas : null } : {}),
      })
      .eq("id", jaTem.id);
    if (error) throw new Error(error.message);
    return jaTem.id as string;
  }

  const { data, error } = await tabela("leads_fontes").insert({
    nome: args.nome.trim(),
    planilha_id: planilhaId,
    aba,
    instancia: args.instancia,
    colunas_exibidas: args.colunas && args.colunas.length > 0 ? args.colunas : null,
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
 * Puxa a planilha agora, sem esperar os cinco minutos do robô.
 *
 * O trabalho inteiro (ler, interpretar, espelhar, gravar o aviso) acontece na
 * edge function `leads-sync` — a MESMA que o cron chama. Aqui só se pede e se
 * traduz a resposta para o que a tela mostra.
 *
 * O botão continua existindo porque esperar até cinco minutos para ver se a
 * planilha respondeu é insuportável quando se acabou de ligar uma base, e
 * porque é ele que mostra o erro na cara de quem pode consertá-lo.
 */
export async function sincronizarFonte(fonte: Fonte): Promise<ResultadoSync> {
  const { data, error } = await supabase.functions.invoke("leads-sync", {
    body: { fonte_id: fonte.id },
  });
  if (error) throw new Error(error.message);
  if (!data || data.ok === false) throw new Error(String(data?.error || "Não consegui ler a planilha"));

  const r = (data.resultados ?? [])[0] as
    { lidos?: number; novos?: number; aviso?: string | null; erro?: string | null } | undefined;

  // A função grava o erro na fonte antes de devolver; aqui ele vira exceção
  // para o toast aparecer, como acontecia antes.
  if (r?.erro) throw new Error(r.erro);

  return {
    lidos: Number(r?.lidos ?? 0),
    novos: Number(r?.novos ?? 0),
    // `ignoradas` deixou de vir separado: a frase do aviso já diz quantas
    // linhas ficaram de fora, e era só para isso que este número servia.
    ignoradas: 0,
    aviso: r?.aviso ?? null,
  };
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
