import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Plus, Zap, Eye, CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Status processuais (das planilhas) — o que o processo/etapa aguarda ──────
export const STATUS_PROCESSUAIS: string[] = [
  // 1º grau — conhecimento
  "AG. DISTRIBUIÇÃO", "AG. DECISÃO INICIAL", "AG. EMENDA À INICIAL", "AG. CONTESTAÇÃO",
  "AG. RÉPLICA", "AG. DECISÃO PROVAS", "AG. AUDIÊNCIA", "AUDIÊNCIA DESIGNADA",
  "AG. MOV CONCLUSO SENTENÇA", "AG. SENTENÇA", "JULGADO (SENTENÇA)",
  // Recursal / 2º grau
  "AG. APELAÇÃO", "AG. CONTRARAZOES", "AG. REMESSA AO 2º GRAU", "AG. DISTRIBUIÇÃO 2º GRAU",
  "AG. DESPACHO INICIAL 2º GRAU", "AG. MOV CONCLUSO DECISÃO", "AG. RECURSO INOMINADO",
  "AG. TJ SENTENÇA", "AG. TJ ACÓRDÃO", "AG. ACÓRDÃO", "JULGADO ACÓRDÃO", "AG. EMBARGOS",
  // Cumprimento / execução
  "AG. CUMPRIMENTO SENTENÇA", "AG. PAGAMENTO VOLUNTÁRIO", "AG. DECISÃO PENHORA",
  "AG. DECISÃO CS", "AG. EXPEDIÇÃO ALVARÁ", "ALVARÁ EXPEDIDO", "AG. MANIFESTAÇÃO",
  "AG. MANDADO SEGURANÇA",
  // Especiais
  "COMPARECER AO FÓRUM", "AG. REAJUIZAMENTO", "REAJUIZAR", "SUSPENSO", "ARQUIVADO",
];

export interface Task {
  id: string;
  tipo: "acao" | "monitoramento";
  titulo: string;
  conteudo: string;
  prazo: string;       // yyyy-mm-dd
  status: string;      // um de STATUS_PROCESSUAIS
  ordem: number;       // pra achar a mais recente
}

export interface Etapa {
  id: string;
  titulo: string;
  status: "concluida" | "atual" | "pendente";
  inicio?: string;        // dd/mm/aaaa
  conclusao?: string;     // dd/mm/aaaa
  prazoAlvoDias?: number;
  secao?: string;         // gancho de fase (recursal etc.) — metadado
  statusProcessual?: string;  // status da etapa enquanto aberta
  tasks?: Task[];
}

const EASE = [0.22, 1, 0.36, 1] as const;

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

// Tom por status (especiais ganham cor própria; AG.* usa a cor do tema).
function statusTone(s: string): string {
  if (s === "ARQUIVADO") return "bg-red-500/15 text-red-400 ring-red-500/30";
  if (s === "SUSPENSO") return "bg-white/10 text-muted-foreground ring-white/15";
  if (s === "COMPARECER AO FÓRUM" || s === "REAJUIZAR" || s === "AG. REAJUIZAMENTO")
    return "bg-amber-400/15 text-amber-400 ring-amber-400/30";
  if (s.startsWith("JULGADO") || s === "ALVARÁ EXPEDIDO")
    return "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30";
  return "bg-primary/15 text-primary ring-primary/30";
}

function StatusChip({ status, blink, className }: { status: string; blink?: boolean; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 whitespace-nowrap",
      statusTone(status), blink && "status-blink", className,
    )}>
      {status}
    </span>
  );
}

function TaskCard({ task, big }: { task: Task; big: boolean }) {
  const isAcao = task.tipo === "acao";
  return (
    <div className={cn("rounded-xl border border-border bg-card/60", big ? "p-3.5" : "p-2.5")}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1",
          isAcao ? "bg-primary/12 text-primary ring-primary/25" : "bg-sky-500/12 text-sky-400 ring-sky-500/25",
        )}>
          {isAcao ? <Zap className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {isAcao ? "Ação" : "Monitoramento"}
        </span>
        <StatusChip status={task.status} />
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
    </div>
  );
}

const DRAFT_VAZIO = { tipo: "acao" as "acao" | "monitoramento", titulo: "", conteudo: "", prazo: "", status: "" };

