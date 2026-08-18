import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Hash, ChevronLeft, ChevronRight, Sparkles, Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { CounterStudio } from "@/components/marketing/CounterStudio";

const EASE = [0.22, 1, 0.36, 1] as const;

// Duas camadas de propósito: a SEÇÃO diz que tipo de material é, e o ACERVO
// lista as peças daquele tipo. Hoje há uma de cada, e mesmo assim vale separar:
// a próxima seção do marketing não vai ser animação, e sem essa divisão ela
// cairia no meio do acervo de vídeo como se fosse mais uma peça.
const SECOES = [
  {
    chave: "video",
    nome: "Material para edição de vídeo",
    resumo: "Animações prontas para configurar, baixar e montar no editor.",
    icone: Clapperboard,
    animacoes: [
      {
        chave: "counter",
        nome: "Counter",
        resumo: "Contagem rápida de zero até o valor, com cor e fundo à escolha.",
        icone: Hash,
      },
    ],
  },
] as const;

type Secao = typeof SECOES[number];
type Animacao = Secao["animacoes"][number];

// Card de navegação, igual nas duas camadas: o gesto é o mesmo, então a forma
// também deve ser.
function CardEntrada({ icone: Icone, nome, resumo, rodape, onClick }: {
  icone: typeof Hash; nome: string; resumo: string; rodape?: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className={cn(
        "group flex flex-col text-left rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 min-h-[150px]",
        "transition-all hover:border-primary/40 hover:bg-white/[0.05] hover:-translate-y-0.5",
      )}>
      <div className="flex items-start justify-between gap-2 w-full">
        <span className="h-9 w-9 rounded-xl bg-primary/12 ring-1 ring-primary/25 grid place-items-center shrink-0">
          <Icone className="h-4 w-4 text-primary" />
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors shrink-0" />
      </div>
      <p className="text-sm font-medium mt-3">{nome}</p>
      <p className="text-[11.5px] text-muted-foreground mt-1 leading-snug flex-1">{resumo}</p>
      {rodape && (
        <p className="text-[10.5px] text-muted-foreground/70 mt-2 pt-2 border-t border-white/[0.06] w-full">
          {rodape}
        </p>
      )}
    </button>
  );
}

export default function Marketing() {
  useEffect(() => { document.title = "Marketing · AW ECO ME"; }, []);
  const [secao, setSecao] = useState<Secao | null>(null);
  const [animacao, setAnimacao] = useState<Animacao | null>(null);

  // A trilha é a única forma de saber onde se está quando o caminho tem três
  // níveis, e serve de volta em qualquer ponto.
  const trilha: { rotulo: string; voltar?: () => void }[] = [
    { rotulo: "Marketing", voltar: secao ? () => { setSecao(null); setAnimacao(null); } : undefined },
    ...(secao ? [{ rotulo: secao.nome, voltar: animacao ? () => setAnimacao(null) : undefined }] : []),
    ...(animacao ? [{ rotulo: animacao.nome }] : []),
  ];

  const voltarUmNivel = () => {
    if (animacao) setAnimacao(null);
    else setSecao(null);
  };

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
        <h2 className="font-display text-3xl font-medium tracking-tight">Marketing</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Material de apoio para produção e divulgação.
        </p>
      </motion.div>

      {secao && (
        <div className="flex items-center gap-1.5 flex-wrap text-[11.5px]">
          <button onClick={voltarUmNivel} title="Voltar"
            className="h-7 w-7 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors shrink-0">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {trilha.map((n, i) => (
            <span key={n.rotulo} className="inline-flex items-center gap-1.5 min-w-0">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
              <button onClick={n.voltar} disabled={!n.voltar}
                className={cn("truncate px-1 py-0.5 rounded",
                  n.voltar ? "text-muted-foreground hover:text-foreground hover:bg-white/[0.05]"
                    : "text-foreground font-medium")}>
                {n.rotulo}
              </button>
            </span>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* Nível 3: a peça aberta */}
        {animacao ? (
          <motion.div key={`peca-${animacao.chave}`}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}>
            {animacao.chave === "counter" && <CounterStudio />}
          </motion.div>

        /* Nível 2: o acervo da seção */
        ) : secao ? (
          <motion.div key={`acervo-${secao.chave}`}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {secao.animacoes.map((a) => (
              <CardEntrada key={a.chave} icone={a.icone} nome={a.nome} resumo={a.resumo}
                onClick={() => setAnimacao(a)} />
            ))}
            <Card className="border-dashed grid place-items-center min-h-[150px] p-4 text-center">
              <div>
                <Sparkles className="h-5 w-5 text-muted-foreground/40 mx-auto" />
                <p className="text-[11.5px] text-muted-foreground mt-2">Mais animações entram aqui</p>
              </div>
            </Card>
          </motion.div>

        /* Nível 1: as seções */
        ) : (
          <motion.div key="secoes"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {SECOES.map((s) => (
              <CardEntrada key={s.chave} icone={s.icone} nome={s.nome} resumo={s.resumo}
                rodape={`${s.animacoes.length} ${s.animacoes.length === 1 ? "animação disponível" : "animações disponíveis"}`}
                onClick={() => setSecao(s)} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
