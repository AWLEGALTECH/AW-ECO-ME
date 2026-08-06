import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, animate } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { appConfig } from "@/config/app-config";
import { Input } from "@/components/ui/input";
import { SpotlightCard } from "@/components/SpotlightCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChart } from "@/components/DonutChart";
import {
  Trophy, Scale, Hammer, Coins, Search, Gavel, Milestone,
  CalendarDays, Loader2, Hash, ExternalLink, Layers, MapPin, BarChart3, CalendarRange,
} from "lucide-react";

/* ─────────────────────────── tipos ───────────────────────────
   O Tracker é um REFLEXO do System: tudo vem da linha_temporal dos
   processos. Não há registro manual (trânsito/cumprimento) nem status
   editável só aqui — a fase é lida de onde o processo realmente está. */
type ResultadoSentenca = "procedente" | "parcial" | "improcedente";
interface Decisao { resultado?: ResultadoSentenca; valor?: number; data?: string; honorarios?: number; tipoDecisao?: string }
interface Execucao { valor?: number; data?: string }
interface EtapaLT {
  titulo?: string; status?: string;
  sentenca?: Decisao; julgamento?: Decisao; execucao?: Execucao;
}
interface ProcRow {
  id: string;
  numero_processo: string | null;
  materia: string | null;
  comarca_uf: string | null;
  fase_processual: string | null;
  linha_temporal: EtapaLT[] | null;
  cliente: { id: string; nome: string | null } | null;
}

/* Vitória derivada do System (processo com sentença procedente/parcial). */
interface Vitoria {
  id: string;
  numero_processo: string | null;
  materia: string | null;
  comarca_uf: string | null;
  cliente_nome: string | null;
  valor: number;             // valor da condenação (1º grau)
  data: string | null;       // data da sentença
  faseAtual: string;         // etapa em que o processo se encontra hoje
  emCumprimento: boolean;    // chegou ao cumprimento (valor quase certo)
  valorCumprimento: number;  // valor executado (ou o mais recente conhecido)
}

const ETAPA_SENTENCA = "Sentença";
const ETAPA_JULGAMENTO = "Julgamento em 2º grau";
const ETAPA_CUMPRIMENTO = "Cumprimento de sentença";

