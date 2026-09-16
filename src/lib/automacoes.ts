/* O QUE UMA AUTOMAÇÃO PODE SER. GATILHO, CONDIÇÃO E PASSOS, NUM LUGAR SÓ.
 *
 * O atendimento já tinha automação antes desta tela: a régua de follow-up, a
 * mensagem de primeiro contato por faixa de horário, a jornada que anda sozinha
 * quando chega um PDF. Cada uma numa aba diferente, cada uma com uma tabela
 * própria, e nenhuma delas visível como "quando acontece X, faça Y" — que é
 * justamente como quem atende pensa.
 *
 * Esta é a gramática dessa frase. A tela desenha o que está escrito aqui, o
 * banco valida contra o que está escrito aqui, e o executor no servidor só sabe
 * fazer o que está escrito aqui. Uma lista nova de ação é uma linha nesta
 * tabela, e não uma tela nova.
 *
 * ───────────────────────── por que passos e não grafo ────────────────────────
 *
 * Um fluxo aqui é uma FILA de passos, não um desenho com fios. Não é limitação
 * de desenho: é o formato do trabalho. "Chegou lead novo, manda a mensagem,
 * espera dois dias, se não respondeu manda de novo" é uma linha reta.
 *
 * A fila tem DOIS tipos de bifurcação, e eles nasceram de duas perguntas
 * diferentes que a recepção de um lead faz.
 *
 * O "Se" é a primeira: o lead que responde o formulário e, antes de a automação
 * rodar, já mandou mensagem no WhatsApp. Responder a esse com a primeira
 * mensagem, como se ele nunca tivesse escrito, é o que uma fila reta faria. É
 * uma pergunta de sim ou não, sobre COMPORTAMENTO, e decide a postura.
 *
 * A "Escolha" é a segunda: o que a pessoa respondeu no formulário. "Estou
 * respondendo a um processo agora" e "quero me proteger antes" são o mesmo lead
 * para uma fila reta, e são conversas completamente diferentes. É uma pergunta
 * de N respostas, sobre CONTEÚDO, e decide o assunto.
 *
 * As duas juntas, uma dentro da outra, são a recepção personalizada inteira num
 * fluxo só. Por isso a "Escolha" cabe dentro de um lado do "Se", e por isso a
 * árvore para em dois níveis: não existe "Se" dentro de "Se" nem "Escolha"
 * dentro de "Escolha", porque o terceiro nível deixa de caber na tela de um
 * celular e na cabeça de quem confere o fluxo antes de ligar. Andar na árvore é
 * trabalho de `fluxoDePassos.ts`.
 *
 * ─────────────────────── o que este arquivo NÃO decide ───────────────────────
 *
 * Quem dispara de verdade é o banco (gatilhos em `leads_brutos`, `wa_conversas`
 * e `wa_mensagens`) e quem executa é a função `wa-automacoes`. Se um dia os dois
 * divergirem, o do banco é o que vale. Aqui é a lista do que existe e a
 * conferência do que a tela deixa salvar.
 */

import { ROTULO_FAIXA, type Faixa } from "./horarioAtendimento";
import { ETAPAS_BRADESCO, ETAPAS_PADRAO, type Jornada, etapasDaJornada } from "./jornada";
import type { Midia } from "./anexos";
import {
  todosOsPassos, rotuloDaPosicao, variaveisDoTexto, ramosDoPasso,
  type PassoComRamos,
} from "./fluxoDePassos";

/* ══════════════════ gatilhos ══════════════════════════════════════════════ */

export const GATILHOS = [
  "lead_novo_na_base",
  "etapa_mudou",
  "mensagem_recebida",
  "sem_resposta",
  "virou_cliente",
] as const;
export type Gatilho = (typeof GATILHOS)[number];

export interface GatilhoDef {
  chave: Gatilho;
  rotulo: string;
  /** a frase que aparece no cartão do gatilho, quando ele ainda não foi configurado */
  descricao: string;
  /** o que ele exige configurar; vazio quando funciona sozinho */
  campo: "bases" | "etapas" | "texto" | "dias" | null;
  /** ícone (nome do lucide) que a tela desenha */
  icone: string;
  /** dispara para quem AINDA NÃO TEM conversa: o executor precisa abrir uma */
  abreConversa: boolean;
}

export const GATILHOS_DEF: readonly GatilhoDef[] = [
  {
    chave: "lead_novo_na_base",
    rotulo: "Lead novo na base",
    descricao: "quando uma linha nova aparece na planilha",
    campo: "bases",
    icone: "Database",
    abreConversa: true,
  },
  {
    chave: "etapa_mudou",
    rotulo: "Mudou de etapa",
    descricao: "quando o lead entra numa etapa da jornada",
    campo: "etapas",
    icone: "Milestone",
    abreConversa: false,
  },
  {
    chave: "mensagem_recebida",
    rotulo: "Mensagem recebida",
    descricao: "quando o lead escreve",
    campo: "texto",
    icone: "MessageSquareText",
    abreConversa: false,
  },
  {
    chave: "sem_resposta",
    rotulo: "Sem resposta há dias",
    descricao: "quando o lead fica calado",
    campo: "dias",
    icone: "Hourglass",
    abreConversa: false,
  },
  {
    chave: "virou_cliente",
    rotulo: "Virou cliente",
    descricao: "quando o lead é aprovado e vira cliente",
    campo: null,
    icone: "BadgeCheck",
    abreConversa: false,
  },
];

