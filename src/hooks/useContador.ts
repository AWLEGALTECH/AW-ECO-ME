/* NÚMERO QUE SOBE ATÉ O VALOR, em vez de aparecer pronto.
 *
 * É o gesto que faz um painel parecer vivo sem custar nada de leitura: o olho
 * acompanha o número chegar e já sabe onde olhar. Curta (menos de um segundo),
 * com desaceleração no fim, e SÓ na montagem e quando o valor muda.
 *
 * Quem pediu movimento reduzido no sistema recebe o número direto. Animação
 * que ignora essa preferência não é detalhe estético, é acessibilidade.
 */
import { useEffect, useRef, useState } from "react";

const reduzido = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function useContador(alvo: number, duracaoMs = 850): number {
  const [valor, setValor] = useState(() => (reduzido() ? alvo : 0));
  const de = useRef(0);

  useEffect(() => {
    if (reduzido() || !Number.isFinite(alvo)) { setValor(alvo); return; }
    const inicio = performance.now();
    const origem = de.current;
    let raf = 0;
    const passo = (t: number) => {
      const p = Math.min(1, (t - inicio) / duracaoMs);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cúbico: chega rápido, assenta devagar
      const v = origem + (alvo - origem) * e;
      setValor(v);
      if (p < 1) raf = requestAnimationFrame(passo);
      else de.current = alvo;
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo, duracaoMs]);

  return valor;
}