export function ProcessoTimeline({ etapas: etapasIniciais, badge }: { etapas: Etapa[]; badge?: string }) {
  const [etapas, setEtapas] = useState<Etapa[]>(() => etapasIniciais.map((e) => ({ ...e, tasks: e.tasks ?? [] })));
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [draft, setDraft] = useState(DRAFT_VAZIO);
  const [ordem, setOrdem] = useState(1);

  const concluidas = etapas.filter((e) => e.status === "concluida").length;

  // Status do processo = status da tarefa mais recente (fallback: status da
  // etapa atual). É o que pisca no ponto atual da timeline.
  const todasTasks = etapas.flatMap((e) => e.tasks ?? []);
  const taskRecente = todasTasks.length ? todasTasks.reduce((a, b) => (b.ordem > a.ordem ? b : a)) : null;
  const etapaAtual = etapas.find((e) => e.status === "atual");
  const statusProcesso = taskRecente?.status ?? etapaAtual?.statusProcessual ?? null;

  const setStatusEtapa = (id: string, v: string) =>
    setEtapas((prev) => prev.map((e) => (e.id === id ? { ...e, statusProcessual: v } : e)));

  const abrirForm = (id: string) => { setAddingFor(id); setDraft(DRAFT_VAZIO); };

  const salvarTask = (etapaId: string) => {
    if (!draft.titulo.trim() || !draft.status) return;
    const nova: Task = {
      id: `t${ordem}`, ordem, tipo: draft.tipo,
      titulo: draft.titulo.trim(), conteudo: draft.conteudo.trim(),
      prazo: draft.prazo, status: draft.status,
    };
    setEtapas((prev) => prev.map((e) => (e.id === etapaId ? { ...e, tasks: [...(e.tasks ?? []), nova] } : e)));
    setOrdem((o) => o + 1);
    setAddingFor(null);
    setDraft(DRAFT_VAZIO);
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
          const podeAdicionar = e.status !== "pendente";
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
              {/* Rail à esquerda (cor do tema) */}
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
                {/* Título + status/data */}
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
                    {e.status === "atual" && (
                      <>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Status do processo</p>
                        {statusProcesso
                          ? <StatusChip status={statusProcesso} blink />
                          : <span className="text-[11px] text-muted-foreground">defina abaixo</span>}
                      </>
                    )}
                  </div>
                </div>

                {/* Seletor de status da etapa (enquanto aberta) */}
                {e.status === "atual" && (
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">Aguardando:</span>
                    <Select value={e.statusProcessual ?? ""} onValueChange={(v) => setStatusEtapa(e.id, v)}>
                      <SelectTrigger className="h-7 w-[190px] text-[11px]"><SelectValue placeholder="Definir status da etapa" /></SelectTrigger>
                      <SelectContent>
                        {STATUS_PROCESSUAIS.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Tarefas no vão até a próxima milestone */}
                {(e.tasks?.length || podeAdicionar) ? (
                  <div className="mt-3 space-y-2">
                    {(e.tasks ?? []).map((t) => <TaskCard key={t.id} task={t} big={cardGrande} />)}

                    {addingFor === e.id ? (
                      <div className="rounded-xl border border-dashed border-primary/40 bg-primary/[0.03] p-3 space-y-2">
                        {/* Tipo */}
                        <div className="flex gap-1.5">
                          {(["acao", "monitoramento"] as const).map((tp) => (
                            <button
                              key={tp}
                              onClick={() => setDraft((d) => ({ ...d, tipo: tp }))}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ring-1 transition-colors",
                                draft.tipo === tp
                                  ? (tp === "acao" ? "bg-primary/15 text-primary ring-primary/30" : "bg-sky-500/15 text-sky-400 ring-sky-500/30")
                                  : "text-muted-foreground ring-border hover:text-foreground",
                              )}
                            >
                              {tp === "acao" ? <Zap className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                              {tp === "acao" ? "Ação" : "Monitoramento"}
                            </button>
                          ))}
                        </div>
                        <Input
                          value={draft.titulo}
                          onChange={(ev) => setDraft((d) => ({ ...d, titulo: ev.target.value }))}
                          placeholder="Título da tarefa"
                          className="h-8 text-sm"
                        />
                        <Textarea
                          value={draft.conteudo}
                          onChange={(ev) => setDraft((d) => ({ ...d, conteudo: ev.target.value }))}
                          placeholder="Conteúdo / o que precisa ser feito…"
                          rows={2}
                          className="text-sm"
                        />
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Input
                            type="date"
                            value={draft.prazo}
                            onChange={(ev) => setDraft((d) => ({ ...d, prazo: ev.target.value }))}
                            className="h-8 text-sm sm:w-40"
                          />
                          <Select value={draft.status} onValueChange={(v) => setDraft((d) => ({ ...d, status: v }))}>
                            <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Status (obrigatório)" /></SelectTrigger>
                            <SelectContent>
                              {STATUS_PROCESSUAIS.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-0.5">
                          <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => setAddingFor(null)}>
                            <X className="h-3.5 w-3.5" /> Cancelar
                          </Button>
                          <Button size="sm" className="h-7" disabled={!draft.titulo.trim() || !draft.status} onClick={() => salvarTask(e.id)}>
                            Adicionar tarefa
                          </Button>
                        </div>
                      </div>
                    ) : podeAdicionar ? (
                      <button
                        onClick={() => abrirForm(e.id)}
                        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" /> adicionar tarefa
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
