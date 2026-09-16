/* A ÁRVORE DE PASSOS, E COMO ANDAR NELA.
 *
 * Um fluxo era uma fila: passo atrás de passo. Continua sendo, com duas
 * exceções, e as duas abrem RAMOS:
 *
 *   - "Se" tem dois lados, `entao` e `senao`.
 *   - "Escolha" tem N casos (`casos`) mais o lado de quem não casou com
 *     nenhum, que também se chama `senao`.
 *
 * São a mesma ideia com aridade diferente, e por isso este arquivo não fala
 * mais em "lado sim" e "lado não": fala em RAMO, identificado por uma chave.
 * Para o "Se" a chave é "entao" ou "senao"; para a "Escolha" é o id do caso, ou
 * "senao". Isso é o que deixa `decisoes` continuar sendo um mapa de id do passo
 * para uma string, do jeito que já está gravado no banco: as execuções antigas
 * guardam "entao"/"senao" e continuam válidas sem conversão nenhuma.
 *
 * Este arquivo é lido de DOIS lugares: a tela (para inserir, remover e numerar)
 * e o executor no Deno (para achatar o fluxo na ordem em que ele vai rodar).
 * Está aqui por link simbólico dentro de `supabase/functions/wa-automacoes/`,
 * mesmo arranjo do `planilhaLeads.ts` da leads-sync. Por isso ele não importa
 * nada e não sabe o que é um passo além de `id`, `tipo` e os ramos.
 *
 * ──────────────────────── como o executor anda na árvore ────────────────────
 *
 * O executor guarda a posição como UM número (`passo`), e a espera de dois
 * dias devolve a execução à fila para ser retomada nesse número. Uma árvore
 * não tem "posição N". A saída é ACHATAR: a lista que roda é a fila principal
 * com cada passo de ramo seguido dos passos do ramo que ele escolheu. O passo
 * de ramo fica na lista como marcador (custa nada depois de decidido), e o ramo
 * escolhido fica gravado na execução (`decisoes`). Assim, retomar dois dias
 * depois achata de novo com as mesmas decisões e cai na mesma lista, no mesmo
 * número.
 *
 * Só funciona porque a decisão é tomada ANTES de avançar: tudo antes do passo
 * de ramo já estava na lista, e o que ele acrescenta entra depois dele. Índice
 * anterior nunca muda.
 *
 * ────────────────────────── até onde a árvore desce ─────────────────────────
 *
 * Dois níveis, e o segundo é só a "Escolha". "Se" dentro de "Se" não existe, e
 * "Escolha" dentro de "Escolha" também não. O limite é de leitura, não técnico:
 * a tela é uma coluna num celular, e o terceiro nível deixa de caber tanto nela
 * quanto na cabeça de quem vai conferir o fluxo antes de ligar.
 */

/** A chave de um ramo: "entao"/"senao" no Se, ou o id do caso na Escolha. */
export type Ramo = string;

/** Os dois ramos fixos do "Se". "senao" também é o ramo final da "Escolha". */
export const RAMO_ENTAO = "entao";
export const RAMO_SENAO = "senao";

/** Um caso da "Escolha": a pergunta mora no passo, aqui fica a fila do caso. */
export interface CasoComPassos {
  id: string;
  passos?: PassoComRamos[];
}

/** O mínimo que um passo precisa ter para esta lógica andar nele. */
export interface PassoComRamos {
  id: string;
  tipo: string;
  entao?: PassoComRamos[];
  senao?: PassoComRamos[];
  casos?: CasoComPassos[];
}

/** Qual ramo cada passo de bifurcação escolheu, por id do passo. Gravado na execução. */
export type Decisoes = Record<string, Ramo>;

/** O "Se": dois lados fixos. */
export function eCondicao(p: PassoComRamos | null | undefined): boolean {
  return !!p && p.tipo === "se";
}

/** A "Escolha": N casos mais o lado de ninguém. */
export function eEscolha(p: PassoComRamos | null | undefined): boolean {
  return !!p && p.tipo === "escolha";
}

/** Abre ramos, seja de que tipo for. É o que o resto do arquivo pergunta. */
export function temRamos(p: PassoComRamos | null | undefined): boolean {
  return eCondicao(p) || eEscolha(p);
}

/**
 * Os ramos de um passo, na ordem em que a tela os desenha.
 *
 * Na "Escolha" o "senao" vem por último de propósito: ele é o fundo do funil,
 * e quem lê o fluxo espera encontrá-lo depois dos casos, não antes.
 */
