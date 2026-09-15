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
 * Um fluxo aqui é uma FILA de passos, não um desenho com ramos. Não é limitação
 * de desenho: é o formato do trabalho. "Chegou lead novo, manda a mensagem,
 * espera dois dias, se não respondeu manda de novo" é uma linha reta. Ramo de
 * verdade (se A vai por aqui, se B vai por ali) exigiria cada passo saber
 * apontar para dois lugares, e a tela inteira ganharia arrastar, encaixar e
 * desencaixar para servir a um caso que ninguém pediu. Quando a condição
 * importa, ela PARA a fila (`parar_se_respondeu`), que é o ramo que existe na
 * prática.
 *
 * ─────────────────────── o que este arquivo NÃO decide ───────────────────────
 *
 * Quem dispara de verdade é o banco (gatilhos em `leads_brutos`, `wa_conversas`
 * e `wa_mensagens`) e quem executa é a função `wa-automacoes`. Se um dia os dois
 * divergirem, o do banco é o que vale. Aqui é a lista do que existe e a
 * conferência do que a tela deixa salvar.
 */

import { ETAPAS_BRADESCO, ETAPAS_PADRAO, type Jornada, etapasDaJornada } from "./jornada";
import type { Midia } from "./anexos";

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
  tom: "primary" | "amber" | "sky" | "emerald" | "zinc";
}

export const PASSOS_DEF: readonly PassoDef[] = [
  { chave: "mensagem",           rotulo: "Enviar mensagem",  descricao: "vai para a fila e sai pelo número da automação", icone: "Send",       tom: "primary" },
  { chave: "esperar",            rotulo: "Esperar",          descricao: "segura o fluxo antes do próximo passo",          icone: "Timer",      tom: "amber" },
  { chave: "parar_se_respondeu", rotulo: "Parar se respondeu", descricao: "quem respondeu não recebe o resto",            icone: "Split",      tom: "sky" },
  { chave: "mover_etapa",        rotulo: "Mover de etapa",   descricao: "empurra o lead na jornada",                      icone: "Milestone",  tom: "emerald" },
  { chave: "tarefa",             rotulo: "Criar tarefa",     descricao: "abre um lembrete para alguém da equipe",         icone: "ListTodo",   tom: "zinc" },
];

export function defDoPasso(t: TipoDePasso): PassoDef {
  return PASSOS_DEF.find((p) => p.chave === t) ?? PASSOS_DEF[0];
}

export function tipoDePassoValido(x: unknown): x is TipoDePasso {
  return typeof x === "string" && (TIPOS_DE_PASSO as readonly string[]).includes(x);
}

export interface Passo {
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
}

/* ══════════════════ a automação inteira ═══════════════════════════════════ */

export interface Condicoes {
  /** só dispara dentro da grade de atendimento do número */
  so_horario_comercial: boolean;
  /** quantos leads por dia, no máximo. Trava contra a planilha que ganha 600 linhas de uma vez. */
  teto_dia: number;
}

export const CONDICOES_PADRAO: Condicoes = { so_horario_comercial: true, teto_dia: 50 };

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

/** Teto de passos. Não é limite técnico: é o ponto em que a fila deixa de caber na tela e de caber na cabeça. */
export const MAX_PASSOS = 12;
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
export function impedimentos(a: Pick<Automacao, "nome" | "gatilho" | "gatilho_config" | "passos" | "condicoes">): string[] {
  const erros: string[] = [];

  if (!a.nome.trim()) erros.push("Dê um nome à automação.");
  if (a.passos.length === 0) erros.push("Uma automação sem passos não faz nada.");
  if (a.passos.length > MAX_PASSOS) erros.push(`No máximo ${MAX_PASSOS} passos.`);

  const def = defDoGatilho(a.gatilho);
  if (def.campo === "bases" && !a.gatilho_config.bases_todas && (a.gatilho_config.fonte_ids ?? []).length === 0) {
    erros.push("Escolha em qual base este fluxo escuta.");
  }
  if (def.campo === "dias") {
    const d = Number(a.gatilho_config.dias ?? 0);
    if (!Number.isFinite(d) || d < 1 || d > 365) erros.push("O silêncio do gatilho precisa ser entre 1 e 365 dias.");
  }

  a.passos.forEach((p, i) => {
    const n = i + 1;
    if (p.tipo === "mensagem") {
      const temTexto = !!(p.texto || "").trim();
      const temMidia = (p.midias ?? []).length > 0;
      if (!temTexto && !temMidia) erros.push(`O passo ${n} é uma mensagem vazia.`);
    }
    if (p.tipo === "esperar") {
      const m = Number(p.minutos ?? 0);
      if (!Number.isFinite(m) || m < 1) erros.push(`O passo ${n} precisa de uma espera de pelo menos 1 minuto.`);
      else if (m > MAX_ESPERA) erros.push(`O passo ${n} espera mais de 30 dias.`);
    }
    if (p.tipo === "mover_etapa" && !(p.etapa || "").trim()) erros.push(`O passo ${n} não diz para qual etapa mover.`);
    if (p.tipo === "tarefa" && !(p.titulo || "").trim()) erros.push(`O passo ${n} é uma tarefa sem título.`);
  });

  /* PARAR SE RESPONDEU NO PRIMEIRO PASSO NÃO PARA NADA. Ele compara com o
     momento em que a automação começou; no passo 1 esse momento é agora, e a
     resposta que ele procura ainda não teve tempo de existir. */
  if (a.passos[0]?.tipo === "parar_se_respondeu") {
    erros.push("“Parar se respondeu” só faz sentido depois de uma espera.");
  }

  const t = Number(a.condicoes.teto_dia ?? 0);
  if (!Number.isFinite(t) || t < 1 || t > 1000) erros.push("O teto por dia precisa ser entre 1 e 1000.");

  return erros;
}

export function podeLigar(a: Pick<Automacao, "nome" | "gatilho" | "gatilho_config" | "passos" | "condicoes">): boolean {
  return impedimentos(a).length === 0;
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
