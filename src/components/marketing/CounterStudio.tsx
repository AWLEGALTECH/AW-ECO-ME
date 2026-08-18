import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Play, Download, Film, Images, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { zipStore, type ArquivoZip } from "@/lib/zipStore";
import {
  CONFIG_PADRAO, FPS, desenharQuadro, formatarValor, totalDeQuadros, valorEm,
  type ConfigCounter, type FormatoNumero,
} from "@/lib/animacoes/counter";

const FORMATOS: { k: FormatoNumero; label: string; exemplo: string }[] = [
  { k: "numero", label: "Número", exemplo: "1.250" },
  { k: "dinheiro", label: "Dinheiro", exemplo: "R$ 1.250" },
  { k: "percentual", label: "Percentual", exemplo: "1.250%" },
];

const CORES_NUMERO = [
  { cor: "#22C55E", nome: "Verde" },
  { cor: "#EF4444", nome: "Vermelho" },
  { cor: "#FFFFFF", nome: "Branco" },
  { cor: "#0B0B0F", nome: "Preto" },
  { cor: "#FACC15", nome: "Amarelo" },
];

const FUNDOS = [
  { cor: "#0B0B0F", nome: "Preto" },
  { cor: "#FFFFFF", nome: "Branco" },
  { cor: "#00B140", nome: "Verde chroma" },
  { cor: "#7C3AED", nome: "Roxo AW" },
];

const FORMATOS_TELA = [
  { l: 1080, a: 1080, nome: "Quadrado" },
  { l: 1080, a: 1920, nome: "Vertical" },
  { l: 1920, a: 1080, nome: "Horizontal" },
];

// Rótulo + controle, repetido o suficiente pra valer um componente.
function Campo({ label, dica, children }: { label: string; dica?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
      {dica && <p className="text-[10.5px] text-muted-foreground/80 leading-snug">{dica}</p>}
    </div>
  );
}

function Pastilha({ ativo, onClick, children, cor }: {
  ativo: boolean; onClick: () => void; children: React.ReactNode; cor?: string;
}) {
  return (
    <button onClick={onClick}
      className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] ring-1 transition-colors",
        ativo ? "bg-primary/15 text-primary ring-primary/35"
          : "text-muted-foreground ring-white/[0.08] hover:bg-white/[0.05] hover:text-foreground")}>
      {cor && <span className="h-3 w-3 rounded-full ring-1 ring-white/20 shrink-0" style={{ background: cor }} />}
      {children}
    </button>
  );
}

