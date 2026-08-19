import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Play, Download, Film, Images, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { zipStore, type ArquivoZip } from "@/lib/zipStore";
import {
  CONFIG_PADRAO, FPS_OPCOES, FONTES, desenharQuadro, formatarValor, tDoQuadro, tamanhoDaFonte,
  totalDeQuadros, valorEm,
  type ConfigCounter, type FonteKey, type FormatoNumero,
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

  const pintar = useCallback((t: number, tAnterior?: number) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d", { alpha: true });
    if (ctx) desenharQuadro(ctx, cfg, t, tAnterior);
  }, [cfg]);

  // Parado, mostra o quadro final: é o número que interessa conferir.
  useEffect(() => { if (!tocando) pintar(1, 1); }, [pintar, tocando]);

  // Tamanho realmente aplicado, pra tela poder dizer quando ele foi reduzido.
  const [medidas, setMedidas] = useState<{ px: number; reduzida: boolean } | null>(null);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d", { alpha: true });
    if (!ctx) return;
    const px = tamanhoDaFonte(ctx, cfg);
    setMedidas({ px: Math.round(px), reduzida: px < cfg.altura * cfg.tamanhoFonte - 0.5 });
  }, [cfg]);

  // A prévia inclui o tempo parado no fim, senão ela mostraria uma animação
  // mais curta do que o arquivo que vai ser baixado.
  useEffect(() => {
    if (!tocando) return;
    inicioRef.current = performance.now();
    const msContagem = cfg.duracao * 1000;
    const msTotal = msContagem + cfg.segurarFim * 1000;
    let anterior = 0;
    const passo = (agora: number) => {
      const decorrido = agora - inicioRef.current;
      const t = Math.min(decorrido / msContagem, 1);
      pintar(t, anterior);
      anterior = t;
      if (decorrido < msTotal) rafRef.current = requestAnimationFrame(passo);
      else setTocando(false);
    };
    rafRef.current = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tocando, cfg.duracao, cfg.segurarFim, pintar]);

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
    const total = totalDeQuadros(cfg);
    setExportando({ feito: 0, total });

    // Bitrate alto de propósito: o codificador do MediaRecorder trabalha em
    // tempo real e, com folga curta, come as bordas do número e mancha o fundo
    // chapado. Escala com a área, senão 1920x1080 receberia a mesma verba de um
    // quadrado bem menor.
    const taxa = Math.min(80_000_000, Math.round((cfg.largura * cfg.altura) / (1080 * 1080) * 40_000_000));

    const stream = cv.captureStream(cfg.fps);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: taxa });
    const pedacos: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) pedacos.push(e.data); };
    const fim = new Promise<void>((r) => { rec.onstop = () => r(); });
    rec.start();

    // Toca em tempo real: o captureStream puxa o que estiver pintado, então a
    // gravação precisa acompanhar o relógio, não um laço apertado.
    //
    // O trecho parado no fim REDESENHA o mesmo quadro a cada volta, em vez de
    // esperar com o canvas quieto. Canvas parado não emite quadro novo, então a
    // gravação terminava alguns quadros antes do valor assentar e o vídeo
    // fechava em 998.666 no lugar de 1.000.000.
    const msContagem = cfg.duracao * 1000;
    const msTotal = msContagem + cfg.segurarFim * 1000;
    const t0 = performance.now();
    let anterior = 0;
    await new Promise<void>((resolve) => {
      const passo = (agora: number) => {
        const decorrido = agora - t0;
        const t = Math.min(decorrido / msContagem, 1);
        desenharQuadro(ctx, cfg, t, anterior);
        anterior = t;
        setExportando({ feito: Math.min(total, Math.round((decorrido / msTotal) * total)), total });
        if (decorrido < msTotal) requestAnimationFrame(passo);
        else resolve();
      };
      requestAnimationFrame(passo);
    });

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
        desenharQuadro(ctx, cfg, tDoQuadro(i, cfg), tDoQuadro(i - 1, cfg));
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
      toast.success(`${total} quadros baixados a ${cfg.fps} fps`);
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

        <Campo label="Fonte" dica="Impact e Georgia dependem do sistema; se faltar, cai na alternativa da lista.">
          <div className="flex flex-wrap gap-1.5">
            {FONTES.map((f) => (
              <Pastilha key={f.k} ativo={cfg.fonte === f.k} onClick={() => mudar("fonte", f.k as FonteKey)}>
                <span style={{ fontFamily: f.css }}>{f.nome}</span>
              </Pastilha>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1.5">
            {[400, 700, 900].map((p) => (
              <Pastilha key={p} ativo={cfg.peso === p} onClick={() => mudar("peso", p)}>
                {p === 400 ? "Normal" : p === 700 ? "Negrito" : "Extra"}
              </Pastilha>
            ))}
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

        <Campo label="Manter o número no fim"
          dica="Depois de bater o alvo, o número fica parado por esse tempo. A animação vira: tempo de subida mais tempo parado.">
          <div className="flex flex-wrap gap-1.5">
            <Pastilha ativo={cfg.segurarFim > 0} onClick={() => mudar("segurarFim", cfg.segurarFim > 0 ? 0 : 0.6)}>
              {cfg.segurarFim > 0 ? "Mantendo" : "Não manter"}
            </Pastilha>
          </div>
          {cfg.segurarFim > 0 && (
            <div className="pt-1.5">
              <p className="text-[10.5px] text-muted-foreground mb-1">Por {cfg.segurarFim.toFixed(1)}s</p>
              <Slider value={[cfg.segurarFim]} min={0.1} max={5} step={0.1} disabled={ocupado}
                onValueChange={([v]) => mudar("segurarFim", v)} />
            </div>
          )}
        </Campo>

        <Campo label="Suavidade"
          dica="Contagem rápida pula milhares por quadro e o olho lê salto. O rastro guarda o caminho dentro de cada quadro, como obturador aberto.">
          <div className="flex flex-wrap gap-1.5">
            {FPS_OPCOES.map((f) => (
              <Pastilha key={f} ativo={cfg.fps === f} onClick={() => mudar("fps", f)}>{f} fps</Pastilha>
            ))}
            <Pastilha ativo={cfg.suavizar > 0} onClick={() => mudar("suavizar", cfg.suavizar > 0 ? 0 : 0.7)}>
              {cfg.suavizar > 0 ? "Com rastro" : "Sem rastro"}
            </Pastilha>
          </div>
          {cfg.suavizar > 0 && (
            <div className="pt-1.5">
              <p className="text-[10.5px] text-muted-foreground mb-1">Intensidade {Math.round(cfg.suavizar * 100)}%</p>
              <Slider value={[cfg.suavizar]} min={0.1} max={1} step={0.05} disabled={ocupado}
                onValueChange={([v]) => mudar("suavizar", v)} />
            </div>
          )}
        </Campo>

        <Campo label={`Tamanho do número · ${Math.round(cfg.tamanhoFonte * 100)}%`}
          dica="O tamanho é medido pelo valor final, então o número não encolhe ao ganhar dígitos.">
          <Slider value={[cfg.tamanhoFonte]} min={0.1} max={0.5} step={0.01} disabled={ocupado}
            onValueChange={([v]) => mudar("tamanhoFonte", v)} />
        </Campo>

        <div className="text-[10.5px] text-muted-foreground pt-1 border-t border-white/[0.06] space-y-1">
          <p>
            {totalDeQuadros(cfg)} quadros a {cfg.fps} fps ·{" "}
            {(cfg.duracao + cfg.segurarFim).toFixed(1)}s no total · valor na metade da contagem:{" "}
            <span className="text-foreground/80">{formatarValor(valorEm(0.5, cfg), cfg)}</span>
          </p>
          {/* O tamanho pedido nem sempre é o entregue, e esconder isso faria
              duas peças com o mesmo ajuste saírem com números de tamanhos
              diferentes sem explicação. */}
          {medidas && (
            <p className={cn(medidas.reduzida && "text-amber-300/80")}>
              Fonte final: {medidas.px}px
              {medidas.reduzida && " · reduzida para caber. Baixe o tamanho até sumir este aviso se precisar que várias peças fiquem iguais."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
