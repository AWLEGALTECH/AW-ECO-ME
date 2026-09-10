/* QUAL LEAD É O DONO DESTA ANÁLISE.
 *
 * A jornada avança quando a análise comercial nasce LIGADA a uma conversa, e
 * ela só nasce ligada quando o Finder foi aberto pelo botão "Levar ao Finder",
 * de dentro da conversa. Aberto pelo menu, sem `?conversa=`, o vínculo é nulo:
 * a análise fica pronta, o lead fica em "Aguardando análise" para sempre, e
 * ninguém recebe erro nenhum.
 *
 * Este módulo é a lista de candidatos que a tela de salvar oferece. Ele NÃO
 * escolhe: casar por nome sozinho seria mover o funil de outra pessoa, e o
 * nome que o extrato traz ("JOSÉ ALMYR ARAÚJO LOPES") quase nunca é o que o
 * WhatsApp mostra ("almyr Lopes"). O que ele faz é pôr o provável em cima e
 * deixar a última palavra com quem está olhando.
 *
 * A BUSCA POR TELEFONE É A QUE SALVA. Quem faz a análise fora do atendimento
 * costuma ter o número à mão, e oito dígitos acham a conversa sem depender de
 * como cada lado escreveu o nome.
 */

/** Uma conversa que pode ser a dona da análise. */
export interface LeadCandidato {
  id: string;
  nome: string | null;
  telefone: string;
  instancia: string;
  etapa: string | null;
  jornada: string | null;
  ultimaEm: string | null;
}

const semAcento = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const soDigitos = (s: string) => (s || "").replace(/\D/g, "");
/** Últimos oito dígitos: o mesmo critério do banco, imune ao nono dígito. */
export const tel8 = (s: string) => soDigitos(s).slice(-8);

/**
 * Dois nomes que provavelmente são a mesma pessoa.
 *
 * O do extrato é o nome de cartório inteiro; o do WhatsApp é como a pessoa se
 * apelidou. Primeiro e último nome iguais é o mais longe que dá para ir sem
 * inventar: "almyr Lopes" casa com "JOSÉ ALMYR ARAÚJO LOPES"? Não, e é por isso
 * que este palpite NUNCA seleciona sozinho, só ordena.
 */
export function nomeParecido(a: string, b: string): boolean {
  const pa = semAcento(a).split(" ").filter(Boolean);
  const pb = semAcento(b).split(" ").filter(Boolean);
  if (pa.length === 0 || pb.length === 0) return false;
  if (pa.join(" ") === pb.join(" ")) return true;
  // um nome contido no outro: "almyr lopes" dentro de "jose almyr araujo lopes"
  const dentro = (curto: string[], longo: string[]) =>
    curto.length >= 2 && curto.every((p) => longo.includes(p));
  if (dentro(pa, pb) || dentro(pb, pa)) return true;
  if (pa.length >= 2 && pb.length >= 2) {
    return pa[0] === pb[0] && pa[pa.length - 1] === pb[pb.length - 1];
  }
  return false;
}

/** As etapas em que um lead ESPERA por uma análise, em cada régua. */
const ESPERANDO: Record<string, string[]> = {
  bradesco: ["na_base", "triagem", "aguardando_extrato", "aguardando_analise"],
  padrao: ["chegou", "triagem", "extrato"],
};

/** Este lead ainda ganharia alguma coisa com uma análise? */
export function esperaAnalise(l: LeadCandidato): boolean {
  const lista = ESPERANDO[l.jornada ?? "padrao"] ?? ESPERANDO.padrao;
  return lista.includes(l.etapa ?? "");
}

/**
 * Os candidatos na ordem em que faz sentido oferecê-los.
 *
 * Nome parecido primeiro, porque é o único palpite que existe. Depois quem está
 * parado numa etapa que espera análise, que é onde o dono desta análise
 * provavelmente está. O resto por último, mas presente: lead que já passou
 * dessa etapa ainda pode ser o certo, e esconder obrigaria a pessoa a desistir
 * da tela.
 */
export function ordenarCandidatos(leads: LeadCandidato[], nomeDaAnalise: string): LeadCandidato[] {
  const peso = (l: LeadCandidato) => {
    const parecido = !!l.nome && nomeParecido(l.nome, nomeDaAnalise);
    if (parecido && esperaAnalise(l)) return 0;
    if (parecido) return 1;
    if (esperaAnalise(l)) return 2;
    return 3;
  };
  return [...leads].sort((a, b) =>
    peso(a) - peso(b) || String(b.ultimaEm ?? "").localeCompare(String(a.ultimaEm ?? "")));
}

/** Busca por nome ou por telefone. Três dígitos já bastam para filtrar. */
export function filtrarCandidatos(leads: LeadCandidato[], termo: string): LeadCandidato[] {
  const t = semAcento(termo);
  if (!t) return leads;
  const digitos = soDigitos(termo);
  return leads.filter((l) =>
    semAcento(l.nome ?? "").includes(t) ||
    (digitos.length >= 3 && soDigitos(l.telefone).includes(digitos)));
}

/** "(92) 99116-5782" a partir de "5592991165782". */
export function telefoneNaTela(t: string): string {
  const d = soDigitos(t).replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}
