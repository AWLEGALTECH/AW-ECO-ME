import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronsUp, PartyPopper } from "lucide-react";
import { avancoEntre, duracaoDoPop, type Avanco } from "@/lib/avancoDeEtapa";
import type { Jornada } from "@/lib/jornada";

/* O LEAD ANDOU, E QUEM ESTÁ CONVERSANDO VÊ.
 *
 * A jornada da coluna da direita diz onde o lead ESTÁ. Ela não diz quando ele
 * se mexeu: a bolinha aparece preenchida da próxima vez que alguém olha para
 * lá. E o avanço quase sempre acontece com os olhos na conversa, não na coluna:
 * o cliente manda o PDF, o ZapSign avisa que assinou, e o funil anda sozinho.
 *
 * Este selo aparece por dois segundos sobre a conversa e some. Ele NÃO é um
 * aviso: não pede clique, não espera resposta, não pode atrapalhar quem está
 * escrevendo. Por isso `pointer-events-none` e por isso ele mora acima da
 * última bolha, e não em cima do campo de digitar.
 */

const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };
const CURVA = [0.22, 1, 0.36, 1] as const;

export function PopDeAvanco({ conversaId, jornada, etapa }: {
  conversaId: string | null | undefined;
  jornada: Jornada | null | undefined;
  etapa: string | null | undefined;
}) {
  const [avanco, setAvanco] = useState<Avanco | null>(null);
  /* O QUE ESTAVA AQUI DA ÚLTIMA VEZ, junto com de qual conversa era.
     Guardar só a etapa faria trocar de lead parecer um pulo: sair de um lead em
     "Na base" e abrir outro em "Assinado" dispararia a festa do lead errado. */
  const anterior = useRef<{ id: string; etapa: string } | null>(null);
  const semMovimento = useReducedMotion();

  useEffect(() => {
    if (!conversaId || !etapa) { anterior.current = null; return; }
    const antes = anterior.current;
    anterior.current = { id: conversaId, etapa };
    // Conversa diferente (ou a primeira desta sessão): não há com o que comparar.
    if (!antes || antes.id !== conversaId) return;
    const a = avancoEntre(jornada, antes.etapa, etapa);
    if (a) setAvanco(a);
  }, [conversaId, etapa, jornada]);

  useEffect(() => {
    if (!avanco) return;
    const t = setTimeout(() => setAvanco(null), duracaoDoPop(avanco));
    return () => clearTimeout(t);
  }, [avanco]);

  const Ico = avanco?.chegada ? PartyPopper : ChevronsUp;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <AnimatePresence>
        {avanco && (
          <motion.div
            key={`${avanco.de}-${avanco.para}`}
            initial={semMovimento ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.9 }}
            animate={semMovimento ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={semMovimento ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.96 }}
            transition={{ ...MOLA, opacity: { duration: 0.2, ease: CURVA } }}
            className={[
              "relative overflow-hidden rounded-full pl-3 pr-4 py-2 flex items-center gap-2.5",
              "backdrop-blur-md ring-1 shadow-lg shadow-black/40",
              avanco.chegada
                ? "bg-emerald-500/20 ring-emerald-400/40 text-emerald-50"
                : "bg-primary/20 ring-primary/40 text-foreground",
            ].join(" ")}>

            {/* O BRILHO QUE ATRAVESSA, uma vez só. É ele que faz o olho ir até
                ali sem que nada pisque: piscar interrompe a leitura, um brilho
                que passa apenas acontece no canto do olho. */}
            {!semMovimento && (
              <motion.span
                aria-hidden
                initial={{ x: "-120%" }}
                animate={{ x: "120%" }}
                transition={{ duration: 0.9, ease: CURVA, delay: 0.15 }}
                className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            )}

            <motion.span
              initial={semMovimento ? false : { scale: 0.5, rotate: avanco.chegada ? -20 : 0 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ ...MOLA, delay: 0.06 }}
              className={[
                "h-6 w-6 shrink-0 grid place-items-center rounded-full",
                avanco.chegada ? "bg-emerald-400/25" : "bg-primary/25",
              ].join(" ")}>
              <Ico className="h-3.5 w-3.5" />
            </motion.span>

            <span className="min-w-0">
              <span className="block text-[12.5px] font-semibold leading-tight truncate">
                {avanco.chegada ? `Fechou: ${avanco.para}` : avanco.para}
              </span>
              <span className="block text-[10px] leading-tight opacity-70 truncate">
                {avanco.chegada
                  ? `saiu de ${avanco.de}, e o funil acabou aqui`
                  : `saiu de ${avanco.de} · ${avanco.posicao} de ${avanco.total}`}
              </span>
            </span>

            {/* Quantas etapas andou de uma vez. Só aparece no pulo, porque no
                passo de um em um o número seria sempre "1" e viraria enfeite. */}
            {avanco.passos > 1 && (
              <span className="shrink-0 rounded-full bg-white/15 px-1.5 py-[1px] text-[9.5px] font-semibold tabular-nums">
                +{avanco.passos}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
