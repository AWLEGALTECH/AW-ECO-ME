import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, animate } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { appConfig } from "@/config/app-config";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SpotlightCard } from "@/components/SpotlightCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { DonutChart } from "@/components/DonutChart";
import {
  HandCoins, Trophy, Scale, Hammer, FileText, Coins, Plus, Search, Trash2,
  CalendarDays, Loader2, Hash, ExternalLink, Check, Layers, MapPin, BarChart3, CalendarRange,
} from "lucide-react";

/* ─────────────────────────── tipos ─────────────────────────── */
interface Sentenca {
  id: string;
  valor: number;
  data_sentenca: string;
  status: StatusKey;
  data_recebimento: string | null;
  honorarios: number | null;
  observacoes: string | null;
  processo: {
    id: string;
    numero_processo: string | null;
    materia: string | null;
    comarca_uf: string | null;
    fase_processual: string | null;
    cliente: { id: string; nome: string | null } | null;
  } | null;
}

/* ─────────────────────── funil pós-vitória ─────────────────────── */
type StatusKey = "ganha" | "transitada" | "cumprimento" | "alvara" | "recebido";
interface StatusDef {
  key: StatusKey; label: string; short: string; icon: any;
  dot: string; text: string; chip: string;
}
const STATUS: StatusDef[] = [
  { key: "ganha",       label: "Sentença procedente", short: "Ganha",       icon: Trophy,   dot: "bg-primary",      text: "text-primary",      chip: "bg-primary/10 text-primary border-primary/25" },
  { key: "transitada",  label: "Trânsito em julgado", short: "Transitada",  icon: Scale,    dot: "bg-violet-400",   text: "text-violet-400",   chip: "bg-violet-400/10 text-violet-300 border-violet-400/25" },
  { key: "cumprimento", label: "Cumprimento de sentença", short: "Cumprimento", icon: Hammer, dot: "bg-amber-400", text: "text-amber-400",  chip: "bg-amber-400/10 text-amber-300 border-amber-400/25" },
  { key: "alvara",      label: "Alvará / RPV expedido", short: "Alvará",     icon: FileText, dot: "bg-sky-400",      text: "text-sky-400",      chip: "bg-sky-400/10 text-sky-300 border-sky-400/25" },
  { key: "recebido",    label: "Recebido",            short: "Recebido",    icon: Coins,    dot: "bg-emerald-400",  text: "text-emerald-400",  chip: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25" },
];
const STATUS_BY = Object.fromEntries(STATUS.map((s) => [s.key, s])) as Record<StatusKey, StatusDef>;

/* ─────────────────────────── helpers ─────────────────────────── */
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const intBR = (n: number) => Math.round(n).toLocaleString("pt-BR");
const fmtData = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const primeiroNome = (n: string | null | undefined) => (n || "").trim().split(/\s+/)[0] || "—";
const hoje = () => new Date().toISOString().slice(0, 10);

/** Agrupa a cauda longa: mantém os `n` maiores e soma o resto em "Outras".
 *  Espera `items` já ordenado por value desc. */
function topSlices(items: { name: string; value: number }[], n: number) {
  if (items.length <= n) return items;
  const top = items.slice(0, n);
  const resto = items.slice(n).reduce((a, b) => a + b.value, 0);
  return resto > 0 ? [...top, { name: "Outras", value: resto }] : top;
}

function CountUp({ value, format, className }: { value: number; format?: (n: number) => string; className?: string }) {
  const [disp, setDisp] = useState(0);
  useEffect(() => {
    const controls = animate(0, value, { duration: 0.8, ease: "easeOut", onUpdate: (v) => setDisp(v) });
    return () => controls.stop();
  }, [value]);
  return <span className={className}>{format ? format(disp) : intBR(disp)}</span>;
}

/* ══════════════════════════ página ══════════════════════════ */
export default function Tracker() {
  useEffect(() => { document.title = `AW Tracker · ${appConfig.name}`; }, []);
  const { user } = useAuth();

  const [novoOpen, setNovoOpen] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<StatusKey | null>(null);
  const [busca, setBusca] = useState("");

  const sentRes = useQuery({
    queryKey: ["sentencas"],
    queryFn: async (): Promise<Sentenca[]> => {
      const { data, error } = await supabase
        .from("sentencas" as any)
        .select(`
          id, valor, data_sentenca, status, data_recebimento, honorarios, observacoes,
          processo:processos (
            id, numero_processo, materia, comarca_uf, fase_processual,
            cliente:clientes ( id, nome )
          )
        `)
        .order("data_sentenca", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Sentenca[];
    },
    refetchInterval: 60_000,
  });

  const sentencas = Array.isArray(sentRes.data) ? sentRes.data : [];

  /* ── métricas ── */
  const m = useMemo(() => {
    const totalGanho = sentencas.reduce((a, s) => a + Number(s.valor || 0), 0);
    const recebido = sentencas.filter((s) => s.status === "recebido").reduce((a, s) => a + Number(s.valor || 0), 0);
    const aReceber = totalGanho - recebido;
    const nRecebidas = sentencas.filter((s) => s.status === "recebido").length;
    const porStatus: Record<string, { n: number; valor: number }> = {};
    for (const s of STATUS) porStatus[s.key] = { n: 0, valor: 0 };
    for (const s of sentencas) {
      const b = porStatus[s.status] || (porStatus[s.status] = { n: 0, valor: 0 });
      b.n += 1; b.valor += Number(s.valor || 0);
    }
    return { totalGanho, recebido, aReceber, nRecebidas, porStatus };
  }, [sentencas]);

  /* ── agregações pros gráficos ── */
  const analytics = useMemo(() => {
    // acumula {n, valor} por chave textual (matéria / comarca)
    const acc = (pick: (s: Sentenca) => string | null | undefined) => {
      const map = new Map<string, { n: number; valor: number }>();
      for (const s of sentencas) {
        const k = (pick(s) || "").trim() || "Não informado";
        const cur = map.get(k) || { n: 0, valor: 0 };
        cur.n += 1; cur.valor += Number(s.valor || 0);
        map.set(k, cur);
      }
      return [...map.entries()].map(([name, v]) => ({ name, ...v }));
    };
    const materias = acc((s) => s.processo?.materia).sort((a, b) => b.n - a.n);
    const comarcas = acc((s) => s.processo?.comarca_uf).sort((a, b) => b.n - a.n);

    // valor ganho por mês (YYYY-MM), em ordem cronológica
    const mesMap = new Map<string, number>();
    for (const s of sentencas) {
      const mes = (s.data_sentenca || "").slice(0, 7);
      if (!mes) continue;
      mesMap.set(mes, (mesMap.get(mes) || 0) + Number(s.valor || 0));
    }
    const meses = [...mesMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, valor]) => ({ mes, valor }));

    // matérias por VALOR (ranking em R$), top 8
    const materiasValor = [...materias].sort((a, b) => b.valor - a.valor).slice(0, 8);
    return { materias, comarcas, meses, materiasValor };
  }, [sentencas]);

  /* ── lista filtrada ── */
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return sentencas.filter((s) => {
      if (filtroStatus && s.status !== filtroStatus) return false;
      if (!q) return true;
      const alvo = `${s.processo?.cliente?.nome || ""} ${s.processo?.numero_processo || ""} ${s.processo?.materia || ""} ${s.processo?.comarca_uf || ""}`.toLowerCase();
      return alvo.includes(q);
    });
  }, [sentencas, filtroStatus, busca]);

  const atualizarStatus = async (s: Sentenca, novo: StatusKey) => {
    const patch: any = { status: novo, updated_at: new Date().toISOString() };
    // quando chega em "recebido", carimba a data; se sair, limpa.
    if (novo === "recebido") patch.data_recebimento = hoje();
    else if (s.status === "recebido") patch.data_recebimento = null;
    const { error } = await supabase.from("sentencas" as any).update(patch).eq("id", s.id);
    if (error) { toast.error("Erro ao atualizar: " + error.message); return; }
    if (novo === "recebido") toast.success(`Recebido! ${brl(Number(s.valor))} 💰`);
    sentRes.refetch();
  };

  const excluir = async (s: Sentenca) => {
    const nome = s.processo?.cliente?.nome || s.processo?.numero_processo || "sentença";
    if (!window.confirm(`Remover a sentença de ${nome}?`)) return;
    const { error } = await supabase.from("sentencas" as any).delete().eq("id", s.id);
    if (error) { toast.error("Erro ao remover: " + error.message); return; }
    toast.success("Sentença removida");
    sentRes.refetch();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-3xl font-medium tracking-tight flex items-center gap-2">
            <HandCoins className="h-7 w-7 text-primary" /> AW Tracker
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Sentenças procedentes — o que já foi ganho em 1º grau.</p>
        </div>
        <Button onClick={() => setNovoOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nova sentença
        </Button>
      </div>

      {sentRes.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          {/* ── KPIs ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Kpi icon={Trophy}    label="Total ganho em 1º grau" value={m.totalGanho} accent="text-primary" big
              sub={`${sentencas.length} ${sentencas.length === 1 ? "sentença procedente" : "sentenças procedentes"}`} />
            <Kpi icon={Coins}     label="Ticket médio" value={sentencas.length ? m.totalGanho / sentencas.length : 0} accent="text-foreground" big sub="por sentença" />
          </div>

          {/* ── Gráficos dos ganhos ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" /> Ganhos por matéria
                  <span className="ml-auto text-xs font-normal text-muted-foreground">clique pra filtrar</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart
                  data={topSlices(analytics.materias.map((x) => ({ name: x.name, value: x.n })), 6)}
                  emptyMessage="Sem sentenças ainda"
                  onSliceClick={(name) => setBusca(name === "Outras" || name === "Não informado" ? "" : name)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" /> Ganhos por comarca
                  <span className="ml-auto text-xs font-normal text-muted-foreground">clique pra filtrar</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart
                  data={topSlices(analytics.comarcas.map((x) => ({ name: x.name, value: x.n })), 6)}
                  emptyMessage="Sem sentenças ainda"
                  onSliceClick={(name) => setBusca(name === "Outras" || name === "Não informado" ? "" : name)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-primary" /> Valor ganho por mês
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MesesBars data={analytics.meses} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> Matérias por valor (R$)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  data={analytics.materiasValor.map((x) => ({ label: x.name, value: x.valor, hint: `${x.n} ${x.n === 1 ? "sentença" : "sentenças"}` }))}
                  format={brl}
                  onItemClick={(label) => setBusca(label === "Não informado" ? "" : label)}
                />
              </CardContent>
            </Card>
          </div>

          {/* ── Funil (clicável = filtro) ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Scale className="h-4 w-4 text-primary" /> Funil pós-vitória
                {filtroStatus && (
                  <button onClick={() => setFiltroStatus(null)} className="ml-auto text-xs font-normal text-primary hover:underline">
                    limpar filtro
                  </button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                {STATUS.map((st) => {
                  const b = m.porStatus[st.key] || { n: 0, valor: 0 };
                  const ativo = filtroStatus === st.key;
                  return (
                    <button
                      key={st.key}
                      onClick={() => setFiltroStatus(ativo ? null : st.key)}
                      className={`text-left rounded-xl border p-3 transition-colors ${
                        ativo ? `${st.chip}` : "border-border bg-muted/20 hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${st.dot}`} />
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">{st.short}</span>
                      </div>
                      <p className={`text-2xl font-semibold font-display tabular-nums mt-1 ${ativo ? st.text : ""}`}>{b.n}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">{brl(b.valor)}</p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* ── Lista ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                {filtroStatus ? `Sentenças · ${STATUS_BY[filtroStatus].label}` : "Todas as sentenças"}
                <span className="ml-auto text-xs font-normal text-muted-foreground">{lista.length}</span>
              </CardTitle>
              <div className="relative mt-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por cliente, número ou matéria…"
                  className="pl-8"
                />
              </div>
            </CardHeader>
            <CardContent>
              {lista.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {sentencas.length === 0
                    ? <>Nenhuma sentença ainda. Clique em <strong>Nova sentença</strong> pra registrar uma vitória.</>
                    : "Nenhuma sentença com esse filtro."}
                </p>
              ) : (
                <div className="divide-y divide-border/40">
                  {lista.map((s) => {
                    const st = STATUS_BY[s.status] || STATUS[0];
                    return (
                      <div key={s.id} className="py-3 first:pt-0 last:pb-0 group">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${st.chip} border mt-0.5`}>
                              <st.icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium truncate">{s.processo?.cliente?.nome || "—"}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${st.chip}`}>{st.label}</span>
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                                {s.processo?.numero_processo && (
                                  <span className="inline-flex items-center gap-1"><Hash className="h-3 w-3" />{s.processo.numero_processo}</span>
                                )}
                                {s.processo?.materia && <><span className="text-muted-foreground/40">·</span><span>{s.processo.materia}</span></>}
                                {s.processo?.comarca_uf && <><span className="text-muted-foreground/40">·</span><span>{s.processo.comarca_uf}</span></>}
                                <span className="text-muted-foreground/40">·</span>
                                <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{fmtData(s.data_sentenca)}</span>
                                {s.status === "recebido" && s.data_recebimento && (
                                  <><span className="text-muted-foreground/40">·</span>
                                  <span className="inline-flex items-center gap-1 text-emerald-400"><Check className="h-3 w-3" />recebido em {fmtData(s.data_recebimento)}</span></>
                                )}
                                {s.processo?.id && (
                                  <a href={`/processos/${s.processo.id}`} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                                    <ExternalLink className="h-3 w-3" />ver processo
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-base font-semibold font-display tabular-nums ${st.key === "recebido" ? "text-emerald-400" : ""}`}>{brl(Number(s.valor))}</span>
                            <button
                              onClick={() => excluir(s)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/60 hover:text-red-400"
                              title="Remover"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {/* Trilha de status — clique pra avançar/voltar a etapa */}
                        <div className="flex flex-wrap gap-1 mt-2 ml-[42px]">
                          {STATUS.map((opt) => {
                            const on = opt.key === s.status;
                            return (
                              <button
                                key={opt.key}
                                onClick={() => !on && atualizarStatus(s, opt.key)}
                                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                                  on ? opt.chip : "border-border text-muted-foreground/70 hover:border-primary/40 hover:text-foreground"
                                }`}
                                title={`Marcar como ${opt.label}`}
                              >
                                {opt.short}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <NovaSentencaDialog
        open={novoOpen}
        onClose={() => setNovoOpen(false)}
        userId={user?.id || null}
        onSaved={() => { setNovoOpen(false); sentRes.refetch(); }}
      />
    </div>
  );
}

/* ─────────────────────── KPI card ─────────────────────── */
function Kpi({ icon: Icon, label, value, accent, sub, border, big }: {
  icon: any; label: string; value: number; accent: string; sub?: string; border?: string; big?: boolean;
}) {
  return (
    <SpotlightCard className={border || ""}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <CountUp value={value} format={brl} className={`block ${big ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl"} font-semibold font-display tabular-nums leading-none mt-2 ${accent}`} />
      {sub && <p className="text-[11px] text-muted-foreground mt-1.5">{sub}</p>}
    </SpotlightCard>
  );
}

/* Barras horizontais de VALOR por mês (cronológico). Barra proporcional ao
   maior mês; rótulo mês/ano abreviado + valor em R$. */
const MES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function rotuloMes(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return `${MES_ABREV[m - 1]}/${String(y).slice(2)}`;
}
function MesesBars({ data }: { data: { mes: string; valor: number }[] }) {
  if (!data.length) return <p className="text-sm text-muted-foreground text-center py-8">Sem sentenças ainda.</p>;
  const peak = Math.max(...data.map((d) => d.valor), 1);
  return (
    <div className="space-y-2">
      {data.map((d, i) => {
        const pct = Math.max(3, (d.valor / peak) * 100);
        return (
          <div key={d.mes} className="flex items-center gap-3">
            <span className="w-12 shrink-0 text-[11px] text-muted-foreground tabular-nums capitalize">{rotuloMes(d.mes)}</span>
            <div className="relative flex-1 h-6 rounded-md bg-black/20 overflow-hidden">
              <motion.div
                className="h-full rounded-md bg-gradient-to-r from-primary/70 to-primary"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.8, ease: "easeOut", delay: i * 0.04 }}
              />
              <span className="absolute inset-y-0 right-2 flex items-center text-[11px] font-medium tabular-nums text-foreground/90">
                {brl(d.valor)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Lista de barras genérica (ranking). Barra proporcional ao topo; opcional
   clique pra filtrar e uma dica (hint) à direita. */
function BarList({ data, format, onItemClick }: {
  data: { label: string; value: number; hint?: string }[];
  format?: (n: number) => string;
  onItemClick?: (label: string) => void;
}) {
  if (!data.length) return <p className="text-sm text-muted-foreground text-center py-8">Sem dados ainda.</p>;
  const peak = data[0]?.value || 1;
  return (
    <div className="space-y-1.5">
      {data.map((d) => {
        const pct = Math.max(4, (d.value / peak) * 100);
        return (
          <button
            key={d.label}
            onClick={() => onItemClick?.(d.label)}
            className="group relative w-full overflow-hidden rounded-md px-2.5 py-1.5 text-left"
          >
            <div className="absolute inset-y-0 left-0 bg-primary/15 group-hover:bg-primary/25 transition-colors" style={{ width: `${pct}%` }} />
            <div className="relative flex items-center justify-between gap-3">
              <span className="text-sm truncate">{d.label}</span>
              <span className="flex items-center gap-2 shrink-0">
                {d.hint && <span className="text-[10px] text-muted-foreground">{d.hint}</span>}
                <span className="text-xs font-mono text-foreground/80 tabular-nums">{format ? format(d.value) : d.value}</span>
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────── Nova sentença ─────────────────────── */
interface ProcOpc { id: string; numero_processo: string | null; cliente_nome: string | null }

function NovaSentencaDialog({ open, onClose, userId, onSaved }: {
  open: boolean; onClose: () => void; userId: string | null; onSaved: () => void;
}) {
  const [numero, setNumero] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje());
  const [status, setStatus] = useState<StatusKey>("ganha");
  const [saving, setSaving] = useState(false);

  const procRes = useQuery({
    queryKey: ["tracker_processos_lookup"],
    enabled: open,
    queryFn: async (): Promise<ProcOpc[]> => {
      const { data, error } = await supabase
        .from("processos")
        .select("id, numero_processo, cliente:clientes(nome)")
        .order("numero_processo");
      if (error) throw error;
      return ((data || []) as any[]).map((p) => ({
        id: p.id, numero_processo: p.numero_processo, cliente_nome: p.cliente?.nome || null,
      }));
    },
  });
  const processos = Array.isArray(procRes.data) ? procRes.data : [];

  const reset = () => { setNumero(""); setValor(""); setData(hoje()); setStatus("ganha"); };
  const num = (s: string) => parseFloat(String(s).replace(/\./g, "").replace(",", ".")) || 0;

  const salvar = async () => {
    // casa o número digitado com um processo (por dígitos, ignora pontuação)
    const soDigitos = (x: string) => x.replace(/\D/g, "");
    const alvo = soDigitos(numero);
    const proc = processos.find((p) => soDigitos(p.numero_processo || "") === alvo);
    if (!proc) { toast.error("Processo não encontrado. Escolha um número da lista."); return; }
    if (num(valor) <= 0) { toast.error("Informe o valor da sentença."); return; }
    if (!data) { toast.error("Informe a data da sentença."); return; }
    setSaving(true);
    const { error } = await supabase.from("sentencas" as any).insert({
      processo_id: proc.id,
      valor: num(valor),
      data_sentenca: data,
      status,
      data_recebimento: status === "recebido" ? data : null,
      created_by: userId,
    });
    setSaving(false);
    if (error) {
      if (error.code === "23505") toast.error("Esse processo já tem uma sentença registrada.");
      else toast.error("Erro ao salvar: " + error.message);
      return;
    }
    toast.success("Sentença registrada 🏆");
    reset();
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setTimeout(reset, 200); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-400" /> Nova sentença procedente</DialogTitle>
          <DialogDescription>Vincule a um processo existente e informe o valor ganho.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div>
            <Label>Processo</Label>
            <Input
              list="tracker-processos"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder={procRes.isLoading ? "Carregando processos…" : "Número do processo"}
            />
            <datalist id="tracker-processos">
              {processos.map((p) => (
                <option key={p.id} value={p.numero_processo || ""}>
                  {p.cliente_nome || ""}
                </option>
              ))}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor (R$)</Label>
              <Input value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ""))} placeholder="0,00" inputMode="decimal" className="tabular-nums" />
            </div>
            <div>
              <Label>Data da sentença</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Etapa</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {STATUS.map((st) => {
                const on = st.key === status;
                return (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => setStatus(st.key)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1 ${
                      on ? st.chip : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    <st.icon className="h-3 w-3" /> {st.short}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { onClose(); setTimeout(reset, 200); }} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar sentença"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