export function defDoGatilho(g: Gatilho): GatilhoDef {
  return GATILHOS_DEF.find((d) => d.chave === g) ?? GATILHOS_DEF[0];
}

export function gatilhoValido(x: unknown): x is Gatilho {
  return typeof x === "string" && (GATILHOS as readonly string[]).includes(x);
}

/** O que cada gatilho guarda além do nome. Campos que ele não usa ficam de fora. */
export interface ConfigDoGatilho {
  /** lead_novo_na_base: quais bases. Lista vazia = todas as bases do número. */
  fonte_ids?: string[];
  /**
   * lead_novo_na_base: a pessoa escolheu "qualquer base" de propósito.
   *
   * Existe para separar duas coisas que o banco não distingue e que são muito
   * diferentes na tela: "eu quero todas as bases" e "eu ainda não respondi qual
   * base". As duas gravam lista vazia, e sem esta marca a segunda passava por
   * escolha feita — o fluxo ligava escutando TODAS as planilhas do número
   * porque ninguém tinha dito nada.
   */
  bases_todas?: boolean;
  /** etapa_mudou: quais etapas. Lista vazia = qualquer uma. */
  etapas?: string[];
  /** mensagem_recebida: só quando a mensagem contém isto. Vazio = qualquer mensagem. */
  contendo?: string | null;
  /** sem_resposta: dias de silêncio. */
  dias?: number;
}

/* ══════════════════ passos ════════════════════════════════════════════════ */

export const TIPOS_DE_PASSO = [
  "mensagem",
  "esperar",
  "parar_se_respondeu",
  "se",
  "escolha",
  "mover_etapa",
  "tarefa",
] as const;
export type TipoDePasso = (typeof TIPOS_DE_PASSO)[number];

export interface PassoDef {
  chave: TipoDePasso;
  rotulo: string;
  descricao: string;
  icone: string;
  /** o tom do cartão na tela; cada tipo tem o seu, fixo */
  tom: "primary" | "amber" | "sky" | "violet" | "emerald" | "zinc";
}

export const PASSOS_DEF: readonly PassoDef[] = [
  { chave: "mensagem",           rotulo: "Enviar mensagem",  descricao: "vai para a fila e sai pelo número da automação", icone: "Send",       tom: "primary" },
  { chave: "esperar",            rotulo: "Esperar",          descricao: "segura o fluxo antes do próximo passo",          icone: "Timer",      tom: "amber" },
  { chave: "parar_se_respondeu", rotulo: "Parar se respondeu", descricao: "quem respondeu não recebe o resto",            icone: "Split",      tom: "sky" },
  { chave: "se",                 rotulo: "Se… então",        descricao: "segue por um lado ou pelo outro",                icone: "GitFork",    tom: "violet" },
  { chave: "escolha",            rotulo: "Escolha por resposta", descricao: "uma saída para cada resposta do formulário", icone: "Rows3",      tom: "violet" },
  { chave: "mover_etapa",        rotulo: "Mover de etapa",   descricao: "empurra o lead na jornada",                      icone: "Milestone",  tom: "emerald" },
  { chave: "tarefa",             rotulo: "Criar tarefa",     descricao: "abre um lembrete para alguém da equipe",         icone: "ListTodo",   tom: "zinc" },
];

/**
 * Os tipos que cabem DENTRO de um lado do "Se".
 *
 * Fica de fora outro "Se" (dois booleanos encadeados são uma "Escolha" escrita
 * de um jeito pior) mas entra a "Escolha", e é ela que faz a árvore valer dois
 * níveis. É esse par que resolve o caso real: "o lead já escreveu?" é a
 * postura, "o que ele respondeu no formulário?" é o assunto, e são perguntas
 * de naturezas diferentes, uma dentro da outra.
 */
export const TIPOS_DENTRO_DE_RAMO: readonly TipoDePasso[] = TIPOS_DE_PASSO.filter((t) => t !== "se");

/** Os tipos que cabem dentro de um CASO da "Escolha": nada que abra ramo. */
export const TIPOS_DENTRO_DE_CASO: readonly TipoDePasso[] =
  TIPOS_DE_PASSO.filter((t) => t !== "se" && t !== "escolha");

/* ══════════════════ a pergunta do "Se" ═════════════════════════════════════ */

export const TIPOS_DE_CONDICAO = ["ja_escreveu", "respondeu", "campo"] as const;
export type TipoDeCondicao = (typeof TIPOS_DE_CONDICAO)[number];

export const OPERADORES = ["contem", "igual", "vazio", "nao_vazio"] as const;
export type Operador = (typeof OPERADORES)[number];

export interface Condicao {
  tipo: TipoDeCondicao;
  /** campo: qual coluna da base */
  campo?: string;
  /** campo: como comparar */
  op?: Operador;
  /** campo: com o quê (contem, igual) */
  valor?: string;
}

export interface CondicaoDef {
  chave: TipoDeCondicao;
  rotulo: string;
  descricao: string;
}

