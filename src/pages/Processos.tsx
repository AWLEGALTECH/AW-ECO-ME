import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpotlightCard } from "@/components/SpotlightCard";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, Search, Eye, Trash2, X, FileText, ListChecks, Gavel,
  Layers, ArrowRight, PauseCircle, ChevronDown, Pin, Users,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine,
  BarChart, Bar, LabelList,
} from "recharts";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { ColunaFiltro } from "@/components/ColunaFiltro";
import { PinButton } from "@/components/PinButton";
import { FAIXAS, diasSemMov, faixaDe } from "@/lib/parados";

const EASE = [0.22, 1, 0.36, 1] as const;
const MotionRow = motion(TableRow);

// Cor primária literal por paleta (Recharts precisa de hsl fixo no SVG).
const PRIMARY_HSL: Record<string, string> = {
  default: "hsl(270, 100%, 62%)",
  "midnight-blue": "hsl(222, 90%, 58%)",
  vermelho: "hsl(0, 84%, 58%)",
  "space-gray": "hsl(215, 18%, 62%)",
  sei: "hsl(270, 100%, 62%)",
};

interface Processo {
  id: string;
  numero_processo: string;
  cliente_id: string;
  materia: string | null;
  data_ultimo_andamento: string | null;
  prazo_processual: string | null;
  fase_processual: string | null;
  tipo_pendencia: string | null;
  status_tarefa: string | null;
  vara_juizo_origem: string | null;
  valor_causa: number | null;
  comarca_uf: string | null;
  parceiro: string | null;
  fixado_geral: boolean;
  clientes?: { nome: string } | null;
}

const fmtBRL = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

// Ordem de acontecimento processual (1º grau → recursal → cumprimento → estados).
const STATUS_ORDEM = [
  "AG. DISTRIBUIÇÃO", "AG. DECISÃO INICIAL", "AG. EMENDA À INICIAL",
  "AUDIÊNCIA DESIGNADA", "COMPARECR AO FÓRUM", "AG. CONTESTAÇÃO", "AG. RÉPLICA",
  "AG. DECISÃO PROVAS", "AG. MANIFESTAÇÃO", "AG. MOV CONCLUSO DECISÃO",
  "AG. MOV CONCLUSO SENTENÇA", "AG. SENTENÇA", "AG. RECURSO INOMINADO",
  "AG. CONTRARRAZOES", "AG. REMESSA AO 2º GRAU", "AG. DISTRIBUIÇÃO 2º GRAU",
  "AG. DESPACHO INICIAL 2º GRAU", "AG. MANDADO SEGURANÇA", "AG. TJ SENTENÇA",
  "AG. TJ ACÓRDÃO", "AG. ACÓRDÃO", "AG. PAGAMENTO VOLUNTÁRIO",
  "AG. EXPEDIÇÃO ALVARÁ", "AG. DECISÃO PENHORA", "AG. REAJUIZAMENTO", "REAJUIZAR",
  "SUSPENSO", "ARQUIVADO", "Inicial",
];
const ordemStatus = (s: string) => {
  const i = STATUS_ORDEM.indexOf(s);
  return i === -1 ? 999 : i;
};

// Colunas da lista (com filtro estilo Excel).
const COLS = [
  { key: "numero", label: "Nº Processo" },
  { key: "cliente", label: "Cliente" },
  { key: "materia", label: "Matéria" },
  { key: "fase", label: "Fase" },
  { key: "comarca", label: "Comarca/UF" },
  { key: "andamento", label: "Últ. Andamento" },
  { key: "valor", label: "Valor" },
] as const;
type ColKey = typeof COLS[number]["key"];

// Tooltip escuro reutilizado nos gráficos.
function ChartTip({ active, payload, label, render }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-popover/95 backdrop-blur px-2.5 py-1.5 text-xs shadow-lg">
      {render(label, payload[0].value)}
    </div>
  );
}

