import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Plus, Zap, Eye, CalendarDays, CheckCircle2, XCircle, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Status processuais (das planilhas) — o que o processo/etapa aguarda ──────
export const STATUS_PROCESSUAIS: string[] = [
  "AG. DISTRIBUIÇÃO", "AG. DECISÃO INICIAL", "AG. EMENDA À INICIAL", "AG. CONTESTAÇÃO",
  "AG. RÉPLICA", "AG. DECISÃO PROVAS", "AG. AUDIÊNCIA", "AUDIÊNCIA DESIGNADA",
  "AG. MOV CONCLUSO SENTENÇA", "AG. SENTENÇA", "JULGADO (SENTENÇA)",
  "AG. APELAÇÃO", "AG. CONTRARAZOES", "AG. REMESSA AO 2º GRAU", "AG. DISTRIBUIÇÃO 2º GRAU",
  "AG. DESPACHO INICIAL 2º GRAU", "AG. MOV CONCLUSO DECISÃO", "AG. RECURSO INOMINADO",
  "AG. TJ SENTENÇA", "AG. TJ ACÓRDÃO", "AG. ACÓRDÃO", "JULGADO ACÓRDÃO", "AG. EMBARGOS",
  "AG. CUMPRIMENTO SENTENÇA", "AG. PAGAMENTO VOLUNTÁRIO", "AG. DECISÃO PENHORA",
  "AG. DECISÃO CS", "AG. EXPEDIÇÃO ALVARÁ", "ALVARÁ EXPEDIDO", "AG. MANIFESTAÇÃO",
  "AG. MANDADO SEGURANÇA",
  "COMPARECER AO FÓRUM", "AG. REAJUIZAMENTO", "REAJUIZAR", "SUSPENSO", "ARQUIVADO",
];

export type TaskTipo = "acao" | "monitoramento";
export type TaskDesfecho = "concluido" | "perdido" | "cancelado";

export interface Task {
  id: string;
  tipo: TaskTipo;
  titulo: string;
  conteudo: string;
  prazo: string;       // yyyy-mm-dd
  status: string;      // um de STATUS_PROCESSUAIS
  ordem: number;
  desfecho?: TaskDesfecho;
  desfechoObs?: string;
}

export interface Etapa {
  id: string;
  titulo: string;
  status: "concluida" | "atual" | "pendente";
  inicio?: string;        // dd/mm/aaaa
  conclusao?: string;     // dd/mm/aaaa
  prazoAlvoDias?: number;
  secao?: string;
  statusProcessual?: string;
  tasks?: Task[];
}

const EASE = [0.22, 1, 0.36, 1] as const;

const DESFECHOS: Record<TaskDesfecho, { label: string; chip: string; icon: typeof Ban }> = {
  concluido: { label: "Concluído", chip: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30", icon: CheckCircle2 },
  perdido: { label: "Perdido", chip: "bg-red-500/15 text-red-400 ring-red-500/30", icon: XCircle },
  cancelado: { label: "Cancelado", chip: "bg-white/10 text-muted-foreground ring-white/15", icon: Ban },
};

function parseBR(d?: string): Date | null {
  if (!d) return null;
  const [dd, mm, yy] = d.split("/").map(Number);
  if (!dd || !mm || !yy) return null;
  return new Date(yy, mm - 1, dd);
}
function diffDias(a?: string, b?: string): number {
  const A = parseBR(a); const B = parseBR(b);
  if (!A || !B) return 0;
  return Math.max(0, Math.round((B.getTime() - A.getTime()) / 86400000));
}
function hojeBR(): string {
  const t = new Date();
  return `${String(t.getDate()).padStart(2, "0")}/${String(t.getMonth() + 1).padStart(2, "0")}/${t.getFullYear()}`;
}
function fmtPrazo(d?: string): string {
  if (!d) return "";
  const [y, m, dd] = d.split("-");
  return `${dd}/${m}/${y}`;
}

function statusTone(s: string): string {
  if (s === "ARQUIVADO") return "bg-red-500/15 text-red-400 ring-red-500/30";
  if (s === "SUSPENSO") return "bg-white/10 text-muted-foreground ring-white/15";
  if (s === "COMPARECER AO FÓRUM" || s === "REAJUIZAR" || s === "AG. REAJUIZAMENTO")
    return "bg-amber-400/15 text-amber-400 ring-amber-400/30";
  if (s.startsWith("JULGADO") || s === "ALVARÁ EXPEDIDO")
    return "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30";
  return "bg-primary/15 text-primary ring-primary/30";
}

function StatusChip({ status, blink }: { status: string; blink?: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 whitespace-nowrap",
      statusTone(status), blink && "status-blink",
    )}>
      {status}
    </span>
  );
}

