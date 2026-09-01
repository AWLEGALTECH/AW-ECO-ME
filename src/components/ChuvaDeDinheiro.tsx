// Chuva de moedas pra quando o alvará ou o acordo é pago.
//
// Começou como confete colorido — confete comemora aniversário; aqui o que
// aconteceu foi dinheiro entrando na conta. Aí virou nota verde mais moeda, e
// as notas, sendo retângulos coloridos girando, viraram confete de novo: de
// longe ninguém lê "cédula", lê "papel picado".
//
// Então ficou só a moeda. Círculo dourado é lido como dinheiro mesmo pequeno e
// mesmo de relance, que é o tempo que essa animação tem. Sem retângulo, sem
// verde, sem cor de festa.
//
// O que faz parecer moeda e não bolinha: ela GIRA no próprio eixo enquanto cai.
// O giro achata o círculo em elipse (|cos| do ângulo), e quando chega de perfil
// aparece a espessura — um traço claro no lugar do disco. É o mesmo movimento
// de uma moeda jogada pro alto.
//
// Escrito à mão em canvas, sem dependência nova. Some sozinha em dois segundos
// e meio e não deixa nada montado. Respeita prefers-reduced-motion — quem pediu
// menos movimento não vê nada, e a baixa acontece igual.

import { useEffect, useRef } from "react";

interface Moeda {
  x: number; y: number;
  vx: number; vy: number;
  giro: number; dGiro: number;
  fase: number; dFase: number;   // giro no próprio eixo: achata o disco
  raio: number;
  tom: number;                   // variação de ouro entre as moedas
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
    const moedas: Moeda[] = [];
    for (let i = 0; i < 54; i++) {
      moedas.push({
        x: Math.random() * L,
        y: -Math.random() * A * 0.9 - 40,
        vx: (Math.random() - 0.5) * 1.1,
        vy: 2.2 + Math.random() * 2.4,
        giro: Math.random() * Math.PI * 2,
        dGiro: (Math.random() - 0.5) * 0.05,
        fase: Math.random() * Math.PI * 2,
        dFase: 0.05 + Math.random() * 0.06,
        raio: 7 + Math.random() * 7,
        tom: Math.random(),
      });
    }

    let raf = 0;
    const inicio = performance.now();
    const DURACAO = 2600;

    /* O achatamento é feito com ELIPSE, não com ctx.scale.
       Com scale(1, achatado) a espessura do traço encolhe junto: a borda da
       moeda ia sumindo conforme ela virava, e de perfil não sobrava nada
       visível. Desenhando elipse de raio vertical r*achatado, o disco achata
       mas o contorno continua com a mesma espessura — que é como metal se
       comporta. */
    const desenhar = (r: number, achatado: number, tom: number) => {
      // ouro: mais claro no miolo, borda mais escura — sem isso o disco fica
      // chapado e volta a parecer bolinha de confete
      const face = `hsl(${44 + tom * 6} 90% ${58 + tom * 8}%)`;
      const borda = `hsl(${36 + tom * 4} 78% ${38 + tom * 6}%)`;
      // o brilho não pode subir muito de claridade: passou de ~72% a moeda de
      // perfil vira um risco BRANCO na tela, que é justamente o que fazia
      // pensar em confete
      const brilho = `hsl(${46 + tom * 4} 94% ${68 + tom * 6}%)`;

      // de perfil o disco some e sobra a espessura da moeda
      if (achatado < 0.12) {
        ctx.strokeStyle = brilho;
        ctx.lineWidth = Math.max(1.5, r * 0.2);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-r * 0.9, 0);
        ctx.lineTo(r * 0.9, 0);
        ctx.stroke();
        return;
      }

      const ry = r * achatado;

      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = borda;
      ctx.lineWidth = Math.max(1, r * 0.13);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.93, ry * 0.93, 0, 0, Math.PI * 2);
      ctx.stroke();

      // anel interno e um respingo de luz em cima à esquerda: é o que dá
      // relevo de metal em vez de círculo liso
      ctx.lineWidth = Math.max(1, r * 0.09);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.55, ry * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = brilho;
      ctx.globalAlpha *= 0.75;
      ctx.beginPath();
      ctx.ellipse(-r * 0.3, -ry * 0.32, r * 0.17, ry * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha /= 0.75;
    };

    const quadro = (t: number) => {
      const passado = t - inicio;
      ctx.clearRect(0, 0, L, A);
      // some só no fim, pra chuva não parecer fraca desde o começo
      const sumindo = passado > DURACAO * 0.72
        ? Math.max(0, 1 - (passado - DURACAO * 0.72) / (DURACAO * 0.28))
        : 1;

      for (const m of moedas) {
        m.vy += 0.06;                  // moeda é pesada: acelera mais que papel
        m.x += m.vx;                   // e cai reto, sem o bamboleio da folha
        m.y += m.vy;
        m.giro += m.dGiro;
        m.fase += m.dFase;

        // |cos| do ângulo de giro: 1 de frente, 0 de perfil
        const achatado = Math.abs(Math.cos(m.fase));

        ctx.save();
        ctx.globalAlpha = sumindo;
        ctx.translate(m.x, m.y);
        ctx.rotate(m.giro);
        desenhar(m.raio, achatado, m.tom);
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
