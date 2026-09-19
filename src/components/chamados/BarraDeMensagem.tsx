/* A BARRA DE MENSAGEM DO CHAMADO.
 *
 * Uma linha só: clipe de um lado, microfone do outro, o campo no meio
 * crescendo conforme se escreve. É a mesma barra do Atendimento, e é a MESMA
 * peça nos dois lugares onde o chamado aceita conteúdo (ao abrir e depois,
 * dentro dele), para não existirem duas barras parecidas que divergem na
 * primeira correção.
 *
 * POR QUE ELA SUBSTITUI O CAMPO "OBSERVAÇÕES".
 *
 * A versão anterior tinha o campo de texto em cima e um bloco "Print, áudio ou
 * arquivo" embaixo, separados. O chefe cortou na hora, e estava certo: são
 * dois lugares para dizer a mesma coisa, e quem está descrevendo um problema
 * não quer decidir em qual dos dois a próxima frase entra. Numa barra só, o
 * gesto é um: escreve, cola, grava, manda. Como no WhatsApp, que é o que todo
 * mundo aqui já sabe usar.
 *
 * Ela não envia nada: devolve um item por vez em `onItem`. Quem chama decide
 * se aquilo vira linha no banco agora (chamado já existe) ou espera na memória
 * até o chamado nascer.
 */
import { useEffect, useRef, useState } from "react";
import { Paperclip, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GravadorDeAudio } from "@/components/atendimento/GravadorDeAudio";

export interface ItemDaBarra {
  /** o que a pessoa escreveu; legenda quando vem junto de um anexo */
  texto: string;
  arquivo?: Blob | null;
  nome?: string | null;
  /** segundos, só no áudio gravado */
  duracao?: number | null;
  /** prévia local da imagem, para a lista mostrar antes de subir */
  url?: string | null;
}

export function BarraDeMensagem({ onItem, placeholder, ocupado, autoFoco }: {
  onItem: (item: ItemDaBarra) => void | Promise<void>;
  placeholder?: string;
  ocupado?: boolean;
  autoFoco?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [anexo, setAnexo] = useState<{ arquivo: File; url: string | null } | null>(null);
  const [mandando, setMandando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const seletor = useRef<HTMLInputElement>(null);

  /* A CAIXA CRESCE COM O TEXTO. Sem isto o `rows={1}` fica em uma linha e o
     resto rola por dentro: quem escreve cinco linhas só enxerga a última, e
     reler antes de mandar é metade do trabalho de descrever um problema. */
  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [texto]);

  useEffect(() => () => { if (anexo?.url) URL.revokeObjectURL(anexo.url); }, [anexo]);

  const pegar = (f: File | null | undefined) => {
    if (!f) return;
    if (anexo?.url) URL.revokeObjectURL(anexo.url);
    setAnexo({ arquivo: f, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null });
    campo.current?.focus();
  };

  /* COLAR É O CAMINHO PRINCIPAL DO PRINT: Cmd+Shift+4, Cmd+V. Obrigar a salvar
     no disco e procurar pelo clipe transforma dois gestos em cinco, e é nesse
     atrito que o print deixa de ser mandado. */
  const colar = (e: React.ClipboardEvent) => {
    const img = Array.from(e.clipboardData?.items || [])
      .find((i) => i.kind === "file" && i.type.startsWith("image/"))?.getAsFile();
    if (!img) return;
    e.preventDefault();
    const nome = img.name && img.name !== "image.png"
      ? img.name
      : `print-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
    pegar(new File([img], nome, { type: img.type }));
  };

  const mandar = async () => {
    const t = texto.trim();
    if (!t && !anexo) return;
    setMandando(true);
    try {
      await onItem({
        texto: t,
        arquivo: anexo?.arquivo ?? null,
        nome: anexo?.arquivo.name ?? null,
        url: anexo?.url ?? null,
      });
      setTexto("");
      // A url da prévia NÃO é solta aqui: ela foi entregue junto do item e
      // agora é a lista quem mostra a miniatura. Soltar deixaria o quadrado
      // cinza de imagem quebrada.
      setAnexo(null);
    } finally {
      setMandando(false);
    }
  };

  const travado = !!ocupado || mandando;

  return (
    <div className="rounded-xl ring-1 ring-white/[0.09] bg-white/[0.03] focus-within:ring-primary/40 transition-colors">
      {/* A prévia do anexo fica DENTRO da barra, em cima do campo: ela é parte
          da mensagem que está sendo escrita, não um bloco à parte. */}
      {anexo && (
        <div className="flex items-center gap-2 px-2 pt-2">
          {anexo.url
            ? <img src={anexo.url} alt="" className="h-11 w-11 rounded-lg object-cover shrink-0" />
            : <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />}
          <span className="min-w-0 flex-1 text-[11.5px] truncate text-muted-foreground">
            {anexo.arquivo.name}
          </span>
          <button type="button" onClick={() => setAnexo(null)}
            className="text-[11px] text-muted-foreground hover:text-red-400 px-1.5">
            tirar
          </button>
        </div>
      )}

      {/* `items-end` e não `items-center`: quando o campo cresce, os botões
          ficam alinhados com a ÚLTIMA linha, que é onde o cursor está. */}
      <div className="flex items-end gap-1 p-1.5">
        <input ref={seletor} type="file" className="hidden"
          accept="image/*,application/pdf,audio/*,.doc,.docx,.xls,.xlsx,.csv,.txt"
          onChange={(e) => { pegar(e.target.files?.[0]); e.target.value = ""; }} />

        {!gravando && (
          <Button type="button" size="sm" variant="ghost" title="Anexar print ou arquivo"
            className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => seletor.current?.click()} disabled={travado}>
            <Paperclip className="h-4 w-4" />
          </Button>
        )}

        {!gravando && (
          <Textarea
            ref={campo}
            value={texto}
            rows={1}
            autoFocus={autoFoco}
            onChange={(e) => setTexto(e.target.value)}
            onPaste={colar}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (e.shiftKey || e.ctrlKey || e.metaKey) return;
              e.preventDefault();
              mandar();
            }}
            placeholder={placeholder || "Escreva, cole um print, grave um áudio…"}
            /* `flex-1 min-w-0` é o que impede a barra de ficar cortada: sem
               ele o campo não cede largura para os botões, o texto quebra em
               duas linhas com quatro palavras cada e a barra vira um bloco
               apertado no meio de dois ícones. */
            className="flex-1 min-w-0 min-h-8 border-0 bg-transparent px-1.5 py-[0.4rem]
                       text-[12.5px] leading-snug resize-none scrollbar-thin
                       focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none"
          />
        )}

        {/* Áudio é uma mensagem inteira, e não companhia de outra: o gravador
            toma a barra enquanto grava, como no Atendimento. */}
        {!anexo && (
          <GravadorDeAudio
            onGravandoChange={setGravando}
            disabled={travado}
            onEnviar={async (blob, seg) => {
              await onItem({
                texto: "", arquivo: blob,
                nome: `audio-${Date.now()}.webm`, duracao: seg, url: null,
              });
            }}
          />
        )}

        {!gravando && (
          <Button type="button" size="sm" className="h-8 w-8 p-0 shrink-0"
            onClick={mandar} disabled={travado || (!texto.trim() && !anexo)}>
            {mandando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}