export const CONDICOES_DEF: readonly CondicaoDef[] = [
  {
    chave: "ja_escreveu",
    rotulo: "O lead já nos escreveu",
    descricao: "alguma vez, neste número. É o caso de quem preencheu o formulário e já veio falar no WhatsApp.",
  },
  {
    chave: "respondeu",
    rotulo: "Respondeu depois que o fluxo começou",
    descricao: "escreveu qualquer coisa desde o disparo. Só faz sentido depois de uma espera.",
  },
  {
    chave: "campo",
    rotulo: "Uma coluna da base",
    descricao: "compara o que o lead preencheu na planilha, na linha dele.",
  },
];

export const ROTULO_OPERADOR: Record<Operador, string> = {
  contem: "contém",
  igual: "é igual a",
  vazio: "está vazia",
  nao_vazio: "está preenchida",
};

export function operadorPrecisaDeValor(op: Operador | undefined): boolean {
  return op === undefined || op === "contem" || op === "igual";
}

export function defDaCondicao(t: TipoDeCondicao): CondicaoDef {
  return CONDICOES_DEF.find((c) => c.chave === t) ?? CONDICOES_DEF[0];
}

export function tipoDeCondicaoValido(x: unknown): x is TipoDeCondicao {
  return typeof x === "string" && (TIPOS_DE_CONDICAO as readonly string[]).includes(x);
}

export const CONDICAO_PADRAO: Condicao = { tipo: "ja_escreveu" };

/** "se o lead já nos escreveu", "se Funcionários contém “50”". */
export function fraseDaCondicao(c: Condicao | null | undefined): string {
  const t = c?.tipo ?? "ja_escreveu";
  if (t === "ja_escreveu") return "se o lead já nos escreveu";
  if (t === "respondeu") return "se o lead respondeu depois que o fluxo começou";
  const campo = (c?.campo || "").trim();
  if (!campo) return "se uma coluna da base (falta escolher qual)";
  const op = c?.op ?? "contem";
  if (!operadorPrecisaDeValor(op)) return `se ${campo} ${ROTULO_OPERADOR[op]}`;
  const v = (c?.valor || "").trim();
  return v ? `se ${campo} ${ROTULO_OPERADOR[op]} “${v}”` : `se ${campo} ${ROTULO_OPERADOR[op]} (falta o valor)`;
}

export function defDoPasso(t: TipoDePasso): PassoDef {
  return PASSOS_DEF.find((p) => p.chave === t) ?? PASSOS_DEF[0];
}

export function tipoDePassoValido(x: unknown): x is TipoDePasso {
  return typeof x === "string" && (TIPOS_DE_PASSO as readonly string[]).includes(x);
}

/**
 * Um caso da "Escolha": um valor possível da coluna, e o que fazer com ele.
 *
 * A coluna mora no passo, e não aqui, porque uma "Escolha" é sobre UMA
 * pergunta. Espalhar a coluna pelos casos deixaria montar um switch que
 * compara três colunas diferentes, que é um "Se" encadeado disfarçado e volta
 * a ser ilegível.
 */
export interface Caso {
  id: string;
  /** como comparar a coluna do passo com `valor` */
  op: Operador;
  valor: string;
  passos: Passo[];
}

export interface Passo extends PassoComRamos {
  /** identidade do passo na lista, para a animação saber quem é quem ao reordenar */
  id: string;
  tipo: TipoDePasso;
  /** mensagem */
  texto?: string;
  midias?: Midia[];
  /** esperar */
  minutos?: number;
  /** mover_etapa */
  etapa?: string;
  /** tarefa */
  titulo?: string;
  /** tarefa: para quando, contado do disparo */
  dias?: number;
  /** se: a pergunta */
  condicao?: Condicao;
  /** escolha: qual coluna da base está sendo perguntada */
  campo?: string;
  /** escolha: os valores previstos, conferidos NA ORDEM (o primeiro que casar leva) */
  casos?: Caso[];
  /** se: o lado de quem respondeu sim */
  entao?: Passo[];
  /** se: o lado de quem respondeu não; escolha: quem não casou com caso nenhum */
  senao?: Passo[];
}

/** Teto de casos numa "Escolha". Acima disso não é recepção, é URA de telefone. */
export const MAX_CASOS = 6;

let contadorDeCaso = 0;
export function novoIdDeCaso(): string {
  contadorDeCaso += 1;
  return `c${Date.now().toString(36)}${contadorDeCaso.toString(36)}`;
}

export function casoNovo(valor = ""): Caso {
  return { id: novoIdDeCaso(), op: "contem", valor, passos: [] };
}

/** "quando Situação contém “processo”" — o cabeçalho do caso, na tela. */
export function fraseDoCaso(campo: string | null | undefined, c: Caso): string {
  const col = (campo || "").trim() || "a coluna";
  if (!operadorPrecisaDeValor(c.op)) return `quando ${col} ${ROTULO_OPERADOR[c.op]}`;
  const v = (c.valor || "").trim();
  return v ? `quando ${col} ${ROTULO_OPERADOR[c.op]} “${v}”` : `quando ${col} ${ROTULO_OPERADOR[c.op]} (falta o valor)`;
}

