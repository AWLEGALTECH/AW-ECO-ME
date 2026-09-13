/* PREFERÊNCIAS DO USUÁRIO: a lógica pura, sem React e sem Supabase.
 *
 * Duas coisas moram aqui: a paleta de cores e a ordem do menu lateral. As duas
 * são da pessoa, não do navegador, então o que o servidor guarda vence o que o
 * navegador lembra. Este arquivo só decide o que é válido e como uma ordem
 * salva se aplica a uma lista de itens que pode ter mudado desde que foi salva.
 */

export const PALETAS = ["default", "midnight-blue", "vermelho", "space-gray", "sei"] as const;
export type Paleta = (typeof PALETAS)[number];

export function paletaValida(x: unknown): x is Paleta {
  return typeof x === "string" && (PALETAS as readonly string[]).includes(x);
}

/**
 * Aplica uma ordem salva (lista de chaves) a uma lista de itens.
 *
 * A lista de itens é a verdade sobre O QUE existe; a ordem salva só diz em que
 * sequência. Chave salva que não existe mais é ignorada. Item que não está na
 * ordem salva (módulo novo, ou módulo que a pessoa não tinha quando salvou)
 * entra na posição que tem na lista padrão, contada entre os vizinhos que ele
 * tinha ali. Assim um módulo novo aparece onde o desenho do sistema o colocou,
 * e não jogado no fim.
 */
export function ordenarPorPreferencia<T>(itens: T[], ordem: string[] | null | undefined, chave: (t: T) => string): T[] {
  if (!ordem || ordem.length === 0) return itens;
  const porChave = new Map(itens.map((it) => [chave(it), it]));
  const vistos = new Set<string>();
  const resultado: T[] = [];
  for (const k of ordem) {
    const it = porChave.get(k);
    if (it && !vistos.has(k)) { resultado.push(it); vistos.add(k); }
  }
  // Os que sobraram entram depois do vizinho de cima que já está no resultado.
  itens.forEach((it, i) => {
    const k = chave(it);
    if (vistos.has(k)) return;
    let pos = 0;
    for (let j = i - 1; j >= 0; j--) {
      const idx = resultado.findIndex((r) => chave(r) === chave(itens[j]));
      if (idx !== -1) { pos = idx + 1; break; }
    }
    resultado.splice(pos, 0, it);
    vistos.add(k);
  });
  return resultado;
}

/** Duas ordens iguais não merecem uma escrita no servidor. */
export function mesmaOrdem(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  const x = a ?? [], y = b ?? [];
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