export function ramosDoPasso<P extends PassoComRamos>(p: P): { chave: Ramo; lista: P[] }[] {
  if (eCondicao(p)) {
    return [
      { chave: RAMO_ENTAO, lista: (p.entao ?? []) as P[] },
      { chave: RAMO_SENAO, lista: (p.senao ?? []) as P[] },
    ];
  }
  if (eEscolha(p)) {
    return [
      ...(p.casos ?? []).map((c) => ({ chave: c.id, lista: (c.passos ?? []) as P[] })),
      { chave: RAMO_SENAO, lista: (p.senao ?? []) as P[] },
    ];
  }
  return [];
}

/** A fila de um ramo, ou null quando essa chave não existe neste passo. */
export function listaDoRamo<P extends PassoComRamos>(p: P, chave: Ramo): P[] | null {
  return ramosDoPasso(p).find((r) => r.chave === chave)?.lista ?? null;
}

/** Devolve o passo com a fila de um ramo trocada. Não mexe no original. */
function comRamo<P extends PassoComRamos>(p: P, chave: Ramo, lista: P[]): P {
  if (eCondicao(p) && (chave === RAMO_ENTAO || chave === RAMO_SENAO)) {
    return { ...p, [chave]: lista };
  }
  if (eEscolha(p)) {
    if (chave === RAMO_SENAO) return { ...p, senao: lista };
    return {
      ...p,
      casos: (p.casos ?? []).map((c) => (c.id === chave ? { ...c, passos: lista } : c)),
    };
  }
  return p;
}

/** Aplica uma transformação a TODAS as filas de ramo de um passo. */
function mapearRamos<P extends PassoComRamos>(p: P, f: (lista: P[]) => P[]): P {
  if (!temRamos(p)) return p;
  let saida = p;
  for (const { chave, lista } of ramosDoPasso(p)) saida = comRamo(saida, chave, f(lista));
  return saida;
}

/** Todos os passos, na ordem de leitura: cada bifurcação seguida dos seus ramos. */
export function todosOsPassos<P extends PassoComRamos>(passos: P[]): P[] {
  const saida: P[] = [];
  for (const p of passos) {
    saida.push(p);
    for (const { lista } of ramosDoPasso(p)) saida.push(...todosOsPassos(lista));
  }
  return saida;
}

export function contarPassos<P extends PassoComRamos>(passos: P[]): number {
  return todosOsPassos(passos).length;
}

export function encontrarPasso<P extends PassoComRamos>(passos: P[], id: string): P | null {
  return todosOsPassos(passos).find((p) => p.id === id) ?? null;
}

/** Onde um passo mora: na fila principal, ou dentro de um ramo de uma bifurcação. */
export interface Posicao<P extends PassoComRamos> {
  pai: P | null;
  ramo: Ramo | null;
  /** índice dentro da fila em que ele está (principal ou do ramo) */
  indice: number;
  /** índice do pai na fila principal, quando há pai */
  indiceDoPai: number | null;
}

/**
 * O caminho da raiz até o passo, um degrau por nível.
 *
 * DESCE RECURSIVO porque a árvore tem dois níveis desde que a "Escolha" passou
 * a caber dentro do "Se". A versão que olhava só um nível devolvia null para
 * quem morava num caso, e quem depende disso é o rótulo que a validação usa
 * para dizer QUAL cartão está quebrado: o erro saía apontando para "Passo",
 * sem número, que é o mesmo que não apontar.
 */
export function caminhoDoPasso<P extends PassoComRamos>(passos: P[], id: string): Posicao<P>[] | null {
  for (let i = 0; i < passos.length; i += 1) {
    const p = passos[i];
    if (p.id === id) return [{ pai: null, ramo: null, indice: i, indiceDoPai: null }];
    for (const { chave, lista } of ramosDoPasso(p)) {
      const dentro = caminhoDoPasso(lista, id);
      if (!dentro) continue;
      const primeiro = dentro[0];
      /* Onde, dentro DESTE ramo, começa o caminho que segue. Se o alvo estava
         solto no ramo é o índice dele; se estava mais fundo, é o índice do
         container que o guarda. */
      const indiceNoRamo = primeiro.pai === null ? primeiro.indice : (primeiro.indiceDoPai ?? 0);
      const degrau: Posicao<P> = { pai: p, ramo: chave, indice: indiceNoRamo, indiceDoPai: i };
      return primeiro.pai === null ? [degrau] : [degrau, ...dentro];
    }
  }
  return null;
}

/** Onde o passo mora, do ponto de vista de quem o contém diretamente. */
export function posicaoDoPasso<P extends PassoComRamos>(passos: P[], id: string): Posicao<P> | null {
  const caminho = caminhoDoPasso(passos, id);
  return caminho ? caminho[caminho.length - 1] : null;
}

/**
 * Como um ramo se chama na tela: "sim", "não", ou o número do caso.
 *
 * `rotuloDoCaso` vem de fora porque o texto do caso ("quando Situação contém
 * processo") é gramática da automação, e este arquivo não conhece gramática
 * nenhuma. Sem ele, o caso vira "caso 2", que já situa.
 */
