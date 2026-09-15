import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Volume2, Loader2, AlertTriangle, CheckCircle2, Info, ClipboardCopy, Play,
} from "lucide-react";
import {
  FORMATOS, suporteDe, lerAchados, resumoParaColar, bipeWav, ondeParou,
  eNativa, lerInterferencia,
  type Achados, type Suporte, type OQueOuviu, type Veredito, type Ambiente,
  type Interferencia,
} from "@/lib/diagnosticoSom";
import { tocarSomNotificacao } from "@/lib/som";

/* O TESTE DE SOM QUE RODA NA MÁQUINA DE QUEM ESTÁ RECLAMANDO.
 *
 * "Aqui não sai som" contra "aqui sai" é uma discussão sem fim, porque os dois
 * lados estão dizendo a verdade. Este painel troca a discussão por fatos
 * colhidos ali: o navegador sabe este formato, conseguiu decodificar este
 * arquivo, o relógio andou, o volume está aberto.
 *
 * A pergunta decisiva é a última: se o relógio andou e o volume está aberto, o
 * navegador ESTÁ tocando, e o som está saindo em outro lugar. Isso muda o que
 * a pessoa vai mexer, e é o que nenhum print de tela conta.
 */

const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };

const COR_SUPORTE: Record<Suporte, string> = {
  sim: "text-emerald-400",
  talvez: "text-amber-300",
  nao: "text-rose-400",
};
const TEXTO_SUPORTE: Record<Suporte, string> = { sim: "toca", talvez: "talvez", nao: "não toca" };

/** Um cartão de veredito. O mesmo desenho serve aos dois testes. */
function CartaoDoVeredito({ v, atraso = 0 }: { v: Veredito; atraso?: number }) {
  const Ico = v.gravidade === "erro" ? AlertTriangle : v.gravidade === "aviso" ? Info : CheckCircle2;
  const cor = v.gravidade === "erro" ? "border-rose-500/30 bg-rose-500/[0.06] text-rose-200"
    : v.gravidade === "aviso" ? "border-amber-400/30 bg-amber-400/[0.06] text-amber-100"
    : "border-emerald-500/25 bg-emerald-500/[0.05] text-emerald-100";
  return (
    <motion.div layout
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
      transition={{ ...MOLA, delay: atraso }}
      className={`rounded-lg border px-3 py-2.5 ${cor}`}>
      <p className="text-[12.5px] font-semibold flex items-start gap-2">
        <Ico className="h-4 w-4 shrink-0 mt-px" /> {v.titulo}
      </p>
      <p className="text-[11.5px] opacity-85 mt-1 leading-snug pl-6">{v.detalhe}</p>
      {v.passos.length > 0 && (
        <ol className="mt-1.5 pl-6 space-y-1">
          {v.passos.map((p, k) => (
            <li key={k} className="text-[11.5px] opacity-90 leading-snug flex gap-1.5">
              <span className="opacity-60 tabular-nums shrink-0">{k + 1}.</span>{p}
            </li>
          ))}
        </ol>
      )}
    </motion.div>
  );
}

/**
 * OS TRÊS SONS, um por caminho, com a pergunta logo depois de cada um.
 *
 * É a parte que faltava. O teste de cima mede o que a máquina RESPONDE; este
 * pergunta o que ela FEZ, porque só o ouvido de quem está lá sabe. E ele tem
 * que ser em voz alta: o teste antigo tocava o arquivo real no mudo, então
 * "o navegador está tocando" nunca passou por ouvido nenhum.
 *
 * A ordem importa e é crescente: cada som acrescenta UM pedaço de caminho ao
 * anterior. O primeiro que não sair aponta o pedaço que quebrou.
 */