/**
 * As variáveis que existem sem base nenhuma: vêm da conversa e do horário do
 * número. Tudo o mais entre chaves tem que ser coluna de uma base do fluxo.
 */
export const VARIAVEIS_FIXAS = ["nome", "horario"] as const;

/* ══════════════════ a automação inteira ═══════════════════════════════════ */

export interface Condicoes {
  /**
   * LEGADO. Era o interruptor único de "só no horário de atendimento", e virou
   * o valor de partida de `faixas` para os fluxos salvos antes delas
   * existirem. Fluxo novo não escreve mais aqui.
   */
  so_horario_comercial: boolean;
  /** quantos leads por dia, no máximo. Trava contra a planilha que ganha 600 linhas de uma vez. */
  teto_dia: number;
  /**
   * EM QUAIS FAIXAS DO DIA ESTE FLUXO PODE MANDAR.
   *
   * O dia do número tem três estados (a mesma grade do Primeiro atendimento):
   * atendimento, direcionamento e fechado. Antes a escolha era um sim ou não
   * para "atendimento", o que deixava de fora o caso comum de querer mandar
   * também na faixa de direcionamento, quando o escritório já está de pé.
   *
   * Lista vazia é "a qualquer hora", e é diferente de ausente: ausente quer
   * dizer fluxo antigo, que ainda não respondeu isto e herda o interruptor de
   * cima.
   */
  faixas?: Faixa[];
  /**
   * O LEAD QUE CHEGOU FORA DA FAIXA RECEBE DEPOIS, OU NÃO RECEBE?
   *
   * Chega lead às 3 da manhã e o fluxo só manda no atendimento. Duas respostas
   * defensáveis e opostas: mandar às 7, quando abrir (ele esperou, mas a
   * mensagem faz sentido), ou não mandar nunca (de manhã aquele lead já é
   * velho, e uma saudação de primeiro contato oito horas depois soa a robô
   * atrasado). Quem sabe qual é o certo é quem atende, então isto é pergunta,
   * e não regra minha.
   */
  retroativo?: boolean;
}

export const CONDICOES_PADRAO: Condicoes = {
  so_horario_comercial: true,
  teto_dia: 50,
  faixas: ["atendimento"],
  retroativo: true,
};

/** As três faixas, na ordem em que o dia acontece. */
export const FAIXAS_DO_DIA: readonly Faixa[] = ["atendimento", "direcionamento", "fechado"];

export const DESCRICAO_DA_FAIXA: Record<Faixa, string> = {
  atendimento: "tem gente aqui para responder",
  direcionamento: "já estamos de pé, o responsável ainda não chegou",
  fechado: "fora da grade, incluindo a madrugada",
};

/**
 * Em quais faixas este fluxo manda, resolvendo o legado.
 *
 * Fluxo salvo antes das faixas existirem não tem a lista; o que ele tem é o
 * interruptor antigo, e ele quer dizer exatamente "só na faixa de
 * atendimento". Ler o legado aqui, num lugar só, evita que a tela e o banco
 * cheguem a conclusões diferentes sobre o mesmo fluxo.
 */
export function faixasDaAutomacao(c: Pick<Condicoes, "so_horario_comercial" | "faixas">): Faixa[] {
  if (Array.isArray(c.faixas)) {
    const boas = c.faixas.filter((f): f is Faixa => (FAIXAS_DO_DIA as readonly string[]).includes(f));
    /* As três marcadas é o mesmo que nenhuma: o dia inteiro cabe nelas, e
       guardar as três faria o banco conferir três vezes para sempre dar sim. */
    return boas.length >= FAIXAS_DO_DIA.length ? [] : [...new Set(boas)];
  }
  return c.so_horario_comercial ? ["atendimento"] : [];
}

/** O fluxo manda a qualquer hora? */
export function mandaAQualquerHora(c: Pick<Condicoes, "so_horario_comercial" | "faixas">): boolean {
  return faixasDaAutomacao(c).length === 0;
}

