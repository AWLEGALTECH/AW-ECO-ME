import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SpotlightCard } from "@/components/SpotlightCard";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, XCircle, Clock, FileSignature, User, Briefcase, Scale, Search, FolderOpen, Loader2, Sparkles, ExternalLink, FileText, ClipboardList, FolderCheck, AlertCircle, MessageCircle, CalendarDays, Users } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BOAS_VINDAS_PADRAO, renderMensagem } from "@/lib/mensagensProntas";
import { nomeSobrenome } from "@/lib/audit";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { appConfig } from "@/config/app-config";

interface PreCliente {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  rg: string | null;
  estado_civil: string | null;
  profissao: string | null;
  telefone: string | null;
  email: string | null;
  endereco_completo: string | null;
  produto: string | null;
  rubricas: string[] | null;
  valor_causa: number | null;
  status: "aguardando_assinatura" | "confirmado" | "cancelado";
  origem: string;
  drive_folder_id: string | null;
  drive_folder_url: string | null;
  cliente_id: string | null;
  created_at: string;
  confirmed_at: string | null;
}

const fmtBRL = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));

// Voluntário que cadastrou o pré-cliente (fica no JSONB dados_completos).
const voluntarioDe = (p: any): string | null => {
  const v = p?.dados_completos?.cadastrado_por;
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

// Rubricas da análise comercial vinculada ao pré-cliente que NÃO foram
// bloqueadas (as ajuizáveis). Fica no próprio registro
// (dados_completos.dadosKit._analise_comercial.rubricas) — sem casar por nome.
interface RubricaPre { rubrica: string; valor: number | null }
const rubricasNaoBloqueadas = (p: any): RubricaPre[] => {
  const arr = p?.dados_completos?.dadosKit?._analise_comercial?.rubricas;
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((r: any) => r && !r.bloqueada)
    .map((r: any) => ({ rubrica: String(r.rubrica || "").trim(), valor: r.valor ?? null }))
    .filter((r: RubricaPre) => r.rubrica);
};
const rubricasBloqueadasCount = (p: any): number => {
  const arr = p?.dados_completos?.dadosKit?._analise_comercial?.rubricas;
  return Array.isArray(arr) ? arr.filter((r: any) => r && r.bloqueada).length : 0;
};

// Data de referência pro histórico: quando FECHOU (confirmado) ou foi cancelado;
// senão, quando foi criado. É por ela que período e agrupamento funcionam.
const refDate = (p: any): string => {
  if (p.status === "confirmado" && p.confirmed_at) return p.confirmed_at;
  if (p.status === "cancelado" && p.cancelled_at) return p.cancelled_at;
  return p.created_at;
};

const MESES_LONG = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesLabelLong = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MESES_LONG[m - 1]} de ${y}`;
};

type PeriodoKey = "tudo" | "mes_atual" | "mes_passado" | "30d" | "90d" | "ano" | "custom";
const PERIODO_LABEL: Record<PeriodoKey, string> = {
  tudo: "Todo o histórico",
  mes_atual: "Este mês",
  mes_passado: "Mês passado",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  ano: "Este ano",
  custom: "Intervalo personalizado",
};
function rangeDoPeriodo(key: PeriodoKey, ini?: string, fim?: string): [Date | null, Date | null] {
  const now = new Date();
  const startDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endDay = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  const DIA = 86400000;
  switch (key) {
    case "mes_atual":   return [new Date(now.getFullYear(), now.getMonth(), 1), endDay(now)];
    case "mes_passado": return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)];
    case "30d":         return [startDay(new Date(now.getTime() - 29 * DIA)), endDay(now)];
    case "90d":         return [startDay(new Date(now.getTime() - 89 * DIA)), endDay(now)];
    case "ano":         return [new Date(now.getFullYear(), 0, 1), endDay(now)];
    case "custom":      return [ini ? startDay(new Date(ini + "T00:00:00")) : null, fim ? endDay(new Date(fim + "T00:00:00")) : null];
    default:            return [null, null];
  }
}

function ConfirmarDialog({ pre, onConfirmed }: { pre: PreCliente; onConfirmed: (driveUrl: string, observacoes: string) => void }) {
  const [open, setOpen] = useState(false);
  const [drive, setDrive] = useState(pre.drive_folder_url ?? "");
  const [observacoes, setObservacoes] = useState("");
  const [docsConfirmados, setDocsConfirmados] = useState(false);
  const autoCreated = !!pre.drive_folder_url;

  const driveValido = /^https?:\/\/(drive|docs)\.google\.com\//i.test(drive.trim());
  const podeConfirmar = driveValido && docsConfirmados;

  const handleConfirmar = () => {
    if (!podeConfirmar) {
      if (!driveValido) toast.error("Cole um link válido do Google Drive.");
      else if (!docsConfirmados) toast.error("Confirme que já subiu os documentos no Drive.");
      return;
    }
    setOpen(false);
    setDocsConfirmados(false);
    onConfirmed(drive.trim(), observacoes.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setDrive(pre.drive_folder_url ?? ""); setObservacoes(""); setDocsConfirmados(false); } }}>
      <DialogTrigger asChild>
        <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-500">
          <CheckCircle2 className="h-4 w-4 mr-1.5" />
          Confirmar cadastro
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar cadastro de {pre.nome}?</DialogTitle>
          <DialogDescription>
            Vai criar um cliente em Clientes com os dados do pré-cadastro e organizar a pasta do Drive automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Pasta do Drive */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="drive-url" className="flex items-center gap-2 text-sm">
                <FolderOpen className="h-4 w-4 text-primary" />
                Pasta do Google Drive <span className="text-destructive">*</span>
              </Label>
              {driveValido && (
                <a
                  href={drive.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline shrink-0"
                >
                  <ExternalLink className="h-3 w-3" />
                  Abrir
                </a>
              )}
            </div>
            <Input
              id="drive-url"
              type="url"
              placeholder="https://drive.google.com/drive/folders/..."
              value={drive}
              onChange={(e) => setDrive(e.target.value)}
              autoFocus
            />
            {autoCreated && (
              <p className="text-[11px] text-emerald-400 inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Pasta criada automaticamente.
              </p>
            )}
          </div>

          {/* Confirmação dos documentos — linha clicável */}
          <label
            className={`flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer select-none transition-colors ${
              docsConfirmados
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-amber-400/30 bg-amber-400/5"
            }`}
          >
            <Checkbox
              checked={docsConfirmados}
              onCheckedChange={(v) => setDocsConfirmados(!!v)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <p className="text-sm font-medium leading-tight">Já subi todos os documentos na pasta</p>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Após confirmar, a IA detecta e renomeia os arquivos (RG, contrato, comprovante, extrato…).
              </p>
            </div>
          </label>

          {/* Observações do aprovador */}
          <div className="space-y-1.5">
            <Label htmlFor="obs-aprovacao" className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-primary" />
              Observações <span className="text-muted-foreground font-normal text-xs">· opcional</span>
            </Label>
            <Textarea
              id="obs-aprovacao"
              rows={3}
              placeholder="Algo relevante sobre o cliente (contexto, pendências, alertas)…"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">Fica registrada na ficha do cliente.</p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={handleConfirmar}
            disabled={!podeConfirmar}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
          >
            Confirmar cadastro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal de progresso da confirmação ──────────────────────────────────────
type StageKey = "cliente" | "contrato" | "demanda" | "pre_cliente" | "whatsapp" | "organize";
type StageStatus = "pending" | "running" | "done" | "error";
interface StageState { status: StageStatus; detail?: string; }
type StagesMap = Record<StageKey, StageState>;

const STAGE_META: Record<StageKey, { label: string; Icon: any }> = {
  cliente:     { label: "Cadastrando cliente",            Icon: User },
  contrato:    { label: "Vinculando contrato",            Icon: FileText },
  demanda:     { label: "Iniciando análise documental",   Icon: ClipboardList },
  pre_cliente: { label: "Finalizando pré-cadastro",       Icon: CheckCircle2 },
  whatsapp:    { label: "Enviando boas-vindas no WhatsApp", Icon: MessageCircle },
  organize:    { label: "Organizando pasta no Drive",     Icon: FolderCheck },
};

interface RenameItem { id: string; de: string; para: string; categoria: string; debug?: string; }
interface OrganizeResult {
  ok?: boolean;
  total_arquivos?: number;
  classificados_agora?: number;
  ja_canonicos?: number;
  nao_processados?: number;
  parcial?: boolean;
  renames?: RenameItem[];
  folder_movido?: boolean;
  folder_url?: string;
  error?: string;
}

// Espelha o JSON gravado em pre_clientes.organize_progress pela edge
// function organize-client-folder. Atualizado a cada arquivo classificado;
// o frontend faz polling pra mostrar em tempo real.
interface OrganizeLiveProgress {
  atualizado_em?: string;
  total?: number;
  processados?: number;
  ja_canonicos?: number;
  a_classificar?: number;
  atual?: string | null;
  etapa?: "preparando" | "classificando" | "esperando_rate_limit" | "finalizado" | "parcial";
  ultimo_renomeado?: { de: string; para: string; categoria: string };
  finalizado?: boolean;
}

function ProgressoModal({
  open, pre, stages, organizeResult, liveProgress, onClose, onMinimize,
}: {
  open: boolean;
  pre: PreCliente | null;
  stages: StagesMap;
  organizeResult: OrganizeResult | null;
  liveProgress: OrganizeLiveProgress | null;
  onClose: () => void;
  onMinimize: () => void;
}) {
  const completed = Object.values(stages).filter((s) => s.status === "done").length;
  const total = Object.keys(stages).length;
  const progresso = Math.round((completed / total) * 100);
  const tudoCompleto = completed === total;
  const algumErro = Object.values(stages).some((s) => s.status === "error");
  const emAndamento = !tudoCompleto && !algumErro;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && (tudoCompleto || algumErro)) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" onPointerDownOutside={(e) => { if (!tudoCompleto && !algumErro) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (!tudoCompleto && !algumErro) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tudoCompleto ? (
              <><Sparkles className="h-5 w-5 text-emerald-400" /> Cadastro concluído</>
            ) : algumErro ? (
              <><AlertCircle className="h-5 w-5 text-destructive" /> Algo deu errado</>
            ) : (
              <><Loader2 className="h-5 w-5 animate-spin text-primary" /> Confirmando cadastro</>
            )}
          </DialogTitle>
          <DialogDescription className="truncate">{pre?.nome}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <Progress value={progresso} className="h-1.5" />
          <div className="space-y-2">
            {(Object.keys(STAGE_META) as StageKey[]).map((key) => {
              const stage = stages[key];
              const meta = STAGE_META[key];
              const Icon = meta.Icon;
              return (
                <div key={key} className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {stage.status === "done" && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
                    {stage.status === "running" && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                    {stage.status === "pending" && <Icon className="h-5 w-5 text-muted-foreground/40" />}
                    {stage.status === "error" && <XCircle className="h-5 w-5 text-destructive" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${stage.status === "done" ? "text-foreground" : stage.status === "pending" ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                      {meta.label}
                    </p>
                    {stage.detail && (
                      <p className={`text-[11px] ${stage.status === "error" ? "text-destructive" : "text-muted-foreground"} truncate`}>
                        {stage.detail}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progresso ao vivo da renomeacao — so aparece enquanto a etapa
              organize esta rodando (antes do resultado final estar pronto). */}
          {stages.organize.status === "running" && liveProgress && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>
                  Renomeando arquivos
                  {typeof liveProgress.processados === "number" && typeof liveProgress.total === "number" && liveProgress.total > 0 && (
                    <> · <span className="tabular-nums">{liveProgress.processados}/{liveProgress.total}</span></>
                  )}
                </span>
              </div>
              {typeof liveProgress.processados === "number" && typeof liveProgress.total === "number" && liveProgress.total > 0 && (
                <Progress
                  value={Math.round((liveProgress.processados / liveProgress.total) * 100)}
                  className="h-1.5"
                />
              )}
              {liveProgress.etapa === "esperando_rate_limit" ? (
                <p className="text-[11px] text-muted-foreground italic">
                  Aguardando intervalo do rate limit do Gemini (free tier 10 RPM)…
                </p>
              ) : liveProgress.atual ? (
                <div className="text-[11px] text-muted-foreground">
                  <span className="text-foreground/70">Analisando:</span>{" "}
                  <span className="font-mono break-all">{liveProgress.atual}</span>
                </div>
              ) : null}
              {liveProgress.ultimo_renomeado && (
                <div className="text-[11px] flex items-center gap-1.5 flex-wrap">
                  <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                  <span className="text-muted-foreground/70 line-through truncate max-w-[140px]">{liveProgress.ultimo_renomeado.de}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-foreground font-medium font-mono break-all">{liveProgress.ultimo_renomeado.para}</span>
                  <span className="text-[10px] text-muted-foreground/60 ml-auto">{liveProgress.ultimo_renomeado.categoria}</span>
                </div>
              )}
            </div>
          )}

          {/* Resultado da organização */}
          {organizeResult && organizeResult.renames && organizeResult.renames.length > 0 && (
            <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                <span>Arquivos detectados e renomeados</span>
              </div>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {organizeResult.renames.map((r) => {
                  const renomeado = r.de !== r.para;
                  return (
                    <div key={r.id} className="flex items-center gap-2 text-[11px] py-0.5">
                      {renomeado ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <XCircle className="h-3 w-3 text-muted-foreground/50 flex-shrink-0" />
                      )}
                      <span className={`truncate ${renomeado ? "text-foreground" : "text-muted-foreground"}`}>
                        {renomeado ? r.para : r.de}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 ml-auto flex-shrink-0">
                        {renomeado ? r.categoria : "não classificado"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {organizeResult?.folder_url && (
            <a href={organizeResult.folder_url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Abrir pasta no Drive
              </Button>
            </a>
          )}
          {emAndamento && (
            <Button variant="outline" size="sm" onClick={onMinimize}>
              Deixar em segundo plano
            </Button>
          )}
          <Button
            onClick={onClose}
            disabled={emAndamento}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
          >
            {tudoCompleto ? "Concluir" : algumErro ? "Fechar" : "Aguarde…"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_META: Record<PreCliente["status"], { label: string; color: string; Icon: any }> = {
  aguardando_assinatura: { label: "Aguardando assinatura", color: "text-amber-400 border-amber-400/30 bg-amber-400/5", Icon: Clock },
  confirmado:            { label: "Confirmado",            color: "text-emerald-400 border-emerald-400/30 bg-emerald-400/5", Icon: CheckCircle2 },
  cancelado:             { label: "Cancelado",             color: "text-muted-foreground border-border bg-muted/20", Icon: XCircle },
};

export default function PreClientes() {
  useEffect(() => { document.title = `Pré-clientes — ${appConfig.name}`; }, []);
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filtroStatus, setFiltroStatus] = useState<PreCliente["status"] | "todos">("aguardando_assinatura");
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<PeriodoKey>("tudo");
  const [customIni, setCustomIni] = useState("");
  const [customFim, setCustomFim] = useState("");
  const [voluntario, setVoluntario] = useState("todos");
  const [expandido, setExpandido] = useState<PreCliente | null>(null);

  const { data: preClientes, isLoading } = useQuery({
    queryKey: ["pre_clientes", filtroStatus],
    queryFn: async () => {
      let q = supabase.from("pre_clientes").select("*").order("created_at", { ascending: false });
      if (filtroStatus !== "todos") q = q.eq("status", filtroStatus);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as PreCliente[];
    },
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });

  // ── Estado do modal de progresso ────────────────────────────────────────
  const STAGES_INICIAIS: StagesMap = {
    cliente:     { status: "pending" },
    contrato:    { status: "pending" },
    demanda:     { status: "pending" },
    pre_cliente: { status: "pending" },
    whatsapp:    { status: "pending" },
    organize:    { status: "pending" },
  };
  const [confirmandoPre, setConfirmandoPre] = useState<PreCliente | null>(null);
  const [modalMinimizado, setModalMinimizado] = useState(false);
  const [stages, setStages] = useState<StagesMap>(STAGES_INICIAIS);
  const [organizeResult, setOrganizeResult] = useState<OrganizeResult | null>(null);
  const [liveProgress, setLiveProgress] = useState<OrganizeLiveProgress | null>(null);

  // Polling do progresso em tempo real durante a etapa "organize". A edge
  // function escreve em pre_clientes.organize_progress a cada arquivo
  // processado; o frontend le essa coluna a cada 1.5s pra mostrar o
  // arquivo atual + o ultimo renomeado.
  useEffect(() => {
    if (!confirmandoPre) return;
    if (stages.organize.status !== "running") return;
    let cancelado = false;
    const tick = async () => {
      if (cancelado) return;
      const { data } = await supabase
        .from("pre_clientes")
        .select("organize_progress" as any)
        .eq("id", confirmandoPre.id)
        .single();
      if (cancelado) return;
      const p = (data as any)?.organize_progress as OrganizeLiveProgress | null;
      if (p) setLiveProgress(p);
    };
    tick();
    const id = setInterval(tick, 1500);
    return () => { cancelado = true; clearInterval(id); };
  }, [confirmandoPre, stages.organize.status]);

  // Quando o modal esta minimizado e a etapa final termina, dispara toast
  // com botao pra reabrir o modal e ver detalhes.
  useEffect(() => {
    if (!modalMinimizado || !confirmandoPre) return;
    const orgStatus = stages.organize.status;
    if (orgStatus !== "done" && orgStatus !== "error") return;
    const nome = confirmandoPre.nome;
    if (orgStatus === "done") {
      const total = organizeResult?.total_arquivos ?? 0;
      const renomeados = (organizeResult?.renames || []).filter(r => r.de !== r.para).length;
      toast.success(`Pasta de ${nome} organizada (${renomeados}/${total} renomeados)`, {
        action: { label: "Ver detalhes", onClick: () => setModalMinimizado(false) },
      });
    } else {
      toast.error(`Falha ao organizar pasta de ${nome}`, {
        action: { label: "Ver detalhes", onClick: () => setModalMinimizado(false) },
      });
    }
    // Limpa estado pra que o modal nao reabra automaticamente
    setConfirmandoPre(null);
    setStages(STAGES_INICIAIS);
    setOrganizeResult(null);
    setLiveProgress(null);
    setModalMinimizado(false);
  }, [stages.organize.status, modalMinimizado, confirmandoPre, organizeResult]);

  const setStage = (key: StageKey, patch: StageState) =>
    setStages((prev) => ({ ...prev, [key]: patch }));

  const iniciarConfirmacao = async (pre: PreCliente, driveFolderUrl: string, observacoes?: string) => {
    if (!user) return;
    setConfirmandoPre(pre);
    setStages(STAGES_INICIAIS);
    setOrganizeResult(null);
    setLiveProgress(null);

    const dkInicial: any = (pre as any).dados_completos?.dadosKit ?? null;
    const dk: any = (pre as any).dados_completos?.dadosKit ?? null;

    // 1. cria cliente — com desambiguação de homônimos.
    // A tabela clientes tem índice único em UPPER(TRIM(nome)). Homônimos
    // legítimos (ex.: dois "Bruno da Costa Paz" com CPFs diferentes) quebrariam
    // a criação. Em vez de falhar, tenta o nome real e, se colidir, adiciona um
    // sufixo incremental — mantendo as pessoas separadas (nunca mistura CPFs).
    setStage("cliente", { status: "running" });
    const clientePayloadBase: any = {
      cpf_cnpj: pre.cpf_cnpj,
      telefone: pre.telefone,
      email: pre.email,
      endereco: pre.endereco_completo,
      comarca: dkInicial?.cliente_comarca || null,
      uf: dkInicial?.cliente_uf || null,
      rg: pre.rg,
      profissao: pre.profissao,
      nacionalidade: (pre as any).nacionalidade || dkInicial?.cliente_nacionalidade || null,
      estado_civil: pre.estado_civil || dkInicial?.cliente_estado_civil || null,
      orgao_expedidor: (pre as any).orgao_expedidor || dkInicial?.cliente_orgao_expedidor || null,
      genero: dkInicial?.cliente_genero || null,
      observacoes: observacoes?.trim() || null,
      drive_folder_url: driveFolderUrl,
      origem: "writer",
      cadastrado_por: (pre as any).dados_completos?.cadastrado_por || "Adria Mota",
      // Réu(s) vindos do kit (causa_reus) ficam em pre.rubricas — grava
      // tambem em clientes.requerido pra aparecer no card da esteira.
      requerido: pre.rubricas && pre.rubricas.length ? pre.rubricas.join(", ") : null,
      precisa_analise_extratos: true,
    };
    let novoCliente: any = null;
    let errCli: any = null;
    let nomeFinal = pre.nome;
    for (let tentativa = 0; tentativa < 6; tentativa++) {
      nomeFinal = tentativa === 0 ? pre.nome : `${pre.nome} (${tentativa + 1})`;
      const res = await supabase
        .from("clientes")
        .insert({ ...clientePayloadBase, nome: nomeFinal } as any)
        .select()
        .single();
      if (!res.error) { novoCliente = res.data; errCli = null; break; }
      errCli = res.error;
      const homonimo = /duplicate key|clientes_nome_unique_idx|23505/i.test(res.error.message || "");
      if (!homonimo) break;
    }
    if (errCli || !novoCliente) {
      setStage("cliente", { status: "error", detail: errCli?.message || "Falha ao cadastrar cliente" });
      return;
    }
    setStage("cliente", nomeFinal !== pre.nome
      ? { status: "done", detail: `Homônimo — cadastrado como "${nomeFinal}"` }
      : { status: "done" });

    // 2. cria contrato
    setStage("contrato", { status: "running" });
    const { data: contrato, error: errContrato } = await supabase
      .from("contratos" as any)
      .insert({
        cliente_id: novoCliente.id,
        modalidade: pre.produto || "Êxito",
        valor_total: pre.valor_causa,
        percentual_exito: dk?.honorarios_percentual_exito ? Number(dk.honorarios_percentual_exito) || null : null,
        motivo: dk?.causa_motivo_outro || dk?.causa_motivo || null,
        reus: pre.rubricas && pre.rubricas.length ? pre.rubricas : null,
        data_assinatura: dk?.contrato_data_assinatura || null,
        drive_url: driveFolderUrl,
        pre_cliente_id: pre.id,
        status: "ativo",
      })
      .select()
      .single();
    if (errContrato) {
      setStage("contrato", { status: "error", detail: errContrato.message });
    } else {
      setStage("contrato", { status: "done" });
    }

    // 3. cria análise documental inicial
    setStage("demanda", { status: "running" });
    const { error: errDem } = await supabase
      .from("demandas" as any)
      .insert({
        cliente_id: novoCliente.id,
        contrato_id: (contrato as any)?.id ?? null,
        tipo: "pre_protocolo",
        etapa: "analise_documental",
        titulo: "Análise documental inicial",
        descricao: "Identificar quais descontos do cliente são ajuizáveis.",
        status: "pendente",
        created_by: user.id,
        ordem: 0,
      });
    setStage("demanda", errDem ? { status: "error", detail: errDem.message } : { status: "done" });

    // 4. fecha o pré-cliente
    setStage("pre_cliente", { status: "running" });
    const { error: errPre } = await supabase
      .from("pre_clientes")
      .update({
        status: "confirmado",
        cliente_id: novoCliente.id,
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.id,
        drive_folder_url: driveFolderUrl,
      })
      .eq("id", pre.id);
    setStage("pre_cliente", errPre ? { status: "error", detail: errPre.message } : { status: "done" });
    qc.invalidateQueries({ queryKey: ["pre_clientes"] });

    // 4b. Comissionamento — lança um fechamento atribuído a QUEM CRIOU o
    // pré-cliente (voluntário), somando os descontos ajuizáveis (rubricas não
    // bloqueadas) ao placar de Fechamentos. Falha aqui não bloqueia o fluxo.
    try {
      const descontos = rubricasNaoBloqueadas(pre).map((r) => r.rubrica);
      if (descontos.length > 0) {
        const autorNome = voluntarioDe(pre);
        // Resolve o user_id do criador pelo nome (cadastrado_por = "Primeiro Último").
        let autorId: string | null = null;
        if (autorNome) {
          const { data: profs } = await supabase.from("profiles").select("id, nome, email");
          const alvo = autorNome.trim().toLowerCase();
          autorId = (profs || []).find((p: any) => nomeSobrenome(p).toLowerCase() === alvo)?.id || null;
        }
        const { error: errFech } = await supabase.from("fechamentos" as any).insert({
          data: new Date().toISOString().slice(0, 10),
          cliente_nome: nomeFinal,
          cliente_id: novoCliente.id,
          rubricas: descontos,
          pendencia: false,
          pasta_drive: true,
          user_id: autorId,
          responsavel: autorNome,
          created_by: autorId || user.id,
          pre_cliente_id: pre.id,
        } as any);
        if (errFech && !/duplicate key|23505/i.test(errFech.message)) {
          console.warn("[fechamento] falha ao lançar:", errFech.message);
        } else if (!errFech) {
          qc.invalidateQueries({ queryKey: ["fechamentos"] });
          toast.success(`${descontos.length} ${descontos.length === 1 ? "desconto ajuizável lançado" : "descontos ajuizáveis lançados"} no fechamento${autorNome ? ` de ${autorNome}` : ""}`);
        }
      }
    } catch (e) {
      console.warn("[fechamento] erro inesperado:", e);
    }

    // 5. boas-vindas no WhatsApp corporativo (edge function -> n8n ->
    // Evolution API). Falha aqui nao bloqueia a organizacao da pasta —
    // marca a etapa com erro e segue.
    setStage("whatsapp", { status: "running" });
    if (!pre.telefone) {
      setStage("whatsapp", { status: "error", detail: "Pré-cliente sem telefone — mensagem não enviada" });
    } else {
      const { data: tpl } = await supabase
        .from("mensagens_prontas" as any)
        .select("conteudo")
        .eq("user_id", user.id)
        .eq("chave", "whatsapp_boas_vindas")
        .maybeSingle();
      const template = ((tpl as any)?.conteudo as string | undefined)?.trim() || BOAS_VINDAS_PADRAO;
      const mensagem = renderMensagem(template, {
        nome: pre.nome.trim().split(/\s+/)[0] ?? pre.nome,
        nome_completo: pre.nome,
      });
      const { data: waData, error: waErr } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          telefone: pre.telefone,
          mensagem,
          cliente_id: novoCliente.id,
          contexto: "boas_vindas_pre_cliente",
          enviado_por: user.id,
        },
      });
      const waOk = !waErr && (waData as any)?.ok;
      setStage("whatsapp", waOk
        ? { status: "done", detail: `Boas-vindas enviadas para ${pre.telefone}` }
        : { status: "error", detail: (waData as any)?.error || waErr?.message || "Falha ao enviar mensagem" });
    }

    // 6. organize-client-folder (await pra mostrar progresso)
    if (!pre.drive_folder_id) {
      setStage("organize", { status: "error", detail: "Pre-cliente sem drive_folder_id" });
      return;
    }
    setStage("organize", { status: "running", detail: "Classificando arquivos com IA…" });
    const { data: orgData, error: orgErr } = await supabase.functions.invoke("organize-client-folder", {
      body: { pre_cliente_id: pre.id },
    });
    // Trata erro de invoke (timeout 546, rede, etc.) como SUCESSO PARCIAL
    // se a pasta provavelmente ja foi movida — o cliente ja esta cadastrado
    // e a pasta foi reorganizada na primeira coisa que a function faz. So
    // a classificacao de arquivos pode ter ficado pela metade. Quem decide
    // bloquear ou nao eh o frontend, e aqui a gente prefere nao gritar.
    if (orgErr || (orgData as any)?.error) {
      const rawMsg = (orgData as any)?.error || orgErr?.message || "Falha desconhecida";
      const provavelTimeout = /546|timeout|wall.?clock|non-2xx/i.test(rawMsg);
      if (provavelTimeout) {
        setStage("organize", {
          status: "done",
          detail: "Pasta movida pra CLIENTES. Classificação ficou incompleta — reprocesse depois pela ficha do cliente.",
        });
        setOrganizeResult({ ok: true, parcial: true, total_arquivos: 0, error: undefined });
      } else {
        setStage("organize", { status: "error", detail: rawMsg });
        setOrganizeResult({ error: rawMsg });
      }
    } else {
      const res = orgData as OrganizeResult;
      setOrganizeResult(res);
      const renomeados = (res.renames || []).filter((r) => r.de !== r.para).length;
      const restantes = res.nao_processados ?? 0;
      const detail = restantes > 0
        ? `${renomeados} renomeados, ${restantes} pendentes — reprocesse pela ficha do cliente`
        : `${renomeados} de ${res.total_arquivos ?? 0} arquivos renomeados`;
      setStage("organize", { status: "done", detail });
    }
  };

  const fecharProgresso = () => {
    setConfirmandoPre(null);
    setStages(STAGES_INICIAIS);
    setOrganizeResult(null);
    setLiveProgress(null);
  };

  // Voluntários presentes no conjunto atual (pro dropdown de filtro)
  const voluntarios = useMemo(() => {
    const s = new Set<string>();
    for (const p of preClientes ?? []) { const v = voluntarioDe(p); if (v) s.add(v); }
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [preClientes]);

  const preClientesFiltrados = useMemo(() => {
    const [ini, fim] = rangeDoPeriodo(periodo, customIni, customFim);
    const q = busca.trim().toLowerCase();
    return (preClientes ?? []).filter((p) => {
      // voluntário
      if (voluntario !== "todos" && voluntarioDe(p) !== voluntario) return false;
      // período (pela data de referência: fechamento/cancelamento/criação)
      if (ini || fim) {
        const d = new Date(refDate(p));
        if (ini && d < ini) return false;
        if (fim && d > fim) return false;
      }
      // busca textual
      if (q) {
        const haystack = [p.nome, p.cpf_cnpj, p.produto, p.telefone, p.email, voluntarioDe(p), ...(p.rubricas ?? [])]
          .filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [preClientes, periodo, customIni, customFim, voluntario, busca]);

  // Resumo do período filtrado
  const resumo = useMemo(() => {
    const porVol: Record<string, number> = {};
    for (const p of preClientesFiltrados) {
      const v = voluntarioDe(p) || "sem voluntário";
      porVol[v] = (porVol[v] || 0) + 1;
    }
    return { n: preClientesFiltrados.length, porVol: Object.entries(porVol).sort((a, b) => b[1] - a[1]) };
  }, [preClientesFiltrados]);

  // Histórico agrupado por mês (mais recente primeiro)
  const grupos = useMemo(() => {
    const map = new Map<string, PreCliente[]>();
    for (const p of preClientesFiltrados) {
      const ym = refDate(p).slice(0, 7);
      if (!map.has(ym)) map.set(ym, []);
      map.get(ym)!.push(p);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([ym, items]) => ({
        ym,
        items: items.sort((x, y) => (refDate(x) < refDate(y) ? 1 : -1)),
        total: items.reduce((a, p) => a + (p.valor_causa || 0), 0),
      }));
  }, [preClientesFiltrados]);

  const cancelar = async (pre: PreCliente) => {
    if (!user) return;
    const { error } = await supabase
      .from("pre_clientes")
      .update({
        status: "cancelado",
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.id,
      })
      .eq("id", pre.id);
    if (error) { toast.error("Erro ao cancelar: " + error.message); return; }
    toast.success("Pré-cliente cancelado");
    qc.invalidateQueries({ queryKey: ["pre_clientes"] });
  };

  const renderCard = (pre: PreCliente) => {
    const meta = STATUS_META[pre.status];
    const podeAgir = pre.status === "aguardando_assinatura";
    const vol = voluntarioDe(pre);
    const dataLabel = pre.status === "confirmado" && pre.confirmed_at
      ? `fechado em ${fmtDate(pre.confirmed_at)}`
      : pre.status === "cancelado" && (pre as any).cancelled_at
        ? `cancelado em ${fmtDate((pre as any).cancelled_at)}`
        : fmtDate(pre.created_at);
    const rubricas = rubricasNaoBloqueadas(pre);
    const nBloq = rubricasBloqueadasCount(pre);
    return (
      <SpotlightCard key={pre.id} className="p-5" onClick={() => setExpandido(pre)}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-medium truncate">{pre.nome}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pre.cpf_cnpj || "Sem CPF"} · {dataLabel}
            </p>
            {vol && (
              <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground bg-muted/40 border border-border rounded-full px-2 py-0.5">
                <User className="h-2.5 w-2.5" /> {vol}
              </span>
            )}
          </div>
          <span className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${meta.color}`}>
            <meta.Icon className="h-3 w-3" />
            {meta.label}
          </span>
        </div>

        <dl className="space-y-1.5 text-xs">
          {pre.produto && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-20 shrink-0 flex items-center gap-1"><Briefcase className="h-3 w-3" />Produto</dt>
              <dd className="text-foreground truncate">{pre.produto}</dd>
            </div>
          )}
          {pre.rubricas && pre.rubricas.length > 0 && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-20 shrink-0 flex items-center gap-1"><Scale className="h-3 w-3" />Réu</dt>
              <dd className="text-foreground truncate">{pre.rubricas.join(", ")}</dd>
            </div>
          )}
          {pre.valor_causa != null && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-20 shrink-0">Valor</dt>
              <dd className="text-primary tabular-nums">{fmtBRL(pre.valor_causa)}</dd>
            </div>
          )}
          {(pre.telefone || pre.email) && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-20 shrink-0">Contato</dt>
              <dd className="text-foreground truncate">
                {[pre.telefone, pre.email].filter(Boolean).join(" · ")}
              </dd>
            </div>
          )}
        </dl>

        {rubricas.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              {rubricas.map((r, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                  <CheckCircle2 className="h-2.5 w-2.5" /> {r.rubrica}
                </span>
              ))}
            </div>
            {nBloq > 0 && (
              <p className="text-[10px] text-muted-foreground/70 mt-1">{nBloq} desconto(s) descartado(s) no comercial</p>
            )}
          </div>
        )}

        {podeAgir && (
          <div className="mt-4 flex items-center gap-2 border-t border-border pt-3" onClick={(e) => e.stopPropagation()}>
            <ConfirmarDialog pre={pre} onConfirmed={(driveUrl, obs) => iniciarConfirmacao(pre, driveUrl, obs)} />

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" className="bg-red-600 hover:bg-red-500 text-white">
                  <XCircle className="h-4 w-4 mr-1.5" />
                  Cancelar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar pré-cliente?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O pré-cliente será marcado como cancelado e sai da fila de pendentes. Use isso quando o contrato não for assinado.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => cancelar(pre)}>Cancelar pré-cliente</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {pre.status === "confirmado" && pre.cliente_id && (
          <div className="mt-4 pt-3 border-t border-border" onClick={(e) => e.stopPropagation()}>
            <a
              href={`/clientes/${pre.cliente_id}`}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <User className="h-3 w-3" />
              Ver cliente cadastrado
            </a>
          </div>
        )}

        <p className="mt-3 text-[10px] text-muted-foreground/60 text-right">clique pra ver detalhes e a pasta do Drive</p>
      </SpotlightCard>
    );
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-medium tracking-tight">Pré-clientes</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastros gerados pelo Writer aguardando confirmação pós-assinatura do contrato.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card/40 p-1">
          {(["aguardando_assinatura", "confirmado", "cancelado", "todos"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFiltroStatus(s)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                filtroStatus === s ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "aguardando_assinatura" ? "Aguardando" :
               s === "confirmado" ? "Confirmados" :
               s === "cancelado" ? "Cancelados" : "Todos"}
            </button>
          ))}
        </div>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, CPF, produto, réu ou voluntário…"
          className="pl-9 h-11 bg-card/40 border-border"
        />
      </div>

      {/* Filtros de período e voluntário */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[190px]">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
            <CalendarDays className="h-3.5 w-3.5" /> Período
          </label>
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoKey)}>
            <SelectTrigger className="h-10 bg-card/40 border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIODO_LABEL) as PeriodoKey[]).map((k) => (
                <SelectItem key={k} value={k}>{PERIODO_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {periodo === "custom" && (
          <div className="flex items-end gap-2">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-1">De</label>
              <Input type="date" value={customIni} onChange={(e) => setCustomIni(e.target.value)} className="h-10 bg-card/40 border-border" />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground block mb-1">Até</label>
              <Input type="date" value={customFim} onChange={(e) => setCustomFim(e.target.value)} className="h-10 bg-card/40 border-border" />
            </div>
          </div>
        )}

        <div className="min-w-[190px]">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-1">
            <User className="h-3.5 w-3.5" /> Voluntário
          </label>
          <Select value={voluntario} onValueChange={setVoluntario}>
            <SelectTrigger className="h-10 bg-card/40 border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os voluntários</SelectItem>
              {voluntarios.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Régua de resumo do período filtrado */}
      {!isLoading && preClientesFiltrados.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/40 p-3">
          <div className="flex items-center gap-2 pr-3 border-r border-border">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <FileSignature className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-lg font-bold tabular-nums leading-none">{resumo.n}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {filtroStatus === "confirmado" ? "fechados" : filtroStatus === "cancelado" ? "cancelados" : "no período"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {resumo.porVol.map(([v, n]) => (
              <button
                key={v}
                onClick={() => setVoluntario(voluntario === v ? "todos" : v)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                  voluntario === v ? "bg-primary/15 text-primary border-primary/30" : "border-border text-muted-foreground hover:border-primary/40"
                }`}
                title="Filtrar por este voluntário"
              >
                {v} <span className="tabular-nums font-semibold">{n}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !preClientesFiltrados.length ? (
        <SpotlightCard className="py-16 text-center">
          <FileSignature className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="mt-4 text-sm text-muted-foreground">
            {busca.trim()
              ? `Nenhum pré-cliente encontrado para "${busca}"`
              : `Nenhum pré-cliente ${filtroStatus !== "todos" ? "neste status" : "ainda"}.`}
          </p>
          {!busca.trim() && (
            <p className="text-xs text-muted-foreground/60 mt-1">
              Quando um contrato for gerado no Writer, ele aparece aqui pra confirmação.
            </p>
          )}
        </SpotlightCard>
      ) : (
        <div className="space-y-6">
          {grupos.map((g) => (
            <section key={g.ym} className="space-y-3">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-semibold capitalize flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4 text-primary" /> {mesLabelLong(g.ym)}
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  {g.items.length} {g.items.length === 1 ? "registro" : "registros"}
                  {g.total > 0 && <> · {fmtBRL(g.total)}</>}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {g.items.map(renderCard)}
              </div>
            </section>
          ))}
        </div>
      )}

      <ProgressoModal
        open={confirmandoPre !== null && !modalMinimizado}
        pre={confirmandoPre}
        stages={stages}
        organizeResult={organizeResult}
        liveProgress={liveProgress}
        onClose={fecharProgresso}
        onMinimize={() => setModalMinimizado(true)}
      />

      <PreClienteExpandido pre={expandido} onClose={() => setExpandido(null)} />
    </div>
  );
}

// Painel expandido do pré-cliente: dados completos, rubricas não bloqueadas e
// acesso à pasta do Drive. Abre ao clicar no card.
function PreClienteExpandido({ pre, onClose }: { pre: PreCliente | null; onClose: () => void }) {
  if (!pre) return null;
  const meta = STATUS_META[pre.status];
  const vol = voluntarioDe(pre);
  const rubricas = rubricasNaoBloqueadas(pre);
  const nBloq = rubricasBloqueadasCount(pre);
  const driveUrl = pre.drive_folder_url || "";
  const driveOk = /^https?:\/\/(drive|docs)\.google\.com\//i.test(driveUrl);

  const linha = (label: string, valor: ReactNode) => (
    <div className="flex gap-3 py-1.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="text-sm text-foreground min-w-0 break-words">{valor}</span>
    </div>
  );

  return (
    <Dialog open={!!pre} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[88dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {pre.nome}
            <span className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${meta.color}`}>
              <meta.Icon className="h-3 w-3" /> {meta.label}
            </span>
          </DialogTitle>
          <DialogDescription>
            {pre.cpf_cnpj || "Sem CPF"} · {fmtDate(pre.created_at)}{vol ? ` · ${vol}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Pasta do Drive em destaque */}
          <div className="rounded-lg border border-border bg-card/40 p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <FolderOpen className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm truncate">{driveOk ? "Pasta do cliente no Google Drive" : "Sem pasta do Drive vinculada"}</span>
            </div>
            {driveOk && (
              <a href={driveUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                <Button size="sm" className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir pasta
                </Button>
              </a>
            )}
          </div>

          {/* Rubricas não bloqueadas */}
          {rubricas.length > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Descontos ajuizáveis ({rubricas.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {rubricas.map((r, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2.5 py-1">
                    <CheckCircle2 className="h-3 w-3" /> {r.rubrica}
                    {r.valor != null && <span className="text-emerald-400/70 tabular-nums">· {fmtBRL(r.valor)}</span>}
                  </span>
                ))}
              </div>
              {nBloq > 0 && (
                <p className="text-[11px] text-muted-foreground/70 mt-1.5">{nBloq} desconto(s) descartado(s) no comercial (não ajuizáveis).</p>
              )}
            </div>
          ) : nBloq > 0 ? (
            <p className="text-xs text-muted-foreground italic">Todos os descontos foram descartados no comercial.</p>
          ) : null}

          {/* Dados */}
          <div className="rounded-lg border border-border bg-card/40 px-3 py-1">
            {pre.produto && linha("Produto", pre.produto)}
            {pre.rubricas && pre.rubricas.length > 0 && linha("Réu", pre.rubricas.join(", "))}
            {pre.valor_causa != null && linha("Valor da causa", <span className="text-primary tabular-nums">{fmtBRL(pre.valor_causa)}</span>)}
            {(pre.telefone || pre.email) && linha("Contato", [pre.telefone, pre.email].filter(Boolean).join(" · "))}
            {pre.endereco_completo && linha("Endereço", pre.endereco_completo)}
          </div>

          {pre.status === "confirmado" && pre.cliente_id && (
            <a href={`/clientes/${pre.cliente_id}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <User className="h-3.5 w-3.5" /> Ver cliente cadastrado
            </a>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