// Card da tarefa — estética do dash, ícone (raio/olho) na cor do tema, clicável.
function TaskCard({ task, big, onClick }: { task: Task; big: boolean; onClick: () => void }) {
  const Icon = task.tipo === "acao" ? Zap : Eye;
  const d = task.desfecho ? DESFECHOS[task.desfecho] : null;
  const DIcon = d?.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        "group w-full text-left rounded-xl border border-border bg-card/60 hover:bg-white/[0.04] hover:border-primary/40 transition-colors",
        big ? "p-3.5" : "p-2.5",
        d && "opacity-75",
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="inline-flex items-center gap-2">
          <span className={cn("rounded-lg bg-primary/12 ring-1 ring-primary/25 grid place-items-center shrink-0", big ? "h-7 w-7" : "h-6 w-6")}>
            <Icon className={cn("text-primary", big ? "h-4 w-4" : "h-3.5 w-3.5")} />
          </span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {task.tipo === "acao" ? "Ação" : "Monitoramento"}
          </span>
        </span>
        {d && DIcon ? (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1", d.chip)}>
            <DIcon className="h-3 w-3" /> {d.label}
          </span>
        ) : (
          <StatusChip status={task.status} />
        )}
      </div>
      <p className={cn("font-medium leading-tight", big ? "text-sm" : "text-xs")}>{task.titulo}</p>
      {task.conteudo && (
        <p className={cn("text-muted-foreground mt-1", big ? "text-xs" : "text-[11px] line-clamp-2")}>{task.conteudo}</p>
      )}
      {task.prazo && (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1.5">
          <CalendarDays className="h-3 w-3" /> Prazo: {fmtPrazo(task.prazo)}
        </p>
      )}
      {task.desfechoObs && (
        <p className="text-[11px] text-muted-foreground/80 italic mt-1.5 border-t border-border/40 pt-1.5">{task.desfechoObs}</p>
      )}
    </button>
  );
}

const DRAFT_VAZIO = { titulo: "", conteudo: "", prazo: "", status: "" };

