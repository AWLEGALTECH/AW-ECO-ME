// O ANEXO DENTRO DA BOLHA.
//
// Áudio, imagem, vídeo e documento. A estrutura é a do AW-ECO (o
// ChatMediaRenderer do João): uma peça só que decide a família do anexo e
// delega pro player certo, com lightbox na imagem e preview no documento.
//
// O QUE MUDOU NA VIAGEM. Lá o arquivo chega como base64 dentro da coluna
// `conteudo`: a mídia trafega pelo banco, a linha fica com megabytes e a tela
// precisou de um lazy-load por IntersectionObserver pra não travar abrindo a
// conversa. Aqui o webhook já grava o arquivo no bucket `wa-midia` e a linha
// guarda só o caminho — a bolha pede uma URL assinada e o peso nunca passa pelo
// Postgres. Some o lazy-load, some o `srcToBlob` de data URI, some o campo de
// 4KB truncado pela view.
//
// A cor também mudou: o AW-ECO é roxo por toda parte, aqui a bolha é neutra e
// o destaque é `primary`, usado só no que precisa ser tocado (o play, o
// progresso). Anexo é conteúdo, não botão de ação — se ele brilhar mais que a
// mensagem, a conversa vira vitrine.

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Download, Eye, FileText, ImageOff, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMidiaUrl } from "@/hooks/useWhatsapp";
import {
  familiaDaMidia, extensaoDe, nomeDoArquivo, duracaoExibida, progressoDoAudio, barrasDoAudio,
  type Familia,
} from "@/lib/midiaMensagem";
import { duracaoCurta } from "@/lib/wa";

export interface MidiaProps {
  /** id da mensagem — semente da silhueta do áudio */
  id: string;
  tipo: string | null;
  path: string | null;
  mime: string | null;
  nome: string | null;
  /** segundos, como a Evolution mandou; salva o player quando o opus não diz */
  duracao: number | null;
  /** mensagem nossa (sai da direita) — muda só o contraste do chrome */
  nossa: boolean;
}

/* ────────────────────────── baixar ────────────────────────── */

/**
 * Baixa o arquivo de verdade em vez de abrir numa aba.
 *
 * `<a download>` apontando pra outro domínio é ignorado pelo navegador — o
 * atributo só vale na mesma origem, e a URL assinada do Storage é de outra.
 * Sem passar pelo blob, clicar em "baixar" abriria o PDF numa aba nova, que é
 * o comportamento que a pessoa não pediu.
 */
async function baixar(url: string, nome: string) {
  try {
    const blob = await (await fetch(url)).blob();
    const objeto = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objeto;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objeto), 10_000);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/* ────────────────────────── áudio ────────────────────────── */

