import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  UserCheck, UserX, ArrowLeft, Loader2, Check, Send, Smartphone, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MOTIVOS_PERDIDO } from "@/lib/jornada";
import {
  destinosPossiveis, impedimentoDaVirada, explicarImpedimento,
  motivoDoDescarte, mensagemDeBoasVindas,
  type InstanciaEscolhivel,
} from "@/lib/leadViraCliente";

/* AS DUAS ÚNICAS SAÍDAS DE UM LEAD.
 *
 * "Finalizar atendimento" era um interruptor: ligava e desligava a régua de
 * cobrança. Mas um lead não termina de um jeito só. Ou ele fecha e passa a ser
 * cliente, ou ele deu pra trás, e as consequências são opostas: um vira uma
 * conversa nova num número novo, o outro sai do funil com um motivo que, somado
 * aos outros, diz onde o funil vaza.
 *
 * Um interruptor não sabe diferenciar os dois. Esta tela sabe, e pergunta.
 *
 * ─────────────────────────── por que em três passos ─────────────────────────
 *
 * A escolha vem primeiro e sozinha, grande, porque é a decisão que importa. Só
 * depois de escolhida é que aparece o que aquele caminho precisa: o motivo, no
 * descarte; o número de destino, na virada. Pedir as duas coisas de uma vez
 * faria a tela mostrar campos que a metade das vezes não serve para nada.
 *
 * E A MENSAGEM NÃO SE ENVIA AQUI. Ela chega escrita na barra da conversa, e
 * quem aperta o enter lê antes. É a primeira palavra do escritório com alguém
 * que acabou de assinar um contrato.
 */

const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };
const CURVA = [0.22, 1, 0.36, 1] as const;

type Passo = "escolha" | "descartar" | "virar";