/** "só no atendimento", "no atendimento e no direcionamento", "a qualquer hora". */
export function fraseDasFaixas(c: Pick<Condicoes, "so_horario_comercial" | "faixas">): string {
  const f = faixasDaAutomacao(c);
  if (f.length === 0) return "a qualquer hora do dia";
  const nomes = FAIXAS_DO_DIA.filter((x) => f.includes(x)).map((x) => ROTULO_FAIXA[x].toLowerCase());
  if (nomes.length === 1) return `só em ${nomes[0]}`;
  return `em ${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

export interface Automacao {
  id: string;
  nome: string;
  instancia: string;
  ativa: boolean;
  /** quando o interruptor foi ligado; evento anterior a isso não dispara */
  ligada_em?: string | null;
  gatilho: Gatilho;
  gatilho_config: ConfigDoGatilho;
  condicoes: Condicoes;
  passos: Passo[];
  updated_at?: string | null;
}

/**
 * Teto de passos, contando os de dentro dos ramos.
 *
 * Não é limite técnico: é o ponto em que a fila deixa de caber na tela e de
 * caber na cabeça. Subiu de 16 para 28 quando a "Escolha" entrou, porque o
 * número antigo media uma fila com no máximo uma bifurcação de dois lados. Uma
 * recepção com três respostas previstas gasta cinco passos só para existir, e
 * no teto antigo não sobrava fluxo para escrever depois dela.
 */
export const MAX_PASSOS = 28;
/** Teto da espera, em minutos: 30 dias. Mais que isso não é automação, é esquecimento. */
export const MAX_ESPERA = 60 * 24 * 30;

let contador = 0;
/** Um id de passo que não repete dentro da sessão. Só a tela usa; o banco guarda como veio. */
export function novoIdDePasso(): string {
  contador += 1;
  return `p${Date.now().toString(36)}${contador.toString(36)}`;
}

export function passoNovo(tipo: TipoDePasso): Passo {
  const base: Passo = { id: novoIdDePasso(), tipo };
  if (tipo === "mensagem") return { ...base, texto: "", midias: [] };
  if (tipo === "esperar") return { ...base, minutos: 60 };
  if (tipo === "tarefa") return { ...base, titulo: "", dias: 1 };
  if (tipo === "mover_etapa") return { ...base, etapa: "" };
  if (tipo === "se") return { ...base, condicao: { ...CONDICAO_PADRAO }, entao: [], senao: [] };
  /* Nasce com dois casos porque uma "Escolha" de um caso é um "Se" pior
     escrito, e a tela que abre já mostrando o formato certo ensina o formato. */
  if (tipo === "escolha") return { ...base, campo: "", casos: [casoNovo(), casoNovo()], senao: [] };
  return base;
}

/* ══════════════════ o que é aceitável salvar ══════════════════════════════ */

/**
 * O que impede de LIGAR a automação.
 *
 * Salvar um rascunho quebrado é normal (a pessoa está no meio de escrever).
 * Ligar é que não pode: uma automação ligada com um passo vazio mandaria
 * mensagem em branco para quem acabou de chegar, e ninguém descobriria pela
 * tela, só pelo lead perguntando o que foi aquilo.
 */
export function impedimentos(
  a: Pick<Automacao, "nome" | "gatilho" | "gatilho_config" | "passos" | "condicoes">,
  /**
   * As colunas das bases deste fluxo, quando a tela as conhece. Com elas, uma
   * variável que não existe em base nenhuma vira impedimento: sem elas (a lista
   * de fluxos não carrega colunas), essa conferência fica de fora em vez de
   * acusar tudo por não saber.
   */
  colunas?: readonly string[] | null,
  /**
   * O número deste fluxo tem grade de horário configurada?
   *
   * RESTRINGIR FAIXA NUM NÚMERO SEM GRADE NÃO FAZ NADA, E EM SILÊNCIO. O banco
   * trata "sem grade" como "não sei que horas são aqui" e manda a qualquer
   * hora, de propósito: quem nunca configurou horário não quer o fluxo preso
   * para sempre. Só que na tela a pessoa marcou "só em atendimento", salvou,
   * ligou, e vai jurar que a mensagem não sai de madrugada. Sai.
   *
   * `undefined` é "a tela ainda não sabe", e aí não se acusa nada.
   */
  temGrade?: boolean,
): string[] {
  const erros: string[] = [];

  if (!a.nome.trim()) erros.push("Dê um nome à automação.");
  const todos = todosOsPassos(a.passos);
  if (todos.length === 0) erros.push("Uma automação sem passos não faz nada.");
  if (todos.length > MAX_PASSOS) erros.push(`No máximo ${MAX_PASSOS} passos, contando os de dentro dos ramos.`);

  const def = defDoGatilho(a.gatilho);
  if (def.campo === "bases" && !a.gatilho_config.bases_todas && (a.gatilho_config.fonte_ids ?? []).length === 0) {
    erros.push("Escolha em qual base este fluxo escuta.");
  }
  if (def.campo === "dias") {
    const d = Number(a.gatilho_config.dias ?? 0);
    if (!Number.isFinite(d) || d < 1 || d > 365) erros.push("O silêncio do gatilho precisa ser entre 1 e 365 dias.");
  }

  const conhecidas = colunas
    ? new Set<string>([...VARIAVEIS_FIXAS, ...colunas.map((c) => c.trim())])
    : null;

  for (const p of todos) {
    /* "O passo 3" ou "O passo 2 · sim 1": o rótulo que a tela mostra, para a
       pessoa achar o cartão sem contar. */
    const n = rotuloDaPosicao(a.passos, p.id).replace(/^Passo/, "passo");
    if (p.tipo === "mensagem") {
      const temTexto = !!(p.texto || "").trim();
      const temMidia = (p.midias ?? []).length > 0;
      if (!temTexto && !temMidia) erros.push(`O ${n} é uma mensagem vazia.`);
      if (conhecidas) {
        const estranhas = variaveisDoTexto(p.texto).filter((v) => !conhecidas.has(v));
        if (estranhas.length > 0) {
          erros.push(`O ${n} usa {${estranhas[0]}}, que não é coluna de nenhuma base deste fluxo.`);
        }
      }
    }
    if (p.tipo === "esperar") {
      const m = Number(p.minutos ?? 0);
      if (!Number.isFinite(m) || m < 1) erros.push(`O ${n} precisa de uma espera de pelo menos 1 minuto.`);
      else if (m > MAX_ESPERA) erros.push(`O ${n} espera mais de 30 dias.`);
    }
    if (p.tipo === "mover_etapa" && !(p.etapa || "").trim()) erros.push(`O ${n} não diz para qual etapa mover.`);
    if (p.tipo === "tarefa" && !(p.titulo || "").trim()) erros.push(`O ${n} é uma tarefa sem título.`);
    if (p.tipo === "se") {
      const c = p.condicao ?? CONDICAO_PADRAO;
      if (!tipoDeCondicaoValido(c.tipo)) erros.push(`O ${n} tem uma pergunta que esta versão não conhece.`);
      if (c.tipo === "campo") {
        if (!(c.campo || "").trim()) erros.push(`O ${n} compara uma coluna que ainda não foi escolhida.`);
        else if (conhecidas && !conhecidas.has(c.campo!.trim())) {
          erros.push(`O ${n} compara a coluna “${c.campo}”, que não existe em nenhuma base deste fluxo.`);
        }
        if (operadorPrecisaDeValor(c.op) && !(c.valor || "").trim()) erros.push(`O ${n} compara com um valor vazio.`);
      }
      if ((p.entao ?? []).length === 0 && (p.senao ?? []).length === 0) {
        erros.push(`O ${n} é um “Se” sem nada nos dois lados.`);
      }
      if ([...(p.entao ?? []), ...(p.senao ?? [])].some((x) => x.tipo === "se")) {
        erros.push(`O ${n} tem um “Se” dentro de outro, e isto só vai até um nível.`);
      }
    }
    if (p.tipo === "escolha") {
      const campo = (p.campo || "").trim();
      const casos = p.casos ?? [];
      if (!campo) erros.push(`A ${n} não diz qual coluna da base está perguntando.`);
      else if (conhecidas && !conhecidas.has(campo)) {
        erros.push(`A ${n} pergunta a coluna “${campo}”, que não existe em nenhuma base deste fluxo.`);
      }
      if (casos.length === 0) erros.push(`A ${n} não tem nenhum caso.`);
      if (casos.length > MAX_CASOS) erros.push(`A ${n} tem mais de ${MAX_CASOS} casos.`);
      casos.forEach((c, i) => {
        if (operadorPrecisaDeValor(c.op) && !(c.valor || "").trim()) {
          erros.push(`O caso ${i + 1} da ${n} compara com um valor vazio.`);
        }
        if ((c.passos ?? []).some((x) => x.tipo === "se" || x.tipo === "escolha")) {
          erros.push(`O caso ${i + 1} da ${n} abre outro ramo, e a árvore só vai até dois níveis.`);
        }
      });
      /* DOIS CASOS COM A MESMA PERGUNTA: o segundo é código morto, porque quem
         decide é o primeiro que casar. Não quebra nada, e é sempre engano. */
      const vistos = new Set<string>();
      for (const c of casos) {
        const chave = `${c.op} ${(c.valor || "").trim().toLowerCase()}`;
        if (vistos.has(chave)) {
          erros.push(`A ${n} tem dois casos iguais; o segundo nunca vai ser usado.`);
          break;
        }
        vistos.add(chave);
      }
      const temSaida = casos.some((c) => (c.passos ?? []).length > 0) || (p.senao ?? []).length > 0;
      if (!temSaida) erros.push(`A ${n} é uma escolha sem nada em caso nenhum.`);
    }
  }

  /* PARAR SE RESPONDEU NO PRIMEIRO PASSO NÃO PARA NADA. Ele compara com o
     momento em que a automação começou; no passo 1 esse momento é agora, e a
     resposta que ele procura ainda não teve tempo de existir. O "Se respondeu"
     é a mesma pergunta com dois lados, e vale a mesma regra. */
  const primeiro = a.passos[0];
  if (primeiro?.tipo === "parar_se_respondeu") {
    erros.push("“Parar se respondeu” só faz sentido depois de uma espera.");
  }
  if (primeiro?.tipo === "se" && (primeiro.condicao?.tipo ?? "ja_escreveu") === "respondeu") {
    erros.push("“Se respondeu” no primeiro passo é sempre não: ponha uma espera antes.");
  }

  const t = Number(a.condicoes.teto_dia ?? 0);
  if (!Number.isFinite(t) || t < 1 || t > 1000) erros.push("O teto por dia precisa ser entre 1 e 1000.");

  if (temGrade === false && !mandaAQualquerHora(a.condicoes)) {
    erros.push(
      "Este número não tem grade de horário, então a restrição de faixa não vale: "
      + "monte a grade em Automações, Primeiro atendimento.",
    );
  }

  return erros;
}

export function podeLigar(a: Pick<Automacao, "nome" | "gatilho" | "gatilho_config" | "passos" | "condicoes">): boolean {
  return impedimentos(a).length === 0;
}

/* ══════════════════ as colunas da base, para a bandeja ════════════════════ */

export interface ColunaDaBase {
  /** o nome exato do cabeçalho: é o que vai entre chaves */
  coluna: string;
  /** o valor mais recente que alguém preencheu, para o exemplo da bandeja */
  exemplo: string | null;
  /**
   * As respostas distintas que esta coluna tem nas linhas olhadas.
   *
   * Existe para a "Escolha" virar clique em vez de digitação. Um caso escrito à
   * mão com uma palavra que a planilha nunca teve NUNCA CASA, e o lead cai em
   * "os demais" para sempre sem erro nenhum na tela: é o tipo de defeito que só
   * aparece semanas depois, quando alguém repara que a recepção personalizada
   * nunca personalizou nada.
   */
  valores: string[];
}

/** Teto de respostas distintas guardadas por coluna. Acima disso é campo aberto, não opção. */
export const MAX_VALORES_POR_COLUNA = 12;

/**
 * As colunas que aparecem nas linhas brutas de uma base, na ordem do cabeçalho.
 *
 * O `bruto` de cada lead é a linha inteira da planilha, com o cabeçalho como
 * chave. A base não guarda o cabeçalho em lugar nenhum além disso, e olhar
 * as últimas linhas é o que dá a lista do que existe HOJE (uma coluna nova no
 * formulário aparece na próxima linha que chegar).
 *
 * Fica de fora a coluna do telefone: ninguém escreve o número da pessoa numa
 * mensagem para ela.
 */
export function colunasDosBrutos(brutos: readonly (Record<string, unknown> | null | undefined)[]): ColunaDaBase[] {
  const ordem: string[] = [];
  const exemplo = new Map<string, string | null>();
  /* Set guarda a ordem de inserção, e a ordem aqui é a das linhas olhadas (da
     mais recente para a mais antiga). A resposta que mais gente deu ultimamente
     aparece primeiro na tela, que é a que mais serve. */
  const valores = new Map<string, Set<string>>();
  for (const b of brutos) {
    if (!b || typeof b !== "object") continue;
    for (const [k, v] of Object.entries(b)) {
      const chave = k.trim();
      if (!chave || /whats|telefone|celular|fone\b|contato/i.test(chave)) continue;
      if (!exemplo.has(chave)) { ordem.push(chave); exemplo.set(chave, null); valores.set(chave, new Set()); }
      const s = v == null ? "" : String(v).trim();
      if (!s) continue;
      if (exemplo.get(chave) === null) exemplo.set(chave, s);
      const vistos = valores.get(chave)!;
      /* Resposta longa é texto livre ("conte seu caso"), e texto livre não vira
         botão: viraria um botão por lead. */
      if (vistos.size < MAX_VALORES_POR_COLUNA && s.length <= 120) vistos.add(s);
    }
  }
  return ordem.map((coluna) => ({
    coluna,
    exemplo: exemplo.get(coluna) ?? null,
    valores: [...(valores.get(coluna) ?? [])],
  }));
}

/* ══════════════════ como a automação se lê em uma linha ═══════════════════ */

/** "2 dias" em vez de "2880 minutos": ninguém agenda em minutos acima de uma hora. */
export function esperaBonita(minutos: number): string {
  const m = Math.max(0, Math.round(Number(minutos) || 0));
  if (m < 60) return `${m} min`;
  if (m % (60 * 24) === 0) {
    const d = m / (60 * 24);
    return `${d} dia${d === 1 ? "" : "s"}`;
  }
  if (m % 60 === 0) {
    const h = m / 60;
    return `${h} hora${h === 1 ? "" : "s"}`;
  }
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, "0")}`;
}

