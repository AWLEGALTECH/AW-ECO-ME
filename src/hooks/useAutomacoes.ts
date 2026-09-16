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
  type Condicoes, type ColunaDaBase, CONDICOES_PADRAO, colunasDosBrutos,
  gatilhoValido, tipoDePassoValido, novoIdDePasso, novoIdDeCaso,
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
 * Limpa uma fila de passos, DESCENDO NOS RAMOS.
 *
 * `passos` é jsonb: nada garante que o que está lá dentro seja o que a tela
 * espera. Um passo de tipo desconhecido (escrito por uma versão futura, ou por
 * um dedo errado no SQL) é jogado fora aqui em vez de virar um cartão em branco
 * no meio do fluxo.
 *
 * A versão anterior limpava só a fila de cima. Passava, porque o único ramo era
 * o "Se" e um passo estranho lá dentro no máximo virava um cartão esquisito.
 * Com a "Escolha" deixou de passar: o ramo de um caso é identificado pelo ID DO
 * CASO, e um caso que chegue sem id faz a execução gravar a decisão contra
 * `undefined`. Aí o `achatar` não acha ramo nenhum, o lead sai pelo fim do
 * fluxo sem receber nada, e não há erro em lugar nenhum para explicar.
 */
function passosLimpos(bruto: unknown): Passo[] {
  return (Array.isArray(bruto) ? bruto : [])
    .filter((p: unknown) => !!p && tipoDePassoValido((p as Passo).tipo))
    .map((p: Passo) => {
      const limpo: Passo = { ...p, id: p.id || novoIdDePasso() };
      if (Array.isArray(p.entao)) limpo.entao = passosLimpos(p.entao);
      if (Array.isArray(p.senao)) limpo.senao = passosLimpos(p.senao);
      if (Array.isArray(p.casos)) {
        limpo.casos = p.casos
          .filter((c) => !!c && typeof c === "object")
          .map((c) => ({
            ...c,
            id: c.id || novoIdDeCaso(),
            op: c.op ?? "contem",
            valor: String(c.valor ?? ""),
            passos: passosLimpos(c.passos),
          }));
      }
      return limpo;
    });
}

function daLinha(l: Record<string, unknown>): Automacao | null {
  const g = l.gatilho;
  if (!gatilhoValido(g)) return null;

  const passos: Passo[] = passosLimpos(l.passos);

  const c = (l.condicoes ?? {}) as Partial<Condicoes>;
  return {
    id: String(l.id),
    nome: String(l.nome ?? ""),
    instancia: String(l.instancia ?? ""),
    ativa: !!l.ativa,
    ligada_em: (l.ligada_em as string) ?? null,
    gatilho: g as Gatilho,
    gatilho_config: (l.gatilho_config ?? {}) as ConfigDoGatilho,
    condicoes: {
      so_horario_comercial: c.so_horario_comercial !== false,
      teto_dia: Number(c.teto_dia ?? CONDICOES_PADRAO.teto_dia),
      /* FAIXAS E RETROATIVO PRECISAM ATRAVESSAR A LEITURA.
         Este objeto era montado campo a campo, e os dois ficaram de fora quando
         nasceram. O efeito é pior do que perder a configuração na tela: a tela
         mostra o padrão, a pessoa salva qualquer outra coisa no fluxo, e o que
         estava gravado é sobrescrito pelo padrão sem ninguém pedir. O banco
         continuava com a faixa certa até o primeiro salvamento, e é por isso
         que some sem parecer que sumiu.
         `undefined` aqui não é descuido: é "este fluxo é antigo e ainda não
         respondeu isto", e `faixasDaAutomacao` sabe ler o legado. */
      faixas: Array.isArray(c.faixas) ? c.faixas : undefined,
      retroativo: typeof c.retroativo === "boolean" ? c.retroativo : undefined,
    },
    passos,
    updated_at: (l.updated_at as string) ?? null,
  };
}

const COLUNAS = "id, nome, instancia, ativa, ligada_em, gatilho, gatilho_config, condicoes, passos, updated_at";

/**
 * TODAS as automações do escritório, e não as do número aberto.
 *
 * Filtrar pelo número que está na tela escondia fluxo salvo em outro número:
 * ele sumia da lista sem dizer que existia, e quem tem dois números acabaria
 * criando o mesmo fluxo duas vezes. Agora cada cartão diz de quem ele é, e o
 * filtro (quando há mais de um número) é uma escolha visível na tela.
 */
