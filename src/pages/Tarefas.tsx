import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { SpotlightCard } from "@/components/SpotlightCard";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import {
  Search, FileText, CalendarDays, LayoutGrid, GitBranchPlus, ListTodo, Loader2,
  CalendarRange, ArrowDownWideNarrow, ArrowUpWideNarrow, ChevronRight, Rows3, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ICONE_TIPO, LABEL_TIPO, DESFECHOS, prazoInfo,
  type Task, type Etapa, type TaskTipo,
} from "@/components/ProcessoTimeline";
import { TarefasCalendario } from "@/components/TarefasCalendario";
import { EditarTarefaDialog } from "@/components/EditarTarefaDialog";
import { TarefaDetalheDialog } from "@/components/TarefaDetalheDialog";
import { JANELAS, diasAte, naJanela, porPrazo, type Janela } from "@/lib/prazos";
import { salvarTarefaNoBanco, type PatchTarefa } from "@/lib/tarefas";

const EASE = [0.22, 1, 0.36, 1] as const;

// Espinha canônica do processo (mesma ordem gerada na linha temporal). As tasks
// são distribuídas ao longo dela conforme a etapa em que se encontram.
const ETAPAS_ORDEM = [
  "Distribuição da ação", "Decisão inicial (recebimento)", "Citação do réu",
  "Contestação", "Réplica", "Audiência de conciliação", "Instrução e provas",
  "Sentença", "Recurso", "Julgamento em 2º grau", "Trânsito em julgado",
  "Cumprimento de sentença",
];
const ordemEtapa = (t: string) => { const i = ETAPAS_ORDEM.indexOf(t); return i === -1 ? 99 : i; };

interface Proc { id: string; numero_processo: string; linha_temporal: unknown; clientes?: { nome: string } | null }
// `chave` existe porque o id da tarefa não é confiável como chave de lista:
// ele é um contador por processo e, em linhas temporais gravadas antes da
// correção do contador, o mesmo "t1" aparece duas vezes no mesmo processo.
// Chave repetida faz o React reaproveitar o nó errado, e a grade fica
// congelada numa ordem por mais que se troque a ordenação. Posição na etapa
// resolve: é única e não muda quando a lista é reordenada.
interface Item extends Task {
  chave: string;
  // Endereço pra edição: a tarefa mora dentro do jsonb do processo, e é etapa
  // + posição que a localiza lá dentro.
  etapaId: string; indice: number;
  etapaTitulo: string; processoId: string; processoNumero: string; clienteNome: string | null;
}

// Chip de status na cor do tema (mesmo do card de tarefa no processo).
function StatusChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 bg-primary/15 text-primary ring-primary/30 whitespace-nowrap max-w-full truncate">
      {label}
    </span>
  );
}

// Card de tarefa agregada: mesma estética do processo + referência do processo.
function TarefaCard({ it, onClick }: { it: Item; onClick: () => void }) {
  const Icon = ICONE_TIPO[it.tipo];
  const d = it.desfecho ? DESFECHOS[it.desfecho] : null;
  const DIcon = d?.icon;
  const prazo = it.tipo !== "pendencia" && !d ? prazoInfo(it.prazo) : null;
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex flex-col text-left rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-md p-3.5 min-h-[188px]",
        "shadow-[0_4px_20px_rgba(0,0,0,0.25)] transition-all hover:border-primary/40 hover:bg-white/[0.05] hover:-translate-y-0.5",
        d && "opacity-75",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="h-8 w-8 rounded-xl bg-primary/12 ring-1 ring-primary/25 grid place-items-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </span>
        {d && DIcon && <DIcon className={cn("h-5 w-5", d.text)} />}
      </div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-2.5">{LABEL_TIPO[it.tipo]}</p>
      <p className="text-sm font-medium leading-tight mt-0.5 line-clamp-2">{it.titulo}</p>
      {it.conteudo && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 flex-1">{it.conteudo}</p>}
      <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] space-y-1.5">
        {d && DIcon ? (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1", d.chip)}>
            <DIcon className="h-3 w-3" /> {d.label}
          </span>
        ) : (
          <StatusChip label={it.tipo === "pendencia" ? "Pendente" : it.status} />
        )}
        {prazo && (
          <p className={cn("flex items-center gap-1.5 text-[11px] leading-snug", prazo.cls)}>
            <CalendarDays className="h-3 w-3 shrink-0" /> {prazo.label}
          </p>
        )}
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-0.5">
          <FileText className="h-3 w-3 text-primary/60 shrink-0" />
          <span className="font-mono truncate">{it.processoNumero}</span>
          {it.clienteNome && <span className="truncate">· {it.clienteNome}</span>}
        </div>
      </div>
    </button>
  );
}

