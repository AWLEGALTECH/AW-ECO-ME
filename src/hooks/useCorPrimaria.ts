/* A COR DO TEMA, EM FORMA QUE O SVG ENTENDE.
 *
 * O Recharts grava `fill` como ATRIBUTO no SVG, e atributo não expande `var()`:
 * `fill="hsl(var(--primary))"` vira transparente. O DonutChart resolve isso com
 * uma tabela de paletas por tema, escrita à mão, que precisa ser atualizada a
 * cada tema novo. Aqui a cor é lida da folha de estilo em runtime, então tema
 * novo já nasce coberto.
 *
 * Reage à troca de tema porque observa `data-theme` no <html>. Sem isso, o
 * gráfico ficaria roxo depois de o usuário mudar para azul, até recarregar.
 */
import { useEffect, useState } from "react";

function lerPrimaria(): string {
  if (typeof window === "undefined") return "270 100% 62%";
  const v = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  return v || "270 100% 62%";
}

export function useCorPrimaria() {
  const [hsl, setHsl] = useState<string>(lerPrimaria);

  useEffect(() => {
    setHsl(lerPrimaria());
    const alvo = document.documentElement;
    const obs = new MutationObserver(() => setHsl(lerPrimaria()));
    obs.observe(alvo, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    return () => obs.disconnect();
  }, []);

  /** `cor()` é a cor cheia; `cor(0.45)` é a mesma cor com transparência. */
  const cor = (alpha?: number) => (alpha == null ? `hsl(${hsl})` : `hsl(${hsl} / ${alpha})`);
  return { hsl, cor };
}