export default function Processos() {
  useEffect(() => { document.title = "Processos · AW ECO ME"; }, []);
  const navigate = useNavigate();
  const { palette } = useTheme();
  const { user } = useAuth();
  const primary = PRIMARY_HSL[palette] ?? PRIMARY_HSL.default;
  const [meusPins, setMeusPins] = useState<Set<string>>(new Set());
  const [searchParams, setSearchParams] = useSearchParams();
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [colFiltros, setColFiltros] = useState<Record<string, string[]>>({});
  const [statusAberto, setStatusAberto] = useState(false);

  // Filtros vindos do dashboard que não têm coluna própria.
  const filtroParceiro = searchParams.get("parceiro");
  const filtroVara = searchParams.get("vara");
  const filtroStatusTarefa = searchParams.get("status");
  const filtroPendencia = searchParams.get("pendencia");

  const fetchAll = useCallback(async () => {
    const { data } = await supabase
      .from("processos")
      .select("id, numero_processo, cliente_id, materia, data_ultimo_andamento, prazo_processual, fase_processual, tipo_pendencia, status_tarefa, vara_juizo_origem, valor_causa, comarca_uf, parceiro, fixado_geral, clientes(nome)")
      .order("data_ultimo_andamento", { ascending: false, nullsFirst: false });
    if (data) setProcessos(data as unknown as Processo[]);
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Pins pessoais do usuário (RLS já restringe aos próprios).
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("processo_fixados").select("processo_id");
      if (data) setMeusPins(new Set(data.map((d: { processo_id: string }) => d.processo_id)));
    })();
  }, []);

  const togglePinPessoal = async (id: string) => {
    if (meusPins.has(id)) {
      setMeusPins((prev) => { const n = new Set(prev); n.delete(id); return n; });
      await supabase.from("processo_fixados").delete().eq("processo_id", id);
    } else {
      if (!user) { toast.error("Faça login para fixar."); return; }
      setMeusPins((prev) => new Set(prev).add(id));
      await supabase.from("processo_fixados").insert({ user_id: user.id, processo_id: id });
    }
  };
  const togglePinGeral = async (id: string, atual: boolean) => {
    setProcessos((prev) => prev.map((p) => (p.id === id ? { ...p, fixado_geral: !atual } : p)));
    const { error } = await supabase.from("processos").update({ fixado_geral: !atual }).eq("id", id);
    if (error) { toast.error("Não foi possível fixar"); setProcessos((prev) => prev.map((p) => (p.id === id ? { ...p, fixado_geral: atual } : p))); }
  };

  // Deep-links do dashboard (fase/materia/comarca) viram filtro de coluna.
  useEffect(() => {
    const seed: Record<string, string[]> = {};
    (["fase", "materia", "comarca"] as const).forEach((k) => {
      const v = searchParams.get(k);
      if (v) seed[k] = [v];
    });
    if (Object.keys(seed).length) {
      setColFiltros((prev) => ({ ...prev, ...seed }));
      ["fase", "materia", "comarca"].forEach((k) => searchParams.delete(k));
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Valor por coluna (para filtro e distinct).
  const colVal: Record<ColKey, (p: Processo) => string> = useMemo(() => ({
    numero: (p) => p.numero_processo,
    cliente: (p) => p.clientes?.nome ?? "—",
    materia: (p) => p.materia ?? "—",
    fase: (p) => p.fase_processual ?? "—",
    comarca: (p) => p.comarca_uf ?? "—",
    andamento: (p) => fmtDate(p.data_ultimo_andamento),
    valor: (p) => fmtBRL(p.valor_causa),
  }), []);

  // Opções distintas por coluna (fase segue a ordem processual; demais alfabético).
  const opcoesCol = useMemo(() => {
    const out = {} as Record<ColKey, string[]>;
    COLS.forEach((c) => {
      const set = new Set<string>();
      processos.forEach((p) => set.add(colVal[c.key](p)));
      const arr = Array.from(set);
      arr.sort((a, b) => c.key === "fase" ? ordemStatus(a) - ordemStatus(b) : a.localeCompare(b, "pt-BR"));
      out[c.key] = arr;
    });
    return out;
  }, [processos, colVal]);

  // ── Painel (só processos EM MOVIMENTO: exclui arquivados e suspensos) ──
  const emMovimento = useMemo(
    () => processos.filter((p) => p.fase_processual !== "ARQUIVADO" && p.fase_processual !== "SUSPENSO"),
    [processos],
  );
  const nSuspensos = useMemo(() => processos.filter((p) => p.fase_processual === "SUSPENSO").length, [processos]);

  const painel = useMemo(() => {
    const buckets: Record<string, number> = { s1: 0, s2: 0, s3: 0, m1: 0, m3: 0, mais: 0, sem: 0 };
    let soma = 0, comData = 0, maisAntigo = 0;
    emMovimento.forEach((p) => {
      const dias = diasSemMov(p.data_ultimo_andamento);
      buckets[faixaDe(dias)] += 1;
      if (dias !== null) { soma += dias; comData += 1; maisAntigo = Math.max(maisAntigo, dias); }
    });
    return { buckets, media: comData ? Math.round(soma / comData) : 0, maisAntigo };
  }, [emMovimento]);

  // Curva acumulada: nº de processos com dias parados ≤ x. Eixo x vai até o máximo real.
  const curva = useMemo(() => {
    const dd = emMovimento.map((p) => diasSemMov(p.data_ultimo_andamento)).filter((d): d is number => d !== null);
    const max = Math.max(30, ...dd);
    const passo = max > 200 ? 3 : max > 90 ? 2 : 1;
    const pts: { dias: number; acum: number }[] = [];
    for (let d = 0; d <= max; d += passo) pts.push({ dias: d, acum: dd.filter((x) => x <= d).length });
    if (pts[pts.length - 1]?.dias !== max) pts.push({ dias: max, acum: dd.length });
    const ticks = [0, 7, 14, 21, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300].filter((t) => t <= max);
    if (ticks[ticks.length - 1] !== max) ticks.push(max);
    return { pts, max, ticks };
  }, [emMovimento]);

  // Distribuição por status ordenada processualmente.
  const distStatus = useMemo(() => {
    const m = new Map<string, number>();
    processos.forEach((p) => { if (p.fase_processual) m.set(p.fase_processual, (m.get(p.fase_processual) ?? 0) + 1); });
    return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => ordemStatus(a.name) - ordemStatus(b.name));
  }, [processos]);

  const setCol = (key: ColKey, vals: string[]) =>
    setColFiltros((prev) => { const n = { ...prev }; if (vals.length) n[key] = vals; else delete n[key]; return n; });

  const filtered = useMemo(() => {
    return processos.filter((p) => {
      if (filtroParceiro && p.parceiro !== filtroParceiro) return false;
      if (filtroVara && p.vara_juizo_origem !== filtroVara) return false;
      if (filtroStatusTarefa && p.status_tarefa !== filtroStatusTarefa) return false;
      if (filtroPendencia && p.tipo_pendencia !== filtroPendencia) return false;
      for (const c of COLS) {
        const sel = colFiltros[c.key];
        if (sel?.length && !sel.includes(colVal[c.key](p))) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        if (!p.numero_processo.toLowerCase().includes(s)
          && !(p.clientes?.nome ?? "").toLowerCase().includes(s)
          && !(p.materia ?? "").toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [processos, colFiltros, colVal, search, filtroParceiro, filtroVara, filtroStatusTarefa, filtroPendencia]);

  const valorTotal = useMemo(() => filtered.reduce((s, p) => s + (Number(p.valor_causa) || 0), 0), [filtered]);

  // Fixados = pin geral (todos) ou pin pessoal do usuário.
  const fixados = useMemo(() => processos.filter((p) => p.fixado_geral || meusPins.has(p.id)), [processos, meusPins]);

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("processos").delete().eq("id", deleteId);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Processo removido"); setDeleteId(null); fetchAll();
  };

  const nColFiltros = Object.values(colFiltros).filter((v) => v.length).length;
  const hasFilters = !!(nColFiltros || search || filtroParceiro || filtroVara || filtroStatusTarefa || filtroPendencia);
  const clearAllFilters = () => { setColFiltros({}); setSearch(""); setSearchParams({}); };

  const abrirParados = (k: string) => navigate(`/processos/parados/${k}`);

  return (
    <div className="space-y-5">
      {/* ── Cabeçalho ── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
        className="flex items-center justify-between flex-wrap gap-2"
      >
        <div>
          <h2 className="font-display text-3xl font-medium tracking-tight">Processos</h2>
          <p className="text-sm text-muted-foreground mt-1">Painel de controle · aba ADV</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => toast("Central de tarefas chegando: todas as tarefas e pendências de todos os processos num lugar só.")}>
            <Layers className="h-4 w-4" /> Tarefas
          </Button>
          <Button onClick={() => navigate("/processos/novo")}><Plus className="h-4 w-4 mr-2" />Novo Processo</Button>
        </div>
      </motion.div>

      {/* ── Movimentações (faixas + suspensos + curva acumulada) ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.05 }}>
        <SpotlightCard className="border-primary/20">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-primary/80">Movimentações</p>
            <p className="text-xs text-muted-foreground mt-1">Há quanto tempo cada processo em movimento está sem andamento · exclui arquivados e suspensos · clique numa faixa para abrir a lista</p>
          </div>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {FAIXAS.map((f) => (
              <button
                key={f.key}
                onClick={() => abrirParados(f.key)}
                className="group rounded-2xl border border-border/50 bg-white/[0.02] p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-white/[0.04]"
              >
                <div className="flex items-center justify-between">
                  <p className="text-3xl font-semibold font-display tabular-nums">{painel.buckets[f.key]}</p>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                </div>
                <p className="text-sm font-medium mt-1.5">{f.label}</p>
                <p className="text-[11px] text-muted-foreground leading-snug">{f.desc}</p>
              </button>
            ))}
            {/* Suspensos — métrica à parte, última posição da fileira */}
            <button
              onClick={() => abrirParados("suspensos")}
              className="group rounded-2xl border border-dashed border-border/60 bg-white/[0.01] p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40"
            >
              <div className="flex items-center justify-between">
                <p className="text-3xl font-semibold font-display tabular-nums text-muted-foreground">{nSuspensos}</p>
                <PauseCircle className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
              </div>
              <p className="text-sm font-medium mt-1.5">Suspensos</p>
              <p className="text-[11px] text-muted-foreground leading-snug">parados por decisão · fora da conta</p>
            </button>
          </div>

          {/* Curva de processos acumulados por dias parados */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>Processos acumulados por dias sem andamento</span>
              <span>mais antigo <span className="text-foreground font-medium">{painel.maisAntigo}d</span> · média <span className="text-foreground font-medium">{painel.media}d</span></span>
            </div>
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={curva.pts} margin={{ top: 6, right: 14, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="areaMov" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={primary} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  {[7, 14, 21, 30, 90].filter((d) => d <= curva.max).map((d) => (
                    <ReferenceLine key={d} x={d} stroke="currentColor" strokeOpacity={0.12} strokeDasharray="3 3" className="text-muted-foreground" />
                  ))}
                  <XAxis dataKey="dias" type="number" domain={[0, curva.max]} ticks={curva.ticks}
                    tickFormatter={(d) => `${d}d`} tick={{ fontSize: 10, fill: "currentColor" }} className="text-muted-foreground"
                    axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "currentColor" }} className="text-muted-foreground" axisLine={false} tickLine={false} width={40} allowDecimals={false} />
                  <Tooltip content={<ChartTip render={(l: number, v: number) => (<><p className="font-medium">até {l} dias parados</p><p className="text-muted-foreground">{v} processos</p></>)} />} />
                  <Area type="monotone" dataKey="acum" stroke={primary} strokeWidth={2} fill="url(#areaMov)" animationDuration={700} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {painel.buckets.sem > 0 && (
              <button onClick={() => abrirParados("sem")} className="mt-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                {painel.buckets.sem} processos sem data de andamento
              </button>
            )}
          </div>
        </SpotlightCard>
      </motion.div>

      {/* ── Distribuição por status (expansível, ordem processual) ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}>
        <Card>
          <button onClick={() => setStatusAberto((o) => !o)} className="w-full text-left">
            <CardHeader className="flex-row items-center gap-2 py-4">
              <CardTitle className="text-base flex items-center gap-2 flex-1">
                <ListChecks className="h-4 w-4 text-primary" /> Distribuição por status
              </CardTitle>
              <span className="text-xs text-muted-foreground">{distStatus.length} status · ordem processual</span>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", statusAberto && "rotate-180")} />
            </CardHeader>
          </button>
          <AnimatePresence initial={false}>
            {statusAberto && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="overflow-hidden"
              >
                <CardContent>
                  <div style={{ height: Math.max(320, distStatus.length * 26) }} className="w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={distStatus} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }} barCategoryGap={6}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={196} tick={{ fontSize: 11, fill: "currentColor" }} className="text-muted-foreground" axisLine={false} tickLine={false} interval={0} />
                        <Tooltip cursor={{ fill: "currentColor", opacity: 0.05 }} content={<ChartTip render={(l: string, v: number) => (<><p className="font-medium">{l}</p><p className="text-muted-foreground">{v} processos</p></>)} />} />
                        <Bar dataKey="value" fill={primary} radius={[0, 5, 5, 0]} maxBarSize={16} animationDuration={700}
                          onClick={(d: any) => setCol("fase", [d.name])} className="cursor-pointer">
                          <LabelList dataKey="value" position="right" className="fill-muted-foreground" style={{ fontSize: 11 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </motion.div>

      {/* ── Chips de contexto da lista ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.15 }}
        className="flex items-center gap-3 flex-wrap"
      >
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5">
          <span className="text-sm font-medium">{filtered.length}</span>
          <span className="text-sm text-muted-foreground">de {processos.length}</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5">
          <Gavel className="h-3.5 w-3.5 text-primary/70" />
          <span className="text-sm text-muted-foreground">Total causa:</span>
          <span className="text-sm font-medium">{fmtBRL(valorTotal)}</span>
        </div>
        {hasFilters && (
          <Button variant="outline" size="sm" onClick={clearAllFilters} className="gap-2">
            <X className="h-3.5 w-3.5" />Limpar filtros{nColFiltros ? ` (${nColFiltros})` : ""}
          </Button>
        )}
      </motion.div>

      {/* ── Fixados (acesso rápido) — antes da planilha geral ── */}
      {fixados.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.18 }}>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Pin className="h-4 w-4 fill-yellow-400 text-yellow-400" /> Fixados
                <span className="ml-auto text-xs font-normal text-muted-foreground">{fixados.length} de fácil acesso</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {fixados.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/processos/${p.id}`)}
                    className="group rounded-xl border border-yellow-400/20 bg-yellow-400/[0.03] p-3 cursor-pointer hover:border-yellow-400/40 hover:bg-yellow-400/[0.05] transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span className="h-10 w-10 shrink-0 rounded-full bg-primary/15 ring-1 ring-primary/30 grid place-items-center">
                        <FileText className="h-4 w-4 text-primary" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs font-medium truncate">{p.numero_processo}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.clientes?.nome ?? "—"}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {p.fase_processual && <Badge variant="secondary" className="text-[9px]">{p.fase_processual}</Badge>}
                          {p.fixado_geral && (
                            <span title="Fixado para todos" className="inline-flex items-center gap-0.5 text-[9px] text-yellow-400/80"><Users className="h-2.5 w-2.5" /> todos</span>
                          )}
                        </div>
                      </div>
                      <div onClick={(e) => e.stopPropagation()} className="shrink-0 -mr-1 -mt-1">
                        <PinButton
                          size="sm"
                          fixadoPessoal={meusPins.has(p.id)}
                          fixadoGeral={p.fixado_geral}
                          onTogglePessoal={() => togglePinPessoal(p.id)}
                          onToggleGeral={() => togglePinGeral(p.id, p.fixado_geral)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Lista de processos (filtro por coluna) ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: 0.2 }}>
      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nº, cliente ou matéria..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <span className="inline-flex items-center">Nº Processo
                    <ColunaFiltro label="Nº" options={opcoesCol.numero} selected={colFiltros.numero ?? []} onChange={(v) => setCol("numero", v)} />
                  </span>
                </TableHead>
                <TableHead>
                  <span className="inline-flex items-center">Cliente
                    <ColunaFiltro label="Cliente" options={opcoesCol.cliente} selected={colFiltros.cliente ?? []} onChange={(v) => setCol("cliente", v)} />
                  </span>
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  <span className="inline-flex items-center">Matéria
                    <ColunaFiltro label="Matéria" options={opcoesCol.materia} selected={colFiltros.materia ?? []} onChange={(v) => setCol("materia", v)} />
                  </span>
                </TableHead>
                <TableHead>
                  <span className="inline-flex items-center">Fase
                    <ColunaFiltro label="Fase" options={opcoesCol.fase} selected={colFiltros.fase ?? []} onChange={(v) => setCol("fase", v)} />
                  </span>
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  <span className="inline-flex items-center">Comarca/UF
                    <ColunaFiltro label="Comarca" options={opcoesCol.comarca} selected={colFiltros.comarca ?? []} onChange={(v) => setCol("comarca", v)} />
                  </span>
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  <span className="inline-flex items-center">Últ. Andamento
                    <ColunaFiltro label="Andamento" options={opcoesCol.andamento} selected={colFiltros.andamento ?? []} onChange={(v) => setCol("andamento", v)} />
                  </span>
                </TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center">Valor
                    <ColunaFiltro label="Valor" options={opcoesCol.valor} selected={colFiltros.valor ?? []} onChange={(v) => setCol("valor", v)} />
                  </span>
                </TableHead>
                <TableHead className="w-16">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p, i) => (
                <MotionRow
                  key={p.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 14) * 0.02 }}
                  className="cursor-pointer transition-colors hover:bg-primary/[0.05]"
                  onClick={() => navigate(`/processos/${p.id}`)}
                >
                  <TableCell className="font-mono text-xs">
                    <span className="inline-flex items-center gap-3 group">
                      <span className="h-11 w-11 shrink-0 rounded-full bg-primary/15 ring-1 ring-primary/30 inline-flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                        <FileText className="h-5 w-5 text-primary" />
                      </span>
                      {p.numero_processo}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{p.clientes?.nome ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{p.materia || "—"}</TableCell>
                  <TableCell>{p.fase_processual ? <Badge variant="secondary" className="text-[10px]">{p.fase_processual}</Badge> : "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">{p.comarca_uf || "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell text-muted-foreground">{fmtDate(p.data_ultimo_andamento)}</TableCell>
                  <TableCell className="text-right">{fmtBRL(p.valor_causa)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <PinButton
                        size="sm"
                        fixadoPessoal={meusPins.has(p.id)}
                        fixadoGeral={p.fixado_geral}
                        onTogglePessoal={() => togglePinPessoal(p.id)}
                        onToggleGeral={() => togglePinGeral(p.id, p.fixado_geral)}
                      />
                      <Button size="icon" variant="ghost" onClick={() => navigate(`/processos/${p.id}`)}><Eye className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </MotionRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum processo encontrado.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      </motion.div>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
