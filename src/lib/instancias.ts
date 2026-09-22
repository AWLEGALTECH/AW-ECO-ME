/* VÁRIOS NÚMEROS NA MESMA CAIXA.
 *
 * Até aqui a tela atendia por um número de cada vez, e trocar era um gesto de
 * "sair daqui e ir pra lá". Isso serve enquanto os números são mundos separados
 * — e deixa de servir no dia em que a mesma pessoa cuida dos dois: quem atende
 * pelo Portal e pelo número do escritório precisa saber quem está esperando
 * resposta, e não quem está esperando resposta EM UM DOS DOIS.
 *
 * ──────────────────── as três coisas que este módulo resolve ────────────────
 *
 * 1. A CAIXA CRUZADA. Juntar as conversas de vários números numa lista só e
 *    reordenar por quem falou por último. Simples de descrever e fácil de errar
 *    na ordenação, que é justamente o que a caixa é.
 *
 * 2. DE QUEM É CADA CONVERSA. Numa caixa cruzada, a linha sem dono é pior que
 *    inútil: responder pelo número errado é um erro que o cliente vê e a gente
 *    não. Por isso cada conversa carrega a marca do número dela.
 *
 * 3. DOIS NÚMEROS COM A MESMA FOTO. Acontece — duas instâncias do mesmo
 *    escritório, mesma logo. A foto deixa de distinguir e a tela vira adivinha.
 *    A saída é não depender da foto: cada número ganha um APELIDO curto, único
 *    dentro do conjunto escolhido, e uma cor estável.
 */

/** Os nomes das instâncias, sem vazio e sem repetição, na ordem em que vieram. */
export function listaDeInstancias(x: string | string[] | null | undefined): string[] {
  const bruto = Array.isArray(x) ? x : x ? [x] : [];
  const vistos = new Set<string>();
  const fora: string[] = [];
  for (const n of bruto) {
    const limpo = String(n ?? "").trim();
    if (!limpo) continue;
    const chave = limpo.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    fora.push(limpo);
  }
  return fora;
}

/**
 * Dois nomes de instância são o mesmo número?
 *
 * Sem caixa alta, porque o nome é digitado à mão na Evolution e ninguém garante
 * a caixa: "PORTAL DIREITO ABERTO" e "Portal Direito Aberto" são a mesma coisa
 * pra quem configurou. Comparar exato faria uma conversa não encontrar o próprio
 * número e sumir da caixa sem dizer por quê.
 */
export const mesmaInstancia = (a: string | null | undefined, b: string | null | undefined): boolean =>
  String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

export const contemInstancia = (nomes: string[], alvo: string | null | undefined): boolean =>
  nomes.some((n) => mesmaInstancia(n, alvo));

/**
 * Junta listas de conversas de vários números numa só, mais recente primeiro.
 *
 * NULO VAI PRO FIM, sempre. Conversa sem data é conversa que nunca teve
 * mensagem — importada e nunca tocada. No topo da caixa ela empurraria pra
 * baixo justamente quem está esperando resposta agora.
 *
 * O desempate é pelo id, e não é capricho: sem ele, duas conversas com o mesmo
 * carimbo trocam de lugar entre uma atualização e outra, e a lista "pisca"
 * sozinha a cada dez segundos.
 */
