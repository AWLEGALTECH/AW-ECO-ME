import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, CalendarDays, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import { dataParaYmd, diasAte, tomDoPrazo } from "@/lib/prazos";

const EASE = [0.22, 1, 0.36, 1] as const;
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export interface ItemPrazo {
  id: string;
  titulo: string;
  prazo?: string;
  processoId: string;
  processoNumero: string;
  clienteNome: string | null;
  desfecho?: string;
}

// Grade do mês: sempre começa no domingo da semana da primeira e termina no
// sábado da semana da última, então o quadro nunca fica torto.
function gradeDoMes(ano: number, mes: number): Date[] {
  const primeiro = new Date(ano, mes, 1);
  const inicio = new Date(ano, mes, 1 - primeiro.getDay());
  const ultimo = new Date(ano, mes + 1, 0);
  const fim = new Date(ano, mes + 1, ultimo.getDay() === 6 ? 0 : 6 - ultimo.getDay());
  const dias: Date[] = [];
  for (const d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) dias.push(new Date(d));
  return dias;
}

export function TarefasCalendario({ itens, onAbrir }: {
  itens: ItemPrazo[];
  onAbrir: (processoId: string) => void;
}) {
  const hoje = new Date();
  const [cursor, setCursor] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [diaSel, setDiaSel] = useState<string | null>(dataParaYmd(hoje));

  // Um índice por dia resolve a grade inteira sem varrer a lista 42 vezes.
  const porDia = useMemo(() => {
    const m = new Map<string, ItemPrazo[]>();
    for (const it of itens) {
      if (!it.prazo) continue;
      m.set(it.prazo, [...(m.get(it.prazo) ?? []), it]);
    }
    return m;
  }, [itens]);

  const semPrazo = useMemo(() => itens.filter((i) => !i.prazo).length, [itens]);
  const dias = useMemo(() => gradeDoMes(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const ymdHoje = dataParaYmd(hoje);
  const doDiaSel = diaSel ? (porDia.get(diaSel) ?? []) : [];

  const mover = (n: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        {/* Cabeçalho do mês */}
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-medium capitalize flex-1 min-w-0 truncate">
            {MESES[cursor.getMonth()]} <span className="text-muted-foreground">{cursor.getFullYear()}</span>
          </h3>
          <button onClick={() => { setCursor(new Date(hoje.getFullYear(), hoje.getMonth(), 1)); setDiaSel(ymdHoje); }}
            className="px-2.5 py-1 rounded-lg text-[11px] text-muted-foreground ring-1 ring-white/[0.08] hover:bg-white/[0.05] hover:text-foreground transition-colors">
            Hoje
          </button>
          <button onClick={() => mover(-1)} title="Mês anterior"
            className="h-7 w-7 grid place-items-center rounded-lg text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => mover(1)} title="Próximo mês"
            className="h-7 w-7 grid place-items-center rounded-lg text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {DIAS.map((d) => (
            <p key={d} className="text-[10px] uppercase tracking-wider text-muted-foreground text-center py-1">{d}</p>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {dias.map((d) => {
            const ymd = dataParaYmd(d);
            const doDia = porDia.get(ymd) ?? [];
            const foraDoMes = d.getMonth() !== cursor.getMonth();
            const eHoje = ymd === ymdHoje;
            const selecionado = ymd === diaSel;
            const abertas = doDia.filter((i) => !i.desfecho);
            const tom = tomDoPrazo(diasAte(ymd));

            return (
              <button
                key={ymd}
                onClick={() => setDiaSel(ymd)}
                className={cn(
                  "min-h-[74px] rounded-xl p-1.5 text-left transition-colors ring-1 flex flex-col gap-1",
                  selecionado ? "ring-primary/50 bg-primary/[0.07]"
                    : "ring-white/[0.05] hover:ring-white/[0.12] hover:bg-white/[0.03]",
                  foraDoMes && "opacity-35",
                )}
              >
                <span className={cn("text-[11px] tabular-nums leading-none grid place-items-center h-5 w-5 rounded-full shrink-0",
                  eHoje ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground")}>
                  {d.getDate()}
                </span>

                {/* Duas etiquetas e o resto vira contador: a célula precisa
                    caber num mês inteiro sem virar rolagem. */}
                {doDia.slice(0, 2).map((it) => (
                  <span key={it.id}
                    className={cn("block truncate rounded px-1 py-0.5 text-[9.5px] leading-tight ring-1",
                      it.desfecho ? "bg-white/[0.04] text-muted-foreground/70 ring-white/[0.06] line-through" : tom.chip)}>
                    {it.titulo}
                  </span>
                ))}
                {doDia.length > 2 && (
                  <span className="text-[9.5px] text-muted-foreground px-1">+{doDia.length - 2}</span>
                )}
                {!doDia.length && abertas.length === 0 && <span className="flex-1" />}
              </button>
            );
          })}
        </div>

        {semPrazo > 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-3">
            <CircleDot className="h-3 w-3 shrink-0" />
            {semPrazo} {semPrazo === 1 ? "tarefa não tem prazo" : "tarefas não têm prazo"} e não aparecem no calendário.
            Use a faixa "Sem prazo" para vê-las.
          </p>
        )}
      </div>

      {/* Dia escolhido */}
      <AnimatePresence mode="wait">
        <motion.div key={diaSel ?? "nenhum"}
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ ease: EASE, duration: 0.2 }}
          className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary shrink-0" />
            <p className="text-sm font-medium">
              {diaSel === ymdHoje ? "Hoje" : diaSel?.split("-").reverse().join("/")}
            </p>
            <span className="text-[11px] text-muted-foreground">
              {doDiaSel.length} {doDiaSel.length === 1 ? "tarefa" : "tarefas"}
            </span>
          </div>

          {doDiaSel.length === 0 ? (
            <p className="text-[12px] text-muted-foreground mt-3">Nenhum prazo neste dia.</p>
          ) : (
            <div className="mt-3 space-y-1.5">
              {doDiaSel.map((it) => (
                <button key={it.id} onClick={() => onAbrir(it.processoId)}
                  className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left ring-1 ring-white/[0.06] hover:ring-primary/30 hover:bg-white/[0.04] transition-colors">
                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0",
                    it.desfecho ? "bg-muted-foreground/40" : "bg-primary")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[12.5px] truncate", it.desfecho && "line-through text-muted-foreground")}>
                      {it.titulo}
                    </span>
                    <span className="block text-[10.5px] text-muted-foreground truncate">
                      {it.processoNumero}{it.clienteNome ? ` · ${it.clienteNome}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
