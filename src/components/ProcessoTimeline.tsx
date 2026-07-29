import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Plus, Zap, Eye, CalendarDays, CheckCircle2, XCircle, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Status processuais (das planilhas) ───────────────────────────────────────
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
  status: string;
  ordem: number;
  desfecho?: TaskDesfecho;
  desfechoObs?: string;
}

export interface Etapa {
  id: string;
  titulo: string;
  status: "concluida" | "atual" | "pendente";
  inicio?: string;
  conclusao?: string;
  prazoAlvoDias?: number;
  secao?: string;
  statusProcessual?: string;
  tasks?: Task[];
}

const EASE = [0.22, 1, 0.36, 1] as const;
const PREMIUM_DIALOG =
  "sm:max-w-md rounded-2xl border-white/[0.08] bg-card/95 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.55)]";

const DESFECHOS: Record<TaskDesfecho, { label: string; chip: string; text: string; icon: typeof Ban }> = {
  concluido: { label: "Concluído", chip: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30", text: "text-emerald-400", icon: CheckCircle2 },
  perdido: { label: "Perdido", chip: "bg-red-500/15 text-red-400 ring-red-500/30", text: "text-red-400", icon: XCircle },
  cancelado: { label: "Cancelado", chip: "bg-white/10 text-muted-foreground ring-white/15", text: "text-muted-foreground", icon: Ban },
};

// ── helpers de data ──────────────────────────────────────────────────────────
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
function ymdToDate(s?: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}
function dateToYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function diasAtePrazo(s?: string): number | null {
  const d = ymdToDate(s);
  if (!d) return null;
  d.setHours(0, 0, 0, 0);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoje.getTime()) / 86400000);
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
      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 whitespace-nowrap max-w-full truncate",
      statusTone(status), blink && "status-blink",
    )}>
      {status}
    </span>
  );
}

// Texto explicativo do prazo (cor por urgência).
function prazoInfo(prazo?: string): { label: string; cls: string } {
  const dias = diasAtePrazo(prazo);
  if (dias === null) return { label: "Sem prazo definido", cls: "text-muted-foreground" };
  if (dias < 0) {
    const n = Math.abs(dias);
    return { label: `Prazo vencido há ${n} ${n === 1 ? "dia" : "dias"}`, cls: "text-red-400" };
  }
  if (dias === 0) return { label: "Hoje é o fim do prazo", cls: "text-amber-400" };
  if (dias === 1) return { label: "Resta 1 dia para o fim do prazo", cls: "text-amber-400" };
  const cls = dias <= 3 ? "text-amber-400" : "text-muted-foreground";
  return { label: `Restam ${dias} dias para o fim do prazo`, cls };
}

// Campo de formulário com rótulo + microtexto explicativo.
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>}
    </div>
  );
}

// Card da tarefa: estética premium do dash, ícone na cor do tema, clicável.
function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const Icon = task.tipo === "acao" ? Zap : Eye;
  const d = task.desfecho ? DESFECHOS[task.desfecho] : null;
  const DIcon = d?.icon;
  const prazo = prazoInfo(task.prazo);
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex flex-col text-left rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-md p-3.5 min-h-[172px]",
        "shadow-[0_4px_20px_rgba(0,0,0,0.25)] transition-all hover:border-primary/40 hover:bg-white/[0.05] hover:-translate-y-0.5",
        d && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="h-8 w-8 rounded-xl bg-primary/12 ring-1 ring-primary/25 grid place-items-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </span>
        {d && DIcon && <DIcon className={cn("h-5 w-5", d.text)} />}
      </div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-2.5">
        {task.tipo === "acao" ? "Ação" : "Monitoramento"}
      </p>
      <p className="text-sm font-medium leading-tight mt-0.5 line-clamp-2">{task.titulo}</p>
      {task.conteudo && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 flex-1">{task.conteudo}</p>}
      <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] space-y-1.5">
        {d && DIcon ? (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1", d.chip)}>
            <DIcon className="h-3 w-3" /> {d.label}
          </span>
        ) : (
          <StatusChip status={task.status} />
        )}
        {!d && (
          <p className={cn("flex items-center gap-1.5 text-[11px] leading-snug", prazo.cls)}>
            <CalendarDays className="h-3 w-3 shrink-0" /> {prazo.label}
          </p>
        )}
      </div>
    </button>
  );
}