function Audio({ url, id, duracao, nossa }: { url: string; id: string; duracao: number | null; nossa: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const quadro = useRef<number | null>(null);
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(0);
  const [doElemento, setDoElemento] = useState<number | null>(null);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const lerDuracao = () => setDoElemento(a.duration);
    const tocou = () => setTocando(true);
    const pausou = () => setTocando(false);
    const acabou = () => { setTocando(false); setAtual(0); };
    lerDuracao();
    a.addEventListener("loadedmetadata", lerDuracao);
    a.addEventListener("durationchange", lerDuracao);
    a.addEventListener("play", tocou);
    a.addEventListener("pause", pausou);
    a.addEventListener("ended", acabou);
    return () => {
      a.removeEventListener("loadedmetadata", lerDuracao);
      a.removeEventListener("durationchange", lerDuracao);
      a.removeEventListener("play", tocou);
      a.removeEventListener("pause", pausou);
      a.removeEventListener("ended", acabou);
    };
  }, []);

  // O tempo anda por requestAnimationFrame e não por `timeupdate`: o evento
  // nativo dispara a cada ~250ms e a barrinha anda aos trancos.
  useEffect(() => {
    if (!tocando) {
      if (quadro.current) cancelAnimationFrame(quadro.current);
      quadro.current = null;
      return;
    }
    const passo = () => {
      const a = ref.current;
      if (a) setAtual(a.currentTime);
      quadro.current = requestAnimationFrame(passo);
    };
    quadro.current = requestAnimationFrame(passo);
    return () => { if (quadro.current) cancelAnimationFrame(quadro.current); };
  }, [tocando]);

  const pct = progressoDoAudio(atual, doElemento, duracao);
  const total = duracaoExibida(doElemento, duracao);
  const barras = barrasDoAudio(id);

  function alternar() {
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  }

  function procurar(e: React.MouseEvent<HTMLDivElement>) {
    const a = ref.current;
    if (!a) return;
    // O clique só sabe onde cair se a duração for conhecida — com opus sem
    // cabeçalho, a do elemento é Infinity e a gravada é a única utilizável.
    const t = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : Number(duracao);
    if (!Number.isFinite(t) || t <= 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * t;
    setAtual(a.currentTime);
  }

  return (
    <div className="flex items-center gap-2.5 min-w-[190px] max-w-[250px] py-0.5">
      <audio ref={ref} src={url} preload="metadata" />
      <button
        type="button"
        onClick={alternar}
        aria-label={tocando ? "Pausar áudio" : "Tocar áudio"}
        className="h-8 w-8 rounded-full grid place-items-center shrink-0 transition-colors bg-primary/15 text-primary hover:bg-primary/25"
      >
        {tocando ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-[1px]" />}
      </button>

      <div className="flex-1 min-w-0">
        {/* As barras SÃO a barra de progresso: as que já passaram acendem.
            Uma barra lisa por cima das barrinhas seria o mesmo dado desenhado
            duas vezes. */}
        <div className="flex items-end gap-[2px] h-6 cursor-pointer" onClick={procurar}>
          {barras.map((altura, i) => {
            const passou = (i / barras.length) * 100 <= pct;
            return (
              <span
                key={i}
                style={{ height: `${Math.round(altura * 100)}%` }}
                className={cn(
                  "flex-1 rounded-full transition-colors",
                  passou ? "bg-primary/70" : nossa ? "bg-white/25" : "bg-white/15",
                )}
              />
            );
          })}
        </div>
        {/* Só o número. O ícone de microfone que o WhatsApp põe aqui, nesse
            tamanho e nesse contraste, vira sujeira — e a bolha já é
            reconhecível como áudio pelo play e pelas barras. */}
        <div className="flex justify-end mt-0.5">
          <span className="text-[9.5px] tabular-nums text-muted-foreground/70">
            {tocando || atual > 0 ? duracaoCurta(atual) : (total ?? "")}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── imagem ────────────────────────── */

function Imagem({ url, nome }: { url: string; nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [quebrou, setQuebrou] = useState(false);

  if (quebrou) {
    return (
      <button
        type="button"
        onClick={() => baixar(url, nome)}
        className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] transition-colors text-[11.5px]"
      >
        <ImageOff className="h-4 w-4 opacity-60" />
        Baixar imagem
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setZoom(1); setAberto(true); }}
        className="block rounded-lg overflow-hidden group relative"
      >
        <img
          src={url}
          alt="Imagem enviada na conversa"
          loading="lazy"
          onError={() => setQuebrou(true)}
          className="max-w-[240px] max-h-[260px] object-cover cursor-zoom-in transition-transform group-hover:scale-[1.01]"
        />
        <span className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-lg pointer-events-none" />
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-[94vw] w-[94vw] h-[88vh] p-0 gap-0 flex flex-col overflow-hidden bg-black/95 border-white/10">
          <DialogTitle className="sr-only">{nome}</DialogTitle>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 shrink-0 pr-12">
            <span className="text-[11px] text-white/60 tabular-nums w-12">{Math.round(zoom * 100)}%</span>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white hover:bg-white/10"
              onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>−</Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-white hover:bg-white/10"
              onClick={() => setZoom(1)}>1:1</Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-white hover:bg-white/10"
              onClick={() => setZoom((z) => Math.min(5, z + 0.25))}>+</Button>
            <Button size="sm" variant="outline" className="h-7 text-[11px] ml-auto"
              onClick={() => baixar(url, nome)}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Baixar
            </Button>
          </div>
          <div className="flex-1 overflow-auto grid place-items-center p-4">
            <img
              src={url}
              alt={nome}
              style={{ transform: `scale(${zoom})` }}
              className="max-w-none origin-center transition-transform duration-150"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ────────────────────────── vídeo ────────────────────────── */

function Video({ url }: { url: string }) {
  // `controls` nativo de propósito: player de vídeo caseiro custa tela cheia,
  // volume, legenda e teclado, e o do navegador já traz tudo isso funcionando.
  return (
    <video
      src={url}
      controls
      preload="metadata"
      className="rounded-lg max-w-[240px] max-h-[260px] ring-1 ring-white/10"
    />
  );
}

/* ────────────────────────── documento ────────────────────────── */

const COR_EXT: Record<string, string> = {
  pdf: "text-red-400",
  doc: "text-blue-400", docx: "text-blue-400",
  xls: "text-emerald-400", xlsx: "text-emerald-400", csv: "text-emerald-400",
  zip: "text-amber-400", rar: "text-amber-400",
};

function Documento({ url, nome, mime, path }: { url: string; nome: string; mime: string | null; path: string | null }) {
  const [aberto, setAberto] = useState(false);
  const ext = extensaoDe(nome, mime, path);
  // Só o PDF abre embutido; o navegador não renderiza .docx nem .xlsx num
  // iframe, e um preview em branco é pior que nenhum botão de preview.
  const temPreview = ext === "pdf";

  return (
    <>
      <div className="flex items-center gap-2.5 min-w-[200px] max-w-[270px] px-2.5 py-2 rounded-lg bg-white/[0.05] ring-1 ring-white/[0.07]">
        <div className="h-9 w-9 rounded-lg grid place-items-center shrink-0 bg-white/[0.06]">
          <FileText className={cn("h-4 w-4", COR_EXT[ext] || "text-foreground/70")} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium truncate" title={nome}>{nome}</p>
          {ext && <p className="text-[9.5px] uppercase tracking-wider text-muted-foreground/60 mt-0.5">{ext}</p>}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {temPreview && (
            <button type="button" title="Visualizar" onClick={() => setAberto(true)}
              className="h-7 w-7 rounded-full grid place-items-center hover:bg-white/[0.12] transition-colors">
              <Eye className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" title="Baixar" onClick={() => baixar(url, nome)}
            className="h-7 w-7 rounded-full grid place-items-center hover:bg-white/[0.12] transition-colors">
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-[94vw] w-[94vw] h-[88vh] p-0 gap-0 flex flex-col overflow-hidden [&>*]:min-w-0">
          <DialogTitle className="sr-only">{nome}</DialogTitle>
          <div className="flex items-center gap-2 px-4 py-2.5 border-b shrink-0 pr-12">
            <span className="text-[12.5px] font-medium truncate">{nome}</span>
            <Button size="sm" variant="outline" className="h-7 text-[11px] ml-auto shrink-0"
              onClick={() => baixar(url, nome)}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Baixar
            </Button>
          </div>
          {aberto && <iframe src={url} title={nome} className="w-full flex-1 border-0" />}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ────────────────────────── a peça ────────────────────────── */

const ESQUELETO: Record<Familia, string> = {
  audio: "h-9 w-[210px]",
  imagem: "h-[150px] w-[210px]",
  video: "h-[150px] w-[210px]",
  documento: "h-[52px] w-[220px]",
  texto: "h-5 w-24",
};

export function MidiaMensagem({ id, tipo, path, mime, nome, duracao, nossa }: MidiaProps) {
  const familia = familiaDaMidia(tipo, mime);
  const { data: url, isLoading } = useMidiaUrl(path);

  if (familia === "texto" || !path) return null;

  if (isLoading) {
    return <div className={cn("rounded-lg bg-white/[0.06] animate-pulse", ESQUELETO[familia])} />;
  }

  // A URL assinada não saiu (link expirado, arquivo removido, sem permissão no
  // bucket). Dizer que o anexo existe e não abriu é honesto; sumir com ele
  // faria a conversa parecer completa quando não está.
  if (!url) {
    return (
      <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground/80 py-1">
        <Loader2 className="h-3.5 w-3.5 shrink-0" />
        Anexo indisponível
      </div>
    );
  }

  const arquivo = nomeDoArquivo(familia, nome, mime, path);

  switch (familia) {
    case "audio":     return <Audio url={url} id={id} duracao={duracao} nossa={nossa} />;
    case "imagem":    return <Imagem url={url} nome={arquivo} />;
    case "video":     return <Video url={url} />;
    case "documento": return <Documento url={url} nome={arquivo} mime={mime} path={path} />;
    default:          return null;
  }
}
