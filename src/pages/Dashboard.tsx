import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SpotlightCard } from "@/components/SpotlightCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DonutChart } from "@/components/DonutChart";
import {
  Briefcase, Users, DollarSign, TrendingUp,
  AlertCircle, CalendarClock, MapPin, Scale, Handshake, ClipboardList, ListChecks, Gavel,
  Zap, Eye, Trophy, PauseCircle, Info, type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import { hojeISO as diaDeHoje } from "@/lib/hoje";
import { useCorPrimaria } from "@/hooks/useCorPrimaria";
import { useContador } from "@/hooks/useContador";
import {
  resumo as resumirDesfechos, porMateria, porRequerido, porMes,
  type LinhaDesfecho, type FaixaDesfecho, type MesDesfecho,
} from "@/lib/procedencia";

const EASE = [0.22, 1, 0.36, 1] as const;

const fmtBRLfull = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// Renderiza o valor em BRL com a casa dos centavos em fonte menor (0.55em)
// para que o valor inteiro seja a parte visualmente dominante.
function Money({ value, className, animado = true }: { value: number; className?: string; animado?: boolean }) {
  const mostrado = useContador(value, animado ? 900 : 0);
  const formatted = fmtBRLfull(mostrado);
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

/** Inteiro que sobe até o valor. */
function Numero({ value, className }: { value: number; className?: string }) {
  const v = useContador(value);
  return <span className={className}>{Math.round(v).toLocaleString("pt-BR")}</span>;
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

/* ─────────────────────────── peças de layout ───────────────────────────── */

/** Entrada suave e escalonada. `i` é a posição na fila. */
function Entra({ i = 0, children, className }: { i?: number; children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: EASE, delay: Math.min(i, 12) * 0.045 }}
    >
      {children}
    </motion.div>
  );
}

/** Cabeçalho de seção: etiqueta pequena na cor do tema, título, e um fio que se apaga. */
function Secao({ etiqueta, titulo, sub, direita }: { etiqueta: string; titulo: string; sub?: string; direita?: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary/70">{etiqueta}</p>
          <h3 className="font-display text-xl font-medium tracking-tight mt-0.5">{titulo}</h3>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
        {direita}
      </div>
      <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />
    </div>
  );
}

/* Cartão que reage ao mouse: sobe dois pixels e a borda acende na cor do tema.
   O brilho do SpotlightCard já acompanha o cursor; isto acrescenta a resposta
   de "isto é clicável / isto está vivo" sem competir com o conteúdo. */
const CARTAO_VIVO = "transition-all duration-300 hover:-translate-y-[2px] hover:border-primary/30";

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
    <div className="space-y-1">
      {items.map((it, i) => {
        const pct = (it.value / peak) * 100;
        const sharePct = total > 0 ? ((it.value / total) * 100).toFixed(0) : "0";
        return (
          <div
            key={it.name}
            className={`group relative overflow-hidden rounded-md px-2.5 py-1.5 transition-colors ${onItemClick ? "cursor-pointer hover:bg-primary/[0.06]" : ""}`}
            onClick={() => onItemClick?.(it.name)}
          >
            <motion.div
              className="absolute inset-y-0 left-0 rounded-r-[4px] bg-primary/[0.14] group-hover:bg-primary/[0.22] transition-colors"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: EASE, delay: 0.05 + i * 0.03 }}
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

// "venceu há 3 dias" / "hoje" / "em 5 dias" + a cor da urgência, em tons suaves.
function urgencia(prazo: string) {
  const dias = Math.round(
    (new Date(prazo + "T00:00:00").getTime() - new Date(hojeISO() + "T00:00:00").getTime()) / 86400000,
  );
  if (dias < 0) return { dias, label: `venceu há ${Math.abs(dias)}d`, cls: "text-rose-300", chip: "bg-rose-400/10 text-rose-300 ring-rose-400/25" };
  if (dias === 0) return { dias, label: "vence hoje", cls: "text-rose-300", chip: "bg-rose-400/10 text-rose-300 ring-rose-400/25" };
  if (dias <= 3) return { dias, label: `em ${dias}d`, cls: "text-orange-300", chip: "bg-orange-400/10 text-orange-300 ring-orange-400/25" };
  if (dias <= 7) return { dias, label: `em ${dias}d`, cls: "text-amber-200", chip: "bg-amber-400/10 text-amber-200 ring-amber-400/25" };
  return { dias, label: `em ${dias}d`, cls: "text-muted-foreground", chip: "bg-muted/30 text-muted-foreground ring-border" };
}

/* ══════════════════════════════ PROCEDÊNCIA ══════════════════════════════
 *
 * A pergunta que esta seção responde é "quanto a gente ganha em primeiro
 * grau". Ela não tinha resposta: `sentencas` só registra vitória. O denominador
 * vem de `vw_desfecho_processo`, que lê a última decisão publicada no DJEN.
 *
 * A COR É A DO TEMA, E A DERROTA É CINZA. Ganho cheio na cor do tema, ganho
 * parcial na mesma cor com transparência, perda em cinza neutro. É a forma de
 * ênfase (uma cor e o resto recua): o olho vai pro que foi conquistado, e a
 * perda aparece como ausência, sem alarme vermelho. Taxa é um fato, não um
 * julgamento, então o número não muda de cor conforme o resultado.
 *
 * A cor nunca é o único canal: legenda sempre presente, rótulo direto em cada
 * linha e 2px de fundo entre segmentos.
 */
const CINZA_PERDA = "hsl(0 0% 44%)";

const NOME_DESFECHO = {
  procedente: "Procedente",
  parcial: "Parcialmente procedente",
  improcedente: "Improcedente",
} as const;

function Legenda({ itens, cor }: { itens: Array<keyof typeof NOME_DESFECHO>; cor: (a?: number) => string }) {
  const tinta = { procedente: cor(), parcial: cor(0.45), improcedente: CINZA_PERDA };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {itens.map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px]" style={{ background: tinta[k] }} />
          {NOME_DESFECHO[k]}
        </span>
      ))}
    </div>
  );
}