export function FinalizarAtendimento({
  aberto, onOpenChange, nomeDoLead, instanciaAtual, instancias,
  jaVirouEm, mensagemDoDestino, ocupado = false,
  onDescartar, onVirarCliente,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  nomeDoLead: string;
  /** o número onde a conversa está hoje, que não pode ser o destino */
  instanciaAtual: string | null;
  instancias: InstanciaEscolhivel[];
  /** quando já virou cliente, para a tela não oferecer de novo */
  jaVirouEm?: string | null;
  /** a mensagem configurada do número escolhido, para a prévia */
  mensagemDoDestino?: (instancia: string) => string | null | undefined;
  ocupado?: boolean;
  onDescartar: (motivo: string) => void;
  onVirarCliente: (instancia: string) => void;
}) {
  const [passo, setPasso] = useState<Passo>("escolha");
  const [motivo, setMotivo] = useState("");
  const [detalhe, setDetalhe] = useState("");
  const [destino, setDestino] = useState("");

  const destinos = useMemo(
    () => destinosPossiveis(instancias, instanciaAtual),
    [instancias, instanciaAtual]);
  const impedimento = impedimentoDaVirada({ jaVirouEm, destinos });

  /* Fechar zera tudo: reabrir e encontrar a escolha de ontem pela metade é a
     maneira mais fácil de descartar o lead errado. */
  const mudar = (v: boolean) => {
    onOpenChange(v);
    if (!v) setTimeout(() => { setPasso("escolha"); setMotivo(""); setDetalhe(""); setDestino(""); }, 200);
  };

  const previa = destino
    ? mensagemDeBoasVindas(mensagemDoDestino?.(destino), nomeDoLead)
    : "";

  return (
    <Dialog open={aberto} onOpenChange={mudar}>
      <DialogContent className="max-w-md [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="text-[15px] flex items-center gap-2">
            {passo === "escolha" && <Check className="h-4 w-4" />}
            {passo === "descartar" && <UserX className="h-4 w-4 text-rose-400" />}
            {passo === "virar" && <UserCheck className="h-4 w-4 text-emerald-400" />}
            {passo === "escolha" ? "Como termina este atendimento?"
              : passo === "descartar" ? "Por que o lead saiu?"
              : "Para qual número ele vai?"}
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            <span className="text-foreground/80">{nomeDoLead}</span>
            {passo === "escolha" && " está saindo da sua fila. O que aconteceu com ele decide para onde vai."}
            {passo === "descartar" && ". O motivo é o que, somado aos outros, diz onde o funil vaza."}
            {passo === "virar" && " passa a ser atendido pelo número que você escolher."}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait" initial={false}>
          {passo === "escolha" && (
            <motion.div
              key="escolha"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.22, ease: CURVA }}
              className="flex flex-col gap-2"
            >
              <Caminho
                Ico={UserCheck}
                titulo="Virou cliente"
                descricao="Passa para o número do atendimento de cliente, com a mensagem de boas-vindas pronta na barra."
                tom="emerald"
                atraso={0}
                impedido={explicarImpedimento(impedimento)}
                aoClicar={() => setPasso("virar")}
              />
              <Caminho
                Ico={UserX}
                titulo="Descartar lead"
                descricao="Ele deu pra trás. Marca como perdido com o motivo, desliga a cobrança e arquiva."
                tom="rose"
                atraso={0.05}
                aoClicar={() => setPasso("descartar")}
              />
            </motion.div>
          )}

          {passo === "descartar" && (
            <motion.div
              key="descartar"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.22, ease: CURVA }}
              className="flex flex-col gap-1.5"
            >
              {MOTIVOS_PERDIDO.map((m, i) => (
                <motion.button
                  key={m}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...MOLA, delay: i * 0.04 }}
                  onClick={() => setMotivo(m)}
                  className={cn(
                    "text-left rounded-lg px-3 py-2 ring-1 transition-colors",
                    motivo === m
                      ? "bg-rose-500/[0.10] ring-rose-400/40"
                      : "bg-white/[0.03] ring-white/[0.07] hover:bg-white/[0.07] hover:ring-white/[0.14]",
                  )}
                >
                  <span className="text-[12.5px] font-medium flex items-center gap-2">
                    {motivo === m && <Check className="h-3.5 w-3.5 text-rose-400 shrink-0" />}
                    {m}
                  </span>
                </motion.button>
              ))}

              {/* O CAMPO LIVRE É OPCIONAL e fica embaixo: a lista cobre o comum,
                  e "Desistiu: achou caro" diz mais que qualquer um dos dois
                  sozinho, sem deixar de ser agrupável pelo começo. */}
              <Input
                value={detalhe}
                onChange={(e) => setDetalhe(e.target.value)}
                placeholder="detalhe, se quiser (opcional)"
                className="h-8 text-[12px] mt-1"
              />

              <div className="flex items-center justify-between gap-2 mt-2">
                <Voltar aoClicar={() => setPasso("escolha")} />
                <Button
                  size="sm" variant="destructive" className="h-8 gap-1.5 text-[11px]"
                  disabled={!motivo || ocupado}
                  onClick={() => onDescartar(motivoDoDescarte(motivo, detalhe))}
                >
                  {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                  Descartar e arquivar
                </Button>
              </div>
            </motion.div>
          )}

          {passo === "virar" && (
            <motion.div
              key="virar"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.22, ease: CURVA }}
              className="flex flex-col gap-1.5"
            >
              {destinos.map((i, k) => (
                <motion.button
                  key={i.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...MOLA, delay: k * 0.04 }}
                  onClick={() => setDestino(i.nome)}
                  className={cn(
                    "text-left rounded-lg px-3 py-2 ring-1 transition-colors flex items-center gap-2",
                    destino === i.nome
                      ? "bg-emerald-500/[0.10] ring-emerald-400/40"
                      : "bg-white/[0.03] ring-white/[0.07] hover:bg-white/[0.07] hover:ring-white/[0.14]",
                  )}
                >
                  <Smartphone className={cn("h-3.5 w-3.5 shrink-0",
                    destino === i.nome ? "text-emerald-400" : "text-muted-foreground/60")} />
                  <span className="text-[12.5px] font-medium truncate flex-1">{i.nome}</span>
                  {destino === i.nome && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                </motion.button>
              ))}

              {/* A PRÉVIA DO QUE VAI FICAR ESCRITO. Ela aparece com o destino
                  porque cada número tem a sua redação, e ver o texto antes é o
                  que faz a pessoa perceber que o nome saiu torto de um extrato
                  lido por máquina. */}
              <AnimatePresence>
                {previa && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.24, ease: CURVA }}
                    className="overflow-hidden"
                  >
                    <div className="mt-1.5 rounded-lg border border-emerald-400/20 bg-emerald-500/[0.05] px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-emerald-400/70 mb-1 flex items-center gap-1">
                        <Send className="h-3 w-3" /> fica escrito na barra, esperando o enter
                      </p>
                      <p className="text-[12px] text-foreground/85 leading-relaxed">{previa}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center justify-between gap-2 mt-2">
                <Voltar aoClicar={() => setPasso("escolha")} />
                <Button
                  size="sm" className="h-8 gap-1.5 text-[11px]"
                  disabled={!destino || ocupado}
                  onClick={() => onVirarCliente(destino)}
                >
                  {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
                  Levar para lá
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

/* ── um dos dois caminhos ─────────────────────────────────────────────────── */

function Caminho({ Ico, titulo, descricao, tom, atraso, impedido, aoClicar }: {
  Ico: typeof UserCheck;
  titulo: string;
  descricao: string;
  tom: "emerald" | "rose";
  atraso: number;
  /** quando preenchido, o caminho não serve e a tela diz por quê */
  impedido?: string;
  aoClicar: () => void;
}) {
  const cor = tom === "emerald"
    ? { ico: "text-emerald-400", anel: "hover:ring-emerald-400/40 hover:bg-emerald-500/[0.07]" }
    : { ico: "text-rose-400", anel: "hover:ring-rose-400/40 hover:bg-rose-500/[0.07]" };

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...MOLA, delay: atraso }}
      onClick={aoClicar}
      disabled={!!impedido}
      className={cn(
        "text-left rounded-xl px-3.5 py-3 ring-1 bg-white/[0.03] ring-white/[0.07] transition-colors",
        "flex items-start gap-3",
        impedido ? "opacity-50 cursor-not-allowed" : cor.anel,
      )}
    >
      <Ico className={cn("h-4 w-4 mt-0.5 shrink-0", impedido ? "text-muted-foreground/50" : cor.ico)} />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{titulo}</span>
        <span className="block text-[11.5px] text-muted-foreground mt-0.5 leading-snug">
          {descricao}
        </span>
        {/* O IMPEDIMENTO SE EXPLICA. Botão apagado sem motivo faz a pessoa
            clicar de novo achando que a tela travou. */}
        {impedido && (
          <span className="mt-1.5 flex items-center gap-1 text-[10.5px] text-amber-500">
            <AlertTriangle className="h-3 w-3 shrink-0" /> {impedido}
          </span>
        )}
      </span>
    </motion.button>
  );
}

function Voltar({ aoClicar }: { aoClicar: () => void }) {
  return (
    <button onClick={aoClicar}
      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
      <ArrowLeft className="h-3.5 w-3.5" /> Voltar
    </button>
  );
}
