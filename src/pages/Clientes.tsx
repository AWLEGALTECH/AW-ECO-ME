import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { LANDING_OPCOES, type AdvogadoKey, linkSocio, whatsappSocioUrl } from "@/lib/socioLanding";
import { SpotlightCard } from "@/components/SpotlightCard";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useComarcasSugeridas } from "@/hooks/useComarcasSugeridas";
import { nomeSobrenome } from "@/lib/audit";
import { Plus, Search, Eye, User, FolderOpen, ExternalLink, Loader2, Check, Workflow, CheckCircle2, Hourglass, Send, CreditCard, Phone, Mail, Building2, DollarSign, FileText, ClipboardList, ChevronUp, ChevronDown, ChevronsUpDown, Calendar, UserPlus, Copy, ArrowRight, AlertTriangle, Archive, ChevronRight } from "lucide-react";
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
  created_at: string;
  cadastrado_por: string | null;
  processos_count: number;
  total_ajuizado: number;
  em_esteira: boolean;
  socio_status: SocioStatus;
}

const fmtDataCurta = (iso: string | null): string => {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  }).format(new Date(iso));
};

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(v);

// Limite a partir do qual o valor entra em "verde dinheiro".
const MONEY_HIGHLIGHT_FROM = 100_000;

// Renderiza valor BRL com os centavos numa fonte menor (estilo dashboard
// financeiro): "R$ 1.234,<small>56</small>". Cor padrao do tema; entra em
// verde dinheiro apenas quando o valor atinge MONEY_HIGHLIGHT_FROM.
function MoneyValue({ value }: { value: number }) {
  const f = fmtBRL(value);
  const [intPart, centsPart] = f.split(",");
  const highlight = value >= MONEY_HIGHLIGHT_FROM;
  return (
    <span className={`font-medium tabular-nums ${highlight ? "text-emerald-400" : "text-foreground"}`}>
      {intPart}
      {centsPart != null && <span className="text-[0.72em] opacity-80">,{centsPart}</span>}
    </span>
  );
}

// Etapas/status que indicam que o cliente esta sendo trabalhado no pipeline.
const STATUS_ATIVOS = new Set(["pendente", "em_andamento", "bloqueada"]);

// Ordem do status socio pra ordenacao: preenchido > aguardando_resposta > aguardando_geracao.
const SOCIO_ORDER: Record<SocioStatus, number> = {
  preenchido: 3,
  aguardando_resposta: 2,
  aguardando_geracao: 1,
};

type SortKey = "nome" | "cpf_cnpj" | "total_ajuizado" | "processos_count" | "socio_status" | "em_esteira" | "created_at" | "cadastrado_por";
type SortDir = "asc" | "desc";

type Stage = "form" | "drive";