export function nomeDoRamo<P extends PassoComRamos>(pai: P, chave: Ramo): string {
  if (eCondicao(pai)) return chave === RAMO_ENTAO ? "sim" : "não";
  if (chave === RAMO_SENAO) return "os demais";
  const i = (pai.casos ?? []).findIndex((c) => c.id === chave);
  return i >= 0 ? `caso ${i + 1}` : "caso";
}

/**
 * "Passo 3", ou "Passo 2 · sim 1" quando está dentro de um ramo.
 *
 * A numeração de dentro reinicia em cada ramo: "Passo 2 · sim 1" diz onde a
 * pessoa está sem ela precisar contar caixinhas na tela.
 */
export function rotuloDaPosicao<P extends PassoComRamos>(passos: P[], id: string): string {
  const caminho = caminhoDoPasso(passos, id);
  if (!caminho || caminho.length === 0) return "Passo";
  const raiz = caminho[0];
  if (raiz.pai === null || raiz.indiceDoPai === null || raiz.ramo === null) return `Passo ${raiz.indice + 1}`;
  /* Um degrau por nível, da fila principal para dentro: "Passo 1 · sim 1 ·
     caso 2 1". É coordenada, não frase: serve para achar o cartão na tela, e
     a tela desenha a mesma trilha em cima dele. */
  const trilha = caminho.map((d) => `${nomeDoRamo(d.pai as P, d.ramo as Ramo)} ${d.indice + 1}`);
  return `Passo ${raiz.indiceDoPai + 1} · ${trilha.join(" · ")}`;
}

/* ══════════════════ edição (sempre devolve lista nova) ═════════════════════ */

export function atualizarPasso<P extends PassoComRamos>(passos: P[], id: string, mudanca: Partial<P>): P[] {
  return passos.map((p) => {
    if (p.id === id) return { ...p, ...mudanca };
    return mapearRamos(p, (lista) => atualizarPasso(lista, id, mudanca));
  });
}

export function removerPasso<P extends PassoComRamos>(passos: P[], id: string): P[] {
  return passos
    .filter((p) => p.id !== id)
    .map((p) => mapearRamos(p, (lista) => removerPasso(lista, id)));
}

export interface OndeInserir {
  indice: number;
  /** dentro de um ramo de uma bifurcação; ausente = fila principal */
  dentroDe?: { id: string; ramo: Ramo } | null;
}

/**
 * Insere um passo.
 *
 * Dentro de um ramo, recusa o que faria a árvore passar de dois níveis: outro
 * "Se" em qualquer ramo, e uma "Escolha" dentro de uma "Escolha". "Escolha"
 * dentro de um lado do "Se" é justamente o caso que existe para ser possível,
 * e por isso passa.
 *
 * Se o pai não existe, devolve a lista como estava, e não uma cópia com o passo
 * perdido em lugar nenhum.
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
    if (p.id !== id || !temRamos(p)) return p;
    if (eEscolha(novo) && !eCondicao(p)) return p;
    const lista = listaDoRamo(p, ramo);
    if (lista === null) return p;
    achou = true;
    const i = Math.max(0, Math.min(onde.indice, lista.length));
    return comRamo(p, ramo, [...lista.slice(0, i), novo, ...lista.slice(i)]);
  });
  return achou ? saida : passos;
}

/* ══════════════════ execução ══════════════════════════════════════════════ */

/**
 * A lista que roda, dadas as decisões já tomadas.
 *
 * Cada bifurcação entra como marcador; se já foi decidida, os passos do ramo
 * escolhido vêm logo atrás. Uma bifurcação ainda não decidida não traz nada: o
 * executor decide ao chegar nela, grava, e achata de novo.
 *
 * DESCE NOS RAMOS, porque uma "Escolha" pode morar dentro de um lado do "Se":
 * sem a recursão, os passos do caso escolhido nunca entrariam na lista e o
 * lead sairia do fluxo pela porta errada, em silêncio.
 */
export function achatar<P extends PassoComRamos>(passos: P[], decisoes: Decisoes | null | undefined): P[] {
  const d = decisoes ?? {};
  const saida: P[] = [];
  for (const p of passos) {
    saida.push(p);
    if (!temRamos(p)) continue;
    const escolhido = d[p.id];
    if (escolhido === undefined) continue;
    const lista = listaDoRamo(p, escolhido);
    /* Ramo gravado que não existe mais (o caso foi apagado depois do disparo):
       segue em frente sem nada, que é o mesmo que o fluxo não ter tido aquele
       caso. Melhor do que estourar e deixar a execução travada em "falhou". */
    if (lista) saida.push(...achatar(lista, d));
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
