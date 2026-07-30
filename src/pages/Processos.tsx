import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, Search, Eye, Trash2, X, FileText, Activity, ListChecks, Gavel,
  PlayCircle, PauseCircle, CalendarClock, AlertCircle, Layers,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";

// Easing suave (ease-out-expo-ish) reutilizado nas transições.
const EASE = [0.22, 1, 0.36, 1] as const;
const MotionRow = motion(TableRow);

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
  clientes?: { nome: string } | null;
}

const fmtBRL = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtBRLcompact = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

// Contagem por chave (ignora nulos), ordenada desc — igual ao dashboard.
function countBy(items: Processo[], key: (p: Processo) => string | null | undefined) {
  const m = new Map<string, number>();
  items.forEach((it) => {
    const k = key(it);
    if (!k) return;
    m.set(k, (m.get(k) ?? 0) + 1);
  });
  return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

// Lista de barras (share%), clicável — mesma linguagem do dashboard.
function BarList({
  data, total, onItemClick, max = 12, emptyMessage = "Sem dados.",
}: {
  data: { name: string; value: number }[];
  total: number;
  onItemClick?: (name: string) => void;
  max?: number;
  emptyMessage?: string;
}) {
  const items = data.slice(0, max);
  const peak = items[0]?.value ?? 1;
  if (!items.length) return <p className="text-sm text-muted-foreground text-center py-4">{emptyMessage}</p>;
  return (
    <div className="space-y-1.5">
      {items.map((it) => {
        const pct = (it.value / peak) * 100;
        const sharePct = total > 0 ? ((it.value / total) * 100).toFixed(0) : "0";
        return (
          <div
            key={it.name}
            className={`group relative overflow-hidden rounded-md px-2.5 py-1.5 ${onItemClick ? "cursor-pointer hover:bg-white/[0.04]" : ""}`}
            onClick={() => onItemClick?.(it.name)}
          >
            <div className="absolute inset-y-0 left-0 bg-primary/15 transition-all" style={{ width: `${pct}%` }} />
            <div className="relative flex items-center justify-between gap-3">
              <span className="text-sm truncate" title={it.name}>{it.name}</span>
              <span className="text-xs font-mono text-muted-foreground tabular-nums shrink-0">
                {it.value} <span className="opacity-60">({sharePct}%)</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// KPI compacto (rótulo + número + ícone).
function MiniKpi({ label, value, icon, onClick }: { label: string; value: ReactNode; icon: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`flex items-center justify-between gap-2 rounded-xl border border-border/50 bg-white/[0.02] p-3 text-left ${onClick ? "hover:border-primary/40 hover:bg-white/[0.04] transition-colors" : ""}`}
    >
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-semibold font-display mt-0.5">{value}</p>
      </div>
      <span className="text-primary/60 shrink-0">{icon}</span>
    </button>
  );
}

// ── Buckets de "parado" (dias desde o último andamento) ──
type ParadoKey = "em_dia" | "atencao" | "parado" | "critico" | "sem";
const PARADO_INFO: Record<Exclude<ParadoKey, "sem">, { label: string; hint: string; num: string; ring: string }> = {
  em_dia:  { label: "Em dia",   hint: "até 30 dias",  num: "text-emerald-400", ring: "ring-emerald-500/40 bg-emerald-500/[0.06]" },
  atencao: { label: "Atenção",  hint: "31 a 60 dias", num: "text-sky-400",     ring: "ring-sky-500/40 bg-sky-500/[0.06]" },
  parado:  { label: "Parado",   hint: "61 a 90 dias", num: "text-amber-400",   ring: "ring-amber-500/40 bg-amber-500/[0.06]" },
  critico: { label: "Crítico",  hint: "mais de 90 dias", num: "text-red-400",  ring: "ring-red-500/40 bg-red-500/[0.06]" },
};

export default function Processos() {
  useEffect(() => { document.title = "Processos · AW ECO ME"; }, []);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtroFase = searchParams.get("fase");
  const filtroMateria = searchParams.get("materia");
  const filtroParceiro = searchParams.get("parceiro");
  const filtroComarca = searchParams.get("comarca");
  const filtroVara = searchParams.get("vara");
  const filtroStatus = searchParams.get("status");
  const filtroPendencia = searchParams.get("pendencia");
  const filtroParado = searchParams.get("parado") as ParadoKey | null;

  const fetchAll = useCallback(async () => {
    const { data } = await supabase
      .from("processos")
      .select("id, numero_processo, cliente_id, materia, data_ultimo_andamento, prazo_processual, fase_processual, tipo_pendencia, status_tarefa, vara_juizo_origem, valor_causa, comarca_uf, parceiro, clientes(nome)")
      .order("data_ultimo_andamento", { ascending: false, nullsFirst: false });
    if (data) setProcessos(data as unknown as Processo[]);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Hoje (00:00) pra medir dias sem movimentação.
  const hojeMs = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, []);
  const diasDesde = useCallback((d: string | null): number | null => {
    if (!d) return null;
    const t = new Date(`${d}T00:00:00`).getTime();
    if (Number.isNaN(t)) return null;
    return Math.max(0, Math.floor((hojeMs - t) / 86400000));
  }, [hojeMs]);
  const bucketParado = useCallback((dias: number | null): ParadoKey => {
    if (dias === null) return "sem";
    if (dias <= 30) return "em_dia";
    if (dias <= 60) return "atencao";
    if (dias <= 90) return "parado";
    return "critico";
  }, []);

  const fasesUnicas = useMemo(() => {
    const set = new Set<string>();
    processos.forEach((p) => p.fase_processual && set.add(p.fase_processual));
    return Array.from(set).sort();
  }, [processos]);
  const materiasUnicas = useMemo(() => {
    const set = new Set<string>();
    processos.forEach((p) => p.materia && set.add(p.materia));
    return Array.from(set).sort();
  }, [processos]);
  const parceirosUnicos = useMemo(() => {
    const set = new Set<string>();
    processos.forEach((p) => p.parceiro && set.add(p.parceiro));
    return Array.from(set).sort();
  }, [processos]);

  // ── Painel (visão geral, sobre TODOS os processos) ──
  const painel = useMemo(() => {
    const total = processos.length;
    const ativosNaoArq = processos.filter((p) => p.fase_processual !== "ARQUIVADO");
    const suspensos = processos.filter((p) => p.fase_processual === "SUSPENSO").length;
    const arquivados = processos.filter((p) => p.fase_processual === "ARQUIVADO").length;
    const emAndamento = total - suspensos - arquivados;
    const valorAjuizado = ativosNaoArq.reduce((s, p) => s + (Number(p.valor_causa) || 0), 0);
    const comPendencia = processos.filter((p) => p.tipo_pendencia && p.tipo_pendencia.trim() !== "").length;

    const hojeStr = new Date(hojeMs).toISOString().slice(0, 10);
    const em30 = new Date(hojeMs + 30 * 86400000).toISOString().slice(0, 10);
    const prazosProximos = ativosNaoArq.filter((p) => p.prazo_processual && p.prazo_processual >= hojeStr && p.prazo_processual <= em30).length;

    // Movimentações: buckets de dias parados (só ativos/não arquivados).
    const buckets: Record<ParadoKey, number> = { em_dia: 0, atencao: 0, parado: 0, critico: 0, sem: 0 };
    let somaDias = 0, comData = 0, maisAntigo = 0;
    ativosNaoArq.forEach((p) => {
      const dias = diasDesde(p.data_ultimo_andamento);
      buckets[bucketParado(dias)] += 1;
      if (dias !== null) { somaDias += dias; comData += 1; maisAntigo = Math.max(maisAntigo, dias); }
    });
    const mediaDias = comData ? Math.round(somaDias / comData) : 0;

    return { total, suspensos, arquivados, emAndamento, valorAjuizado, comPendencia, prazosProximos, buckets, mediaDias, maisAntigo, ativos: ativosNaoArq.length };
  }, [processos, hojeMs, diasDesde, bucketParado]);

  const distFase = useMemo(() => countBy(processos, (p) => p.fase_processual), [processos]);

  const filtered = useMemo(() => {
    const out = processos.filter((p) => {
      if (filtroFase && p.fase_processual !== filtroFase) return false;
      if (filtroMateria && p.materia !== filtroMateria) return false;
      if (filtroParceiro && p.parceiro !== filtroParceiro) return false;
      if (filtroComarca && p.comarca_uf !== filtroComarca) return false;
      if (filtroVara && p.vara_juizo_origem !== filtroVara) return false;
      if (filtroStatus && p.status_tarefa !== filtroStatus) return false;
      if (filtroPendencia && p.tipo_pendencia !== filtroPendencia) return false;
      if (filtroParado) {
        if (p.fase_processual === "ARQUIVADO") return false; // parado só entre ativos
        if (bucketParado(diasDesde(p.data_ultimo_andamento)) !== filtroParado) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        const inNumero = p.numero_processo.toLowerCase().includes(s);
        const inCliente = (p.clientes?.nome ?? "").toLowerCase().includes(s);
        const inMateria = (p.materia ?? "").toLowerCase().includes(s);
        if (!inNumero && !inCliente && !inMateria) return false;
      }
      return true;
    });
    // Ao filtrar por "parado", mostra os mais parados primeiro (andamento mais antigo).
    if (filtroParado) {
      out.sort((a, b) => (a.data_ultimo_andamento ?? "0").localeCompare(b.data_ultimo_andamento ?? "0"));
    }
    return out;
  }, [processos, filtroFase, filtroMateria, filtroParceiro, filtroComarca, filtroVara, filtroStatus, filtroPendencia, filtroParado, search, bucketParado, diasDesde]);

  const valorTotal = useMemo(() =>
    filtered.reduce((sum, p) => sum + (Number(p.valor_causa) || 0), 0), [filtered]);

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("processos").delete().eq("id", deleteId);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Processo removido"); setDeleteId(null); fetchAll();
  };

  const setFilter = (key: string, value: string | null) => {
    if (value && value !== "__all__") searchParams.set(key, value);
    else searchParams.delete(key);
    setSearchParams(searchParams);
  };
  const toggleParado = (key: ParadoKey) => setFilter("parado", filtroParado === key ? null : key);

  const clearAllFilters = () => { setSearchParams({}); setSearch(""); };
  const hasFilters = !!(filtroFase || filtroMateria || filtroParceiro || filtroComarca || filtroVara || filtroStatus || filtroPendencia || filtroParado || search);

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
          <Button variant="outline" className="gap-2" onClick={() => toast("Central de tarefas chegando: aqui você verá todas as tarefas e pendências de todos os processos agrupadas num lugar só.")}>
            <Layers className="h-4 w-4" /> Tarefas
          </Button>
          <Button onClick={() => navigate("/processos/novo")}><Plus className="h-4 w-4 mr-2" />Novo Processo</Button>
        </div>
      </motion.div>

      {/* ── Movimentações — o que está parado (protagonista) ── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.05 }}>
        <SpotlightCard className="border-primary/20">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.16em] text-primary/80">Movimentações</p>
              <p className="text-xs text-muted-foreground mt-1">Dias desde o último andamento · {painel.ativos} processos ativos (exclui arquivados)</p>
            </div>
            <span className="hidden sm:flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20 shrink-0">
              <Activity className="h-6 w-6 text-primary" />
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(["em_dia", "atencao", "parado", "critico"] as const).map((k) => {
              const info = PARADO_INFO[k];
              const ativo = filtroParado === k;
              return (
                <button
                  key={k}
                  onClick={() => toggleParado(k)}
                  className={`rounded-xl border p-3.5 text-left transition-all hover:-translate-y-0.5 ${ativo ? `ring-1 ${info.ring} border-transparent` : "border-border/50 bg-white/[0.02] hover:border-primary/30"}`}
                >
                  <p className={`text-3xl font-semibold font-display tabular-nums ${info.num}`}>{painel.buckets[k]}</p>
                  <p className="text-sm font-medium mt-1">{info.label}</p>
                  <p className="text-[11px] text-muted-foreground">{info.hint}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 flex-wrap text-[11px] text-muted-foreground">
            <button
              onClick={() => toggleParado("sem")}
              className={`hover:text-foreground transition-colors ${filtroParado === "sem" ? "text-foreground font-medium" : ""}`}
            >
              {painel.buckets.sem} sem data de andamento
            </button>
            <span>mais antigo: <span className="text-foreground font-medium">{painel.maisAntigo} dias</span> · média <span className="text-foreground font-medium">{painel.mediaDias} dias</span></span>
          </div>
        </SpotlightCard>
      </motion.div>

      {/* ── Distribuição por status + KPIs ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" /> Distribuição por status
              <span className="ml-auto text-xs font-normal text-muted-foreground">{distFase.length} status</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              data={distFase}
              total={painel.total}
              max={12}
              onItemClick={(name) => setFilter("fase", filtroFase === name ? null : name)}
            />
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 content-start">
          <SpotlightCard className="col-span-2">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Valor ajuizado</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">causas ativas · exclui arquivados</p>
            <p className="text-3xl font-semibold font-display mt-2 text-primary tabular-nums">{fmtBRLcompact(painel.valorAjuizado)}</p>
          </SpotlightCard>
          <MiniKpi label="Em andamento" value={painel.emAndamento} icon={<PlayCircle className="h-6 w-6" />} onClick={() => clearAllFilters()} />
          <MiniKpi label="Suspensos" value={painel.suspensos} icon={<PauseCircle className="h-6 w-6" />} onClick={() => setFilter("fase", "SUSPENSO")} />
          <MiniKpi label="Prazos ≤ 30 dias" value={painel.prazosProximos} icon={<CalendarClock className="h-6 w-6" />} />
          <MiniKpi label="Com pendência" value={painel.comPendencia} icon={<AlertCircle className="h-6 w-6" />} />
        </div>
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
            <X className="h-3.5 w-3.5" />Limpar filtros
          </Button>
        )}
      </motion.div>

      {/* ── Lista de processos ── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: 0.2 }}>
      <Card>
        <CardHeader className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nº, cliente ou matéria..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Select value={filtroFase ?? "__all__"} onValueChange={(v) => setFilter("fase", v)}>
              <SelectTrigger><SelectValue placeholder="Fase" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as fases</SelectItem>
                {fasesUnicas.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroMateria ?? "__all__"} onValueChange={(v) => setFilter("materia", v)}>
              <SelectTrigger><SelectValue placeholder="Matéria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as matérias</SelectItem>
                {materiasUnicas.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroParceiro ?? "__all__"} onValueChange={(v) => setFilter("parceiro", v)}>
              <SelectTrigger><SelectValue placeholder="Parceiro" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os parceiros</SelectItem>
                {parceirosUnicos.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº Processo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Matéria</TableHead>
                <TableHead>Fase</TableHead>
                <TableHead className="hidden lg:table-cell">Comarca/UF</TableHead>
                <TableHead className="hidden lg:table-cell">Últ. Andamento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-16">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p, i) => {
                const dias = p.fase_processual === "ARQUIVADO" ? null : diasDesde(p.data_ultimo_andamento);
                const bk = dias === null ? null : bucketParado(dias);
                return (
                <MotionRow
                  key={p.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 14) * 0.025 }}
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
                  <TableCell className="hidden lg:table-cell text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      {fmtDate(p.data_ultimo_andamento)}
                      {bk && bk !== "em_dia" && (
                        <span className={`h-1.5 w-1.5 rounded-full ${bk === "critico" ? "bg-red-400" : bk === "parado" ? "bg-amber-400" : "bg-sky-400"}`} title={`${dias} dias sem andamento`} />
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{fmtBRL(p.valor_causa)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => navigate(`/processos/${p.id}`)}><Eye className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </MotionRow>
                );
              })}
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