export function juntarPorRecente<T extends { id: string; ultima_em: string | null }>(
  listas: T[][],
): T[] {
  const todas = listas.flat();
  return todas.sort((a, b) => {
    if (a.ultima_em && b.ultima_em) {
      const d = b.ultima_em.localeCompare(a.ultima_em);
      if (d !== 0) return d;
    } else if (a.ultima_em !== b.ultima_em) {
      return a.ultima_em ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * O apelido curto de um número: as iniciais das palavras, mais o número no fim.
 *
 * "PORTAL DIREITO ABERTO 2" vira "PDA2"; "Dr. Matheus Enes" vira "DME". É o que
 * cabe num selo de dezoito pixels em cima de uma foto de perfil, e é o que
 * salva quando duas instâncias têm a MESMA foto — que é o caso que a foto
 * sozinha não resolve.
 */
export function apelidoDeInstancia(nome: string): string {
  const limpo = String(nome ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s]/g, " ")
    .trim();
  if (!limpo) return "?";

  const palavras = limpo.split(/\s+/);
  /* O número do fim só se separa se sobrar nome antes dele. "PDA 2" tem um
     nome e uma ordem; "5511999" é só um número, e tirar o número dele deixaria
     a função sem nada pra transformar em iniciais. */
  const numeroFinal = palavras.length > 1 && /^\d+$/.test(palavras[palavras.length - 1])
    ? palavras.pop()!
    : "";

  // Palavrinha de ligação não vira inicial: "Portal de Direito" é PD, não PDD.
  const menores = new Set(["de", "da", "do", "das", "dos", "e", "dr", "dra"]);
  const cheias = palavras.filter((p) => !menores.has(p.toLowerCase()));

  /* NOME DE UMA PALAVRA VIRA AS TRÊS PRIMEIRAS LETRAS, e não a inicial sozinha.
     "Escritorio" como "E" não é apelido, é letra solta — e num selo ao lado de
     outro selo é exatamente onde o apelido tinha que estar trabalhando. */
  const base = cheias.length === 1
    ? cheias[0].slice(0, 3).toUpperCase()
    : cheias.map((p) => p[0]).join("").toUpperCase().slice(0, 3)
      || limpo.slice(0, 3).toUpperCase();

  return `${base}${numeroFinal}`;
}

/**
 * Os apelidos de um conjunto, GARANTIDAMENTE diferentes entre si.
 *
 * Sem esta garantia o apelido não resolve nada no único caso em que ele é
 * necessário: duas instâncias parecidas, com a mesma foto, viram dois selos
 * "PDA" — e a tela continua sem dizer qual é qual, agora com mais tinta.
 */
export function apelidosDeInstancias(
  nomes: string[],
  /** os escolhidos a mão, por nome de instância; o resto se deriva */
  escolhidos?: Map<string, string | null | undefined>,
): Map<string, string> {
  const fora = new Map<string, string>();
  const usados = new Map<string, number>();
  for (const nome of listaDeInstancias(nomes)) {
    /* O ESCOLHIDO A MÃO SAI INTACTO, sem sufixo de desempate. Quem escreveu
       "ECO" nos dois quis dizer isso; corrigir a escolha da pessoa com um
       "ECO·2" seria a tela discordando de uma decisão explícita. O desempate
       existe pra salvar o AUTOMÁTICO, que é palpite. */
    const escolhido = escolhidos?.get(nome)?.trim();
    if (escolhido) { fora.set(nome, escolhido.slice(0, 6)); continue; }

    const base = apelidoDeInstancia(nome);
    const quantos = usados.get(base) ?? 0;
    usados.set(base, quantos + 1);
    fora.set(nome, quantos === 0 ? base : `${base}·${quantos + 1}`);
  }
  return fora;
}

/* AS CORES DOS SELOS: cores comuns, com nome de gente.
 *
 * Vermelho, azul, verde, amarelo, rosa, roxo e laranja. O pedido do chefe
 * (21/09) foi literal: "cores que são naturalmente diferentes uma da outra",
 * as mesmas para todo número, sem tons parecidos. A paleta anterior tinha
 * nomes de tema (sky, teal, indigo, lime...) e repetia família: dois roxos,
 * dois verdes, um cinza. Etiqueta existe para distinguir números de longe, e
 * a pessoa escolhe pelo nome que ela mesma daria à cor.
 *
 * O NOME DA COR É A CHAVE, e não o valor: o banco guarda "azul", e é aqui que
 * "azul" vira fundo, texto e anel. Guardar `#3b82f6` do outro lado espalharia
 * decisão de tema pelo banco, e mexer no tema viraria migração de dado. Um nome
 * antigo que ainda esteja em algum cache cai no sorteio pelo `ehNomeDeCor`,
 * sem quebrar nada; no banco a migration 20260922020000 já traduziu todos. */
export const CORES_DE_INSTANCIA = {
  vermelho: { anel: "ring-red-400/50",    fundo: "bg-red-500",    texto: "text-red-50" },
  azul:     { anel: "ring-blue-400/50",   fundo: "bg-blue-500",   texto: "text-blue-50" },
  verde:    { anel: "ring-green-400/50",  fundo: "bg-green-500",  texto: "text-green-50" },
  amarelo:  { anel: "ring-yellow-400/50", fundo: "bg-yellow-400", texto: "text-yellow-950" },
  rosa:     { anel: "ring-pink-400/50",   fundo: "bg-pink-500",   texto: "text-pink-50" },
  roxo:     { anel: "ring-purple-400/50", fundo: "bg-purple-500", texto: "text-purple-50" },
  laranja:  { anel: "ring-orange-400/50", fundo: "bg-orange-500", texto: "text-orange-50" },
} as const;

export type NomeDeCor = keyof typeof CORES_DE_INSTANCIA;
export type CorDeInstancia = (typeof CORES_DE_INSTANCIA)[NomeDeCor];

/** Todas podem sair no sorteio. A ordem é a que a pessoa vê no seletor. */
const SORTEAVEIS: NomeDeCor[] = ["azul", "verde", "roxo", "laranja", "rosa", "amarelo", "vermelho"];

export const ehNomeDeCor = (x: unknown): x is NomeDeCor =>
  typeof x === "string" && x in CORES_DE_INSTANCIA;

/**
 * A cor de um número. A escolhida, se alguém escolheu; senão, uma derivada do
 * nome.
 *
 * O SORTEIO CONTINUA SENDO O PADRÃO, e é isso que faz número novo já nascer com
 * etiqueta sem ninguém configurar nada. Derivada do NOME e não da posição na
 * lista: pela posição, tirar um número da seleção repintaria os outros, e a cor
 * deixaria de ser o atalho que ela existe pra ser.
 */
export function corDaInstancia(nome: string, escolhida?: string | null): CorDeInstancia {
  return CORES_DE_INSTANCIA[nomeDaCorEmUso(nome, escolhida)];
}

/** O nome da cor em uso — pra tela marcar a escolhida no seletor. */
export function nomeDaCorEmUso(nome: string, escolhida?: string | null): NomeDeCor {
  if (ehNomeDeCor(escolhida)) return escolhida;
  return SORTEAVEIS[hashDoNome(nome) % SORTEAVEIS.length];
}

function hashDoNome(nome: string): number {
  let h = 0;
  const chave = String(nome ?? "").trim().toLowerCase();
  for (let i = 0; i < chave.length; i++) h = (h * 31 + chave.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * AS CORES DE UM CONJUNTO, GARANTIDAMENTE DIFERENTES ENTRE SI.
 *
 * `corDaInstancia` sorteia pelo nome, e sorteio não garante coisa nenhuma: com
 * três números e seis cores, a chance de dois saírem iguais passa de um terço.
 * E foi o que aconteceu — dois selos da mesma cor na mesma caixa, que é
 * exatamente o problema que a cor existia pra resolver.
 *
 * A regra é a mesma do apelido: quem ESCOLHEU fica com o que escolheu, mesmo
 * que dois escolham igual — discordar de uma decisão explícita não é papel da
 * tela. O sorteio é que se afasta, andando na paleta até achar uma cor livre.
 */
export function coresDeInstancias(
  nomes: string[],
  escolhidas?: Map<string, string | null | undefined>,
): Map<string, NomeDeCor> {
  const fora = new Map<string, NomeDeCor>();
  const lista = listaDeInstancias(nomes);

  // Primeiro as escolhidas: elas ocupam a cor e o sorteio desvia das ocupadas.
  const ocupadas = new Set<NomeDeCor>();
  for (const nome of lista) {
    const c = escolhidas?.get(nome);
    if (ehNomeDeCor(c)) { fora.set(nome, c); ocupadas.add(c); }
  }

  for (const nome of lista) {
    if (fora.has(nome)) continue;
    const inicio = hashDoNome(nome) % SORTEAVEIS.length;
    /* Anda na paleta a partir do sorteado. Se todas estiverem ocupadas — mais
       números do que cores livres — volta pro sorteado mesmo: repetir cor é
       ruim, e ficar sem cor é pior. */
    let escolhida = SORTEAVEIS[inicio];
    for (let k = 0; k < SORTEAVEIS.length; k++) {
      const tentativa = SORTEAVEIS[(inicio + k) % SORTEAVEIS.length];
      if (!ocupadas.has(tentativa)) { escolhida = tentativa; break; }
    }
    ocupadas.add(escolhida);
    fora.set(nome, escolhida);
  }
  return fora;
}

/** "2 números", "3 números" — o rótulo da caixa cruzada. */
export function rotuloDaSelecao(nomes: string[], nomeUnico: string): string {
  const lista = listaDeInstancias(nomes);
  if (lista.length <= 1) return nomeUnico;
  return `${lista.length} números`;
}
