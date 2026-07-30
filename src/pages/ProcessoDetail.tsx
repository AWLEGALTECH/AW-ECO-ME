import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseMoneyBR } from "@/lib/money";
import { PinButton } from "@/components/PinButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpotlightCard } from "@/components/SpotlightCard";
import {
  ProcessoTimeline, STATUS_PROCESSUAIS, ICONE_TIPO, LABEL_TIPO, type Etapa,
} from "@/components/ProcessoTimeline";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import {
  ArrowLeft, Save, Check, ChevronsUpDown, Copy, Pencil, History, Loader2,
  FileText, MapPin, User, SquareArrowOutUpRight, Package,
  Handshake, Activity, ListTodo, Paperclip,
} from "lucide-react";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

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

// Capas dos produtos do Writer (Bradesco). Cada processo herda a capa do
// produto correspondente à sua MATÉRIA. Como as matérias têm dezenas de
// variações e erros de digitação ("SAQUE TEMRINAL", "CAPTALIZAÇÃO"...), o
// casamento é por PALAVRA-CHAVE normalizada, não por string exata.
const CAPAS = {
  debitos: { src: "/processo-capas/debitos-automaticos.jpg", nome: "Débitos Automáticos" },
  tarifas: { src: "/processo-capas/tarifas-bancarias.jpg", nome: "Tarifas Bancárias" },
  juros: { src: "/processo-capas/juros-encargos.jpg", nome: "Juros e Encargos Indevidos" },
  prestamista: { src: "/processo-capas/seguro-prestamista.jpg", nome: "Seguro Prestamista" },
  vidaPrev: { src: "/processo-capas/vida-previdencia.jpg", nome: "Vida e Previdência" },
  capitalizacao: { src: "/processo-capas/titulo-capitalizacao.jpg", nome: "Título de Capitalização" },
  cesta: { src: "/processo-capas/cesta-servicos.jpg", nome: "Cesta de Serviços" },
  anuidade: { src: "/processo-capas/anuidade-cartao.jpg", nome: "Anuidade Cartão" },
  cartaoProtegido: { src: "/processo-capas/seguro-cartao-protegido.jpg", nome: "Seguro Cartão Protegido" },
} as const;

