import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { parseMoneyBR } from "@/lib/money";
import { LANDING_OPCOES, type AdvogadoKey, linkSocio, whatsappSocioUrl } from "@/lib/socioLanding";
import { EsteiraInicioDialog, TIPOS_PENDENCIA } from "@/components/EsteiraInicioDialog";
import { DriveFolderButton } from "@/components/DriveFolderButton";
import { AcaoCard } from "@/components/AcaoCard";
import {
  ArrowLeft, Pencil, User, FolderOpen, ExternalLink, FileSignature, Briefcase,
  ClipboardList, FileText, CheckCircle2, Circle, Clock, AlertCircle, AlertTriangle,
  Mail, Phone, MapPin, CreditCard, IdCard, ListTodo, GitBranch, Plus, Send, LayoutGrid,
  Lock, ScanSearch, PenSquare, Layers, X, Ban, Copy, Check, Download, Sparkles, Trophy, ArrowRight,
  Scale, Gavel, Building2, Hammer,
} from "lucide-react";

export interface Cliente {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  rg: string | null;
  profissao: string | null;
  genero: string | null;
  nacionalidade: string | null;
  estado_civil: string | null;
  orgao_expedidor: string | null;
  dados_socioeconomicos: Record<string, any> | null;
  observacoes: string | null;
  precisa_analise_extratos: boolean | null;
  analise_primaria_finalizada_at: string | null;
  drive_folder_url: string | null;
  origem: string | null;
  cadastrado_por: string | null;
  requerido: string | null;
  parceiro: string | null;
  created_at: string;
}

interface ProcessoLite {
  id: string;
  numero_processo: string;
  materia: string | null;
  fase_processual: string | null;
  valor_causa: number | null;
}

interface Contrato {
  id: string;
  modalidade: string;
  data_assinatura: string | null;
  valor_total: number | null;
  percentual_exito: number | null;
  reus: string[] | null;
  motivo: string | null;
  drive_url: string | null;
  status: string;
  observacoes: string | null;
  created_at: string;
}

export interface Demanda {
  id: string;
  tipo: "pre_protocolo" | "processual";
  etapa: string;
  titulo: string;
  descricao: string | null;
  desconto: string | null;
  status: "pendente" | "em_andamento" | "concluida" | "bloqueada" | "cancelada" | "resolvida";
  pendencia_tipo: string | null;
  analise_pai_id: string | null;
  peca_drive_url: string | null;
  protocolo_drive_url: string | null;
  contrato_id: string | null;
  processo_id: string | null;
  ordem: number;
  created_at: string;
  created_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  numero_processo: string | null;
  protocolado_at: string | null;
  protocolado_tribunal: string | null;
  comarca: string | null;
  uf: string | null;
  valor_causa: number | null;
  local_tramite: string | null;
  procedimento: string | null;
}

const fmtGenero = (g: string | null): string | null => {
  if (!g) return null;
  const k = g.toLowerCase();
  if (k === "masculino" || k === "m") return "Masculino";
  if (k === "feminino" || k === "f") return "Feminino";
  return g;
};

const fmtBRL = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (iso: string | null) =>
  !iso ? "—" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));

const fmtDateTime = (iso: string | null) =>
  !iso ? "—" : new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));

const ORIGEM_META: Record<string, { label: string; color: string }> = {
  writer:  { label: "Originado no Writer", color: "text-primary border-primary/30 bg-primary/10" },
  manual:  { label: "Cadastro Manual",     color: "text-muted-foreground border-border bg-muted/20" },
};

const ETAPA_META: Record<string, { label: string; ordem: number; Icon: any }> = {
  analise_documental:    { label: "Análise Documental",          ordem: 1, Icon: ClipboardList },
  analise_vinculada:     { label: "Análise Vinculada Bradesco",  ordem: 2, Icon: GitBranch },
  fluxo_artesanal:       { label: "Fluxo Artesanal",             ordem: 2, Icon: Hammer },
  confeccao_peca:        { label: "Confecção da Peça",           ordem: 3, Icon: FileText },
  pronta_para_protocolo: { label: "Pronta pra Protocolo",        ordem: 4, Icon: Send },
  protocolada:           { label: "Protocolada",                 ordem: 5, Icon: CheckCircle2 },
  processual:            { label: "Em andamento",                ordem: 6, Icon: Briefcase },
};