/** O resumo de um passo, do jeito que ele aparece no cartão. */
export function resumoDoPasso(p: Passo): string {
  if (p.tipo === "mensagem") {
    const t = (p.texto || "").trim().replace(/\s+/g, " ");
    const n = (p.midias ?? []).length;
    if (t) return t.length <= 70 ? t : `${t.slice(0, 69).trimEnd()}…`;
    return n > 0 ? `${n} anexo${n === 1 ? "" : "s"}` : "mensagem em branco";
  }
  if (p.tipo === "esperar") return esperaBonita(Number(p.minutos ?? 0));
  if (p.tipo === "parar_se_respondeu") return "quem respondeu sai do fluxo";
  if (p.tipo === "se") {
    const s = (p.entao ?? []).length;
    const n = (p.senao ?? []).length;
    const conta = (q: number) => `${q} passo${q === 1 ? "" : "s"}`;
    return `${fraseDaCondicao(p.condicao)} · sim: ${conta(s)} · não: ${conta(n)}`;
  }
  if (p.tipo === "escolha") {
    const campo = (p.campo || "").trim();
    const q = (p.casos ?? []).length;
    const sobra = (p.senao ?? []).length > 0 ? " + os demais" : "";
    if (!campo) return `escolha sem coluna · ${q} caso${q === 1 ? "" : "s"}${sobra}`;
    return `por ${campo} · ${q} caso${q === 1 ? "" : "s"}${sobra}`;
  }
  if (p.tipo === "mover_etapa") return p.etapa ? rotuloDeEtapaQualquer(p.etapa) : "etapa não escolhida";
  if (p.tipo === "tarefa") {
    const q = Number(p.dias ?? 0);
    const quando = q <= 0 ? "hoje" : q === 1 ? "amanhã" : `em ${q} dias`;
    return `${(p.titulo || "sem título").trim()} · ${quando}`;
  }
  return "";
}