// Remove acentos, sobe pra maiúsculo e colapsa espaços — deixa a matéria pronta
// pra comparação por substring.
const normMateria = (m?: string | null) =>
  (m ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ") // "/", ".", "-", "+" viram espaço p/ casar rubricas
    .replace(/\s+/g, " ")
    .trim();

// Retorna a capa do produto Bradesco correspondente à matéria — ou undefined
// quando não há produto seguro pra associar (aí o processo fica sem capa).
// Ordem das regras importa: da mais específica pra mais genérica.
function capaParaMateria(materia?: string | null): { src: string; nome: string } | undefined {
  const t = normMateria(materia);
  if (!t) return undefined;
  const has = (...ks: string[]) => ks.some((k) => t.includes(k));

  if (has("CAPITALIZ", "CAPTALIZ")) return CAPAS.capitalizacao;
  if (has("PRESTAMISTA")) return CAPAS.prestamista;
  if (has("VIDA E PREVID", "PREVIDENCIA")) return CAPAS.vidaPrev;
  if (has("CARTAO PROTEGIDO", "CREDITO PROTEGIDO") || (t.includes("SEGURO") && t.includes("CARTAO")))
    return CAPAS.cartaoProtegido;
  if (has("ANUIDADE")) return CAPAS.anuidade;
  if (has("CESTA", "PACOTE")) return CAPAS.cesta;
  if (has("SAQUE TERMINAL", "SAQUE TEMRINAL", "EMISSAO EXTRATO", "EXTRATO MOVIMENTO")) return CAPAS.tarifas;
  if (has("MORA", "ENCARGO") || (t.includes("JUROS") && t.includes("ABUSIV"))) return CAPAS.juros;
  if (
    has(
      "BX ANT", "BX.ANT", "BXANT", "ANT FINAN", "ANTECIPACAO FINAN",
      "PARC CRED", "PARCELA CRED", "PARCELA DE CRED", "PARCELA CREDITO",
      "GASTOS CARTAO", "GASTOS COM CARTAO", "GASTOS DE CARTAO", "ADIANT",
    )
  )
    return CAPAS.debitos;

  return undefined;
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtData = (d: string) => {
  if (!d) return "não informado";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};
const ymdToDate = (s?: string): Date | undefined => {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
};
const dateToYmd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
  const { user } = useAuth();
  const isNew = id === "novo";

  const [form, setForm] = useState<ProcessoForm>(EMPTY);
  const [saved, setSaved] = useState<ProcessoForm>(EMPTY);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [clientePopoverOpen, setClientePopoverOpen] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(isNew);
  const [fichaOpen, setFichaOpen] = useState(isNew);
  // Etapas da timeline vivem aqui (estado elevado): alimentam o card de situação
  // e são carregadas/persistidas na coluna `linha_temporal` do banco.
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  // Snapshot do que já está salvo, pra não regravar no carregamento inicial.
  const linhaSalvaRef = useRef<string>("");
  const [fixadoGeral, setFixadoGeral] = useState(false);
  const [fixadoPessoal, setFixadoPessoal] = useState(false);

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
      const lt = Array.isArray(data.linha_temporal) ? (data.linha_temporal as Etapa[]) : [];
      const semeada = lt.map((e) => ({ ...e, tasks: e.tasks ?? [] }));
      setEtapas(semeada);
      linhaSalvaRef.current = JSON.stringify(semeada);
      setFixadoGeral(!!(data as { fixado_geral?: boolean }).fixado_geral);
      const { data: pin } = await supabase.from("processo_fixados").select("processo_id").eq("processo_id", data.id).maybeSingle();
      setFixadoPessoal(!!pin);
    }
    setLoading(false);
  }, [id, isNew]);

  const togglePinPessoal = async () => {
    if (!id || isNew) return;
    if (fixadoPessoal) {
      setFixadoPessoal(false);
      await supabase.from("processo_fixados").delete().eq("processo_id", id);
    } else {
      if (!user) { toast.error("Faça login para fixar."); return; }
      setFixadoPessoal(true);
      await supabase.from("processo_fixados").insert({ user_id: user.id, processo_id: id });
    }
  };
  const togglePinGeral = async () => {
    if (!id || isNew) return;
    const novo = !fixadoGeral;
    setFixadoGeral(novo);
    const { error } = await supabase.from("processos").update({ fixado_geral: novo }).eq("id", id);
    if (error) { toast.error("Não foi possível fixar"); setFixadoGeral(!novo); }
  };

  useEffect(() => {
    document.title = isNew ? "Novo Processo · AW ECO ME" : "Processo · AW ECO ME";
    loadClientes();
    loadProcesso();
  }, [loadClientes, loadProcesso, isNew]);

  // Persiste a linha temporal no banco sempre que as etapas mudam (tarefa nova,
  // pendência, avanço, status). Debounce curto; ignora se nada mudou vs o salvo.
  useEffect(() => {
    if (isNew || !id) return;
    const atual = JSON.stringify(etapas);
    if (atual === linhaSalvaRef.current) return;
    const t = window.setTimeout(async () => {
      const { error } = await supabase.from("processos").update({ linha_temporal: etapas }).eq("id", id);
      if (!error) linhaSalvaRef.current = atual;
    }, 800);
    return () => window.clearTimeout(t);
  }, [etapas, id, isNew]);

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

  // Edição rápida (inline) de um campo direto no card de situação, persistindo
  // só aquele campo. String vazia vira null no banco.
  const patchProcesso = async (patch: Partial<Pick<ProcessoForm, "data_ultimo_andamento" | "fase_processual">>) => {
    setForm((f) => ({ ...f, ...patch }));
    if (isNew || !id) return;
    const dbPatch: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(patch)) dbPatch[k] = v ? v : null;
    const { error } = await supabase.from("processos").update(dbPatch).eq("id", id);
    if (error) { toast.error("Não foi possível salvar a alteração"); return; }
    setSaved((s) => ({ ...s, ...patch }));
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
  const capa = capaParaMateria(form.materia);

  // ── Card de situação — dados derivados da timeline (estado elevado) ──
  const etapaAtual = etapas.find((e) => e.status === "atual");
  const statusProcValue = etapaAtual?.statusProcessual ?? form.fase_processual ?? "";
  const setStatusProc = (v: string) => {
    // mantém timeline e ficha em sincronia: atualiza a etapa atual e o campo.
    if (etapaAtual) {
      setEtapas((prev) => prev.map((e) => (e.id === etapaAtual.id ? { ...e, statusProcessual: v } : e)));
    }
    patchProcesso({ fase_processual: v });
  };
  // Dias no status atual — contados da última movimentação (não guardamos a data
  // exata em que o processo entrou no status).
  const diasNoStatus = (() => {
    const base = ymdToDate(form.data_ultimo_andamento);
    if (!base) return null;
    base.setHours(0, 0, 0, 0);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((hoje.getTime() - base.getTime()) / 86400000));
  })();
  const textoDias =
    diasNoStatus === null ? null
      : diasNoStatus === 0 ? "há menos de 1 dia"
        : diasNoStatus === 1 ? "há 1 dia" : `há ${diasNoStatus} dias`;
  const allTasks = etapas.flatMap((e) => e.tasks ?? []);
  const nTarefas = allTasks.filter((t) => t.tipo !== "pendencia" && !t.desfecho).length;
  const nPendencias = allTasks.filter((t) => t.tipo === "pendencia" && !t.desfecho).length;

  return (
    <div className="space-y-5">
      {/* ── Barra de ações ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button variant="ghost" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/processos"))} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <div className="flex items-center gap-2">
          {!isNew && (
            <PinButton
              fixadoPessoal={fixadoPessoal}
              fixadoGeral={fixadoGeral}
              onTogglePessoal={togglePinPessoal}
              onToggleGeral={togglePinGeral}
            />
          )}
          <Button variant="outline" onClick={() => setFichaOpen(true)} className="gap-2">
            <Pencil className="h-4 w-4" /> Editar
          </Button>
        </div>
      </div>

      {/* ── HERO — identidade estática do processo ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
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
            <img src={capa.src} alt={`Capa: ${capa.nome}`} className="h-full w-full object-cover" loading="lazy" />
          </div>
        )}

        <div className="relative z-10 max-w-[62%] sm:max-w-[66%]">
          {/* Nº do processo — protagonista, com balança à esquerda */}
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Nº do processo</p>
          <div className="flex items-center gap-3">
            <FileText className="h-7 w-7 md:h-8 md:w-8 text-primary shrink-0" />
            <h1 className="font-mono text-2xl md:text-[1.9rem] font-bold tracking-tight leading-tight break-words text-foreground">
              {form.numero_processo || (isNew ? "novo processo" : "sem número")}
            </h1>
            {form.numero_processo && (
              <button onClick={copiarNumero} className="text-muted-foreground/70 hover:text-primary transition-colors shrink-0" title="Copiar número">
                <Copy className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Matéria, Vara e Cliente — mesma importância */}
          <div className="mt-5 space-y-2.5">
            <div className="flex items-center gap-2 text-[15px]">
              <Package className="h-4 w-4 text-primary/70 shrink-0" />
              <span className="font-medium">{form.materia || "Matéria não informada"}</span>
            </div>
            <div className="flex items-center gap-2 text-[15px]">
              <MapPin className="h-4 w-4 text-primary/70 shrink-0" />
              <span className="font-medium">{localizacao || "Vara e comarca não informadas"}</span>
            </div>
            <div className="flex items-center gap-2 text-[15px] min-w-0">
              <User className="h-4 w-4 text-primary/70 shrink-0" />
              <span className="font-medium truncate">
                {clienteSelecionado ? clienteSelecionado.nome : <span className="text-muted-foreground">Cliente não vinculado</span>}
              </span>
              {clienteSelecionado && (
                <Link
                  to={`/clientes/${clienteSelecionado.id}`}
                  title="Abrir perfil do cliente"
                  className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                >
                  <SquareArrowOutUpRight className="h-4 w-4" />
                </Link>
              )}
            </div>

            {form.parceiro && (
              <div className="flex items-center gap-2 text-[15px] min-w-0">
                <Handshake className="h-4 w-4 text-primary/70 shrink-0" />
                <span className="font-medium truncate">Parceria com {form.parceiro}</span>
              </div>
            )}
          </div>

          {/* Valor da causa — destaque em verde, abaixo das infos */}
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor da causa</p>
            <p className="text-xl font-semibold text-emerald-400 tabular-nums mt-0.5">
              {valorNum ? brl(valorNum) : "Não informado"}
            </p>
          </div>
        </div>
      </SpotlightCard>
      </motion.div>

      {/* ── Situação atual — infos prioritárias (1 e 2 editáveis) + ícones das tarefas ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.08 }}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[13px] font-medium text-muted-foreground uppercase tracking-wider">
            Situação atual
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Última movimentação — editável (calendário) */}
            <div className="rounded-xl border border-border/50 bg-white/[0.02] p-3.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <History className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-[10px] uppercase tracking-wider">Última movimentação</span>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="mt-1.5 text-sm font-semibold tabular-nums text-left hover:text-primary transition-colors">
                    {form.data_ultimo_andamento ? fmtData(form.data_ultimo_andamento) : "definir"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    locale={ptBR}
                    selected={ymdToDate(form.data_ultimo_andamento)}
                    onSelect={(d) => patchProcesso({ data_ultimo_andamento: d ? dateToYmd(d) : "" })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* 2. Status processual — editável (segue o status da etapa atual) */}
            <div className="rounded-xl border border-border/50 bg-white/[0.02] p-3.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Activity className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-[10px] uppercase tracking-wider">Status processual</span>
              </div>
              <Select value={statusProcValue} onValueChange={setStatusProc}>
                <SelectTrigger className="mt-1 h-auto border-0 bg-transparent shadow-none px-0 py-0 text-sm font-semibold text-primary focus:ring-0 focus:ring-offset-0 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:opacity-50">
                  <SelectValue placeholder="definir" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_PROCESSUAIS.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                </SelectContent>
              </Select>
              {textoDias && (
                <p className="mt-1 text-[11px] text-muted-foreground">{textoDias} neste status</p>
              )}
            </div>

            {/* 3. Tarefas pendentes (ação + monitoramento em aberto) */}
            <div className="rounded-xl border border-border/50 bg-white/[0.02] p-3.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <ListTodo className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-[10px] uppercase tracking-wider">Tarefas pendentes</span>
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums">{nTarefas}</p>
            </div>

            {/* 4. Pendências (documentos/providências em aberto) */}
            <div className="rounded-xl border border-border/50 bg-white/[0.02] p-3.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-[10px] uppercase tracking-wider">Pendências</span>
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums">{nPendencias}</p>
            </div>
          </div>

          {/* Ícones minimizados de cada tarefa do processo */}
          {allTasks.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-3">
              {allTasks.map((t) => {
                const TaskIcon = ICONE_TIPO[t.tipo];
                return (
                  <span
                    key={t.id}
                    title={`${LABEL_TIPO[t.tipo]}: ${t.titulo}`}
                    className={cn(
                      "h-7 w-7 rounded-lg grid place-items-center ring-1 shrink-0",
                      t.desfecho ? "bg-white/[0.02] ring-white/10 opacity-50" : "bg-primary/10 ring-primary/20",
                    )}
                  >
                    <TaskIcon className={cn("h-3.5 w-3.5", t.desfecho ? "text-muted-foreground" : "text-primary")} />
                  </span>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
      </motion.div>

      {/* Movimentações & demandas — timeline (simulada neste processo) */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.16 }}>
        {etapas.length > 0 ? (
          <Card>
            <CardContent className="pt-6">
              <ProcessoTimeline etapas={etapas} setEtapas={setEtapas} />
            </CardContent>
          </Card>
        ) : (
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
        )}
      </motion.div>

      {/* ── Ficha completa do processo — ver e editar (popzão) ── */}
      <Dialog open={fichaOpen} onOpenChange={(o) => { setFichaOpen(o); if (!o && editing && !isNew) cancelarEdicao(); }}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ficha do processo</DialogTitle>
            <DialogDescription>
              {editing ? "Edite os campos e salve as alterações." : "Todos os dados do processo."}
            </DialogDescription>
          </DialogHeader>

          {!editing && (
            <div className="flex justify-end -mt-1">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
            </div>
          )}

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
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
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
                <Input value={form.parceiro} onChange={(e) => setForm({ ...form, parceiro: e.target.value })} placeholder="Nome do parceiro" />
              </Field>
              <Field label="Observações" full>
                <Textarea rows={4} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} placeholder="Anotações internas sobre o processo…" />
              </Field>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
              <Row label="Nº do Processo"><span className="font-mono">{form.numero_processo || "não informado"}</span></Row>
              <Row label="Cliente">{clienteSelecionado?.nome || "não informado"}</Row>
              <Row label="Matéria">{form.materia || "não informado"}</Row>
              <Row label="Fase Processual">{form.fase_processual || "não informado"}</Row>
              <Row label="Último Andamento">{fmtData(form.data_ultimo_andamento)}</Row>
              <Row label="Prazo Processual">{form.prazo_processual ? fmtData(form.prazo_processual) : "não informado"}</Row>
              <Row label="Tipo de Pendência">{form.tipo_pendencia || "não informado"}</Row>
              <Row label="Status da Tarefa">{form.status_tarefa || "não informado"}</Row>
              <Row label="Vara/Juízo de Origem">{form.vara_juizo_origem || "não informado"}</Row>
              <Row label="Comarca/UF">{form.comarca_uf || "não informado"}</Row>
              <Row label="Valor da Causa">{valorNum ? brl(valorNum) : "não informado"}</Row>
              <Row label="Parceiro">{form.parceiro || "não informado"}</Row>
              <Row label="Observações" full>
                <span className="whitespace-pre-wrap font-normal">{form.observacoes || "não informado"}</span>
              </Row>
            </div>
          )}

          {editing && (
            <DialogFooter>
              {!isNew && <Button variant="ghost" onClick={cancelarEdicao} disabled={saving}>Cancelar</Button>}
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
