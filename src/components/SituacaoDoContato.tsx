import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown, Loader2, ArrowRight, MinusCircle, PlusCircle, BellOff, BellRing, Users } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SITUACOES_DEF, defDaSituacao, consequenciasDaTroca, type Situacao,
} from "@/lib/situacaoDoContato";

/* O QUE ESTA PESSOA É, ANTES DE QUALQUER OUTRA COISA NA FICHA.
 *
 * Fica ACIMA do dossiê, e não dentro dele, porque não é um dado da pessoa: é a
 * decisão que escolhe quais dados aparecem. Lead vê jornada e follow-up.
 * Cliente vê processos e pendências. Contraparte vê o mínimo. Colocar isso no
 * meio do dossiê seria esconder a alavanca dentro do que ela move.
 *
 * É UMA ETIQUETA QUE ABRE. Fechada, ocupa uma linha e diz o que a pessoa é.
 * Aberta, mostra as cinco opções com a explicação de cada uma.
 *
 * E A TROCA PEDE CONFIRMAÇÃO, porque não é troca de etiqueta: a ficha muda de
 * forma no segundo seguinte, seções somem, outras aparecem, e a pessoa entra
 * ou sai da régua de cobrança. Um clique escorregado aqui tira alguém do funil
 * ou põe o advogado do banco na cadência de follow-up. O "tem certeza?" diz
 * EXATAMENTE o que vai acontecer, calculado da mesma regra que desenha a ficha,
 * e não um aviso genérico escrito para a tela de ontem.
 */

const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };
const CURVA = [0.22, 1, 0.36, 1] as const;

const TOM: Record<Situacao, { etiqueta: string; ponto: string; botao: string }> = {
  lead:        { etiqueta: "bg-primary/12 text-primary ring-primary/30",             ponto: "bg-primary",            botao: "" },
  cliente:     { etiqueta: "bg-emerald-400/12 text-emerald-300 ring-emerald-400/30", ponto: "bg-emerald-400",        botao: "bg-emerald-500 hover:bg-emerald-500/90 text-white" },
  contraparte: { etiqueta: "bg-amber-400/12 text-amber-300 ring-amber-400/30",       ponto: "bg-amber-400",          botao: "bg-amber-500 hover:bg-amber-500/90 text-black" },
  interno:     { etiqueta: "bg-sky-400/12 text-sky-300 ring-sky-400/30",             ponto: "bg-sky-400",            botao: "bg-sky-500 hover:bg-sky-500/90 text-white" },
  outro:       { etiqueta: "bg-white/[0.06] text-muted-foreground ring-white/[0.12]", ponto: "bg-muted-foreground/60", botao: "" },
};

export function SituacaoDoContato({ situacao, sugerida, nomeDaPessoa, ocupado = false, podeMudar = true, onMudar }: {
  situacao: Situacao;
  /** quando os dados sugerem algo diferente do gravado, a tela avisa */
  sugerida?: Situacao;
  /** para o "tem certeza?" falar da pessoa pelo nome */
  nomeDaPessoa?: string;
  ocupado?: boolean;
  podeMudar?: boolean;
  onMudar: (s: Situacao) => void;
}) {
  const [aberto, setAberto] = useState(false);
  /* A escolha fica PENDENTE até a confirmação. Nada muda no banco, nada muda
     na ficha, até a pessoa ler o que vai acontecer e dizer que sim. */
  const [pendente, setPendente] = useState<Situacao | null>(null);
  const def = defDaSituacao(situacao);
  const tom = TOM[situacao];
  const divergiu = sugerida && sugerida !== situacao;

  const escolher = (s: Situacao) => {
    setAberto(false);
    if (s !== situacao) setPendente(s);
  };
  const confirmar = () => {
    if (!pendente) return;
    onMudar(pendente);
    setPendente(null);
  };

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
                    onClick={() => escolher(d.chave)}
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

      <ConfirmarTroca
        de={situacao}
        para={pendente}
        nome={nomeDaPessoa}
        ocupado={ocupado}
        onCancelar={() => setPendente(null)}
        onConfirmar={confirmar}
      />
    </div>
  );
}

/* ── o "tem certeza?" ─────────────────────────────────────────────────────── */

