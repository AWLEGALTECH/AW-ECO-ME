import { useEffect, useState, useCallback } from "react";
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
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, Pencil, User, FolderOpen, ExternalLink, FileSignature, Briefcase,
  ClipboardList, FileText, CheckCircle2, Circle, Clock, AlertCircle,
  Mail, Phone, MapPin, CreditCard, IdCard, ListTodo, GitBranch, Plus, Send, LayoutGrid,
  Lock, ScanSearch, PenSquare, Layers,
} from "lucide-react";

interface Cliente {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  rg: string | null;
  profissao: string | null;
  observacoes: string | null;
  drive_folder_url: string | null;
  origem: string | null;
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

interface Demanda {
  id: string;
  tipo: "pre_protocolo" | "processual";
  etapa: string;
  titulo: string;
  descricao: string | null;
  desconto: string | null;
  status: "pendente" | "em_andamento" | "concluida" | "bloqueada" | "cancelada";
  analise_pai_id: string | null;
  peca_drive_url: string | null;
  protocolo_drive_url: string | null;
  contrato_id: string | null;
  processo_id: string | null;
  ordem: number;
  created_at: string;
  completed_at: string | null;
}

const fmtBRL = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (iso: string | null) =>
  !iso ? "—" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));

const ORIGEM_META: Record<string, { label: string; color: string }> = {
  writer:  { label: "Originado no Writer", color: "text-primary border-primary/30 bg-primary/10" },
  manual:  { label: "Cadastro Manual",     color: "text-muted-foreground border-border bg-muted/20" },
};

const ETAPA_META: Record<string, { label: string; ordem: number; Icon: any }> = {
  analise_documental:    { label: "Análise Documental",   ordem: 1, Icon: ClipboardList },
  analise_vinculada:     { label: "Análise Vinculada",    ordem: 2, Icon: GitBranch },
  confeccao_peca:        { label: "Confecção da Peça",    ordem: 3, Icon: FileText },
  pronta_para_protocolo: { label: "Pronta pra Protocolo", ordem: 4, Icon: Send },
  protocolada:           { label: "Protocolada",          ordem: 5, Icon: CheckCircle2 },
  processual:            { label: "Em andamento",         ordem: 6, Icon: Briefcase },
};

