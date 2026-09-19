/* A CONVERSA DENTRO DO CHAMADO: print, áudio e recado.
 *
 * A barra de baixo é a mesma do Atendimento, na mesma ordem e com os mesmos
 * gestos: clipe, campo que cresce até cinco linhas, microfone, enviar. Enter
 * manda, Shift+Enter quebra linha, e dá para COLAR um print direto no campo,
 * que é como noventa por cento dos prints vão entrar aqui: a pessoa dá
 * Cmd+Shift+4, Cmd+V e pronto. O gravador é literalmente o mesmo componente.
 *
 * Isso não é economia de código, é economia de aprendizado: quem já responde
 * lead o dia inteiro não devia precisar descobrir como se manda um áudio num
 * lugar diferente do sistema.
 *
 * O ANEXO ENCOLHE ANTES DE SUBIR, e a tela conta isso ("2,4 MB → 240 KB").
 * Sem essa frase ninguém percebe que a compressão existe, e alguém acabaria
 * evitando mandar print "para não pesar", que é o oposto do que a gente quer.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, Send, Loader2, Trash2, FileText, Play, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { GravadorDeAudio } from "@/components/atendimento/GravadorDeAudio";
import { tamanhoBonito } from "@/lib/comprimirAnexo";
import {
  useChamadoMensagens, useInvalidarChamadoMensagens, useAnexoUrl,
  mandarRecado, mandarAnexo, apagarRecado, type ChamadoMensagem,
} from "@/hooks/useChamadoMensagens";

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const mmss = (s?: number | null) =>
  s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

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

  if (m.tipo === "audio") {
    return (
      <span className="flex items-center gap-2 min-w-[12rem]">
        {url
          ? <audio controls src={url} className="h-8 max-w-[15rem]" />
          : <Play className="h-4 w-4 text-muted-foreground animate-pulse" />}
        {m.duracao ? <span className="text-[10px] text-muted-foreground tabular-nums">{mmss(m.duracao)}</span> : null}
      </span>
    );
  }

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

  const [rascunho, setRascunho] = useState("");
  const [anexo, setAnexo] = useState<{ arquivo: File; url: string } | null>(null);
  const [mandando, setMandando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const seletor = useRef<HTMLInputElement>(null);
  const fim = useRef<HTMLDivElement>(null);

  // A conversa abre no fim, onde está o que acabou de ser dito.
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [mensagens.length]);
  // A prévia do anexo é um object URL; sem soltar, cada print colado vaza.
  useEffect(() => () => { if (anexo) URL.revokeObjectURL(anexo.url); }, [anexo]);

  const escolher = (f: File | null | undefined) => {
    if (!f) return;
    if (anexo) URL.revokeObjectURL(anexo.url);
    setAnexo({ arquivo: f, url: URL.createObjectURL(f) });
    campo.current?.focus();
  };

  const tirarAnexo = () => {
    if (anexo) URL.revokeObjectURL(anexo.url);
    setAnexo(null);
  };

  /* COLAR O PRINT É O CAMINHO PRINCIPAL. Cmd+Shift+4, Cmd+V, enviar. Obrigar a
     salvar no disco e procurar pelo clipe transformaria dois gestos em cinco,
     e é nesse tipo de atrito que o print deixa de ser mandado. */
  const colar = (e: React.ClipboardEvent) => {
    const arquivo = Array.from(e.clipboardData?.items || [])
      .find((i) => i.kind === "file" && i.type.startsWith("image/"))?.getAsFile();
    if (!arquivo) return;
    e.preventDefault();
    const nome = arquivo.name && arquivo.name !== "image.png"
      ? arquivo.name
      : `print-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
    escolher(new File([arquivo], nome, { type: arquivo.type }));
  };

  const enviar = async () => {
    if (mandando) return;
    const texto = rascunho.trim();
    if (!anexo && !texto) return;
    setMandando(true);
    try {
      if (anexo) {
        const { antes, depois } = await mandarAnexo({
          chamadoId, arquivo: anexo.arquivo, nome: anexo.arquivo.name,
          legenda: texto, autorId: meuId, autorNome: meuNome,
        });
        // Só conta quando encolheu de verdade: "240 KB → 240 KB" seria ruído.
        if (depois < antes * 0.9) {
          toast.success(`Anexo enviado · ${tamanhoBonito(antes)} → ${tamanhoBonito(depois)}`);
        } else {
          toast.success("Anexo enviado.");
        }
        tirarAnexo();
      } else {
        await mandarRecado({ chamadoId, texto, autorId: meuId, autorNome: meuNome });
      }
      setRascunho("");
      invalidar(chamadoId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setMandando(false);
    }
  };

  const enviarAudio = async (blob: Blob, segundos: number) => {
    try {
      await mandarAnexo({
        chamadoId, arquivo: blob,
        nome: `audio-${Date.now()}.webm`,
        duracao: segundos, autorId: meuId, autorNome: meuNome,
      });
      invalidar(chamadoId);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

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

      {/* ── a prévia do que vai junto ─────────────────────────────────────── */}
      {anexo && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-white/[0.04] ring-1 ring-white/[0.07] p-2">
          {anexo.arquivo.type.startsWith("image/")
            ? <img src={anexo.url} alt="" className="h-12 w-12 rounded object-cover shrink-0" />
            : <FileText className="h-5 w-5 text-muted-foreground shrink-0" />}
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] truncate">{anexo.arquivo.name}</span>
            <span className="block text-[10px] text-muted-foreground">
              {tamanhoBonito(anexo.arquivo.size)}
              {/* A promessa aparece ANTES do envio: quem vê "vai encolher"
                  manda sem medo de entupir o sistema. */}
              {anexo.arquivo.type.startsWith("image/") && anexo.arquivo.size > 200 * 1024 && " · vai encolher no envio"}
            </span>
          </span>
          <button type="button" onClick={tirarAnexo}
            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-red-400 hover:bg-white/[0.06]">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── a barra, na mesma ordem da do Atendimento ─────────────────────── */}
      <div className="mt-2 flex items-end gap-1.5">
        <input ref={seletor} type="file" className="hidden"
          accept="image/*,application/pdf,audio/*,.doc,.docx,.xls,.xlsx,.csv,.txt"
          onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ""; }} />

        {!gravando && (
          <Button size="sm" variant="ghost" title="Anexar print ou arquivo"
            className="h-9 w-9 p-0 shrink-0" onClick={() => seletor.current?.click()}
            disabled={mandando}>
            <Paperclip className="h-4 w-4" />
          </Button>
        )}

        {!gravando && (
          <Textarea
            ref={campo}
            value={rascunho}
            rows={1}
            onChange={(e) => setRascunho(e.target.value)}
            onPaste={colar}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (e.shiftKey || e.ctrlKey || e.metaKey) return;
              e.preventDefault();
              enviar();
            }}
            placeholder={anexo ? "Legenda (opcional)…" : "Explique melhor, cole um print…"}
            className="min-h-9 max-h-[7.5rem] py-[0.45rem] text-[12.5px] resize-none scrollbar-thin"
          />
        )}

        {/* Áudio não anda junto com anexo: são duas mensagens diferentes, e o
            gravador ocupa a barra inteira enquanto grava. */}
        {!anexo && (
          <GravadorDeAudio onEnviar={enviarAudio} onGravandoChange={setGravando} disabled={mandando} />
        )}

        {!gravando && (
          <Button size="sm" className="h-9 w-9 p-0 shrink-0" onClick={enviar}
            disabled={mandando || (!rascunho.trim() && !anexo)}>
            {mandando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}