/* Cartão de número. O valor pode receber um tom, mas o padrão é texto normal:
   texto não veste cor de dado, e um painel onde tudo tem cor não destaca nada. */
function Tile({ rotulo, valor, sub, tom, icone: Icone, i = 0 }: {
  rotulo: string; valor: ReactNode; sub?: string; tom?: string; icone?: LucideIcon; i?: number;
}) {
  return (
    <Entra i={i}>
      <SpotlightCard sutil className={CARTAO_VIVO}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{rotulo}</p>
            <p className={`text-3xl font-normal font-display mt-1.5 leading-none ${tom ?? ""}`}>{valor}</p>
            {sub && <p className="text-[11px] text-muted-foreground/80 mt-2 leading-snug">{sub}</p>}
          </div>
          {Icone && (
            <span className="shrink-0 rounded-xl bg-primary/10 ring-1 ring-primary/15 p-2">
              <Icone className="h-4 w-4 text-primary/80" />
            </span>
          )}
        </div>
      </SpotlightCard>
    </Entra>
  );
}

/* UMA BARRA POR LINHA, comprimento = quantos foram decididos, composição = como
   foi. Os dois canais juntos são o que um advogado quer ver: uma matéria com
   100% e três processos não é a mesma coisa que uma com 24% e vinte e um. */
