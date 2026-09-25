/* QUAL FINDER ABRE: o antigo (pacote no iframe) ou o novo (código do AW).
 *
 * Os dois convivem até o novo provar que acha os mesmos descontos e que cada
 * ligação com o AW continua no lugar (docs/finder-contrato.md). O novo liga
 * por navegador, para conferir no uso real sem mexer no de ninguém:
 *
 *   /finder?nativo=1   liga neste navegador (fica lembrado)
 *   /finder?nativo=0   volta para o antigo
 *
 * Quando a troca for definitiva, o padrão abaixo vira `true` e o pacote sai.
 */
const CHAVE = "aw-finder-nativo";
const PADRAO = false;

export function lerEscolhaDoEndereco(busca: string): boolean | null {
  const v = new URLSearchParams(busca).get("nativo");
  if (v === "1") return true;
  if (v === "0") return false;
  return null;
}

export function usarFinderNativo(): boolean {
  if (typeof window === "undefined") return PADRAO;
  const doEndereco = lerEscolhaDoEndereco(window.location.search);
  try {
    if (doEndereco !== null) {
      window.localStorage.setItem(CHAVE, doEndereco ? "1" : "0");
      return doEndereco;
    }
    const salvo = window.localStorage.getItem(CHAVE);
    if (salvo === "1") return true;
    if (salvo === "0") return false;
  } catch { /* modo privado: vale o padrão */ }
  return PADRAO;
}
