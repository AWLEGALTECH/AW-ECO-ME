/* O MENU DA BOLHA: o que se faz com uma mensagem já enviada.
 *
 * Pedido da Adria (18/09/2026), com prioridade em apagar. Veio do AW-ECO, onde
 * as duas ações já rodam, e aqui virou peça própria porque a conversa desta
 * tela é desenhada de outro jeito.
 *
 * ── as duas coisas que se chamam "apagar" ──────────────────────────────────
 *
 *   Para todos  o WhatsApp revoga no aparelho do cliente também. Só vale para
 *               mensagem NOSSA e dentro da janela dele. A bolha passa a
 *               mostrar "Mensagem apagada", igual ao WhatsApp, em vez de
 *               sumir: quem atende precisa ver que ali houve algo e não está.
 *   Para mim    some só daqui. No celular do cliente continua, inteira.
 *
 * A diferença é a coisa mais importante desta tela, porque o erro possível é
 * caro e silencioso: alguém manda um valor errado, clica em apagar, e sai
 * achando que o cliente não viu. Por isso os dois itens têm nomes completos,
 * nunca só "Apagar", e o de "para todos" avisa antes o que vai acontecer.
 *
 * Os itens que não podem funcionar não aparecem, em vez de aparecer e falhar.
 * Quando "para todos" sumiu por causa da janela, o menu diz o porquê numa
 * linha, senão a ausência parece defeito.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, Loader2, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apagarParaTodos, apagarSoParaMim, editarMensagem } from "@/hooks/useWhatsapp";
import {
  podeApagarParaTodos, podeEditar, minutosRestantesParaEditar, JANELA_APAGAR_HORAS,
} from "@/lib/mensagemAcoes";
import type { Mensagem } from "@/lib/atendimentoMock";

export function AcoesDaMensagem({ msg, aoMudar, className }: {
  msg: Mensagem;
  /** recarrega a conversa depois que algo muda de verdade */
  aoMudar: () => void;
  className?: string;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(msg.texto || "");
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  // Bolha que ainda não virou linha (a otimista, esperando a Evolution) não
  // tem o que apagar nem o que editar em lugar nenhum. Já a apagada continua
  // com menu: copiar o que estava escrito é justamente o que se quer fazer
  // numa mensagem que o cliente tentou tirar do ar.
  if (!msg.id) return null;

  const todos = podeApagarParaTodos(msg);
  const editar = podeEditar(msg);
  const nossa = msg.de === "nos";
  const temTexto = !!(msg.texto || "").trim();
  const jaSoParaMim = !!msg.soParaMim;

  const fazerApagarTodos = async () => {
    setApagando(true);
    try {
      const r = await apagarParaTodos(msg.id!);
      aoMudar();
      toast.success(r.aviso ? r.aviso : "Apagada para todos. Sumiu do WhatsApp do cliente; aqui ela fica com tarja.");
      setConfirmar(false);
    } catch (e) { toast.error((e as Error).message); }
    finally { setApagando(false); }
  };

  const fazerApagarMim = async () => {
    try {
      await apagarSoParaMim(msg.id!);
      aoMudar();
      toast.success("Apagada só para você. No WhatsApp do cliente ela continua normal.");
    } catch (e) { toast.error((e as Error).message); }
  };

  const salvarEdicao = async () => {
    setSalvando(true);
    try {
      const r = await editarMensagem(msg.id!, texto);
      aoMudar();
      toast.success(r.ja ? "Nada mudou no texto." : r.aviso ? r.aviso : "Mensagem editada.");
      setEditando(false);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSalvando(false); }
  };

  const copiar = async () => {
    try { await navigator.clipboard.writeText(msg.texto || ""); toast.success("Copiado."); }
    catch { toast.error("Não consegui copiar."); }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Opções da mensagem"
            className={cn(
              "h-5 w-5 grid place-items-center rounded-md bg-black/45 text-white/75",
              "hover:bg-black/70 hover:text-white transition-colors",
              className,
            )}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={nossa ? "end" : "start"} className="text-[12px] min-w-[13rem]">
          {editar && (
            <DropdownMenuItem onClick={() => { setTexto(msg.texto || ""); setEditando(true); }}>
              <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
            </DropdownMenuItem>
          )}
          {temTexto && (
            <DropdownMenuItem onClick={copiar}>
              <Copy className="h-3.5 w-3.5 mr-2" /> Copiar texto
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {/* OS DOIS NOMES SÃO COMPLETOS, e nunca só "Apagar". A diferença
              entre eles é a coisa mais importante deste menu: um tira do
              aparelho do cliente, o outro não, e quem clica no errado sai
              achando que o cliente não viu uma mensagem que ele continua
              lendo. Nos dois casos a mensagem CONTINUA aqui, com tarja. */}
          {todos && (
            <DropdownMenuItem onClick={() => setConfirmar(true)} className="text-rose-300 focus:text-rose-200">
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Apagar para todos
            </DropdownMenuItem>
          )}
          {!jaSoParaMim && (
            <DropdownMenuItem onClick={fazerApagarMim}>
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Apagar só para mim
            </DropdownMenuItem>
          )}
          {/* A AUSÊNCIA EXPLICADA. Sem esta linha, quem procura "apagar para
              todos" numa mensagem velha acha que a tela está quebrada. */}
          {!todos && !msg.apagada && (
            <p className="px-2 py-1.5 text-[10.5px] text-muted-foreground/70 leading-snug max-w-[13rem]">
              {nossa
                ? `O WhatsApp só deixa apagar no aparelho do cliente em até ${JANELA_APAGAR_HORAS} h. Passou disso, só dá para apagar aqui.`
                : "Mensagem do cliente não dá para apagar no WhatsApp dele. Só aqui."}
            </p>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* ── apagar para todos: a confirmação diz o que some e onde ─────────── */}
      <Dialog open={confirmar} onOpenChange={(v) => { if (!apagando) setConfirmar(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-rose-400" /> Apagar para todos?
            </DialogTitle>
            <DialogDescription className="text-[12.5px]">
              Ela some do WhatsApp do cliente, como quando se apaga pelo celular.
              Aqui ela continua à vista, com uma tarja dizendo que foi apagada para todos,
              porque a conversa é registro e registro não perde linha.
            </DialogDescription>
          </DialogHeader>
          {temTexto && (
            <p className="rounded-lg bg-white/[0.04] ring-1 ring-white/[0.07] px-3 py-2 text-[12.5px] text-foreground/80 whitespace-pre-wrap break-words max-h-32 overflow-y-auto scrollbar-thin">
              {msg.texto}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" size="sm" disabled={apagando} onClick={() => setConfirmar(false)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={apagando} onClick={fazerApagarTodos}
              className="bg-rose-500/90 hover:bg-rose-500 text-white gap-1.5">
              {apagando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Apagar para todos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── editar ─────────────────────────────────────────────────────────── */}
      <Dialog open={editando} onOpenChange={(v) => { if (!salvando) setEditando(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" /> Editar mensagem
            </DialogTitle>
            <DialogDescription className="text-[12.5px]">
              O cliente vê o texto novo com a marca "editada", como no WhatsApp.
              {/* O relógio corre enquanto a pessoa escreve, e ela precisa saber
                  disso ANTES de reescrever um parágrafo inteiro. */}
              {" "}Ainda dá para editar por cerca de {minutosRestantesParaEditar(msg)} min.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={4}
            autoFocus
            className="text-[13px] resize-none"
          />
          <DialogFooter>
            <Button variant="ghost" size="sm" disabled={salvando} onClick={() => setEditando(false)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={salvando || !texto.trim()} onClick={salvarEdicao} className="gap-1.5">
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
