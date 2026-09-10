/* UM ÁUDIO SÓ PARA A TELA INTEIRA.
 *
 * Antes, cada bolha de áudio tinha o seu `<audio>`. Isso funciona enquanto a
 * pessoa fica parada numa conversa — e quebra no gesto mais comum do
 * atendimento, que é ouvir um áudio longo e ir olhando outra coisa enquanto
 * escuta. Trocar de conversa desmontava a bolha, e com ela o elemento: o áudio
 * simplesmente parava no meio, sem aviso, e voltava do zero quando a pessoa
 * retornava.
 *
 * A CORREÇÃO NÃO É GUARDAR O TEMPO, É TIRAR O ELEMENTO DA ÁRVORE. Um `<audio>`
 * que vive acima das conversas não sabe que a conversa mudou; ele continua
 * tocando porque nada o desmontou. As bolhas passam a ser só CONTROLE e
 * DESENHO: perguntam "sou eu que estou tocando?" e desenham de acordo.
 *
 * O EFEITO COLATERAL BOM é que fica impossível tocar dois áudios ao mesmo
 * tempo. Antes dava: dois cliques em bolhas diferentes e as duas vozes se
 * sobrepunham, com dois botões de pausa espalhados pela tela pra achar.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";

/** As velocidades que fazem sentido pra voz. */
export const VELOCIDADES = [1, 1.5, 2] as const;
export type Velocidade = (typeof VELOCIDADES)[number];

export type FaixaDeAudio = {
  /** id da mensagem — é ele que diz qual bolha está tocando */
  id: string;
  url: string;
  /** segundos gravados; o opus sem cabeçalho não traz duração no elemento */
  duracao?: number | null;
  /** de onde ela veio, pra barra flutuante saber o que dizer */
  conversaId: string;
  conversaNome: string;
};

type Estado = {
  faixa: FaixaDeAudio | null;
  tocando: boolean;
  tempo: number;
  /** a duração que o elemento conseguiu ler; null enquanto não sabe */
  duracaoLida: number | null;
  /** por que o último play não saiu; null quando não houve falha */
  falha: string | null;
  velocidade: Velocidade;
  tocar: (f: FaixaDeAudio) => void;
  alternar: () => void;
  parar: () => void;
  /** posiciona em uma fração de 0 a 1 */
  procurar: (fracao: number) => void;
  proximaVelocidade: () => void;
};

const Ctx = createContext<Estado | null>(null);

export function useAudioAtendimento(): Estado {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useAudioAtendimento precisa do <ProvedorDeAudio> por cima");
  }
  return ctx;
}

