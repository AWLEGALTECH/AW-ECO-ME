/* O RECORTE DA FOTO DE PERFIL, como no WhatsApp.
 *
 * A pessoa escolhe a imagem e cai aqui: a foto atrás de um círculo, dá para
 * arrastar com o dedo ou o mouse e aproximar com a roda, o beliscão ou o
 * controle embaixo. O que sai é um quadrado de 640px com exatamente o que
 * estava dentro do círculo, e é isso que vai para o WhatsApp.
 *
 * A conta (escala mínima, limite do arraste, retângulo do recorte) mora em
 * src/lib/recorteDeFoto.ts, com teste. Aqui é só o gesto e o desenho.
 *
 * POR QUE NÃO MANDAR A FOTO INTEIRA E DEIXAR O WHATSAPP CORTAR. Porque ele
 * corta no centro, sempre, e o rosto raramente está no centro de uma foto
 * tirada para outra coisa. A primeira foto que o chefe subiu entrou torta
 * justamente por isso.
 */
import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Check, Loader2, Move } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  limitarDeslocamento, posicaoNoQuadro, zoomValido, ZOOM_MINIMO, ZOOM_MAXIMO, LADO_DA_SAIDA,
  type Enquadramento,
} from "@/lib/recorteDeFoto";

const QUADRO = 280;

