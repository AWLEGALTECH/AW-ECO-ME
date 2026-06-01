import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { nomeSobrenome } from "@/lib/audit";
import { Plus, Search, Eye, User, FolderOpen, ExternalLink, Loader2, Check, Workflow, CheckCircle2, Hourglass, Send, CreditCard, Phone, Mail, Building2, DollarSign, FileText, ClipboardList } from "lucide-react";
import { useNavigate } from "react-router-dom";

type SocioStatus = "preenchido" | "aguardando_resposta" | "aguardando_geracao";

interface Cliente {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string | null;
  email: string | null;
  requerido: string | null;
  observacoes: string | null;
  drive_folder_url: string | null;
  processos_count: number;
  total_ajuizado: number;
  em_esteira: boolean;
  socio_status: SocioStatus;
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

// Etapas/status que indicam que o cliente esta sendo trabalhado no pipeline.
const STATUS_ATIVOS = new Set(["pendente", "em_andamento", "bloqueada"]);

type Stage = "form" | "drive";

export default function Clientes() {
  const { profile } = useAuth();
  useEffect(() => { document.title = "Clientes — AW ECO ME"; }, []);
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [resumo, setResumo] = useState<Cliente | null>(null);
  const [form, setForm] = useState({ nome: "", cpf_cnpj: "", telefone: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [createdName, setCreatedName] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const resetDialog = () => {
    setForm({ nome: "", cpf_cnpj: "", telefone: "", email: "" });
    setStage("form");
    setCreatedName("");
    setCreatedId(null);
    setDriveUrl(null);
    setDriveError(null);
    setCreatingFolder(false);
  };

  const fetchAll = useCallback(async () => {
    const [cliRes, procRes, demRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nome, cpf_cnpj, telefone, email, dados_socioeconomicos, socio_link_enviado_at, requerido, observacoes, drive_folder_url")
        .order("nome", { ascending: true }),
      supabase.from("processos").select("cliente_id, valor_causa"),
      supabase.from("demandas" as any).select("cliente_id, status"),
    ]);
    if (!cliRes.data) return;

    const agg = new Map<string, { count: number; total: number }>();
    (procRes.data || []).forEach((p: any) => {
      const cur = agg.get(p.cliente_id) || { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(p.valor_causa) || 0;
      agg.set(p.cliente_id, cur);
    });

    const esteira = new Set<string>();
    (demRes.data || []).forEach((d: any) => {
      if (STATUS_ATIVOS.has(d.status)) esteira.add(d.cliente_id);
    });

    setClientes(cliRes.data.map((c: any) => {
      const a = agg.get(c.id) || { count: 0, total: 0 };
      const ds = c.dados_socioeconomicos || {};
      const preenchido = Object.values(ds).some(
        (v) => v !== null && v !== undefined && String(v).trim() !== ""
      );
      const socio_status: SocioStatus = preenchido
        ? "preenchido"
        : c.socio_link_enviado_at
          ? "aguardando_resposta"
          : "aguardando_geracao";
      return {
        id: c.id,
        nome: c.nome,
        cpf_cnpj: c.cpf_cnpj,
        telefone: c.telefone,
        email: c.email,
        requerido: c.requerido ?? null,
        observacoes: c.observacoes ?? null,
        drive_folder_url: c.drive_folder_url ?? null,
        processos_count: a.count,
        total_ajuizado: a.total,
        em_esteira: esteira.has(c.id),
        socio_status,
      };
    }));
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = clientes.filter((c) =>
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    (c.cpf_cnpj ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    const nome = form.nome.trim();
    const { data: inserted, error } = await supabase.from("clientes").insert({
      nome,
      cpf_cnpj: form.cpf_cnpj.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      origem: "manual",
      cadastrado_por: nomeSobrenome(profile),
    } as any).select("id").single();
    setSaving(false);
    if (error || !inserted) {
      toast.error(error?.code === "23505" ? "Cliente já existe" : "Erro ao salvar");
      return;
    }
    toast.success("Cliente adicionado");
    setCreatedName(nome);
    setCreatedId(inserted.id);
    setStage("drive");
    fetchAll();

    // Cria pasta no Drive em background — o stage 2 mostra spinner ate concluir
    setCreatingFolder(true);
    const { data: fnData, error: fnErr } = await supabase.functions.invoke(
      "create-cliente-drive-folder",
      { body: { cliente_id: inserted.id } },
    );
    setCreatingFolder(false);
    if (fnErr || !fnData?.ok) {
      const msg = (fnData as any)?.error || fnErr?.message || "Falha desconhecida";
      setDriveError(msg);
      return;
    }
    setDriveUrl((fnData as any).folder_url);
  };

  const irPerfilDoResumo = () => {
    if (resumo) {
      const id = resumo.id;
      setResumo(null);
      navigate(`/clientes/${id}`);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-3xl font-medium tracking-tight">Clientes</h2>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetDialog(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Novo Cliente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader className="items-center text-center space-y-3">
              <div className="h-16 w-16 rounded-full bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
                {stage === "form" ? (
                  <User className="h-7 w-7 text-primary" />
                ) : (
                  <Check className="h-7 w-7 text-primary" />
                )}
              </div>
              <DialogTitle>
                {stage === "form" ? "Novo Cliente" : createdName}
              </DialogTitle>
              {stage === "drive" && (
                <p className="text-xs text-muted-foreground -mt-1">
                  Cliente criado. Agora abra a pasta no Drive pra subir os documentos.
                </p>
              )}
            </DialogHeader>

            {stage === "form" ? (
              <>
                <div className="space-y-3 py-2">
                  <div><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
                  <div><Label>CPF/CNPJ</Label><Input value={form.cpf_cnpj} onChange={(e) => setForm({ ...form, cpf_cnpj: e.target.value })} /></div>
                  <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></div>
                  <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <div className="py-3 space-y-3">
                  {creatingFolder ? (
                    <div className="rounded-xl border border-border bg-card/40 p-4 flex items-center gap-3">
                      <Loader2 className="h-5 w-5 text-primary animate-spin shrink-0" />
                      <div>
                        <p className="text-sm font-medium">Criando pasta no Drive…</p>
                        <p className="text-[11px] text-muted-foreground">Isso leva alguns segundos.</p>
                      </div>
                    </div>
                  ) : driveError ? (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-1">
                      <p className="text-sm font-medium text-destructive">Não foi possível criar a pasta</p>
                      <p className="text-[11px] text-muted-foreground break-all">{driveError}</p>
                      <p className="text-[11px] text-muted-foreground italic">
                        Você pode tentar de novo abrindo o cliente depois.
                      </p>
                    </div>
                  ) : driveUrl ? (
                    <a
                      href={driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-xl border border-primary/40 bg-primary/10 p-4 hover:bg-primary/15 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                          <FolderOpen className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground">Abrir pasta no Drive</p>
                          <p className="text-[11px] text-muted-foreground">Faça o upload dos documentos do cliente</p>
                        </div>
                        <ExternalLink className="h-4 w-4 text-primary opacity-70 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </a>
                  ) : null}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setOpen(false); }}>Fechar</Button>
                  {createdId && (
                    <Button onClick={() => { setOpen(false); navigate(`/clientes/${createdId}`); }}>
                      Ir pro perfil
                    </Button>
                  )}
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou CPF/CNPJ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden lg:table-cell w-36">
                  <span className="inline-flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                    CPF / CNPJ
                  </span>
                </TableHead>
                <TableHead className="w-36 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-emerald-400" />
                    Total ajuizado
                  </span>
                </TableHead>
                <TableHead className="w-24 text-center">
                  <span className="inline-flex items-center gap-1.5 justify-center w-full">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    Processos
                  </span>
                </TableHead>
                <TableHead className="w-44">
                  <span className="inline-flex items-center gap-1.5">
                    <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                    Socioeconômico
                  </span>
                </TableHead>
                <TableHead className="w-20 text-center">
                  <span className="inline-flex items-center gap-1.5 justify-center w-full">
                    <Workflow className="h-3.5 w-3.5 text-muted-foreground" />
                    Esteira
                  </span>
                </TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => setResumo(c)}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-3">
                      <span className="h-11 w-11 shrink-0 rounded-full bg-primary/15 ring-1 ring-primary/30 inline-flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </span>
                      <span className="flex flex-col">
                        <span>{c.nome}</span>
                        {c.telefone && <span className="text-[11px] text-muted-foreground font-normal">{c.telefone}</span>}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell tabular-nums">
                    {c.cpf_cnpj
                      ? <span className="text-muted-foreground">{c.cpf_cnpj}</span>
                      : <span className="text-muted-foreground/25">—</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.total_ajuizado > 0 ? (
                      <span
                        className="text-emerald-400 font-medium"
                        style={c.total_ajuizado >= 100000 ? { textShadow: "0 0 14px rgba(52,211,153,.6)" } : undefined}
                      >
                        {fmtBRL(c.total_ajuizado)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/25">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {c.processos_count > 0
                      ? c.processos_count
                      : <span className="text-muted-foreground/25">—</span>}
                  </TableCell>
                  <TableCell>
                    <SocioBadge status={c.socio_status} />
                  </TableCell>
                  <TableCell className="text-center">
                    {c.em_esteira ? (
                      <span
                        className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-amber-400/15 ring-1 ring-amber-400/40 text-amber-400"
                        title="Em andamento na esteira pré-protocolo"
                      >
                        <Workflow className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="text-muted-foreground/25 text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" onClick={() => setResumo(c)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum cliente encontrado.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ClienteResumoDialog
        cliente={resumo}
        onClose={() => setResumo(null)}
        onIrPerfil={irPerfilDoResumo}
      />
    </>
  );
}

// Popup com resumo dos dados do cliente — abre ao clicar no olhinho ou na linha
function ClienteResumoDialog({ cliente, onClose, onIrPerfil }: {
  cliente: Cliente | null;
  onClose: () => void;
  onIrPerfil: () => void;
}) {
  if (!cliente) return null;
  return (
    <Dialog open={!!cliente} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center space-y-2">
          <div className="h-14 w-14 rounded-full bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
            <User className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle>{cliente.nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 text-sm pt-1">
          {cliente.cpf_cnpj && <ResumoRow icon={CreditCard} label="CPF / CNPJ" value={cliente.cpf_cnpj} />}
          {cliente.telefone && <ResumoRow icon={Phone} label="Telefone" value={cliente.telefone} />}
          {cliente.email && <ResumoRow icon={Mail} label="E-mail" value={cliente.email} />}
          {cliente.requerido && <ResumoRow icon={Building2} label="Requerido" value={cliente.requerido} />}
          <ResumoRow icon={DollarSign} label="Total ajuizado" value={
            cliente.total_ajuizado > 0 ? (
              <span
                className="text-emerald-400 font-medium tabular-nums"
                style={cliente.total_ajuizado >= 100000 ? { textShadow: "0 0 14px rgba(52,211,153,.6)" } : undefined}
              >
                {fmtBRL(cliente.total_ajuizado)}
              </span>
            ) : "—"
          } />
          <ResumoRow icon={FileText} label="Processos" value={<span className="tabular-nums">{cliente.processos_count}</span>} />
          <ResumoRow icon={ClipboardList} label="Socioeconômico" value={<SocioBadge status={cliente.socio_status} />} />
          <ResumoRow icon={Workflow} label="Esteira" value={
            cliente.em_esteira ? (
              <span className="inline-flex items-center gap-1 text-amber-400">
                <Workflow className="h-3 w-3" /> Em andamento
              </span>
            ) : <span className="text-muted-foreground/60">Sem demanda ativa</span>
          } />
          {cliente.drive_folder_url && (
            <ResumoRow icon={FolderOpen} label="Drive" value={
              <a href={cliente.drive_folder_url} target="_blank" rel="noopener noreferrer"
                 className="inline-flex items-center gap-1 text-primary hover:underline truncate">
                Abrir pasta <ExternalLink className="h-3 w-3" />
              </a>
            } />
          )}
          {cliente.observacoes && (
            <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3 mt-2">
              <p className="text-[10px] uppercase tracking-[0.15em] text-amber-400/80 font-semibold mb-1">Observação</p>
              <p className="text-[12px] text-foreground/90 whitespace-pre-wrap break-words">{cliente.observacoes}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={onIrPerfil}>
            <ExternalLink className="h-4 w-4 mr-1.5" /> Ir pro perfil
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResumoRow({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 px-2 py-1.5 rounded-md">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <span className="text-muted-foreground w-28 shrink-0 text-[12px]">{label}</span>
      <span className="flex-1 break-words text-[13px]">{value}</span>
    </div>
  );
}

function SocioBadge({ status }: { status: SocioStatus }) {
  const META = {
    preenchido:          { label: "Preenchido",          Icon: CheckCircle2, cls: "text-emerald-400 bg-emerald-400/10 ring-emerald-400/30" },
    aguardando_resposta: { label: "Aguardando resposta", Icon: Hourglass,    cls: "text-amber-400 bg-amber-400/10 ring-amber-400/30" },
    aguardando_geracao:  { label: "Aguardando envio",    Icon: Send,         cls: "text-muted-foreground bg-muted/20 ring-border" },
  } as const;
  const m = META[status];
  const Icon = m.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium ring-1 ${m.cls}`}>
      <Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}