export function useAutomacoes() {
  return useQuery({
    queryKey: ["wa", "automacoes", "todas"],
    staleTime: 15_000,
    queryFn: async (): Promise<Automacao[]> => {
      const { data, error } = await tabela("wa_automacoes")
        .select(COLUNAS).order("instancia").order("created_at");
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(daLinha).filter(Boolean) as Automacao[];
    },
  });
}

export function useResumoAutomacoes(aoVivo: boolean) {
  return useQuery({
    queryKey: ["wa", "automacoes", "resumo"],
    refetchInterval: aoVivo ? 30_000 : false,
    queryFn: async (): Promise<Record<string, ResumoAutomacao>> => {
      const { data, error } = await (supabase.rpc as never as any)("fn_wa_automacoes_resumo");
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
  teste: boolean;
}

export function useExecucoes(automacaoId: string | null, aoVivo: boolean) {
  return useQuery({
    queryKey: ["wa", "automacoes", "execucoes", automacaoId],
    enabled: !!automacaoId,
    refetchInterval: aoVivo ? 20_000 : false,
    queryFn: async (): Promise<ExecucaoComNome[]> => {
      const { data, error } = await tabela("wa_automacao_execucoes")
        .select("id, automacao_id, conversa_id, telefone, status, passo, detalhe, erro, disparada_em, rodar_em, terminada_em, teste")
        .eq("automacao_id", automacaoId)
        .order("disparada_em", { ascending: false })
        .limit(60);
      if (error) throw error;

      const linhas = (data ?? []) as (Execucao & { teste?: boolean })[];
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
        teste: !!l.teste,
        nome_do_lead: l.conversa_id ? (nomes[l.conversa_id] ?? null) : null,
      }));
    },
  });
}

/**
 * O REGISTRO DE TUDO QUE OS FLUXOS FIZERAM, de todos eles juntos.
 *
 * O histórico por fluxo já existia, mas ele só responde quando alguém já
 * desconfia de um fluxo específico e vai abrir aquele. A pergunta que não tinha
 * onde ser feita é a outra, e é a mais frequente: "o que os robôs andaram
 * fazendo?". Sem ela, um fluxo que começou a falhar às três da tarde só
 * aparece quando um lead reclama.
 *
 * Traz o nome do fluxo e o nome de quem passou, porque uma coluna de horários
 * com dois uuid não é registro, é ruído. As duas consultas extras são por id,
 * em cima de no máximo 200 linhas.
 */
export interface ExecucaoGeral extends Execucao {
  automacao_nome: string;
  instancia: string;
  nome_do_lead: string | null;
  teste: boolean;
}

export function useExecucoesGerais(aoVivo: boolean, limite = 120) {
  return useQuery({
    queryKey: ["wa", "automacoes", "execucoes", "gerais", limite],
    refetchInterval: aoVivo ? 20_000 : false,
    queryFn: async (): Promise<ExecucaoGeral[]> => {
      const { data, error } = await tabela("wa_automacao_execucoes")
        .select("id, automacao_id, conversa_id, telefone, status, passo, detalhe, erro, disparada_em, rodar_em, terminada_em, teste")
        .order("disparada_em", { ascending: false })
        .limit(limite);
      if (error) throw error;

      const linhas = (data ?? []) as (Execucao & { teste?: boolean })[];
      if (linhas.length === 0) return [];

      const idsDeFluxo = [...new Set(linhas.map((l) => l.automacao_id))];
      const { data: fluxos } = await tabela("wa_automacoes")
        .select("id, nome, instancia").in("id", idsDeFluxo);
      const doFluxo = new Map(
        ((fluxos ?? []) as Record<string, string>[]).map((f) => [f.id, { nome: f.nome, instancia: f.instancia }]),
      );

      const idsDeConversa = [...new Set(linhas.map((l) => l.conversa_id).filter(Boolean))] as string[];
      const nomes: Record<string, string> = {};
      if (idsDeConversa.length > 0) {
        const { data: convs } = await tabela("wa_conversas")
          .select("id, nome_real, nome_wa, telefone").in("id", idsDeConversa);
        for (const c of ((convs ?? []) as Record<string, string>[])) {
          nomes[c.id] = c.nome_real || c.nome_wa || c.telefone || "";
        }
      }

      return linhas.map((l) => {
        const f = doFluxo.get(l.automacao_id);
        return {
          ...l,
          teste: !!l.teste,
          /* Fluxo apagado deixa execução para trás, e o histórico continua
             valendo: é justamente ali que se vai procurar o que aquele fluxo
             fez antes de alguém apagá-lo. */
          automacao_nome: f?.nome ?? "fluxo apagado",
          instancia: f?.instancia ?? "",
          nome_do_lead: l.conversa_id ? (nomes[l.conversa_id] ?? null) : null,
        };
      });
    },
  });
}

