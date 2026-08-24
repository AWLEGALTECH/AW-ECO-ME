import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SpotlightCard } from "@/components/SpotlightCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChart } from "@/components/DonutChart";
import {
  Briefcase, Users, DollarSign, TrendingUp,
  PlayCircle, PauseCircle, AlertCircle,
  CalendarClock, MapPin, Scale, Handshake, ClipboardList, ListChecks, Gavel,
  Zap, Eye, Flame, Send,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const fmtBRLfull = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// Renderiza o valor em BRL com a casa dos centavos em fonte menor (0.55em)
// para que o valor inteiro seja a parte visualmente dominante.
function Money({ value, className }: { value: number; className?: string }) {
  const formatted = fmtBRLfull(value);
  const idx = formatted.lastIndexOf(",");
  if (idx === -1) return <span className={className}>{formatted}</span>;
  const main = formatted.slice(0, idx);
  const cents = formatted.slice(idx);
  return (
    <span className={className}>
      {main}
      <span className="text-[0.55em] opacity-70 ml-0.5 align-baseline tabular-nums">{cents}</span>
    </span>
  );
}
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

// Tarefa achatada da linha temporal (view vw_tarefas_processo).
interface TarefaRow {
  processo_id: string;
  numero_processo: string;
  cliente_nome: string | null;
  materia: string | null;
  fase_processual: string | null;
  tipo: "acao" | "monitoramento" | "pendencia";
  titulo: string;
  conteudo: string | null;
  prazo: string | null;
  desfecho: string | null;
}

const hojeISO = () => new Date().toISOString().slice(0, 10);
const emDiasISO = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

// "venceu há 3 dias" / "hoje" / "em 5 dias" + a cor da urgência.
function urgencia(prazo: string) {
  const dias = Math.round(
    (new Date(prazo + "T00:00:00").getTime() - new Date(hojeISO() + "T00:00:00").getTime()) / 86400000,
  );
  if (dias < 0) return { dias, label: `venceu há ${Math.abs(dias)}d`, cls: "text-rose-400", chip: "bg-rose-500/15 text-rose-400 ring-rose-500/30" };
  if (dias === 0) return { dias, label: "vence hoje", cls: "text-rose-400", chip: "bg-rose-500/15 text-rose-400 ring-rose-500/30" };
  if (dias <= 3) return { dias, label: `em ${dias}d`, cls: "text-orange-400", chip: "bg-orange-500/15 text-orange-400 ring-orange-500/30" };
  if (dias <= 7) return { dias, label: `em ${dias}d`, cls: "text-amber-400", chip: "bg-amber-500/15 text-amber-400 ring-amber-500/30" };
  return { dias, label: `em ${dias}d`, cls: "text-muted-foreground", chip: "bg-muted/30 text-muted-foreground ring-border" };
}

export default function Dashboard() {
  useEffect(() => { document.title = "Dashboard · AW ECO ME"; }, []);
  const navigate = useNavigate();
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [totalClientes, setTotalClientes] = useState(0);
  const [tarefas, setTarefas] = useState<TarefaRow[]>([]);
  const [esteira, setEsteira] = useState({ prontas: 0, emProducao: 0 });
  const [janela, setJanela] = useState<"vencidas" | "7" | "30">("vencidas");

  useEffect(() => {
    (async () => {
      const [{ data: procs }, { count: cliCount }, { data: tks }, { data: dem }] =
        await Promise.all([
          supabase
            .from("processos")
            .select("id, numero_processo, cliente_id, materia, data_ultimo_andamento, prazo_processual, fase_processual, tipo_pendencia, status_tarefa, vara_juizo_origem, valor_causa, comarca_uf, parceiro, clientes(nome)"),
          // Sem os arquivados: o número tem que bater com a lista de Clientes.
          supabase.from("clientes").select("*", { count: "exact", head: true })
            .is("arquivado_em" as any, null),
          supabase
            .from("vw_tarefas_processo" as never)
            .select("processo_id, numero_processo, cliente_nome, materia, fase_processual, tipo, titulo, conteudo, prazo, desfecho")
            .is("desfecho", null)
            .not("prazo", "is", null)
            .order("prazo", { ascending: true }),
          supabase.from("demandas" as never).select("etapa").eq("status", "pendente"),
        ]);
      if (procs) setProcessos(procs as unknown as Processo[]);
      setTotalClientes(cliCount ?? 0);
      if (tks) setTarefas(tks as unknown as TarefaRow[]);
      if (dem) {
        const rows = dem as unknown as Array<{ etapa: string }>;
        setEsteira({
          prontas: rows.filter((d) => d.etapa === "pronta_para_protocolo").length,
          emProducao: rows.filter((d) =>
            ["analise_vinculada", "fluxo_artesanal", "confeccao_peca", "pendencia_documental"].includes(d.etapa),
          ).length,
        });
      }
    })();
  }, []);

  const tarefasStats = useMemo(() => {
    const hoje = hojeISO();
    const d7 = emDiasISO(7);
    const d30 = emDiasISO(30);
    const abertas = tarefas.filter((t) => t.prazo);
    const vencidas = abertas.filter((t) => t.prazo! < hoje);
    const ate7 = abertas.filter((t) => t.prazo! >= hoje && t.prazo! <= d7);
    const ate30 = abertas.filter((t) => t.prazo! >= hoje && t.prazo! <= d30);
    return {
      total: abertas.length,
      vencidas, ate7, ate30,
      acoes: abertas.filter((t) => t.tipo === "acao").length,
      monitoramento: abertas.filter((t) => t.tipo === "monitoramento").length,
      acoesUrgentes: abertas.filter((t) => t.tipo === "acao" && t.prazo! <= d7).length,
    };
  }, [tarefas]);

  const listaJanela = janela === "vencidas" ? tarefasStats.vencidas
    : janela === "7" ? tarefasStats.ate7 : tarefasStats.ate30;

  const stats = useMemo(() => {
    const total = processos.length;
    const sumValor = (list: Processo[]) => list.reduce((s, p) => s + (Number(p.valor_causa) || 0), 0);
    const valorTotal = sumValor(processos);
    const comValor = processos.filter((p) => p.valor_causa != null);
    const valorMedio = comValor.length ? valorTotal / comValor.length : 0;

    // Soma de valores por estado processual
    const valorAjuizado   = sumValor(processos.filter((p) => p.fase_processual !== "ARQUIVADO"));
    const valorAtivo      = sumValor(processos.filter((p) => p.fase_processual !== "ARQUIVADO" && p.fase_processual !== "SUSPENSO"));
    const valorSuspensos  = sumValor(processos.filter((p) => p.fase_processual === "SUSPENSO"));
    const valorArquivados = sumValor(processos.filter((p) => p.fase_processual === "ARQUIVADO"));

    const suspensos = processos.filter((p) => p.fase_processual === "SUSPENSO").length;
    const arquivados = processos.filter((p) => p.fase_processual === "ARQUIVADO").length;
    const emAndamento = total - suspensos - arquivados;
    const comPendencia = processos.filter((p) => p.tipo_pendencia != null && p.tipo_pendencia !== "").length;

    return {
      total, valorTotal, valorMedio,
      valorAjuizado, valorAtivo, valorSuspensos, valorArquivados,
      suspensos, arquivados, emAndamento, comPendencia,
    };
  }, [processos]);

  const distFase = useMemo(() => countBy(processos, (p) => p.fase_processual), [processos]);
  const distMateria = useMemo(() => countBy(processos, (p) => p.materia), [processos]);
  const distComarca = useMemo(() => countBy(processos, (p) => p.comarca_uf), [processos]);
  const distVara = useMemo(() => countBy(processos, (p) => p.vara_juizo_origem), [processos]);
  const distParceiro = useMemo(() => countBy(processos, (p) => p.parceiro), [processos]);
  const distPendencia = useMemo(() => countBy(processos, (p) => p.tipo_pendencia), [processos]);
  const distEtapaTarefa = useMemo(() => countBy(tarefas, (t) => t.titulo), [tarefas]);

  const totalComarca = distComarca.reduce((s, d) => s + d.value, 0);
  const totalParceiro = distParceiro.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-3xl font-medium tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">Visão geral · aba ADV</p>
      </div>

      {/* Destaque: Valor Ajuizado */}
      <SpotlightCard className="p-8 border-primary/20">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-primary/80">Valor Ajuizado</p>
            <p className="text-xs text-muted-foreground mt-1">
              Soma das causas em andamento — exclui processos arquivados
            </p>
            <Money
              value={stats.valorAjuizado}
              className="block text-5xl sm:text-6xl font-semibold font-display mt-4 tracking-tight text-primary"
            />
          </div>
          <div className="hidden sm:flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20 shrink-0">
            <Gavel className="h-8 w-8 text-primary" />
          </div>
        </div>
      </SpotlightCard>

      {/* Quebra do valor por status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SpotlightCard>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Ativo</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">sem suspensos nem arquivados</p>
            <Money
              value={stats.valorAtivo}
              className="block text-2xl font-semibold font-display mt-2 text-emerald-400"
            />
          </div>
        </SpotlightCard>
        <SpotlightCard onClick={() => navigate("/processos?fase=SUSPENSO")} className="cursor-pointer">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Suspensos</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{stats.suspensos} processos parados</p>
            <Money
              value={stats.valorSuspensos}
              className="block text-2xl font-semibold font-display mt-2 text-amber-400"
            />
          </div>
        </SpotlightCard>
        <SpotlightCard onClick={() => navigate("/processos?fase=ARQUIVADO")} className="cursor-pointer">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Arquivados</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{stats.arquivados} processos encerrados</p>
            <Money
              value={stats.valorArquivados}
              className="block text-2xl font-semibold font-display mt-2"
            />
          </div>
        </SpotlightCard>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SpotlightCard onClick={() => navigate("/processos")} className="cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Processos</p>
              <p className="text-3xl font-normal font-display mt-1">{stats.total}</p>
            </div>
            <Briefcase className="h-8 w-8 text-primary/60" />
          </div>
        </SpotlightCard>

        <SpotlightCard onClick={() => navigate("/clientes")} className="cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Clientes</p>
              <p className="text-3xl font-normal font-display mt-1">{totalClientes}</p>
            </div>
            <Users className="h-8 w-8 text-primary/60" />
          </div>
        </SpotlightCard>

        <SpotlightCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Valor Total</p>
              <Money value={stats.valorTotal} className="block text-2xl font-normal font-display mt-1" />
            </div>
            <DollarSign className="h-8 w-8 text-primary/60" />
          </div>
        </SpotlightCard>

        <SpotlightCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Valor Médio</p>
              <Money value={stats.valorMedio} className="block text-2xl font-normal font-display mt-1" />
            </div>
            <TrendingUp className="h-8 w-8 text-primary/60" />
          </div>
        </SpotlightCard>
      </div>

      {/* O que exige alguém hoje */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SpotlightCard
          onClick={() => { setJanela("vencidas"); document.getElementById("prazos")?.scrollIntoView({ behavior: "smooth" }); }}
          className={`cursor-pointer ${tarefasStats.vencidas.length ? "ring-1 ring-rose-500/30" : ""}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Prazos vencidos</p>
              <p className={`text-2xl font-normal font-display mt-1 ${tarefasStats.vencidas.length ? "text-rose-400" : ""}`}>
                {tarefasStats.vencidas.length}
              </p>
            </div>
            <Flame className={`h-7 w-7 ${tarefasStats.vencidas.length ? "text-rose-400/70" : "text-primary/60"}`} />
          </div>
        </SpotlightCard>

        <SpotlightCard onClick={() => navigate("/esteira")} className="cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Prontas pra protocolar</p>
              <p className="text-2xl font-normal font-display mt-1">{esteira.prontas}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                + {esteira.emProducao} em produção
              </p>
            </div>
            <Send className="h-7 w-7 text-primary/60" />
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
              <ListChecks className="h-4 w-4 text-primary" /> Tarefas por etapa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              data={distEtapaTarefa}
              total={tarefasStats.total || 1}
              max={10}
              emptyMessage="Nenhuma tarefa com prazo aberto."
            />
            <p className="text-[11px] text-muted-foreground mt-3 text-center">
              {tarefasStats.total} tarefas abertas com prazo
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

      {/* Central de prazos — a lista some quando não há nada, e abre nos
          vencidos, que é o que ninguém pode deixar passar. */}
      <Card id="prazos" className={tarefasStats.vencidas.length ? "border-rose-500/25" : undefined}>
        <CardHeader>
          <CardTitle className="text-base flex flex-wrap items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" /> Prazos
            <div className="ml-auto flex items-center gap-1">
              {([
                ["vencidas", "Vencidos", tarefasStats.vencidas.length, true],
                ["7", "7 dias", tarefasStats.ate7.length, false],
                ["30", "30 dias", tarefasStats.ate30.length, false],
              ] as const).map(([key, label, qtd, urgente]) => (
                <button
                  key={key}
                  onClick={() => setJanela(key as typeof janela)}
                  className={`text-[11px] px-2.5 py-1 rounded-full ring-1 transition-colors ${
                    janela === key
                      ? urgente && qtd > 0
                        ? "bg-rose-500/15 text-rose-300 ring-rose-500/40"
                        : "bg-primary/15 text-primary ring-primary/40"
                      : "bg-transparent text-muted-foreground ring-border hover:bg-white/[0.04]"
                  }`}
                >
                  {label}
                  <span className={`ml-1.5 tabular-nums ${urgente && qtd > 0 && janela !== key ? "text-rose-400" : "opacity-70"}`}>
                    {qtd}
                  </span>
                </button>
              ))}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {listaJanela.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {janela === "vencidas"
                ? "Nenhum prazo vencido. Carteira em dia. 👏"
                : `Nenhum prazo nos próximos ${janela} dias.`}
            </p>
          ) : (
            <div className="divide-y divide-border/40">
              {listaJanela.map((t) => {
                const u = urgencia(t.prazo!);
                const acao = t.tipo === "acao";
                const Icon = acao ? Zap : Eye;
                return (
                  <div
                    key={`${t.processo_id}-${t.titulo}-${t.prazo}`}
                    className="flex items-center gap-3 py-2.5 px-1 cursor-pointer hover:bg-white/[0.03] rounded"
                    onClick={() => navigate(`/processos/${t.processo_id}`)}
                  >
                    <span className={`h-8 w-8 shrink-0 rounded-lg grid place-items-center ring-1 ${
                      acao ? "bg-primary/12 ring-primary/25" : "bg-muted/30 ring-border"
                    }`}>
                      <Icon className={`h-4 w-4 ${acao ? "text-primary" : "text-muted-foreground"}`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{t.titulo}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {t.cliente_nome ?? "—"} · <span className="font-mono">{t.numero_processo}</span>
                      </p>
                      {t.conteudo && (
                        <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">{t.conteudo}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-sm font-mono ${u.cls}`}>{fmtDate(t.prazo!)}</p>
                      <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full ring-1 mt-0.5 ${u.chip}`}>
                        {u.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button
            onClick={() => navigate("/tarefas")}
            className="w-full mt-3 text-[11px] text-primary hover:underline"
          >
            Ver todas as tarefas
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
