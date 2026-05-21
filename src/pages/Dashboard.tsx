import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SpotlightCard } from "@/components/SpotlightCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChart } from "@/components/DonutChart";
import {
  Briefcase, Users, DollarSign, TrendingUp,
  PlayCircle, PauseCircle, Archive, AlertCircle,
  CalendarClock, MapPin, Scale, Handshake, ClipboardList, ListChecks,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const fmtBRLfull = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

interface Processo {
  id: string;
  numero_processo: string;
  cliente_id: string | null;
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
  clientes?: { nome: string | null } | null;
}

function countBy<T>(items: T[], key: (i: T) => string | null | undefined): { name: string; value: number }[] {
  const m = new Map<string, number>();
  items.forEach((it) => {
    const k = key(it);
    if (!k) return;
    m.set(k, (m.get(k) ?? 0) + 1);
  });
  return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function BarList({
  data, total, onItemClick, max = 10, emptyMessage = "Sem dados.",
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
            <div
              className="absolute inset-y-0 left-0 bg-primary/15 transition-all"
              style={{ width: `${pct}%` }}
            />
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

export default function Dashboard() {
  useEffect(() => { document.title = "Dashboard — AW ECO ME"; }, []);
  const navigate = useNavigate();
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [totalClientes, setTotalClientes] = useState(0);

  useEffect(() => {
    (async () => {
      const [{ data: procs }, { count: cliCount }] = await Promise.all([
        supabase
          .from("processos")
          .select("id, numero_processo, cliente_id, materia, data_ultimo_andamento, prazo_processual, fase_processual, tipo_pendencia, status_tarefa, vara_juizo_origem, valor_causa, comarca_uf, parceiro, clientes(nome)"),
        supabase.from("clientes").select("*", { count: "exact", head: true }),
      ]);
      if (procs) setProcessos(procs as unknown as Processo[]);
      setTotalClientes(cliCount ?? 0);
    })();
  }, []);

  const stats = useMemo(() => {
    const total = processos.length;
    const valorTotal = processos.reduce((s, p) => s + (Number(p.valor_causa) || 0), 0);
    const comValor = processos.filter((p) => p.valor_causa != null);
    const valorMedio = comValor.length ? valorTotal / comValor.length : 0;

    const suspensos = processos.filter((p) => p.fase_processual === "SUSPENSO").length;
    const arquivados = processos.filter((p) => p.fase_processual === "ARQUIVADO").length;
    const emAndamento = total - suspensos - arquivados;
    const comPendencia = processos.filter((p) => p.tipo_pendencia != null && p.tipo_pendencia !== "").length;

    const hoje = new Date().toISOString().slice(0, 10);
    const em30dias = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const prazosProximos = processos
      .filter((p) => p.prazo_processual && p.prazo_processual >= hoje && p.prazo_processual <= em30dias)
      .sort((a, b) => (a.prazo_processual ?? "").localeCompare(b.prazo_processual ?? ""));

    return { total, valorTotal, valorMedio, suspensos, arquivados, emAndamento, comPendencia, prazosProximos };
  }, [processos]);

  const distFase = useMemo(() => countBy(processos, (p) => p.fase_processual), [processos]);
  const distMateria = useMemo(() => countBy(processos, (p) => p.materia), [processos]);
  const distComarca = useMemo(() => countBy(processos, (p) => p.comarca_uf), [processos]);
  const distVara = useMemo(() => countBy(processos, (p) => p.vara_juizo_origem), [processos]);
  const distParceiro = useMemo(() => countBy(processos, (p) => p.parceiro), [processos]);
  const distPendencia = useMemo(() => countBy(processos, (p) => p.tipo_pendencia), [processos]);
  const distStatus = useMemo(() => countBy(processos, (p) => p.status_tarefa), [processos]);

  const totalComarca = distComarca.reduce((s, d) => s + d.value, 0);
  const totalParceiro = distParceiro.reduce((s, d) => s + d.value, 0);
  const totalStatus = distStatus.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-bold">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">Visão geral · aba ADV</p>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SpotlightCard onClick={() => navigate("/processos")} className="cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Processos</p>
              <p className="text-3xl font-bold font-display mt-1">{stats.total}</p>
            </div>
            <Briefcase className="h-8 w-8 text-primary/60" />
          </div>
        </SpotlightCard>

        <SpotlightCard onClick={() => navigate("/clientes")} className="cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Clientes</p>
              <p className="text-3xl font-bold font-display mt-1">{totalClientes}</p>
            </div>
            <Users className="h-8 w-8 text-primary/60" />
          </div>
        </SpotlightCard>

        <SpotlightCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Valor Total</p>
              <p className="text-2xl font-bold font-display mt-1" title={fmtBRLfull(stats.valorTotal)}>
                {fmtBRL(stats.valorTotal)}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-primary/60" />
          </div>
        </SpotlightCard>

        <SpotlightCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Valor Médio</p>
              <p className="text-2xl font-bold font-display mt-1" title={fmtBRLfull(stats.valorMedio)}>
                {fmtBRL(stats.valorMedio)}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-primary/60" />
          </div>
        </SpotlightCard>
      </div>

      {/* Status operacional */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SpotlightCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Em Andamento</p>
              <p className="text-2xl font-bold font-display mt-1">{stats.emAndamento}</p>
            </div>
            <PlayCircle className="h-7 w-7 text-primary/60" />
          </div>
        </SpotlightCard>
        <SpotlightCard onClick={() => navigate("/processos?fase=SUSPENSO")} className="cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Suspensos</p>
              <p className="text-2xl font-bold font-display mt-1">{stats.suspensos}</p>
            </div>
            <PauseCircle className="h-7 w-7 text-primary/60" />
          </div>
        </SpotlightCard>
        <SpotlightCard onClick={() => navigate("/processos?fase=ARQUIVADO")} className="cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Arquivados</p>
              <p className="text-2xl font-bold font-display mt-1">{stats.arquivados}</p>
            </div>
            <Archive className="h-7 w-7 text-primary/60" />
          </div>
        </SpotlightCard>
        <SpotlightCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Com Pendência</p>
              <p className="text-2xl font-bold font-display mt-1">{stats.comPendencia}</p>
            </div>
            <AlertCircle className="h-7 w-7 text-primary/60" />
          </div>
        </SpotlightCard>
      </div>

      {/* Distribuições principais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" /> Fase Processual
              <span className="ml-auto text-xs font-normal text-muted-foreground">{distFase.length} fases</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              data={distFase}
              total={stats.total}
              max={20}
              onItemClick={(name) => navigate(`/processos?fase=${encodeURIComponent(name)}`)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" /> Matéria
              <span className="ml-auto text-xs font-normal text-muted-foreground">{distMateria.length} matérias</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              data={distMateria}
              total={stats.total}
              max={12}
              onItemClick={(name) => navigate(`/processos?materia=${encodeURIComponent(name)}`)}
            />
          </CardContent>
        </Card>
      </div>

      {/* Comarca + Vara */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Comarca / UF
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={distComarca}
              onSliceClick={(name) => navigate(`/processos?comarca=${encodeURIComponent(name)}`)}
            />
            <p className="text-[11px] text-muted-foreground mt-3 text-center">
              {totalComarca} de {stats.total} processos com comarca informada
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" /> Vara / Juízo
              <span className="ml-auto text-xs font-normal text-muted-foreground">{distVara.length} varas</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              data={distVara}
              total={stats.total}
              max={12}
              onItemClick={(name) => navigate(`/processos?vara=${encodeURIComponent(name)}`)}
            />
          </CardContent>
        </Card>
      </div>

      {/* Parceiro + Status + Pendência */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Handshake className="h-4 w-4 text-primary" /> Parceiro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              data={distParceiro}
              total={totalParceiro || 1}
              max={10}
              onItemClick={(name) => navigate(`/processos?parceiro=${encodeURIComponent(name)}`)}
              emptyMessage="Nenhum processo com parceiro."
            />
            <p className="text-[11px] text-muted-foreground mt-3 text-center">
              {totalParceiro} processos em parceria
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" /> Status da Tarefa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              data={distStatus}
              total={totalStatus || 1}
              max={10}
              onItemClick={(name) => navigate(`/processos?status=${encodeURIComponent(name)}`)}
              emptyMessage="Nenhum status informado."
            />
            <p className="text-[11px] text-muted-foreground mt-3 text-center">
              {totalStatus} processos com status informado
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-primary" /> Tipo de Pendência
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              data={distPendencia}
              total={stats.comPendencia || 1}
              max={10}
              onItemClick={(name) => navigate(`/processos?pendencia=${encodeURIComponent(name)}`)}
              emptyMessage="Nenhuma pendência aberta."
            />
            <p className="text-[11px] text-muted-foreground mt-3 text-center">
              {stats.comPendencia} processos com pendência
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Próximos prazos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" /> Prazos nos próximos 30 dias
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {stats.prazosProximos.length} prazos
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stats.prazosProximos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum prazo nos próximos 30 dias.</p>
          ) : (
            <div className="divide-y divide-border/40">
              {stats.prazosProximos.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 py-2 px-1 cursor-pointer hover:bg-white/[0.03] rounded"
                  onClick={() => navigate(`/processos/${p.id}`)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.numero_processo}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.clientes?.nome ?? "—"} · {p.fase_processual ?? "—"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono">{fmtDate(p.prazo_processual!)}</p>
                    <p className="text-[11px] text-muted-foreground">{p.materia ?? ""}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
