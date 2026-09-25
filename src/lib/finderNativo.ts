/* QUAL FINDER ABRE: o antigo (pacote no iframe) ou o novo (código do AW).
 *
 * Os dois convivem até o novo provar que acha os mesmos descontos e que cada
 * ligação com o AW continua no lugar (docs/finder-contrato.md). Quem decide,
 * nesta ordem:
 *
 *   1. o endereço: /finder?nativo=1 liga, ?nativo=0 desliga (e o navegador
 *      lembra), para testar sem mexer na conta de ninguém
 *   2. o navegador, se alguém já usou o endereço nele
 *   3. a conta: `preferencias_usuario.finder_nativo`, ligada pessoa a pessoa
 *   4. o padrão abaixo
 *
 * Quando a troca for definitiva, o padrão vira `true` e o pacote sai.
 */
const CHAVE = "aw-finder-nativo";
const PADRAO = false;

export function lerEscolhaDoEndereco(busca: string): boolean | null {
  const v = new URLSearchParams(busca).get("nativo");
  if (v === "1") return true;
  if (v === "0") return false;
  return null;
}

export function usarFinderNativo(daConta = false): boolean {
  if (typeof window === "undefined") return daConta || PADRAO;
  const doEndereco = lerEscolhaDoEndereco(window.location.search);
  try {
    if (doEndereco !== null) {
      window.localStorage.setItem(CHAVE, doEndereco ? "1" : "0");
      return doEndereco;
    }
    const salvo = window.localStorage.getItem(CHAVE);
    if (salvo === "1") return true;
    if (salvo === "0") return false;
  } catch { /* modo privado: vale a conta */ }
  return daConta || PADRAO;
}