const DRAFT_VAZIO = { titulo: "", conteudo: "", prazo: "", status: "" };

export function ProcessoTimeline({ etapas: etapasIniciais, badge }: { etapas: Etapa[]; badge?: string }) {
  const [etapas, setEtapas] = useState<Etapa[]>(() => etapasIniciais.map((e) => ({ ...e, tasks: e.tasks ?? [] })));
  const [ordem, setOrdem] = useState(1);

  const [tipoDialog, setTipoDialog] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<{ etapaId: string; tipo: TaskTipo } | null>(null);
  const [draft, setDraft] = useState(DRAFT_VAZIO);

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

  const prazoDate = ymdToDate(draft.prazo);

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
          const sub =
            e.status === "concluida"
              ? `iniciada em ${e.inicio ?? "sem data"} · levou ${diffDias(e.inicio, e.conclusao)} dia(s)`
              : e.status === "atual"
                ? `em curso desde ${e.inicio ?? "sem data"} · ${diffDias(e.inicio, hojeBR())} dia(s)`
                : `prazo-alvo de ${e.prazoAlvoDias ?? 0} dias`;
          const temGrid = (e.tasks?.length ?? 0) > 0 || podeAdicionar;

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
                    <>
                      {/* trilho discreto na cor do tema + partícula recortada
                          no trecho (não vaza da milestone) */}
                      <div className="absolute top-5 bottom-0 w-px left-1/2 -translate-x-1/2 bg-primary/20" />
                      <div className="absolute top-5 bottom-0 w-1.5 left-1/2 -translate-x-1/2 overflow-hidden">
                        <span className="absolute inset-x-0 h-10 flow-down bg-gradient-to-b from-transparent via-primary/45 to-transparent" />
                      </div>
                    </>
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

                {/* Tarefas lado a lado (3 por linha) + tile de adicionar */}
                {temGrid && (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {(e.tasks ?? []).map((t) => (
                      <TaskCard key={t.id} task={t} onClick={() => abrirDesfecho(t)} />
                    ))}
                    {podeAdicionar && (
                      <button
                        onClick={() => setTipoDialog(e.id)}
                        className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border hover:border-primary/50 hover:bg-primary/[0.04] min-h-[172px] text-muted-foreground hover:text-primary transition-colors"
                      >
                        <span className="h-9 w-9 rounded-xl bg-primary/10 grid place-items-center">
                          <Plus className="h-5 w-5 text-primary" />
                        </span>
                        <span className="text-xs font-medium">Adicionar tarefa</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Status: última info antes da próxima milestone */}
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
        <DialogContent className={PREMIUM_DIALOG}>
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
            <DialogDescription>Escolha o tipo. Isso muda como a tarefa é acompanhada.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {(["acao", "monitoramento"] as const).map((tp) => (
              <button
                key={tp}
                onClick={() => escolherTipo(tp)}
                className="group flex flex-col items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:border-primary/50 hover:bg-primary/[0.06] p-5 transition-all hover:-translate-y-0.5"
              >
                <span className="h-12 w-12 rounded-2xl bg-primary/12 ring-1 ring-primary/25 grid place-items-center">
                  {tp === "acao" ? <Zap className="h-6 w-6 text-primary" /> : <Eye className="h-6 w-6 text-primary" />}
                </span>
                <span className="text-sm font-medium">{tp === "acao" ? "Ação" : "Monitoramento"}</span>
                <span className="text-[11px] text-muted-foreground text-center leading-snug">
                  {tp === "acao"
                    ? "Algo que a gente precisa fazer: protocolar, peticionar, juntar documento."
                    : "Só acompanhar ou aguardar um ato, sem ação nossa imediata."}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Popup 2: detalhes da tarefa ── */}
      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className={PREMIUM_DIALOG}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg bg-primary/12 ring-1 ring-primary/25 grid place-items-center">
                {detalhe?.tipo === "acao" ? <Zap className="h-4 w-4 text-primary" /> : <Eye className="h-4 w-4 text-primary" />}
              </span>
              Nova {detalhe?.tipo === "acao" ? "ação" : "tarefa de monitoramento"}
            </DialogTitle>
            <DialogDescription>Preencha os detalhes. O status vira o que o processo passa a aguardar.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Título" hint="Um resumo curto. Ex.: “Protocolar réplica”, “Acompanhar decisão de provas”.">
              <Input value={draft.titulo} onChange={(ev) => setDraft((d) => ({ ...d, titulo: ev.target.value }))} placeholder="Título da tarefa" />
            </Field>

            <Field label="Descrição" hint="Detalhe o que precisa ser feito, com referências (peças, prazos, links).">
              <Textarea value={draft.conteudo} onChange={(ev) => setDraft((d) => ({ ...d, conteudo: ev.target.value }))} placeholder="Sobre a tarefa…" rows={3} />
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Prazo" hint="Data limite da tarefa. A contagem regressiva no card usa essa data.">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start font-normal gap-2", !draft.prazo && "text-muted-foreground")}>
                      <CalendarDays className="h-4 w-4" />
                      {prazoDate ? format(prazoDate, "dd 'de' MMM 'de' yyyy", { locale: ptBR }) : "Escolher data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      locale={ptBR}
                      selected={prazoDate}
                      onSelect={(date) => setDraft((d) => ({ ...d, prazo: date ? dateToYmd(date) : "" }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </Field>

              <Field label="Status processual" hint="O que o processo passa a aguardar. Vira o status que pisca na etapa atual.">
                <Select value={draft.status} onValueChange={(v) => setDraft((d) => ({ ...d, status: v }))}>
                  <SelectTrigger className="text-xs"><SelectValue placeholder="Obrigatório" /></SelectTrigger>
                  <SelectContent>
                    {STATUS_PROCESSUAIS.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
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
        <DialogContent className={PREMIUM_DIALOG}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg bg-primary/12 ring-1 ring-primary/25 grid place-items-center">
                {desfechoTask?.tipo === "acao" ? <Zap className="h-4 w-4 text-primary" /> : <Eye className="h-4 w-4 text-primary" />}
              </span>
              <span className="truncate">{desfechoTask?.titulo}</span>
            </DialogTitle>
            <DialogDescription>Qual o desfecho dessa tarefa? Registre também o porquê.</DialogDescription>
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
                    "flex flex-col items-center gap-1.5 rounded-2xl border p-3.5 transition-all hover:-translate-y-0.5",
                    ativo ? cn("ring-1", info.chip) : "border-white/[0.08] bg-white/[0.03] hover:border-primary/40 text-muted-foreground",
                  )}
                >
                  <DIcon className="h-5 w-5" />
                  <span className="text-xs font-medium">{info.label}</span>
                </button>
              );
            })}
          </div>

          <Field
            label="Observações"
            hint="Fica registrado na tarefa. Vamos reaproveitar esse histórico depois."
          >
            <Textarea
              value={desfechoDraft.obs}
              onChange={(ev) => setDesfechoDraft((d) => ({ ...d, obs: ev.target.value }))}
              placeholder={
                desfechoDraft.desfecho === "concluido" ? "Como foi concluída…"
                  : desfechoDraft.desfecho === "perdido" ? "Por que foi perdida…"
                    : desfechoDraft.desfecho === "cancelado" ? "Por que foi cancelada…"
                      : "Escolha um desfecho acima…"
              }
              rows={3}
            />
          </Field>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDesfechoTask(null)}>Cancelar</Button>
            <Button disabled={!desfechoDraft.desfecho} onClick={salvarDesfecho}>Salvar desfecho</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
