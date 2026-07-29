import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { parseMoneyBR } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpotlightCard } from "@/components/SpotlightCard";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import {
  ArrowLeft, Save, Check, ChevronsUpDown, Hash, Copy, Gavel, MapPin, User,
  Layers, DollarSign, CalendarClock, CalendarCheck, ListChecks, Handshake,
  ClipboardList, FileText, Scale, ExternalLink, History, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ProcessoForm {
  id?: string;
  numero_processo: string;
  cliente_id: string;
  materia: string;
  data_ultimo_andamento: string;
  prazo_processual: string;
  fase_processual: string;
  tipo_pendencia: string;
  status_tarefa: string;
  vara_juizo_origem: string;
  observacoes: string;
  valor_causa: string;
  comarca_uf: string;
  parceiro: string;
}

interface ClienteOption { id: string; nome: string }

const EMPTY: ProcessoForm = {
  numero_processo: "",
  cliente_id: "",
  materia: "",
  data_ultimo_andamento: "",
  prazo_processual: "",
  fase_processual: "",
  tipo_pendencia: "",
  status_tarefa: "",
  vara_juizo_origem: "",
  observacoes: "",
  valor_causa: "",
  comarca_uf: "",
  parceiro: "",
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d: string) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

// Cor + rótulo auxiliar pra urgência do prazo processual.
function prazoInfo(prazo: string): { texto: string; cls: string; sub: string | null } {
  if (!prazo) return { texto: "Sem prazo", cls: "text-muted-foreground", sub: null };
  const [y, m, d] = prazo.split("-").map(Number);
  const alvo = new Date(y, m - 1, d);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
  const texto = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  if (dias < 0) return { texto, cls: "text-red-400", sub: `vencido há ${Math.abs(dias)}d` };
  if (dias === 0) return { texto, cls: "text-red-400", sub: "vence hoje" };
  if (dias <= 7) return { texto, cls: "text-amber-400", sub: `faltam ${dias}d` };
  return { texto, cls: "text-foreground", sub: `faltam ${dias}d` };
}

/* Fato do hero: ícone + rótulo + valor. */
function Fact({ icon: Icon, label, children, valueClass, sub }: {
  icon: any; label: string; children: React.ReactNode; valueClass?: string; sub?: string | null;
}) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <div className="mt-0.5 h-8 w-8 rounded-lg bg-primary/10 grid place-items-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("text-sm font-medium truncate leading-tight mt-0.5", valueClass)} title={typeof children === "string" ? children : undefined}>
          {children}
        </p>
        {sub && <p className="text-[10px] text-muted-foreground/80 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* Seção editável: card com cabeçalho de ícone. */
function Section({ icon: Icon, title, children, className }: {
  icon: any; title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-[12px] font-medium flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className={className ?? "grid grid-cols-1 md:grid-cols-2 gap-4"}>
        {children}
      </CardContent>
    </Card>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export default function ProcessoDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === "novo";

  const [form, setForm] = useState<ProcessoForm>(EMPTY);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [clientePopoverOpen, setClientePopoverOpen] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const loadClientes = useCallback(async () => {
    const { data } = await supabase.from("clientes").select("id, nome").order("nome");
    if (data) setClientes(data);
  }, []);

  const loadProcesso = useCallback(async () => {
    if (isNew || !id) return;
    const { data } = await supabase.from("processos").select("*").eq("id", id).single();
    if (data) {
      setForm({
        id: data.id,
        numero_processo: data.numero_processo ?? "",
        cliente_id: data.cliente_id,
        materia: data.materia ?? "",
        data_ultimo_andamento: data.data_ultimo_andamento ?? "",
        prazo_processual: data.prazo_processual ?? "",
        fase_processual: data.fase_processual ?? "",
        tipo_pendencia: data.tipo_pendencia ?? "",
        status_tarefa: data.status_tarefa ?? "",
        vara_juizo_origem: data.vara_juizo_origem ?? "",
        observacoes: data.observacoes ?? "",
        valor_causa: data.valor_causa != null ? String(data.valor_causa) : "",
        comarca_uf: data.comarca_uf ?? "",
        parceiro: data.parceiro ?? "",
      });
    }
    setLoading(false);
  }, [id, isNew]);

  useEffect(() => {
    document.title = isNew ? "Novo Processo · AW ECO ME" : "Processo · AW ECO ME";
    loadClientes();
    loadProcesso();
  }, [loadClientes, loadProcesso, isNew]);

  const handleSave = async () => {
    if (!form.numero_processo.trim()) { toast.error("Número do processo é obrigatório"); return; }
    if (!form.cliente_id) { toast.error("Cliente é obrigatório"); return; }
    setSaving(true);
    const payload = {
      numero_processo: form.numero_processo.trim(),
      cliente_id: form.cliente_id,
      materia: form.materia.trim() || null,
      data_ultimo_andamento: form.data_ultimo_andamento || null,
      prazo_processual: form.prazo_processual || null,
      fase_processual: form.fase_processual.trim() || null,
      tipo_pendencia: form.tipo_pendencia.trim() || null,
      status_tarefa: form.status_tarefa.trim() || null,
      vara_juizo_origem: form.vara_juizo_origem.trim() || null,
      observacoes: form.observacoes.trim() || null,
      valor_causa: form.valor_causa ? parseMoneyBR(form.valor_causa) : null,
      comarca_uf: form.comarca_uf.trim() || null,
      parceiro: form.parceiro.trim() || null,
    };

    let error: unknown;
    if (isNew) {
      const res = await supabase.from("processos").insert(payload).select("id").single();
      error = res.error;
      if (!error && res.data) { setSaving(false); toast.success("Processo criado"); navigate(`/processos/${res.data.id}`); return; }
    } else {
      const res = await supabase.from("processos").update(payload).eq("id", id!);
      error = res.error;
    }
    setSaving(false);
    if (error) {
      const code = (error as { code?: string }).code;
      toast.error(code === "23505" ? "Número de processo já cadastrado" : "Erro ao salvar");
      return;
    }
    toast.success("Processo atualizado");
  };

  const copiarNumero = async () => {
    if (!form.numero_processo) return;
    try {
      await navigator.clipboard.writeText(form.numero_processo);
      toast.success("Número copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-16 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  const clienteSelecionado = clientes.find((c) => c.id === form.cliente_id);
  const prazo = prazoInfo(form.prazo_processual);
  const valorNum = form.valor_causa ? parseMoneyBR(form.valor_causa) : 0;

  return (
    <div className="space-y-5">
      {/* ── Barra de ações ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" onClick={() => navigate("/processos")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </div>

      {/* ── HERO ── */}
      <SpotlightCard className="!p-0 overflow-hidden">
        <div className="p-6 md:p-7">
          {/* Nº do processo (Projudi) */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono text-muted-foreground tracking-tight">
              {form.numero_processo || (isNew ? "novo processo" : "—")}
            </span>
            {form.numero_processo && (
              <button onClick={copiarNumero} className="text-muted-foreground/70 hover:text-primary transition-colors" title="Copiar número">
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Matéria — protagonista */}
          <div className="flex items-start gap-3 mt-4">
            <div className="mt-1.5 h-9 w-1 rounded-full bg-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-primary/80 mb-1 flex items-center gap-1.5">
                <Scale className="h-3.5 w-3.5" /> Matéria
              </p>
              <h1 className="font-display text-2xl md:text-[1.9rem] font-semibold tracking-tight leading-tight break-words">
                {form.materia || <span className="text-muted-foreground font-normal">Matéria não informada</span>}
              </h1>
            </div>
          </div>

          {/* Vara · Comarca */}
          <div className="flex items-center gap-x-5 gap-y-1.5 flex-wrap mt-3.5 text-sm text-muted-foreground pl-4">
            <span className="inline-flex items-center gap-1.5">
              <Gavel className="h-4 w-4 text-primary/70" /> {form.vara_juizo_origem || "Vara não informada"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-primary/70" /> {form.comarca_uf || "Comarca não informada"}
            </span>
          </div>

          {/* Cliente */}
          <div className="flex items-center gap-3 mt-5 pl-4">
            <div className="h-10 w-10 rounded-full bg-primary/15 grid place-items-center shrink-0">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cliente</p>
              <p className="text-[15px] font-medium truncate leading-tight">
                {clienteSelecionado ? clienteSelecionado.nome : <span className="text-muted-foreground font-normal">Não vinculado</span>}
              </p>
            </div>
            {clienteSelecionado && (
              <Link to={`/clientes/${clienteSelecionado.id}`} className="ml-auto text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0">
                Ver cliente <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>

        {/* Faixa de fatos */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4 px-6 md:px-7 py-5 border-t border-white/[0.06] bg-white/[0.02]">
          <Fact icon={Layers} label="Fase processual">
            {form.fase_processual || "—"}
          </Fact>
          <Fact icon={DollarSign} label="Valor da causa" valueClass={valorNum ? "text-emerald-300" : ""}>
            {valorNum ? brl(valorNum) : "—"}
          </Fact>
          <Fact icon={ListChecks} label="Status da tarefa">
            {form.status_tarefa || "—"}
          </Fact>
          <Fact icon={CalendarClock} label="Último andamento">
            {fmtData(form.data_ultimo_andamento)}
          </Fact>
          <Fact icon={CalendarCheck} label="Prazo processual" valueClass={prazo.cls} sub={prazo.sub}>
            {prazo.texto}
          </Fact>
          <Fact icon={Handshake} label="Parceiro">
            {form.parceiro || "—"}
          </Fact>
        </div>
      </SpotlightCard>

      {/* ── FORMULÁRIO ── */}
      <Section icon={Hash} title="Identificação">
        <Field label="Nº do Processo *">
          <Input value={form.numero_processo} onChange={(e) => setForm({ ...form, numero_processo: e.target.value })} placeholder="0000000-00.0000.0.00.0000" className="font-mono" />
        </Field>
        <Field label="Cliente *">
          <Popover open={clientePopoverOpen} onOpenChange={setClientePopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                {clienteSelecionado ? clienteSelecionado.nome : "Selecionar cliente..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0">
              <Command>
                <CommandInput placeholder="Buscar cliente..." />
                <CommandList>
                  <CommandEmpty>Nenhum cliente.</CommandEmpty>
                  <CommandGroup>
                    {clientes.map((c) => (
                      <CommandItem key={c.id} value={c.nome} onSelect={() => { setForm({ ...form, cliente_id: c.id }); setClientePopoverOpen(false); }}>
                        <Check className={cn("mr-2 h-4 w-4", form.cliente_id === c.id ? "opacity-100" : "opacity-0")} />
                        {c.nome}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </Field>
      </Section>

      <Section icon={Layers} title="Classificação">
        <Field label="Matéria">
          <Input value={form.materia} onChange={(e) => setForm({ ...form, materia: e.target.value })} placeholder="RCC, CESTA, RMC..." />
        </Field>
        <Field label="Fase Processual">
          <Input value={form.fase_processual} onChange={(e) => setForm({ ...form, fase_processual: e.target.value })} placeholder="AG. SENTENÇA, ARQUIVADO..." />
        </Field>
      </Section>

      <Section icon={CalendarClock} title="Andamento & Prazos">
        <Field label="Data Último Andamento">
          <Input type="date" value={form.data_ultimo_andamento} onChange={(e) => setForm({ ...form, data_ultimo_andamento: e.target.value })} />
        </Field>
        <Field label="Prazo Processual">
          <Input type="date" value={form.prazo_processual} onChange={(e) => setForm({ ...form, prazo_processual: e.target.value })} />
        </Field>
        <Field label="Tipo de Pendência">
          <Input value={form.tipo_pendencia} onChange={(e) => setForm({ ...form, tipo_pendencia: e.target.value })} placeholder="Ex.: contestação, réplica..." />
        </Field>
        <Field label="Status da Tarefa">
          <Select value={form.status_tarefa || "__none__"} onValueChange={(v) => setForm({ ...form, status_tarefa: v === "__none__" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">—</SelectItem>
              <SelectItem value="EM CONFECÇÃO">EM CONFECÇÃO</SelectItem>
              <SelectItem value="CONCLUÍDO">CONCLUÍDO</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section icon={MapPin} title="Localização">
        <Field label="Vara/Juízo de Origem">
          <Input value={form.vara_juizo_origem} onChange={(e) => setForm({ ...form, vara_juizo_origem: e.target.value })} placeholder="3ª VC" />
        </Field>
        <Field label="Comarca/UF">
          <Input value={form.comarca_uf} onChange={(e) => setForm({ ...form, comarca_uf: e.target.value })} placeholder="MANAUS/AM" />
        </Field>
      </Section>

      <Section icon={DollarSign} title="Financeiro & Parceria">
        <Field label="Valor da Causa (R$)">
          <Input inputMode="decimal" value={form.valor_causa} onChange={(e) => setForm({ ...form, valor_causa: e.target.value })} placeholder="0,00" />
        </Field>
        <Field label="Parceiro">
          <Input value={form.parceiro} onChange={(e) => setForm({ ...form, parceiro: e.target.value })} />
        </Field>
      </Section>

      <Section icon={FileText} title="Observações" className="">
        <Textarea rows={4} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} placeholder="Anotações internas sobre o processo…" />
      </Section>

      {/* Prévia da próxima leva — movimentações & demandas */}
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 py-5 text-muted-foreground">
          <div className="h-9 w-9 rounded-lg bg-primary/10 grid place-items-center shrink-0">
            <History className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Movimentações & demandas</p>
            <p className="text-xs">Linha do tempo dos andamentos e das demandas do processo — chegando na próxima atualização.</p>
          </div>
          <span className="ml-auto text-[10px] uppercase tracking-wider bg-primary/10 text-primary rounded-full px-2 py-1 shrink-0">Em breve</span>
        </CardContent>
      </Card>
    </div>
  );
}
