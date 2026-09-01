// Chuva de dinheiro pra quando o alvará ou o acordo é pago.
//
// Era confete colorido. Confete comemora aniversário; aqui o que aconteceu foi
// dinheiro entrando na conta, e a animação devia dizer isso sem ninguém
// precisar ler a mensagem.
//
// São cédulas e moedas caindo do alto — nota verde com a faixa clara no meio,
// moeda dourada com o anel. Elas giram nos dois eixos enquanto caem: o giro no
// eixo vertical achata a nota periodicamente, que é o que faz papel parecer
// papel em vez de retângulo deslizando.
//
// Escrito à mão em canvas, sem dependência nova. Some sozinha em dois segundos
// e meio e não deixa nada montado. Respeita prefers-reduced-motion — quem pediu
// menos movimento não vê nada, e a baixa acontece igual.

import { useEffect, useRef } from "react";

interface Peca {
  x: number; y: number;
  vx: number; vy: number;
  giro: number; dGiro: number;
  fase: number; dFase: number;   // giro no eixo vertical: achata a peça
  larg: number;
  moeda: boolean;
  tom: number;                   // variação de verde entre as notas
}

export function ChuvaDeDinheiro({ ativo, onFim }: { ativo: boolean; onFim?: () => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!ativo) return;
    const canvas = ref.current;
    if (!canvas) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { onFim?.(); return; }
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

    // Caem de cima, espalhadas na largura toda e escalonadas acima da tela pra
    // a chuva entrar em cascata em vez de tudo aparecer de uma vez.
    const pecas: Peca[] = [];
    for (let i = 0; i < 46; i++) {
      const moeda = i % 5 === 0;
      pecas.push({
        x: Math.random() * L,
        y: -Math.random() * A * 0.9 - 40,
        vx: (Math.random() - 0.5) * 1.4,
        vy: 2 + Math.random() * 2.4,
        giro: Math.random() * Math.PI * 2,
        dGiro: (Math.random() - 0.5) * 0.06,
        fase: Math.random() * Math.PI * 2,
        dFase: 0.04 + Math.random() * 0.05,
        larg: moeda ? 13 + Math.random() * 7 : 26 + Math.random() * 16,
        moeda,
        tom: Math.random(),
      });
    }

    let raf = 0;
    const inicio = performance.now();
    const DURACAO = 2600;

    const nota = (w: number, achatado: number, tom: number) => {
      const h = w * 0.46;
      // verde de cédula, variando um pouco entre as notas
      const esc = `hsl(${146 + tom * 12} 52% ${34 + tom * 8}%)`;
      const cla = `hsl(${150 + tom * 10} 46% ${62 + tom * 8}%)`;
      ctx.fillStyle = esc;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      // faixa clara no miolo — o que faz o olho ler "nota" e não "retângulo"
      ctx.fillStyle = cla;
      ctx.globalAlpha *= 0.55;
      ctx.fillRect(-w / 2 + w * 0.12, -h / 2 + h * 0.22, w * 0.76, h * 0.56);
      ctx.globalAlpha /= 0.55;
      // vinco vertical: some quando a nota está de perfil
      if (achatado > 0.35) {
        ctx.strokeStyle = "hsla(0,0%,100%,0.28)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -h / 2 + 1);
        ctx.lineTo(0, h / 2 - 1);
        ctx.stroke();
      }
    };

    const moeda = (r: number) => {
      ctx.fillStyle = "hsl(43 88% 55%)";
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "hsl(38 80% 40%)";
      ctx.lineWidth = Math.max(1, r * 0.16);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2);
      ctx.stroke();
    };

    const quadro = (t: number) => {
      const passado = t - inicio;
      ctx.clearRect(0, 0, L, A);
      // some só no fim, pra chuva não parecer fraca desde o começo
      const sumindo = passado > DURACAO * 0.72
        ? Math.max(0, 1 - (passado - DURACAO * 0.72) / (DURACAO * 0.28))
        : 1;

      for (const p of pecas) {
        p.vy += 0.05;                    // aceleração leve
        p.x += p.vx + Math.sin(p.fase) * 0.8;   // bamboleio do papel
        p.y += p.vy;
        p.giro += p.dGiro;
        p.fase += p.dFase;

        // |cos| do ângulo de perfil: 1 de frente, 0 de lado
        const achatado = Math.abs(Math.cos(p.fase));

        ctx.save();
        ctx.globalAlpha = sumindo;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.giro);
        ctx.scale(1, Math.max(0.12, achatado));
        if (p.moeda) moeda(p.larg / 2); else nota(p.larg, achatado, p.tom);
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
  return <canvas ref={ref} aria-hidden className="fixed inset-0 z-[100] pointer-events-none" />;
}