function OsTresSons({ aoMudar, aoMedirInterferencia }: {
  aoMudar?: (o: OQueOuviu) => void;
  aoMedirInterferencia?: (i: Interferencia) => void;
}) {
  const [ouviu, setOuviu] = useState<OQueOuviu>({ bling: null, bipe: null, voz: null, video: null });
  const [tocandoQual, setTocandoQual] = useState<string | null>(null);
  const [urlDaVoz, setUrlDaVoz] = useState<string | null>(null);
  const [urlDoVideo, setUrlDoVideo] = useState<string | null>(null);
  const [semVoz, setSemVoz] = useState(false);
  const [semVideo, setSemVideo] = useState(false);
  const el = useRef<HTMLAudioElement | null>(null);

  const bipe = useMemo(() => bipeWav(), []);

  useEffect(() => () => { el.current?.pause(); }, []);
  useEffect(() => { aoMudar?.(ouviu); }, [ouviu, aoMudar]);

  /* A mídia mais recente de cada tipo, assinada na hora. Arquivo de exemplo
     não serviria: o que se testa é ESTE formato vindo DESTE servidor. */
  const pegarMidia = useCallback(async (tipo: "audio" | "video"): Promise<string | null> => {
    const guardada = tipo === "audio" ? urlDaVoz : urlDoVideo;
    if (guardada) return guardada;
    const avisarFalta = tipo === "audio" ? setSemVoz : setSemVideo;

    const { data: linha } = await (supabase.from("wa_mensagens" as never) as never as {
      select: (c: string) => any;
    }).select("midia_path")
      .eq("tipo", tipo).not("midia_path", "is", null)
      .order("criada_em", { ascending: false }).limit(1).maybeSingle();
    const caminho = (linha as { midia_path?: string } | null)?.midia_path;
    if (!caminho) { avisarFalta(true); return null; }

    const { data } = await supabase.storage.from("wa-midia").createSignedUrl(caminho, 300);
    const u = data?.signedUrl ?? null;
    if (!u) { avisarFalta(true); return null; }
    (tipo === "audio" ? setUrlDaVoz : setUrlDoVideo)(u);
    return u;
  }, [urlDaVoz, urlDoVideo]);

  const pegarVoz = useCallback(() => pegarMidia("audio"), [pegarMidia]);

  const tocarArquivo = useCallback(async (qual: "bipe" | "voz") => {
    setTocandoQual(qual);
    const url = qual === "bipe" ? bipe : await pegarVoz();
    if (!url) { setTocandoQual(null); return; }
    /* Um elemento por vez, criado na hora e sempre com volume aberto: o
       tocador da tela pode ter ficado com o volume mexido, e aqui isso seria
       justamente o que estamos tentando medir. */
    el.current?.pause();
    const a = new Audio(url);
    a.volume = 1;
    a.muted = false;
    el.current = a;
    /* QUEM MEXEU DEPOIS DE NÓS. Pedimos 1 aqui em cima; meio segundo depois,
       com o som já rodando, olhamos de novo. Elemento de áudio não muda o
       próprio volume, então qualquer diferença tem dono, e o dono costuma ser
       extensão do navegador. Meio segundo porque a injeção da extensão
       acontece no play, e não antes dele. */
    setTimeout(() => {
      aoMedirInterferencia?.({
        trocadas: funcoesTrocadas(),
        volumeDepois: a.volume,
        mudoDepois: a.muted,
      });
    }, 500);

    a.onended = () => setTocandoQual(null);
    a.onerror = () => {
      setTocandoQual(null);
      /* Nem chegou a tocar: isso já é a resposta, e perguntar "ouviu?" depois
         de um erro faria a pessoa responder por um som que nunca saiu. */
      setOuviu((o) => ({ ...o, [qual]: false }));
      toast.error(qual === "voz"
        ? "O navegador nem conseguiu abrir o áudio do cliente."
        : "O navegador nem conseguiu abrir o arquivo de teste.");
    };
    try { await a.play(); } catch { a.onerror?.(new Event("error")); }
  }, [bipe, pegarVoz]);

  const linhas = [
    {
      chave: "bling" as const,
      titulo: "1. O aviso de mensagem nova",
      abaixo: "Feito aqui dentro, sem arquivo e sem decodificador.",
      tocar: () => { setTocandoQual("bling"); tocarSomNotificacao(); setTimeout(() => setTocandoQual(null), 900); },
    },
    {
      chave: "bipe" as const,
      titulo: "2. Um bipe comum, em arquivo",
      abaixo: "Já é um arquivo, mas do tipo que todo navegador toca.",
      tocar: () => tocarArquivo("bipe"),
    },
    {
      chave: "voz" as const,
      titulo: "3. Um áudio de cliente de verdade",
      abaixo: "Vem do servidor, no formato do WhatsApp (Opus).",
      tocar: () => tocarArquivo("voz"),
    },
    {
      chave: "video" as const,
      titulo: "4. Um vídeo de verdade",
      abaixo: "Também do servidor, mas em MP4, que é outra família de formato.",
      /* O vídeo abre embaixo com os controles do navegador, e não num
         elemento invisível: metade do que pode estar errado com vídeo é o
         volume DO PRÓPRIO tocador, e isso só se vê olhando para ele. */
      tocar: async () => {
        setTocandoQual("video");
        const u = await pegarMidia("video");
        setTocandoQual(null);
        if (!u) return;
      },
    },
  ];

  /* As perguntas de arquivo do servidor só aparecem quando o bipe saiu: com o
     bipe mudo, a conclusão já está dada e perguntar mais não acrescenta nada. */
  const mostrarDoServidor = ouviu.bling !== null && ouviu.bipe === true;
  const veredito = ondeParou(ouviu);

  return (
    <div className="rounded-lg border border-border bg-white/[0.02] px-3 py-2.5 space-y-2">
      <div>
        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Ouça os três, nesta ordem
        </p>
        <p className="text-[11px] text-muted-foreground/80 leading-snug mt-0.5">
          Cada um usa um pedaço a mais do caminho. O primeiro que não sair diz onde o som morre.
          Suba o volume do computador antes.
        </p>
      </div>

      <LayoutGroupless>
        {linhas.map((l, i) => {
          const visivel = (l.chave !== "voz" && l.chave !== "video") || mostrarDoServidor;
          if (!visivel) return null;
          const resposta = ouviu[l.chave];
          return (
            <motion.div
              key={l.chave} layout
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ ...MOLA, delay: i * 0.05 }}
              className="flex flex-wrap items-center gap-2 py-1.5 border-t border-white/[0.05] first:border-t-0">
              <span className="min-w-0 flex-1">
                <span className="block text-[11.5px] font-medium">{l.titulo}</span>
                <span className="block text-[10px] text-muted-foreground leading-snug">{l.abaixo}</span>
              </span>

              <Button size="sm" variant="outline" className="h-7 text-[11px] shrink-0"
                onClick={l.tocar} disabled={tocandoQual === l.chave}>
                {tocandoQual === l.chave
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <><Play className="h-3.5 w-3.5 mr-1" /> Tocar</>}
              </Button>

              <span className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-muted-foreground/70 mr-0.5">Ouviu?</span>
                {([["Sim", true], ["Não", false]] as const).map(([rot, val]) => (
                  <button key={rot} type="button"
                    onClick={() => setOuviu((o) => ({ ...o, [l.chave]: val }))}
                    className={`rounded-full px-2 py-[3px] text-[10.5px] ring-1 transition-colors ${
                      resposta === val
                        ? val
                          ? "bg-emerald-400/15 text-emerald-300 ring-emerald-400/30"
                          : "bg-rose-400/15 text-rose-300 ring-rose-400/30"
                        : "bg-white/[0.04] text-muted-foreground ring-white/[0.08] hover:bg-white/[0.08]"
                    }`}>
                    {rot}
                  </button>
                ))}
              </span>
            </motion.div>
          );
        })}
      </LayoutGroupless>

      {/* O VÍDEO APARECE DE VERDADE, com os controles do navegador. O tocador
          de vídeo é do Chrome, não nosso, e ele guarda o volume que a pessoa
          deixou da última vez: se a barrinha estiver no chão, é isso, e não
          há como saber sem olhar. */}
      <AnimatePresence initial={false}>
        {urlDoVideo && (
          <motion.div
            key="video" layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={MOLA}
            className="overflow-hidden">
            <video
              src={urlDoVideo}
              controls
              autoPlay
              onPlay={(e) => {
                /* Volume aberto por nossa conta ao dar play: o tocador do
                   navegador herda o volume da última vez, e se ele veio em
                   zero o teste responderia "não ouvi" por um motivo que não é
                   o que estamos investigando. */
                const v = e.currentTarget;
                v.volume = 1;
                v.muted = false;
              }}
              className="w-full max-h-[200px] rounded-lg ring-1 ring-white/10 bg-black"
            />
            <p className="text-[10px] text-muted-foreground/70 leading-snug mt-1">
              Confira também a barrinha de som dentro do próprio vídeo, no canto do tocador.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {semVoz && (
        <p className="text-[10.5px] text-amber-300/90 leading-snug">
          Não há nenhum áudio de cliente guardado para testar. Peça um áudio a alguém pelo WhatsApp e volte aqui.
        </p>
      )}
      {semVideo && (
        <p className="text-[10.5px] text-amber-300/90 leading-snug">
          Não há nenhum vídeo guardado para testar. Peça um vídeo curto a alguém pelo WhatsApp e volte aqui.
        </p>
      )}

      <AnimatePresence initial={false} mode="popLayout">
        {veredito && <CartaoDoVeredito key={veredito.titulo} v={veredito} />}
      </AnimatePresence>
    </div>
  );
}

