// LER A PLANILHA DA LANDING PAGE.
//
// A planilha é escrita por um formulário, e formulário muda: alguém acrescenta
// uma pergunta, renomeia "Telefone" pra "WhatsApp com DDD", troca a ordem das
// colunas. Se o leitor for por POSIÇÃO ("a terceira coluna é o telefone"), o dia
// em que alguém inserir uma coluna no meio a fila inteira passa a discar o
// número errado — e não dá erro: dá mensagem pra estranho.
//
// Por isso tudo aqui é por NOME de coluna, com sinônimos, e sem diferenciar
// acento nem maiúscula. Coluna que eu não conheço não é descartada: vai inteira
// pro `bruto`, porque o que eu não soube ler hoje é exatamente o que alguém vai
// precisar amanhã.
//
// E o telefone passa pelo mesmo canonicalizador do resto do sistema (55 + DDD +
// 9 dígitos). É isso que faz a mesma pessoa, vinda da planilha e vinda do
// WhatsApp, ser uma pessoa só.

// A extensão explícita é para o Deno: este arquivo é lido também pela edge
// function `leads-sync`, por link simbólico, e lá import sem extensão não
// resolve. O Vite aceita os dois (allowImportingTsExtensions no tsconfig).
import { canonicalizarTelefone } from "./phone.ts";

/**
 * O id da planilha, a partir do link inteiro.
 *
 * O link inteiro serve como entrada porque ninguém decora que o id é o pedaço
 * entre /d/ e /edit, e pedir "cole o id" é pedir que a pessoa faça à mão o
 * recorte que o código faz sem errar. O que já for um id passa intacto.
 *
 * Mora aqui, e não na tela, porque duas telas ligam planilha agora: a caixa
 * Base e a aba Automações.
 */
export function idDaPlanilha(linkOuId: string): string {
  const t = String(linkOuId || "").trim();
  const m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : t;
}