export function ProcessoTimeline({ etapas: etapasIniciais, badge }: { etapas: Etapa[]; badge?: string }) {
  const [etapas, setEtapas] = useState<Etapa[]>(() => etapasIniciais.map((e) => ({ ...e, tasks: e.tasks ?? [] })));
  const [ordem, setOrdem] = useState(1);

  // Fluxo de criação: escolher tipo -> preencher detalhes.
  const [tipoDialog, setTipoDialog] = useState<string | null>(null);           // etapaId
  const [detalhe, setDetalhe] = useState<{ etapaId: string; tipo: TaskTipo } | null>(null);
  const [draft, setDraft] = useState(DRAFT_VAZIO);

  // Desfecho de uma tarefa existente.
  const [desfechoTask, setDesfechoTask] = useState<Task | null>(null);
  const [desfechoDraft, setDesfechoDraft] = useState<{ desfecho: TaskDesfecho | ""; obs: string }>({ desfecho: "", obs: "" });

  const concluidas = etapas.filter((e) => e.status === "concluida").length;

  const setStatusEtapa = (id: string, v: string) =>
    setEtapas((prev) => prev.map((e) => (e.id === id ? { ...e, statusProcessual: v } : e)));

  const escolherTipo = (tipo: TaskTipo) => {
    if (!tipoDialog) return;
    setDetalhe({ etapaId: tipoDialog, tipo });
    setTipoDialog(null);
    setDraft(DRAFT_VAZIO);
  };

  // Criar a tarefa; o status dela vira o status do processo (etapa atual).
  const criarTask = () => {
    if (!detalhe || !draft.titulo.trim() || !draft.status) return;
    const nova: Task = {
      id: `t${ordem}`, ordem, tipo: detalhe.tipo,
      titulo: draft.titulo.trim(), conteudo: draft.conteudo.trim(),
      prazo: draft.prazo, status: draft.status,
    };
    setEtapas((prev) => prev.map((e) => (
      e.id === detalhe.etapaId ? { ...e, tasks: [...(e.tasks ?? []), nova], statusProcessual: nova.status } : e
    )));
    setOrdem((o) => o + 1);
    setDetalhe(null);
    setDraft(DRAFT_VAZIO);
  };

  const abrirDesfecho = (t: Task) => {
    setDesfechoTask(t);
    setDesfechoDraft({ desfecho: t.desfecho ?? "", obs: t.desfechoObs ?? "" });
  };
  const salvarDesfecho = () => {
    if (!desfechoTask || !desfechoDraft.desfecho) return;
    setEtapas((prev) => prev.map((e) => ({
      ...e,
      tasks: (e.tasks ?? []).map((t) =>
        t.id === desfechoTask.id ? { ...t, desfecho: desfechoDraft.desfecho as TaskDesfecho, desfechoObs: desfechoDraft.obs.trim() } : t),
    })));
    setDesfechoTask(null);
  };

  return (
    <div>
      {/* Cabeçalho */}
      <div className="flex items-baseline justify-between gap-3 mb-5">
        <h3 className="font-display text-lg font-medium tracking-tight flex items-center gap-2">
          Linha do tempo do processo
          {badge && (
            <span className="text-[10px] uppercase tracking-wider bg-primary/10 text-primary rounded-full px-2 py-0.5 font-sans font-normal">
              {badge}
            </span>
          )}
        </h3>
        <span className="text-xs text-muted-foreground shrink-0">{concluidas} de {etapas.length} etapas cravadas</span>
      </div>

      {/* Etapas */}
      <div>
        {etapas.map((e, i) => {
          const last = i === etapas.length - 1;
          const lineCls = e.status === "concluida" ? "bg-primary/50" : "bg-border";
          const podeAdicionar = e.status === "atual";
          const cardGrande = e.status === "atual";
          const sub =
            e.status === "concluida"
              ? `iniciada em ${e.inicio ?? "sem data"} · levou ${diffDias(e.inicio, e.conclusao)} dia(s)`
              : e.status === "atual"
                ? `em curso desde ${e.inicio ?? "sem data"} · ${diffDias(e.inicio, hojeBR())} dia(s)`
                : `prazo-alvo de ${e.prazoAlvoDias ?? 0} dias`;

          return (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE, delay: Math.min(i, 8) * 0.04 }}
              className="grid grid-cols-[1.5rem_1fr] gap-x-3"
            >
              {/* Rail à esquerda */}
              <div className="relative flex justify-center">
                {!last && (
                  e.status === "atual" ? (
                    <div className="absolute top-5 bottom-0 w-px left-1/2 -translate-x-1/2 bg-border overflow-hidden">
                      <span className="absolute inset-x-0 h-8 flow-down bg-gradient-to-b from-transparent via-primary to-transparent" />
                    </div>
                  ) : (
                    <div className={cn("absolute top-5 bottom-0 w-px left-1/2 -translate-x-1/2", lineCls)} />
                  )
                )}
                {e.status === "concluida" ? (
                  <span className="relative z-10 mt-1 h-4 w-4 rounded-full bg-primary grid place-items-center ring-4 ring-card">
                    <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
                  </span>
                ) : e.status === "atual" ? (
                  <span className="relative z-10 mt-1 h-4 w-4 rounded-full border-2 border-primary bg-card ring-4 ring-card">
                    <span className="absolute -inset-px rounded-full border-2 border-primary animate-ping opacity-60" />
                  </span>
                ) : (
                  <span className="relative z-10 mt-1 h-4 w-4 rounded-full border-2 border-muted-foreground/30 bg-card ring-4 ring-card" />
                )}
              </div>

              {/* Conteúdo */}
              <div className={cn(!last && "border-b border-border/40", last ? "pb-1" : "pb-6")}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className={cn("text-sm font-medium leading-tight", e.status === "pendente" ? "text-muted-foreground" : "text-foreground")}>
                      {e.titulo}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {e.status === "concluida" && (
                      <>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Concluída em</p>
                        <p className="text-sm font-medium tabular-nums mt-0.5">{e.conclusao}</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Tarefas + botão grande (só na milestone atual) */}
                {(e.tasks?.length || podeAdicionar) ? (
                  <div className="mt-3 space-y-2">
                    {(e.tasks ?? []).map((t) => (
                      <TaskCard key={t.id} task={t} big={cardGrande} onClick={() => abrirDesfecho(t)} />
                    ))}
                    {podeAdicionar && (
                      <button
                        onClick={() => setTipoDialog(e.id)}
                        className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-border hover:border-primary/50 hover:bg-primary/[0.04] text-sm text-muted-foreground hover:text-primary py-3 transition-colors"
                      >
                        <Plus className="h-4 w-4" /> Adicionar tarefa
                      </button>
                    )}
                  </div>
                ) : null}

                {/* Status — última info antes da próxima milestone */}
                {e.status === "atual" && (
                  <div className="mt-4 flex justify-center">
                    <Select value={e.statusProcessual ?? ""} onValueChange={(v) => setStatusEtapa(e.id, v)}>
                      <SelectTrigger
                        className={cn(
                          "mx-auto w-auto justify-center gap-1.5 border-0 bg-transparent shadow-none h-auto px-0 py-0 text-sm font-normal text-foreground focus:ring-0 focus:ring-offset-0 [&>svg]:hidden",
                          e.statusProcessual && "status-blink",
                        )}
                      >
                        <span className="text-muted-foreground text-xs">Aguardando</span>
                        <SelectValue placeholder="definir status" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_PROCESSUAIS.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Popup 1: tipo da tarefa ── */}
      <Dialog open={!!tipoDialog} onOpenChange={(o) => !o && setTipoDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
            <DialogDescription>Que tipo de tarefa é essa?</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {(["acao", "monitoramento"] as const).map((tp) => (
              <button
                key={tp}
                onClick={() => escolherTipo(tp)}
                className="group flex flex-col items-center gap-2 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/[0.05] p-5 transition-colors"
              >
                <span className="h-12 w-12 rounded-xl bg-primary/12 ring-1 ring-primary/25 grid place-items-center">
                  {tp === "acao" ? <Zap className="h-6 w-6 text-primary" /> : <Eye className="h-6 w-6 text-primary" />}
                </span>
                <span className="text-sm font-medium">{tp === "acao" ? "Ação" : "Monitoramento"}</span>
                <span className="text-[11px] text-muted-foreground text-center">
                  {tp === "acao" ? "Algo a fazer / protocolar" : "Acompanhar / aguardar"}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Popup 2: detalhes da tarefa ── */}
      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detalhe?.tipo === "acao" ? <Zap className="h-4 w-4 text-primary" /> : <Eye className="h-4 w-4 text-primary" />}
              Nova {detalhe?.tipo === "acao" ? "ação" : "tarefa de monitoramento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={draft.titulo} onChange={(ev) => setDraft((d) => ({ ...d, titulo: ev.target.value }))} placeholder="Título da tarefa" />
            <Textarea value={draft.conteudo} onChange={(ev) => setDraft((d) => ({ ...d, conteudo: ev.target.value }))} placeholder="Sobre a tarefa / o que precisa ser feito…" rows={3} />
            <div className="flex flex-col sm:flex-row gap-2">
              <Input type="date" value={draft.prazo} onChange={(ev) => setDraft((d) => ({ ...d, prazo: ev.target.value }))} className="sm:w-40" />
              <Select value={draft.status} onValueChange={(v) => setDraft((d) => ({ ...d, status: v }))}>
                <SelectTrigger className="flex-1 text-xs"><SelectValue placeholder="Status (obrigatório)" /></SelectTrigger>
                <SelectContent>
                  {STATUS_PROCESSUAIS.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetalhe(null)}>Cancelar</Button>
            <Button disabled={!draft.titulo.trim() || !draft.status} onClick={criarTask}>Criar tarefa</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Popup 3: desfecho da tarefa ── */}
      <Dialog open={!!desfechoTask} onOpenChange={(o) => !o && setDesfechoTask(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {desfechoTask?.tipo === "acao" ? <Zap className="h-4 w-4 text-primary" /> : <Eye className="h-4 w-4 text-primary" />}
              {desfechoTask?.titulo}
            </DialogTitle>
            <DialogDescription>Qual o desfecho dessa tarefa?</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(DESFECHOS) as TaskDesfecho[]).map((k) => {
              const info = DESFECHOS[k];
              const DIcon = info.icon;
              const ativo = desfechoDraft.desfecho === k;
              return (
                <button
                  key={k}
                  onClick={() => setDesfechoDraft((d) => ({ ...d, desfecho: k }))}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-colors",
                    ativo ? cn("ring-1", info.chip) : "border-border hover:border-primary/40 text-muted-foreground",
                  )}
                >
                  <DIcon className="h-5 w-5" />
                  <span className="text-xs font-medium">{info.label}</span>
                </button>
              );
            })}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              Observações {desfechoDraft.desfecho ? `(${DESFECHOS[desfechoDraft.desfecho as TaskDesfecho].label.toLowerCase()})` : ""}
            </label>
            <Textarea
              value={desfechoDraft.obs}
              onChange={(ev) => setDesfechoDraft((d) => ({ ...d, obs: ev.target.value }))}
              placeholder="Por que / como se resolveu…"
              rows={3}
              className="mt-1.5"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDesfechoTask(null)}>Cancelar</Button>
            <Button disabled={!desfechoDraft.desfecho} onClick={salvarDesfecho}>Salvar desfecho</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
