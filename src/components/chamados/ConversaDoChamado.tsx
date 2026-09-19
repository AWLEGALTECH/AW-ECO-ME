/* A CONVERSA DENTRO DO CHAMADO: print, áudio e recado.
 *
 * A barra de baixo é a MESMA peça da abertura do chamado (BarraDeMensagem),
 * que por sua vez é a do Atendimento: clipe, campo que cresce, microfone,
 * enviar. Uma peça só nos três lugares, senão elas divergem na primeira
 * correção e a pessoa aprende três barras parecidas.
 *
 * O ANEXO ENCOLHE ANTES DE SUBIR, e a tela conta isso ("2,4 MB → 240 KB").
 * Sem essa frase ninguém percebe que a compressão existe, e alguém acabaria
 * evitando mandar print "para não pesar", que é o oposto do que a gente quer.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Trash2, FileText, Play, Pause, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { BarraDeMensagem } from "@/components/chamados/BarraDeMensagem";
import { tamanhoBonito } from "@/lib/comprimirAnexo";
import { barrasDoAudio, progressoDoAudio, duracaoExibida } from "@/lib/midiaMensagem";
import { duracaoCurta } from "@/lib/wa";
import {
  useChamadoMensagens, useInvalidarChamadoMensagens, useAnexoUrl,
  mandarRecado, mandarAnexo, apagarRecado, type ChamadoMensagem,
} from "@/hooks/useChamadoMensagens";

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/* ── O PLAYER DE ÁUDIO, com a cara do Atendimento ─────────────────────────
 *
 * O `<audio controls>` do navegador chegava aqui branco, com a barra e os
 * botões do Chrome, no meio de uma tela escura: parecia um pedaço de outro
 * programa colado dentro do chamado. E não era só feio — aquele controle tem
 * altura própria, menu de três pontos e um volume que ninguém usa.
 *
 * Aqui é a mesma bolha do Atendimento: botão redondo, as barrinhas servindo de
 * progresso (clicáveis para pular) e o tempo. As barras são as MESMAS,
 * sorteadas a partir do id da mensagem, então o desenho de um áudio é sempre
 * igual — o que faz duas bolhas diferentes parecerem coisas diferentes.
 *
 * O `<audio>` é local, e não o tocador global do Atendimento: ali ele existe
 * para o som sobreviver à troca de conversa; aqui a conversa mora num diálogo
 * que fecha, e trazer o provedor junto seria arrastar meia tela para ganhar
 * nada.
 */
function PlayerDeAudio({ url, id, duracao }: { url: string | null; id: string; duracao: number | null }) {
  const el = useRef<HTMLAudioElement | null>(null);
  const [tocando, setTocando] = useState(false);
  const [tempo, setTempo] = useState(0);
  const [lida, setLida] = useState<number | null>(null);

  const barras = barrasDoAudio(id);
  const pct = progressoDoAudio(tempo, lida, duracao);
  const total = duracaoExibida(lida, duracao);

  return (
    <span className="flex items-center gap-2.5 min-w-[190px] max-w-[250px] py-0.5">
      <audio
        ref={el}
        src={url ?? undefined}
        preload="metadata"
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => { setTocando(false); setTempo(0); }}
        onTimeUpdate={(e) => setTempo(e.currentTarget.currentTime)}
        /* O webm gravado pelo navegador não traz a duração no cabeçalho e
           chega como Infinity; nesse caso vale o número que o gravador mediu. */
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          setLida(Number.isFinite(d) ? d : null);
        }}
        className="hidden"
      />
      <button
        type="button"
        disabled={!url}
        onClick={() => { const a = el.current; if (!a) return; a.paused ? a.play() : a.pause(); }}
        aria-label={tocando ? "Pausar áudio" : "Tocar áudio"}
        className="h-8 w-8 rounded-full grid place-items-center shrink-0 transition-colors
                   bg-primary/15 text-primary hover:bg-primary/25 disabled:opacity-50"
      >
        {tocando ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-[1px]" />}
      </button>

      <span className="flex-1 min-w-0">
        {/* As barrinhas SÃO a barra de progresso: as que já passaram acendem.
            Uma barra lisa por cima seria o mesmo dado desenhado duas vezes. */}
        <span className="flex items-end gap-[2px] h-6 cursor-pointer"
          onClick={(e) => {
            const a = el.current;
            if (!a || !Number.isFinite(a.duration)) return;
            const r = e.currentTarget.getBoundingClientRect();
            a.currentTime = ((e.clientX - r.left) / r.width) * a.duration;
          }}>
          {barras.map((altura, i) => (
            <span key={i} style={{ height: `${Math.round(altura * 100)}%` }}
              className={cn("flex-1 rounded-full transition-colors",
                (i / barras.length) * 100 <= pct ? "bg-primary/70" : "bg-white/20")} />
          ))}
        </span>
        <span className="block text-right text-[9.5px] tabular-nums text-muted-foreground/70 mt-0.5">
          {tocando || tempo > 0 ? duracaoCurta(Math.round(tempo)) : (total ?? "")}
        </span>
      </span>
    </span>
  );
}

