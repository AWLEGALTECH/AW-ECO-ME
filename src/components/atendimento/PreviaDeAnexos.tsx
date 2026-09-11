import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  X, Plus, ChevronLeft, ChevronRight, FileText, Music, Film, Trash2, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  tipoDaPrevia, tamanhoLegivel, paginaVizinha, indiceAposRemover, rotuloDaPagina, nomeEncurtado,
  type TipoDaPrevia,
} from "@/lib/previaAnexos";

/* CONFERIR O QUE VAI, ANTES DE MANDAR.
 *
 * O anexo virava um chip de dois centímetros com o nome cortado. Quem colava um
 * print não via o print; quem escolhia três documentos via três retângulos
 * iguais e descobria qual era qual do outro lado, no celular do cliente.
 *
 * Aqui é uma PÁGINA por anexo, como no WhatsApp: um de cada vez, grande, com as
 * miniaturas embaixo e um "+" para continuar juntando sem sair da tela. O
 * "Pronto" devolve tudo para a barra, segurado, esperando o botão de enviar.
 *
 * A LEGENDA É A MESMA DA BARRA, e não uma segunda caixa de texto: no WhatsApp o
 * que se escreve aqui é o que sai como legenda do primeiro anexo, e ter dois
 * campos para a mesma frase faria a pessoa escrever duas vezes.
 *
 * ─── por que os object URLs vivem aqui ──────────────────────────────────────
 *
 * Cada `File` vira uma URL do navegador para poder ser desenhado. Elas são
 * criadas UMA vez por arquivo e revogadas quando o arquivo sai ou a tela fecha;
 * sem isso, abrir e fechar a prévia dez vezes com um vídeo de 40 MB deixa dez
 * cópias presas na memória da aba até alguém recarregar.
 */

const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };
const CURVA = [0.22, 1, 0.36, 1] as const;

export interface ItemDaPrevia {
  chave: string;
  nome: string;
  mime?: string | null;
  tamanho?: number | null;
  /** o arquivo escolhido agora; ausente nos que já estão no bucket */
  arquivo?: File;
  /** a URL de quem já está guardado */
  url?: string | null;
  /** `false` nos guardados que a tela não deixa tirar daqui */
  podeRemover?: boolean;
}

const ICONE: Record<TipoDaPrevia, typeof FileText> = {
  imagem: FileText, video: Film, audio: Music, pdf: FileText, outro: FileText,
};