export default function Clientes() {
  const { profile } = useAuth();
  useEffect(() => { document.title = "Clientes · AW ECO ME"; }, []);
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [arquivadosCount, setArquivadosCount] = useState(0);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [resumo, setResumo] = useState<Cliente | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "nome", dir: "asc" });
  const onSort = (key: SortKey) => {
    setSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      // Numericas e categoricas comecam descrescente (maior/mais relevante primeiro)
      const numericKeys: SortKey[] = ["total_ajuizado", "processos_count", "em_esteira", "socio_status", "created_at"];
      return { key, dir: numericKeys.includes(key) ? "desc" : "asc" };
    });
  };
  const [form, setForm] = useState({ nome: "", cpf_cnpj: "", telefone: "", email: "", parceiro: "", comarca: "", uf: "" });
  const comarcasSugeridas = useComarcasSugeridas();
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState<Stage>("form");
  const [createdName, setCreatedName] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const resetDialog = () => {
    setForm({ nome: "", cpf_cnpj: "", telefone: "", email: "", parceiro: "", comarca: "", uf: "" });
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
        .select("id, nome, cpf_cnpj, telefone, email, dados_socioeconomicos, socio_link_enviado_at, requerido, observacoes, drive_folder_url, created_at, cadastrado_por, arquivado_em")
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

    // Arquivado sai da lista de ativos — é justamente o ponto de arquivar. Só
    // a contagem fica, pra alimentar o acesso à área de arquivados.
    const ativos = (cliRes.data as any[]).filter((c) => !c.arquivado_em);
    setArquivadosCount((cliRes.data as any[]).length - ativos.length);

    setClientes(ativos.map((c: any) => {
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
        created_at: c.created_at,
        cadastrado_por: c.cadastrado_por ?? null,
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

  const sortedList = [...filtered].sort((a, b) => {
    const mult = sort.dir === "asc" ? 1 : -1;
    switch (sort.key) {
      case "nome":             return a.nome.localeCompare(b.nome, "pt-BR") * mult;
      case "cpf_cnpj":         return (a.cpf_cnpj || "").localeCompare(b.cpf_cnpj || "", "pt-BR") * mult;
      case "total_ajuizado":   return (a.total_ajuizado - b.total_ajuizado) * mult;
      case "processos_count":  return (a.processos_count - b.processos_count) * mult;
      case "socio_status":     return (SOCIO_ORDER[a.socio_status] - SOCIO_ORDER[b.socio_status]) * mult;
      case "em_esteira":       return ((a.em_esteira ? 1 : 0) - (b.em_esteira ? 1 : 0)) * mult;
      case "created_at":       return (a.created_at || "").localeCompare(b.created_at || "") * mult;
      case "cadastrado_por":   return (a.cadastrado_por || "").localeCompare(b.cadastrado_por || "", "pt-BR") * mult;
      default: return 0;
    }
  });

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    const nome = form.nome.trim();
    const { data: inserted, error } = await supabase.from("clientes").insert({
      nome,
      cpf_cnpj: form.cpf_cnpj.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      parceiro: form.parceiro.trim() || null,
      comarca: form.comarca.trim() || null,
      uf: form.uf.trim().toUpperCase() || null,
      origem: "manual",
      cadastrado_por: nomeSobrenome(profile),
      // Todo cliente entra na fila de "Análise primária" (col 1 da esteira),
      // inclusive os cadastrados manualmente — ninguém pode ficar de fora.
      precisa_analise_extratos: true,
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
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <div>
                      <Label>Comarca / foro</Label>
                      <Input list="comarcas-sugeridas" value={form.comarca} onChange={(e) => setForm({ ...form, comarca: e.target.value })} placeholder="Ex.: Manaus" />
                      <datalist id="comarcas-sugeridas">
                        {comarcasSugeridas.map((c) => <option key={c} value={c} />)}
                      </datalist>
                    </div>
                    <div><Label>UF</Label><Input value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase().slice(0, 2) })} placeholder="AM" maxLength={2} className="w-16" /></div>
                  </div>
                  <div className="col-span-2">
                    <Label className="flex items-center gap-1.5">
                      Parceiro
                      <span className="text-[10px] text-muted-foreground font-normal">(colaborador que trouxe o caso)</span>
                    </Label>
                    <Input value={form.parceiro} onChange={(e) => setForm({ ...form, parceiro: e.target.value })} placeholder="ex: João Silva, Imobiliária X" />
                  </div>
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

      <ClientesDashboard clientes={clientes} onRefetch={fetchAll} />

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
                <SortableHead label="Nome" sortKey="nome" sort={sort} onSort={onSort} />
                <SortableHead label="CPF / CNPJ" icon={CreditCard} sortKey="cpf_cnpj" sort={sort} onSort={onSort} className="hidden lg:table-cell w-36" />
                <SortableHead label="Total ajuizado" icon={DollarSign} sortKey="total_ajuizado" sort={sort} onSort={onSort} className="w-40 text-right" align="right" />
                <SortableHead label="Processos" icon={FileText} sortKey="processos_count" sort={sort} onSort={onSort} className="w-24 text-center" align="center" />
                <SortableHead label="Socioeconômico" icon={ClipboardList} sortKey="socio_status" sort={sort} onSort={onSort} className="w-44" />
                <SortableHead label="Entrada" icon={Calendar} sortKey="created_at" sort={sort} onSort={onSort} className="hidden md:table-cell w-28" />
                <SortableHead label="Cadastrou" icon={UserPlus} sortKey="cadastrado_por" sort={sort} onSort={onSort} className="hidden xl:table-cell w-36" />
                <SortableHead label="Esteira" icon={Workflow} sortKey="em_esteira" sort={sort} onSort={onSort} className="w-24 text-center" align="center" />
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedList.map((c) => (
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
                  <TableCell className="text-right">
                    {c.total_ajuizado > 0 ? (
                      <MoneyValue value={c.total_ajuizado} />
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
                  <TableCell className="hidden md:table-cell tabular-nums text-muted-foreground text-[12px]">
                    {fmtDataCurta(c.created_at)}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell text-[12px]">
                    {c.cadastrado_por
                      ? <span className="truncate inline-block max-w-[140px]">{c.cadastrado_por}</span>
                      : <span className="text-muted-foreground/25">—</span>}
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
              {sortedList.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum cliente encontrado.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Acesso aos arquivados. Discreto de propósito: é uma gaveta que se
          abre de vez em quando, não parte do trabalho do dia. Fica no rodapé,
          depois da lista, onde quem procura encontra e quem não procura não
          esbarra. */}
      <button
        onClick={() => navigate("/clientes/arquivados")}
        className="w-full mt-4 rounded-xl border border-dashed border-border/70 bg-muted/[0.15] hover:bg-muted/30 hover:border-border px-4 py-3 flex items-center gap-3 text-left transition-colors group"
      >
        <span className="h-8 w-8 rounded-lg bg-muted/40 ring-1 ring-border/60 text-muted-foreground grid place-items-center shrink-0 group-hover:text-foreground/70 transition-colors">
          <Archive className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-medium text-muted-foreground group-hover:text-foreground/80 transition-colors">
            Clientes arquivados
          </span>
          <span className="block text-[11px] text-muted-foreground/70">
            {arquivadosCount === 0
              ? "Nenhum cliente arquivado"
              : `${arquivadosCount} ${arquivadosCount === 1 ? "cliente fora" : "clientes fora"} da lista de ativos`}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
      </button>

      <ClienteResumoDialog
        cliente={resumo}
        onClose={() => setResumo(null)}
        onIrPerfil={irPerfilDoResumo}
      />
    </>
  );
}

// Campos de cadastro acompanhados pela completude (fora o socioeconômico,
// que tem fluxo próprio de envio). present(c) = dado preenchido.
// conta=false → aparece na lista como informação, mas NÃO entra no critério
// de "cadastro completo" (caso do e-mail, que quase ninguém tem).
const CAMPOS_COMPLETUDE: { key: string; label: string; icon: any; present: (c: Cliente) => boolean; conta?: boolean }[] = [
  { key: "telefone",  label: "Telefone",   icon: Phone,      present: (c) => !!(c.telefone || "").trim() },
  { key: "cpf_cnpj",  label: "CPF / CNPJ", icon: CreditCard, present: (c) => !!(c.cpf_cnpj || "").trim() },
  { key: "email",     label: "E-mail",     icon: Mail,       present: (c) => !!(c.email || "").trim(), conta: false },
  { key: "requerido", label: "Requerido",  icon: Building2,  present: (c) => !!(c.requerido || "").trim() },
  { key: "drive",     label: "Pasta no Drive", icon: FolderOpen, present: (c) => !!(c.drive_folder_url || "").trim() },
];

const socioPreenchido = (c: Cliente) => c.socio_status === "preenchido";

// Dashboard de COMPLETUDE de dados — fica acima da tabela. Mostra o que está
// preenchido e o que falta, e oferece o caminho de preenchimento: envio do
// formulário socioeconômico pra quem falta + atalho pro perfil pra completar
// os demais campos. Tudo calculado do array `clientes` (sem queries novas).
function ClientesDashboard({ clientes, onRefetch }: { clientes: Cliente[]; onRefetch: () => void }) {
  const navigate = useNavigate();
  const [socioOpen, setSocioOpen] = useState(false);
  const [lista, setLista] = useState<{ titulo: string; subtitulo?: string; campoKey?: string; clientes: Cliente[] } | null>(null);

  const s = useMemo(() => {
    const total = clientes.length;
    let socioOk = 0, socioResp = 0, socioGer = 0, completos = 0;
    const incompletos: Cliente[] = [];
    for (const c of clientes) {
      if (c.socio_status === "preenchido") socioOk++;
      else if (c.socio_status === "aguardando_resposta") socioResp++;
      else socioGer++;
      const tudo = socioPreenchido(c) && CAMPOS_COMPLETUDE.every((f) => f.conta === false || f.present(c));
      if (tudo) completos++; else incompletos.push(c);
    }
    const socioPend = socioResp + socioGer;
    const completudeCampos = CAMPOS_COMPLETUDE.map((f) => ({
      ...f, ok: clientes.filter(f.present).length,
    }));
    return { total, socioOk, socioResp, socioGer, socioPend, completos, incompletos, completudeCampos };
  }, [clientes]);

  const pct = (n: number) => (s.total > 0 ? Math.round((n / s.total) * 100) : 0);
  const semTelefone = s.total - s.completudeCampos.find((c) => c.key === "telefone")!.ok;
  const abrirLista = (titulo: string, subtitulo: string, cl: Cliente[], campoKey?: string) =>
    setLista({ titulo, subtitulo, clientes: cl, campoKey });

  return (
    <div className="mb-4 space-y-4">
      {/* KPIs de completude — clicáveis, no padrão do dashboard principal */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiSpot icon={User} label="Clientes" value={s.total} />
        <KpiSpot
          icon={CheckCircle2}
          label="Cadastro completo"
          value={s.completos}
          hint={`${pct(s.completos)}% com tudo · ver pendentes`}
          accent={s.completos === s.total && s.total > 0 ? "text-emerald-400" : "text-primary/60"}
          onClick={s.incompletos.length
            ? () => abrirLista("Cadastro incompleto", "Falta algum dado (telefone, CPF, e-mail, requerido, Drive ou socioeconômico). Abra o perfil pra completar.", s.incompletos)
            : undefined}
        />
        <KpiSpot
          icon={ClipboardList}
          label="Socioeco. pendente"
          value={s.socioPend}
          hint="enviar formulário"
          accent={s.socioPend > 0 ? "text-amber-400" : "text-emerald-400"}
          onClick={s.socioPend ? () => setSocioOpen(true) : undefined}
        />
        <KpiSpot
          icon={Phone}
          label="Sem telefone"
          value={semTelefone}
          hint="bloqueia o WhatsApp"
          accent={semTelefone > 0 ? "text-amber-400" : "text-emerald-400"}
          onClick={semTelefone
            ? () => abrirLista("Sem telefone", `${semTelefone} cliente(s) sem telefone. Preencha aqui mesmo.`, clientes.filter((c) => !(c.telefone || "").trim()), "telefone")
            : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Formulário socioeconômico */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ClipboardList className="h-4 w-4 text-muted-foreground" /> Formulário socioeconômico
              </div>
              <span className="text-[11px] text-muted-foreground tabular-nums">{s.socioOk}/{s.total} ok</span>
            </div>

            <div className="flex h-2 rounded-full overflow-hidden bg-muted/40">
              <div className="bg-emerald-400" style={{ width: `${pct(s.socioOk)}%` }} title="Preenchido" />
              <div className="bg-amber-400" style={{ width: `${pct(s.socioResp)}%` }} title="Aguardando resposta" />
              <div className="bg-muted-foreground/40" style={{ width: `${pct(s.socioGer)}%` }} title="Nunca enviado" />
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <LegendaSocio cor="bg-emerald-400" label="Preenchido" n={s.socioOk} />
              <LegendaSocio cor="bg-amber-400" label="Aguard. resposta" n={s.socioResp} />
              <LegendaSocio cor="bg-muted-foreground/40" label="Nunca enviado" n={s.socioGer} />
            </div>

            {s.socioPend > 0 ? (
              <button
                onClick={() => setSocioOpen(true)}
                className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline"
              >
                <Send className="h-3 w-3" /> Enviar pra quem falta ({s.socioPend})
              </button>
            ) : (
              <p className="text-[12px] text-emerald-400/90">Todos preenchidos 🎉</p>
            )}
          </CardContent>
        </Card>

        {/* Completude dos demais campos — linhas clicáveis */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ClipboardList className="h-4 w-4 text-muted-foreground" /> Completude do cadastro
            </div>
            <div className="space-y-0.5">
              {s.completudeCampos.map((f) => {
                const faltam = s.total - f.ok;
                return (
                  <button
                    key={f.key}
                    disabled={faltam === 0}
                    onClick={() => abrirLista(`Sem ${f.label.toLowerCase()}`, `${faltam} cliente(s) sem esse dado. Preencha aqui mesmo.`, clientes.filter((c) => !f.present(c)), f.key)}
                    className="w-full flex items-center gap-2 rounded-md px-1.5 py-1.5 -mx-1.5 text-left transition-colors enabled:hover:bg-white/[0.04] disabled:cursor-default"
                  >
                    <f.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[12px] text-foreground/90 w-24 shrink-0">{f.label}</span>
                    <div className="h-1.5 flex-1 rounded-full bg-muted/40 overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct(f.ok)}%` }} />
                    </div>
                    <span className="text-[11px] tabular-nums text-muted-foreground w-12 text-right shrink-0">{f.ok}/{s.total}</span>
                    <span className={`text-[11px] w-16 text-right shrink-0 ${f.conta === false || faltam === 0 ? "text-muted-foreground/40" : "text-primary"}`}>
                      {faltam === 0 ? "completo" : f.conta === false ? "opcional" : `${faltam} falta${faltam > 1 ? "m" : ""}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <SocioEnvioDialog
        open={socioOpen}
        onClose={() => setSocioOpen(false)}
        clientes={clientes.filter((c) => !socioPreenchido(c))}
        onRefetch={onRefetch}
      />

      <ListaClientesDialog
        lista={lista}
        onClose={() => setLista(null)}
        onAbrirPerfil={(id) => { setLista(null); navigate(`/clientes/${id}`); }}
        onRefetch={onRefetch}
      />
    </div>
  );
}

function LegendaSocio({ cor, label, n }: { cor: string; label: string; n: number }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className={`h-2 w-2 rounded-full ${cor} shrink-0`} />
      <span className="text-muted-foreground truncate">{label}</span>
      <span className="tabular-nums text-foreground/80 ml-auto">{n}</span>
    </div>
  );
}

// Dialog que ajuda a ENVIAR o formulário socioeconômico pra cada cliente que
// ainda não preencheu. Escolhe o advogado da landing, lista os pendentes
// (nunca enviados primeiro) e dá ações por cliente: WhatsApp e copiar link.
// Marca socio_link_enviado_at a cada envio (vira "aguardando resposta").
function SocioEnvioDialog({ open, onClose, clientes, onRefetch }: {
  open: boolean;
  onClose: () => void;
  clientes: Cliente[];
  onRefetch: () => void;
}) {
  const navigate = useNavigate();
  const [advogado, setAdvogado] = useState<AdvogadoKey | null>(null);
  const [busca, setBusca] = useState("");
  const [enviados, setEnviados] = useState<Set<string>>(new Set());

  const reset = () => { setAdvogado(null); setBusca(""); setEnviados(new Set()); };
  const handleClose = () => { onClose(); setTimeout(reset, 200); };

  const carimbar = async (clienteId: string) => {
    await supabase
      .from("clientes")
      .update({ socio_link_enviado_at: new Date().toISOString() } as any)
      .eq("id", clienteId);
    setEnviados((prev) => new Set(prev).add(clienteId));
    onRefetch();
  };

  const enviarWa = (c: Cliente) => {
    if (!advogado) return;
    const link = linkSocio(advogado, c.id);
    window.open(whatsappSocioUrl(c.telefone, link), "_blank", "noopener,noreferrer");
    carimbar(c.id);
  };

  const copiar = async (c: Cliente) => {
    if (!advogado) return;
    const link = linkSocio(advogado, c.id);
    try {
      await navigator.clipboard.writeText(link);
      toast.success(`Link de ${c.nome.split(" ")[0]} copiado.`);
    } catch {
      window.prompt("Copie o link:", link);
    }
    carimbar(c.id);
  };

  // nunca enviados (aguardando_geracao) primeiro, depois aguardando_resposta
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return [...clientes]
      .filter((c) => !q || c.nome.toLowerCase().includes(q))
      .sort((a, b) => {
        const ord = (c: Cliente) => (c.socio_status === "aguardando_geracao" ? 0 : 1);
        return ord(a) - ord(b) || a.nome.localeCompare(b.nome, "pt-BR");
      });
  }, [clientes, busca]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Enviar formulário socioeconômico</DialogTitle>
          <DialogDescription>
            {advogado
              ? "Mande o link pra cada cliente. As respostas aparecem na ficha automaticamente."
              : "Para qual advogado o formulário vai ser preenchido?"}
          </DialogDescription>
        </DialogHeader>

        {!advogado ? (
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
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                Landing: <strong className="text-foreground">{LANDING_OPCOES[advogado].label}</strong>
                <button onClick={() => setAdvogado(null)} className="text-primary hover:underline">trocar</button>
              </div>
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar por nome…" className="pl-8 h-8 text-xs" />
              </div>
            </div>

            <div className="max-h-[45vh] overflow-y-auto -mx-1 px-1 space-y-1.5">
              {lista.length === 0 ? (
                <p className="text-center text-[12px] text-muted-foreground py-6">Ninguém pendente por aqui.</p>
              ) : lista.map((c) => {
                const semFone = !(c.telefone || "").trim();
                const jaEnviado = enviados.has(c.id);
                return (
                  <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium truncate">{c.nome}</span>
                        {jaEnviado && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        {semFone
                          ? <span className="inline-flex items-center gap-1 text-amber-400/90"><AlertTriangle className="h-2.5 w-2.5" /> sem telefone</span>
                          : <span className="inline-flex items-center gap-1"><Phone className="h-2.5 w-2.5" /> {c.telefone}</span>}
                        <span className="text-muted-foreground/40">·</span>
                        <span>{c.socio_status === "aguardando_resposta" ? "link já enviado" : "nunca enviado"}</span>
                      </div>
                    </div>
                    {semFone ? (
                      <Button size="sm" variant="ghost" className="h-7 text-[11px] shrink-0" onClick={() => navigate(`/clientes/${c.id}`)}>
                        Add telefone
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px] shrink-0" onClick={() => enviarWa(c)}>
                        <Send className="h-3 w-3" /> WhatsApp
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" title="Copiar link" onClick={() => copiar(c)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Config de edição inline por campo faltante: coluna no banco, placeholder e
// sugestões de preenchimento rápido (ex.: requerido = Bradesco).
const CAMPO_EDIT: Record<string, { col: string; placeholder: string; type?: string; sugestoes?: { label: string; value: string }[] }> = {
  telefone:  { col: "telefone",  placeholder: "(92) 9XXXX-XXXX", type: "tel" },
  cpf_cnpj:  { col: "cpf_cnpj",  placeholder: "CPF ou CNPJ" },
  email:     { col: "email",     placeholder: "email@exemplo.com", type: "email" },
  requerido: { col: "requerido", placeholder: "Ex.: BANCO BRADESCO S.A", sugestoes: [{ label: "Bradesco", value: "BANCO BRADESCO S.A" }] },
};

// Lista dos clientes que estão SEM um determinado dado. Quando o campo faltante
// é único e editável (telefone/CPF/e-mail/requerido), cada linha traz o campo +
// botão de salvar pra preencher ali mesmo. Pra "Pasta no Drive", um botão cria
// a pasta. Pra listas mistas (cadastro incompleto), mostra o que falta + atalho
// pro perfil.
function ListaClientesDialog({ lista, onClose, onAbrirPerfil, onRefetch }: {
  lista: { titulo: string; subtitulo?: string; campoKey?: string; clientes: Cliente[] } | null;
  onClose: () => void;
  onAbrirPerfil: (id: string) => void;
  onRefetch: () => void;
}) {
  const [resolvidos, setResolvidos] = useState<Set<string>>(new Set());
  // Zera a lista de resolvidos toda vez que abre uma lista nova.
  useEffect(() => { setResolvidos(new Set()); }, [lista?.titulo, lista?.campoKey]);

  if (!lista) return null;
  const edit = lista.campoKey ? CAMPO_EDIT[lista.campoKey] : undefined;
  const ehDrive = lista.campoKey === "drive";
  const visiveis = lista.clientes.filter((c) => !resolvidos.has(c.id));
  const marcarResolvido = (id: string) => {
    setResolvidos((prev) => new Set(prev).add(id));
    onRefetch();
  };

  return (
    <Dialog open={!!lista} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{lista.titulo}</DialogTitle>
          {lista.subtitulo && <DialogDescription>{lista.subtitulo}</DialogDescription>}
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto -mx-1 px-1 space-y-1.5">
          {visiveis.length === 0 ? (
            <p className="text-center text-[12px] text-muted-foreground py-6">Tudo preenchido por aqui. 🎉</p>
          ) : visiveis.map((c) => {
            if (edit) {
              return <RowEditCampo key={c.id} cliente={c} edit={edit} onSaved={() => marcarResolvido(c.id)} onPerfil={() => onAbrirPerfil(c.id)} />;
            }
            if (ehDrive) {
              return <RowCriarPasta key={c.id} cliente={c} onSaved={() => marcarResolvido(c.id)} onPerfil={() => onAbrirPerfil(c.id)} />;
            }
            // Lista mista (cadastro incompleto): mostra o que falta + perfil.
            const faltas = [
              ...CAMPOS_COMPLETUDE.filter((f) => f.conta !== false && !f.present(c)).map((f) => f.label),
              ...(socioPreenchido(c) ? [] : ["Socioeconômico"]),
            ];
            return (
              <button
                key={c.id}
                onClick={() => onAbrirPerfil(c.id)}
                className="w-full flex items-center gap-2 rounded-lg border border-border bg-card/40 hover:bg-card/70 hover:border-primary/40 transition-colors px-3 py-2 text-left"
              >
                <span className="h-7 w-7 rounded-full bg-primary/15 ring-1 ring-primary/30 inline-flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5 text-primary" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium truncate">{c.nome}</span>
                  <span className="block text-[10px] text-amber-400/90 truncate">falta: {faltas.join(", ")}</span>
                </span>
                <ExternalLink className="h-3.5 w-3.5 text-primary opacity-70 shrink-0" />
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Linha com input + salvar pra preencher um campo de texto direto no banco.
function RowEditCampo({ cliente, edit, onSaved, onPerfil }: {
  cliente: Cliente;
  edit: { col: string; placeholder: string; type?: string; sugestoes?: { label: string; value: string }[] };
  onSaved: () => void;
  onPerfil: () => void;
}) {
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);
  const salvar = async (valor: string) => {
    const v = valor.trim();
    if (!v) { toast.error("Preencha o campo antes de salvar."); return; }
    setSaving(true);
    const { error } = await supabase.from("clientes").update({ [edit.col]: v } as any).eq("id", cliente.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${cliente.nome.split(" ")[0]} atualizado.`);
    onSaved();
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2">
      <span className="text-[13px] font-medium truncate flex-1 min-w-0" title={cliente.nome}>{cliente.nome}</span>
      <Input
        value={val}
        type={edit.type}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") salvar(val); }}
        placeholder={edit.placeholder}
        className="h-8 text-xs w-40 shrink-0"
      />
      {edit.sugestoes?.map((sug) => (
        <button
          key={sug.value}
          onClick={() => salvar(sug.value)}
          disabled={saving}
          className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20 shrink-0 disabled:opacity-40"
          title={`Preencher com ${sug.value}`}
        >
          {sug.label}
        </button>
      ))}
      <Button size="icon" className="h-8 w-8 shrink-0" disabled={saving || !val.trim()} onClick={() => salvar(val)} title="Salvar">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </Button>
      <button onClick={onPerfil} className="text-muted-foreground/60 hover:text-primary shrink-0" title="Abrir perfil">
        <ExternalLink className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Linha com botão pra criar a pasta do cliente no Drive (edge function).
function RowCriarPasta({ cliente, onSaved, onPerfil }: { cliente: Cliente; onSaved: () => void; onPerfil: () => void }) {
  const [saving, setSaving] = useState(false);
  const criar = async () => {
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("create-cliente-drive-folder", { body: { cliente_id: cliente.id } });
    setSaving(false);
    if (error || !(data as any)?.ok) { toast.error((data as any)?.error || error?.message || "Falha ao criar pasta"); return; }
    toast.success(`Pasta de ${cliente.nome.split(" ")[0]} criada.`);
    onSaved();
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2">
      <span className="text-[13px] font-medium truncate flex-1" title={cliente.nome}>{cliente.nome}</span>
      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[11px] shrink-0" disabled={saving} onClick={criar}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
        Criar pasta
      </Button>
      <button onClick={onPerfil} className="text-muted-foreground/60 hover:text-primary shrink-0" title="Abrir perfil">
        <ExternalLink className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// KPI clicável no mesmo padrão visual do dashboard principal (SpotlightCard).
function KpiSpot({ icon: Icon, label, value, hint, onClick, accent = "text-primary/60" }: {
  icon: any;
  label: string;
  value: React.ReactNode;
  hint?: string;
  onClick?: () => void;
  accent?: string;
}) {
  return (
    <SpotlightCard onClick={onClick} className={onClick ? "cursor-pointer" : undefined}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-normal font-display mt-1 tabular-nums">{value}</p>
          {hint && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{hint}</p>}
        </div>
        <Icon className={`h-8 w-8 ${accent} shrink-0`} />
      </div>
    </SpotlightCard>
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
          <ResumoRow icon={Calendar} label="Entrada" value={
            <span className="tabular-nums">{fmtDataCurta(cliente.created_at)}</span>
          } />
          {cliente.cadastrado_por && <ResumoRow icon={UserPlus} label="Cadastrou" value={cliente.cadastrado_por} />}
          <ResumoRow icon={DollarSign} label="Total ajuizado" value={
            cliente.total_ajuizado > 0
              ? <MoneyValue value={cliente.total_ajuizado} />
              : "—"
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

function SortableHead({
  label, icon: Icon, sortKey, sort, onSort, align = "left", className = "",
}: {
  label: string;
  icon?: any;
  sortKey: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (k: SortKey) => void;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  const active = sort.key === sortKey;
  const alignCls = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1.5 ${alignCls} w-full hover:text-foreground transition-colors text-left`}
      >
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        <span>{label}</span>
        {active ? (
          sort.dir === "asc"
            ? <ChevronUp className="h-3 w-3 text-foreground" />
            : <ChevronDown className="h-3 w-3 text-foreground" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 text-muted-foreground/30" />
        )}
      </button>
    </TableHead>
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
