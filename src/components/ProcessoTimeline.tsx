import { useState, useEffect, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Plus, Zap, Eye, Paperclip, CalendarDays, CheckCircle2, XCircle, Ban, X, ArrowRight, AlertTriangle, CornerDownRight, Trophy, Scale } from "lucide-react";
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

export type TaskTipo = "acao" | "monitoramento" | "pendencia";
export type TaskDesfecho = "concluido" | "perdido" | "cancelado";

// Ícone e rótulo por tipo de tarefa (⚡ ação · 👁 monitoramento · 📎 pendência),
// sempre na cor do tema.
export const ICONE_TIPO = { acao: Zap, monitoramento: Eye, pendencia: Paperclip } as const;
export const LABEL_TIPO = { acao: "Ação", monitoramento: "Monitoramento", pendencia: "Pendência" } as const;

// Pendências mais comuns oferecidas na caixa de seleção (documentos/providências
// que costumam faltar). No fim, o usuário ainda adiciona uma personalizada.
export const PENDENCIAS_COMUNS = [
  "Comprovante de residência",
  "Comprovante de renda",
  "Contrato",
  "Procuração assinada",
  "Documento com foto (RG/CNH)",
  "Extrato bancário",
] as const;

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

export type ResultadoSentenca = "procedente" | "parcial" | "improcedente";
export interface SentencaEtapa {
  resultado: ResultadoSentenca;
  valor: number;
  data: string;        // yyyy-mm-dd
  honorarios?: number;
  obs?: string;
}

export interface Etapa {
  id: string;
  titulo: string;
  status: "concluida" | "atual" | "pendente" | "pulada";
  inicio?: string;
  conclusao?: string;
  prazoAlvoDias?: number;
  secao?: string;
  statusProcessual?: string;
  tasks?: Task[];
  sentenca?: SentencaEtapa;   // preenchido na milestone "Sentença"
}

// Nome da milestone que exige registro de sentença para avançar.
export const ETAPA_SENTENCA = "Sentença";

const RESULTADO_SENTENCA: Record<ResultadoSentenca, { label: string; chip: string; icon: typeof Ban }> = {
  procedente:   { label: "Procedente", chip: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30", icon: Trophy },
  parcial:      { label: "Parcialmente procedente", chip: "bg-amber-500/15 text-amber-400 ring-amber-500/30", icon: Scale },
  improcedente: { label: "Improcedente", chip: "bg-red-500/15 text-red-400 ring-red-500/30", icon: XCircle },
};

const brlFmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const parseMoney = (s: string) => parseFloat(String(s).replace(/\./g, "").replace(",", ".")) || 0;

const EASE = [0.22, 1, 0.36, 1] as const;
const PREMIUM_DIALOG =
  "sm:max-w-md rounded-2xl border-white/[0.08] bg-card/95 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.55)] pointer-events-auto";

export const DESFECHOS: Record<TaskDesfecho, { label: string; chip: string; text: string; icon: typeof Ban }> = {
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
// yyyy-mm-dd -> dd/mm/aaaa
function fmtPrazo(s?: string): string {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}
function diasAtePrazo(s?: string): number | null {
  const d = ymdToDate(s);
  if (!d) return null;
  d.setHours(0, 0, 0, 0);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoje.getTime()) / 86400000);
}

function StatusChip({ status, blink }: { status: string; blink?: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 whitespace-nowrap max-w-full truncate",
      "bg-primary/15 text-primary ring-primary/30", blink && "status-blink",
    )}>
      {status}
    </span>
  );
}

// Texto explicativo do prazo (cor por urgência).
export function prazoInfo(prazo?: string): { label: string; cls: string } {
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
  const Icon = ICONE_TIPO[task.tipo];
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
        {LABEL_TIPO[task.tipo]}
      </p>
      <p className="text-sm font-medium leading-tight mt-0.5 line-clamp-2">{task.titulo}</p>
      {task.conteudo && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 flex-1">{task.conteudo}</p>}
      <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] space-y-1.5">
        {d && DIcon ? (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1", d.chip)}>
            <DIcon className="h-3 w-3" /> {d.label}
          </span>
        ) : (
          <StatusChip status={task.tipo === "pendencia" ? "Pendente" : task.status} />
        )}
        {!d && task.tipo !== "pendencia" && (
          <p className={cn("flex items-center gap-1.5 text-[11px] leading-snug", prazo.cls)}>
            <CalendarDays className="h-3 w-3 shrink-0" /> {prazo.label}
          </p>
        )}
      </div>
    </button>
  );
}

// Versão minimizada da tarefa (etapas passadas) — ocupa pouco espaço.
function TaskMini({ task, onClick }: { task: Task; onClick: () => void }) {
  const Icon = ICONE_TIPO[task.tipo];
  const d = task.desfecho ? DESFECHOS[task.desfecho] : null;
  const DIcon = d?.icon;
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-2 w-full text-left rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 hover:bg-white/[0.05] hover:border-primary/30 transition-colors"
    >
      <span className="h-5 w-5 rounded-md bg-primary/12 ring-1 ring-primary/20 grid place-items-center shrink-0">
        <Icon className="h-3 w-3 text-primary" />
      </span>
      <span className="text-xs font-medium truncate flex-1">{task.titulo}</span>
      {d && DIcon ? (
        <DIcon className={cn("h-3.5 w-3.5 shrink-0", d.text)} />
      ) : (
        <StatusChip status={task.status} />
      )}
    </button>
  );
}