function BarraDesfecho({ f, pico, cor, i }: { f: FaixaDesfecho; pico: number; cor: (a?: number) => string; i: number }) {
  const largura = pico > 0 ? (f.decididos / pico) * 100 : 0;
  const ordem: Array<[number, string, string]> = [
    [f.procedentes, cor(), NOME_DESFECHO.procedente],
    [f.parciais, cor(0.45), NOME_DESFECHO.parcial],
    [f.improcedentes, CINZA_PERDA, NOME_DESFECHO.improcedente],
  ];
  /* Só o último segmento visível recebe a ponta arredondada: o dado termina ali. */
  let ultimoIdx = -1;
  for (let k = ordem.length - 1; k >= 0; k--) { if (ordem[k][0] > 0) { ultimoIdx = k; break; } }

  return (
    <div className="group relative flex items-center gap-3 py-1 rounded-md px-1 transition-colors hover:bg-primary/[0.05]">
      <span className="w-40 sm:w-52 shrink-0 text-[12.5px] truncate" title={f.nome}>{f.nome}</span>
      <div className="flex-1 min-w-0">
        <motion.div
          className="flex gap-[2px] transition-[filter] duration-300 group-hover:brightness-110"
          initial={{ width: 0 }}
          animate={{ width: `${largura}%` }}
          transition={{ duration: 0.7, ease: EASE, delay: 0.1 + i * 0.05 }}
          style={{ minWidth: 6 }}
        >
          {ordem.map(([n, tinta, nome], k) => n > 0 ? (
            <div
              key={nome}
              title={`${nome}: ${n}`}
              className={`h-[18px] ${k === ultimoIdx ? "rounded-r-[4px]" : ""}`}
              style={{ flex: `${n} 0 0`, background: tinta, minWidth: 3 }}
            />
          ) : null)}
        </motion.div>
      </div>
      <span className="w-12 text-right text-[13px] tabular-nums text-foreground/90">
        {f.taxa == null ? "sem dado" : `${f.taxa}%`}
      </span>
      <span className="w-8 text-right text-[11px] text-muted-foreground tabular-nums">{f.decididos}</span>

      {/* A leitura completa no hover, sem depender de acertar um segmento de
          3px. Os mesmos números estão na tabela logo abaixo. */}
      <div className="pointer-events-none absolute left-40 sm:left-52 -top-1 -translate-y-full z-10 hidden group-hover:block
                      rounded-lg border border-border bg-popover/95 backdrop-blur px-2.5 py-1.5 text-[11px] shadow-xl whitespace-nowrap">
        <div className="font-medium text-foreground mb-1">{f.nome}</div>
        {ordem.map(([n, tinta, nome]) => (
          <div key={nome} className="flex items-center gap-2 text-muted-foreground">
            <span className="h-[2px] w-3 rounded-full" style={{ background: tinta }} />
            <span className="tabular-nums text-foreground">{n}</span> {nome.toLowerCase()}
          </div>
        ))}
      </div>
    </div>
  );
}