// Situação é um estado da tarefa, e vencida é um deles: não é um pedaço do
// calendário. Ela morava também na régua de prazo, contando outro critério com
// o mesmo nome (lá entravam as finalizadas em atraso, aqui não), então o mesmo
// rótulo mostrava dois números diferentes na mesma tela. Agora mora só aqui.
//
// Vencida é subconjunto de Em aberto, então os quatro cartões não somam o
// total: Total = Em aberto + Finalizadas, e Vencidas é um recorte de Em aberto.
type Situacao = "todas" | "aberto" | "vencidas" | "finalizada";

function casaSituacao(t: Item, s: Situacao): boolean {
  if (s === "todas") return true;
  if (s === "aberto") return !t.desfecho;
  if (s === "finalizada") return !!t.desfecho;
  return !t.desfecho && (diasAte(t.prazo) ?? 0) < 0;
}

// Mesma tarefa, deitada. O card empilha tudo em 188px de altura, o que é bom
// pra folhear e ruim pra comparar: com dez cards na tela não dá pra correr o
// olho pelos prazos. Aqui cada informação tem sua coluna, então a leitura é
// vertical dentro de cada uma.
//
// As colunas do meio somem no estreito em vez de espremer: sobram título e uma
// segunda linha com prazo e processo, que é o mínimo pra decidir se abre.
const COLS_LISTA = "grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-cols-[auto_minmax(0,1fr)_6.5rem_8.5rem_10rem_13rem_auto]";

function TarefaLinha({ it, onClick }: { it: Item; onClick: () => void }) {
  const Icon = ICONE_TIPO[it.tipo];
  const d = it.desfecho ? DESFECHOS[it.desfecho] : null;
  const DIcon = d?.icon;
  const prazo = it.tipo !== "pendencia" && !d ? prazoInfo(it.prazo) : null;
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full grid items-center gap-x-3 text-left rounded-xl border border-white/[0.06] bg-white/[0.02]",
        "px-3 py-2 transition-colors hover:border-primary/30 hover:bg-white/[0.045]",
        COLS_LISTA, d && "opacity-70",
      )}
    >
      <span className="h-7 w-7 rounded-lg bg-primary/12 ring-1 ring-primary/25 grid place-items-center shrink-0">
        <Icon className="h-3.5 w-3.5 text-primary" />
      </span>

      <span className="min-w-0">
        <span className={cn("block text-[13px] font-medium truncate", d && "line-through")}>{it.titulo}</span>
        {it.conteudo && (
          <span className="hidden lg:block text-[11px] text-muted-foreground truncate">{it.conteudo}</span>
        )}
        {/* No estreito, o essencial das colunas escondidas vem pra cá */}
        <span className="lg:hidden flex items-center gap-1.5 text-[10.5px] text-muted-foreground truncate">
          {prazo && <span className={prazo.cls}>{prazo.label}</span>}
          {prazo && <span className="opacity-40">·</span>}
          <span className="font-mono truncate">{it.processoNumero}</span>
        </span>
      </span>

      <span className="hidden lg:block text-[10.5px] uppercase tracking-wide text-muted-foreground truncate">
        {LABEL_TIPO[it.tipo]}
      </span>

      <span className="hidden lg:flex min-w-0">
        {d && DIcon ? (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 truncate", d.chip)}>
            <DIcon className="h-3 w-3 shrink-0" /> {d.label}
          </span>
        ) : (
          <StatusChip label={it.tipo === "pendencia" ? "Pendente" : it.status} />
        )}
      </span>

      <span className={cn("hidden lg:flex items-center gap-1.5 text-[11px] min-w-0", prazo ? prazo.cls : "text-muted-foreground/50")}>
        {prazo ? (
          <>
            <CalendarDays className="h-3 w-3 shrink-0" />
            <span className="truncate">{prazo.label}</span>
          </>
        ) : "—"}
      </span>

      <span className="hidden lg:block min-w-0 text-[10.5px] text-muted-foreground">
        <span className="block font-mono truncate">{it.processoNumero}</span>
        {it.clienteNome && <span className="block truncate">{it.clienteNome}</span>}
      </span>

      <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
    </button>
  );
}