// Card da sentença registrada, exibido na milestone "Sentença".
function SentencaCard({ s, onEdit }: { s: SentencaEtapa; onEdit?: () => void }) {
  const info = RESULTADO_SENTENCA[s.resultado];
  const RIcon = info.icon;
  return (
    <div className="mt-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1", info.chip)}>
          <RIcon className="h-3.5 w-3.5" /> {info.label}
        </span>
        {onEdit && <button onClick={onEdit} className="text-[11px] text-muted-foreground hover:text-primary transition-colors">editar</button>}
      </div>
      <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor da condenação</p>
          <p className="text-sm font-semibold text-emerald-400 tabular-nums mt-0.5">{brlFmt(s.valor)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Data da sentença</p>
          <p className="text-sm font-medium tabular-nums mt-0.5">{fmtPrazo(s.data)}</p>
        </div>
        {s.honorarios != null && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Honorários</p>
            <p className="text-sm font-medium tabular-nums mt-0.5">{brlFmt(s.honorarios)}</p>
          </div>
        )}
      </div>
      {s.obs && <p className="text-[11px] text-muted-foreground mt-2 leading-snug">{s.obs}</p>}
    </div>
  );
}

const DRAFT_VAZIO = { titulo: "", conteudo: "", prazo: "", status: "" };
const SENT_VAZIA = { resultado: "procedente" as ResultadoSentenca, valor: "", data: "", honorarios: "", obs: "" };