function ConfirmarTroca({ de, para, nome, ocupado, onCancelar, onConfirmar }: {
  de: Situacao;
  para: Situacao | null;
  nome?: string;
  ocupado: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const alvo = para ?? de;
  const c = consequenciasDaTroca(de, alvo);
  const nadaMuda = c.ganha.length === 0 && c.perde.length === 0 && !c.saiDaRegua && !c.voltaARegua;

  return (
    <Dialog open={!!para} onOpenChange={(o) => { if (!o) onCancelar(); }}>
      <DialogContent className="max-w-sm [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="text-[15px] flex items-center gap-2 flex-wrap">
            Tem certeza?
            <span className="inline-flex items-center gap-1.5 text-[12px] font-normal text-muted-foreground">
              <span className={cn("rounded px-1.5 py-0.5 ring-1 text-[11px]", TOM[de].etiqueta)}>{defDaSituacao(de).rotulo}</span>
              <ArrowRight className="h-3 w-3" />
              <span className={cn("rounded px-1.5 py-0.5 ring-1 text-[11px]", TOM[alvo].etiqueta)}>{defDaSituacao(alvo).rotulo}</span>
            </span>
          </DialogTitle>
          <DialogDescription className="text-[12px]">
            {nome ? <span className="text-foreground/80">{nome}</span> : "Esta pessoa"} passa a ser{" "}
            <span className="text-foreground/80">{defDaSituacao(alvo).rotulo.toLowerCase()}</span>. Isso muda a ficha na hora.
          </DialogDescription>
        </DialogHeader>

        {/* CADA LINHA É UMA CONSEQUÊNCIA REAL, tirada da mesma regra que desenha
            a ficha. Se um dia a regra mudar, este aviso muda junto, sem ninguém
            ter que lembrar de atualizar um texto. */}
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {c.perde.length > 0 && (
              <Bloco chave="perde" Ico={MinusCircle} tom="text-rose-300" titulo="Some da ficha" itens={c.perde} atraso={0} />
            )}
            {c.ganha.length > 0 && (
              <Bloco chave="ganha" Ico={PlusCircle} tom="text-emerald-300" titulo="Passa a aparecer" itens={c.ganha} atraso={0.05} />
            )}
            {c.saiDaRegua && (
              <Linha chave="sai" Ico={BellOff} tom="text-amber-300" atraso={0.1}
                texto="Sai da régua de cobrança. O follow-up automático para de escrever para esta pessoa." />
            )}
            {c.voltaARegua && (
              <Linha chave="volta" Ico={BellRing} tom="text-primary" atraso={0.1}
                texto="Volta a poder entrar na régua, seguindo o que o número decide." />
            )}
            {nadaMuda && (
              <Linha chave="nada" Ico={Check} tom="text-muted-foreground" atraso={0}
                texto="A ficha não muda de forma. Só a etiqueta." />
            )}
            <Linha chave="grupo" Ico={Users} tom="text-muted-foreground" atraso={0.15}
              texto="Vale para todos os números em que esta pessoa está." />
          </AnimatePresence>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" className="h-8 text-[11px]" onClick={onCancelar} disabled={ocupado}>
            Deixar como está
          </Button>
          <Button size="sm" className={cn("h-8 gap-1.5 text-[11px]", TOM[alvo].botao)} onClick={onConfirmar} disabled={ocupado}>
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Sim, virar {defDaSituacao(alvo).rotulo.toLowerCase()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Bloco({ chave, Ico, tom, titulo, itens, atraso }: {
  chave: string; Ico: typeof Check; tom: string; titulo: string; itens: string[]; atraso: number;
}) {
  return (
    <motion.div key={chave}
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
      transition={{ ...MOLA, delay: atraso }}
      className="rounded-lg bg-white/[0.03] ring-1 ring-white/[0.07] px-3 py-2">
      <p className={cn("text-[10px] uppercase tracking-wide flex items-center gap-1.5 mb-1", tom)}>
        <Ico className="h-3 w-3" /> {titulo}
      </p>
      <ul className="text-[12px] text-foreground/85 leading-relaxed">
        {itens.map((it) => <li key={it}>{it}</li>)}
      </ul>
    </motion.div>
  );
}

function Linha({ chave, Ico, tom, texto, atraso }: {
  chave: string; Ico: typeof Check; tom: string; texto: string; atraso: number;
}) {
  return (
    <motion.p key={chave}
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
      transition={{ ...MOLA, delay: atraso }}
      className="flex items-start gap-2 text-[11.5px] text-foreground/80 leading-snug px-1">
      <Ico className={cn("h-3.5 w-3.5 shrink-0 mt-[1px]", tom)} /> {texto}
    </motion.p>
  );
}