export function PreviaDeAnexos({
  aberto, itens, indiceInicial = 0, legenda, onLegenda, onFechar, onRemover, onAdicionar,
}: {
  aberto: boolean;
  itens: ItemDaPrevia[];
  indiceInicial?: number;
  legenda: string;
  onLegenda: (t: string) => void;
  onFechar: () => void;
  onRemover: (chave: string) => void;
  /** abre o seletor de arquivos sem fechar a prévia */
  onAdicionar: () => void;
}) {
  const [i, setI] = useState(indiceInicial);
  useEffect(() => { if (aberto) setI(indiceInicial); }, [aberto, indiceInicial]);

  /* As URLs, uma por arquivo, criadas e revogadas junto com a lista. */
  const urls = useRef(new Map<string, string>());
  const fonteDe = useCallback((it: ItemDaPrevia): string | null => {
    if (it.url) return it.url;
    if (!it.arquivo) return null;
    const guardada = urls.current.get(it.chave);
    if (guardada) return guardada;
    const nova = URL.createObjectURL(it.arquivo);
    urls.current.set(it.chave, nova);
    return nova;
  }, []);

  useEffect(() => {
    const vivas = new Set(itens.map((it) => it.chave));
    for (const [chave, url] of urls.current) {
      if (!vivas.has(chave)) { URL.revokeObjectURL(url); urls.current.delete(chave); }
    }
  }, [itens]);
  useEffect(() => () => {
    for (const url of urls.current.values()) URL.revokeObjectURL(url);
    urls.current.clear();
  }, []);

  const total = itens.length;
  const atual = itens[Math.min(i, Math.max(0, total - 1))];

  const irPara = useCallback((passo: 1 | -1) => setI((x) => paginaVizinha(x, total, passo)), [total]);

  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") { e.preventDefault(); irPara(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); irPara(-1); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberto, irPara]);

  // A prévia sem nada dentro não tem o que mostrar: quem tirou o último anexo
  // quer voltar a escrever, e não olhar para um quadro preto.
  useEffect(() => { if (aberto && total === 0) onFechar(); }, [aberto, total, onFechar]);

  const remover = (chave: string) => {
    const pos = itens.findIndex((x) => x.chave === chave);
    setI(indiceAposRemover(pos >= 0 ? pos : i, total));
    onRemover(chave);
  };

  if (!atual) return null;

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-w-[94vw] w-[94vw] h-[90dvh] p-0 gap-0 flex flex-col
                                overflow-hidden bg-[#0b0d10] border-white/10">
        <DialogTitle className="sr-only">Conferir os anexos antes de enviar</DialogTitle>

        {/* ── cabeçalho: o que é, e de quantos ── */}
        {/* `pr-12`: o X de fechar do diálogo mora no canto, e sem essa folga o
            "Tirar" senta em cima dele. */}
        <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 pr-12 border-b border-white/[0.07]">
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium truncate" title={atual.nome}>
              {nomeEncurtado(atual.nome)}
            </span>
            <span className="block text-[10.5px] text-muted-foreground">
              {[rotuloDaPagina(i, total), tamanhoLegivel(atual.tamanho ?? atual.arquivo?.size)]
                .filter(Boolean).join(" · ")}
            </span>
          </span>
          {atual.podeRemover !== false && (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[11.5px] text-muted-foreground hover:text-rose-300"
              onClick={() => remover(atual.chave)}>
              <Trash2 className="h-3.5 w-3.5" /> Tirar
            </Button>
          )}
        </div>

        {/* ── o palco ──
            `absolute inset-0` no conteúdo, e não `h-full`: num `grid` que se
            dimensiona pelo conteúdo, o `max-h-full` da imagem mede contra uma
            altura que ela mesma define, o que não limita nada. Era por isso que
            uma imagem alta empurrava as miniaturas e o botão de enviar para
            fora da tela. Com a caixa absoluta, a altura existe antes da
            imagem, e ela cabe dentro. */}
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={atual.chave}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.18, ease: CURVA }}
              className="absolute inset-0 flex items-center justify-center p-4">
              <Palco item={atual} fonte={fonteDe(atual)} />
            </motion.div>
          </AnimatePresence>

          {/* As setas só existem quando há para onde ir: seta apagada num canto
              é um convite a clicar e não acontecer nada. */}
          {i > 0 && (
            <button onClick={() => irPara(-1)} aria-label="Anterior"
              className="absolute left-3 h-10 w-10 grid place-items-center rounded-full
                         bg-black/50 ring-1 ring-white/10 text-white/80 hover:text-white
                         hover:bg-black/70 transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {i < total - 1 && (
            <button onClick={() => irPara(1)} aria-label="Próximo"
              className="absolute right-3 h-10 w-10 grid place-items-center rounded-full
                         bg-black/50 ring-1 ring-white/10 text-white/80 hover:text-white
                         hover:bg-black/70 transition-colors">
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* ── as páginas ── */}
        <div className="shrink-0 border-t border-white/[0.07] px-3 py-2.5">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
            <AnimatePresence initial={false}>
              {itens.map((it, k) => (
                <motion.button
                  key={it.chave}
                  layout
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85, width: 0 }}
                  transition={MOLA}
                  onClick={() => setI(k)}
                  title={it.nome}
                  className={cn(
                    "relative h-14 w-14 shrink-0 rounded-lg overflow-hidden ring-1 transition-colors",
                    k === i ? "ring-primary/70" : "ring-white/[0.10] hover:ring-white/25 opacity-70")}>
                  <Miniatura item={it} fonte={fonteDe(it)} />
                </motion.button>
              ))}
            </AnimatePresence>

            {/* JUNTAR MAIS SEM SAIR DAQUI. Fechar para anexar e reabrir para
                conferir é o vaivém que esta tela existe para evitar. */}
            <button onClick={onAdicionar} title="Anexar mais"
              className="h-14 w-14 shrink-0 rounded-lg grid place-items-center
                         ring-1 ring-dashed ring-white/20 text-muted-foreground
                         hover:ring-primary/50 hover:text-primary transition-colors">
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── a legenda e o pronto ── */}
        <div className="shrink-0 border-t border-white/[0.07] p-3 flex items-end gap-2">
          <Textarea
            value={legenda}
            rows={1}
            onChange={(e) => onLegenda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onFechar(); }
            }}
            placeholder={total > 1
              ? "Legenda (vai junto com o primeiro anexo)…"
              : "Legenda (opcional)…"}
            className="flex-1 min-h-9 max-h-32 py-[0.45rem] text-[12.5px] resize-none scrollbar-thin" />
          <Button onClick={onFechar} className="h-9 gap-1.5 shrink-0">
            <Check className="h-4 w-4" />
            Pronto{total > 1 ? ` (${total})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* O anexo em tamanho de conferir. Vídeo com controles, PDF embutido, imagem
   inteira; o resto vira um cartão que ao menos diz o nome e o peso, porque
   "arquivo não suportado" não ajuda ninguém a decidir se manda. */
function Palco({ item, fonte }: { item: ItemDaPrevia; fonte: string | null }) {
  const tipo = tipoDaPrevia(item.mime, item.nome);
  if (!fonte) return <CartaoGenerico item={item} />;

  if (tipo === "imagem") {
    return (
      <img src={fonte} alt={item.nome}
        className="max-h-full max-w-full w-auto h-auto object-contain rounded-lg" />
    );
  }
  if (tipo === "video") {
    return <video src={fonte} controls className="max-h-full max-w-full w-auto h-auto rounded-lg" />;
  }
  if (tipo === "audio") {
    return (
      <div className="flex flex-col items-center gap-3">
        <span className="h-20 w-20 rounded-2xl bg-primary/10 ring-1 ring-primary/20 grid place-items-center">
          <Music className="h-9 w-9 text-primary" />
        </span>
        <audio src={fonte} controls className="w-[min(28rem,80vw)]" />
      </div>
    );
  }
  if (tipo === "pdf") {
    return <iframe src={fonte} title={item.nome} className="h-full w-full rounded-lg border-0 bg-white" />;
  }
  return <CartaoGenerico item={item} />;
}

function CartaoGenerico({ item }: { item: ItemDaPrevia }) {
  const Ico = ICONE[tipoDaPrevia(item.mime, item.nome)];
  return (
    <div className="flex flex-col items-center gap-3 text-center px-6">
      <span className="h-24 w-24 rounded-2xl bg-white/[0.05] ring-1 ring-white/10 grid place-items-center">
        <Ico className="h-10 w-10 text-muted-foreground" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium break-all">{item.nome}</span>
        <span className="block text-[11px] text-muted-foreground mt-0.5">
          {tamanhoLegivel(item.tamanho ?? item.arquivo?.size) || "pronto para enviar"}
        </span>
      </span>
    </div>
  );
}

function Miniatura({ item, fonte }: { item: ItemDaPrevia; fonte: string | null }) {
  const tipo = tipoDaPrevia(item.mime, item.nome);
  if (fonte && tipo === "imagem") {
    return <img src={fonte} alt="" className="h-full w-full object-cover" />;
  }
  if (fonte && tipo === "video") {
    // O primeiro quadro serve de miniatura, e `preload=metadata` é o que o
    // navegador já baixa de qualquer jeito.
    return <video src={fonte} preload="metadata" muted className="h-full w-full object-cover" />;
  }
  const Ico = ICONE[tipo];
  return (
    <span className="h-full w-full grid place-items-center bg-white/[0.05] text-muted-foreground">
      <Ico className="h-5 w-5" />
    </span>
  );
}
