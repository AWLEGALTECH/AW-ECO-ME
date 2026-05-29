import { useEffect, useState } from "react";
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
import { CheckCircle2, XCircle, Clock, FileSignature, User, Briefcase, Scale, Search, FolderOpen, Loader2, Sparkles, ExternalLink, FileText, ClipboardList, FolderCheck, AlertCircle } from "lucide-react";
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

        <div className="space-y-3 pt-2">
          <div className="space-y-2">
            <Label htmlFor="drive-url" className="flex items-center gap-2 text-sm">
              <FolderOpen className="h-4 w-4 text-primary" />
              Pasta do Google Drive <span className="text-destructive">*</span>
            </Label>
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
                <CheckCircle2 className="h-3 w-3" /> Pasta criada automaticamente quando o pré-cliente nasceu.
              </p>
            )}
          </div>

          {/* Confirmação dos documentos */}
          <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3 space-y-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="space-y-1 text-xs">
                <p className="font-medium text-amber-200">Subiu os documentos no Drive?</p>
                <p className="text-muted-foreground">
                  Após confirmar, a IA vai detectar e renomear automaticamente os arquivos da pasta (RG, contrato, comprovante, extrato, etc).
                </p>
              </div>
            </div>
            {driveValido && (
              <a
                href={drive.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Abrir pasta no Drive
              </a>
            )}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={docsConfirmados}
                onCheckedChange={(v) => setDocsConfirmados(!!v)}
              />
              <span className="text-xs">Já subi todos os documentos do cliente na pasta</span>
            </label>
          </div>

          {/* Observações do aprovador */}
          <div className="space-y-2">
            <Label htmlFor="obs-aprovacao" className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-primary" />
              Observações <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Textarea
              id="obs-aprovacao"
              rows={3}
              placeholder="Anote algo relevante sobre este cliente antes de aprovar (contexto, pendências, alertas)…"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Fica registrada no cadastro do cliente, visível na ficha dele.
            </p>
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
type StageKey = "cliente" | "contrato" | "demanda" | "pre_cliente" | "organize";
type StageStatus = "pending" | "running" | "done" | "error";
interface StageState { status: StageStatus; detail?: string; }
type StagesMap = Record<StageKey, StageState>;

const STAGE_META: Record<StageKey, { label: string; Icon: any }> = {
  cliente:     { label: "Cadastrando cliente",            Icon: User },
  contrato:    { label: "Vinculando contrato",            Icon: FileText },
  demanda:     { label: "Iniciando análise documental",   Icon: ClipboardList },
  pre_cliente: { label: "Finalizando pré-cadastro",       Icon: CheckCircle2 },
  organize:    { label: "Organizando pasta no Drive",     Icon: FolderCheck },
};

interface RenameItem { id: string; de: string; para: string; categoria: string; debug?: string; }
interface OrganizeResult {
  ok?: boolean;
  total_arquivos?: number;
  renames?: RenameItem[];
  folder_movido?: boolean;
  folder_url?: string;
  error?: string;
}

function ProgressoModal({
  open, pre, stages, organizeResult, onClose, onMinimize,
}: {
  open: boolean;
  pre: PreCliente | null;
  stages: StagesMap;
  organizeResult: OrganizeResult | null;
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
    organize:    { status: "pending" },
  };
  const [confirmandoPre, setConfirmandoPre] = useState<PreCliente | null>(null);
  const [modalMinimizado, setModalMinimizado] = useState(false);
  const [stages, setStages] = useState<StagesMap>(STAGES_INICIAIS);
  const [organizeResult, setOrganizeResult] = useState<OrganizeResult | null>(null);

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
    setModalMinimizado(false);
  }, [stages.organize.status, modalMinimizado, confirmandoPre, organizeResult]);

  const setStage = (key: StageKey, patch: StageState) =>
    setStages((prev) => ({ ...prev, [key]: patch }));

  const iniciarConfirmacao = async (pre: PreCliente, driveFolderUrl: string, observacoes?: string) => {
    if (!user) return;
    setConfirmandoPre(pre);
    setStages(STAGES_INICIAIS);
    setOrganizeResult(null);

    const dkInicial: any = (pre as any).dados_completos?.dadosKit ?? null;
    const dk: any = (pre as any).dados_completos?.dadosKit ?? null;

    // 1. cria cliente
    setStage("cliente", { status: "running" });
    const { data: novoCliente, error: errCli } = await supabase
      .from("clientes")
      .insert({
        nome: pre.nome,
        cpf_cnpj: pre.cpf_cnpj,
        telefone: pre.telefone,
        email: pre.email,
        endereco: pre.endereco_completo,
        rg: pre.rg,
        profissao: pre.profissao,
        nacionalidade: pre.nacionalidade || dkInicial?.cliente_nacionalidade || null,
        estado_civil: pre.estado_civil || dkInicial?.cliente_estado_civil || null,
        orgao_expedidor: pre.orgao_expedidor || dkInicial?.cliente_orgao_expedidor || null,
        genero: dkInicial?.cliente_genero || null,
        observacoes: observacoes?.trim() || null,
        drive_folder_url: driveFolderUrl,
        origem: "writer",
        cadastrado_por: (pre as any).dados_completos?.cadastrado_por || "Adria Mota",
        precisa_analise_extratos: true,
      } as any)
      .select()
      .single();
    if (errCli) {
      setStage("cliente", { status: "error", detail: errCli.message });
      return;
    }
    setStage("cliente", { status: "done" });

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

    // 5. organize-client-folder (await pra mostrar progresso)
    if (!pre.drive_folder_id) {
      setStage("organize", { status: "error", detail: "Pre-cliente sem drive_folder_id" });
      return;
    }
    setStage("organize", { status: "running", detail: "Classificando arquivos com IA…" });
    const { data: orgData, error: orgErr } = await supabase.functions.invoke("organize-client-folder", {
      body: { pre_cliente_id: pre.id },
    });
    if (orgErr || (orgData as any)?.error) {
      const msg = (orgData as any)?.error || orgErr?.message || "Falha desconhecida";
      setStage("organize", { status: "error", detail: msg });
      setOrganizeResult({ error: msg });
    } else {
      const res = orgData as OrganizeResult;
      setOrganizeResult(res);
      const renomeados = (res.renames || []).filter((r) => r.de !== r.para).length;
      setStage("organize", {
        status: "done",
        detail: `${renomeados} de ${res.total_arquivos ?? 0} arquivos renomeados`,
      });
    }
  };

  const fecharProgresso = () => {
    setConfirmandoPre(null);
    setStages(STAGES_INICIAIS);
    setOrganizeResult(null);
  };

  const preClientesFiltrados = (preClientes ?? []).filter(p => {
    if (!busca.trim()) return true;
    const q = busca.trim().toLowerCase();
    const haystack = [
      p.nome,
      p.cpf_cnpj,
      p.produto,
      p.telefone,
      p.email,
      ...(p.rubricas ?? []),
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q);
  });

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
          placeholder="Buscar por nome, CPF, produto ou réu…"
          className="pl-9 h-11 bg-card/40 border-border"
        />
      </div>

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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {preClientesFiltrados.map(pre => {
            const meta = STATUS_META[pre.status];
            const podeAgir = pre.status === "aguardando_assinatura";
            return (
              <SpotlightCard key={pre.id} className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-medium truncate">{pre.nome}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {pre.cpf_cnpj || "Sem CPF"} · {fmtDate(pre.created_at)}
                    </p>
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

                {podeAgir && (
                  <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
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
                  <div className="mt-4 pt-3 border-t border-border">
                    <a
                      href={`/clientes/${pre.cliente_id}`}
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <User className="h-3 w-3" />
                      Ver cliente cadastrado
                    </a>
                  </div>
                )}
              </SpotlightCard>
            );
          })}
        </div>
      )}

      <ProgressoModal
        open={confirmandoPre !== null && !modalMinimizado}
        pre={confirmandoPre}
        stages={stages}
        organizeResult={organizeResult}
        onClose={fecharProgresso}
        onMinimize={() => setModalMinimizado(true)}
      />
    </div>
  );
}