/** Só um invólucro que anima altura quando a terceira linha entra. */
function LayoutGroupless({ children }: { children: React.ReactNode }) {
  return <motion.div layout transition={MOLA}>{children}</motion.div>;
}

/**
 * As funções de mídia ainda são as do navegador?
 *
 * Extensão que mexe em vídeo troca `play` ou o ajuste de `volume` por função
 * própria, e isso deixa rastro: `toString()` para de dizer "[native code]".
 * `createMediaElementSource` entra na lista porque é por ele que uma extensão
 * DESVIA o som do elemento para o Web Audio — e um desvio que não chega à
 * saída toca mudo, que é exatamente o sintoma.
 */
function funcoesTrocadas(): string[] {
  const fora: string[] = [];
  try {
    const p = HTMLMediaElement.prototype;
    if (!eNativa(p.play)) fora.push("play");
    if (!eNativa(p.pause)) fora.push("pause");
    if (!eNativa(p.load)) fora.push("load");
    const vol = Object.getOwnPropertyDescriptor(p, "volume");
    if (vol?.set && !eNativa(vol.set)) fora.push("volume");
    const mudo = Object.getOwnPropertyDescriptor(p, "muted");
    if (mudo?.set && !eNativa(mudo.set)) fora.push("muted");
    const AC = window.AudioContext;
    if (AC && !eNativa(AC.prototype.createMediaElementSource)) fora.push("createMediaElementSource");
  } catch { /* navegador que não deixa olhar: não acusa ninguém */ }
  return fora;
}

