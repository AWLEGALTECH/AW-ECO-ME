import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SpotlightCard } from "@/components/SpotlightCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChart } from "@/components/DonutChart";
import {
  Briefcase, Users, DollarSign, TrendingUp,
  AlertCircle, CalendarClock, MapPin, Scale, Handshake, ClipboardList, ListChecks, Gavel,
  Zap, Eye, Trophy, PauseCircle, Info,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import { hojeISO as diaDeHoje } from "@/lib/hoje";
import {
  resumo as resumirDesfechos, porMateria, porRequerido, porMes,
  type LinhaDesfecho, type FaixaDesfecho, type MesDesfecho,
} from "@/lib/procedencia";

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

const hojeISO = () => diaDeHoje();
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

/* ══════════════════════════════ PROCEDÊNCIA ══════════════════════════════
 *
 * A pergunta que esta seção responde é "quanto a gente ganha", e ela não tinha
 * resposta no sistema: `sentencas` só registra vitória. O denominador vem de
 * `vw_desfecho_processo`, que lê a última decisão publicada no DJEN.
 *
 * AS CORES SÃO DE ESTADO, NÃO DE SÉRIE. Ganhou, ganhou em parte, perdeu: isso é
 * bom / atenção / ruim, e a paleta é a de status, não a de categorias. Os tons
 * 600 foram validados nos dois temas (faixa de luminosidade e contraste passam;
 * a separação para daltonismo fica em 7.9, na faixa que exige codificação
 * secundária). Por isso toda barra tem rótulo direto, legenda e 2px de fundo
 * entre os segmentos: a cor nunca é o único canal.
 */
const COR = {
  procedente: "#059669",   // emerald-600
  parcial: "#d97706",      // amber-600
  improcedente: "#e11d48", // rose-600
} as const;

const NOME_DESFECHO = {
  procedente: "Procedente",
  parcial: "Parcialmente procedente",
  improcedente: "Improcedente",
} as const;

function Legenda({ itens }: { itens: Array<keyof typeof COR> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {itens.map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px]" style={{ background: COR[k] }} />
          {NOME_DESFECHO[k]}
        </span>
      ))}
    </div>
  );
}

/* Cartão de número. `tom` colore só o VALOR, e só quando o número tem lado
   (verde para ganho, vermelho para perda). Rótulo e legenda ficam em texto
   normal: texto não veste cor de dado. */
function Tile({ rotulo, valor, sub, tom, icone: Icone }: {
  rotulo: string; valor: string; sub?: string; tom?: string;
  icone?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <SpotlightCard sutil>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{rotulo}</p>
          <p className={`text-3xl font-normal font-display mt-1 leading-none ${tom ?? ""}`}>{valor}</p>
          {sub && <p className="text-[11px] text-muted-foreground/80 mt-1.5 leading-snug">{sub}</p>}
        </div>
        {Icone && <Icone className="h-6 w-6 text-primary/50 shrink-0 mt-0.5" />}
      </div>
    </SpotlightCard>
  );
}

/* UMA BARRA POR LINHA, comprimento = quantos foram decididos, composição = como
   foi. Os dois canais juntos são o que um advogado quer ver: uma matéria com
   100% e três processos não é a mesma coisa que uma com 24% e vinte e um.
   A barra de 100% de largura só de composição esconderia isso. */
