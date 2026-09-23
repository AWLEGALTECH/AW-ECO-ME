/* ── ESCOLHER AS COLUNAS ─────────────────────────────────────────────────
   Lista de marcar, com o NÚMERO da ordem em vez de um check: a ordem é o que
   decide a sequência das linhas no cartão do lead, e um check idêntico em
   todas esconderia justamente isso. Marcar de novo desmarca e as outras se
   renumeram sozinhas.

   Saiu de dentro do Atendimento.tsx em 23/09, quando o dossiê da conversa
   passou a escolher as SUAS colunas: a mesma lista serve às duas escolhas, e
   só o texto em volta muda. Duas cópias divergiriam na primeira correção. */
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/* A lista MUDA DE ORDEM sozinha: no dossiê ela abre com as colunas da linha e
   se reorganiza na ordem da planilha quando o cabeçalho chega pela rede. Sem
   `layout`, os itens pulariam de lugar na frente de quem ia clicar num deles. */
const MOLA = { type: "spring", stiffness: 380, damping: 34 } as const;

export function SeletorDeColunas({
  disponiveis, escolhidas, onAlternar,
  titulo = "Colunas no cartão do lead",
  semEscolha = "Sem nenhuma marcada, o cartão mostra tudo que a planilha trouxe.",
  vazio = "Essa planilha não tem colunas além do contato. O cartão vai mostrar só nome e telefone.",
}: {
  disponiveis: string[];
  escolhidas: string[];
  onAlternar: (c: string) => void;
  /** a frase de cima: onde as colunas vão aparecer */
  titulo?: string;
  /** a frase de baixo: o que acontece sem nenhuma marcada */
  semEscolha?: string;
  /** o que dizer quando não há coluna nenhuma para escolher */
  vazio?: string;
}) {
  if (disponiveis.length === 0) {
    return <p className="text-[11.5px] text-muted-foreground/70 py-2">{vazio}</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] text-muted-foreground">
        {titulo}
        {escolhidas.length > 0 && <span className="opacity-60"> · {escolhidas.length} marcada{escolhidas.length === 1 ? "" : "s"}</span>}
      </p>
      <div className="flex flex-col gap-1 max-h-[42vh] overflow-y-auto scrollbar-thin pr-0.5">
        {disponiveis.map((c) => {
          const i = escolhidas.indexOf(c);
          const marcada = i >= 0;
          return (
            <motion.button key={c} type="button" onClick={() => onAlternar(c)}
              layout transition={MOLA}
              className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left ring-1 transition-colors",
                marcada
                  ? "bg-primary/10 ring-primary/25"
                  : "bg-white/[0.03] ring-white/[0.07] hover:bg-white/[0.06]")}>
              <span className={cn("h-4.5 w-4.5 shrink-0 rounded grid place-items-center text-[9.5px] font-semibold tabular-nums ring-1",
                marcada
                  ? "bg-primary/20 text-primary ring-primary/30"
                  : "bg-white/[0.04] text-muted-foreground/50 ring-white/[0.08]")}>
                {marcada ? i + 1 : ""}
              </span>
              <span className={cn("text-[12px] truncate", marcada ? "text-foreground" : "text-muted-foreground")}>
                {c}
              </span>
            </motion.button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground/60 leading-snug">{semEscolha}</p>
    </div>
  );
}
