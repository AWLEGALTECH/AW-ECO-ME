/* PUXAR UMA ANÁLISE COMERCIAL PARA DENTRO DE UMA LEVA DE AÇÕES.
 *
 * O Finder lê os extratos e salva uma análise comercial (tabela
 * `analises_comerciais`): o nome do titular e a lista de rubricas encontradas,
 * cada uma com valor e com a marca de "não ajuizável". Essa análise fica lá,
 * solta, esperando alguém usá-la.
 *
 * Só que quem monta as ações ajuizáveis do cliente estava digitando tudo de
 * novo. Voltar ao Finder para refazer a leitura é caro (e às vezes impossível,
 * porque a pasta do Drive já foi reorganizada) quando a leitura JÁ EXISTE no
 * banco, feita meia hora antes, na conversa do Atendimento.
 *
 * ─────────────────────────── o que mora aqui ───────────────────────────────
 *
 * A ESCOLHA (qual análise é desta pessoa) e a CONVERSÃO (o que uma rubrica de
 * extrato vira dentro de uma leva). As duas são regra, não desenho, então
 * ficam fora da tela e podem ser testadas sem abrir o navegador.
 *
 * A REGRA DO NOME é conservadora de propósito. O vocabulário do Finder não é o
 * do catálogo de ações: ele diz "Emissão de Extrato", o catálogo diz "Emissão
 * de extrato" — a mesma coisa —, mas ele também diz "Mora de Crédito", e o
 * catálogo tem "Mora", "Mora - operações" e "Mora - cartão de crédito", que são
 * três ações diferentes. Adivinhar ali trocaria a ação contratada por outra no
 * fechamento do mês. Então: bate exatamente (ignorando acento, caixa e
 * pontuação) e vira o nome do catálogo; não bate e entra com o nome que a
 * análise deu. É o mesmo que o Finder já faz quando refaz a análise inteira.
 */

/** Uma rubrica como o Finder salvou. */
export interface RubricaAnalise {
  rubrica: string;
  valor?: number | null;
  bloqueada?: boolean;
  motivo?: string | null;
}

/** Uma análise comercial salva, do jeito que a tabela devolve. */
export interface AnaliseSalva {
  id: string;
  nome: string;
  cpf_cnpj?: string | null;
  rubricas: RubricaAnalise[];
  cliente_id?: string | null;
  conversa_id?: string | null;
  created_at?: string | null;
  created_by_email?: string | null;
}

/** Uma ação pronta para entrar na leva. Espelha a linha do editor. */
export interface AcaoImportada {
  id: null;
  grupo_id: string | null;
  rubrica: string;
  detalhe: string;
  requerido: string;
  bloqueada: boolean;
  motivo: "rubrica_invalida" | "ja_ajuizada" | "cliente_nao_quer";
  contrato_id: string | null;
}

const MOTIVOS = new Set(["rubrica_invalida", "ja_ajuizada", "cliente_nao_quer"]);