/** O que dá para saber da máquina sem pedir permissão nenhuma. */
async function lerAmbiente(): Promise<Ambiente> {
  let webAudio = "não subiu";
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AC();
    webAudio = `${ac.state}, ${ac.sampleRate} Hz, ${ac.destination.maxChannelCount} canais`;
    ac.close().catch(() => {});
  } catch { /* fica "não subiu" */ }

  let saidas = "não deu para contar";
  try {
    const ds = await navigator.mediaDevices?.enumerateDevices();
    const out = (ds ?? []).filter((d) => d.kind === "audiooutput");
    /* O NOME só vem depois de a pessoa ter dado permissão de microfone alguma
       vez. Sem ele, o número já diz bastante, e pedir microfone para um teste
       de som seria um pedido estranho de se fazer. */
    const nomes = out.map((d) => d.label).filter(Boolean);
    saidas = nomes.length > 0 ? `${out.length} (${nomes.join("; ")})` : String(out.length);
  } catch { /* fica o texto padrão */ }

  const t = document.querySelector("audio");
  const tocador = t
    ? `volume ${Math.round(t.volume * 100)}%${t.muted ? ", MUDO" : ", não mudo"}, taxa ${t.playbackRate}x`
    : "não havia tocador na tela";

  const uad = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData;
  return {
    navegador: navigator.userAgent,
    plataforma: uad?.platform ?? null,
    webAudio, saidas, tocador,
  };
}

