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

import { canonicalizarTelefone } from "./phone";

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

/**
 * "01/09/2026 10:58:39" ou "01/09/2026" → ISO. Null quando não dá pra ler.
 *
 * Dia/mês/ano é o formato que a planilha escreve, e `new Date(texto)` leria
 * "01/09" como 1º de setembro nos EUA e como 9 de janeiro aqui — no mesmo mês
 * as duas leituras dão datas plausíveis, que é o pior tipo de ambiguidade:
 * ninguém percebe que está errada.
 */
export function dataDaPlanilha(texto: string): string | null {
  const t = String(texto || "").trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, d, mes, ano, h, min, seg] = m;
  const data = new Date(
    Number(ano), Number(mes) - 1, Number(d),
    Number(h ?? 0), Number(min ?? 0), Number(seg ?? 0),
  );
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