function BarraDesfecho({ f, pico }: { f: FaixaDesfecho; pico: number }) {
  const largura = pico > 0 ? (f.decididos / pico) * 100 : 0;
  const seg = (n: number, cor: string, nome: string, ultimo: boolean) =>
    n > 0 ? (
      <div
        key={nome}
        title={`${nome}: ${n}`}
        className={`h-[18px] ${ultimo ? "rounded-r-[4px]" : ""}`}
        style={{ flex: `${n} 0 0`, background: cor, minWidth: 3 }}
      />
    ) : null;
  const ordem: Array<[number, string, string]> = [
    [f.procedentes, COR.procedente, NOME_DESFECHO.procedente],
    [f.parciais, COR.parcial, NOME_DESFECHO.parcial],
    [f.improcedentes, COR.improcedente, NOME_DESFECHO.improcedente],
  ];
  /* Só o último segmento visível recebe a ponta arredondada: o dado termina
     ali. Procurar de trás pra frente é o jeito de achar sem depender do valor. */
  let ultimoIdx = -1;
  for (let i = ordem.length - 1; i >= 0; i--) { if (ordem[i][0] > 0) { ultimoIdx = i; break; } }
  return (
    <div className="group relative flex items-center gap-3 py-1 rounded-md px-1 hover:bg-white/[0.03]">
      <span className="w-40 sm:w-52 shrink-0 text-[12.5px] truncate" title={f.nome}>{f.nome}</span>
      <div className="flex-1 min-w-0">
        <div className="flex gap-[2px]" style={{ width: `${largura}%`, minWidth: 6 }}>
          {ordem.map((o, i) => seg(o[0], o[1], o[2], i === ultimoIdx))}
        </div>
      </div>
      <span className={`w-11 text-right text-[13px] tabular-nums ${
        f.taxa == null ? "text-muted-foreground" : f.taxa >= 50 ? "text-emerald-400" : "text-rose-400"}`}>
        {f.taxa == null ? "sem dado" : `${f.taxa}%`}
      </span>
      <span className="w-10 text-right text-[11px] text-muted-foreground tabular-nums">{f.decididos}</span>

      {/* A leitura completa no hover, sem depender de acertar um segmento de
          3px. Os mesmos números estão na tabela logo abaixo, então o tooltip
          acrescenta conforto e não é a única porta. */}
      <div className="pointer-events-none absolute left-40 sm:left-52 -top-1 -translate-y-full z-10 hidden group-hover:block
                      rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] shadow-lg whitespace-nowrap">
        <div className="font-medium text-foreground mb-1">{f.nome}</div>
        {ordem.map(([n, cor, nome]) => (
          <div key={nome} className="flex items-center gap-2 text-muted-foreground">
            <span className="h-[2px] w-3" style={{ background: cor }} />
            <span className="tabular-nums text-foreground">{n}</span> {nome.toLowerCase()}
          </div>
        ))}
      </div>
    </div>
  );
}

