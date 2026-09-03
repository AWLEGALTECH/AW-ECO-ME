// GRAVAR O ÁUDIO DA RESPOSTA.
//
// Estrutura do AudioRecorder do AW-ECO: MediaRecorder, canvas com a onda ao
// vivo, cronômetro, e os dois botões que importam — cancelar e enviar. Sem
// esses dois, gravação vira armadilha: quem começou sem querer não tem saída
// que não seja mandar.
//
// TRÊS COISAS MUDARAM NA VIAGEM.
//
// A dependência `fix-webm-duration` saiu. O MediaRecorder fecha o webm sem
// escrever a duração no cabeçalho, e por isso o player do outro lado mostra
// "Infinity". Lá isso se resolve remendando os bytes do arquivo com uma
// biblioteca; aqui o cronômetro já sabe quantos segundos passaram — a duração
// viaja como número junto da mensagem e o player usa esse número quando o
// arquivo não diz (src/lib/midiaMensagem.ts, `duracaoExibida`). Um pacote a
// menos pra sustentar e o mesmo resultado na tela.
//
// Os `console.log` de sessão saíram. Eles existem lá porque o gravador teve bug
// de chunk vazando entre gravações; a proteção contra isso (dados no closure da
// sessão, nunca em ref) veio junto e é o que realmente importa — o log era o
// andaime da investigação, não a peça.
//
// E a largura da barra da onda virou divisão exata. No original ela é
// `(largura / barras) * 1.6`: a soma passa da largura do canvas, metade das
// barras cai fora e o canvas corta — a onda que se vê é sempre só a parte
// grave do espectro.