/** O rótulo de uma etapa sem saber a jornada: o fluxo pode valer para as duas. */
export function rotuloDeEtapaQualquer(chave: string): string {
  return [...ETAPAS_BRADESCO, ...ETAPAS_PADRAO].find((e) => e.chave === chave)?.rotulo ?? chave;
}

/**
 * As etapas que a tela oferece, sem repetir a que existe nas duas jornadas.
 *
 * Um fluxo é de um NÚMERO, e um número atende leads das duas jornadas ao mesmo
 * tempo. Oferecer só as de uma delas esconderia metade das etapas de quem
 * escolheu o número errado na hora de criar.
 */
export function etapasOferecidas(jornada?: Jornada | null): { chave: string; rotulo: string }[] {
  const lista = jornada ? etapasDaJornada(jornada) : [...ETAPAS_BRADESCO, ...ETAPAS_PADRAO];
  const vistas = new Set<string>();
  const saida: { chave: string; rotulo: string }[] = [];
  for (const e of lista) {
    if (vistas.has(e.chave)) continue;
    vistas.add(e.chave);
    saida.push({ chave: e.chave, rotulo: e.rotulo });
  }
  return saida;
}

/**
 * A frase do gatilho já configurado, para o cartão de cima do fluxo.
 *
 * `nomeDaBase` vem de fora porque o nome da planilha mora em outra tabela, e
 * este arquivo não fala com o banco.
 */