export function CounterStudio() {
  const [cfg, setCfg] = useState<ConfigCounter>(CONFIG_PADRAO);
  const [tocando, setTocando] = useState(false);
  const [exportando, setExportando] = useState<{ feito: number; total: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inicioRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  const mudar = <K extends keyof ConfigCounter>(k: K, v: ConfigCounter[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  const pintar = useCallback((t: number) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d", { alpha: true });
    if (ctx) desenharQuadro(ctx, cfg, t);
  }, [cfg]);

  // Parado, mostra o quadro final: é o número que interessa conferir.
  useEffect(() => { if (!tocando) pintar(1); }, [pintar, tocando]);

  useEffect(() => {
    if (!tocando) return;
    inicioRef.current = performance.now();
    const passo = (agora: number) => {
      const t = (agora - inicioRef.current) / (cfg.duracao * 1000);
      pintar(Math.min(t, 1));
      if (t < 1) rafRef.current = requestAnimationFrame(passo);
      else setTocando(false);
    };
    rafRef.current = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tocando, cfg.duracao, pintar]);

  const baixar = (blob: Blob, nome: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const baseNome = () =>
    `counter-${formatarValor(cfg.valorFinal, cfg).replace(/[^0-9A-Za-z-]/g, "") || "0"}-${cfg.largura}x${cfg.altura}`;

  /** Vídeo: rápido e um arquivo só, mas sem transparência (ver aviso na tela). */
  const exportarVideo = async () => {
    const cv = canvasRef.current;
    if (!cv) return;
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
      .find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) { toast.error("Este navegador não grava vídeo. Use a sequência PNG."); return; }

    const ctx = cv.getContext("2d", { alpha: true });
    if (!ctx) return;
    setExportando({ feito: 0, total: totalDeQuadros(cfg) });

    const stream = cv.captureStream(FPS);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
    const pedacos: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data); };
    const fim = new Promise<void>((r) => { rec.onstop = () => r(); });
    rec.start();

    // Toca em tempo real: o captureStream puxa o que estiver pintado, então a
    // gravação precisa acompanhar o relógio, não um laço apertado.
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const passo = (agora: number) => {
        const t = (agora - t0) / (cfg.duracao * 1000);
        desenharQuadro(ctx, cfg, Math.min(t, 1));
        setExportando({ feito: Math.round(Math.min(t, 1) * totalDeQuadros(cfg)), total: totalDeQuadros(cfg) });
        if (t < 1) requestAnimationFrame(passo);
        else resolve();
      };
      requestAnimationFrame(passo);
    });
    // Meio segundo a mais segurando o valor final: sem isso o vídeo corta no
    // instante em que o número assenta, que é justamente o quadro que se usa.
    await new Promise((r) => setTimeout(r, 500));

    rec.stop();
    await fim;
    setExportando(null);
    const blob = new Blob(pedacos, { type: mime });
    if (!blob.size) { toast.error("A gravação saiu vazia. Use a sequência PNG."); return; }
    baixar(blob, `${baseNome()}.webm`);
    toast.success("Vídeo baixado");
  };

  /** PNG: mais pesado, porém é o que leva transparência real pro editor. */
  const exportarPNG = async () => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext("2d", { alpha: true });
    if (!cv || !ctx) return;

    const total = totalDeQuadros(cfg);
    setExportando({ feito: 0, total });
    const arquivos: ArquivoZip[] = [];
    try {
      for (let i = 0; i < total; i++) {
        desenharQuadro(ctx, cfg, total === 1 ? 1 : i / (total - 1));
        const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, "image/png"));
        if (!blob) throw new Error("quadro vazio");
        arquivos.push({
          nome: `${baseNome()}-${String(i + 1).padStart(4, "0")}.png`,
          dados: new Uint8Array(await blob.arrayBuffer()),
        });
        setExportando({ feito: i + 1, total });
        // Devolve o fôlego pro navegador: sem isso a aba trava na exportação.
        if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      baixar(zipStore(arquivos), `${baseNome()}-png.zip`);
      toast.success(`${total} quadros baixados a ${FPS} fps`);
    } catch {
      toast.error("Não consegui gerar os quadros");
    } finally {
      setExportando(null);
      pintar(1);
    }
  };

  const ocupado = !!exportando;

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem] gap-4">
      {/* Prévia */}
      <div className="space-y-3">
        <div
          className="rounded-2xl ring-1 ring-white/[0.07] p-4 grid place-items-center overflow-hidden"
          // Xadrez atrás do canvas: sem ele, fundo transparente e fundo preto
          // ficam idênticos na tela e a pessoa exporta a coisa errada.
          style={{
            backgroundColor: "#141418",
            backgroundImage: cfg.fundo ? undefined
              : "linear-gradient(45deg,#22222a 25%,transparent 25%),linear-gradient(-45deg,#22222a 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#22222a 75%),linear-gradient(-45deg,transparent 75%,#22222a 75%)",
            backgroundSize: "20px 20px",
            backgroundPosition: "0 0,0 10px,10px -10px,-10px 0px",
          }}
        >
          <canvas
            ref={canvasRef}
            width={cfg.largura}
            height={cfg.altura}
            className="max-h-[52vh] w-auto max-w-full rounded-lg"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => setTocando(true)} disabled={tocando || ocupado}>
            <Play className="h-3.5 w-3.5 mr-1.5" /> {tocando ? "Tocando…" : "Reproduzir"}
          </Button>
          <Button size="sm" variant="outline" onClick={exportarVideo} disabled={ocupado}>
            <Film className="h-3.5 w-3.5 mr-1.5" /> Baixar vídeo
          </Button>
          <Button size="sm" variant="outline" onClick={exportarPNG} disabled={ocupado}>
            <Images className="h-3.5 w-3.5 mr-1.5" /> Baixar PNG
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCfg(CONFIG_PADRAO)} disabled={ocupado}
            className="text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Padrão
          </Button>

          {exportando && (
            <span className="inline-flex items-center gap-2 text-[11.5px] text-muted-foreground ml-auto">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              {exportando.feito} de {exportando.total} quadros
            </span>
          )}
        </div>

        {!cfg.fundo && (
          <p className="text-[11px] text-amber-300/90 leading-snug rounded-lg ring-1 ring-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
            Fundo transparente só sobrevive na <strong>sequência PNG</strong>. O navegador não grava
            canal alpha em vídeo, então o WebM sairia com o fundo preto. Se o editor precisa de vídeo,
            escolha o verde chroma e tire o fundo no key.
          </p>
        )}
      </div>

      {/* Controles */}
      <div className="space-y-4 rounded-2xl ring-1 ring-white/[0.07] bg-white/[0.02] p-4 h-fit">
        <Campo label="Valor final" dica="Aceita negativo. A contagem sai de zero até aqui.">
          <Input type="number" value={cfg.valorFinal} disabled={ocupado}
            onChange={(e) => mudar("valorFinal", Number(e.target.value) || 0)} className="h-8 text-[13px]" />
        </Campo>

        <Campo label="Formato">
          <div className="flex flex-wrap gap-1.5">
            {FORMATOS.map((f) => (
              <Pastilha key={f.k} ativo={cfg.formato === f.k} onClick={() => mudar("formato", f.k)}>
                {f.label}
              </Pastilha>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1.5">
            <Pastilha ativo={cfg.milhar} onClick={() => mudar("milhar", !cfg.milhar)}>Separador de milhar</Pastilha>
            <Pastilha ativo={cfg.sinalMais} onClick={() => mudar("sinalMais", !cfg.sinalMais)}>Sinal +</Pastilha>
            <Pastilha ativo={cfg.casas > 0} onClick={() => mudar("casas", cfg.casas > 0 ? 0 : 2)}>
              {cfg.casas > 0 ? "2 casas" : "Sem centavos"}
            </Pastilha>
          </div>
        </Campo>

        <Campo label="Cor do número">
          <div className="flex flex-wrap gap-1.5">
            {CORES_NUMERO.map((c) => (
              <Pastilha key={c.cor} cor={c.cor} ativo={cfg.corNumero.toUpperCase() === c.cor}
                onClick={() => mudar("corNumero", c.cor)}>
                {c.nome}
              </Pastilha>
            ))}
          </div>
          <input type="color" value={cfg.corNumero} disabled={ocupado}
            onChange={(e) => mudar("corNumero", e.target.value.toUpperCase())}
            className="mt-1.5 h-7 w-full rounded-md bg-transparent cursor-pointer" />
        </Campo>

        <Campo label="Fundo">
          <div className="flex flex-wrap gap-1.5">
            <Pastilha ativo={cfg.fundo === null} onClick={() => mudar("fundo", null)}>Transparente</Pastilha>
            {FUNDOS.map((f) => (
              <Pastilha key={f.cor} cor={f.cor} ativo={cfg.fundo?.toUpperCase() === f.cor}
                onClick={() => mudar("fundo", f.cor)}>
                {f.nome}
              </Pastilha>
            ))}
          </div>
          {cfg.fundo && (
            <input type="color" value={cfg.fundo} disabled={ocupado}
              onChange={(e) => mudar("fundo", e.target.value.toUpperCase())}
              className="mt-1.5 h-7 w-full rounded-md bg-transparent cursor-pointer" />
          )}
        </Campo>

        <Campo label="Proporção">
          <div className="flex flex-wrap gap-1.5">
            {FORMATOS_TELA.map((f) => (
              <Pastilha key={f.nome} ativo={cfg.largura === f.l && cfg.altura === f.a}
                onClick={() => setCfg((c) => ({ ...c, largura: f.l, altura: f.a }))}>
                {f.nome}
              </Pastilha>
            ))}
          </div>
        </Campo>

        <Campo label={`Duração · ${cfg.duracao.toFixed(1)}s`}>
          <Slider value={[cfg.duracao]} min={0.4} max={4} step={0.1} disabled={ocupado}
            onValueChange={([v]) => mudar("duracao", v)} />
        </Campo>

        <Campo label={`Tamanho do número · ${Math.round(cfg.tamanhoFonte * 100)}%`}
          dica="Número muito largo encolhe sozinho pra não encostar na borda.">
          <Slider value={[cfg.tamanhoFonte]} min={0.1} max={0.5} step={0.01} disabled={ocupado}
            onValueChange={([v]) => mudar("tamanhoFonte", v)} />
        </Campo>

        <div className="text-[10.5px] text-muted-foreground pt-1 border-t border-white/[0.06]">
          {totalDeQuadros(cfg)} quadros a {FPS} fps · valor no meio da animação:{" "}
          <span className="text-foreground/80">{formatarValor(valorEm(0.5, cfg), cfg)}</span>
        </div>
      </div>
    </div>
  );
}