export function RecorteDeFoto({ arquivo, onConfirmar, onCancelar, ocupado }: {
  arquivo: File | Blob | null;
  onConfirmar: (recortada: Blob) => void | Promise<void>;
  onCancelar: () => void;
  ocupado?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [e, setE] = useState<Enquadramento>({ zoom: 1, dx: 0, dy: 0 });
  const [gerando, setGerando] = useState(false);
  const arraste = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const beliscao = useRef<number | null>(null);

  // A imagem carrega uma vez; a url é solta quando o arquivo troca ou o
  // diálogo fecha, senão cada foto escolhida vaza um blob na memória.
  useEffect(() => {
    if (!arquivo) { setUrl(null); setImg(null); return; }
    const u = URL.createObjectURL(arquivo);
    setUrl(u);
    setE({ zoom: 1, dx: 0, dy: 0 });
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = u;
    return () => URL.revokeObjectURL(u);
  }, [arquivo]);

  const largura = img?.naturalWidth ?? 1;
  const altura = img?.naturalHeight ?? 1;
  const aplicar = (n: Enquadramento) => setE(limitarDeslocamento(largura, altura, QUADRO, n));
  const pos = posicaoNoQuadro(largura, altura, QUADRO, e);

  /* ARRASTAR: o ponteiro segura a foto e ela vai junto. Pointer events cobrem
     mouse e dedo com o mesmo código, e `setPointerCapture` faz o arraste
     continuar mesmo quando o dedo sai do quadro no meio do gesto. */
  const iniciar = (ev: React.PointerEvent) => {
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    arraste.current = { x: ev.clientX, y: ev.clientY, dx: e.dx, dy: e.dy };
  };
  const mover = (ev: React.PointerEvent) => {
    const a = arraste.current;
    if (!a) return;
    aplicar({ zoom: e.zoom, dx: a.dx + (ev.clientX - a.x), dy: a.dy + (ev.clientY - a.y) });
  };
  const soltar = () => { arraste.current = null; };

  /* A RODA APROXIMA no ponto em que o ponteiro está, e não no centro: é o que
     faz "dar zoom no olho" funcionar em vez de empurrar o olho para fora. */
  const roda = (ev: React.WheelEvent) => {
    ev.preventDefault();
    const fator = ev.deltaY < 0 ? 1.08 : 1 / 1.08;
    const zoomNovo = zoomValido(e.zoom * fator);
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const px = ev.clientX - r.left - QUADRO / 2;
    const py = ev.clientY - r.top - QUADRO / 2;
    const k = zoomNovo / e.zoom;
    aplicar({ zoom: zoomNovo, dx: px - (px - e.dx) * k, dy: py - (py - e.dy) * k });
  };

  /* BELISCÃO no celular: dois dedos, a distância entre eles vira o zoom. */
  const toque = (ev: React.TouchEvent) => {
    if (ev.touches.length !== 2) { beliscao.current = null; return; }
    const [a, b] = [ev.touches[0], ev.touches[1]];
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (beliscao.current != null) {
      const zoomNovo = zoomValido(e.zoom * (d / beliscao.current));
      aplicar({ ...e, zoom: zoomNovo });
    }
    beliscao.current = d;
  };

  const confirmar = async () => {
    if (!img) return;
    setGerando(true);
    try {
      /* O canvas repete a tela: a mesma posição, multiplicada pela razão
         saída/quadro. Fundo escuro primeiro, porque com a foto recuada sobra
         quadro em volta, e JPEG não tem transparência para deixar aquilo
         "vazio": ficaria preto de qualquer jeito, então que seja de propósito
         e da mesma cor que a pessoa viu no recorte. */
      const k = LADO_DA_SAIDA / QUADRO;
      const tela = document.createElement("canvas");
      tela.width = LADO_DA_SAIDA;
      tela.height = LADO_DA_SAIDA;
      const ctx = tela.getContext("2d")!;
      ctx.fillStyle = "#0b0d10";
      ctx.fillRect(0, 0, LADO_DA_SAIDA, LADO_DA_SAIDA);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, pos.x * k, pos.y * k, pos.w * k, pos.h * k);
      // JPEG, e não WebP: é o que o WhatsApp aceita sem discutir para perfil.
      const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, "image/jpeg", 0.9));
      if (!blob) throw new Error("Não consegui gerar a imagem recortada.");
      await onConfirmar(blob);
    } finally {
      setGerando(false);
    }
  };

  const travado = !!ocupado || gerando;

  return (
    <Dialog open={!!arquivo} onOpenChange={(a) => { if (!a && !travado) onCancelar(); }}>
      <DialogContent className="sm:max-w-sm [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="text-[15px] flex items-center gap-2">
            <Move className="h-4 w-4 text-primary" /> Encaixar a foto
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            Arraste para posicionar; a roda, o beliscão e o controle aproximam ou recuam. O que estiver
            dentro do círculo é o que vai para o WhatsApp, e o que sobrar em volta fica escuro.
          </DialogDescription>
        </DialogHeader>

        <div className="grid place-items-center py-1">
          <div
            onPointerDown={iniciar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}
            onWheel={roda} onTouchMove={toque} onTouchEnd={() => { beliscao.current = null; }}
            style={{ width: QUADRO, height: QUADRO }}
            className="relative overflow-hidden rounded-xl bg-[#0b0d10] ring-1 ring-white/10 cursor-grab active:cursor-grabbing touch-none select-none"
          >
            {url && img && (
              <img
                src={url} alt="" draggable={false}
                style={{ width: pos.w, height: pos.h, transform: `translate(${pos.x}px, ${pos.y}px)` }}
                className="absolute left-0 top-0 max-w-none pointer-events-none"
              />
            )}
            {/* A MÁSCARA: tudo fora do círculo escurece, e o círculo fica limpo.
                É a mesma leitura do WhatsApp, e é o que faz a pessoa enxergar
                a bola de perfil antes de ela existir. */}
            <div className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(circle at center, transparent 49.5%, rgba(0,0,0,0.62) 50.5%)" }} />
            <div className="pointer-events-none absolute inset-[2px] rounded-full ring-2 ring-white/70" />
          </div>
        </div>

        <div className="flex items-center gap-2 px-1">
          <ZoomOut className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="range" min={ZOOM_MINIMO} max={ZOOM_MAXIMO} step={0.01} value={e.zoom}
            onChange={(ev) => aplicar({ ...e, zoom: Number(ev.target.value) })}
            className="flex-1 accent-[hsl(var(--primary))]"
            aria-label="Zoom"
          />
          <ZoomIn className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" disabled={travado} onClick={onCancelar}>Cancelar</Button>
          <Button size="sm" disabled={travado || !img} onClick={confirmar} className="gap-1.5">
            {travado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Usar esta foto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