/** Minúsculo, sem acento, sem pontuação, sem espaço dobrado. */
export function normalizarRubrica(s: string): string {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * O nome do catálogo quando é a mesma rubrica escrita de outro jeito; o nome
 * original quando não é. Nunca inventa parentesco: "Mora de Crédito" não vira
 * "Mora", porque no catálogo há três Moras e escolher a errada muda a ação que
 * o cliente contratou.
 */
export function canonizar(nome: string, catalogo: string[]): string {
  const bruto = (nome || "").trim();
  if (!bruto) return "";
  const alvo = normalizarRubrica(bruto);
  const achou = catalogo.find((c) => normalizarRubrica(c) === alvo);
  return achou ?? bruto;
}

/** "13 rubricas · 4 não ajuizáveis" — o que a lista mostra embaixo do nome. */
export function resumoDaAnalise(a: AnaliseSalva): string {
  const n = (a.rubricas || []).length;
  const bloq = (a.rubricas || []).filter((r) => r?.bloqueada).length;
  const partes = [`${n} ${n === 1 ? "rubrica" : "rubricas"}`];
  if (bloq > 0) partes.push(`${bloq} não ${bloq === 1 ? "ajuizável" : "ajuizáveis"}`);
  return partes.join(" · ");
}

/** Chave de uma ação dentro da leva: a mesma ação pode repetir por réu. */
const chaveDaAcao = (rubrica: string, requerido: string) =>
  `${normalizarRubrica(rubrica)}||${normalizarRubrica(requerido)}`;

/**
 * As ações que uma análise vira, prontas para entrar na leva.
 *
 * `jaNaLeva` é o que já está no editor: a mesma rubrica contra o mesmo
 * requerido não entra duas vezes. Puxar a análise de novo (por engano, ou para
 * completar depois de mexer na lista) tem que ser inofensivo — quem clica duas
 * vezes não quer 26 ações.
 *
 * O REQUERIDO vem de fora, um só para todas: uma análise do Finder é a leitura
 * do extrato de UM banco, então as ações dela vão todas contra o mesmo réu.
 * Vazio também serve: aí o editor cobra o campo linha a linha, como sempre.
 */
export function acoesDaAnalise(
  analise: AnaliseSalva,
  opts: {
    catalogo?: string[];
    requerido?: string;
    grupoId?: string | null;
    contratoId?: string | null;
    jaNaLeva?: { rubrica: string; requerido: string }[];
  } = {},
): { acoes: AcaoImportada[]; repetidas: number } {
  const catalogo = opts.catalogo ?? [];
  const requerido = (opts.requerido ?? "").trim();
  const vistas = new Set(
    (opts.jaNaLeva ?? []).map((x) => chaveDaAcao(x.rubrica || "", x.requerido || "")),
  );

  const acoes: AcaoImportada[] = [];
  let repetidas = 0;

  for (const r of analise?.rubricas ?? []) {
    const rubrica = canonizar(String(r?.rubrica ?? ""), catalogo);
    if (!rubrica) continue;
    const k = chaveDaAcao(rubrica, requerido);
    if (vistas.has(k)) { repetidas++; continue; }
    vistas.add(k);
    const motivo = String(r?.motivo ?? "");
    acoes.push({
      id: null,
      grupo_id: opts.grupoId ?? null,
      rubrica,
      // O valor lido do extrato é a única pista de POR QUE aquela rubrica foi
      // parar na lista. Sem ele, quem confere daqui a um mês só vê o nome.
      detalhe: typeof r?.valor === "number" && isFinite(r.valor) ? `extrato: ${fmtBRL(r.valor)}` : "",
      requerido,
      bloqueada: !!r?.bloqueada,
      motivo: (MOTIVOS.has(motivo) ? motivo : "rubrica_invalida") as AcaoImportada["motivo"],
      contrato_id: opts.contratoId ?? null,
    });
  }
  return { acoes, repetidas };
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/**
 * As análises na ordem em que faz sentido oferecê-las a ESTE cliente.
 *
 * Primeiro a que já é dele (cliente_id casado), depois a que tem o nome dele
 * (é assim que a análise do Finder chega: só com o nome do titular, antes de
 * existir cadastro), depois as demais, da mais nova para a mais velha. Ordenar
 * só por data faria a pessoa procurar o próprio cliente numa lista de todos.
 */
export function ordenarAnalises(
  analises: AnaliseSalva[],
  cliente: { id?: string | null; nome?: string | null } = {},
): AnaliseSalva[] {
  const alvo = normalizarRubrica(cliente.nome || "");
  const peso = (a: AnaliseSalva) => {
    if (cliente.id && a.cliente_id === cliente.id) return 0;
    if (alvo && normalizarRubrica(a.nome) === alvo) return 1;
    // Nome parcial: "JOSE ALMYR ARAUJO LOPES" e "José Almyr Lopes" são a mesma
    // pessoa escrita por duas mãos diferentes.
    if (alvo && parecido(normalizarRubrica(a.nome), alvo)) return 2;
    return 3;
  };
  return [...analises].sort((a, b) =>
    peso(a) - peso(b) || String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
}

/** Dois nomes com primeiro e último sobrenome iguais são a mesma pessoa. */
function parecido(a: string, b: string): boolean {
  const pa = a.split(" ").filter(Boolean);
  const pb = b.split(" ").filter(Boolean);
  if (pa.length < 2 || pb.length < 2) return false;
  return pa[0] === pb[0] && pa[pa.length - 1] === pb[pb.length - 1];
}

/** Busca por nome, CPF ou por uma rubrica que a análise contenha. */
export function filtrarAnalises(analises: AnaliseSalva[], termo: string): AnaliseSalva[] {
  const t = normalizarRubrica(termo);
  if (!t) return analises;
  const soDigitos = (termo || "").replace(/\D/g, "");
  return analises.filter((a) =>
    normalizarRubrica(a.nome).includes(t) ||
    (soDigitos.length >= 3 && String(a.cpf_cnpj || "").replace(/\D/g, "").includes(soDigitos)) ||
    (a.rubricas || []).some((r) => normalizarRubrica(r?.rubrica || "").includes(t)));
}
