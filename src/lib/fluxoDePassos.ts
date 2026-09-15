/* A ÁRVORE DE PASSOS, E COMO ANDAR NELA.
 *
 * Um fluxo era uma fila: passo atrás de passo. Continua sendo, com uma
 * exceção: o passo "Se" tem dois lados (`entao` e `senao`), e cada lado é uma
 * fila própria. Um nível só: não existe "Se" dentro de "Se". Isso é de
 * propósito, porque o caso que pediu o ramo ("se o lead já nos escreveu, manda
 * outra mensagem") se resolve com um nível, e cada nível a mais é uma tela que
 * deixa de caber no celular.
 *
 * Este arquivo é lido de DOIS lugares: a tela (para inserir, remover e numerar)
 * e o executor no Deno (para achatar o fluxo na ordem em que ele vai rodar).
 * Está aqui por link simbólico dentro de `supabase/functions/wa-automacoes/`,
 * mesmo arranjo do `planilhaLeads.ts` da leads-sync. Por isso ele não importa
 * nada e não sabe o que é um passo além de `id`, `tipo` e os dois lados.
 *
 * ──────────────────────── como o executor anda na árvore ────────────────────
 *
 * O executor guarda a posição como UM número (`passo`), e a espera de dois
 * dias devolve a execução à fila para ser retomada nesse número. Uma árvore
 * não tem "posição N". A saída é ACHATAR: a lista que roda é a fila principal
 * com cada "Se" seguido dos passos do lado que ele escolheu. O "Se" fica na
 * lista como marcador (custa nada depois de decidido), e o lado escolhido fica
 * gravado na execução (`decisoes`). Assim, retomar dois dias depois achata de
 * novo com as mesmas decisões e cai na mesma lista, no mesmo número.
 *
 * Só funciona porque a decisão é tomada ANTES de avançar: tudo antes do "Se"
 * já estava na lista, e o que ele acrescenta entra depois dele. Índice
 * anterior nunca muda.
 */

export type Ramo = "entao" | "senao";

/** O mínimo que um passo precisa ter para esta lógica andar nele. */
export interface PassoComRamos {
  id: string;
  tipo: string;
  entao?: PassoComRamos[];
  senao?: PassoComRamos[];
}

/** Qual lado cada "Se" escolheu, por id do passo. Gravado na execução. */
export type Decisoes = Record<string, Ramo>;

export const RAMOS: readonly Ramo[] = ["entao", "senao"];

export function eCondicao(p: PassoComRamos | null | undefined): boolean {
  return !!p && p.tipo === "se";
}

function lados<P extends PassoComRamos>(p: P): { ramo: Ramo; lista: P[] }[] {
  if (!eCondicao(p)) return [];
  return RAMOS.map((ramo) => ({ ramo, lista: (p[ramo] ?? []) as P[] }));
}

/** Todos os passos, na ordem de leitura: cada "Se" seguido do lado sim e do lado não. */
export function todosOsPassos<P extends PassoComRamos>(passos: P[]): P[] {
  const saida: P[] = [];
  for (const p of passos) {
    saida.push(p);
    for (const { lista } of lados(p)) saida.push(...todosOsPassos(lista));
  }
  return saida;
}

export function contarPassos<P extends PassoComRamos>(passos: P[]): number {
  return todosOsPassos(passos).length;
}

export function encontrarPasso<P extends PassoComRamos>(passos: P[], id: string): P | null {
  return todosOsPassos(passos).find((p) => p.id === id) ?? null;
}

/** Onde um passo mora: na fila principal, ou dentro de um lado de um "Se". */
export interface Posicao<P extends PassoComRamos> {
  pai: P | null;
  ramo: Ramo | null;
  /** índice dentro da fila em que ele está (principal ou do lado) */
  indice: number;
  /** índice do pai na fila principal, quando há pai */
  indiceDoPai: number | null;
}

export function posicaoDoPasso<P extends PassoComRamos>(passos: P[], id: string): Posicao<P> | null {
  for (let i = 0; i < passos.length; i += 1) {
    const p = passos[i];
    if (p.id === id) return { pai: null, ramo: null, indice: i, indiceDoPai: null };
    for (const { ramo, lista } of lados(p)) {
      const j = lista.findIndex((x) => x.id === id);
      if (j >= 0) return { pai: p, ramo, indice: j, indiceDoPai: i };
    }
  }
  return null;
}

/**
 * "Passo 3", ou "Passo 2 · sim 1" quando está dentro de um lado.
 *
 * A numeração de dentro reinicia em cada lado: "Passo 2 · sim 1" diz onde a
 * pessoa está sem ela precisar contar caixinhas na tela.
 */