const STATUS_META: Record<string, { label: string; color: string; Icon: any }> = {
  pendente:     { label: "Pendente",     color: "text-amber-400 bg-amber-400/10 border-amber-400/30",     Icon: Clock },
  em_andamento: { label: "Em andamento", color: "text-blue-400 bg-blue-400/10 border-blue-400/30",         Icon: Circle },
  concluida:    { label: "Concluída",    color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30", Icon: CheckCircle2 },
  bloqueada:    { label: "Bloqueada",    color: "text-red-400 bg-red-400/10 border-red-400/30",            Icon: AlertCircle },
  cancelada:    { label: "Cancelada",    color: "text-muted-foreground bg-muted/20 border-border",          Icon: Circle },
};

type AbaKey = "resumo" | "demandas" | "processos";

export default function ClienteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [processos, setProcessos] = useState<ProcessoLite[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [demandas, setDemandas] = useState<Demanda[]>([]);

  const [aba, setAba] = useState<AbaKey>("resumo");
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

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    const { error } = await supabase
      .from("clientes")
      .update({
        nome: draft.nome,
        cpf_cnpj: draft.cpf_cnpj,
        telefone: draft.telefone,
        email: draft.email,
        endereco: draft.endereco,
        rg: draft.rg,
        profissao: draft.profissao,
        observacoes: draft.observacoes,
        drive_folder_url: draft.drive_folder_url,
      } as any)
      .eq("id", draft.id);
    setSaving(false);
    if (error) { toast.error("Erro ao salvar"); return; }
    setCliente(draft);
    setEditing(false);
    toast.success("Cliente atualizado");
  };

  if (!cliente) return <div className="text-center text-muted-foreground py-8">Carregando…</div>;

  const origemMeta = ORIGEM_META[cliente.origem ?? "manual"] ?? ORIGEM_META.manual;
  const demandasPre  = demandas.filter(d => d.tipo === "pre_protocolo");
  const demandasProc = demandas.filter(d => d.tipo === "processual");

  const ABAS: Array<{ key: AbaKey; label: string; Icon: any; count: number; hint: string }> = [
    { key: "resumo",    label: "Resumo",    Icon: LayoutGrid, count: 0,                hint: "Dados pessoais e contratos" },
    { key: "demandas",  label: "Demandas",  Icon: ListTodo,   count: demandas.length,  hint: "Pré-protocolo e processual" },
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
          <div className="flex items-start gap-2">
            <h1 className="text-3xl font-medium tracking-tight truncate">{cliente.nome}</h1>
            <button
              onClick={() => { setDraft(cliente); setEditing(true); }}
              className="mt-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              title="Editar dados"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${origemMeta.color}`}>
              {origemMeta.label}
            </span>
            <span className="text-xs text-muted-foreground">
              Cliente desde {fmtDate(cliente.created_at)}
            </span>
          </div>
        </div>
        {cliente.drive_folder_url && (
          <a
            href={cliente.drive_folder_url}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 inline-flex items-center gap-2 px-4 h-10 rounded-xl border border-primary/30 bg-primary/10 text-primary text-sm hover:bg-primary/15 transition-colors"
          >
            <FolderOpen className="h-4 w-4" /> Abrir pasta no Drive
            <ExternalLink className="h-3 w-3 opacity-60" />
          </a>
        )}
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
                  <span className={`text-xs tabular-nums px-1.5 h-5 rounded-full inline-flex items-center ${
                    ativa ? "bg-primary/20 text-primary" : "bg-muted/30 text-muted-foreground"
                  }`}>
                    {a.count}
                  </span>
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
              <Slot icon={Briefcase}  label="Profissão"  value={cliente.profissao} />
              <Slot icon={Phone}      label="Telefone"   value={cliente.telefone} />
              <Slot icon={Mail}       label="E-mail"     value={cliente.email} />
              <Slot icon={MapPin}     label="Endereço"   value={cliente.endereco} />
              {cliente.observacoes && (
                <Slot icon={FileText} label="Observações" value={cliente.observacoes} className="sm:col-span-2 lg:col-span-3" />
              )}
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
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar dados do cliente</DialogTitle>
            <DialogDescription>Atualize os campos. O nome muda no topo da página depois de salvar.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
              <div className="sm:col-span-2"><Label>Nome</Label><Input value={draft.nome} onChange={(e) => setDraft({ ...draft, nome: e.target.value })} /></div>
              <div><Label>CPF/CNPJ</Label><Input value={draft.cpf_cnpj ?? ""} onChange={(e) => setDraft({ ...draft, cpf_cnpj: e.target.value })} /></div>
              <div><Label>RG</Label><Input value={draft.rg ?? ""} onChange={(e) => setDraft({ ...draft, rg: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Profissão</Label><Input value={draft.profissao ?? ""} onChange={(e) => setDraft({ ...draft, profissao: e.target.value })} /></div>
              <div><Label>Telefone</Label><Input value={draft.telefone ?? ""} onChange={(e) => setDraft({ ...draft, telefone: e.target.value })} /></div>
              <div><Label>E-mail</Label><Input type="email" value={draft.email ?? ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Endereço</Label><Input value={draft.endereco ?? ""} onChange={(e) => setDraft({ ...draft, endereco: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Pasta no Google Drive</Label><Input value={draft.drive_folder_url ?? ""} onChange={(e) => setDraft({ ...draft, drive_folder_url: e.target.value })} placeholder="https://drive.google.com/drive/folders/..." /></div>
              <div className="sm:col-span-2"><Label>Observações</Label><Textarea rows={3} value={draft.observacoes ?? ""} onChange={(e) => setDraft({ ...draft, observacoes: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Salvar alterações"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function DemandaCard({ demanda, action }: { demanda: Demanda; action?: React.ReactNode }) {
  const etapa = ETAPA_META[demanda.etapa] ?? ETAPA_META.analise_documental;
  const status = STATUS_META[demanda.status] ?? STATUS_META.pendente;
  return (
    <div className="rounded-xl border border-border bg-card/40 p-4 hover:border-primary/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 shrink-0 rounded-lg bg-muted/30 flex items-center justify-center">
          <etapa.Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-sm font-medium truncate">{demanda.titulo}</h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">{etapa.label}{demanda.desconto && ` · ${demanda.desconto}`}</p>
            </div>
            <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${status.color}`}>
              <status.Icon className="h-2.5 w-2.5" /> {status.label}
            </span>
          </div>
          {demanda.descricao && (
            <p className="text-xs text-muted-foreground mt-2">{demanda.descricao}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-[11px]">
            {demanda.peca_drive_url && (
              <a href={demanda.peca_drive_url} target="_blank" rel="noreferrer"
                 className="text-primary hover:underline inline-flex items-center gap-1">
                <FileText className="h-3 w-3" /> Planilha
              </a>
            )}
            {demanda.protocolo_drive_url && (
              <a href={demanda.protocolo_drive_url} target="_blank" rel="noreferrer"
                 className="text-primary hover:underline inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Protocolo
              </a>
            )}
            {action && <div className="ml-auto">{action}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function EspelhoCard({ demanda }: { demanda: Demanda }) {
  const hasUrl = !!demanda.peca_drive_url;
  const card = (
    <div className={`rounded-xl border p-4 transition-all ${
      hasUrl
        ? "border-emerald-400/30 bg-emerald-400/5 hover:border-emerald-400/60 hover:bg-emerald-400/10 cursor-pointer"
        : "border-border bg-card/40"
    }`}>
      <div className="flex items-start gap-3">
        <div className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${
          hasUrl ? "bg-emerald-400/15 ring-1 ring-emerald-400/30" : "bg-muted/30"
        }`}>
          <Send className={`h-4 w-4 ${hasUrl ? "text-emerald-400" : "text-muted-foreground"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium truncate">{demanda.titulo}</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {demanda.desconto || "—"} · gerada em {fmtDate(demanda.completed_at || demanda.created_at)}
          </p>
          {hasUrl ? (
            <p className="text-[11px] text-emerald-400 mt-2 inline-flex items-center gap-1">
              <FolderOpen className="h-3 w-3" /> Abrir no Drive
              <ExternalLink className="h-2.5 w-2.5 opacity-70" />
            </p>
          ) : (
            <p className="text-[11px] text-amber-400/80 mt-2 italic">Sem link do Drive</p>
          )}
        </div>
      </div>
    </div>
  );
  return hasUrl ? (
    <a href={demanda.peca_drive_url!} target="_blank" rel="noreferrer" className="block">{card}</a>
  ) : card;
}

function PrePipeline({
  demandas, cliente, userId, onChange,
}: { demandas: Demanda[]; cliente: Cliente; userId: string | null; onChange: () => void }) {
  const clienteId = cliente.id;
  const navigate = useNavigate();
  const [dialogVincular, setDialogVincular] = useState(false);
  const [vincForm, setVincForm] = useState({ desconto: "", planilha_url: "" });
  const [savingVinc, setSavingVinc] = useState(false);

  const grupos: Array<{ key: string; label: string; Icon: any; hint: string }> = [
    { key: "analise_documental",    label: "1. Análise Documental",    Icon: ScanSearch, hint: "Vincule análises do Finder ao cliente." },
    { key: "analise_vinculada",     label: "2. Análises Vinculadas",   Icon: GitBranch,  hint: "Cada análise vinculada gera uma peça na etapa seguinte." },
    { key: "pronta_para_protocolo", label: "3. Peças Prontas pra Protocolo", Icon: Send,  hint: "Peças finalizadas no Writer, com link do Drive." },
  ];

  // Lógica de bloqueio sequencial:
  // - 1 sempre liberada
  // - 2 liberada quando existe alguma analise_vinculada
  // - 3 liberada quando alguma peça já saiu do writer pronta pro protocolo
  const temAnaliseVinculada = demandas.some(d => d.etapa === "analise_vinculada");
  const temPecaPronta       = demandas.some(d => d.etapa === "pronta_para_protocolo");

  const liberada = (key: string) => {
    switch (key) {
      case "analise_documental":    return true;
      case "analise_vinculada":     return temAnaliseVinculada;
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
  // tem uma confeccao_peca em pronta_para_protocolo).
  const analisesPendentes = demandas
    .filter(d => d.etapa === "analise_vinculada")
    .filter(av => !demandas.some(p =>
      p.etapa === "pronta_para_protocolo" && p.analise_pai_id === av.id
    ));

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

  const irParaFinder = async () => {
    // Garante que existe uma analise_documental pra esse cliente.
    // Se nao tem (cliente antigo ou criado manualmente), cria agora.
    let ad = demandas.find(d => d.etapa === "analise_documental");
    if (!ad) {
      const { data: nova, error } = await supabase.from("demandas" as any).insert({
        cliente_id: clienteId,
        tipo: "pre_protocolo",
        etapa: "analise_documental",
        titulo: "Análise documental inicial",
        descricao: "Identificar quais descontos do cliente são ajuizáveis.",
        status: "em_andamento",
        created_by: userId,
        ordem: 0,
      }).select().single();
      if (error) { toast.error("Erro ao iniciar pipeline: " + error.message); return; }
      ad = nova as any;
    } else if (ad.status === "pendente") {
      await supabase.from("demandas" as any).update({ status: "em_andamento" }).eq("id", ad.id);
    }
    const params = new URLSearchParams({ cliente: clienteId, nome: cliente.nome });
    navigate(`/finder?${params.toString()}`);
  };

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

  if (demandas.length === 0) {
    return (
      <div className="space-y-3">
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
            onClick={irParaFinder}
            className="bg-emerald-600 hover:bg-emerald-500 text-white shrink-0"
          >
            <ScanSearch className="h-3.5 w-3.5 mr-1.5" />
            Iniciar pipeline
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
                  onClick={irParaFinder}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  <ScanSearch className="h-3.5 w-3.5 mr-1.5" />
                  Vincular análise
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
                  ? "Clique em 'Vincular análise' pra começar a análise dos extratos no Finder."
                  : g.key === "analise_vinculada"
                  ? "Quando o Finder gerar planilhas, vincule cada uma aqui."
                  : "Quando você finalizar uma peça no Writer, ela aparece aqui."}
              </p>
            ) : g.key === "pronta_para_protocolo" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {itens.map(d => <EspelhoCard key={d.id} demanda={d} />)}
              </div>
            ) : (
              <div className="space-y-2">
                {itens.map(d => {
                  const isAnaliseVinc = d.etapa === "analise_vinculada";
                  // analise_vinculada ja virou pronta (tem espelho gerado)?
                  const jaVirouPeca = isAnaliseVinc && demandas.some(p =>
                    p.etapa === "pronta_para_protocolo" && p.analise_pai_id === d.id
                  );
                  return (
                    <DemandaCard
                      key={d.id}
                      demanda={d}
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
    </div>
  );
}
