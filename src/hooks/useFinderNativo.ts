import { usePreferencias } from "@/hooks/usePreferencias";
import { usarFinderNativo } from "@/lib/finderNativo";

/**
 * Qual Finder abre (ver lib/finderNativo.ts), como hook: espera a conta carregar antes de decidir. Sem esperar,
 * a página abria o pacote antigo por um instante e trocava pelo novo quando a
 * preferência chegava, que é o piscar que parecia "espelho".
 *
 * `null` enquanto não dá para saber.
 */
export function useFinderNativo(): boolean | null {
  const prefs = usePreferencias();
  if (!prefs.carregado) return null;
  return usarFinderNativo(prefs.finderNativo);
}