export function ProcessoTimeline({
  etapas,
  setEtapas,
  badge,
  onRegistrarSentenca,
}: {
  etapas: Etapa[];
  setEtapas: Dispatch<SetStateAction<Etapa[]>>;
  badge?: string;
  onRegistrarSentenca?: (s: SentencaEtapa) => void;
}) {
  const [ordem, setOrdem] = useState(1);
  const [sentencaDialog, setSentencaDialog] = useState<string | null>(null);
  const [sentDraft, setSentDraft] = useState<{ resultado: ResultadoSentenca; valor: string; data: string; honorarios: string; obs: string }>(SENT_VAZIA);

  const abrirSentenca = (etapaId: string, existente?: SentencaEtapa) => {
    setSentencaDialog(etapaId);
    setSentDraft(existente
      ? {
          resultado: existente.resultado,
          valor: existente.valor ? String(existente.valor).replace(".", ",") : "",
          data: existente.data,
          honorarios: existente.honorarios != null ? String(existente.honorarios).replace(".", ",") : "",
          obs: existente.obs ?? "",
        }
      : { ...SENT_VAZIA });
  };
  const salvarSentenca = () => {
    if (!sentencaDialog) return;
    const improc = sentDraft.resultado === "improcedente";
    const valorNum = parseMoney(sentDraft.valor);
    if (!improc && valorNum <= 0) { toast.error("Informe o valor da condenação."); return; }
    if (!sentDraft.data) { toast.error("Informe a data da sentença."); return; }
    const s: SentencaEtapa = {
      resultado: sentDraft.resultado,
      valor: improc ? 0 : valorNum,
      data: sentDraft.data,
      honorarios: sentDraft.honorarios ? parseMoney(sentDraft.honorarios) : undefined,
      obs: sentDraft.obs.trim() || undefined,
    };
    setEtapas((prev) => prev.map((e) => (e.id === sentencaDialog ? { ...e, sentenca: s } : e)));
    onRegistrarSentenca?.(s);
    setSentencaDialog(null);
    dispararPop(RESULTADO_SENTENCA[s.resultado].icon, "Sentença registrada", "bg-primary/15 text-primary ring-primary/30");
  };

  const [tipoDialog, setTipoDialog] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<{ etapaId: string; tipo: TaskTipo } | null>(null);
  const [draft, setDraft] = useState(DRAFT_VAZIO);
  // Estado da pendência (multi-seleção de documentos comuns + personalizadas).
  const [pendSel, setPendSel] = useState<string[]>([]);
  const [pendExtra, setPendExtra] = useState<string[]>([]);
  const [pendInput, setPendInput] = useState("");

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
    setPendSel([]);
    setPendExtra([]);
    setPendInput("");
  };

  const togglePend = (doc: string) =>
    setPendSel((prev) => (prev.includes(doc) ? prev.filter((x) => x !== doc) : [...prev, doc]));
  const addPendExtra = () => {
    const v = pendInput.trim();
    if (!v) return;
    if (![...PENDENCIAS_COMUNS, ...pendExtra].some((x) => x.toLowerCase() === v.toLowerCase()))
      setPendExtra((prev) => [...prev, v]);
    setPendInput("");
  };
  const removerPendExtra = (doc: string) => setPendExtra((prev) => prev.filter((x) => x !== doc));

  // Cria uma pendência por documento selecionado. Pendência NÃO altera o status
  // processual da etapa (é providência interna, não andamento do juízo).
  const criarPendencias = () => {
    if (!detalhe) return;
    const docs = [...pendSel, ...pendExtra].map((s) => s.trim()).filter(Boolean);
    if (!docs.length) return;
    const base = ordem;
    const novas: Task[] = docs.map((doc, i) => ({
      id: `t${base + i}`, ordem: base + i, tipo: "pendencia",
      titulo: doc, conteudo: "", prazo: "", status: "Pendente",
    }));
    setEtapas((prev) => prev.map((e) => (
      e.id === detalhe.etapaId ? { ...e, tasks: [...(e.tasks ?? []), ...novas] } : e
    )));
    setOrdem((o) => o + docs.length);
    dispararPop(Paperclip, docs.length === 1 ? "Pendência adicionada" : `${docs.length} pendências adicionadas`, "bg-primary/15 text-primary ring-primary/30");
    setDetalhe(null);
    setPendSel([]);
    setPendExtra([]);
    setPendInput("");
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
    dispararPop(detalhe.tipo === "acao" ? Zap : Eye, "Tarefa adicionada · status atualizado", "bg-primary/15 text-primary ring-primary/30");
    setDetalhe(null);
    setDraft(DRAFT_VAZIO);
  };

  const abrirDesfecho = (t: Task) => {
    setDesfechoTask(t);
    setDesfechoDraft({ desfecho: t.desfecho ?? "", obs: t.desfechoObs ?? "" });
  };
  const salvarDesfecho = () => {
    if (!desfechoTask || !desfechoDraft.desfecho) return;
    const info = DESFECHOS[desfechoDraft.desfecho as TaskDesfecho];
    setEtapas((prev) => prev.map((e) => ({
      ...e,
      tasks: (e.tasks ?? []).map((t) =>
        t.id === desfechoTask.id ? { ...t, desfecho: desfechoDraft.desfecho as TaskDesfecho, desfechoObs: desfechoDraft.obs.trim() } : t),
    })));
    setDesfechoTask(null);
    dispararPop(info.icon, `Tarefa ${info.label.toLowerCase()}`, info.chip);
  };

  // ── Avanço de milestone (popup em passos) ──
  type PassoAvanco = "data" | "destino" | "tarefas" | "resolver" | "confirmar";
  const [avancar, setAvancar] = useState<string | null>(null);   // etapa sendo concluída
  const [avancoPasso, setAvancoPasso] = useState<PassoAvanco>("data");
  const [avancoData, setAvancoData] = useState("");              // yyyy-mm-dd
  const [avancoAlvo, setAvancoAlvo] = useState("");              // etapa destino
  const [migrar, setMigrar] = useState<string[]>([]);           // tasks a levar p/ próxima
  const [resolverId, setResolverId] = useState<string | null>(null); // task resolvida inline
  const [recemAvancado, setRecemAvancado] = useState<{ concluida: string; nova: string } | null>(null);
  // Fase "fita": a linha longa (etapa ainda atual, com as tasks grandes) se
  // preenche por inteiro ANTES de recolher/trocar o estado.
  const [avancando, setAvancando] = useState<{ concluida: string; nova: string } | null>(null);

  // Pop dopaminérgico central (símbolo animado + texto, aparece e some).
  const [pop, setPop] = useState<{ Icon: typeof Ban; texto: string; tom: string } | null>(null);
  const dispararPop = (Icon: typeof Ban, texto: string, tom: string) => {
    setPop({ Icon, texto, tom });
    window.setTimeout(() => setPop(null), 1500);
  };

  const idxAvancar = avancar ? etapas.findIndex((e) => e.id === avancar) : -1;
  const etapaAvancar = idxAvancar >= 0 ? etapas[idxAvancar] : null;
  const opcoesAvanco = idxAvancar >= 0 ? etapas.slice(idxAvancar + 1) : [];
  const nomeEtapaAvancar = etapaAvancar?.titulo ?? "";
  const nomeAlvo = etapas.find((e) => e.id === avancoAlvo)?.titulo ?? "";
  const tasksAbertas = (etapaAvancar?.tasks ?? []).filter((t) => !t.desfecho);
  const todasTratadas = tasksAbertas.every((t) => migrar.includes(t.id));
  const nPuladas = (() => {
    const a = idxAvancar; const b = etapas.findIndex((e) => e.id === avancoAlvo);
    return a >= 0 && b > a ? b - a - 1 : 0;
  })();
  const avancoDataDate = ymdToDate(avancoData);

  const abrirAvanco = (etapaId: string) => {
    const idx = etapas.findIndex((e) => e.id === etapaId);
    setAvancar(etapaId);
    setAvancoPasso("data");
    setAvancoData(dateToYmd(new Date()));
    setAvancoAlvo(etapas[idx + 1]?.id ?? "");   // pré-seleciona a natural
    setMigrar([]);
  };
  const toggleMigrar = (id: string) =>
    setMigrar((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const irDoDestino = () => setAvancoPasso(tasksAbertas.length ? "tarefas" : "confirmar");

  const resolverTaskObj = resolverId ? (etapaAvancar?.tasks ?? []).find((t) => t.id === resolverId) ?? null : null;
  const abrirResolver = (id: string) => {
    setResolverId(id);
    setDesfechoDraft({ desfecho: "", obs: "" });
    setAvancoPasso("resolver");
  };
  const resolverTarefa = () => {
    if (!resolverId || !desfechoDraft.desfecho) return;
    const info = DESFECHOS[desfechoDraft.desfecho as TaskDesfecho];
    setEtapas((prev) => prev.map((e) => ({
      ...e,
      tasks: (e.tasks ?? []).map((t) =>
        t.id === resolverId ? { ...t, desfecho: desfechoDraft.desfecho as TaskDesfecho, desfechoObs: desfechoDraft.obs.trim() } : t),
    })));
    setResolverId(null);
    setAvancoPasso("tarefas");
    dispararPop(info.icon, `Tarefa ${info.label.toLowerCase()}`, info.chip);
  };

  // O Radix às vezes trava o body com pointer-events:none (bug conhecido ao
  // sobrepor popover/select/diálogo), engolindo cliques nos botões do popup.
  // Enquanto qualquer popup estiver aberto, forçamos o body clicável; ao fechar
  // tudo, devolvemos o controle ao Radix.
  useEffect(() => {
    const algumAberto = !!avancar || !!desfechoTask || !!detalhe || !!tipoDialog || !!sentencaDialog;
    if (!algumAberto) {
      document.body.style.pointerEvents = "";
      return;
    }
    const soltar = () => { if (document.body.style.pointerEvents === "none") document.body.style.pointerEvents = "auto"; };
    soltar();
    const id = window.setInterval(soltar, 120);
    return () => window.clearInterval(id);
  }, [avancar, desfechoTask, detalhe, tipoDialog, sentencaDialog]);

  const aplicarAvanco = () => {
    if (!avancar || !avancoAlvo || !avancoData) { toast.error("Avanço: faltam dados (data/destino)."); return; }
    const idxAtual = etapas.findIndex((e) => e.id === avancar);
    const idxAlvo = etapas.findIndex((e) => e.id === avancoAlvo);
    if (idxAlvo <= idxAtual) { toast.error(`Avanço: destino inválido (${idxAtual} → ${idxAlvo}).`); return; }
    const alvoNome = etapas[idxAlvo].titulo;
    const dataBR = fmtPrazo(avancoData);
    const migradas = (etapas[idxAtual].tasks ?? []).filter((t) => migrar.includes(t.id));
    const migrarSnap = [...migrar];
    const idConcluida = avancar;
    const idNova = avancoAlvo;

    // 1) Fecha o modal e mostra o POP do check (com o fundo escuro/blur).
    setAvancar(null);
    dispararPop(Check, `Avançou para ${alvoNome}`, "bg-primary/15 text-primary ring-primary/30");

    // 2) Pop fechou → começa a FITA: a linha longa (etapa ainda atual, com as
    //    tasks grandes) se preenche por inteiro, de cima até o próximo ponto.
    window.setTimeout(() => {
      setAvancando({ concluida: idConcluida, nova: idNova });

      // 3) Fita completou → troca o estado: recolhe as antigas e abre o novo foco.
      window.setTimeout(() => {
        setAvancando(null);
        setEtapas((prev) => prev.map((e, i) => {
          if (i === idxAtual) return { ...e, status: "concluida", conclusao: dataBR, tasks: (e.tasks ?? []).filter((t) => !migrarSnap.includes(t.id)) };
          if (i > idxAtual && i < idxAlvo) return { ...e, status: "pulada" };
          if (i === idxAlvo) return { ...e, status: "atual", inicio: dataBR, tasks: [...(e.tasks ?? []), ...migradas] };
          return e;
        }));
        setRecemAvancado({ concluida: idConcluida, nova: idNova });
        window.setTimeout(() => setRecemAvancado(null), 1600);
      }, 1150);
    }, 1750);
  };

  const prazoDate = ymdToDate(draft.prazo);

  return (
    <div>
      {/* Cabeçalho */}
      <div className="flex items-baseline justify-between gap-3 mb-5">
        <h3 className="font-display text-lg font-medium tracking-tight flex items-center gap-2">
          Linha do tempo &amp; Tarefas
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
          const temTasks = (e.tasks?.length ?? 0) > 0;
          // Datas anteriores ao sistema não têm data real: exibimos "pré-sistema"
          // sem inventar duração.
          const inicioValido = !!parseBR(e.inicio);
          const conclusaoValida = !!parseBR(e.conclusao);
          const sub =
            e.status === "concluida"
              ? (inicioValido && conclusaoValida
                  ? `iniciada em ${e.inicio} · levou ${diffDias(e.inicio, e.conclusao)} dia(s)`
                  : "registro anterior ao sistema")
              : e.status === "atual"
                ? (inicioValido
                    ? `em curso desde ${e.inicio} · ${diffDias(e.inicio, hojeBR())} dia(s)`
                    : "em curso")
                : e.status === "pulada"
                  ? "etapa pulada"
                  : e.prazoAlvoDias
                    ? `prazo-alvo de ${e.prazoAlvoDias} dias`
                    : "etapa futura";

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
                    avancando?.concluida === e.id ? (
                      // FITA: a linha longa se preenche por inteiro (cima → baixo)
                      <>
                        <div className="absolute top-5 bottom-0 w-px left-1/2 -translate-x-1/2 bg-border" />
                        <motion.div
                          className="absolute top-5 bottom-0 w-px left-1/2 -translate-x-1/2 bg-primary origin-top"
                          initial={{ scaleY: 0 }}
                          animate={{ scaleY: 1 }}
                          transition={{ duration: 1.1, ease: "easeInOut" }}
                        />
                      </>
                    ) : (
                      <>
                        {/* trilho discreto + partícula recortada no trecho */}
                        <div className="absolute top-5 bottom-0 w-px left-1/2 -translate-x-1/2 bg-primary/20" />
                        <div className="absolute top-5 bottom-0 w-1.5 left-1/2 -translate-x-1/2 overflow-hidden">
                          <span className="absolute inset-x-0 h-10 flow-down bg-gradient-to-b from-transparent via-primary/45 to-transparent" />
                        </div>
                      </>
                    )
                  ) : (
                    // concluída/pulada: linha estática (a fita já preencheu na fase 1)
                    <div className={cn("absolute top-5 bottom-0 w-px left-1/2 -translate-x-1/2", lineCls)} />
                  )
                )}
                {e.status === "concluida" ? (
                  // círculo já visível durante o preenchimento; o check só dá
                  // o pop DEPOIS da linha encher (delay ~0,72s).
                  <span className="relative z-10 mt-1 h-4 w-4 rounded-full bg-primary grid place-items-center ring-4 ring-card">
                    <motion.span
                      initial={recemAvancado?.concluida === e.id ? { scale: 0, opacity: 0 } : false}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: recemAvancado?.concluida === e.id ? 0.1 : 0 }}
                    >
                      <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
                    </motion.span>
                  </span>
                ) : e.status === "atual" ? (
                  <motion.span
                    initial={recemAvancado?.nova === e.id ? { scale: 0, opacity: 0 } : false}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: recemAvancado?.nova === e.id ? 0.2 : 0 }}
                    className="relative z-10 mt-1 h-4 w-4 rounded-full border-2 border-primary bg-card ring-4 ring-card"
                  >
                    <span className="absolute -inset-px rounded-full border-2 border-primary animate-ping opacity-60" />
                  </motion.span>
                ) : e.status === "pulada" ? (
                  <span title="Etapa pulada" className="relative z-10 mt-1 h-4 w-4 rounded-full bg-muted grid place-items-center ring-4 ring-card">
                    <X className="h-2.5 w-2.5 text-muted-foreground" strokeWidth={3} />
                  </span>
                ) : (
                  <span className="relative z-10 mt-1 h-4 w-4 rounded-full border-2 border-muted-foreground/30 bg-card ring-4 ring-card" />
                )}
              </div>

              {/* Conteúdo */}
              <div className={cn(!last && "border-b border-border/40", last ? "pb-1" : "pb-6")}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className={cn(
                      "text-sm font-medium leading-tight",
                      (e.status === "pendente" || e.status === "pulada") ? "text-muted-foreground" : "text-foreground",
                      e.status === "pulada" && "line-through",
                    )}>
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
                    {e.status === "pulada" && (
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pulada</p>
                    )}
                  </div>
                </div>

                {/* Tarefas: grade cheia (atual) ou lista minimizada (passadas).
                    No avanço, o novo espaço de foco abre DEPOIS do check (delay),
                    e as antigas se minimizam logo em seguida — dá a sensação de
                    "percorreu o caminho, concluiu, e então abriu o novo foco". */}
                {e.status === "atual" ? (
                  <motion.div
                    className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2.5 overflow-hidden"
                    initial={recemAvancado?.nova === e.id ? { height: 0, opacity: 0 } : false}
                    animate={{ height: "auto", opacity: 1 }}
                    transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: recemAvancado?.nova === e.id ? 0.35 : 0 }}
                  >
                    {(e.tasks ?? []).map((t) => (
                      <TaskCard key={t.id} task={t} onClick={() => abrirDesfecho(t)} />
                    ))}
                    <button
                      onClick={() => setTipoDialog(e.id)}
                      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border hover:border-primary/50 hover:bg-primary/[0.04] min-h-[172px] text-muted-foreground hover:text-primary transition-colors"
                    >
                      <span className="h-9 w-9 rounded-xl bg-primary/10 grid place-items-center">
                        <Plus className="h-5 w-5 text-primary" />
                      </span>
                      <span className="text-xs font-medium">Adicionar tarefa</span>
                    </button>
                  </motion.div>
                ) : temTasks ? (
                  <motion.div
                    className="mt-3 space-y-1.5"
                    initial={recemAvancado?.concluida === e.id ? { opacity: 0, scale: 0.98 } : false}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: recemAvancado?.concluida === e.id ? 0.15 : 0 }}
                  >
                    {(e.tasks ?? []).map((t) => (
                      <TaskMini key={t.id} task={t} onClick={() => abrirDesfecho(t)} />
                    ))}
                  </motion.div>
                ) : null}

                {/* Sentença registrada — card na milestone "Sentença" */}
                {e.titulo === ETAPA_SENTENCA && e.sentenca && (
                  <SentencaCard s={e.sentenca} onEdit={e.status === "atual" ? () => abrirSentenca(e.id, e.sentenca) : undefined} />
                )}

                {/* Status: aguardando (piscante) — logo após as tarefas */}
                {e.status === "atual" && (
                  <motion.div
                    className="mt-4 flex justify-center"
                    initial={recemAvancado?.nova === e.id ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.35, delay: recemAvancado?.nova === e.id ? 0.55 : 0 }}
                  >
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
                  </motion.div>
                )}

                {/* Avançar etapa — na milestone Sentença, exige a sentença antes */}
                {e.status === "atual" && (
                  <motion.div
                    className="mt-8 flex justify-center"
                    initial={recemAvancado?.nova === e.id ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.35, delay: recemAvancado?.nova === e.id ? 0.65 : 0 }}
                  >
                    {e.titulo === ETAPA_SENTENCA && !e.sentenca ? (
                      <div className="flex flex-col items-center gap-1.5">
                        <Button size="sm" className="gap-1.5" onClick={() => abrirSentenca(e.id)}>
                          <Trophy className="h-4 w-4" /> Registrar sentença
                        </Button>
                        <p className="text-[11px] text-muted-foreground">Registre a sentença para poder avançar.</p>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => abrirAvanco(e.id)}>
                        <ArrowRight className="h-4 w-4" /> Avançar etapa
                      </Button>
                    )}
                  </motion.div>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(["acao", "monitoramento", "pendencia"] as const).map((tp) => {
              const TipoIcon = ICONE_TIPO[tp];
              const desc =
                tp === "acao"
                  ? "Algo que a gente precisa fazer: protocolar, peticionar, juntar documento."
                  : tp === "monitoramento"
                    ? "Só acompanhar ou aguardar um ato, sem ação nossa imediata."
                    : "Um documento ou providência que falta: procuração, contrato, comprovante.";
              return (
                <button
                  key={tp}
                  onClick={() => escolherTipo(tp)}
                  className="group flex flex-col items-center gap-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:border-primary/50 hover:bg-primary/[0.06] p-5 transition-all hover:-translate-y-0.5"
                >
                  <span className="h-12 w-12 rounded-2xl bg-primary/12 ring-1 ring-primary/25 grid place-items-center">
                    <TipoIcon className="h-6 w-6 text-primary" />
                  </span>
                  <span className="text-sm font-medium">{LABEL_TIPO[tp]}</span>
                  <span className="text-[11px] text-muted-foreground text-center leading-snug">{desc}</span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Popup 2: detalhes da tarefa ── */}
      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className={PREMIUM_DIALOG}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg bg-primary/12 ring-1 ring-primary/25 grid place-items-center">
                {detalhe && (() => { const I = ICONE_TIPO[detalhe.tipo]; return <I className="h-4 w-4 text-primary" />; })()}
              </span>
              {detalhe?.tipo === "acao" ? "Nova ação" : detalhe?.tipo === "monitoramento" ? "Nova tarefa de monitoramento" : "Novas pendências"}
            </DialogTitle>
            <DialogDescription>
              {detalhe?.tipo === "pendencia"
                ? "Marque os documentos ou providências que faltam. Cada item vira uma pendência."
                : "Preencha os detalhes. O status vira o que o processo passa a aguardar."}
            </DialogDescription>
          </DialogHeader>

          {detalhe?.tipo === "pendencia" ? (
            <>
              <div className="space-y-4">
                <Field label="Pendências mais comuns" hint="Marque quantas precisar. Cada uma vira um card que você resolve depois.">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {PENDENCIAS_COMUNS.map((doc) => {
                      const ativo = pendSel.includes(doc);
                      return (
                        <button
                          key={doc}
                          type="button"
                          onClick={() => togglePend(doc)}
                          className={cn(
                            "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all",
                            ativo ? "border-primary/50 bg-primary/[0.06]" : "border-white/[0.08] bg-white/[0.02] hover:border-primary/30",
                          )}
                        >
                          <span className={cn("h-5 w-5 rounded-md grid place-items-center shrink-0 ring-1", ativo ? "bg-primary/20 ring-primary/40" : "ring-white/15")}>
                            {ativo && <Check className="h-3 w-3 text-primary" strokeWidth={3} />}
                          </span>
                          <span className="text-sm">{doc}</span>
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <Field label="Adicionar personalizada" hint="Alguma pendência específica deste processo? Escreva e adicione.">
                  <div className="flex gap-2">
                    <Input
                      value={pendInput}
                      onChange={(e) => setPendInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPendExtra(); } }}
                      placeholder="Ex.: Laudo médico, boletim de ocorrência…"
                    />
                    <Button type="button" variant="outline" onClick={addPendExtra} disabled={!pendInput.trim()} className="shrink-0 gap-1.5">
                      <Plus className="h-4 w-4" /> Adicionar
                    </Button>
                  </div>
                  {pendExtra.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {pendExtra.map((doc) => (
                        <span key={doc} className="inline-flex items-center gap-1 rounded-full bg-primary/12 text-primary ring-1 ring-primary/25 px-2.5 py-1 text-xs">
                          {doc}
                          <button type="button" onClick={() => removerPendExtra(doc)} className="hover:text-foreground" aria-label="Remover">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </Field>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setDetalhe(null)}>Cancelar</Button>
                <Button disabled={pendSel.length + pendExtra.length === 0} onClick={criarPendencias}>
                  {pendSel.length + pendExtra.length > 1 ? `Criar ${pendSel.length + pendExtra.length} pendências` : "Criar pendência"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
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
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Popup 3: desfecho da tarefa ── */}
      <Dialog open={!!desfechoTask} onOpenChange={(o) => !o && setDesfechoTask(null)}>
        <DialogContent className={PREMIUM_DIALOG}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg bg-primary/12 ring-1 ring-primary/25 grid place-items-center">
                {desfechoTask && (() => { const I = ICONE_TIPO[desfechoTask.tipo]; return <I className="h-4 w-4 text-primary" />; })()}
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

      {/* ── Popup: registrar sentença (obrigatório p/ avançar a milestone) ── */}
      <Dialog open={!!sentencaDialog} onOpenChange={(o) => !o && setSentencaDialog(null)}>
        <DialogContent className={PREMIUM_DIALOG}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg bg-primary/12 ring-1 ring-primary/25 grid place-items-center">
                <Trophy className="h-4 w-4 text-primary" />
              </span>
              Registrar sentença
            </DialogTitle>
            <DialogDescription>Obrigatório para avançar a etapa. As vitórias alimentam o Tracker.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Resultado" hint="Como o juízo decidiu em 1º grau.">
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(RESULTADO_SENTENCA) as ResultadoSentenca[]).map((k) => {
                  const info = RESULTADO_SENTENCA[k];
                  const RIcon = info.icon;
                  const ativo = sentDraft.resultado === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setSentDraft((d) => ({ ...d, resultado: k }))}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition-all hover:-translate-y-0.5",
                        ativo ? cn("ring-1", info.chip) : "border-white/[0.08] bg-white/[0.03] hover:border-primary/40 text-muted-foreground",
                      )}
                    >
                      <RIcon className="h-5 w-5" />
                      <span className="text-[11px] font-medium text-center leading-tight">{info.label}</span>
                    </button>
                  );
                })}
              </div>
            </Field>

            {sentDraft.resultado !== "improcedente" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Valor da condenação" hint="Total reconhecido na sentença.">
                  <Input inputMode="decimal" value={sentDraft.valor} onChange={(e) => setSentDraft((d) => ({ ...d, valor: e.target.value }))} placeholder="0,00" />
                </Field>
                <Field label="Honorários (opcional)" hint="Se fixados na sentença.">
                  <Input inputMode="decimal" value={sentDraft.honorarios} onChange={(e) => setSentDraft((d) => ({ ...d, honorarios: e.target.value }))} placeholder="0,00" />
                </Field>
              </div>
            )}

            <Field label="Data da sentença" hint="Data em que a sentença foi proferida.">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start font-normal gap-2", !sentDraft.data && "text-muted-foreground")}>
                    <CalendarDays className="h-4 w-4" />
                    {ymdToDate(sentDraft.data) ? format(ymdToDate(sentDraft.data)!, "dd 'de' MMM 'de' yyyy", { locale: ptBR }) : "Escolher data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" locale={ptBR} selected={ymdToDate(sentDraft.data)} onSelect={(d) => setSentDraft((dr) => ({ ...dr, data: d ? dateToYmd(d) : "" }))} initialFocus />
                </PopoverContent>
              </Popover>
            </Field>

            <Field label="Observações (opcional)" hint="Pontos relevantes da decisão.">
              <Textarea value={sentDraft.obs} onChange={(e) => setSentDraft((d) => ({ ...d, obs: e.target.value }))} rows={3} placeholder="Sobre a sentença…" />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSentencaDialog(null)}>Cancelar</Button>
            <Button onClick={salvarSentenca}>Registrar sentença</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Popup: avançar etapa (modal próprio, no portal do body) ── */}
      {createPortal(avancar && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" style={{ pointerEvents: "auto" }}>
          <div className="absolute inset-0 bg-black/80" onClick={() => setAvancar(null)} />
          <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-card/95 backdrop-blur-xl shadow-[0_8px_40px_rgba(0,0,0,0.55)] p-6 grid gap-4">
            <button onClick={() => setAvancar(null)} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors" aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
            <div className="space-y-1.5">
              <div className="text-lg font-semibold leading-none tracking-tight flex items-center gap-2">
                <span className="h-7 w-7 rounded-lg bg-primary/12 ring-1 ring-primary/25 grid place-items-center">
                  <ArrowRight className="h-4 w-4 text-primary" />
                </span>
                Avançar etapa
              </div>
              <p className="text-sm text-muted-foreground">
                {avancoPasso === "data" ? "Quando esta etapa foi concluída?"
                  : avancoPasso === "destino" ? "Para qual etapa o processo avança?"
                    : avancoPasso === "tarefas" ? "Há tarefas em aberto nesta etapa."
                      : avancoPasso === "resolver" ? `Desfecho de “${resolverTaskObj?.titulo ?? ""}”`
                        : "Tem certeza que deseja avançar de etapa?"}
              </p>
            </div>

          {/* Passo: data de conclusão */}
          {avancoPasso === "data" && (
            <>
              <Field label="Data de conclusão" hint={`Quando “${nomeEtapaAvancar}” foi efetivamente concluída no processo.`}>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start font-normal gap-2", !avancoData && "text-muted-foreground")}>
                      <CalendarDays className="h-4 w-4" />
                      {avancoDataDate ? format(avancoDataDate, "dd 'de' MMM 'de' yyyy", { locale: ptBR }) : "Escolher data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" locale={ptBR} selected={avancoDataDate} onSelect={(d) => setAvancoData(d ? dateToYmd(d) : "")} initialFocus />
                  </PopoverContent>
                </Popover>
              </Field>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setAvancar(null)}>Cancelar</Button>
                <Button disabled={!avancoData} onClick={() => setAvancoPasso("destino")}>Próximo</Button>
              </DialogFooter>
            </>
          )}

          {/* Passo: destino */}
          {avancoPasso === "destino" && (
            <>
              <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                {opcoesAvanco.map((op, idx) => {
                  const ativo = avancoAlvo === op.id;
                  return (
                    <button
                      key={op.id}
                      onClick={() => setAvancoAlvo(op.id)}
                      className={cn(
                        "w-full text-left rounded-xl border p-3 transition-colors",
                        ativo ? "border-primary/50 bg-primary/[0.06]" : "border-white/[0.08] bg-white/[0.02] hover:border-primary/30",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("text-sm font-medium", ativo ? "text-foreground" : "text-muted-foreground")}>{op.titulo}</span>
                        {idx === 0 && <span className="text-[10px] uppercase tracking-wider text-primary shrink-0">próxima</span>}
                      </div>
                      {idx > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">as etapas entre a atual e esta ficam marcadas como puladas</p>
                      )}
                    </button>
                  );
                })}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setAvancoPasso("data")}>Voltar</Button>
                <Button disabled={!avancoAlvo} onClick={irDoDestino}>Próximo</Button>
              </DialogFooter>
            </>
          )}

          {/* Passo: tarefas em aberto */}
          {avancoPasso === "tarefas" && (
            <>
              <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[12px] text-muted-foreground leading-snug">
                  Resolva cada tarefa (concluir, perder ou cancelar) ou leve para a próxima etapa antes de avançar.
                </p>
              </div>
              <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
                {tasksAbertas.map((t) => {
                  const Icon = ICONE_TIPO[t.tipo];
                  const levar = migrar.includes(t.id);
                  return (
                    <div key={t.id} className={cn("rounded-xl border p-2.5", levar ? "border-primary/40 bg-primary/[0.05]" : "border-white/[0.08] bg-white/[0.02]")}>
                      <div className="flex items-center gap-2">
                        <span className="h-6 w-6 rounded-md bg-primary/12 ring-1 ring-primary/20 grid place-items-center shrink-0">
                          <Icon className="h-3.5 w-3.5 text-primary" />
                        </span>
                        <span className="text-sm font-medium truncate flex-1">{t.titulo}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2">
                        {levar ? (
                          <button onClick={() => toggleMigrar(t.id)} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                            <CornerDownRight className="h-3.5 w-3.5" /> será levada para “{nomeAlvo}” · desfazer
                          </button>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => abrirResolver(t.id)}>Resolver</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => toggleMigrar(t.id)}>
                              <CornerDownRight className="h-3.5 w-3.5" /> Levar p/ próxima
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                {tasksAbertas.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">Todas as tarefas foram tratadas.</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setAvancoPasso("destino")}>Voltar</Button>
                <Button disabled={!todasTratadas} onClick={() => setAvancoPasso("confirmar")}>Próximo</Button>
              </DialogFooter>
            </>
          )}

          {/* Passo: resolver tarefa (inline, sem empilhar diálogo) */}
          {avancoPasso === "resolver" && (
            <>
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
              <Field label="Observações" hint="Fica registrado na tarefa. Vamos reaproveitar esse histórico depois.">
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
                <Button variant="ghost" onClick={() => { setResolverId(null); setAvancoPasso("tarefas"); }}>Voltar</Button>
                <Button disabled={!desfechoDraft.desfecho} onClick={resolverTarefa}>Salvar desfecho</Button>
              </DialogFooter>
            </>
          )}

          {/* Passo: confirmação */}
          {avancoPasso === "confirmar" && (
            <>
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 space-y-2 text-sm">
                <p>Concluir <strong className="text-foreground">{nomeEtapaAvancar}</strong> em <strong className="text-foreground">{avancoDataDate ? format(avancoDataDate, "dd/MM/yyyy") : ""}</strong>.</p>
                <p>Avançar para <strong className="text-primary">{nomeAlvo}</strong>.</p>
                {nPuladas > 0 && (
                  <p className="text-muted-foreground text-[12px]">{nPuladas} etapa(s) intermediária(s) ficam marcadas como puladas.</p>
                )}
                {migrar.length > 0 && (
                  <p className="text-muted-foreground text-[12px]">{migrar.length} tarefa(s) serão levadas para a nova etapa.</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setAvancoPasso(tasksAbertas.length ? "tarefas" : "destino")}>Voltar</Button>
                <Button type="button" onClick={aplicarAvanco}>Confirmar avanço</Button>
              </DialogFooter>
            </>
          )}
          </div>
        </div>
      ), document.body)}

      {/* ── Pop dopaminérgico (portal no body pra cobrir a tela toda) ── */}
      {createPortal(
      <AnimatePresence>
        {pop && (
          <motion.div
            key="dopa-pop"
            className="fixed inset-0 z-[200] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* backdrop escuro — dá protagonismo ao pop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPop(null)} />
            <motion.div
              initial={{ scale: 0.94, y: 8, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 flex flex-col items-center gap-3.5 rounded-3xl bg-card/95 backdrop-blur-xl border border-white/[0.08] px-9 py-7 shadow-[0_12px_50px_rgba(0,0,0,0.55)]"
            >
              <span className={cn("relative h-16 w-16 rounded-full grid place-items-center", pop.tom)}>
                {/* anel que se desenha ao redor do ícone */}
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100" fill="none">
                  <motion.circle
                    cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="5" strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0.4 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.6, ease: "easeInOut" }}
                  />
                </svg>
                {/* ícone revelado de forma limpa (sem balançar) */}
                <motion.span
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: 0.28 }}
                >
                  <pop.Icon className="h-7 w-7" />
                </motion.span>
              </span>
              <span className="text-sm font-medium text-center max-w-[240px]">{pop.texto}</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
      )}
    </div>
  );
}