/* ── o anexo dentro da bolha ─────────────────────────────────────────────── */
function Anexo({ m }: { m: ChamadoMensagem }) {
  const { data: url } = useAnexoUrl(m.midia_path);

  if (m.tipo === "imagem") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        {/* Altura limitada: um print de tela cheia em tamanho natural empurra
            o resto da conversa para fora, e o que se quer aqui é bater o olho
            e clicar se precisar de detalhe. */}
        {url
          ? <img src={url} alt={m.midia_nome || "print"} className="rounded-lg max-h-56 w-auto object-contain" />
          : <span className="block h-24 w-40 rounded-lg bg-white/[0.05] animate-pulse" />}
      </a>
    );
  }

  if (m.tipo === "audio") return <PlayerDeAudio url={url ?? null} id={m.id} duracao={m.duracao} />;

  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="flex items-center gap-2 rounded-lg bg-white/[0.05] px-2.5 py-2 hover:bg-white/[0.08] transition-colors">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] truncate">{m.midia_nome || "arquivo"}</span>
        {m.midia_bytes ? <span className="block text-[10px] text-muted-foreground">{tamanhoBonito(m.midia_bytes)}</span> : null}
      </span>
      <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </a>
  );
}

export function ConversaDoChamado({ chamadoId, meuId, meuNome }: {
  chamadoId: string;
  meuId: string | null;
  meuNome: string | null;
}) {
  const { data: mensagens = [], isLoading } = useChamadoMensagens(chamadoId);
  const invalidar = useInvalidarChamadoMensagens();

  const [mandando, setMandando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  // A conversa abre no fim, onde está o que acabou de ser dito.
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [mensagens.length]);
  const apagar = async (m: ChamadoMensagem) => {
    if (!window.confirm("Apagar este recado? O anexo sai junto.")) return;
    try { await apagarRecado(m); invalidar(chamadoId); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="flex flex-col min-h-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        Conversa
      </p>

      <div className="flex-1 min-h-0 max-h-[32vh] overflow-y-auto scrollbar-thin space-y-2 pr-1">
        {isLoading && <p className="text-[12px] text-muted-foreground">Carregando…</p>}
        {!isLoading && mensagens.length === 0 && (
          <p className="text-[12px] text-muted-foreground/70 italic">
            Nada ainda. Mande um print, um áudio ou um recado para explicar melhor.
          </p>
        )}
        {mensagens.map((m) => {
          const minha = !!meuId && m.autor_id === meuId;
          return (
            <div key={m.id} className={cn("group flex flex-col max-w-[85%]", minha ? "self-end ml-auto items-end" : "items-start")}>
              <div className={cn("rounded-2xl px-3 py-2 text-[12.5px] leading-snug",
                minha ? "bg-primary/[0.14] ring-1 ring-primary/20 rounded-tr-sm" : "bg-white/[0.05] rounded-tl-sm")}>
                {/* O NOME SÓ NA DOS OUTROS. Na própria, ele é a única coisa da
                    bolha que a pessoa já sabe. */}
                {!minha && (
                  <span className="block text-[10px] font-medium text-primary/80 mb-0.5">
                    {m.autor_nome || "Alguém"}
                  </span>
                )}
                {m.midia_path && <Anexo m={m} />}
                {m.texto && (
                  <span className={cn("block whitespace-pre-wrap break-words", m.midia_path && "mt-1.5")}>
                    {m.texto}
                  </span>
                )}
                <span className="block text-right text-[9.5px] text-muted-foreground/70 mt-1 tabular-nums">
                  {hora(m.criada_em)}
                </span>
              </div>
              {minha && (
                <button type="button" onClick={() => apagar(m)}
                  className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2 className="h-3 w-3" /> apagar
                </button>
              )}
            </div>
          );
        })}
        <div ref={fim} />
      </div>

      {/* ── a barra, a MESMA peça da abertura do chamado ──────────────────── */}
      <div className="mt-2">
        <BarraDeMensagem
          ocupado={mandando}
          placeholder="Responda, cole um print, grave um áudio…"
          onItem={async (item) => {
            setMandando(true);
            try {
              if (item.arquivo) {
                const { antes, depois } = await mandarAnexo({
                  chamadoId, arquivo: item.arquivo, nome: item.nome || "arquivo",
                  legenda: item.texto, duracao: item.duracao ?? null,
                  autorId: meuId, autorNome: meuNome,
                });
                // Só conta quando encolheu de verdade: "240 KB → 240 KB" é ruído.
                if (depois < antes * 0.9) {
                  toast.success(`Enviado · ${tamanhoBonito(antes)} → ${tamanhoBonito(depois)}`);
                }
              } else {
                await mandarRecado({ chamadoId, texto: item.texto, autorId: meuId, autorNome: meuNome });
              }
              invalidar(chamadoId);
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setMandando(false);
              if (item.url) URL.revokeObjectURL(item.url);
            }
          }}
        />
      </div>
    </div>
  );
}