export function rotuloDaPosicao<P extends PassoComRamos>(passos: P[], id: string): string {
  const pos = posicaoDoPasso(passos, id);
  if (!pos) return "Passo";
  if (pos.pai === null || pos.indiceDoPai === null) return `Passo ${pos.indice + 1}`;
  return `Passo ${pos.indiceDoPai + 1} · ${pos.ramo === "entao" ? "sim" : "não"} ${pos.indice + 1}`;
}

/* ══════════════════ edição (sempre devolve lista nova) ═════════════════════ */

export function atualizarPasso<P extends PassoComRamos>(passos: P[], id: string, mudanca: Partial<P>): P[] {
  return passos.map((p) => {
    if (p.id === id) return { ...p, ...mudanca };
    if (!eCondicao(p)) return p;
    const novo: P = { ...p };
    for (const { ramo, lista } of lados(p)) {
      (novo as PassoComRamos)[ramo] = atualizarPasso(lista, id, mudanca);
    }
    return novo;
  });
}

export function removerPasso<P extends PassoComRamos>(passos: P[], id: string): P[] {
  return passos
    .filter((p) => p.id !== id)
    .map((p) => {
      if (!eCondicao(p)) return p;
      const novo: P = { ...p };
      for (const { ramo, lista } of lados(p)) {
        (novo as PassoComRamos)[ramo] = removerPasso(lista, id);
      }
      return novo;
    });
}

export interface OndeInserir {
  indice: number;
  /** dentro de um lado de um "Se"; ausente = fila principal */
  dentroDe?: { id: string; ramo: Ramo } | null;
}

/**
 * Insere um passo. Dentro de um lado, recusa outro "Se": um nível só.
 * Se o pai não existe, devolve a lista como estava, e não uma cópia com o
 * passo perdido em lugar nenhum.
 */
export function inserirPasso<P extends PassoComRamos>(passos: P[], novo: P, onde: OndeInserir): P[] {
  if (!onde.dentroDe) {
    const i = Math.max(0, Math.min(onde.indice, passos.length));
    return [...passos.slice(0, i), novo, ...passos.slice(i)];
  }
  if (eCondicao(novo)) return passos;
  const { id, ramo } = onde.dentroDe;
  let achou = false;
  const saida = passos.map((p) => {
    if (p.id !== id || !eCondicao(p)) return p;
    achou = true;
    const lista = (p[ramo] ?? []) as P[];
    const i = Math.max(0, Math.min(onde.indice, lista.length));
    return { ...p, [ramo]: [...lista.slice(0, i), novo, ...lista.slice(i)] } as P;
  });
  return achou ? saida : passos;
}

/* ══════════════════ execução ══════════════════════════════════════════════ */

/**
 * A lista que roda, dadas as decisões já tomadas.
 *
 * Cada "Se" entra como marcador; se já foi decidido, os passos do lado
 * escolhido vêm logo atrás. Um "Se" ainda não decidido não traz nada: o
 * executor decide ao chegar nele, grava, e achata de novo.
 */
export function achatar<P extends PassoComRamos>(passos: P[], decisoes: Decisoes | null | undefined): P[] {
  const d = decisoes ?? {};
  const saida: P[] = [];
  for (const p of passos) {
    saida.push(p);
    if (!eCondicao(p)) continue;
    const ramo = d[p.id];
    if (ramo === "entao" || ramo === "senao") {
      // Sem recursão de propósito: um lado não tem "Se" dentro. Se um dia tiver,
      // ele vira marcador sem lado, e o fluxo segue em frente sem quebrar.
      saida.push(...((p[ramo] ?? []) as P[]));
    }
  }
  return saida;
}

/* ══════════════════ variáveis no texto ════════════════════════════════════ */

/**
 * O que está entre chaves num texto: `{nome}`, `{Funcionários}`.
 *
 * Só chaves simples, sem chave dentro de chave, e sem repetir. É o que a tela
 * usa para dizer "este fluxo usa {X}, que não existe na base" antes de a
 * mensagem sair com o buraco para um lead de verdade.
 */
export function variaveisDoTexto(texto: string | null | undefined): string[] {
  const vistas = new Set<string>();
  const re = /\{([^{}\n]{1,80})\}/g;
  let m: RegExpExecArray | null;
  const t = String(texto ?? "");
  while ((m = re.exec(t)) !== null) {
    const chave = m[1].trim();
    if (chave) vistas.add(chave);
  }
  return [...vistas];
}