export default function Tarefas() {
  useEffect(() => { document.title = "Tarefas · AW ECO ME"; }, []);
  const navigate = useNavigate();
  const [procs, setProcs] = useState<Proc[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipo, setTipo] = useState<"todos" | TaskTipo>("todos");
  const [situacao, setSituacao] = useState<Situacao>("todas");
  const [busca, setBusca] = useState("");
  const [view, setView] = useState<"cards" | "lista" | "linha" | "calendario">("cards");
  const [janela, setJanela] = useState<Janela>("todas");
  const [ordem, setOrdem] = useState<"urgente" | "distante">("urgente");
  // Duas etapas: o clique abre o resumo, e o resumo é que leva à edição.
  const [detalhe, setDetalhe] = useState<Item | null>(null);
  const [editando, setEditando] = useState<Item | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from("processos")
      .select("id, numero_processo, linha_temporal, clientes(nome)");
    if (data) setProcs(data as unknown as Proc[]);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Achata todas as tasks de todos os processos, com contexto.
  const allTasks = useMemo(() => {
    const out: Item[] = [];
    for (const p of procs) {
      const lt = Array.isArray(p.linha_temporal) ? (p.linha_temporal as Etapa[]) : [];
      for (const e of lt) {
        (e.tasks ?? []).forEach((t, i) => {
          out.push({
            ...t,
            chave: `${p.id}::${e.id}::${i}::${t.id}`,
            etapaId: e.id, indice: i,
            etapaTitulo: e.titulo, processoId: p.id, processoNumero: p.numero_processo,
            clienteNome: p.clientes?.nome ?? null,
          });
        });
      }
    }
    return out;
  }, [procs]);

  // Base comum: o que não é situação nem janela. Os dois controles que mostram
  // número partem daqui, e cada um aplica o OUTRO antes de contar. Assim os
  // números conversam: escolher "Ações" mexe nos quatro cartões e nas faixas de
  // prazo ao mesmo tempo, e nenhum controle zera a si mesmo, que é o que faria
  // as outras opções sumirem sem explicação.
  const base = useMemo(() => allTasks.filter((t) => {
    if (tipo !== "todos" && t.tipo !== tipo) return false;
    if (busca) {
      const s = busca.toLowerCase();
      if (!t.titulo.toLowerCase().includes(s) && !(t.conteudo ?? "").toLowerCase().includes(s)
        && !t.processoNumero.toLowerCase().includes(s) && !(t.clienteNome ?? "").toLowerCase().includes(s)) return false;
    }
    return true;
  }), [allTasks, tipo, busca]);

  const stats = useMemo(() => {
    const dentro = base.filter((t) => naJanela(t.prazo, janela));
    const abertas = dentro.filter((t) => !t.desfecho);
    return {
      total: dentro.length,
      abertas: abertas.length,
      finalizadas: dentro.length - abertas.length,
      // Vencida só conta se ainda está aberta: prazo que passou mas foi
      // resolvido é histórico, não dívida.
      vencidas: abertas.filter((t) => (diasAte(t.prazo) ?? 0) < 0).length,
    };
  }, [base, janela]);

  const contagemJanela = useMemo(() => {
    const dentro = base.filter((t) => casaSituacao(t, situacao));
    const m = {} as Record<Janela, number>;
    for (const j of JANELAS) m[j.key] = dentro.filter((t) => naJanela(t.prazo, j.key)).length;
    return m;
  }, [base, situacao]);

  const filtered = useMemo(() => {
    const dentro = base.filter((t) => casaSituacao(t, situacao) && naJanela(t.prazo, janela));
    // Urgência primeiro é o padrão porque é a pergunta que a tela responde;
    // sem ordenar, a lista sai na ordem em que os processos foram lidos, que
    // não quer dizer nada pra quem precisa despachar o dia.
    return [...dentro].sort((a, b) => porPrazo(a, b, ordem === "distante"));
  }, [base, situacao, janela, ordem]);

  // Agrupa as tasks filtradas por etapa (para a linha do tempo compartilhada).
  const porEtapa = useMemo(() => {
    const m = new Map<string, Item[]>();
    filtered.forEach((t) => { const k = t.etapaTitulo; m.set(k, [...(m.get(k) ?? []), t]); });
    return m;
  }, [filtered]);

  const irProcesso = (id: string) => navigate(`/processos/${id}`);

  // Linha de contexto compartilhada pelos dois diálogos: de onde a tarefa vem
  // e como sair daqui pro processo.
  const contextoDe = (it: Item) => (
    <span className="flex items-center gap-x-2 gap-y-0.5 flex-wrap">
      <span className="font-mono">{it.processoNumero}</span>
      {it.clienteNome && <span>· {it.clienteNome}</span>}
      <span className="opacity-50">·</span>
      <span>{it.etapaTitulo}</span>
      <button onClick={() => irProcesso(it.processoId)} className="text-primary hover:underline">
        Abrir processo
      </button>
    </span>
  );

  // Grava a alteração (ou a exclusão, com null) e relê: a lista inteira sai da
  // linha temporal, então recarregar é mais barato e mais honesto do que
  // remendar o estado local e torcer pra bater com o banco.
  const gravar = async (patch: PatchTarefa | null, alvo: Item | null) => {
    if (!alvo) return;
    const { ok, erro } = await salvarTarefaNoBanco(
      { processoId: alvo.processoId, etapaId: alvo.etapaId, indice: alvo.indice },
      patch,
    );
    if (!ok) { toast.error(erro ?? "Não consegui salvar"); return; }
    toast.success(
      patch === null ? "Tarefa excluída"
        : patch.desfecho ? `Tarefa ${DESFECHOS[patch.desfecho].label.toLowerCase()}`
          : "Tarefa atualizada",
    );
    await carregar();
  };

  const TIPOS: { key: "todos" | TaskTipo; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "acao", label: "Ações" },
    { key: "monitoramento", label: "Monitoramento" },
    { key: "pendencia", label: "Pendências" },
  ];

  return (
    <div className="space-y-5">
      {/* ── Cabeçalho ── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
        <h2 className="font-display text-3xl font-medium tracking-tight">Tarefas</h2>
        <p className="text-sm text-muted-foreground mt-1">Todas as tarefas e pendências de todos os processos, num lugar só.</p>
      </motion.div>

      {/* ── Dashzinho: total / em aberto / finalizadas ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.05 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        {([
          { k: "todas", label: "Total", value: stats.total, alerta: false },
          { k: "aberto", label: "Em aberto", value: stats.abertas, alerta: false },
          { k: "vencidas", label: "Vencidas", value: stats.vencidas, alerta: true },
          { k: "finalizada", label: "Finalizadas", value: stats.finalizadas, alerta: false },
        ] as { k: Situacao; label: string; value: number; alerta: boolean }[]).map((s) => {
          const ativo = situacao === s.k;
          return (
            <SpotlightCard
              key={s.label}
              // Clicar de novo no cartão ativo volta pra Total: sem isso, sair
              // de "Vencidas" exigiria adivinhar que "Total" é o neutro.
              onClick={() => setSituacao(ativo && s.k !== "todas" ? "todas" : s.k)}
              className={cn("cursor-pointer transition-colors",
                ativo && (s.alerta ? "border-rose-500/50" : "border-primary/40"))}
            >
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
              <p className={cn("text-3xl sm:text-4xl font-semibold font-display mt-1 tabular-nums",
                s.alerta && s.value > 0 && "text-rose-400")}>
                {s.value}
              </p>
            </SpotlightCard>
          );
        })}
      </motion.div>

      {/* ── Controles, em três degraus: o QUE procurar, COMO olhar, QUANDO vence.
             Antes vinham todos na mesma linha, disputando espaço, e a régua de
             tempo aparecia acima da busca, longe do que ela recorta. ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.1 }}
        className="space-y-2.5"
      >
        {/* 1. O que procurar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por título, processo ou cliente..." value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-10" />
          </div>

          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            {TIPOS.map((tp) => (
              <button
                key={tp.key}
                onClick={() => setTipo(tp.key)}
                className={cn("px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  tipo === tp.key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}
              >
                {tp.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Como olhar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
            <button onClick={() => setView("cards")} className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors", view === "cards" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
              <LayoutGrid className="h-3.5 w-3.5" /> Cards
            </button>
            <button onClick={() => setView("lista")} className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors", view === "lista" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
              <Rows3 className="h-3.5 w-3.5" /> Lista
            </button>
            <button onClick={() => setView("calendario")} className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors", view === "calendario" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
              <CalendarDays className="h-3.5 w-3.5" /> Calendário
            </button>
            <button onClick={() => setView("linha")} className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors", view === "linha" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
              <GitBranchPlus className="h-3.5 w-3.5" /> Linha do tempo
            </button>
          </div>

          {/* Ordenação só faz sentido onde a lista é uma lista: na linha do
              tempo quem manda é a etapa, e no calendário, o dia. */}
          {(view === "cards" || view === "lista") && (
            <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
              {([
                { k: "urgente" as const, label: "Mais urgentes", Icon: ArrowUpWideNarrow },
                { k: "distante" as const, label: "Mais distantes", Icon: ArrowDownWideNarrow },
              ]).map((o) => (
                <button key={o.k} onClick={() => setOrdem(o.k)} title={o.label}
                  className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    ordem === o.k ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
                  <o.Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{o.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 3. Quando vence */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground shrink-0 mr-0.5" />
          {JANELAS.map((j) => {
            const n = contagemJanela[j.key] ?? 0;
            const ativo = janela === j.key;
            return (
              <button key={j.key} onClick={() => setJanela(j.key)} title={j.dica}
                className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] ring-1 transition-colors",
                  ativo
                    ? "bg-primary/15 text-primary ring-primary/35"
                    : "text-muted-foreground ring-white/[0.08] hover:bg-white/[0.05] hover:text-foreground",
                  !ativo && n === 0 && "opacity-45")}>
                {j.label}
                <span className="tabular-nums text-[10.5px] opacity-70">{n}</span>
              </button>
            );
          })}

          {/* Como os números de cima agora respondem aos filtros, quem estranhar
              um total menor que o esperado tem aqui a saída, e não só a
              explicação. */}
          {(situacao !== "todas" || janela !== "todas" || tipo !== "todos" || busca) && (
            <button
              onClick={() => { setSituacao("todas"); setJanela("todas"); setTipo("todos"); setBusca(""); }}
              className="ml-1 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-colors">
              <X className="h-3 w-3" /> Limpar filtros
            </button>
          )}
        </div>
      </motion.div>

      {/* ── Conteúdo ── */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-20 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : allTasks.length === 0 ? (
        <Card className="border-dashed">
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <span className="h-12 w-12 rounded-2xl bg-primary/10 grid place-items-center"><ListTodo className="h-6 w-6 text-primary" /></span>
            <div>
              <p className="text-sm font-medium text-foreground">Nenhuma tarefa ainda</p>
              <p className="text-xs mt-0.5">As tarefas e pendências criadas dentro dos processos aparecem aqui, todas juntas.</p>
            </div>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <div className="py-16 text-center text-muted-foreground text-sm">
            Nenhuma tarefa com esses filtros.
            {janela !== "todas" && (
              <button onClick={() => setJanela("todas")} className="block mx-auto mt-2 text-xs text-primary hover:underline">
                Ver sem recorte de prazo
              </button>
            )}
          </div>
        </Card>
      ) : view === "lista" ? (
        /* Lista: a mesma informação do card, deitada e alinhada em colunas */
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: 0.15 }}
          className="space-y-1"
        >
          {/* Cabeçalho só onde as colunas existem; no estreito seria legenda
              de coluna que não está na tela. */}
          <div className={cn("hidden lg:grid items-center gap-x-3 px-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70", COLS_LISTA)}>
            <span className="w-7" />
            <span>Tarefa</span>
            <span>Tipo</span>
            <span>Situação</span>
            <span>Prazo</span>
            <span>Processo</span>
            <span className="w-4" />
          </div>
          {filtered.map((it) => (
            <TarefaLinha key={it.chave} it={it} onClick={() => setDetalhe(it)} />
          ))}
        </motion.div>
      ) : view === "calendario" ? (
        /* Calendário: os mesmos itens filtrados, distribuídos pelo dia do prazo */
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: 0.15 }}>
          <TarefasCalendario
            itens={filtered.map((it) => ({
              id: it.chave,
              titulo: it.titulo,
              prazo: it.prazo,
              processoId: it.processoId,
              processoNumero: it.processoNumero,
              clienteNome: it.clienteNome,
              desfecho: it.desfecho,
            }))}
            onAbrir={irProcesso}
          />
        </motion.div>
      ) : view === "cards" ? (
        /* Grade de cards */
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: 0.15 }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
        >
          {filtered.map((it) => (
            <TarefaCard key={it.chave} it={it} onClick={() => setDetalhe(it)} />
          ))}
        </motion.div>
      ) : (
        /* Linha do tempo compartilhada: todas as tasks ao longo da espinha do processo */
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: 0.15 }}>
          <Card>
            <CardContent className="pt-6">
              <div>
                {ETAPAS_ORDEM.map((etapa, i) => {
                  const tasksAqui = (porEtapa.get(etapa) ?? []).sort((a, b) => a.ordem - b.ordem);
                  const temTasks = tasksAqui.length > 0;
                  const last = i === ETAPAS_ORDEM.length - 1;
                  return (
                    <div key={etapa} className="grid grid-cols-[1.5rem_1fr] gap-x-3">
                      {/* Rail */}
                      <div className="relative flex justify-center">
                        {!last && <div className={cn("absolute top-5 bottom-0 w-px left-1/2 -translate-x-1/2", temTasks ? "bg-primary/30" : "bg-border")} />}
                        <span className={cn("relative z-10 mt-1 h-4 w-4 rounded-full ring-4 ring-card grid place-items-center",
                          temTasks ? "bg-primary" : "border-2 border-muted-foreground/25 bg-card")}>
                          {temTasks && <span className="text-[9px] font-semibold text-primary-foreground tabular-nums leading-none">{tasksAqui.length}</span>}
                        </span>
                      </div>
                      {/* Conteúdo */}
                      <div className={cn(!last && "border-b border-border/40", temTasks ? "pb-6" : "pb-4")}>
                        <p className={cn("text-sm font-medium leading-tight", temTasks ? "text-foreground" : "text-muted-foreground/60")}>{etapa}</p>
                        {temTasks && (
                          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                            {tasksAqui.map((it) => (
                              <TarefaCard key={it.chave} it={it} onClick={() => setDetalhe(it)} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Clicar na tarefa abre o resumo, não o formulário: quem clica quer
          saber o que era e, quase sempre, dar uma das três saídas. Editar sai
          daqui, de canto, que é a frequência real dele. */}
      {detalhe && (
        <TarefaDetalheDialog
          task={detalhe}
          contexto={contextoDe(detalhe)}
          onFechar={() => setDetalhe(null)}
          onDesfecho={(desfecho, obs) => gravar({ desfecho, desfechoObs: obs }, detalhe)}
          onReagendar={(prazo) => gravar({ prazo }, detalhe)}
          onEditar={() => { setEditando(detalhe); setDetalhe(null); }}
        />
      )}

      <EditarTarefaDialog
        task={editando}
        onFechar={() => setEditando(null)}
        contexto={editando && contextoDe(editando)}
        onSalvar={(patch: PatchTarefa) => gravar(patch, editando)}
        onExcluir={() => gravar(null, editando)}
      />
    </div>
  );
}