const STATUS_META: Record<string, { label: string; color: string; Icon: any }> = {
  pendente:     { label: "Pendente",     color: "text-amber-400 bg-amber-400/10 border-amber-400/30",     Icon: Clock },
  em_andamento: { label: "Em andamento", color: "text-blue-400 bg-blue-400/10 border-blue-400/30",         Icon: Circle },
  concluida:    { label: "Concluída",    color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30", Icon: CheckCircle2 },
  bloqueada:    { label: "Bloqueada",    color: "text-red-400 bg-red-400/10 border-red-400/30",            Icon: AlertCircle },
  cancelada:    { label: "Cancelada",    color: "text-muted-foreground bg-muted/20 border-border",          Icon: Circle },
};

type AbaKey = "resumo" | "demandas" | "processos";

// Landings externas de coleta socioeconomica (uma por advogado). Config
// agora vive em src/lib/socioLanding.ts (fonte única, reusada no dashboard
// de completude da aba Clientes). O id do cliente vai no ?c=, e a edge
// function landing-socioeconomico salva as respostas de volta.
function LinkFormularioSocioBtn({ clienteId, telefone }: { clienteId: string; telefone: string | null }) {
  const [open, setOpen] = useState(false);
  const [advogado, setAdvogado] = useState<AdvogadoKey | null>(null);
  const [copiado, setCopiado] = useState(false);
  const link = advogado ? linkSocio(advogado, clienteId) : "";

  const reset = () => { setAdvogado(null); setCopiado(false); };
  const handleClose = (v: boolean) => { setOpen(v); if (!v) setTimeout(reset, 200); };

  // Marca quando o link foi gerado/enviado pra cliente. Usado pra
  // diferenciar "aguardando geracao" vs "aguardando resposta" na lista.
  const carimbarEnvio = async () => {
    if (!clienteId) return;
    await supabase
      .from("clientes")
      .update({ socio_link_enviado_at: new Date().toISOString() } as any)
      .eq("id", clienteId);
  };

  const copiar = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      toast.success("Link copiado.");
      setTimeout(() => setCopiado(false), 1800);
      carimbarEnvio();
    } catch {
      window.prompt("Copie o link do formulário:", link);
    }
  };

  const abrir = () => { if (link) window.open(link, "_blank", "noopener,noreferrer"); };

  const enviarWhatsApp = () => {
    if (!link) return;
    window.open(whatsappSocioUrl(telefone, link), "_blank", "noopener,noreferrer");
    carimbarEnvio();
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 text-xs shrink-0"
        onClick={() => setOpen(true)}
        disabled={!clienteId}
      >
        <Send className="h-3.5 w-3.5" />
        Gerar link do formulário
      </Button>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Formulário socioeconômico</DialogTitle>
            <DialogDescription>
              {advogado
                ? "Envie este link ao cliente. As respostas aparecem aqui na ficha automaticamente."
                : "Para qual advogado esse formulário vai ser preenchido?"}
            </DialogDescription>
          </DialogHeader>

          {!advogado && (
            <div className="grid grid-cols-1 gap-2 pt-1">
              {(Object.keys(LANDING_OPCOES) as AdvogadoKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setAdvogado(k)}
                  className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 hover:bg-primary/15 transition-colors text-left"
                >
                  <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{LANDING_OPCOES[k].label}</p>
                    <p className="text-[11px] text-muted-foreground break-all">{LANDING_OPCOES[k].base}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-primary opacity-70" />
                </button>
              ))}
            </div>
          )}

          {advogado && (
            <div className="space-y-3 pt-1">
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground inline-flex items-center gap-2 w-full">
                Landing:&nbsp;<strong className="text-foreground">{LANDING_OPCOES[advogado].label}</strong>
                <button onClick={() => setAdvogado(null)} className="ml-auto text-primary hover:underline">trocar</button>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Link único deste cliente</Label>
                <Input
                  value={link}
                  readOnly
                  onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Confira se a URL termina com <code className="bg-muted/30 px-1 rounded">?c=&lt;id&gt;</code> antes de enviar.
                </p>
              </div>
            </div>
          )}

          {advogado && (
            <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={abrir}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir
              </Button>
              <Button variant="outline" size="sm" onClick={enviarWhatsApp}>
                <Send className="h-3.5 w-3.5 mr-1.5" /> WhatsApp
              </Button>
              <Button size="sm" onClick={copiar}>
                {copiado ? <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                {copiado ? "Copiado" : "Copiar link"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function ClienteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [processos, setProcessos] = useState<ProcessoLite[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [demandas, setDemandas] = useState<Demanda[]>([]);

  const [aba, setAba] = useState<AbaKey>(() => {
    const p = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("aba") : null;
    return p === "demandas" || p === "processos" ? p : "resumo";
  });
  const [subDem, setSubDem] = useState<"pre" | "proc">("pre");

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Cliente | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [cliRes, procRes, contRes, demRes] = await Promise.all([
      supabase.from("clientes").select("*").eq("id", id).single(),
      supabase.from("processos").select("id, numero_processo, materia, fase_processual, valor_causa")
        .eq("cliente_id", id).order("data_ultimo_andamento", { ascending: false, nullsFirst: false }),
      supabase.from("contratos" as any).select("*").eq("cliente_id", id).order("created_at", { ascending: false }),
      supabase.from("demandas" as any).select("*").eq("cliente_id", id).order("ordem", { ascending: true }).order("created_at", { ascending: true }),
    ]);
    if (cliRes.data) setCliente(cliRes.data as Cliente);
    if (procRes.data) setProcessos(procRes.data);
    if (contRes.data) setContratos(contRes.data as unknown as Contrato[]);
    if (demRes.data) setDemandas(demRes.data as unknown as Demanda[]);
  }, [id]);

  useEffect(() => {
    document.title = "Cliente — AW ECO ME";
    load();
  }, [load]);

  // Revalida a ficha quando o advogado volta pra aba e a cada 20s, pra que
  // respostas enviadas pelo cliente no formulario externo aparecam sem
  // precisar recarregar. Nao recarrega enquanto estiver editando.
  const editingRef = useRef(editing);
  useEffect(() => { editingRef.current = editing; }, [editing]);
  useEffect(() => {
    const refetch = () => { if (!editingRef.current && document.visibilityState === "visible") load(); };
    window.addEventListener("focus", refetch);
    document.addEventListener("visibilitychange", refetch);
    const iv = setInterval(refetch, 20_000);
    return () => {
      window.removeEventListener("focus", refetch);
      document.removeEventListener("visibilitychange", refetch);
      clearInterval(iv);
    };
  }, [load]);

  // Helper pra editar um campo do jsonb dados_socioeconomicos no draft
  const setDS = (key: string, value: string) => {
    if (!draft) return;
    setDraft({ ...draft, dados_socioeconomicos: { ...(draft.dados_socioeconomicos || {}), [key]: value } });
  };

  // Parceiro eh dado sensivel (financeiro/comissao). Antes de salvar, se a
  // edicao alterou esse campo, mostra confirmacao explicita pra evitar
  // troca acidental. Os demais campos salvam direto.
  const [confirmarParceiro, setConfirmarParceiro] = useState(false);

  const persistirCliente = async () => {
    if (!draft) return;
    setSaving(true);
    // Limpa chaves vazias do jsonb pra nao gravar strings vazias
    const dsRaw = draft.dados_socioeconomicos || {};
    const ds: Record<string, any> = {};
    for (const k of Object.keys(dsRaw)) {
      const v = dsRaw[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") ds[k] = v;
    }
    const { error } = await supabase
      .from("clientes")
      .update({
        nome: draft.nome,
        cpf_cnpj: draft.cpf_cnpj,
        rg: draft.rg,
        orgao_expedidor: draft.orgao_expedidor,
        profissao: draft.profissao,
        genero: draft.genero,
        estado_civil: draft.estado_civil,
        nacionalidade: draft.nacionalidade,
        telefone: draft.telefone,
        email: draft.email,
        endereco: draft.endereco,
        observacoes: draft.observacoes,
        drive_folder_url: draft.drive_folder_url,
        cadastrado_por: draft.cadastrado_por,
        requerido: draft.requerido,
        parceiro: draft.parceiro,
        dados_socioeconomicos: Object.keys(ds).length ? ds : {},
      } as any)
      .eq("id", draft.id);
    setSaving(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    setCliente(draft);
    setEditing(false);
    setConfirmarParceiro(false);
    toast.success("Cliente atualizado");
  };

  const handleSave = async () => {
    if (!draft || !cliente) return;
    const parceiroMudou = (cliente.parceiro || "").trim() !== (draft.parceiro || "").trim();
    if (parceiroMudou) {
      setConfirmarParceiro(true);
      return;
    }
    await persistirCliente();
  };

  if (!cliente) return <div className="text-center text-muted-foreground py-8">Carregando…</div>;

  const origemMeta = ORIGEM_META[cliente.origem ?? "manual"] ?? ORIGEM_META.manual;
  const demandasPre  = demandas.filter(d => d.tipo === "pre_protocolo");
  const demandasProc = demandas.filter(d => d.tipo === "processual");
  // Conta como "demanda em aberto" apenas analise_vinculada que ainda nao
  // virou peca pronta (sem filho pronta_para_protocolo) e nao foi cancelada.
  // Reflete a fila real de trabalho do user.
  const demandasAbertas = demandas
    .filter(d => d.etapa === "analise_vinculada" && d.status !== "cancelada")
    .filter(av => !demandas.some(p =>
      p.etapa === "pronta_para_protocolo" && p.analise_pai_id === av.id
    )).length;

  const ABAS: Array<{ key: AbaKey; label: string; Icon: any; count: number; hint: string }> = [
    { key: "resumo",    label: "Resumo",    Icon: LayoutGrid, count: 0,                hint: "Dados pessoais e contratos" },
    { key: "demandas",  label: "Demandas",  Icon: ListTodo,   count: demandasAbertas,  hint: "Análises vinculadas aguardando peça" },
    { key: "processos", label: "Processos", Icon: Briefcase,  count: processos.length, hint: "Ações ajuizadas" },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      <Button variant="ghost" size="sm" onClick={() => navigate("/clientes")} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
      </Button>

      {/* HEADER ============================================================ */}
      <header className="flex items-start gap-5">
        <div className="h-20 w-20 shrink-0 rounded-full bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
          <User className="h-10 w-10 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-medium tracking-tight truncate">{cliente.nome}</h1>
            <button
              onClick={() => { setDraft(cliente); setEditing(true); }}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-primary/30 bg-primary/10 text-primary text-sm font-medium hover:bg-primary/15 hover:border-primary/50 transition-colors"
              title="Editar todos os dados do cliente"
            >
              <Pencil className="h-4 w-4" /> Editar
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${origemMeta.color}`}>
              {origemMeta.label}
            </span>
            <span className="text-xs text-muted-foreground">
              Cliente desde {fmtDate(cliente.created_at)}
            </span>
            {cliente.cadastrado_por && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <User className="h-3 w-3" /> cadastrado por <strong className="text-foreground/80 font-medium">{cliente.cadastrado_por}</strong>
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0">
          <DriveFolderButton
            clienteId={cliente.id}
            clienteNome={cliente.nome}
            driveFolderUrl={cliente.drive_folder_url}
            onCreated={(url) => setCliente({ ...cliente, drive_folder_url: url })}
            variant="inline"
          />
        </div>
      </header>

      {/* QUADRADOS DE NAVEGACAO ============================================ */}
      <div className="grid grid-cols-3 gap-3">
        {ABAS.map(a => {
          const ativa = aba === a.key;
          return (
            <button
              key={a.key}
              onClick={() => setAba(a.key)}
              className={`group rounded-2xl border-2 p-4 text-left cursor-pointer transition-all shadow-sm ${
                ativa
                  ? "border-primary bg-primary/10 ring-2 ring-primary/20 shadow-[0_0_24px_hsla(var(--primary)/0.18)] -translate-y-0.5"
                  : "border-border/80 bg-card/70 hover:border-primary/40 hover:bg-card hover:-translate-y-0.5 hover:shadow-md"
              }`}
            >
              <div className="flex items-center justify-between">
                <a.Icon className={`h-5 w-5 ${ativa ? "text-primary" : "text-muted-foreground"}`} />
                {a.count > 0 && (
                  a.key === "demandas" ? (
                    <span
                      className="text-xs font-bold tabular-nums px-2 h-5 rounded-full inline-flex items-center bg-red-500/90 text-white shadow-[0_0_12px_hsla(0,72%,51%,0.55)] ring-1 ring-red-400/60 animate-salt-bounce"
                      title="Demandas em aberto"
                    >
                      {a.count}
                    </span>
                  ) : (
                    <span className={`text-xs tabular-nums px-1.5 h-5 rounded-full inline-flex items-center ${
                      ativa ? "bg-primary/20 text-primary" : "bg-muted/30 text-muted-foreground"
                    }`}>
                      {a.count}
                    </span>
                  )
                )}
              </div>
              <p className={`mt-3 text-sm font-medium ${ativa ? "text-foreground" : "text-foreground/90"}`}>
                {a.label}
              </p>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">{a.hint}</p>
            </button>
          );
        })}
      </div>

      {/* CONTEUDO DA ABA =================================================== */}
      {aba === "resumo" && (
        <div className="space-y-5">
          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground px-1">Dados pessoais</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Slot icon={CreditCard} label="CPF / CNPJ" value={cliente.cpf_cnpj} />
              <Slot icon={IdCard}     label="RG"         value={cliente.rg} />
              <Slot icon={IdCard}     label="Órgão expedidor" value={cliente.orgao_expedidor} />
              <Slot icon={Briefcase}  label="Profissão"  value={cliente.profissao} />
              <Slot icon={User}       label="Gênero"     value={fmtGenero(cliente.genero)} />
              <Slot icon={User}       label="Estado civil" value={cliente.estado_civil} />
              <Slot icon={MapPin}     label="Nacionalidade" value={cliente.nacionalidade} />
              <Slot icon={Phone}      label="Telefone"   value={cliente.telefone} />
              <Slot icon={Mail}       label="E-mail"     value={cliente.email} />
              <Slot icon={MapPin}     label="Endereço"   value={cliente.endereco} className="sm:col-span-2 lg:col-span-3" />
              {cliente.observacoes && (
                <Slot icon={FileText} label="Observações" value={cliente.observacoes} className="sm:col-span-2 lg:col-span-3" />
              )}
            </div>
          </section>

          {(() => {
            const ds = cliente.dados_socioeconomicos || {};
            const val = (k: string): string | null => {
              const v = ds[k];
              return (v === undefined || v === null || String(v).trim() === "") ? null : String(v);
            };
            const fmtSelect = (v: any): string => {
              const map: Record<string, string> = {
                sim: "Sim", nao: "Não", nao_se_aplica: "Não se aplica",
                propria: "Própria", alugada: "Alugada", financiada: "Financiada", cedida: "Cedida", outros: "Outros",
                fundamental: "Fundamental", "médio": "Médio", superior: "Superior", "pós-graduação": "Pós-graduação",
              };
              return map[String(v)] || String(v);
            };
            const campos: Array<{ label: string; key: string; icon: any; wide?: boolean; fmt?: (v: any) => string }> = [
              { label: "Idade",              key: "idade",              icon: User },
              { label: "Escolaridade",       key: "escolaridade",       icon: FileText, fmt: fmtSelect },
              { label: "Nº de filhos",       key: "numero_filhos",      icon: User },
              { label: "Idades dos filhos",  key: "idades_filhos",      icon: User },
              { label: "Cônjuge trabalha",   key: "conjuge_trabalha",   icon: User, fmt: fmtSelect },
              { label: "Renda mensal",       key: "renda_mensal",       icon: CreditCard },
              { label: "Único provedor",     key: "unico_provedor",     icon: User, fmt: fmtSelect },
              { label: "Tipo de moradia",    key: "tipo_moradia",       icon: MapPin, fmt: fmtSelect },
              { label: "Outros dependentes", key: "outros_dependentes", icon: User, wide: true },
              { label: "Condição de saúde",  key: "condicao_saude",     icon: FileText, wide: true },
              { label: "Observações adicionais", key: "observacoes_livres", icon: FileText, wide: true },
            ];
            const algumPreenchido = campos.some(c => val(c.key) !== null);
            return (
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2 px-1">
                  <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-2">
                    Perfil socioeconômico
                    {!algumPreenchido && (
                      <span className="text-[10px] normal-case tracking-normal text-muted-foreground/50 italic">
                        — ainda não coletado (envie o formulário ao cliente)
                      </span>
                    )}
                  </h2>
                  <LinkFormularioSocioBtn clienteId={cliente.id} telefone={cliente.telefone} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {campos.map(c => {
                    const raw = val(c.key);
                    return (
                      <Slot
                        key={c.key}
                        icon={c.icon}
                        label={c.label}
                        value={raw !== null && c.fmt ? c.fmt(raw) : raw}
                        className={c.wide ? "sm:col-span-2 lg:col-span-3" : ""}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })()}

          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground px-1">Origem & captação</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Slot icon={User} label="Cadastrado por" value={cliente.cadastrado_por} />
              <Slot icon={Building2} label="Requerido (réu)" value={cliente.requerido} />
              <Slot icon={FileSignature} label="Origem do cadastro" value={cliente.origem === "writer" ? "Procuração (Writer)" : cliente.origem === "manual" ? "Cadastro manual" : cliente.origem} />
              <Slot icon={Clock} label="Cliente desde" value={fmtDate(cliente.created_at)} />
              <Slot icon={ScanSearch} label="Perfil de análise" value={cliente.precisa_analise_extratos ? "Sim — aguardando/em análise de extratos" : "Não"} />
              <Slot icon={FolderOpen} label="Pasta no Drive" value={cliente.drive_folder_url} isLink className="sm:col-span-2" />
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground px-1">
              Contratos ({contratos.length})
            </h2>
            {contratos.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 italic px-1 py-3">Nenhum contrato registrado.</p>
            ) : (
              <ul className="space-y-2">
                {contratos.map(ct => (
                  <li key={ct.id} className="rounded-xl border border-border bg-card/40 px-4 py-3 flex items-start gap-3 hover:border-primary/30 transition-colors">
                    <div className="h-9 w-9 shrink-0 rounded-lg bg-primary/15 ring-1 ring-primary/25 flex items-center justify-center mt-0.5">
                      <FileSignature className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">Contrato de {ct.modalidade}</span>
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wider">{ct.status}</Badge>
                        {ct.percentual_exito != null && (
                          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary">
                            {ct.percentual_exito}% êxito
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        {ct.reus && ct.reus.length > 0 && (
                          <span>Réu(s): <span className="text-foreground/90">{ct.reus.join(", ")}</span></span>
                        )}
                        {ct.valor_total != null && (
                          <span>Valor: <span className="text-primary tabular-nums">{fmtBRL(ct.valor_total)}</span></span>
                        )}
                        <span>Gerado em: {fmtDate(ct.created_at)}</span>
                      </div>
                    </div>
                    {ct.drive_url && (
                      <a href={ct.drive_url} target="_blank" rel="noreferrer"
                         className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                         title="Abrir pasta do contrato no Drive">
                        <FolderOpen className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {aba === "demandas" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 max-w-md">
            <SubTab active={subDem === "pre"}  onClick={() => setSubDem("pre")}  label="Pré-protocolo" count={demandasPre.length} />
            <SubTab active={subDem === "proc"} onClick={() => setSubDem("proc")} label="Processuais"    count={demandasProc.length} />
          </div>

          {subDem === "pre" ? (
            <PrePipeline demandas={demandasPre} cliente={cliente} userId={user?.id ?? null} onChange={load} />
          ) : demandasProc.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title="Nenhuma demanda processual"
              hint="Demandas processuais aparecem aqui quando uma peça é protocolada e o processo é criado."
            />
          ) : (
            <div className="space-y-3">
              {demandasProc.map(d => <DemandaCard key={d.id} demanda={d} />)}
            </div>
          )}
        </div>
      )}

      {aba === "processos" && (
        <Card className="bg-card/40 border-border">
          <CardHeader><CardTitle className="text-base">Processos ({processos.length})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Processo</TableHead>
                  <TableHead>Matéria</TableHead>
                  <TableHead>Fase</TableHead>
                  <TableHead className="text-right">Valor da Causa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processos.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link to={`/processos/${p.id}`} className="hover:underline">{p.numero_processo}</Link>
                    </TableCell>
                    <TableCell>{p.materia || "—"}</TableCell>
                    <TableCell>{p.fase_processual ? <Badge variant="secondary">{p.fase_processual}</Badge> : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtBRL(p.valor_causa)}</TableCell>
                  </TableRow>
                ))}
                {processos.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhum processo.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* DIÁLOGO DE EDIÇÃO ================================================= */}
      <Dialog open={editing} onOpenChange={(v) => { if (!v) setEditing(false); }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar dados do cliente</DialogTitle>
            <DialogDescription>Todos os campos do cliente. Os dados aqui alimentam o preenchimento automático do Writer e Finder.</DialogDescription>
          </DialogHeader>
          {draft && (() => {
            const ds = draft.dados_socioeconomicos || {};
            return (
            <div className="space-y-5 py-2">
              {/* Dados pessoais */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Dados pessoais</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2"><Label>Nome</Label><Input value={draft.nome} onChange={(e) => setDraft({ ...draft, nome: e.target.value })} /></div>
                  <div><Label>CPF/CNPJ</Label><Input value={draft.cpf_cnpj ?? ""} onChange={(e) => setDraft({ ...draft, cpf_cnpj: e.target.value })} /></div>
                  <div><Label>RG</Label><Input value={draft.rg ?? ""} onChange={(e) => setDraft({ ...draft, rg: e.target.value })} /></div>
                  <div><Label>Órgão expedidor</Label><Input value={draft.orgao_expedidor ?? ""} onChange={(e) => setDraft({ ...draft, orgao_expedidor: e.target.value })} placeholder="SSP/AM" /></div>
                  <div><Label>Profissão</Label><Input value={draft.profissao ?? ""} onChange={(e) => setDraft({ ...draft, profissao: e.target.value })} /></div>
                  <div>
                    <Label>Gênero</Label>
                    <select value={draft.genero ?? ""} onChange={(e) => setDraft({ ...draft, genero: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">Selecione…</option>
                      <option value="masculino">Masculino</option>
                      <option value="feminino">Feminino</option>
                    </select>
                  </div>
                  <div><Label>Estado civil</Label><Input value={draft.estado_civil ?? ""} onChange={(e) => setDraft({ ...draft, estado_civil: e.target.value })} placeholder="solteiro, casado…" /></div>
                  <div><Label>Nacionalidade</Label><Input value={draft.nacionalidade ?? ""} onChange={(e) => setDraft({ ...draft, nacionalidade: e.target.value })} placeholder="brasileiro" /></div>
                  <div><Label>Telefone</Label><Input value={draft.telefone ?? ""} onChange={(e) => setDraft({ ...draft, telefone: e.target.value })} /></div>
                  <div><Label>E-mail</Label><Input type="email" value={draft.email ?? ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
                  <div className="sm:col-span-2"><Label>Endereço</Label><Input value={draft.endereco ?? ""} onChange={(e) => setDraft({ ...draft, endereco: e.target.value })} /></div>
                  <div className="sm:col-span-2"><Label>Observações</Label><Textarea rows={2} value={draft.observacoes ?? ""} onChange={(e) => setDraft({ ...draft, observacoes: e.target.value })} /></div>
                </div>
              </div>

              {/* Perfil socioeconômico */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Perfil socioeconômico</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Idade</Label><Input value={ds.idade ?? ""} onChange={(e) => setDS("idade", e.target.value)} placeholder="ex: 45" /></div>
                  <div>
                    <Label>Escolaridade</Label>
                    <select value={ds.escolaridade ?? ""} onChange={(e) => setDS("escolaridade", e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">— selecione —</option>
                      <option value="fundamental">Fundamental</option>
                      <option value="médio">Médio</option>
                      <option value="superior">Superior</option>
                      <option value="pós-graduação">Pós-graduação</option>
                    </select>
                  </div>
                  <div><Label>Nº de filhos</Label><Input value={ds.numero_filhos ?? ""} onChange={(e) => setDS("numero_filhos", e.target.value)} placeholder="ex: 3" /></div>
                  <div><Label>Idades dos filhos</Label><Input value={ds.idades_filhos ?? ""} onChange={(e) => setDS("idades_filhos", e.target.value)} placeholder="ex: 5, 9 e 14 anos" /></div>
                  <div>
                    <Label>Cônjuge trabalha?</Label>
                    <select value={ds.conjuge_trabalha ?? ""} onChange={(e) => setDS("conjuge_trabalha", e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">— selecione —</option>
                      <option value="sim">Sim</option>
                      <option value="nao">Não (desempregado / do lar)</option>
                      <option value="nao_se_aplica">Não se aplica (sem cônjuge)</option>
                    </select>
                  </div>
                  <div><Label>Renda mensal (R$)</Label><Input value={ds.renda_mensal ?? ""} onChange={(e) => setDS("renda_mensal", e.target.value)} placeholder="ex: 1800" /></div>
                  <div>
                    <Label>Único provedor do lar?</Label>
                    <select value={ds.unico_provedor ?? ""} onChange={(e) => setDS("unico_provedor", e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">— selecione —</option>
                      <option value="sim">Sim</option>
                      <option value="nao">Não</option>
                    </select>
                  </div>
                  <div>
                    <Label>Tipo de moradia</Label>
                    <select value={ds.tipo_moradia ?? ""} onChange={(e) => setDS("tipo_moradia", e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="">— selecione —</option>
                      <option value="propria">Própria</option>
                      <option value="alugada">Alugada</option>
                      <option value="financiada">Financiada</option>
                      <option value="cedida">Cedida</option>
                      <option value="outros">Outros</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2"><Label>Outros dependentes</Label><Input value={ds.outros_dependentes ?? ""} onChange={(e) => setDS("outros_dependentes", e.target.value)} placeholder="ex: mãe idosa, irmão com deficiência" /></div>
                  <div className="sm:col-span-2"><Label>Condição de saúde relevante</Label><Input value={ds.condicao_saude ?? ""} onChange={(e) => setDS("condicao_saude", e.target.value)} placeholder="ex: hipertensão, uso contínuo de medicação" /></div>
                  <div className="sm:col-span-2"><Label>Observações adicionais</Label><Textarea rows={2} value={ds.observacoes_livres ?? ""} onChange={(e) => setDS("observacoes_livres", e.target.value)} placeholder="Contexto livre que ajude a IA a personalizar a peça" /></div>
                </div>
              </div>

              {/* Origem & captação */}
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Origem & captação</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Cadastrado por</Label><Input value={draft.cadastrado_por ?? ""} onChange={(e) => setDraft({ ...draft, cadastrado_por: e.target.value })} /></div>
                  <div><Label>Requerido (réu)</Label><Input value={draft.requerido ?? ""} onChange={(e) => setDraft({ ...draft, requerido: e.target.value })} placeholder="Ex.: Banco Bradesco" /></div>
                  <div>
                    <Label className="flex items-center gap-1.5">
                      Parceiro
                      <span className="text-[10px] text-muted-foreground font-normal">(collab que trouxe)</span>
                    </Label>
                    <Input value={draft.parceiro ?? ""} onChange={(e) => setDraft({ ...draft, parceiro: e.target.value })} placeholder="ex: João Silva" />
                  </div>
                  <div className="sm:col-span-2"><Label>Pasta no Google Drive</Label><Input value={draft.drive_folder_url ?? ""} onChange={(e) => setDraft({ ...draft, drive_folder_url: e.target.value })} placeholder="https://drive.google.com/drive/folders/..." /></div>
                </div>
              </div>
            </div>
            );
          })()}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Salvar alterações"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmacao especifica de troca de parceiro — campo sensivel
          (financeiro/comissao). Aparece soh quando o draft alterou o valor
          em relacao ao cliente atual. */}
      <AlertDialog open={confirmarParceiro} onOpenChange={(o) => !o && setConfirmarParceiro(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar o parceiro deste cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block">
                De: <strong className="text-foreground">{cliente?.parceiro || "(nenhum)"}</strong>
              </span>
              <span className="block mt-1">
                Para: <strong className="text-foreground">{draft?.parceiro?.trim() || "(nenhum)"}</strong>
              </span>
              <span className="block mt-3 text-amber-400">
                Parceiro é dado financeiro (comissão/colaboração). Mudar afeta relatórios e divisão futura. Confirme se foi proposital.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); persistirCliente(); }} disabled={saving}>
              {saving ? "Salvando…" : "Sim, trocar parceiro"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =========================================================================
// COMPONENTES AUXILIARES
// =========================================================================

function SubTab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border-2 px-4 py-2.5 text-sm cursor-pointer transition-all flex items-center justify-between gap-2 ${
        active
          ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
          : "border-border/80 bg-card/70 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-card"
      }`}
    >
      <span>{label}</span>
      {count > 0 && (
        <span className={`text-[10px] tabular-nums px-1.5 h-5 rounded-full inline-flex items-center ${
          active ? "bg-primary/20" : "bg-muted/30"
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

function Slot({
  icon: Icon, label, value, isLink, className,
}: { icon: any; label: string; value: string | null; isLink?: boolean; className?: string }) {
  const empty = !value;
  return (
    <div className={`rounded-lg bg-muted/15 px-4 py-3 cursor-default ${className || ""}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/80 mb-1">
        <Icon className="h-3 w-3" /> {label}
      </div>
      {empty ? (
        <p className="text-sm text-muted-foreground/40 italic">não informado</p>
      ) : isLink ? (
        <a href={value!} target="_blank" rel="noreferrer"
           className="text-sm text-primary hover:underline break-all inline-flex items-center gap-1 cursor-pointer">
          {value} <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />
        </a>
      ) : (
        <p className="text-sm text-foreground break-words whitespace-pre-wrap">{value}</p>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, title, hint }: { icon: any; title: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/20 py-14 px-6 text-center">
      <Icon className="h-10 w-10 mx-auto text-muted-foreground/40" />
      <p className="mt-4 text-sm text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground/70 mt-1 max-w-md mx-auto">{hint}</p>
    </div>
  );
}

function DemandaCard({ demanda, action, onCancelarVinculo, autor }: { demanda: Demanda; action?: React.ReactNode; onCancelarVinculo?: () => void; autor?: string | null }) {
  const etapa = ETAPA_META[demanda.etapa] ?? ETAPA_META.analise_documental;
  const status = STATUS_META[demanda.status] ?? STATUS_META.pendente;
  const cancelada = demanda.status === "cancelada";
  const isArtesanal = demanda.etapa === "fluxo_artesanal";
  // Pra analise_vinculada / artesanal cancelada, badge customizado pra
  // deixar claro o tipo do cancelamento.
  const isVincCancelado = cancelada && demanda.etapa === "analise_vinculada";
  const isArtCancelado  = cancelada && isArtesanal;
  const tipoCancelLabel = isArtesanal ? "peça artesanal" : "vínculo";
  const tipoCancelBtn   = isArtesanal ? "Cancelar peça" : "Cancelar vínculo";

  return (
    <div className={`rounded-xl border p-4 transition-colors ${
      cancelada
        ? "border-border/40 bg-muted/5 opacity-60 grayscale"
        : "border-border bg-card/40 hover:border-primary/30"
    }`}>
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 shrink-0 rounded-lg bg-muted/30 flex items-center justify-center">
          <etapa.Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className={`text-sm font-medium truncate ${cancelada ? "line-through text-muted-foreground" : ""}`}>{demanda.titulo}</h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">{etapa.label}{demanda.desconto && ` · ${demanda.desconto}`}</p>
              {autor && (
                <p className="text-[10px] text-muted-foreground/70 mt-1 inline-flex items-center gap-1">
                  <User className="h-2.5 w-2.5" /> {demanda.completed_by ? "concluído por" : "criado por"} <strong className="text-foreground/80 font-medium">{autor}</strong>
                </p>
              )}
            </div>
            <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              isVincCancelado || isArtCancelado
                ? "text-red-400 bg-red-400/10 border-red-400/30"
                : status.color
            }`}>
              {isVincCancelado || isArtCancelado ? <Ban className="h-2.5 w-2.5" /> : <status.Icon className="h-2.5 w-2.5" />}
              {isVincCancelado ? "Vínculo cancelado" : isArtCancelado ? "Peça cancelada" : status.label}
            </span>
          </div>
          {demanda.descricao && (
            <p className="text-xs text-muted-foreground mt-2">{demanda.descricao}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-[11px]">
            {!cancelada && demanda.peca_drive_url && (
              <a href={demanda.peca_drive_url} target="_blank" rel="noreferrer"
                 className="text-primary hover:underline inline-flex items-center gap-1">
                <FileText className="h-3 w-3" /> Planilha
              </a>
            )}
            {!cancelada && demanda.protocolo_drive_url && (
              <a href={demanda.protocolo_drive_url} target="_blank" rel="noreferrer"
                 className="text-primary hover:underline inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Protocolo
              </a>
            )}
            {!cancelada && action && <div className="ml-auto">{action}</div>}
            {!cancelada && onCancelarVinculo && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 hover:text-red-400 transition-colors px-2 py-1 rounded hover:bg-red-400/5"
                    title={`Cancelar esta ${tipoCancelLabel}`}
                  >
                    <X className="h-3 w-3" /> {tipoCancelBtn}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancelar esta {tipoCancelLabel}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      <strong>{demanda.desconto || demanda.titulo}</strong> ficará marcada como cancelada e dimmed na lista, mas o registro permanece pra histórico. Se o cliente ficar sem nenhuma análise vinculada nem peça artesanal ativa, ele volta automaticamente pra "Análise primária" na esteira.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Voltar</AlertDialogCancel>
                    <AlertDialogAction onClick={onCancelarVinculo} className="bg-red-600 hover:bg-red-500">
                      {tipoCancelBtn}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AnaliseDocumentalCard({ demanda, filhas, autor }: { demanda: Demanda; filhas: Demanda[]; autor?: string | null }) {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 shrink-0 rounded-lg bg-muted/30 flex items-center justify-center">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h4 className="text-sm font-medium">Análise Documental</h4>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {fmtDateTime(demanda.created_at)}
            </span>
            {autor && (
              <span className="text-[10px] text-muted-foreground/70 inline-flex items-center gap-1">
                <User className="h-2.5 w-2.5" /> por <strong className="text-foreground/80 font-medium">{autor}</strong>
              </span>
            )}
          </div>
          {filhas.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/60 italic mt-2">
              Nenhuma análise vinculada gerada nessa sessão ainda.
            </p>
          ) : (
            <div className="mt-2.5 space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                {filhas.filter(f => f.status !== "cancelada").length} de {filhas.length} análise{filhas.length === 1 ? "" : "s"} vinculada{filhas.length === 1 ? "" : "s"} ativa{filhas.filter(f => f.status !== "cancelada").length === 1 ? "" : "s"}
              </p>
              <ul className="space-y-0.5">
                {filhas.map(f => {
                  const cancelada = f.status === "cancelada";
                  return (
                    <li key={f.id} className={`text-[12px] flex items-center gap-1.5 ${cancelada ? "text-muted-foreground/50 line-through" : "text-foreground/90"}`}>
                      {cancelada ? (
                        <Ban className="h-3 w-3 text-red-400/60 shrink-0" />
                      ) : (
                        <GitBranch className="h-3 w-3 text-primary/70 shrink-0" />
                      )}
                      <span className="truncate">{f.desconto || f.titulo}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EspelhoCard({ demanda, onClick, autor }: { demanda: Demanda; onClick: () => void; autor?: string | null }) {
  const protocolado = !!demanda.protocolado_at;
  return (
    <button
      onClick={onClick}
      className={`text-left w-full rounded-xl border p-4 transition-all ${
        protocolado
          ? "border-emerald-400/30 bg-emerald-400/5 hover:border-emerald-400/60"
          : "border-border bg-card/40 hover:border-primary/40 hover:bg-card/60"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${
          protocolado ? "bg-emerald-400/15 ring-1 ring-emerald-400/30" : "bg-muted/30"
        }`}>
          <Send className={`h-4 w-4 ${protocolado ? "text-emerald-400" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-sm font-medium truncate">{demanda.titulo}</h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {demanda.desconto || "—"} · gerada em {fmtDate(demanda.completed_at || demanda.created_at)}
              </p>
              {autor && (
                <p className="text-[10px] text-muted-foreground/70 mt-1 inline-flex items-center gap-1">
                  <User className="h-2.5 w-2.5" /> por <strong className="text-foreground/80 font-medium">{autor}</strong>
                </p>
              )}
            </div>
            {protocolado ? (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border text-emerald-400 bg-emerald-400/10 border-emerald-400/30 shrink-0">
                <CheckCircle2 className="h-2.5 w-2.5" /> Protocolado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border text-amber-400 bg-amber-400/10 border-amber-400/30 shrink-0">
                <Clock className="h-2.5 w-2.5" /> Protocolo pendente
              </span>
            )}
          </div>
          {protocolado ? (
            <p className="text-[11px] text-emerald-400 mt-2 inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3" />
              <span>nº {demanda.numero_processo || "—"} · {fmtDateTime(demanda.protocolado_at)}</span>
            </p>
          ) : (
            <p className="text-[11px] text-primary mt-2 inline-flex items-center gap-1">
              Abrir espelho <ArrowRight className="h-3 w-3" />
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── ESPELHO DE PROTOCOLO — modal multi-etapa ────────────────────────────
type EspelhoStage = "actions" | "tribunal" | "projudi" | "finalizar" | "success";

export function EspelhoProtocoloDialog({
  demanda, cliente, onClose, onProtocolado, onVerPerfil,
}: {
  demanda: Demanda | null;
  cliente: Cliente | null;
  onClose: () => void;
  onProtocolado: (numero: string, valor: number) => void;
  // Quando fornecido, exibe um botao "Ver perfil do cliente" no estagio
  // inicial do dialog. Util quando o dialog e aberto fora da ficha do
  // cliente (ex: clicando direto em "Pecas Prontas" na esteira geral).
  onVerPerfil?: () => void;
}) {
  const [stage, setStage] = useState<EspelhoStage>("actions");
  const [copiados, setCopiados] = useState<Set<string>>(new Set());
  const [numeroProcesso, setNumeroProcesso] = useState("");
  const [finalizando, setFinalizando] = useState(false);
  // Campos pedidos no momento do protocolo quando faltam no banco. Sao
  // gravados na demanda ao finalizar pra nao perguntar de novo.
  const [valorCausaIn, setValorCausaIn] = useState("");
  const [comarcaIn, setComarcaIn] = useState("");
  const [localTramiteIn, setLocalTramiteIn] = useState("");
  const [procedimentoIn, setProcedimentoIn] = useState("");
  // Competencia editavel no proprio espelho (com persistencia). Inicia com
  // o que o Writer gravou OU fallback automatico. Toggle abaixo permite o
  // advogado trocar JEC <-> Vara Civel na hora, registrando como forcada.
  const [competenciaState, setCompetenciaState] = useState<string>("");
  const [competenciaForcadaState, setCompetenciaForcadaState] = useState(false);
  const [trocandoCompetencia, setTrocandoCompetencia] = useState(false);
  // Total global ajuizado capturado ANTES do protocolo, pra animar
  // [totalAnterior] -> [totalAnterior + valor] na tela de sucesso.
  const [totalAnterior, setTotalAnterior] = useState<number>(0);
  // Valor efetivamente protocolado (digitado no dialogo). Usado na tela
  // de sucesso, ja que demanda.valor_causa so atualiza apos refetch.
  const [valorProtocolado, setValorProtocolado] = useState<number>(0);

  useEffect(() => {
    if (demanda) {
      setStage("actions");
      setCopiados(new Set());
      setNumeroProcesso("");
      setFinalizando(false);
      setValorCausaIn(demanda.valor_causa ? String(demanda.valor_causa) : "");
      setComarcaIn(demanda.comarca || "");
      setLocalTramiteIn(demanda.local_tramite || "");
      setProcedimentoIn(demanda.procedimento || "");
      // Inicializa competencia: prioriza valor gravado pelo Writer, senao
      // fallback baseado em valor (limite atualizado 64.840).
      const v = Number(demanda.valor_causa || 0);
      const auto = v > 0 && v < 64840 ? "Juizado Especial Cível" : "Vara Cível Comum";
      setCompetenciaState((demanda as any).competencia || auto);
      setCompetenciaForcadaState(!!(demanda as any).competencia_forcada);
    }
  }, [demanda?.id, demanda?.valor_causa, demanda?.comarca, demanda?.local_tramite, demanda?.procedimento]);

  if (!demanda || !cliente) return null;

  const valor = Number(demanda.valor_causa || 0);
  const LIMITE_JEC = 64840;
  const competencia = competenciaState || (valor > 0 && valor < LIMITE_JEC ? "Juizado Especial Cível" : "Vara Cível Comum");

  // Troca JEC <-> Vara Civel Comum no proprio espelho. Persiste imediatamente
  // pra refletir em re-aberturas e auditoria. Marca como forcada se o novo
  // valor diverge do que o calculo automatico apontaria.
  const trocarCompetencia = async () => {
    if (trocandoCompetencia) return;
    const nova = competencia === "Juizado Especial Cível" ? "Vara Cível Comum" : "Juizado Especial Cível";
    const automaticoSeria = valor > 0 && valor < LIMITE_JEC ? "Juizado Especial Cível" : "Vara Cível Comum";
    const forcadaNova = nova !== automaticoSeria;
    setTrocandoCompetencia(true);
    const { error } = await supabase.from("demandas" as any)
      .update({ competencia: nova, competencia_forcada: forcadaNova })
      .eq("id", demanda.id);
    setTrocandoCompetencia(false);
    if (error) { toast.error("Erro ao trocar competência: " + error.message); return; }
    setCompetenciaState(nova);
    setCompetenciaForcadaState(forcadaNova);
    toast.success(`Competência alterada pra ${nova}${forcadaNova ? " (forçado)" : ""}`);
  };

  const copy = async (id: string, txt: string) => {
    try {
      await navigator.clipboard.writeText(String(txt || ""));
      setCopiados((prev) => new Set(prev).add(id));
      toast.success("Copiado", { duration: 1200 });
    } catch {
      toast.error("Falha ao copiar");
    }
  };

  // Campos do espelho na ordem exata do Projudi
  const campos: Array<{ id: string; label: string; valor: string }> = [
    { id: "comarca", label: "Comarca", valor: demanda.comarca || cliente.endereco || "" },
    { id: "competencia", label: "Competência", valor: competencia },
    { id: "cpf1", label: "CPF / CNPJ", valor: cliente.cpf_cnpj || "" },
    { id: "endereco", label: "Endereço", valor: cliente.endereco || "" },
    { id: "bairro", label: "Bairro", valor: "" },
    { id: "uf", label: "UF", valor: demanda.uf || "" },
    { id: "cidade", label: "Cidade", valor: demanda.comarca || "" },
    { id: "cep", label: "CEP", valor: "" },
    { id: "cpf2", label: "CPF", valor: cliente.cpf_cnpj || "" },
    { id: "valor", label: "Valor da causa", valor: valor > 0 ? fmtBRL(valor) : "—" },
  ];

  // Parseia "1.500,00" / "1500" / "1500.00" pra numero. Usa o util robusto
  // (lib/money) que detecta o separador decimal — evita o bug histórico de
  // remover o ponto do valor pré-preenchido e inflar ×100.
  const parseMoney = (s: string): number => parseMoneyBR(s);

  const finalizar = async () => {
    if (!numeroProcesso.trim()) {
      toast.error("Informe o número do processo gerado pelo tribunal");
      return;
    }
    const valorFinal = parseMoney(valorCausaIn);
    if (valorFinal <= 0) {
      toast.error("Informe o valor da causa");
      return;
    }
    if (!comarcaIn.trim()) {
      toast.error("Informe a comarca");
      return;
    }
    if (!localTramiteIn.trim()) {
      toast.error("Informe o local de trâmite");
      return;
    }
    if (!procedimentoIn) {
      toast.error("Selecione o procedimento");
      return;
    }
    setFinalizando(true);
    // 1. Captura total global atual ANTES do INSERT (pra animacao)
    const { data: totaisAntes } = await supabase
      .from("processos")
      .select("valor_causa")
      .not("valor_causa", "is", null);
    const oldTotal = (totaisAntes || []).reduce(
      (s, r: any) => s + (Number(r.valor_causa) || 0), 0,
    );
    setTotalAnterior(oldTotal);

    // 2. Atualiza demanda — inclui campos que faltavam (gravados agora pra
    //    nao precisar perguntar de novo).
    const { error: errDem } = await supabase.from("demandas" as any).update({
      numero_processo: numeroProcesso.trim(),
      protocolado_at: new Date().toISOString(),
      protocolado_tribunal: "projudi",
      status: "concluida",
      valor_causa: valorFinal,
      comarca: comarcaIn.trim(),
      local_tramite: localTramiteIn.trim(),
      procedimento: procedimentoIn,
    }).eq("id", demanda.id);
    if (errDem) {
      setFinalizando(false);
      toast.error("Erro ao registrar protocolo: " + errDem.message);
      return;
    }

    // 3. Cria entrada na tabela processos pra aparecer na aba Processos
    //    do cliente. Usa numero_processo unico — se ja existe, ignora.
    const comarcaUf = [comarcaIn.trim(), demanda.uf].filter(Boolean).join(" / ");
    const { error: errProc } = await supabase.from("processos").insert({
      cliente_id: cliente.id,
      numero_processo: numeroProcesso.trim(),
      materia: demanda.desconto || demanda.titulo || null,
      fase_processual: "Inicial",
      status_tarefa: "ativo",
      comarca_uf: comarcaUf || null,
      valor_causa: valorFinal,
    } as any);
    if (errProc && !/duplicate|unique/i.test(errProc.message)) {
      console.warn("[protocolo] aviso ao criar processo:", errProc);
      // Nao bloqueia — peca ja foi marcada protocolada
    }

    setFinalizando(false);
    setValorProtocolado(valorFinal);
    setStage("success");
    onProtocolado(numeroProcesso.trim(), valorFinal);
  };

  const fecharSeFinalizado = () => {
    onClose();
  };

  return (
    <Dialog open={!!demanda} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[88vh] overflow-y-auto overflow-x-hidden">
        <div key={stage} className="animate-in fade-in slide-in-from-right-4 duration-300">
        {stage === "actions" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                {cliente.nome}
              </DialogTitle>
              <DialogDescription>
                Peça pronta — {demanda.desconto || demanda.titulo} · finalizada em {fmtDateTime(demanda.completed_at)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 pt-2">
              {onVerPerfil && (
                <AcaoCard
                  icon={User}
                  titulo="Ver perfil do cliente"
                  hint={`Abre a ficha completa de ${cliente.nome}`}
                  onClick={onVerPerfil}
                />
              )}
              <AcaoCard
                icon={Download}
                titulo="Baixar peça (.docx)"
                hint={demanda.peca_drive_url ? "Abre no Drive" : "Sem URL — peça não foi gerada"}
                href={demanda.peca_drive_url || undefined}
                external
                acaoIcon={ExternalLink}
                disabled={!demanda.peca_drive_url}
              />
              {cliente.drive_folder_url && (
                <AcaoCard
                  icon={FolderOpen}
                  titulo="Abrir pasta no Drive"
                  hint="Documentos do cliente"
                  href={cliente.drive_folder_url}
                  external
                  acaoIcon={ExternalLink}
                />
              )}
              <AcaoCard
                icon={Scale}
                titulo="Espelho de Protocolo"
                hint="Copia-cola assistido pelo tribunal"
                variant="primary"
                onClick={() => setStage("tribunal")}
              />
            </div>
          </>
        )}

        {stage === "tribunal" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Gavel className="h-5 w-5 text-primary" /> Selecione o sistema do tribunal
              </DialogTitle>
              <DialogDescription>O espelho adapta a ordem dos campos pra cada sistema.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 pt-3">
              <button
                onClick={() => setStage("projudi")}
                className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-primary/40 bg-primary/5 hover:border-primary hover:bg-primary/10 transition-all"
              >
                <Building2 className="h-6 w-6 text-primary" />
                <span className="text-sm font-bold">Projudi</span>
                <span className="text-[10px] text-emerald-400">Disponível</span>
              </button>
              {["PJe", "eSAJ", "e-Proc"].map((t) => (
                <button
                  key={t}
                  disabled
                  className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border-2 border-border/30 bg-muted/10 opacity-50 cursor-not-allowed"
                >
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm font-medium">{t}</span>
                  <span className="text-[10px] text-muted-foreground">em breve</span>
                </button>
              ))}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStage("actions")}>Voltar</Button>
            </DialogFooter>
          </>
        )}

        {stage === "projudi" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" /> Espelho Projudi
              </DialogTitle>
              <DialogDescription>
                Clique no ícone pra copiar cada campo. A ordem segue o formulário do Projudi.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5 pt-2 max-h-[50vh] overflow-y-auto pr-1 -mr-1">
              {campos.map((c) => {
                const copiado = copiados.has(c.id);
                const vazio = !c.valor;
                const isCompetencia = c.id === "competencia";
                return (
                  <div
                    key={c.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                      copiado ? "border-emerald-400/30 bg-emerald-400/5 opacity-60" : "border-border bg-card/40"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        {c.label}
                        {isCompetencia && competenciaForcadaState && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-400 text-[9px] font-semibold uppercase tracking-wider normal-case">
                            <AlertTriangle className="h-2.5 w-2.5" /> Forçado pelo advogado
                          </span>
                        )}
                      </div>
                      <div className={`text-sm font-medium truncate ${vazio ? "text-muted-foreground italic" : ""}`}>
                        {c.valor || "(não informado)"}
                      </div>
                      {isCompetencia && (
                        <button
                          onClick={trocarCompetencia}
                          disabled={trocandoCompetencia}
                          className="text-[10px] text-primary hover:text-primary/80 mt-1 inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          {trocandoCompetencia ? "salvando…" : (
                            <>trocar pra <strong>{competencia === "Juizado Especial Cível" ? "Vara Cível Comum" : "Juizado Especial Cível"}</strong></>
                          )}
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() => copy(c.id, c.valor)}
                      disabled={vazio}
                      className={`h-8 w-8 shrink-0 rounded-md flex items-center justify-center transition-all ${
                        vazio ? "opacity-30 cursor-not-allowed" :
                        copiado ? "bg-emerald-400/20 text-emerald-400 hover:bg-emerald-400/30" :
                        "bg-primary/15 text-primary hover:bg-primary/25"
                      }`}
                      title={vazio ? "Sem valor pra copiar" : copiado ? "Copiar novamente" : "Copiar"}
                    >
                      {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                );
              })}
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" onClick={() => setStage("tribunal")}>Voltar</Button>
              <Button onClick={() => setStage("finalizar")} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Finalizar protocolo
              </Button>
            </DialogFooter>
          </>
        )}

        {stage === "finalizar" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-emerald-400" /> Quase lá!
              </DialogTitle>
              <DialogDescription>
                Cole o número do processo e confirme os dados antes de fechar a peça.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 pt-2 max-h-[55vh] overflow-y-auto pr-1 -mr-1">
              <div className="space-y-1.5">
                <Label className="text-xs">Número do processo</Label>
                <Input
                  value={numeroProcesso}
                  onChange={(e) => setNumeroProcesso(e.target.value)}
                  placeholder="0000000-00.0000.0.00.0000"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    Valor da causa (R$)
                    {!!demanda.valor_causa && <span className="text-[10px] text-emerald-400">· do cadastro</span>}
                  </Label>
                  <Input
                    value={valorCausaIn}
                    onChange={(e) => setValorCausaIn(e.target.value)}
                    inputMode="decimal"
                    placeholder="Ex.: 25000,00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    Comarca
                    {!!demanda.comarca && <span className="text-[10px] text-emerald-400">· do cadastro</span>}
                  </Label>
                  <Input
                    value={comarcaIn}
                    onChange={(e) => setComarcaIn(e.target.value)}
                    placeholder="Ex.: Manaus"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    Procedimento
                    {!!demanda.procedimento && <span className="text-[10px] text-emerald-400">· do cadastro</span>}
                  </Label>
                  <Select value={procedimentoIn} onValueChange={setProcedimentoIn}>
                    <SelectTrigger>
                      <SelectValue placeholder={
                        parseMoney(valorCausaIn) > 0 && parseMoney(valorCausaIn) <= 64840
                          ? "Sugestão: JEC"
                          : parseMoney(valorCausaIn) > 64840
                            ? "Sugestão: Comum"
                            : "Selecione…"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="JEC">JEC — Juizado Especial Cível</SelectItem>
                      <SelectItem value="Comum">Comum — Vara Cível Comum</SelectItem>
                      <SelectItem value="Fazenda Pública">Fazenda Pública</SelectItem>
                      <SelectItem value="JEFP">JEFP — Juizado Especial da Fazenda Pública</SelectItem>
                      <SelectItem value="JEF">JEF — Juizado Especial Federal</SelectItem>
                      <SelectItem value="Cível e Empresarial">Cível e Empresarial</SelectItem>
                      <SelectItem value="Família">Família</SelectItem>
                      <SelectItem value="Criminal">Criminal</SelectItem>
                      <SelectItem value="Trabalhista">Trabalhista</SelectItem>
                      <SelectItem value="Execução">Execução</SelectItem>
                      <SelectItem value="Outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs flex items-center gap-1">
                    Local de trâmite
                    {!!demanda.local_tramite && <span className="text-[10px] text-emerald-400">· do cadastro</span>}
                  </Label>
                  <Input
                    value={localTramiteIn}
                    onChange={(e) => setLocalTramiteIn(e.target.value)}
                    placeholder="Ex.: Vara Única de Beruri / 1ª Vara Cível de Manaus"
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" onClick={() => setStage("projudi")} disabled={finalizando}>Voltar</Button>
              <Button
                onClick={finalizar}
                disabled={finalizando || !numeroProcesso.trim() || parseMoney(valorCausaIn) <= 0 || !comarcaIn.trim() || !localTramiteIn.trim() || !procedimentoIn}
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {finalizando ? "Registrando…" : "Concluir protocolo"}
              </Button>
            </DialogFooter>
          </>
        )}

        {stage === "success" && (
          <EspelhoSucesso valor={valorProtocolado} numero={numeroProcesso} totalAnterior={totalAnterior} onClose={fecharSeFinalizado} />
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Tela de sucesso com animação dopaminérgica: troféu + sparkles + contador
// do TOTAL ajuizado global subindo (antigo -> antigo + valor desta peca).
function EspelhoSucesso({
  valor, numero, totalAnterior, onClose,
}: { valor: number; numero: string; totalAnterior: number; onClose: () => void }) {
  const novoTotal = totalAnterior + (valor || 0);
  // Contador animado: pula 800ms (espera troféu aparecer), depois conta de
  // totalAnterior ate novoTotal em ~1.6s com easing.
  const [count, setCount] = useState(totalAnterior);
  useEffect(() => {
    if (!valor || valor <= 0) { setCount(novoTotal); return; }
    const delay = 600;
    const duration = 1600;
    const start = performance.now() + delay;
    let raf = 0;
    const tick = (now: number) => {
      if (now < start) { raf = requestAnimationFrame(tick); return; }
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(totalAnterior + Math.round(valor * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [valor, totalAnterior, novoTotal]);

  return (
    <div className="py-6 flex flex-col items-center text-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-emerald-400/30 blur-2xl animate-pulse" />
        <div className="relative h-20 w-20 rounded-full bg-emerald-400/20 border-2 border-emerald-400 flex items-center justify-center animate-[wiggle_0.6s_ease-out]">
          <Trophy className="h-10 w-10 text-emerald-400" />
        </div>
        <Sparkles className="absolute -top-2 -right-2 h-5 w-5 text-amber-300 animate-pulse" />
        <Sparkles className="absolute -bottom-1 -left-3 h-4 w-4 text-amber-300 animate-pulse" style={{ animationDelay: "0.3s" }} />
      </div>
      <h2 className="text-xl font-bold mt-5">Protocolo concluído!</h2>
      <p className="text-xs text-muted-foreground mt-1">Processo nº {numero}</p>
      {valor > 0 && (
        <div className="mt-6 px-6 py-5 rounded-2xl border border-emerald-400/40 bg-gradient-to-br from-emerald-400/10 to-emerald-400/5 inline-flex flex-col items-center gap-2 min-w-[260px]">
          <span className="text-[10px] uppercase tracking-wider text-emerald-400/80 font-bold">Valor total ajuizado</span>
          <span className="text-3xl font-bold text-emerald-400 tabular-nums animate-in fade-in zoom-in-95 duration-500">{fmtBRL(count)}</span>
          <span className="text-[11px] text-emerald-400/70 font-medium animate-in fade-in slide-in-from-bottom-1 duration-700">
            +{fmtBRL(valor)} desta peça
          </span>
        </div>
      )}
      <Button onClick={onClose} className="mt-6 bg-emerald-600 hover:bg-emerald-500 text-white">Fechar</Button>
    </div>
  );
}

// Pega "primeiro sobrenome" do nome completo. Fallback pra parte antes do @ do email.
function nomeSobrenome(p: { nome?: string | null; email?: string | null } | null | undefined): string {
  if (!p) return "—";
  const full = (p.nome || "").trim();
  if (full) {
    const parts = full.split(/\s+/);
    return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1]}`;
  }
  if (p.email) return p.email.split("@")[0];
  return "—";
}

function PrePipeline({
  demandas, cliente, userId, onChange,
}: { demandas: Demanda[]; cliente: Cliente; userId: string | null; onChange: () => void }) {
  const clienteId = cliente.id;
  const navigate = useNavigate();
  const [dialogVincular, setDialogVincular] = useState(false);
  const [vincForm, setVincForm] = useState({ desconto: "", planilha_url: "" });
  const [savingVinc, setSavingVinc] = useState(false);
  const [espelhoDemanda, setEspelhoDemanda] = useState<Demanda | null>(null);
  const [inicioOpen, setInicioOpen] = useState(false);
  const [inicioTitulo, setInicioTitulo] = useState<string>("Iniciar pipeline");
  const [autorMap, setAutorMap] = useState<Map<string, string>>(new Map());

  // Busca os profiles dos criadores/concluidores das demandas pra mostrar
  // 'nome sobrenome' no card. Roda quando a lista de demandas muda.
  useEffect(() => {
    const ids = new Set<string>();
    for (const d of demandas) {
      if (d.created_by) ids.add(d.created_by);
      if (d.completed_by) ids.add(d.completed_by);
    }
    if (ids.size === 0) { setAutorMap(new Map()); return; }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, nome, email")
        .in("id", Array.from(ids));
      const m = new Map<string, string>();
      for (const p of (data || [])) m.set(p.id, nomeSobrenome(p as any));
      setAutorMap(m);
    })();
  }, [demandas]);

  const autorDe = (d: Demanda): string | null => {
    const id = d.completed_by || d.created_by;
    return id ? autorMap.get(id) || null : null;
  };

  const temArtesanal = demandas.some(d => d.etapa === "fluxo_artesanal" && d.status !== "cancelada");

  const grupos: Array<{ key: string; label: string; Icon: any; hint: string }> = [
    { key: "analise_documental",     label: "1. Análise Documental",                   Icon: ScanSearch, hint: "Vincule análises do Finder ao cliente." },
    { key: "analise_vinculada",      label: "2. Análise Vinculada Bradesco",           Icon: GitBranch,  hint: "Cada análise vinculada gera uma peça na etapa seguinte." },
    // Grupo so aparece quando o cliente tem peca artesanal (nao-Bradesco) —
    // alimentado pelo "Seguir fluxo artesanal" da esteira.
    ...(temArtesanal ? [{ key: "fluxo_artesanal", label: "2b. Fluxo Artesanal", Icon: Hammer, hint: "Peças não-Bradesco confeccionadas à mão. Cada item carrega a especificação digitada." }] : []),
    { key: "pronta_para_protocolo",  label: "3. Peças Prontas pra Protocolo",          Icon: Send,       hint: "Peças finalizadas no Writer, com link do Drive." },
  ];

  // Lógica de bloqueio sequencial:
  // - 1 sempre liberada
  // - 2 liberada quando existe alguma analise_vinculada
  // - 2b (artesanal) liberada quando existe peca artesanal nao cancelada
  // - 3 liberada quando alguma peça já saiu do writer pronta pro protocolo
  const temAnaliseVinculada = demandas.some(d => d.etapa === "analise_vinculada" && d.status !== "cancelada");
  const temPecaPronta       = demandas.some(d => d.etapa === "pronta_para_protocolo");

  const liberada = (key: string) => {
    switch (key) {
      case "analise_documental":    return true;
      case "analise_vinculada":     return temAnaliseVinculada;
      case "fluxo_artesanal":       return temArtesanal;
      case "pronta_para_protocolo": return temPecaPronta;
      default: return false;
    }
  };

  const hintBloqueio: Record<string, string> = {
    analise_vinculada:     "Bloqueado — vincule pelo menos uma análise no Finder pra liberar.",
    pronta_para_protocolo: "Bloqueado — gere ao menos uma peça no Writer pra liberar.",
  };

  // Garante a existencia da demanda confeccao_peca pra essa analise vinculada.
  // Idempotente: retorna o id existente se ja houver.
  const garantirConfeccaoDemanda = async (av: Demanda): Promise<string | null> => {
    const { data: existe } = await supabase
      .from("demandas" as any)
      .select("id")
      .eq("cliente_id", clienteId)
      .eq("etapa", "confeccao_peca")
      .eq("analise_pai_id", av.id)
      .maybeSingle();
    if (existe) return (existe as any).id;
    const { data: nova, error } = await supabase.from("demandas" as any).insert({
      cliente_id: clienteId,
      tipo: "pre_protocolo",
      etapa: "confeccao_peca",
      titulo: `Peça — ${av.desconto || "desconto"}`,
      descricao: "Confecção da peça a partir da análise vinculada.",
      desconto: av.desconto,
      status: "em_andamento",
      analise_pai_id: av.id,
      created_by: userId,
      ordem: 2,
    }).select("id").single();
    if (error) { toast.error("Erro ao criar demanda: " + error.message); return null; }
    return (nova as any).id;
  };

  const confeccionarPeca = async (av: Demanda) => {
    const demandaId = await garantirConfeccaoDemanda(av);
    if (!demandaId) return;
    onChange();
    // Abre o Writer com contexto mínimo — o Writer puxa o cliente completo
    // do Supabase (pacote 1 e pacote 2) usando o ID.
    const params = new URLSearchParams({
      cliente: clienteId,
      nome: cliente.nome,
      modo: "peticao",
      desconto: av.desconto || "",
      analise_id: av.id,
      analise_url: av.peca_drive_url || "",
      demanda_id: demandaId,
    });
    navigate(`/writer?${params.toString()}`);
  };

  // Analises vinculadas que ainda nao viraram peca pronta (descarta as que ja
  // tem uma confeccao_peca em pronta_para_protocolo). Tambem ignora as
  // canceladas (vinculo cancelado nao deve liberar etapa seguinte).
  const analisesPendentes = demandas
    .filter(d => d.etapa === "analise_vinculada" && d.status !== "cancelada")
    .filter(av => !demandas.some(p =>
      p.etapa === "pronta_para_protocolo" && p.analise_pai_id === av.id
    ));

  // Cancela uma demanda (analise vinculada OU peca artesanal). Fica
  // riscada na lista — nao some, pra preservar historico. Apos cancelar,
  // se o cliente acabar com ZERO analises vinculadas E ZERO pecas
  // artesanais ativas, reabre a "Analise primaria" (volta pra col 1 da
  // esteira), porque na pratica o pipeline foi zerado.
  const cancelarDemanda = async (d: Demanda) => {
    const { error } = await supabase
      .from("demandas" as any)
      .update({ status: "cancelada" })
      .eq("id", d.id);
    if (error) {
      toast.error("Erro ao cancelar: " + error.message);
      return;
    }

    // Checa se sobrou algo vivo (vinculada ou artesanal nao cancelada).
    const { data: vivas } = await supabase
      .from("demandas" as any)
      .select("id")
      .eq("cliente_id", clienteId)
      .in("etapa", ["analise_vinculada", "fluxo_artesanal"])
      .neq("status", "cancelada")
      .limit(1);

    const reabriu = (!vivas || vivas.length === 0) && cliente.precisa_analise_extratos;
    if (reabriu) {
      await supabase
        .from("clientes")
        .update({
          analise_primaria_finalizada_at: null,
          analise_primaria_finalizada_by: null,
        } as any)
        .eq("id", clienteId);
      toast.info("Sem peças ativas — cliente voltou pra 'Análise primária'.");
    } else {
      const labelTipo = d.etapa === "fluxo_artesanal" ? "Peça artesanal" : "Vínculo";
      toast.success(`${labelTipo} cancelado`);
    }
    onChange();
  };

  const produzirCadeia = async () => {
    if (analisesPendentes.length < 2) {
      toast.error("Cadeia precisa de pelo menos 2 análises pendentes.");
      return;
    }
    // Pre-cria/recupera demandas de confeccao pra cada item da fila
    const fila: Array<{
      demanda_id: string;
      analise_id: string;
      analise_url: string;
      desconto: string;
    }> = [];
    for (const av of analisesPendentes) {
      const did = await garantirConfeccaoDemanda(av);
      if (!did) return;
      fila.push({
        demanda_id: did,
        analise_id: av.id,
        analise_url: av.peca_drive_url || "",
        desconto: av.desconto || "",
      });
    }
    onChange();
    const fila_b64 = btoa(unescape(encodeURIComponent(JSON.stringify(fila))));
    const primeiro = fila[0];
    const params = new URLSearchParams({
      cliente: clienteId,
      nome: cliente.nome,
      modo: "peticao",
      desconto: primeiro.desconto,
      analise_id: primeiro.analise_id,
      analise_url: primeiro.analise_url,
      demanda_id: primeiro.demanda_id,
      cadeia: "1",
      cadeia_pos: "1",
      cadeia_fila: fila_b64,
    });
    navigate(`/writer?${params.toString()}`);
  };

  const criarAnaliseDocumentalEIrFinder = async () => {
    // Cada clique em "Nova analise vinculada" cria uma nova analise_documental.
    // Cada sessao de finder gera o seu proprio card com data + filhos (as
    // analises_vinculadas geradas naquela sessao).
    // O bundle do finder consulta a mais recente (order=created_at.desc.nullslast)
    // pra setar analise_pai_id correto nas vinculadas criadas a seguir.
    const { error } = await supabase.from("demandas" as any).insert({
      cliente_id: clienteId,
      tipo: "pre_protocolo",
      etapa: "analise_documental",
      titulo: "Análise documental",
      descricao: null,
      status: "em_andamento",
      created_by: userId,
      ordem: 0,
    });
    if (error) { toast.error("Erro ao abrir nova análise: " + error.message); return; }
    const params = new URLSearchParams({ cliente: clienteId, nome: cliente.nome });
    navigate(`/finder?${params.toString()}`);
  };

  const abrirInicio = (label: string) => {
    setInicioTitulo(label);
    setInicioOpen(true);
  };

  const inicioDialog = (
    <EsteiraInicioDialog
      open={inicioOpen}
      onClose={() => setInicioOpen(false)}
      cliente={{ id: clienteId, nome: cliente.nome, drive_folder_url: cliente.drive_folder_url }}
      userId={userId}
      onCreated={onChange}
      titulo={inicioTitulo}
      onConfirmar={criarAnaliseDocumentalEIrFinder}
    />
  );

  const pendenciasAbertas = demandas.filter(d => d.etapa === "pendencia_documental" && d.status === "pendente");

  // Banner: "Analise primaria pendente" — visivel quando o cliente esta
  // na coluna 1 da esteira (precisa_analise_extratos = true E nao foi
  // expressamente finalizada). Cliente pode ter pecas em producao em
  // paralelo, mas a triagem inicial ainda nao foi declarada completa.
  const analisePrimariaPendente = !!cliente.precisa_analise_extratos && !cliente.analise_primaria_finalizada_at;
  const analisePrimariaBanner = !analisePrimariaPendente ? null : (
    <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4 flex items-start gap-3">
      <div className="h-9 w-9 shrink-0 rounded-lg bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
        <ScanSearch className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold">Análise primária pendente</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Este cliente está na coluna 1 da esteira. Finalize a análise primária por lá quando tiver decidido o que fazer com ele.
        </p>
      </div>
      <Link
        to="/esteira"
        className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-1 shrink-0"
      >
        Ver na esteira <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );

  const resolverPendencia = async (id: string) => {
    const { error } = await supabase.from("demandas" as any)
      .update({ status: "resolvida", completed_at: new Date().toISOString(), completed_by: userId })
      .eq("id", id);
    if (error) { toast.error("Erro: " + error.message); return; }

    // Se essa era a última pendência aberta e o cliente não está em
    // produção ativa, devolve pra fila de "Análise primária" (col 1).
    let voltou = false;
    const { data: abertas } = await supabase
      .from("demandas" as any)
      .select("id")
      .eq("cliente_id", clienteId)
      .eq("etapa", "pendencia_documental")
      .eq("status", "pendente")
      .limit(1);
    if (!abertas || abertas.length === 0) {
      const { data: ativas } = await supabase
        .from("demandas" as any)
        .select("id")
        .eq("cliente_id", clienteId)
        .in("etapa", ["analise_vinculada", "fluxo_artesanal", "pronta_para_protocolo", "confeccao_peca", "protocolada", "processual"])
        .neq("status", "cancelada")
        .limit(1);
      if (!ativas || ativas.length === 0) {
        const foraDaFila = !cliente.precisa_analise_extratos || !!cliente.analise_primaria_finalizada_at;
        await supabase
          .from("clientes")
          .update({
            precisa_analise_extratos: true,
            analise_primaria_finalizada_at: null,
            analise_primaria_finalizada_by: null,
          } as any)
          .eq("id", clienteId);
        voltou = foraDaFila;
      }
    }

    toast.success(voltou
      ? "Pendências resolvidas — cliente voltou pra 'Análise primária'."
      : "Pendência marcada como resolvida");
    onChange();
  };

  const pendenciasBanner = pendenciasAbertas.length === 0 ? null : (
    <div className="rounded-2xl border border-amber-400/40 bg-amber-400/5 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
        <h3 className="text-sm font-semibold text-amber-200">
          {pendenciasAbertas.length === 1
            ? "1 pendência documental aberta"
            : `${pendenciasAbertas.length} pendências documentais abertas`}
        </h3>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Resolva as pendências antes de prosseguir — ou siga em frente assumindo o risco.
      </p>
      <ul className="divide-y divide-amber-400/15 border-t border-amber-400/15 pt-1">
        {pendenciasAbertas.map(p => {
          const tipoLabel = p.pendencia_tipo === "personalizada"
            ? p.descricao || "Personalizada"
            : TIPOS_PENDENCIA.find(t => t.key === p.pendencia_tipo)?.label || p.titulo;
          return (
            <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-amber-400 mt-0.5">•</span>
                <div className="min-w-0">
                  <p className="text-[13px] text-foreground truncate">{tipoLabel}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Aberta {fmtDate(p.created_at)}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => resolverPendencia(p.id)}
                className="h-7 text-[11px] border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Resolvida
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const salvarAnaliseVinculada = async () => {
    if (!vincForm.desconto.trim()) { toast.error("Informe o nome do desconto/banco"); return; }
    if (!vincForm.planilha_url.trim()) { toast.error("Cole a URL da planilha gerada"); return; }
    const pai = demandas.find(d => d.etapa === "analise_documental");
    setSavingVinc(true);
    const { error } = await supabase.from("demandas" as any).insert({
      cliente_id: clienteId,
      tipo: "pre_protocolo",
      etapa: "analise_vinculada",
      titulo: `Análise vinculada — ${vincForm.desconto.trim()}`,
      desconto: vincForm.desconto.trim(),
      peca_drive_url: vincForm.planilha_url.trim(),
      status: "pendente",
      analise_pai_id: pai?.id ?? null,
      created_by: userId,
      ordem: 1,
    });
    setSavingVinc(false);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success("Análise vinculada criada");
    setVincForm({ desconto: "", planilha_url: "" });
    setDialogVincular(false);
    onChange();
  };

  if (demandas.filter(d => d.etapa !== "pendencia_documental").length === 0) {
    return (
      <div className="space-y-3">
        {analisePrimariaBanner}
        {pendenciasBanner}
        <div className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-5 py-4 flex items-center gap-4">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Pipeline pré-protocolo ainda não iniciado</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Comece criando a análise documental — ela abre o Finder pra você processar os extratos do cliente.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => abrirInicio("Iniciar pipeline")}
            className="bg-emerald-600 hover:bg-emerald-500 text-white shrink-0"
          >
            <ScanSearch className="h-3.5 w-3.5 mr-1.5" />
            Iniciar pipeline
          </Button>
        </div>
        {inicioDialog}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {analisePrimariaBanner}
      {pendenciasBanner}
      {grupos.map((g, idx) => {
        const itens = demandas.filter(d => d.etapa === g.key);
        const ativa = liberada(g.key);

        return (
          <div
            key={g.key}
            className={`rounded-2xl border p-5 transition-opacity ${
              ativa
                ? "border-border bg-card/30"
                : "border-border/40 bg-muted/10 opacity-60"
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-start gap-3">
                <div className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${
                  ativa
                    ? "bg-primary/15 ring-1 ring-primary/25"
                    : "bg-muted/30 ring-1 ring-border/40"
                }`}>
                  {ativa ? (
                    <g.Icon className="h-4 w-4 text-primary" />
                  ) : (
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-medium">{g.label}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {ativa ? g.hint : (hintBloqueio[g.key] || g.hint)}
                  </p>
                </div>
              </div>

              {/* Ação principal da etapa quando ativa */}
              {ativa && g.key === "analise_documental" && (
                <Button
                  size="sm"
                  onClick={() => abrirInicio("Nova análise vinculada")}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Nova análise vinculada
                </Button>
              )}
              {ativa && g.key === "analise_vinculada" && analisesPendentes.length >= 2 && (
                <Button
                  size="sm"
                  onClick={produzirCadeia}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                  title="Gera todas as peças pendentes em sequência, sem voltar pro cliente entre uma e outra"
                >
                  <Layers className="h-3.5 w-3.5 mr-1.5" />
                  Produzir em cadeia ({analisesPendentes.length})
                </Button>
              )}
            </div>

            {/* Conteúdo */}
            {!ativa ? null : itens.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 italic px-1">
                {g.key === "analise_documental"
                  ? "Clique em 'Nova análise vinculada' pra começar a análise dos extratos no Finder."
                  : g.key === "analise_vinculada"
                  ? "Quando o Finder gerar planilhas, vincule cada uma aqui."
                  : "Quando você finalizar uma peça no Writer, ela aparece aqui."}
              </p>
            ) : g.key === "pronta_para_protocolo" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {itens.map(d => <EspelhoCard key={d.id} demanda={d} onClick={() => setEspelhoDemanda(d)} autor={autorDe(d)} />)}
              </div>
            ) : g.key === "analise_documental" ? (
              <div className="space-y-2">
                {itens
                  .slice()
                  .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
                  .map(d => {
                    const filhas = demandas.filter(
                      x => x.etapa === "analise_vinculada" && x.analise_pai_id === d.id
                    );
                    return <AnaliseDocumentalCard key={d.id} demanda={d} filhas={filhas} autor={autorDe(d)} />;
                  })}
              </div>
            ) : (
              <div className="space-y-2">
                {itens.map(d => {
                  const isAnaliseVinc = d.etapa === "analise_vinculada";
                  const isArtesanal = d.etapa === "fluxo_artesanal";
                  // analise_vinculada ja virou pronta (tem espelho gerado)?
                  const jaVirouPeca = isAnaliseVinc && demandas.some(p =>
                    p.etapa === "pronta_para_protocolo" && p.analise_pai_id === d.id
                  );
                  return (
                    <DemandaCard
                      key={d.id}
                      demanda={d}
                      autor={autorDe(d)}
                      onCancelarVinculo={isAnaliseVinc || isArtesanal ? () => cancelarDemanda(d) : undefined}
                      action={
                        isAnaliseVinc && !jaVirouPeca ? (
                          <Button
                            size="sm"
                            onClick={() => confeccionarPeca(d)}
                            className="h-7 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] px-3"
                          >
                            <PenSquare className="h-3 w-3 mr-1" /> Confeccionar peça
                          </Button>
                        ) : isAnaliseVinc && jaVirouPeca ? (
                          <span className="text-[10px] uppercase tracking-wider text-emerald-400 inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Peça gerada
                          </span>
                        ) : null
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <EspelhoProtocoloDialog
        demanda={espelhoDemanda}
        cliente={cliente}
        onClose={() => setEspelhoDemanda(null)}
        onProtocolado={() => onChange()}
      />

      {/* Diálogo: Vincular análise do Finder ao cliente */}
      <Dialog open={dialogVincular} onOpenChange={(v) => { if (!v) { setDialogVincular(false); setVincForm({ desconto: "", planilha_url: "" }); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular análise ao cliente</DialogTitle>
            <DialogDescription>
              Cole o nome do desconto/banco identificado e o link da planilha gerada pelo Finder.
              No futuro o Finder vinculará automaticamente — por agora é manual.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-xs">Desconto / Produto</Label>
              <Input
                value={vincForm.desconto}
                onChange={(e) => setVincForm({ ...vincForm, desconto: e.target.value })}
                placeholder="ex: Mix Bradesco, Tarifas, Juros..."
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">URL da planilha (XLSX no Drive)</Label>
              <Input
                value={vincForm.planilha_url}
                onChange={(e) => setVincForm({ ...vincForm, planilha_url: e.target.value })}
                placeholder="https://drive.google.com/file/d/..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogVincular(false)} disabled={savingVinc}>Cancelar</Button>
            <Button onClick={salvarAnaliseVinculada} disabled={savingVinc} className="bg-emerald-600 hover:bg-emerald-500 text-white">
              {savingVinc ? "Vinculando…" : "Vincular"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {inicioDialog}
    </div>
  );
}
