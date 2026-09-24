/* POR QUE ESTA AÇÃO CAIU — o bloco que abre junto com a demanda de reajuizamento.
 *
 * Existe por um buraco que ficou aberto três dias (chefe, 22/09): a demanda
 * nascia com o motivo escrito na descrição e com o motivo gravado no processo,
 * e a tela que abre ao clicar no cartão da esteira não mostrava nem um nem
 * outro. Quem ia reprotocolar via matéria, valor e um botão de baixar peça, e
 * não via a ÚNICA informação que essa demanda existe para carregar: o que fez
 * a ação cair, que é exatamente o que não pode se repetir.
 *
 * COMPACTO DE PROPÓSITO (24/09). A primeira versão tinha uma frase explicando
 * que aquilo era um reprotocolo, repetindo o subtítulo do diálogo, e o número
 * do processo extinto num parágrafo à parte. O diálogo passou da altura da
 * tela, rolava, e a rolagem cortava o topo deste bloco. Agora o motivo é o
 * corpo, e o número com o link para o processo mora num rodapé do próprio
 * bloco, o que também dispensou um cartão inteiro de "abrir o processo".
 *
 * O CONTORNO É POR DENTRO (`ring-inset`). O bloco vive numa área que rola, e
 * contorno desenhado por fora da caixa é cortado pela borda dessa área: era o
 * canto "comido" que aparecia no topo.
 *
 * O LÁPIS edita o motivo ali mesmo. Quem salva é quem abriu o bloco (o espelho
 * do protocolo), porque o motivo mora em dois lugares, o processo e a demanda,
 * e este componente não deve saber disso.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Pencil, ArrowRight, FileText } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const MOLA = { type: "spring", stiffness: 380, damping: 34 } as const;
const CURVA = [0.22, 1, 0.36, 1] as const;

export interface PorQueCaiuDados {
  /** o número do processo extinto */
  numero?: string | null;
  /** por que a ação caiu */
  motivo?: string | null;
  /** as observações que o processo extinto carregava */
  observacoes?: string | null;
  /** o id do processo extinto, para o link do rodapé */
  processoId?: string | null;
  /** grava o motivo novo; sem isto, não há lápis. Rejeitar mantém a edição aberta. */
  onSalvarMotivo?: (novo: string) => Promise<void>;
}

export function PorQueCaiu({ numero, motivo, observacoes, processoId, onSalvarMotivo }: PorQueCaiuDados) {
  const temMotivo = !!motivo?.trim();
  const temObs = !!observacoes?.trim();
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const [salvando, setSalvando] = useState(false);

  const abrir = () => { setRascunho(motivo?.trim() ?? ""); setEditando(true); };
  const cancelar = () => { if (!salvando) setEditando(false); };
  const salvar = async () => {
    if (!onSalvarMotivo || !rascunho.trim() || salvando) return;
    setSalvando(true);
    try {
      await onSalvarMotivo(rascunho);
      setEditando(false);
    } catch {
      /* quem salva já avisou o que deu errado; a edição fica aberta para
         a pessoa não perder o que escreveu */
    } finally {
      setSalvando(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ layout: MOLA, duration: 0.28, ease: CURVA }}
      className="rounded-xl ring-1 ring-inset ring-amber-400/30 bg-amber-400/[0.07] overflow-hidden"
    >
      <div className="px-4 pt-3 pb-3 flex flex-col gap-2">
        <div className="flex items-center gap-2 min-h-7">
          <span className="h-6 w-6 shrink-0 grid place-items-center rounded-md ring-1 ring-inset ring-amber-400/25 bg-amber-400/10">
            <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
          </span>
          <p className="text-[10.5px] uppercase tracking-[0.14em] font-semibold text-amber-300">
            Por que caiu
          </p>
          {onSalvarMotivo && !editando && (
            <button type="button" onClick={abrir}
              aria-label="Editar o motivo do reajuizamento"
              title="Editar o motivo"
              className="ml-auto h-7 w-7 shrink-0 grid place-items-center rounded-md text-amber-300/70
                         hover:text-amber-200 hover:bg-amber-400/10 transition-colors">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {editando ? (
            <motion.div key="editando"
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: CURVA }}
              className="flex flex-col gap-2">
              <Textarea
                autoFocus
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelar(); }
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void salvar(); }
                }}
                rows={Math.min(6, Math.max(2, rascunho.split("\n").length))}
                placeholder="O que fez a ação cair, e o que não pode se repetir no reprotocolo"
                className="min-h-[56px] text-[13px] leading-snug resize-none bg-black/20 border-amber-400/25
                           focus-visible:ring-amber-400/40"
              />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="mr-auto text-[10.5px] text-amber-200/60 leading-snug">
                  Vale para a ficha do processo e para esta demanda.
                </span>
                <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={cancelar} disabled={salvando}>
                  Cancelar
                </Button>
                <Button size="sm" className="h-7 text-[11px]" onClick={() => void salvar()}
                  disabled={salvando || !rascunho.trim()}>
                  {salvando ? "Salvando…" : "Salvar"}
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.p key="lendo"
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: CURVA }}
              /* O MOTIVO INTEIRO, sem corte e sem rolagem própria: cortar a
                 informação mais cara do par para caber num cartão é o defeito
                 que este bloco existe para consertar. */
              className="text-[13.5px] text-foreground/90 leading-snug whitespace-pre-wrap break-words">
              {temMotivo
                ? motivo!.trim()
                /* Sem motivo é um estado real: demanda gerada antes de o
                   campo existir. Dizer como escrever vale mais que um traço. */
                : onSalvarMotivo
                  ? "Ninguém registrou o motivo da extinção. Use o lápis para escrever."
                  : "Ninguém registrou o motivo da extinção."}
            </motion.p>
          )}
        </AnimatePresence>

        {temObs && (
          <div className="pt-2 mt-0.5 border-t border-amber-400/15">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold flex items-center gap-1.5">
              <FileText className="h-3 w-3" /> Observações do processo anterior
            </p>
            <p className="text-[12.5px] text-foreground/80 mt-1 leading-snug whitespace-pre-wrap break-words">
              {observacoes!.trim()}
            </p>
          </div>
        )}
      </div>

      {/* O NÚMERO INTEIRO, sem corte: é o que se consulta no tribunal e o que
          vai na petição nova. Um CNJ pela metade não serve para nada. Quebra de
          linha no celular em vez de reticências. */}
      {numero?.trim() && (
        <div className="px-4 py-2 border-t border-amber-400/15 bg-black/10 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11px] text-muted-foreground/70 shrink-0">Processo extinto</span>
          <span className="font-mono text-[12px] text-foreground/85 break-all">{numero.trim()}</span>
          {processoId && (
            <Link to={`/processos/${processoId}`}
              className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium
                         text-amber-300 hover:text-amber-200 hover:bg-amber-400/10 transition-colors">
              Abrir <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}
    </motion.div>
  );
}