/* ─── fases pós-vitória (só leitura, na ordem processual) ─── */
const FASES_POS: { key: string; label: string; short: string; icon: any; dot: string; text: string; chip: string }[] = [
  { key: ETAPA_SENTENCA,    label: "Sentença (1º grau)",     short: "Sentença",    icon: Hammer,    dot: "bg-primary",     text: "text-primary",     chip: "bg-primary/10 text-primary border-primary/25" },
  { key: "Recurso",         label: "Fase recursal",          short: "Recurso",     icon: Scale,     dot: "bg-violet-400",  text: "text-violet-300",  chip: "bg-violet-400/10 text-violet-300 border-violet-400/25" },
  { key: ETAPA_JULGAMENTO,  label: "Julgamento em 2º grau",  short: "2º grau",     icon: Gavel,     dot: "bg-sky-400",     text: "text-sky-300",     chip: "bg-sky-400/10 text-sky-300 border-sky-400/25" },
  { key: "Trânsito em julgado", label: "Trânsito em julgado", short: "Trânsito",   icon: Milestone, dot: "bg-fuchsia-400", text: "text-fuchsia-300", chip: "bg-fuchsia-400/10 text-fuchsia-300 border-fuchsia-400/25" },
  { key: ETAPA_CUMPRIMENTO, label: "Cumprimento de sentença", short: "Cumprimento", icon: Trophy,   dot: "bg-emerald-400", text: "text-emerald-300", chip: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25" },
];
const FASE_BY = Object.fromEntries(FASES_POS.map((f) => [f.key, f])) as Record<string, typeof FASES_POS[number]>;
const faseInfo = (k: string) => FASE_BY[k] ?? FASES_POS[0];

/* ─────────────────────────── helpers ─────────────────────────── */
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const intBR = (n: number) => Math.round(n).toLocaleString("pt-BR");
const fmtData = (iso: string | null | undefined) => {
  if (!iso) return "pré-sistema";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return "pré-sistema";
  return `${d}/${m}/${y}`;
};

/** Agrupa a cauda longa: mantém os `n` maiores e soma o resto em "Outras". */
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

/* Extrai a etapa por título da linha temporal. */
const acharEtapa = (lt: EtapaLT[] | null, titulo: string) => (lt ?? []).find((e) => e.titulo === titulo);
const etapaAtual = (lt: EtapaLT[] | null) => (lt ?? []).find((e) => e.status === "atual")?.titulo ?? "";

/* ══════════════════════════ página ══════════════════════════ */
export default function Tracker() {
  useEffect(() => { document.title = `Tracker · ${appConfig.name}`; }, []);

  const [busca, setBusca] = useState("");
  // Cross-filtro: clicar numa métrica (matéria/comarca/mês/fase) filtra as OUTRAS.
  const [filtro, setFiltro] = useState<{ campo: "materia" | "comarca" | "mes" | "fase"; valor: string } | null>(null);

  const procRes = useQuery({
    queryKey: ["tracker_processos"],
    queryFn: async (): Promise<ProcRow[]> => {
      const { data, error } = await supabase
        .from("processos")
        .select(`id, numero_processo, materia, comarca_uf, fase_processual, linha_temporal, cliente:clientes ( id, nome )`)
        .order("data_ultimo_andamento", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ProcRow[];
    },
    refetchInterval: 60_000,
  });

  const processos = Array.isArray(procRes.data) ? procRes.data : [];

  /* ── deriva as vitórias (sentença procedente/parcial) do System ── */
  const vitorias = useMemo<Vitoria[]>(() => {
    const out: Vitoria[] = [];
    for (const p of processos) {
      const lt = Array.isArray(p.linha_temporal) ? p.linha_temporal : null;
      const sent = acharEtapa(lt, ETAPA_SENTENCA)?.sentenca;
      if (!sent || sent.resultado === "improcedente") continue;
      const valor = Number(sent.valor || 0);
      if (valor <= 0) continue;

      const fase = etapaAtual(lt) || ETAPA_SENTENCA;
      const emCumprimento = fase === ETAPA_CUMPRIMENTO;
      const exec = acharEtapa(lt, ETAPA_CUMPRIMENTO)?.execucao;
      const julg = acharEtapa(lt, ETAPA_JULGAMENTO)?.julgamento;
      // valor quase certo em cumprimento: executado > 2º grau procedente > sentença
      const valorCumprimento = Number(
        exec?.valor ||
        (julg && julg.resultado !== "improcedente" ? julg.valor : 0) ||
        valor
      );

      out.push({
        id: p.id,
        numero_processo: p.numero_processo,
        materia: p.materia,
        comarca_uf: p.comarca_uf,
        cliente_nome: p.cliente?.nome ?? null,
        valor,
        data: sent.data ?? null,
        faseAtual: fase,
        emCumprimento,
        valorCumprimento,
      });
    }
    return out.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
  }, [processos]);

  /* ── cross-filtro: cada gráfico exclui a PRÓPRIA dimensão (pra mostrar todas
       as opções) e é filtrado pelas outras. Lista/KPIs aplicam o filtro cheio. */
  const passaBusca = (v: Vitoria) => {
    const q = busca.trim().toLowerCase();
    if (!q) return true;
    return `${v.cliente_nome || ""} ${v.numero_processo || ""} ${v.materia || ""} ${v.comarca_uf || ""}`.toLowerCase().includes(q);
  };
  const campoVal = (v: Vitoria, campo: string) =>
    campo === "materia" ? ((v.materia || "").trim() || "Não informado")
      : campo === "comarca" ? ((v.comarca_uf || "").trim() || "Não informado")
        : campo === "mes" ? (v.data || "").slice(0, 7)
          : campo === "fase" ? v.faseAtual
            : "";
  const vitoriasFor = (exclui: string | null) =>
    vitorias.filter((v) => passaBusca(v) && (!filtro || filtro.campo === exclui || campoVal(v, filtro.campo) === filtro.valor));

  const vBase = useMemo(() => vitoriasFor(null), [vitorias, busca, filtro]); // eslint-disable-line react-hooks/exhaustive-deps
  const vMat = useMemo(() => vitoriasFor("materia"), [vitorias, busca, filtro]); // eslint-disable-line react-hooks/exhaustive-deps
  const vCom = useMemo(() => vitoriasFor("comarca"), [vitorias, busca, filtro]); // eslint-disable-line react-hooks/exhaustive-deps
  const vMes = useMemo(() => vitoriasFor("mes"), [vitorias, busca, filtro]); // eslint-disable-line react-hooks/exhaustive-deps
  const vFase = useMemo(() => vitoriasFor("fase"), [vitorias, busca, filtro]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFiltro = (campo: "materia" | "comarca" | "mes" | "fase", valor: string) => {
    if (!valor || valor === "Outras") { setFiltro(null); return; }
    setFiltro((f) => (f && f.campo === campo && f.valor === valor) ? null : { campo, valor });
  };
  const filtroLabel: Record<string, string> = { materia: "Matéria", comarca: "Comarca", mes: "Mês", fase: "Fase" };

  /* ── métricas principais (refletem busca + filtro) ── */
  const m = useMemo(() => {
    const totalGanho = vBase.reduce((a, v) => a + v.valor, 0);
    const emCumprimento = vBase.filter((v) => v.emCumprimento);
    const valorCumprimento = emCumprimento.reduce((a, v) => a + v.valorCumprimento, 0);
    const ticket = vBase.length ? totalGanho / vBase.length : 0;
    const porFase: Record<string, { n: number; valor: number }> = {};
    for (const f of FASES_POS) porFase[f.key] = { n: 0, valor: 0 };
    for (const v of vBase) { const b = porFase[v.faseAtual] || (porFase[v.faseAtual] = { n: 0, valor: 0 }); b.n += 1; b.valor += v.valor; }
    return { totalGanho, valorCumprimento, nCumprimento: emCumprimento.length, ticket, porFase, emCumprimento };
  }, [vBase]);

  // Distribuição por fase (card) — exclui o próprio filtro de fase.
  const porFaseCard = useMemo(() => {
    const acc: Record<string, { n: number; valor: number }> = {};
    for (const f of FASES_POS) acc[f.key] = { n: 0, valor: 0 };
    for (const v of vFase) { const b = acc[v.faseAtual] || (acc[v.faseAtual] = { n: 0, valor: 0 }); b.n += 1; b.valor += v.valor; }
    return acc;
  }, [vFase]);

  /* ── agregações pros gráficos (cada um exclui a própria dimensão) ── */
  const analytics = useMemo(() => {
    const acc = (arr: Vitoria[], pick: (v: Vitoria) => string | null | undefined) => {
      const map = new Map<string, { n: number; valor: number }>();
      for (const v of arr) {
        const k = (pick(v) || "").trim() || "Não informado";
        const cur = map.get(k) || { n: 0, valor: 0 };
        cur.n += 1; cur.valor += v.valor;
        map.set(k, cur);
      }
      return [...map.entries()].map(([name, val]) => ({ name, ...val }));
    };
    const materias = acc(vMat, (v) => v.materia).sort((a, b) => b.n - a.n);
    const comarcas = acc(vCom, (v) => v.comarca_uf).sort((a, b) => b.n - a.n);
    const mesMap = new Map<string, number>();
    for (const v of vMes) { const mes = (v.data || "").slice(0, 7); if (!mes) continue; mesMap.set(mes, (mesMap.get(mes) || 0) + v.valor); }
    const meses = [...mesMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, valor]) => ({ mes, valor }));
    const materiasValor = acc(vMat, (v) => v.materia).sort((a, b) => b.valor - a.valor).slice(0, 8);
    return { materias, comarcas, meses, materiasValor };
  }, [vMat, vCom, vMes]);

  /* ── lista (reflete busca + filtro) ── */
  const lista = vBase;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-3xl font-medium tracking-tight">Tracker</h2>
          <p className="text-sm text-muted-foreground mt-1">Reflexo do System: o que já foi ganho e o valor quase certo em cumprimento.</p>
        </div>
      </div>

      {procRes.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          {/* Filtro ativo (cross-filtro entre as métricas) */}
          {filtro && (
            <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.06] px-3 py-2 text-sm">
              <span className="text-muted-foreground">Filtrando por</span>
              <span className="font-medium text-primary">{filtroLabel[filtro.campo]}: {filtro.campo === "fase" ? faseInfo(filtro.valor).label : filtro.campo === "mes" ? filtro.valor : filtro.valor}</span>
              <button onClick={() => setFiltro(null)} className="ml-auto text-xs text-primary hover:underline">limpar filtro</button>
            </div>
          )}

          {/* ── KPIs: ganho em 1º grau + cumprimento voluntário (mesmo protagonismo) ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Kpi icon={Hammer} label="Total ganho em 1º grau" value={m.totalGanho} accent="text-primary" big
              sub={`${vitorias.length} ${vitorias.length === 1 ? "sentença procedente" : "sentenças procedentes"}`} />
            <Kpi icon={Trophy} label="Em cumprimento voluntário" value={m.valorCumprimento} accent="text-emerald-400" big
              border="ring-1 ring-emerald-500/25"
              sub={`${m.nCumprimento} ${m.nCumprimento === 1 ? "processo" : "processos"} · valor quase certo`} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Kpi icon={Coins} label="Ticket médio" value={m.ticket} accent="text-foreground"
              sub="por sentença procedente" />
            <Kpi icon={Scale} label="Já transitou / em execução" value={m.porFase[ETAPA_CUMPRIMENTO].valor + (m.porFase["Trânsito em julgado"]?.valor || 0)} accent="text-foreground"
              sub="condenações rumo ao recebimento" />
          </div>

          {/* ── Cumprimento voluntário em destaque (valor quase certo) ── */}
          {m.emCumprimento.length > 0 && (
            <Card className="ring-1 ring-emerald-500/25">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-emerald-400" /> Em cumprimento voluntário
                  <span className="ml-auto text-sm font-semibold text-emerald-400 tabular-nums">{brl(m.valorCumprimento)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {m.emCumprimento.map((v) => (
                    <a
                      key={v.id}
                      href={`/processos/${v.id}`}
                      className="group flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 hover:bg-emerald-500/[0.09] transition-colors"
                    >
                      <span className="h-9 w-9 rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30 grid place-items-center shrink-0">
                        <Trophy className="h-4 w-4 text-emerald-400" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{v.cliente_nome || v.numero_processo || "Processo"}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{v.materia || "Matéria não informada"}{v.comarca_uf ? ` · ${v.comarca_uf}` : ""}</p>
                      </div>
                      <span className="text-base font-semibold font-display tabular-nums text-emerald-400 shrink-0">{brl(v.valorCumprimento)}</span>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

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
                  onSliceClick={(name) => toggleFiltro("materia", name)}
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
                  onSliceClick={(name) => toggleFiltro("comarca", name)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-primary" /> Valor ganho por mês
                  <span className="ml-auto text-xs font-normal text-muted-foreground">clique pra filtrar</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MesesBars data={analytics.meses} onBarClick={(mes) => toggleFiltro("mes", mes)} ativo={filtro?.campo === "mes" ? filtro.valor : null} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> Matérias por valor (R$)
                  <span className="ml-auto text-xs font-normal text-muted-foreground">clique pra filtrar</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BarList
                  data={analytics.materiasValor.map((x) => ({ label: x.name, value: x.valor, hint: `${x.n} ${x.n === 1 ? "sentença" : "sentenças"}` }))}
                  format={brl}
                  onItemClick={(label) => toggleFiltro("materia", label)}
                />
              </CardContent>
            </Card>
          </div>

          {/* ── Distribuição por fase atual (lida do System, só leitura/filtro) ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Milestone className="h-4 w-4 text-primary" /> Onde estão as vitórias hoje
                <span className="ml-auto text-xs font-normal text-muted-foreground">clique pra filtrar</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                {FASES_POS.map((f) => {
                  const b = porFaseCard[f.key] || { n: 0, valor: 0 };
                  const ativo = filtro?.campo === "fase" && filtro.valor === f.key;
                  return (
                    <button
                      key={f.key}
                      onClick={() => toggleFiltro("fase", f.key)}
                      className={`text-left rounded-xl border p-3 transition-colors ${ativo ? f.chip : "border-border bg-muted/20 hover:border-primary/40"}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${f.dot}`} />
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground truncate">{f.short}</span>
                      </div>
                      <p className={`text-2xl font-semibold font-display tabular-nums mt-1 ${ativo ? f.text : ""}`}>{b.n}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">{brl(b.valor)}</p>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* ── Lista de vitórias (só leitura, fase lida do System) ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                {filtro ? `Vitórias · ${filtro.campo === "fase" ? faseInfo(filtro.valor).label : filtro.valor}` : "Todas as vitórias"}
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
                  {vitorias.length === 0
                    ? <>Nenhuma vitória ainda. Registre a sentença dentro do processo, no System.</>
                    : "Nenhuma vitória com esse filtro."}
                </p>
              ) : (
                <div className="divide-y divide-border/40">
                  {lista.map((v) => {
                    const f = faseInfo(v.faseAtual);
                    return (
                      <div key={v.id} className="py-3 first:pt-0 last:pb-0 group">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${f.chip} border mt-0.5`}>
                              <f.icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium truncate">{v.cliente_nome || "Cliente não informado"}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${f.chip}`}>{f.label}</span>
                                {v.emCumprimento && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-emerald-400/10 text-emerald-300 border-emerald-400/25">valor quase certo</span>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                                {v.numero_processo && (
                                  <span className="inline-flex items-center gap-1"><Hash className="h-3 w-3" />{v.numero_processo}</span>
                                )}
                                {v.materia && <><span className="text-muted-foreground/40">·</span><span>{v.materia}</span></>}
                                {v.comarca_uf && <><span className="text-muted-foreground/40">·</span><span>{v.comarca_uf}</span></>}
                                <span className="text-muted-foreground/40">·</span>
                                <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{fmtData(v.data)}</span>
                                <a href={`/processos/${v.id}`} className="inline-flex items-center gap-0.5 text-primary hover:underline">
                                  <ExternalLink className="h-3 w-3" />ver processo
                                </a>
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="block text-base font-semibold font-display tabular-nums">{brl(v.valor)}</span>
                            {v.emCumprimento && v.valorCumprimento !== v.valor && (
                              <span className="block text-[11px] text-emerald-400 tabular-nums">exec. {brl(v.valorCumprimento)}</span>
                            )}
                          </div>
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

/* Barras horizontais de VALOR por mês (cronológico). */
const MES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function rotuloMes(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return `${MES_ABREV[m - 1]}/${String(y).slice(2)}`;
}
function MesesBars({ data, onBarClick, ativo }: { data: { mes: string; valor: number }[]; onBarClick?: (mes: string) => void; ativo?: string | null }) {
  if (!data.length) return <p className="text-sm text-muted-foreground text-center py-8">Sem sentenças ainda.</p>;
  const peak = Math.max(...data.map((d) => d.valor), 1);
  return (
    <div className="space-y-2">
      {data.map((d, i) => {
        const pct = Math.max(3, (d.valor / peak) * 100);
        const on = ativo === d.mes;
        return (
          <button key={d.mes} type="button" onClick={() => onBarClick?.(d.mes)}
            className={`w-full flex items-center gap-3 rounded-md ${onBarClick ? "hover:bg-white/[0.03]" : ""} ${on ? "ring-1 ring-primary/40" : ""} px-0.5 py-0.5 transition-colors`}>
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
          </button>
        );
      })}
    </div>
  );
}

/* Lista de barras genérica (ranking). */
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