/** minúsculo, sem acento, sem pontuação — pra comparar nome de coluna. */
export function chaveDeColuna(texto: string): string {
  return String(texto || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Sinônimos por campo, na ordem de preferência. */
const SINONIMOS: Record<string, string[]> = {
  nome:      ["nome", "nome completo", "cliente", "lead"],
  telefone:  ["telefone", "whatsapp", "whatsapp com ddd", "telefone whatsapp", "celular", "fone", "contato"],
  cidade:    ["cidade", "municipio", "cidade uf", "localidade"],
  respostas: ["respostas", "resposta", "questionario", "detalhes", "observacoes"],
  origem:    ["origem", "funil", "campanha", "fonte"],
  chegouEm:  ["data hora", "data e hora", "carimbo de data hora", "data", "timestamp", "criado em"],
};

/**
 * Onde está cada campo. -1 quando a coluna não existe.
 *
 * A busca é em duas passadas: primeiro o nome exato, depois "começa com". A
 * ordem importa — com "contém" logo de cara, "Telefone" acharia a coluna
 * "Telefone do responsável" antes da coluna "Telefone", dependendo da ordem
 * em que elas aparecem na planilha.
 */
export function mapearColunas(cabecalho: string[]): Record<string, number> {
  const chaves = cabecalho.map(chaveDeColuna);
  const mapa: Record<string, number> = {};
  for (const [campo, nomes] of Object.entries(SINONIMOS)) {
    let achou = -1;
    for (const n of nomes) {
      const i = chaves.indexOf(n);
      if (i >= 0) { achou = i; break; }
    }
    if (achou < 0) {
      for (const n of nomes) {
        const i = chaves.findIndex((c) => c.startsWith(n));
        if (i >= 0) { achou = i; break; }
      }
    }
    mapa[campo] = achou;
  }
  return mapa;
}

/** O fuso do escritório. A planilha escreve a hora do relógio daqui. */
export const FUSO_DO_ESCRITORIO = "America/Manaus";

/**
 * Quantos minutos um fuso está à frente do UTC naquele instante.
 *
 * Via `Intl`, que existe igual no navegador e no Deno, em vez de um número
 * fixo: Manaus não tem horário de verão hoje, mas já teve, e um `-4` cravado no
 * código é a linha que ninguém encontra no dia em que ele volta.
 */
function deslocamentoDoFuso(zona: string, quando: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: zona, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(quando);
  const n = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  // `hour` pode vir "24" à meia-noite em alguns motores; o módulo resolve.
  const naZona = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour") % 24, n("minute"), n("second"));
  return Math.round((naZona - quando.getTime()) / 60_000);
}

/**
 * "01/09/2026 10:58:39" ou "01/09/2026" → ISO. Null quando não dá pra ler.
 *
 * Dia/mês/ano é o formato que a planilha escreve, e `new Date(texto)` leria
 * "01/09" como 1º de setembro nos EUA e como 9 de janeiro aqui — no mesmo mês
 * as duas leituras dão datas plausíveis, que é o pior tipo de ambiguidade:
 * ninguém percebe que está errada.
 *
 * ─────────────────── e o fuso, que custou um bug de quatro horas ────────────
 *
 * A versão anterior montava a data com `new Date(ano, mes, dia, hora)`, que
 * usa o fuso DE QUEM ESTÁ RODANDO. No navegador isso era Manaus e dava certo
 * por acaso. Quando a leitura virou edge function, ela passou a rodar em UTC:
 * o "22:40" que a pessoa preencheu no formulário virou 22:40 UTC, que é 18:40
 * em Manaus. Todo lead passou a chegar quatro horas no passado.
 *
 * Isso não ficou só no campo: quebrou a trava do aviso de lead novo (o lead
 * "chegava" antes de o aviso ser ligado e era descartado), a contagem de "esta
 * semana" e o filtro por data.
 *
 * O relógio da planilha é o relógio do escritório. Dizer isso explicitamente é
 * a única forma de a função dar a MESMA resposta nos dois lugares em que ela
 * roda — que é a razão de ela ser um arquivo só, lido por link simbólico.
 */
export function dataDaPlanilha(texto: string, zona = FUSO_DO_ESCRITORIO): string | null {
  const t = String(texto || "").trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, d, mes, ano, h, min, seg] = m;

  /* Monta a hora do relógio como se fosse UTC e desconta o deslocamento do
     fuso. Duas passadas porque o deslocamento depende do instante, e o
     instante é o que estamos calculando: a primeira chuta, a segunda acerta
     em cima do chute. Sem horário de verão as duas dão igual; com ele, é a
     segunda que salva a hora da virada. */
  const relogio = Date.UTC(
    Number(ano), Number(mes) - 1, Number(d),
    Number(h ?? 0), Number(min ?? 0), Number(seg ?? 0),
  );
  if (Number.isNaN(relogio)) return null;

  let instante = relogio - deslocamentoDoFuso(zona, new Date(relogio)) * 60_000;
  instante = relogio - deslocamentoDoFuso(zona, new Date(instante)) * 60_000;

  const data = new Date(instante);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

export interface LeadDaPlanilha {
  linha: number;
  telefone: string;
  nome: string | null;
  cidade: string | null;
  respostas: string | null;
  origemTexto: string | null;
  chegouEm: string | null;
  /** a linha inteira, coluna por coluna — inclusive o que eu não soube ler */
  bruto: Record<string, string>;
}

/**
 * Uma linha da planilha vira um lead. Null quando o telefone não presta.
 *
 * Sem telefone canônico não há o que fazer com a linha: o único gesto que essa
 * tela oferece é mandar mensagem. Devolver o lead assim mesmo encheria a fila
 * de cartões que dão erro no clique.
 */
export function leadDaLinha(
  cabecalho: string[],
  mapa: Record<string, number>,
  linha: number,
  celulas: string[],
): LeadDaPlanilha | null {
  const pega = (campo: string): string => {
    const i = mapa[campo];
    return i >= 0 ? String(celulas[i] ?? "").trim() : "";
  };

  const telefone = canonicalizarTelefone(pega("telefone"));
  if (telefone.length !== 13) return null;

  const bruto: Record<string, string> = {};
  cabecalho.forEach((col, i) => {
    const v = String(celulas[i] ?? "").trim();
    if (col && v) bruto[col] = v;
  });

  const naoVazio = (s: string) => (s.length > 0 ? s : null);
  return {
    linha,
    telefone,
    nome: naoVazio(pega("nome")),
    cidade: naoVazio(pega("cidade")),
    respostas: naoVazio(pega("respostas")),
    origemTexto: naoVazio(pega("origem")),
    chegouEm: dataDaPlanilha(pega("chegouEm")),
    bruto,
  };
}

/**
 * A planilha inteira.
 *
 * Duplicata dentro do próprio arquivo é normal — a pessoa preenche o formulário
 * duas vezes e vira duas linhas. Aqui vale a MAIS RECENTE: as respostas dela
 * são as que descrevem a situação de hoje.
 */
export function lerPlanilha(
  cabecalho: string[],
  linhas: { linha: number; celulas: string[] }[],
): { leads: LeadDaPlanilha[]; ignoradas: number } {
  const mapa = mapearColunas(cabecalho);
  const porTelefone = new Map<string, LeadDaPlanilha>();
  let ignoradas = 0;

  for (const l of linhas) {
    const lead = leadDaLinha(cabecalho, mapa, l.linha, l.celulas);
    if (!lead) { if (l.celulas.some((c) => String(c).trim())) ignoradas++; continue; }
    const anterior = porTelefone.get(lead.telefone);
    if (!anterior || (lead.chegouEm ?? "") >= (anterior.chegouEm ?? "")) {
      porTelefone.set(lead.telefone, lead);
    }
  }
  return { leads: [...porTelefone.values()], ignoradas };
}

/** Resumo curto das respostas, pro cartão da fila. */
export function resumoDasRespostas(respostas: string | null, limite = 90): string {
  const t = String(respostas || "").replace(/\s*[|·]\s*/g, " · ").replace(/\s+/g, " ").trim();
  if (t.length <= limite) return t;
  return t.slice(0, limite - 1).trimEnd() + "…";
}

/* ── O QUE A PLANILHA TROUXE ALÉM DO CONTATO ──────────────────────────────
   Cada landing pergunta o que quer. A do Bradesco pergunta DESCONTOS, TEMPO DE
   CONTA, USO DA CONTA, APP BRADESCO e SCORE; a de descontos bancários junta
   tudo numa coluna "Respostas". Não dá pra escolher um formato e exigir que as
   outras se encaixem — e não precisa: as colunas que eu não sei nomear já vêm
   inteiras no `bruto`, e é justamente esse conteúdo que decide como abrir a
   conversa. Aqui elas viram pares rótulo/valor, sem as que a ficha já mostra
   em cima (nome, telefone, data, origem). */

const JA_MOSTRADO = [
  "nome", "nome completo", "cliente", "lead",
  "telefone", "whatsapp", "whatsapp com ddd", "telefone whatsapp", "celular", "fone", "contato",
  "data hora", "data e hora", "carimbo de data hora", "data", "hora", "timestamp", "criado em",
  "origem", "funil", "campanha", "fonte",
  "cidade", "municipio", "cidade uf", "localidade",
  "respostas",
];

export interface CampoExtra { rotulo: string; valor: string }

/**
 * Os campos que o cartão do lead mostra.
 *
 * Com `escolhidas`, valem só essas e NA ORDEM DELAS — a ordem é a única coisa
 * que a escolha carrega além do sim/não, e reordenar alfabeticamente jogaria
 * fora o que a pessoa quer ler primeiro. Sem escolha, mostra tudo que sobrou
 * depois do que a ficha já exibe em cima (nome, telefone, data, origem).
 */
export function dossieExtra(
  bruto: Record<string, string> | null | undefined,
  escolhidas?: string[] | null,
): CampoExtra[] {
  const dados = bruto ?? {};

  if (escolhidas && escolhidas.length > 0) {
    const saida: CampoExtra[] = [];
    for (const rotulo of escolhidas) {
      // A comparação é pela chave normalizada: a planilha pode ganhar um acento
      // ou virar caixa alta sem que a escolha de ontem pare de valer.
      const achado = Object.keys(dados).find((k) => chaveDeColuna(k) === chaveDeColuna(rotulo));
      const v = achado ? String(dados[achado] ?? "").trim() : "";
      if (v) saida.push({ rotulo: achado ?? rotulo, valor: v });
    }
    return saida;
  }

  const saida: CampoExtra[] = [];
  for (const [rotulo, valor] of Object.entries(dados)) {
    const v = String(valor ?? "").trim();
    if (!v) continue;
    if (JA_MOSTRADO.includes(chaveDeColuna(rotulo))) continue;
    saida.push({ rotulo, valor: v });
  }
  return saida;
}

/** As colunas que faz sentido oferecer pra escolha (as que a ficha já não mostra). */
export function colunasEscolhiveis(cabecalho: string[]): string[] {
  return cabecalho
    .map((c) => String(c ?? "").trim())
    .filter((c) => c.length > 0 && !JA_MOSTRADO.includes(chaveDeColuna(c)));
}

/** A linha de baixo do cartão da fila: os dois primeiros campos que importam. */
export function resumoDoDossie(
  bruto: Record<string, string> | null | undefined,
  limite = 44,
  escolhidas?: string[] | null,
): string {
  const campos = dossieExtra(bruto, escolhidas);
  if (campos.length === 0) return "";
  const t = campos.slice(0, 2).map((c) => `${c.rotulo}: ${c.valor}`).join(" · ");
  return t.length <= limite ? t : t.slice(0, limite - 1).trimEnd() + "…";
}
