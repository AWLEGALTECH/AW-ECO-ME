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
  ArrowLeft, Save, Check, ChevronsUpDown, Copy, Pencil, History, Loader2,
  Scale, MapPin, Link2,
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

// TESTE PRELIMINAR — capa do produto do Writer só neste processo, pra avaliar
// a ideia antes de aplicar por matéria em todos. A matéria
// "BX ANT FINAN/PARC CRED/GASTOS CARTÃO" casa com o produto "Débitos
// Automáticos" (rubricas GASTOS CARTÃO / PARCELA CRÉDITO / BX.ANT.FINANC).
const CAPA_TESTE: Record<string, { src: string; nome: string }> = {
  "628eb627-377b-448e-b003-339e497bef44": {
    src: "/processo-capas/debitos-automaticos.jpg",
    nome: "Débitos Automáticos",
  },
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d: string) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

/* Linha da tabela read-only (rótulo → valor). */
function Row({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn("flex items-start justify-between gap-6 py-2.5 border-b border-border/40", full && "md:col-span-2")}>
      <span className="text-xs text-muted-foreground shrink-0 pt-0.5">{label}</span>
      <span className="text-sm font-medium text-right min-w-0 break-words">{children}</span>
    </div>
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
  const [saved, setSaved] = useState<ProcessoForm>(EMPTY);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [clientePopoverOpen, setClientePopoverOpen] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(isNew);

  const loadClientes = useCallback(async () => {
    const { data } = await supabase.from("clientes").select("id, nome").order("nome");
    if (data) setClientes(data);
  }, []);

  const loadProcesso = useCallback(async () => {
    if (isNew || !id) return;
    const { data } = await supabase.from("processos").select("*").eq("id", id).single();
    if (data) {
      const f: ProcessoForm = {
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
      };
      setForm(f);
      setSaved(f);
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
    setSaved(form);
    setEditing(false);
  };

  const cancelarEdicao = () => {
    setForm(saved);
    setEditing(false);
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
  const valorNum = form.valor_causa ? parseMoneyBR(form.valor_causa) : 0;
  const localizacao = [form.vara_juizo_origem, form.comarca_uf].filter(Boolean).join(" · ");
  const capa = id ? CAPA_TESTE[id] : undefined;

  return (
    <div className="space-y-5">
      {/* ── Barra de ações ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" onClick={() => navigate("/processos")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        {editing ? (
          <div className="flex items-center gap-2">
            {!isNew && (
              <Button variant="ghost" onClick={cancelarEdicao} disabled={saving}>Cancelar</Button>
            )}
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setEditing(true)} className="gap-2">
            <Pencil className="h-4 w-4" /> Editar
          </Button>
        )}
      </div>

      {/* ── HERO — identidade estática do processo ── */}
      <SpotlightCard className="relative overflow-hidden">
        {/* Capa do produto (teste, só neste processo) — sangra até a borda do
            card e derrete num degradê na esquerda, sem corte seco. */}
        {capa && (
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-[54%] sm:w-[46%]"
            style={{
              WebkitMaskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.85) 55%, #000 100%)",
              maskImage: "linear-gradient(to right, transparent 0%, rgba(0,0,0,0.85) 55%, #000 100%)",
            }}
          >
            <img src={capa.src} alt={`Capa — ${capa.nome}`} className="h-full w-full object-cover" loading="lazy" />
          </div>
        )}

        <div className="relative z-10 max-w-[62%] sm:max-w-[66%]">
          {/* Nº do processo */}
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-muted-foreground tracking-tight">
              {form.numero_processo || (isNew ? "novo processo" : "—")}
            </span>
            {form.numero_processo && (
              <button onClick={copiarNumero} className="text-muted-foreground/60 hover:text-primary transition-colors" title="Copiar número">
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Matéria — protagonista, com balança à esquerda */}
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-4 mb-1.5">Matéria</p>
          <div className="flex items-center gap-3">
            <Scale className="h-7 w-7 md:h-8 md:w-8 text-primary shrink-0" />
            <h1 className="font-display text-2xl md:text-[1.9rem] font-semibold tracking-tight leading-tight break-words">
              {form.materia || <span className="text-muted-foreground font-normal">Matéria não informada</span>}
            </h1>
          </div>

          {/* Vara e Cliente — mesma importância */}
          <div className="mt-5 space-y-2.5">
            <div className="flex items-center gap-2 text-[15px]">
              <MapPin className="h-4 w-4 text-primary/70 shrink-0" />
              <span className="font-medium">{localizacao || "Vara e comarca não informadas"}</span>
            </div>
            <div className="flex items-center gap-2 text-[15px]">
              <Link2 className="h-4 w-4 text-primary/70 shrink-0" />
              {clienteSelecionado ? (
                <Link
                  to={`/clientes/${clienteSelecionado.id}`}
                  className="font-medium text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors"
                >
                  {clienteSelecionado.nome}
                </Link>
              ) : (
                <span className="font-medium text-muted-foreground">Cliente não vinculado</span>
              )}
            </div>
          </div>
        </div>
      </SpotlightCard>

      {/* ── Informações do processo — tabela read-only / edição via lápis ── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
          <CardTitle className="text-[13px] font-medium text-muted-foreground uppercase tracking-wider">
            Informações do processo
          </CardTitle>
          {!editing && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="gap-1.5 h-8 text-muted-foreground hover:text-foreground">
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
          )}
        </CardHeader>

        <CardContent>
          {editing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <Field label="Matéria">
                <Input value={form.materia} onChange={(e) => setForm({ ...form, materia: e.target.value })} placeholder="RCC, CESTA, RMC..." />
              </Field>
              <Field label="Fase Processual">
                <Input value={form.fase_processual} onChange={(e) => setForm({ ...form, fase_processual: e.target.value })} placeholder="AG. SENTENÇA, ARQUIVADO..." />
              </Field>
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
              <Field label="Vara/Juízo de Origem">
                <Input value={form.vara_juizo_origem} onChange={(e) => setForm({ ...form, vara_juizo_origem: e.target.value })} placeholder="3ª VC" />
              </Field>
              <Field label="Comarca/UF">
                <Input value={form.comarca_uf} onChange={(e) => setForm({ ...form, comarca_uf: e.target.value })} placeholder="MANAUS/AM" />
              </Field>
              <Field label="Valor da Causa (R$)">
                <Input inputMode="decimal" value={form.valor_causa} onChange={(e) => setForm({ ...form, valor_causa: e.target.value })} placeholder="0,00" />
              </Field>
              <Field label="Parceiro">
                <Input value={form.parceiro} onChange={(e) => setForm({ ...form, parceiro: e.target.value })} />
              </Field>
              <Field label="Observações" full>
                <Textarea rows={4} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} placeholder="Anotações internas sobre o processo…" />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
              <Row label="Nº do Processo"><span className="font-mono">{form.numero_processo || "—"}</span></Row>
              <Row label="Cliente">{clienteSelecionado?.nome || "—"}</Row>
              <Row label="Matéria">{form.materia || "—"}</Row>
              <Row label="Fase Processual">{form.fase_processual || "—"}</Row>
              <Row label="Último Andamento">{fmtData(form.data_ultimo_andamento)}</Row>
              <Row label="Prazo Processual">{form.prazo_processual ? fmtData(form.prazo_processual) : "—"}</Row>
              <Row label="Tipo de Pendência">{form.tipo_pendencia || "—"}</Row>
              <Row label="Status da Tarefa">{form.status_tarefa || "—"}</Row>
              <Row label="Vara/Juízo de Origem">{form.vara_juizo_origem || "—"}</Row>
              <Row label="Comarca/UF">{form.comarca_uf || "—"}</Row>
              <Row label="Valor da Causa">{valorNum ? brl(valorNum) : "—"}</Row>
              <Row label="Parceiro">{form.parceiro || "—"}</Row>
              <Row label="Observações" full>
                <span className="whitespace-pre-wrap font-normal">{form.observacoes || "—"}</span>
              </Row>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prévia da próxima leva — informações móveis (movimentações & demandas) */}
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 py-5 text-muted-foreground">
          <div className="h-9 w-9 rounded-lg bg-primary/10 grid place-items-center shrink-0">
            <History className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Movimentações & demandas</p>
            <p className="text-xs">As informações móveis do processo (andamentos, prazos e demandas) chegam na próxima atualização.</p>
          </div>
          <span className="ml-auto text-[10px] uppercase tracking-wider bg-primary/10 text-primary rounded-full px-2 py-1 shrink-0">Em breve</span>
        </CardContent>
      </Card>
    </div>
  );
}