/**
 * AS COLUNAS DAS BASES DO FLUXO, para a bandeja de variáveis.
 *
 * Não existe tabela de "cabeçalho da planilha": o que existe é o `bruto` de
 * cada lead, que é a linha inteira com o cabeçalho como chave. Então as colunas
 * se descobrem OLHANDO AS ÚLTIMAS LINHAS que chegaram, e não uma linha só: a
 * primeira pode ter vindo antes de uma coluna nova existir, e um campo em
 * branco nela não daria exemplo nenhum para a bandeja mostrar.
 *
 * Doze linhas por base é o suficiente para isso e continua sendo uma consulta
 * pequena. Com nenhuma base escolhida não há o que buscar, e a bandeja fica
 * só com `{nome}` e `{horario}`.
 */
export function useColunasDasBases(fonteIds: string[]) {
  const chave = [...fonteIds].sort().join(",");
  return useQuery({
    queryKey: ["wa", "automacoes", "colunas", chave],
    enabled: fonteIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<ColunaDaBase[]> => {
      const { data, error } = await tabela("leads_brutos")
        .select("bruto, chegou_em")
        .in("fonte_id", fonteIds)
        .order("chegou_em", { ascending: false, nullsFirst: false })
        /* 12 linhas bastavam para descobrir QUAIS colunas existem. Não bastam
           para descobrir quais RESPOSTAS cada uma tem, que é o que a "Escolha"
           oferece como atalho: numa base com três opções, doze linhas podem
           facilmente não conter uma delas, e a opção que falta é justamente a
           que ninguém vai lembrar de escrever à mão. */
        .limit(60 * fonteIds.length);
      if (error) throw error;
      return colunasDosBrutos(((data ?? []) as { bruto: Record<string, unknown> | null }[]).map((l) => l.bruto));
    },
  });
}

/* ── escrita ──────────────────────────────────────────────────────────────── */

export interface Rascunho {
  nome: string;
  /* O NÚMERO É PARTE DO FLUXO, e não o contexto em que ele foi criado. Era
     herdado em silêncio da aba aberta, o que dava para acertar por acaso e para
     errar sem aviso: o fluxo ficava salvo num número e a pessoa jurava tê-lo
     feito no outro. */
  instancia: string;
  gatilho: Gatilho;
  gatilho_config: ConfigDoGatilho;
  condicoes: Condicoes;
  passos: Passo[];
}

export async function criarAutomacao(r: Rascunho, criadaPor?: string | null) {
  const { data, error } = await tabela("wa_automacoes").insert({
    instancia: r.instancia,
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
    instancia: r.instancia,
    gatilho: r.gatilho,
    gatilho_config: r.gatilho_config,
    condicoes: r.condicoes,
    passos: r.passos,
  }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Põe um telefone no fluxo AGORA, para ver acontecer.
 *
 * Existe porque o primeiro teste de uma automação falha em silêncio: a trava
 * de "só vale daqui pra frente" não sabe distinguir "ligar um fluxo novo" de
 * "ligar um fluxo na base que já tem 692 leads", então ela barra os dois. Quem
 * aperta este botão está dizendo o que ela não adivinha.
 *
 * MANDA DE VERDADE. Não é simulação: a mensagem sai pelo número do fluxo, na
 * hora, mesmo fora do horário de atendimento.
 */
export async function testarAutomacao(id: string, telefone: string) {
  const { data, error } = await (supabase.rpc as never as any)("fn_wa_automacao_testar", {
    p_automacao: id, p_telefone: telefone,
  });
  if (error) throw new Error(error.message);
  const r = (Array.isArray(data) ? data[0] : data) as { ok?: boolean; erro?: string | null } | null;
  if (!r?.ok) throw new Error(r?.erro || "Não consegui disparar o teste.");
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
  return criarAutomacao({
    instancia: a.instancia,
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
