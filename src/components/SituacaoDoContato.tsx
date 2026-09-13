import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SITUACOES_DEF, defDaSituacao, type Situacao } from "@/lib/situacaoDoContato";

/* O QUE ESTA PESSOA É, ANTES DE QUALQUER OUTRA COISA NA FICHA.
 *
 * Fica ACIMA do dossiê, e não dentro dele, porque não é um dado da pessoa: é a
 * decisão que escolhe quais dados aparecem. Lead vê jornada e follow-up.
 * Cliente vê processos e pendências. Contraparte vê o mínimo. Colocar isso no
 * meio do dossiê seria esconder a alavanca dentro do que ela move.
 *
 * É UMA ETIQUETA QUE ABRE. Fechada, ocupa uma linha e diz o que a pessoa é.
 * Aberta, mostra as cinco opções com a explicação de cada uma. Ninguém precisa
 * lembrar o que "contraparte" significa: está escrito ao lado, na hora de
 * escolher.
 */

const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };
const CURVA = [0.22, 1, 0.36, 1] as const;

const TOM: Record<Situacao, { etiqueta: string; ponto: string }> = {
  lead:        { etiqueta: "bg-primary/12 text-primary ring-primary/30",             ponto: "bg-primary" },
  cliente:     { etiqueta: "bg-emerald-400/12 text-emerald-300 ring-emerald-400/30", ponto: "bg-emerald-400" },
  contraparte: { etiqueta: "bg-amber-400/12 text-amber-300 ring-amber-400/30",       ponto: "bg-amber-400" },
  interno:     { etiqueta: "bg-sky-400/12 text-sky-300 ring-sky-400/30",             ponto: "bg-sky-400" },
  outro:       { etiqueta: "bg-white/[0.06] text-muted-foreground ring-white/[0.12]", ponto: "bg-muted-foreground/60" },
};

export function SituacaoDoContato({ situacao, sugerida, ocupado = false, podeMudar = true, onMudar }: {
  situacao: Situacao;
  /** quando os dados sugerem algo diferente do gravado, a tela avisa */
  sugerida?: Situacao;
  ocupado?: boolean;
  podeMudar?: boolean;
  onMudar: (s: Situacao) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const def = defDaSituacao(situacao);
  const tom = TOM[situacao];
  const divergiu = sugerida && sugerida !== situacao;

  return (
    <div className="px-3 pt-3 pb-1">
      <p className="text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground/60 mb-1.5">
        Situação do contato
      </p>

      <button
        onClick={() => podeMudar && setAberto((v) => !v)}
        disabled={!podeMudar || ocupado}
        className={cn(
          "w-full flex items-center gap-2 rounded-lg px-2.5 py-2 ring-1 text-left transition-colors",
          tom.etiqueta,
          podeMudar && "hover:brightness-110",
        )}
      >
        <span className={cn("h-2 w-2 rounded-full shrink-0", tom.ponto)} />
        <span className="text-[12.5px] font-semibold flex-1">{def.rotulo}</span>
        {ocupado
          ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          : podeMudar && (
            <motion.span animate={{ rotate: aberto ? 180 : 0 }} transition={MOLA} className="shrink-0">
              <ChevronDown className="h-3.5 w-3.5" />
            </motion.span>
          )}
      </button>

      {/* OS DADOS DISCORDAM DO QUE ESTÁ GRAVADO. Não muda sozinho: uma pessoa
          que a equipe marcou como interno continua interno mesmo tendo ficha de
          cliente. Mas avisa, porque a ficha de cliente apareceu depois e alguém
          pode querer saber. */}
      <AnimatePresence>
        {divergiu && !aberto && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: CURVA }}
            className="overflow-hidden text-[10.5px] text-muted-foreground/70 mt-1.5 leading-snug"
          >
            Os dados sugerem <span className="text-foreground/80">{defDaSituacao(sugerida!).rotulo.toLowerCase()}</span>.
            {" "}Abra para trocar, se for o caso.
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: CURVA }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-1 pt-1.5">
              {SITUACOES_DEF.map((d, i) => {
                const ativa = d.chave === situacao;
                return (
                  <motion.button
                    key={d.chave}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...MOLA, delay: i * 0.035 }}
                    onClick={() => { setAberto(false); if (!ativa) onMudar(d.chave); }}
                    className={cn(
                      "flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-left ring-1 transition-colors",
                      ativa
                        ? "bg-white/[0.06] ring-white/[0.14]"
                        : "ring-transparent hover:bg-white/[0.05] hover:ring-white/[0.08]",
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full shrink-0 mt-[5px]", TOM[d.chave].ponto)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium">{d.rotulo}</span>
                      <span className="block text-[10.5px] text-muted-foreground/70 leading-snug">{d.descricao}</span>
                    </span>
                    {ativa && <Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-foreground/70" />}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