export function ProvedorDeAudio({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLAudioElement>(null);
  const quadro = useRef<number | null>(null);

  const [faixa, setFaixa] = useState<FaixaDeAudio | null>(null);
  const [tocando, setTocando] = useState(false);
  const [tempo, setTempo] = useState(0);
  const [duracaoLida, setDuracaoLida] = useState<number | null>(null);
  const [velocidade, setVelocidade] = useState<Velocidade>(1);
  /* POR QUE ESTE ÁUDIO NÃO TOCOU.
     Antes o `catch` engolia tudo: o botão de play piscava, nada acontecia, e
     não havia nem no console de onde partir. Numa máquina sem o decodificador
     de Opus isso é o sintoma inteiro, e ele se parece com "o sistema está
     travado". Agora a falha tem nome e chega a quem clicou. */
  const [falha, setFalha] = useState<string | null>(null);
  const avisarFalha = useCallback((motivo?: string | null) => {
    const a = ref.current;
    const codigo = a?.error?.code ?? null;
    setFalha(
      codigo === 4 ? "Este navegador não sabe abrir o formato deste áudio."
      : codigo === 3 ? "O arquivo chegou, mas não deu para decodificar."
      : codigo === 2 ? "A rede cortou no meio do download do áudio."
      : motivo || "Não consegui tocar este áudio.");
  }, []);

  /* O tempo anda por requestAnimationFrame e não por `timeupdate`: o evento
     nativo dispara a cada ~250ms e a barrinha anda aos trancos. */
  useEffect(() => {
    if (!tocando) {
      if (quadro.current) cancelAnimationFrame(quadro.current);
      quadro.current = null;
      return;
    }
    const passo = () => {
      const a = ref.current;
      if (a) setTempo(a.currentTime);
      quadro.current = requestAnimationFrame(passo);
    };
    quadro.current = requestAnimationFrame(passo);
    return () => { if (quadro.current) cancelAnimationFrame(quadro.current); };
  }, [tocando]);

  /* A VELOCIDADE É APLICADA NO ELEMENTO E SOBREVIVE À TROCA DE FAIXA. Quem
     ouve a 2x quer ouvir o próximo a 2x também — reajustar a cada áudio seria
     o tipo de repetição que faz a pessoa desistir do recurso. */
  useEffect(() => {
    const a = ref.current;
    if (a) a.playbackRate = velocidade;
  }, [velocidade, faixa?.id]);

  const tocar = useCallback((f: FaixaDeAudio) => {
    const a = ref.current;
    if (!a) return;
    /* Mesma faixa: é pausa/retomada, e o tempo NÃO pode voltar pro zero.
       Trocar o `src` pelo mesmo valor reinicia o elemento em alguns
       navegadores, então nem se toca nele. */
    if (faixa?.id !== f.id) {
      setFaixa(f);
      setTempo(0);
      setDuracaoLida(null);
      setFalha(null);
      a.src = f.url;
      a.load();
    }
    /* O elemento sobrevive à tela inteira, então qualquer coisa que tenha
       zerado o volume dele fica zerada para sempre. Reabrir a cada play custa
       nada e evita um "não sai som" que ninguém consegue explicar. */
    a.volume = 1;
    a.muted = false;
    a.playbackRate = velocidade;
    a.play().catch((e: DOMException) => avisarFalha(e?.message));
  }, [faixa?.id, velocidade]);

  const alternar = useCallback(() => {
    const a = ref.current;
    if (!a || !faixa) return;
    if (a.paused) a.play().catch((e: DOMException) => avisarFalha(e?.message)); else a.pause();
  }, [faixa]);

  const parar = useCallback(() => {
    const a = ref.current;
    if (a) { a.pause(); a.currentTime = 0; }
    setFaixa(null);
    setTempo(0);
    setDuracaoLida(null);
  }, []);

  const procurar = useCallback((fracao: number) => {
    const a = ref.current;
    if (!a) return;
    /* Com opus sem cabeçalho a duração do elemento é Infinity, e a gravada é a
       única utilizável — sem isso, clicar na barra não faz nada e parece que a
       barra não é clicável. */
    const t = Number.isFinite(a.duration) && a.duration > 0
      ? a.duration
      : Number(faixa?.duracao);
    if (!Number.isFinite(t) || t <= 0) return;
    a.currentTime = Math.max(0, Math.min(1, fracao)) * t;
    setTempo(a.currentTime);
  }, [faixa?.duracao]);

  const proximaVelocidade = useCallback(() => {
    setVelocidade((v) => VELOCIDADES[(VELOCIDADES.indexOf(v) + 1) % VELOCIDADES.length]);
  }, []);

  const valor = useMemo<Estado>(() => ({
    faixa, tocando, tempo, duracaoLida, velocidade, falha,
    tocar, alternar, parar, procurar, proximaVelocidade,
  }), [faixa, tocando, tempo, duracaoLida, velocidade, falha,
       tocar, alternar, parar, procurar, proximaVelocidade]);

  return (
    <Ctx.Provider value={valor}>
      {/* O ELEMENTO MORA AQUI, acima de tudo que troca. É o que faz o áudio
          continuar quando a conversa muda: nada o desmonta. */}
      <audio
        ref={ref}
        preload="metadata"
        onPlay={() => { setTocando(true); setFalha(null); }}
        onPause={() => setTocando(false)}
        onEnded={() => { setTocando(false); setTempo(0); }}
        /* O ERRO DO ELEMENTO CHEGA DEPOIS DA PROMESSA do play, e às vezes é o
           único que aparece: `play()` resolve e o arquivo falha na sequência. */
        onError={() => { setTocando(false); avisarFalha(); }}
        onLoadedMetadata={(e) => {
          const d = (e.currentTarget as HTMLAudioElement).duration;
          setDuracaoLida(Number.isFinite(d) ? d : null);
        }}
        onDurationChange={(e) => {
          const d = (e.currentTarget as HTMLAudioElement).duration;
          setDuracaoLida(Number.isFinite(d) ? d : null);
        }}
      />
      {children}
      <BarraFlutuante />
    </Ctx.Provider>
  );
}

/* A BARRA QUE SEGUE A PESSOA.
 *
 * Aparece só quando o áudio que está tocando NÃO é o da conversa aberta — se a
 * bolha está na tela, ela já é o controle, e uma segunda barra dizendo a mesma
 * coisa seria dois lugares para pausar o mesmo som.
 *
 * O NOME DA CONVERSA É O ESSENCIAL AQUI. "Áudio tocando" sem dono é pior que
 * silêncio: quem trocou de conversa três vezes não faz ideia de quem está
 * falando, e o gesto seguinte vira caçar a bolha em cinquenta linhas. Com o
 * nome, dá pra ouvir até o fim e voltar depois — que é justamente o que a
 * pessoa queria fazer quando trocou de conversa.
 */
function BarraFlutuante() {
  const { faixa, tocando, tempo, duracaoLida, velocidade, alternar, parar, proximaVelocidade } =
    useAudioAtendimento();
  const [conversaVisivel, setConversaVisivel] = useState<string | null>(null);

  /* Qual conversa está aberta agora. Vem de um atributo no DOM em vez de um
     prop porque o provedor mora acima da página inteira e não deve saber o que
     é uma conversa — pedir isso por props obrigaria a atravessar meia dúzia de
     componentes que não têm nada a ver com áudio. */
  useEffect(() => {
    const ler = () => setConversaVisivel(
      document.body.getAttribute("data-conversa-aberta") || null);
    ler();
    const obs = new MutationObserver(ler);
    obs.observe(document.body, { attributes: true, attributeFilter: ["data-conversa-aberta"] });
    return () => obs.disconnect();
  }, []);

  if (!faixa) return null;
  if (faixa.conversaId && faixa.conversaId === conversaVisivel) return null;

  const total = Number.isFinite(duracaoLida ?? NaN) && (duracaoLida ?? 0) > 0
    ? (duracaoLida as number)
    : Number(faixa.duracao) || 0;
  const pct = total > 0 ? Math.min(100, (tempo / total) * 100) : 0;
  const mmss = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[17rem] max-w-[calc(100vw-2rem)]
                    rounded-xl border border-white/[0.10] bg-[#14161a]/95 backdrop-blur-md
                    shadow-[0_8px_32px_rgba(0,0,0,0.45)] p-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          onClick={alternar}
          aria-label={tocando ? "Pausar" : "Continuar"}
          className="h-8 w-8 shrink-0 rounded-full grid place-items-center bg-primary/15 text-primary
                     hover:bg-primary/25 transition-colors">
          {tocando
            ? <span className="flex gap-[3px]">
                <span className="w-[3px] h-3 bg-current rounded-[1px]" />
                <span className="w-[3px] h-3 bg-current rounded-[1px]" />
              </span>
            : <span className="w-0 h-0 ml-[2px] border-y-[6px] border-y-transparent border-l-[9px] border-l-current" />}
        </button>

        <span className="min-w-0 flex-1">
          <span className="block text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
            Ouvindo áudio de
          </span>
          <span className="block text-[12px] font-medium truncate">
            {faixa.conversaNome || "outra conversa"}
          </span>
        </span>

        <button
          onClick={proximaVelocidade}
          title="Velocidade da reprodução"
          className="shrink-0 rounded-full px-1.5 py-[2px] text-[10px] font-semibold tabular-nums
                     bg-white/[0.10] text-foreground/80 hover:bg-white/[0.18] transition-colors">
          {velocidade}x
        </button>

        <button
          onClick={parar}
          aria-label="Parar"
          className="shrink-0 h-7 w-7 grid place-items-center rounded-lg text-muted-foreground/60
                     hover:text-foreground hover:bg-white/[0.08] transition-colors">
          <span className="block h-2.5 w-2.5 rounded-[2px] bg-current" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="flex-1 h-1 rounded-full bg-white/[0.10] overflow-hidden">
          <span className="block h-full bg-primary/70 transition-[width] duration-150"
            style={{ width: `${pct}%` }} />
        </span>
        <span className="text-[9.5px] tabular-nums text-muted-foreground/70 shrink-0">
          {mmss(tempo)}{total > 0 ? ` / ${mmss(total)}` : ""}
        </span>
      </div>
    </div>
  );
}