export function DiagnosticoDeSom() {
  const [rodando, setRodando] = useState(false);
  const [achados, setAchados] = useState<Achados | null>(null);
  const [ouviu, setOuviu] = useState<OQueOuviu | null>(null);
  const [interferencia, setInterferencia] = useState<Interferencia | null>(null);

  const rodar = async () => {
    setRodando(true);
    const el = document.createElement("audio");

    // 1. o que o navegador diz saber tocar
    const suporte: Record<string, Suporte> = {};
    for (const f of FORMATOS) suporte[f.mime] = suporteDe(el.canPlayType(f.mime));

    // 2. o Web Audio, que é o caminho dos avisos do sistema
    let webAudio: Achados["webAudio"] = "falhou";
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac = new AC();
      webAudio = ac.state === "suspended" ? "suspenso" : "ok";
      ac.close().catch(() => {});
    } catch { webAudio = "falhou"; }

    // 3. quantas saídas o sistema tem (sem pedir permissão: só o número)
    let saidas: number | null = null;
    try {
      const ds = await navigator.mediaDevices?.enumerateDevices();
      saidas = ds ? ds.filter((d) => d.kind === "audiooutput").length : null;
    } catch { saidas = null; }

    /* 4. UM ÁUDIO DE VERDADE DA BASE, e não um arquivo de exemplo. O que
       interessa é este formato, servido por este servidor, com esta assinatura:
       um mp3 de teste passaria mesmo com o Opus quebrado. */
    let carregou: boolean | null = null;
    let erroCodigo: number | null = null;
    let andou: boolean | null = null;

    const { data: linha } = await (supabase.from("wa_mensagens" as never) as never as {
      select: (c: string) => any;
    }).select("midia_path")
      .eq("tipo", "audio").not("midia_path", "is", null)
      .order("criada_em", { ascending: false }).limit(1).maybeSingle();

    const caminho = (linha as { midia_path?: string } | null)?.midia_path;
    if (caminho) {
      const { data: assinada } = await supabase.storage.from("wa-midia").createSignedUrl(caminho, 120);
      if (assinada?.signedUrl) {
        carregou = await new Promise<boolean>((resolve) => {
          const t = setTimeout(() => resolve(false), 8000);
          el.preload = "auto";
          el.src = assinada.signedUrl;
          el.oncanplay = () => { clearTimeout(t); resolve(true); };
          el.onerror = () => { clearTimeout(t); erroCodigo = el.error?.code ?? null; resolve(false); };
          el.load();
        });
      }
    }

    if (carregou) {
      // Tocar mudo: o teste não pode gritar na sala. O que se mede é o RELÓGIO,
      // e ele anda igual com o volume em zero.
      el.muted = true;
      try {
        await el.play();
        const antes = el.currentTime;
        await new Promise((r) => setTimeout(r, 900));
        andou = el.currentTime > antes;
      } catch { andou = false; }
      el.pause();
      el.muted = false;
    }

    // O volume do tocador de verdade da tela, não o do elemento de teste.
    const tocador = document.querySelector("audio");
    setAchados({
      suporte, webAudio, carregou, erroCodigo, andou, saidas,
      volume: tocador ? tocador.volume : el.volume,
      mudo: tocador ? tocador.muted : el.muted,
    });
    setRodando(false);
  };

  /* O RESUMO JUNTA AS TRÊS CAMADAS, e não só a medição. Quem vai ler está
     longe da máquina e não pode perguntar de um em um: o que ela ouviu, como
     a máquina está e o que o navegador respondeu precisam vir no mesmo texto,
     ou a conversa vira mais uma rodada de perguntas. */
  const copiar = async () => {
    const amb = await lerAmbiente();
    const txt = resumoParaColar(achados, navigator.userAgent, ouviu, amb, interferencia);
    navigator.clipboard.writeText(txt)
      .then(() => toast.success("Resumo copiado. É só colar na conversa."))
      .catch(() => toast.error("Não consegui copiar. Dá pra tirar um print."));
  };

  const vereditos = achados ? lerAchados(achados) : [];
  const vereditoDaInterferencia = interferencia ? lerInterferencia(interferencia) : null;

  return (
    <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-muted-foreground" />
            O som das conversas não sai nesta máquina?
          </h3>
          <p className="text-[11.5px] text-muted-foreground mt-0.5 max-w-xl leading-snug">
            O bling das notificações tocar não quer dizer que está tudo bem: ele é sintetizado aqui dentro
            e não precisa de decodificador. O áudio do cliente é um arquivo, e precisa. Este teste separa
            uma coisa da outra.
          </p>
        </div>
      </div>

      {/* PRIMEIRO O OUVIDO, DEPOIS A MÁQUINA. O teste automático diz o que o
          navegador RESPONDE; só quem está na frente do computador sabe o que
          saiu na caixa de som, e é essa resposta que aponta o trecho quebrado. */}
      <OsTresSons aoMudar={setOuviu} aoMedirInterferencia={setInterferencia} />

      {/* O ACHADO QUE NÃO DEPENDE DE OUVIDO. Enquanto ela responde os sons,
          isto já mediu sozinho se alguém está mexendo no tocador. Aparece
          assim que houver o que dizer, porque é a conclusão mais forte que
          esta tela consegue produzir. */}
      <AnimatePresence initial={false} mode="popLayout">
        {vereditoDaInterferencia && (
          <CartaoDoVeredito key={vereditoDaInterferencia.titulo} v={vereditoDaInterferencia} />
        )}
      </AnimatePresence>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={rodar} disabled={rodando} className="shrink-0 h-7 text-[11px]">
          {rodando ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Testando…</>
                   : "Conferir também o que a máquina responde"}
        </Button>
        {/* COPIAR SAI DA GAVETA. Antes ele só existia depois do teste
            automático, e o dado que mais importa agora é o que ela ouviu:
            exigir o teste automático para poder mandar o resultado escondia
            a resposta atrás de um botão que ninguém sabia que precisava
            apertar. */}
        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={copiar}>
          <ClipboardCopy className="h-3.5 w-3.5 mr-1.5" /> Copiar tudo para me mandar
        </Button>
        <span className="text-[10.5px] text-muted-foreground/70">
          O teste acima não faz barulho.
        </span>
      </div>

      <AnimatePresence initial={false}>
        {achados && (
          <motion.div
            key="resultado" layout
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={MOLA}
            className="space-y-2.5 overflow-hidden">

            {vereditos.map((v, i) => (
              <CartaoDoVeredito key={v.titulo} v={v} atraso={i * 0.05} />
            ))}

            <div className="rounded-lg border border-border bg-white/[0.02] px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5">O que a máquina respondeu</p>
              <dl className="space-y-1">
                {FORMATOS.map((f) => (
                  <div key={f.mime} className="flex items-baseline gap-2 text-[11.5px]">
                    <dt className="text-muted-foreground flex-1 min-w-0 truncate">{f.rotulo}</dt>
                    <dd className={`shrink-0 font-medium ${COR_SUPORTE[achados.suporte[f.mime] ?? "nao"]}`}>
                      {TEXTO_SUPORTE[achados.suporte[f.mime] ?? "nao"]}
                    </dd>
                  </div>
                ))}
                <div className="flex items-baseline gap-2 text-[11.5px]">
                  <dt className="text-muted-foreground flex-1">Baixou e decodificou um áudio real</dt>
                  <dd className={`shrink-0 font-medium ${achados.carregou ? "text-emerald-400" : "text-rose-400"}`}>
                    {achados.carregou === null ? "sem áudio na base" : achados.carregou ? "sim" : "não"}
                  </dd>
                </div>
                <div className="flex items-baseline gap-2 text-[11.5px]">
                  <dt className="text-muted-foreground flex-1">O tempo andou ao tocar</dt>
                  <dd className={`shrink-0 font-medium ${achados.andou ? "text-emerald-400" : "text-rose-400"}`}>
                    {achados.andou === null ? "não testado" : achados.andou ? "sim" : "não"}
                  </dd>
                </div>
                <div className="flex items-baseline gap-2 text-[11.5px]">
                  <dt className="text-muted-foreground flex-1">Volume do tocador</dt>
                  <dd className="shrink-0 font-medium tabular-nums">
                    {Math.round(achados.volume * 100)}%{achados.mudo ? " (mudo)" : ""}
                  </dd>
                </div>
              </dl>

              {/* Sem botão de copiar aqui: ele subiu para junto do teste dos
                  sons, e dois botões iguais em lugares diferentes só fazem
                  duvidar de qual dos dois manda o resultado certo. */}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
