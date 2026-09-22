/* POR QUE ESTA AÇÃO CAIU — o bloco que abre junto com a demanda de reajuizamento.
 *
 * Existe por um buraco que ficou aberto três dias (chefe, 22/09): a demanda
 * nascia com o motivo escrito na descrição e com o motivo gravado no processo,
 * e a tela que abre ao clicar no cartão da esteira não mostrava nem um nem
 * outro. Quem ia reprotocolar via matéria, valor e um botão de baixar peça, e
 * não via a ÚNICA informação que essa demanda existe para carregar: o que fez
 * a ação cair, que é exatamente o que não pode se repetir.
 *
 * Fica no topo, antes de qualquer atalho, porque é o que muda o que a pessoa
 * vai fazer nos próximos dez segundos. É o mesmo raciocínio do
 * AvisoReajuizamento na ficha do processo, e a cor é a mesma: âmbar quer dizer
 * "algo terminou aqui, leia antes de seguir".
 *
 * O motivo chega de duas fontes, nesta ordem: o do PROCESSO, que é vivo e
 * corrigível, e o da DESCRIÇÃO da demanda, que é o retrato de quando ela
 * nasceu. O retrato serve enquanto o vivo não chega e quando o processo sumiu —
 * e é por isso que a demanda continua guardando o texto inteiro.
 */
import { motion } from "framer-motion";
import { RotateCcw, AlertTriangle, FileText } from "lucide-react";

export interface PorQueCaiuDados {
  /** o número do processo extinto */
  numero?: string | null;
  /** por que a ação caiu */
  motivo?: string | null;
  /** as observações que o processo extinto carregava */
  observacoes?: string | null;
}

export function PorQueCaiu({ numero, motivo, observacoes }: PorQueCaiuDados) {
  const temMotivo = !!motivo?.trim();
  const temObs = !!observacoes?.trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-xl ring-1 ring-amber-400/30 bg-amber-400/[0.07] px-4 py-3 space-y-2.5"
    >
      <div className="flex items-start gap-3">
        <span className="h-8 w-8 shrink-0 grid place-items-center rounded-lg ring-1 ring-amber-400/30 bg-amber-400/[0.07]">
          <RotateCcw className="h-4 w-4 text-amber-400" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.14em] font-medium text-amber-300">
            Reprotocolo de ação extinta
          </p>
          <p className="text-[13px] text-foreground/90 mt-0.5 leading-snug">
            Isto não é uma peça nova: é o mesmo pedido voltando ao fórum. Leia o motivo antes de
            protocolar, é o que não pode se repetir.
          </p>
          {/* O número inteiro, sem corte: é o que se consulta no tribunal e o
              que vai na petição nova. Um CNJ pela metade não serve para nada. */}
          {numero?.trim() && (
            <p className="mt-1.5 text-[12.5px] text-muted-foreground">
              <span className="text-muted-foreground/60">Processo extinto: </span>
              <span className="font-mono text-foreground/85 break-all">{numero.trim()}</span>
            </p>
          )}
        </div>
      </div>

      {/* O MOTIVO INTEIRO, sem corte e sem rolagem própria: cortar a informação
          mais cara do par para caber num cartão é o defeito que este bloco
          existe para consertar. */}
      <div className="rounded-lg bg-black/20 ring-1 ring-amber-400/20 px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-[0.15em] text-amber-300/90 font-semibold flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3" /> Por que caiu
        </p>
        <p className="text-[13px] text-foreground/90 mt-1 leading-snug whitespace-pre-wrap break-words">
          {temMotivo
            ? motivo!.trim()
            /* Sem motivo é um estado real: demanda gerada antes de o campo
               existir. Dizer onde ele se escreve vale mais que um traço. */
            : "Ninguém registrou o motivo da extinção. Ele se escreve na ficha do processo extinto, e aparece aqui."}
        </p>
      </div>

      {temObs && (
        <div className="rounded-lg bg-black/20 ring-1 ring-white/10 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold flex items-center gap-1.5">
            <FileText className="h-3 w-3" /> Observações do processo anterior
          </p>
          <p className="text-[13px] text-foreground/85 mt-1 leading-snug whitespace-pre-wrap break-words">
            {observacoes!.trim()}
          </p>
        </div>
      )}
    </motion.div>
  );
}