function TabelaDesfecho({ linhas, rotulo }: { linhas: FaixaDesfecho[]; rotulo: string }) {
  return (
    <details className="mt-3 group/tab">
      <summary className="cursor-pointer text-[11px] text-primary hover:underline select-none">
        Ver como tabela
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border/50">
              <th className="py-1.5 pr-3 font-normal">{rotulo}</th>
              <th className="py-1.5 px-2 font-normal text-right">Proced.</th>
              <th className="py-1.5 px-2 font-normal text-right">Parcial</th>
              <th className="py-1.5 px-2 font-normal text-right">Improc.</th>
              <th className="py-1.5 px-2 font-normal text-right">Decididos</th>
              <th className="py-1.5 pl-2 font-normal text-right">Taxa</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((f) => (
              <tr key={f.nome} className="border-b border-border/30">
                <td className="py-1.5 pr-3 truncate max-w-[16rem]" title={f.nome}>{f.nome}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{f.procedentes}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{f.parciais}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{f.improcedentes}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{f.decididos}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums">{f.taxa == null ? "sem dado" : `${f.taxa}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function TooltipMes({ active, payload }: { active?: boolean; payload?: Array<{ payload: MesDesfecho }> }) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] shadow-lg">
      <div className="font-medium text-foreground mb-1">{m.rotulo}</div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="h-[2px] w-3" style={{ background: COR.procedente }} />
        <span className="tabular-nums text-foreground">{m.ganhos}</span> ganhos
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="h-[2px] w-3" style={{ background: COR.improcedente }} />
        <span className="tabular-nums text-foreground">{m.perdidos}</span> perdidos
      </div>
      <div className="mt-1 text-muted-foreground">
        taxa <span className="tabular-nums text-foreground">{m.taxa == null ? "sem dado" : `${m.taxa}%`}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  useEffect(() => { document.title = "Dashboard · AW ECO ME"; }, []);
  const navigate = useNavigate();
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [totalClientes, setTotalClientes] = useState(0);
  const [tarefas, setTarefas] = useState<TarefaRow[]>([]);
  const [desfechos, setDesfechos] = useState<LinhaDesfecho[]>([]);
  const [nomesReus, setNomesReus] = useState<Record<string, string>>({});
  const [janela, setJanela] = useState<"vencidas" | "7" | "30">("vencidas");

  useEffect(() => {
    (async () => {
      const [{ data: procs }, { count: cliCount }, { data: tks }, { data: desf }, { data: reus }] =
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
          supabase
            .from("vw_desfecho_processo" as never)
            .select("materia, requeridos, fase_processual, desfecho, dt_desfecho, executado, valor_sentenca, no_tracker"),
          supabase.from("requeridos_catalogo" as never).select("chave, nome"),
        ]);
      if (procs) setProcessos(procs as unknown as Processo[]);
      setTotalClientes(cliCount ?? 0);
      if (tks) setTarefas(tks as unknown as TarefaRow[]);
      if (desf) setDesfechos(desf as unknown as LinhaDesfecho[]);
      if (reus) {
        setNomesReus(Object.fromEntries((reus as unknown as { chave: string; nome: string }[]).map((r) => [r.chave, r.nome])));
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

  const proc = useMemo(() => resumirDesfechos(desfechos), [desfechos]);
  const procMateria = useMemo(() => porMateria(desfechos, 3), [desfechos]);
  const procRequerido = useMemo(() => porRequerido(desfechos, nomesReus, 8), [desfechos, nomesReus]);
  const procMes = useMemo(() => porMes(desfechos), [desfechos]);
  const picoMateria = procMateria[0]?.decididos ?? 1;
  const suspensosJuros = useMemo(
    () => desfechos.filter((d) => d.desfecho === "em_andamento" && d.fase_processual === "SUSPENSO" && d.materia === "JUROS E ENCARGOS INDEVIDOS").length,
    [desfechos]);

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
              Soma das causas em andamento, sem os processos arquivados
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

      {/* ═════════════════════════ PROCEDÊNCIA ═════════════════════════ */}
      <section className="space-y-4" aria-labelledby="procedencia">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h3 id="procedencia" className="font-display text-xl font-medium tracking-tight flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" /> Procedência
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Lida da última decisão publicada no DJEN para cada processo
            </p>
          </div>
          <Legenda itens={["procedente", "parcial", "improcedente"]} />
        </div>

        {/* A linha de números. Cada um tem o seu lado: ganho verde, perda
            vermelha, o resto sem cor porque não é nem um nem outro. */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <Tile rotulo="Decididos no mérito" valor={String(proc.decididos)}
                sub={`de ${proc.total} processos`} icone={Gavel} />
          <Tile rotulo="Procedência" valor={proc.taxa == null ? "sem dado" : `${proc.taxa}%`}
                sub={`${proc.ganhos} ganhos em ${proc.decididos} decididos`}
                tom={proc.taxa == null ? undefined : proc.taxa >= 50 ? "text-emerald-400" : "text-rose-400"} />
          <Tile rotulo="Ganhos" valor={String(proc.ganhos)}
                sub={`${proc.procedentes} totais · ${proc.parciais} parciais`} tom="text-emerald-400" icone={Trophy} />
          <Tile rotulo="Perdidos" valor={String(proc.improcedentes)}
                sub="improcedentes" tom="text-rose-400" />
          <Tile rotulo="Fora da taxa" valor={String(proc.acordos + proc.semMerito + proc.pagosSemSentenca)}
                sub={`${proc.acordos} acordos · ${proc.semMerito} sem mérito · ${proc.pagosSemSentenca} pagos sem sentença`} />
          <Tile rotulo="Suspensos" valor={String(proc.suspensos)}
                sub={suspensosJuros > 0 ? `${suspensosJuros} de juros e encargos aguardam o IRDR` : "aguardando decisão do juízo"}
                icone={PauseCircle} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Por matéria: o gráfico principal da seção. */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" /> Por matéria
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  comprimento = decididos · cor = desfecho
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {procMateria.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma decisão de mérito encontrada.</p>
              ) : (
                <>
                  <div className="flex items-center gap-3 px-1 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                    <span className="w-40 sm:w-52 shrink-0">matéria</span>
                    <span className="flex-1" />
                    <span className="w-11 text-right">taxa</span>
                    <span className="w-10 text-right">n</span>
                  </div>
                  <div className="space-y-0.5">
                    {procMateria.map((f) => <BarraDesfecho key={f.nome} f={f} pico={picoMateria} />)}
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 mt-3">
                    Matérias com menos de 3 decisões somam em OUTRAS: uma taxa feita de um processo é 0% ou 100%, e nenhum dos dois informa.
                  </p>
                  <TabelaDesfecho linhas={procMateria} rotulo="Matéria" />
                </>
              )}
            </CardContent>
          </Card>

          {/* Por requerido: mais de sete classes, então é tabela. */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Handshake className="h-4 w-4 text-primary" /> Por requerido
              </CardTitle>
            </CardHeader>
            <CardContent>
              {procRequerido.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sem decisões.</p>
              ) : (
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border/50 text-[11px] uppercase tracking-wider">
                      <th className="py-1.5 pr-2 font-normal">Requerido</th>
                      <th className="py-1.5 px-1 font-normal text-right">Ganhos</th>
                      <th className="py-1.5 px-1 font-normal text-right">Perdas</th>
                      <th className="py-1.5 pl-1 font-normal text-right">Taxa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {procRequerido.map((f) => (
                      <tr key={f.nome} className="border-b border-border/30">
                        <td className="py-2 pr-2 truncate max-w-[12rem]" title={f.nome}>{f.nome}</td>
                        <td className="py-2 px-1 text-right tabular-nums">{f.procedentes + f.parciais}</td>
                        <td className="py-2 px-1 text-right tabular-nums">{f.improcedentes}</td>
                        <td className={`py-2 pl-1 text-right tabular-nums ${
                          f.taxa == null ? "text-muted-foreground" : f.taxa >= 50 ? "text-emerald-400" : "text-rose-400"}`}>
                          {f.taxa == null ? "sem dado" : `${f.taxa}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="text-[11px] text-muted-foreground/70 mt-3">
                Litisconsórcio conta o processo em cada réu.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Mês a mês. Colunas empilhadas de quantidade e a taxa como rótulo em
            cima: dois números, um eixo. */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" /> Decisões por mês
              <span className="ml-auto"><Legenda itens={["procedente", "improcedente"]} /></span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {procMes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sem decisões datadas.</p>
            ) : (
              <div className="h-[230px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={procMes} margin={{ top: 22, right: 8, left: -14, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                    <XAxis dataKey="rotulo" tickLine={false} axisLine={false}
                           tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36}
                           tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip content={<TooltipMes />} cursor={{ fill: "hsl(var(--muted) / 0.25)" }} />
                    <Bar dataKey="ganhos" name="ganhos" stackId="d" fill={COR.procedente} barSize={18}
                         stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive={false} />
                    <Bar dataKey="perdidos" name="perdidos" stackId="d" fill={COR.improcedente} barSize={18}
                         radius={[4, 4, 0, 0]} stroke="hsl(var(--card))" strokeWidth={2} isAnimationActive={false}>
                      <LabelList dataKey="taxa" position="top" offset={6}
                                 formatter={(v: number | null) => (v == null ? "" : `${v}%`)}
                                 style={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground/70 mt-2">
              O rótulo em cima de cada mês é a taxa daquele mês. Só meses com decisão de mérito aparecem.
            </p>
          </CardContent>
        </Card>

        {/* Como o número é feito. Sem isto, a taxa vira um número que ninguém
            sabe defender numa reunião. */}
        <div className="flex gap-3 rounded-lg border border-border/60 bg-card/50 px-4 py-3 text-[12px] text-muted-foreground leading-relaxed">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary/70" />
          <div>
            <span className="text-foreground/90">Como a taxa é calculada.</span> O desfecho de cada processo é
            a última decisão publicada no DJEN. Ganho é procedente ou parcialmente procedente; perdido é
            improcedente. Acordos, extinções sem mérito e pagamentos sem sentença ficam fora do cálculo.
            {proc.executados > 0 && <> {proc.executados} vitórias já foram extintas por pagamento.</>}
            {proc.valorGanho > 0 && <> Valor sentenciado registrado: {fmtBRLfull(proc.valorGanho)}.</>}
            {proc.ganhosForaDoTracker > 0 && (
              <> O DJEN encontra <span className="text-foreground/90">{proc.ganhosForaDoTracker}</span> vitórias
              que ainda não estão no Tracker.</>
            )}
          </div>
        </div>
      </section>

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

      {/* Central de prazos. A lista some quando não há nada, e abre nos
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
                        {t.cliente_nome ?? "sem cliente"} · <span className="font-mono">{t.numero_processo}</span>
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