export function fraseDoGatilho(
  gatilho: Gatilho,
  cfg: ConfigDoGatilho,
  nomeDaBase?: (id: string) => string,
): string {
  if (gatilho === "lead_novo_na_base") {
    const ids = cfg.fonte_ids ?? [];
    if (ids.length === 0) {
      return cfg.bases_todas
        ? "quando chega lead novo em qualquer base deste número"
        : "falta escolher em qual base";
    }
    const nomes = ids.map((id) => nomeDaBase?.(id) ?? "base").filter(Boolean);
    return `quando chega lead novo em ${nomes.join(", ")}`;
  }
  if (gatilho === "etapa_mudou") {
    const es = cfg.etapas ?? [];
    if (es.length === 0) return "quando o lead muda de etapa, qualquer que seja";
    return `quando o lead entra em ${es.map(rotuloDeEtapaQualquer).join(", ")}`;
  }
  if (gatilho === "mensagem_recebida") {
    const c = (cfg.contendo || "").trim();
    return c ? `quando o lead escreve algo com “${c}”` : "quando o lead escreve";
  }
  if (gatilho === "sem_resposta") {
    const d = Number(cfg.dias ?? 0);
    return `quando o lead fica ${d} dia${d === 1 ? "" : "s"} sem responder`;
  }
  return "quando o lead é aprovado e vira cliente";
}

/**
 * Quantas mensagens este fluxo manda, e em quanto tempo ele termina.
 *
 * É o número que responde "o que isso vai fazer com a minha base" antes de
 * ligar. Sem ele a pessoa liga para descobrir, e descobrir custa mensagem
 * enviada para gente de verdade.
 */
export function resumoDoFluxo(passos: Passo[]): { mensagens: number; duracaoMin: number } {
  let mensagens = 0;
  let duracaoMin = 0;
  for (const p of passos) {
    if (p.tipo === "mensagem") mensagens += 1;
    if (p.tipo === "esperar") duracaoMin += Math.max(0, Number(p.minutos ?? 0));
    /* Um lead passa por UM ramo. O número que interessa antes de ligar é o
       PIOR CASO ("até N mensagens"), e não a soma de todos: somar faria uma
       escolha de cinco casos parecer cinco vezes mais agressiva do que é, e
       quem lesse isso não ligaria um fluxo que era perfeitamente seguro. */
    const ramos = ramosDoPasso(p).map((r) => resumoDoFluxo(r.lista as Passo[]));
    if (ramos.length > 0) {
      mensagens += Math.max(...ramos.map((r) => r.mensagens));
      duracaoMin += Math.max(...ramos.map((r) => r.duracaoMin));
    }
  }
  return { mensagens, duracaoMin };
}

/* ══════════════════ o que volta do banco ══════════════════════════════════ */

/** Uma passagem de um lead pelo fluxo, para a aba de execuções. */
export interface Execucao {
  id: string;
  automacao_id: string;
  conversa_id: string | null;
  telefone: string | null;
  status: "pendente" | "rodando" | "concluida" | "falhou" | "parada";
  passo: number;
  detalhe: string | null;
  erro: string | null;
  disparada_em: string;
  rodar_em: string | null;
  terminada_em: string | null;
}

export const ROTULO_STATUS: Record<Execucao["status"], string> = {
  pendente: "na fila",
  rodando: "rodando",
  concluida: "concluída",
  falhou: "falhou",
  parada: "parada",
};

/**
 * Linha por linha do que aconteceu, garantida em prosa.
 *
 * O `detalhe` vem do executor e pode estar vazio (execução que ainda não rodou).
 * Cair num traço solto na tela é o tipo de buraco que faz parecer defeito.
 */
export function contarExecucoes(execs: Execucao[]): Record<Execucao["status"], number> {
  const zero: Record<Execucao["status"], number> = {
    pendente: 0, rodando: 0, concluida: 0, falhou: 0, parada: 0,
  };
  for (const e of execs) zero[e.status] = (zero[e.status] ?? 0) + 1;
  return zero;
}