import { useEffect, useRef, useState } from "react";
import { Mic, Square, X, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  /** recebe o áudio e a duração medida pelo cronômetro, em segundos */
  onEnviar: (audio: Blob, segundos: number) => Promise<void>;
  onGravandoChange?: (gravando: boolean) => void;
  disabled?: boolean;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function GravadorDeAudio({ onEnviar, onGravandoChange, disabled }: Props) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [enviando, setEnviando] = useState(false);

  const gravador = useRef<MediaRecorder | null>(null);
  const trilha = useRef<MediaStream | null>(null);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);
  const analisador = useRef<AnalyserNode | null>(null);
  const tela = useRef<HTMLCanvasElement | null>(null);
  const quadro = useRef<number>(0);
  const cancelado = useRef(false);

  // Sair da tela com o microfone ligado deixa a luzinha acesa no computador da
  // pessoa. Desligar na desmontagem não é higiene de código, é constrangimento.
  useEffect(() => () => {
    if (relogio.current) clearInterval(relogio.current);
    if (quadro.current) cancelAnimationFrame(quadro.current);
    trilha.current?.getTracks().forEach((t) => t.stop());
  }, []);

  function desenharOnda() {
    const passo = () => {
      const c = tela.current, a = analisador.current;
      if (!c || !a) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const dados = new Uint8Array(a.frequencyBinCount);
      a.getByteFrequencyData(dados);
      ctx.clearRect(0, 0, c.width, c.height);
      const larg = c.width / dados.length;
      const cor = getComputedStyle(c).color;
      ctx.fillStyle = cor;
      let x = 0;
      for (let i = 0; i < dados.length; i++) {
        const alt = (dados[i] / 255) * c.height;
        ctx.fillRect(x, c.height - alt, Math.max(1, larg - 1), alt);
        x += larg;
      }
      quadro.current = requestAnimationFrame(passo);
    };
    passo();
  }

  async function comecar() {
    // Restos de uma gravação anterior derrubam a próxima em silêncio.
    if (gravador.current && gravador.current.state !== "inactive") {
      try { gravador.current.stop(); } catch { /* já parou */ }
    }
    trilha.current?.getTracks().forEach((t) => t.stop());
    gravador.current = null;
    cancelado.current = false;
    setSegundos(0);
    setEnviando(false);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Negar o microfone é uma escolha legítima; o que não pode é a tela ficar
      // parecendo travada depois do clique.
      onGravandoChange?.(false);
      return;
    }
    trilha.current = stream;

    const ctx = new AudioContext();
    const a = ctx.createAnalyser();
    a.fftSize = 128;
    ctx.createMediaStreamSource(stream).connect(a);
    analisador.current = a;

    // Safari no iPhone não grava webm — cai pra mp4/aac.
    const webm = "audio/webm;codecs=opus";
    const mp4 = "audio/mp4";
    const mime = MediaRecorder.isTypeSupported(webm) ? webm
      : MediaRecorder.isTypeSupported(mp4) ? mp4 : "";
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);

    // Os pedaços vivem no closure DESTA gravação, não numa ref. Ref é
    // compartilhada entre gravações, e a que sobrou da anterior entra colada na
    // seguinte — o áudio sai com o começo de outro assunto.
    const pedacos: Blob[] = [];
    const inicio = Date.now();
    rec.ondataavailable = (e) => { if (e.data.size > 0) pedacos.push(e.data); };

    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (cancelado.current) { setEnviando(false); return; }

      const blob = new Blob(pedacos, { type: rec.mimeType || "audio/webm" });
      if (blob.size === 0) { setEnviando(false); return; }

      setEnviando(true);
      try {
        await onEnviar(blob, Math.max(1, Math.round((Date.now() - inicio) / 1000)));
      } finally {
        setEnviando(false);
      }
    };

    rec.start(250);
    gravador.current = rec;
    setGravando(true);
    onGravandoChange?.(true);
    relogio.current = setInterval(() => setSegundos((s) => s + 1), 1000);
    desenharOnda();
  }

  function pararRelogios() {
    if (relogio.current) { clearInterval(relogio.current); relogio.current = null; }
    if (quadro.current) { cancelAnimationFrame(quadro.current); quadro.current = 0; }
    setGravando(false);
    onGravandoChange?.(false);
    setSegundos(0);
  }

  function cancelar() {
    // A bandeira sobe ANTES do stop: é o onstop que decide jogar fora.
    cancelado.current = true;
    pararRelogios();
    if (gravador.current && gravador.current.state !== "inactive") {
      try { gravador.current.stop(); } catch { /* já parou */ }
    }
    trilha.current?.getTracks().forEach((t) => t.stop());
  }

  function mandar() {
    const rec = gravador.current;
    if (!rec || rec.state === "inactive") { pararRelogios(); return; }
    cancelado.current = false;
    pararRelogios();
    try { rec.stop(); } catch { trilha.current?.getTracks().forEach((t) => t.stop()); }
  }

  if (gravando) {
    return (
      <div className="flex items-center gap-2 flex-1 min-w-0 rounded-lg bg-destructive/10 px-2.5 h-9">
        <Square className="h-2.5 w-2.5 shrink-0 fill-destructive text-destructive animate-pulse" />
        <span className="text-[11px] font-medium text-destructive tabular-nums shrink-0">{mmss(segundos)}</span>
        {/* Tamanho fixo: com `flex-1` o elemento canvas estica e o desenho de
            22px de altura é ampliado junto, transbordando a faixa. */}
        <canvas ref={tela} width={104} height={20}
          className="shrink-0 h-5 w-[104px] text-destructive/70" />
        <button type="button" onClick={cancelar} title="Descartar"
          className="h-7 w-7 shrink-0 ml-auto rounded-full grid place-items-center text-destructive hover:bg-destructive/20 transition-colors">
          <X className="h-4 w-4" />
        </button>
        <Button size="sm" className="h-7 px-2.5 shrink-0" onClick={mandar}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm" variant="ghost" title="Gravar áudio"
      className={cn("h-9 w-9 p-0 shrink-0", enviando && "pointer-events-none")}
      onClick={comecar} disabled={disabled || enviando}
    >
      {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
    </Button>
  );
}