function TabelaDesfecho({ linhas, rotulo }: { linhas: FaixaDesfecho[]; rotulo: string }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[11px] text-primary/90 hover:text-primary hover:underline select-none transition-colors">
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
              <tr key={f.nome} className="border-b border-border/30 hover:bg-primary/[0.04] transition-colors">
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

function TooltipMes({ active, payload, cor }: {
  active?: boolean; payload?: Array<{ payload: MesDesfecho }>; cor: (a?: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover/95 backdrop-blur px-2.5 py-1.5 text-[11px] shadow-xl">
      <div className="font-medium text-foreground mb-1">{m.rotulo}</div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="h-[2px] w-3 rounded-full" style={{ background: cor() }} />
        <span className="tabular-nums text-foreground">{m.ganhos}</span> ganhos
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="h-[2px] w-3 rounded-full" style={{ background: CINZA_PERDA }} />
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
  const { cor } = useCorPrimaria();
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
    <div className="space-y-8">
      <Entra>
        <p className="text-[10px] uppercase tracking-[0.2em] text-primary/70">AW ECO ME</p>
        <h2 className="font-display text-3xl font-medium tracking-tight mt-0.5">Dashboard</h2>
        <p className="text-sm text-muted-foreground mt-1">Visão geral · aba ADV</p>
      </Entra>

      {/* Destaque: Valor Ajuizado. Único número-herói da página. */}
      <Entra i={1}>
        <SpotlightCard className={`relative overflow-hidden p-8 border-primary/20 ${CARTAO_VIVO}`}>
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex items-start justify-between gap-6">
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
      </Entra>

      {/* Quebra do valor por status, em tons suaves. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Entra i={2}>
          <SpotlightCard sutil className={CARTAO_VIVO}>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Ativo</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">sem suspensos nem arquivados</p>
            <Money value={stats.valorAtivo} className="block text-2xl font-semibold font-display mt-2 text-emerald-300/90" />
          </SpotlightCard>
        </Entra>
        <Entra i={3}>
          <SpotlightCard sutil onClick={() => navigate("/processos?fase=SUSPENSO")} className={`cursor-pointer ${CARTAO_VIVO}`}>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Suspensos</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{stats.suspensos} processos parados</p>
            <Money value={stats.valorSuspensos} className="block text-2xl font-semibold font-display mt-2 text-amber-200/80" />
          </SpotlightCard>
        </Entra>
        <Entra i={4}>
          <SpotlightCard sutil onClick={() => navigate("/processos?fase=ARQUIVADO")} className={`cursor-pointer ${CARTAO_VIVO}`}>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Arquivados</p>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">{stats.arquivados} processos encerrados</p>
            <Money value={stats.valorArquivados} className="block text-2xl font-semibold font-display mt-2 text-foreground/80" />
          </SpotlightCard>
        </Entra>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile i={5} rotulo="Processos" valor={<Numero value={stats.total} />} icone={Briefcase} />
        <Tile i={6} rotulo="Clientes" valor={<Numero value={totalClientes} />} icone={Users} />
        <Tile i={7} rotulo="Valor Total" valor={<Money value={stats.valorTotal} className="text-2xl" />} icone={DollarSign} />
        <Tile i={8} rotulo="Valor Médio" valor={<Money value={stats.valorMedio} className="text-2xl" />} icone={TrendingUp} />
      </div>

      {/* ═════════════════════════ PROCEDÊNCIA ═════════════════════════ */}
      <section className="space-y-4" aria-labelledby="procedencia">
        <Entra i={9}>
          <Secao
            etiqueta="Resultado"
            titulo="Procedência em 1º grau"
            sub="Sentenças lidas do DJEN. Os acórdãos publicados até aqui mantiveram a sentença."
            direita={<Legenda itens={["procedente", "parcial", "improcedente"]} cor={cor} />}
          />
        </Entra>

        {/* A linha de números. Taxa e ganhos na cor do tema; perda em texto
            normal. Nada aqui grita: o número é um fato, não um julgamento. */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <Tile i={10} rotulo="Decididos no mérito" valor={<Numero value={proc.decididos} />}
                sub={`de ${proc.total} processos`} icone={Gavel} />
          <Tile i={11} rotulo="Procedência (1º grau)"
                valor={proc.taxa == null ? "sem dado" : <><Numero value={proc.taxa} />%</>}
                sub={`${proc.ganhos} ganhos em ${proc.decididos} decididos`} tom="text-primary" />
          <Tile i={12} rotulo="Ganhos" valor={<Numero value={proc.ganhos} />}
                sub={`${proc.procedentes} totais · ${proc.parciais} parciais`} tom="text-primary" icone={Trophy} />
          <Tile i={13} rotulo="Perdidos" valor={<Numero value={proc.improcedentes} />}
                sub="improcedentes" tom="text-foreground/75" />
          <Tile i={14} rotulo="Fora da taxa" valor={<Numero value={proc.acordos + proc.semMerito + proc.pagosSemSentenca} />}
                sub={`${proc.acordos} acordos · ${proc.semMerito} sem mérito · ${proc.pagosSemSentenca} pagos sem sentença`} />
          <Tile i={15} rotulo="Suspensos" valor={<Numero value={proc.suspensos} />}
                sub={suspensosJuros > 0 ? `${suspensosJuros} de juros e encargos aguardam o IRDR` : "aguardando decisão do juízo"}
                icone={PauseCircle} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Por matéria: o gráfico principal da seção. */}
          <Entra i={16} className="lg:col-span-3">
            <Card className={`h-full ${CARTAO_VIVO}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" /> Por matéria
                  <span className="ml-auto text-[11px] font-normal text-muted-foreground">
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
                      <span className="w-12 text-right">taxa</span>
                      <span className="w-8 text-right">n</span>
                    </div>
                    <div className="space-y-0.5">
                      {procMateria.map((f, i) => <BarraDesfecho key={f.nome} f={f} pico={picoMateria} cor={cor} i={i} />)}
                    </div>
                    <p className="text-[11px] text-muted-foreground/70 mt-3">
                      Matérias com menos de 3 decisões somam em OUTRAS: uma taxa feita de um processo é 0% ou 100%, e nenhum dos dois informa.
                    </p>
                    <TabelaDesfecho linhas={procMateria} rotulo="Matéria" />
                  </>
                )}
              </CardContent>
            </Card>
          </Entra>

          {/* Por requerido: mais de sete classes, então é tabela. */}
          <Entra i={17} className="lg:col-span-2">
            <Card className={`h-full ${CARTAO_VIVO}`}>
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
                      <tr className="text-left text-muted-foreground border-b border-border/50 text-[10px] uppercase tracking-wider">
                        <th className="py-1.5 pr-2 font-normal">Requerido</th>
                        <th className="py-1.5 px-1 font-normal text-right">Ganhos</th>
                        <th className="py-1.5 px-1 font-normal text-right">Perdas</th>
                        <th className="py-1.5 pl-1 font-normal text-right">Taxa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {procRequerido.map((f) => (
                        <tr key={f.nome} className="border-b border-border/30 hover:bg-primary/[0.04] transition-colors">
                          <td className="py-2 pr-2 truncate max-w-[12rem]" title={f.nome}>{f.nome}</td>
                          <td className="py-2 px-1 text-right tabular-nums text-primary/90">{f.procedentes + f.parciais}</td>
                          <td className="py-2 px-1 text-right tabular-nums text-muted-foreground">{f.improcedentes}</td>
                          <td className="py-2 pl-1 text-right tabular-nums text-foreground/90">
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
          </Entra>
        </div>

        {/* Mês a mês. Colunas empilhadas de quantidade e a taxa como rótulo em
            cima: dois números, um eixo. */}
        <Entra i={18}>
          <Card className={CARTAO_VIVO}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" /> Decisões por mês
                <span className="ml-auto"><Legenda itens={["procedente", "improcedente"]} cor={cor} /></span>
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
                      <Tooltip content={<TooltipMes cor={cor} />} cursor={{ fill: cor(0.06) }} />
                      <Bar dataKey="ganhos" name="ganhos" stackId="d" fill={cor()} barSize={18}
                           stroke="hsl(var(--card))" strokeWidth={2} animationDuration={700} animationEasing="ease-out" />
                      <Bar dataKey="perdidos" name="perdidos" stackId="d" fill={CINZA_PERDA} barSize={18}
                           radius={[4, 4, 0, 0]} stroke="hsl(var(--card))" strokeWidth={2} animationDuration={700} animationEasing="ease-out">
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
        </Entra>

        {/* Como o número é feito. Sem isto, a taxa vira um número que ninguém
            sabe defender numa reunião. */}
        <Entra i={19}>
          <div className="flex gap-3 rounded-xl border border-primary/15 bg-primary/[0.04] px-4 py-3 text-[12px] text-muted-foreground leading-relaxed">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary/70" />
            <div>
              <span className="text-foreground/90">Como a taxa é calculada.</span> É a procedência em primeiro
              grau: para cada processo vale a última decisão publicada no DJEN. Ganho é procedente ou
              parcialmente procedente; perdido é improcedente. Acordos, extinções sem mérito e pagamentos sem
              sentença ficam fora do cálculo. Os acórdãos encontrados negaram provimento e mantiveram a sentença,
              então o resultado de 1º grau é também o resultado atual.
              {proc.executados > 0 && <> {proc.executados} vitórias já foram extintas por pagamento.</>}
              {proc.valorGanho > 0 && <> Valor sentenciado registrado: {fmtBRLfull(proc.valorGanho)}.</>}
              {proc.ganhosForaDoTracker > 0 && (
                <> O DJEN encontra <span className="text-foreground/90">{proc.ganhosForaDoTracker}</span> vitórias
                que ainda não estão no Tracker.</>
              )}
            </div>
          </div>
        </Entra>
      </section>

      {/* ═════════════════════════ CARTEIRA ═════════════════════════ */}
      <section className="space-y-4">
        <Entra i={20}>
          <Secao etiqueta="Carteira" titulo="Distribuição dos processos" />
        </Entra>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Entra i={21}>
            <Card className={`h-full ${CARTAO_VIVO}`}>
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
          </Entra>

          <Entra i={22}>
            <Card className={`h-full ${CARTAO_VIVO}`}>
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
          </Entra>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Entra i={23}>
            <Card className={`h-full ${CARTAO_VIVO}`}>
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
          </Entra>

          <Entra i={24}>
            <Card className={`h-full ${CARTAO_VIVO}`}>
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
          </Entra>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Entra i={25}>
            <Card className={`h-full ${CARTAO_VIVO}`}>
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
          </Entra>

          <Entra i={26}>
            <Card className={`h-full ${CARTAO_VIVO}`}>
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
          </Entra>

          <Entra i={27}>
            <Card className={`h-full ${CARTAO_VIVO}`}>
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
          </Entra>
        </div>
      </section>

      {/* ═════════════════════════ PRAZOS ═════════════════════════ */}
      <section className="space-y-4">
        <Entra i={28}>
          <Secao etiqueta="Agenda" titulo="Prazos" sub="A lista abre nos vencidos, que é o que ninguém pode deixar passar." />
        </Entra>
        <Entra i={29}>
          <Card id="prazos" className={`${CARTAO_VIVO} ${tarefasStats.vencidas.length ? "border-rose-400/20" : ""}`}>
            <CardHeader>
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                <CalendarClock className="h-4 w-4 text-primary" /> Próximos
                <div className="ml-auto flex items-center gap-1">
                  {([
                    ["vencidas", "Vencidos", tarefasStats.vencidas.length, true],
                    ["7", "7 dias", tarefasStats.ate7.length, false],
                    ["30", "30 dias", tarefasStats.ate30.length, false],
                  ] as const).map(([key, label, qtd, urgente]) => (
                    <button
                      key={key}
                      onClick={() => setJanela(key as typeof janela)}
                      className={`text-[11px] px-2.5 py-1 rounded-full ring-1 transition-all duration-200 ${
                        janela === key
                          ? urgente && qtd > 0
                            ? "bg-rose-400/10 text-rose-200 ring-rose-400/30"
                            : "bg-primary/15 text-primary ring-primary/40"
                          : "bg-transparent text-muted-foreground ring-border hover:bg-primary/[0.06] hover:ring-primary/30"
                      }`}
                    >
                      {label}
                      <span className={`ml-1.5 tabular-nums ${urgente && qtd > 0 && janela !== key ? "text-rose-300" : "opacity-70"}`}>
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
                        className="flex items-center gap-3 py-2.5 px-1 cursor-pointer rounded transition-colors hover:bg-primary/[0.05]"
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
                className="w-full mt-3 text-[11px] text-primary/90 hover:text-primary hover:underline transition-colors"
              >
                Ver todas as tarefas
              </button>
            </CardContent>
          </Card>
        </Entra>
      </section>
    </div>
  );
}
