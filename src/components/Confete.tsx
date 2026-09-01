// Confete pra quando o dinheiro entra.
//
// Escrito à mão em vez de puxar uma biblioteca: são quarenta linhas de canvas,
// e uma dependência a mais no bundle pra comemorar duas vezes por semana não se
// paga. Some sozinho depois de dois segundos e não deixa nada montado.
//
// Respeita quem pediu menos movimento (prefers-reduced-motion): nesse caso não
// desenha nada. Comemoração não é motivo pra passar por cima de acessibilidade.

import { useEffect, useRef } from "react";

const CORES = ["#34d399", "#fbbf24", "#60a5fa", "#f472b6", "#a78bfa", "#ffffff"];

interface Particula {
  x: number; y: number; vx: number; vy: number;
  giro: number; dGiro: number; cor: string; lado: number;
}

export function Confete({ ativo, onFim }: { ativo: boolean; onFim?: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!ativo) return;
    const canvas = ref.current;
    if (!canvas) return;

    const menosMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (menosMovimento) { onFim?.(); return; }

    const ctx = canvas.getContext("2d");
    if (!ctx) { onFim?.(); return; }

    const dpr = window.devicePixelRatio || 1;
    const L = window.innerWidth;
    const A = window.innerHeight;
    canvas.width = L * dpr;
    canvas.height = A * dpr;
    canvas.style.width = `${L}px`;
    canvas.style.height = `${A}px`;
    ctx.scale(dpr, dpr);

    // Duas rajadas partindo das laterais, na altura do olho — no meio da tela
    // elas cobririam justamente o diálogo que a pessoa está lendo.
    const ps: Particula[] = [];
    for (const origem of [0, 1]) {
      const x0 = origem === 0 ? L * 0.08 : L * 0.92;
      for (let i = 0; i < 60; i++) {
        const angulo = (origem === 0 ? -0.9 : -2.25) + (Math.random() - 0.5) * 0.9;
        const forca = 9 + Math.random() * 9;
        ps.push({
          x: x0, y: A * 0.55,
          vx: Math.cos(angulo) * forca * (origem === 0 ? 1 : -1),
          vy: Math.sin(angulo) * forca,
          giro: Math.random() * Math.PI,
          dGiro: (Math.random() - 0.5) * 0.3,
          cor: CORES[Math.floor(Math.random() * CORES.length)],
          lado: 5 + Math.random() * 5,
        });
      }
    }

    let raf = 0;
    const inicio = performance.now();
    const DURACAO = 2200;

    const quadro = (t: number) => {
      const passado = t - inicio;
      ctx.clearRect(0, 0, L, A);
      const sumindo = Math.max(0, 1 - passado / DURACAO);

      for (const p of ps) {
        p.vy += 0.32;          // gravidade
        p.vx *= 0.99;          // ar
        p.x += p.vx;
        p.y += p.vy;
        p.giro += p.dGiro;

        ctx.save();
        ctx.globalAlpha = sumindo;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.giro);
        ctx.fillStyle = p.cor;
        ctx.fillRect(-p.lado / 2, -p.lado / 4, p.lado, p.lado / 2);
        ctx.restore();
      }

      if (passado < DURACAO) raf = requestAnimationFrame(quadro);
      else { ctx.clearRect(0, 0, L, A); onFim?.(); }
    };

    raf = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo]);

  if (!ativo) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="fixed inset-0 z-[100] pointer-events-none"
    />
  );
}
