/* COMO O LEAD SE CHAMA, E DE ONDE ISSO VEIO.
 *
 * O WhatsApp diz o que a pessoa escolheu como apelido. Às vezes é o nome dela,
 * às vezes é "almyr Lopes", às vezes é "🩸", e num caso que está na base agora é
 * "😎". Quem atende conversa com um emoji por vinte e sete mensagens e não sabe
 * quem é.
 *
 * O NOME DE VERDADE APARECE DEPOIS, e sempre de uma fonte melhor: o extrato lido
 * pelo Finder traz o titular, o kit do Writer traz o nome digitado com o
 * documento na mão, e o contrato assinado traz o nome que a pessoa assinou.
 *
 * ─── a hierarquia, e por que ela precisa existir ────────────────────────────
 *
 * Sem ordem de confiança, a última escrita ganharia: um webhook do WhatsApp
 * chegando depois do contrato sobrescreveria "José Almyr Araújo Lopes" por
 * "😎". A ordem é a da procedência, não a do relógio.
 */

export type OrigemDoNome = "whatsapp" | "analise" | "pre_cliente" | "contrato";

/** Quanto se confia em cada fonte. Maior ganha; empate mantém o que já estava. */
export const CONFIANCA: Record<OrigemDoNome, number> = {
  whatsapp: 0,
  analise: 1,
  pre_cliente: 2,
  contrato: 3,
};

export function melhorQue(nova: OrigemDoNome, atual: OrigemDoNome | null | undefined): boolean {
  if (!atual) return true;
  return (CONFIANCA[nova] ?? 0) > (CONFIANCA[atual] ?? 0);
}

/* Partículas que não são nome: sozinhas não identificam ninguém, e "Maria da"
   é pior que "Maria Silva". */
const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "di", "del", "van", "von"]);

/** "JOSÉ" -> "José", respeitando as partículas: "DA" continua "da". */
export function capitalizar(nome: string): string {
  return (nome || "").trim().toLowerCase().split(/\s+/).filter(Boolean)
    .map((p, i) => (i > 0 && PARTICULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/**
 * Primeiro e segundo nome, que é como se chama alguém.
 *
 * "JOSÉ ALMYR ARAÚJO LOPES" vira "José Almyr". O nome de cartório inteiro numa
 * lista de conversas ocupa a linha toda e trunca no meio, e ninguém fala com o
 * cliente pelo nome completo.
 *
 * A PARTÍCULA É PULADA: "MARIA DA SILVA" vira "Maria Silva" e não "Maria da",
 * que não é nome de ninguém.
 */
export function nomeCurto(completo: string | null | undefined): string {
  const partes = (completo || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  const primeiro = partes[0];
  const segundo = partes.slice(1).find((p) => !PARTICULAS.has(p.toLowerCase()));
  return capitalizar([primeiro, segundo].filter(Boolean).join(" "));
}

export interface NomeDoLead {
  /** o nome de verdade, quando alguma fonte melhor já apareceu */
  nomeReal?: string | null;
  origem?: OrigemDoNome | null;
  /** o apelido do WhatsApp */
  nomeWa?: string | null;
  telefone?: string | null;
}

/**
 * O que a tela mostra, e o que o botão de troca revela.
 *
 * `trocado` é o estado do botãozinho ao lado do nome: quem está atendendo às
 * vezes precisa do apelido do WhatsApp (é por ele que a pessoa se identifica
 * numa lista de grupos, e é ele que aparece no celular de quem liga).
 *
 * Sem nome real, não há o que trocar, e o botão não deve nem existir: um botão
 * que não faz nada ensina a não clicar nos botões.
 */
export function nomeParaMostrar(l: NomeDoLead, trocado = false): {
  texto: string;
  /** dá para alternar? só quando existem os dois e eles são diferentes */
  podeTrocar: boolean;
  /** o que o botão vai revelar, para o title */
  oOutro: string;
} {
  const real = (l.nomeReal || "").trim();
  const wa = (l.nomeWa || "").trim();
  const curto = nomeCurto(real);
  const fallback = wa || telefoneNaTela(l.telefone) || "sem nome";

  if (!curto) return { texto: fallback, podeTrocar: false, oOutro: "" };
  // Mesmo nome dos dois lados: trocar mostraria a mesma coisa.
  if (!wa || nomeCurto(wa) === curto) return { texto: curto, podeTrocar: false, oOutro: "" };

  return {
    texto: trocado ? wa : curto,
    podeTrocar: true,
    oOutro: trocado ? curto : wa,
  };
}

/** "(92) 98819-9101" a partir de "5592988199101". */
export function telefoneNaTela(t: string | null | undefined): string {
  const d = (t || "").replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return (t || "").trim();
}

/** O número como se digita para ligar ou colar em outro sistema. */
export function telefoneParaCopiar(t: string | null | undefined): string {
  const d = (t || "").replace(/\D/g, "");
  return d.startsWith("55") ? `+${d}` : d;
}
