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
  Handshake, CalendarClock, CheckCircle2, Landmark, Check,
} from "lucide-react";

/* ─────────────────────────── tipos ───────────────────────────
   O Tracker é um REFLEXO do System: tudo vem da linha_temporal dos
   processos. Não há registro manual (trânsito/cumprimento) nem status
   editável só aqui — a fase é lida de onde o processo realmente está.
   A conta de quanto cada processo vale vive em @/lib/tracker, testada à parte. */
import {
  derivarVitorias, ETAPA_SENTENCA, ETAPA_JULGAMENTO, ETAPA_CUMPRIMENTO, ETAPA_ACORDO,
  ACORDO_TRATATIVA,
  type ProcRow, type Vitoria,
} from "@/lib/tracker";
import { DialogBaixaTracker, type AlvoBaixa } from "@/components/DialogBaixaTracker";

/* ─── fases pós-vitória (só leitura, na ordem processual) ─── */
const FASES_POS: { key: string; label: string; short: string; icon: any; dot: string; text: string; chip: string }[] = [
  { key: ETAPA_SENTENCA,    label: "Sentença (1º grau)",     short: "Sentença",    icon: Hammer,    dot: "bg-primary",     text: "text-primary",     chip: "bg-primary/10 text-primary border-primary/25" },
  { key: "Recurso",         label: "Fase recursal",          short: "Recurso",     icon: Scale,     dot: "bg-violet-400",  text: "text-violet-300",  chip: "bg-violet-400/10 text-violet-300 border-violet-400/25" },
  { key: ETAPA_JULGAMENTO,  label: "Julgamento em 2º grau",  short: "2º grau",     icon: Gavel,     dot: "bg-sky-400",     text: "text-sky-300",     chip: "bg-sky-400/10 text-sky-300 border-sky-400/25" },
  { key: "Trânsito em julgado", label: "Trânsito em julgado", short: "Trânsito",   icon: Milestone, dot: "bg-fuchsia-400", text: "text-fuchsia-300", chip: "bg-fuchsia-400/10 text-fuchsia-300 border-fuchsia-400/25" },
  { key: ETAPA_CUMPRIMENTO, label: "Cumprimento de sentença", short: "Cumprimento", icon: Trophy,   dot: "bg-emerald-400", text: "text-emerald-300", chip: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25" },
  { key: ETAPA_ACORDO,      label: "Acordo",                 short: "Acordo",      icon: Handshake, dot: "bg-primary",     text: "text-primary",     chip: "bg-primary/10 text-primary border-primary/25" },
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

/** Dias entre hoje e uma data ISO (negativo = já passou). */
const diasAte = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const [y, mo, d] = iso.split("-").map(Number);
  if (!y || !mo || !d) return null;
  const alvo = new Date(y, mo - 1, d); alvo.setHours(0, 0, 0, 0);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
};
const rotuloPrazo = (dias: number) =>
  dias < 0 ? `atrasado há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "dia" : "dias"}`
    : dias === 0 ? "é hoje"
      : dias === 1 ? "amanhã"
        : `em ${dias} dias`;

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

/* ══════════════════════════ página ══════════════════════════ */
export default function Tracker() {
  // A baixa também acontece daqui, não só pela ficha: quando o alvará cai, é
  // esta lista que a pessoa está olhando.
  const [baixa, setBaixa] = useState<AlvoBaixa | null>(null);
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

  /* ── deriva as vitórias (sentença procedente/parcial ou acordo) do System ── */
  const vitorias = useMemo<Vitoria[]>(() => derivarVitorias(processos), [processos]);

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
    // Duas lentes que não se confundem: "ganho em 1º grau" é resultado de
    // julgamento e conta TODA sentença procedente, inclusive as que depois
    // viraram acordo; "fechado em acordo" conta o que foi negociado. Somar as
    // duas não faz sentido, e é por isso que cada uma tem seu próprio card.
    const comSentenca = vBase.filter((v) => v.valorSentenca > 0);
    const totalGanho = comSentenca.reduce((a, v) => a + v.valorSentenca, 0);
    const comAcordo = vBase.filter((v) => v.acordo);
    const totalAcordo = comAcordo.reduce((a, v) => a + (v.acordo?.valor ?? 0), 0);
    // ROTATIVIDADE: quem já recebeu saiu do Tracker. Ele não desaparece — vai
    // pro bloco de baixados, que é o que mostra o giro do mês. Mas some de
    // tudo que responde "quanto ainda vai entrar", senão o Tracker cobraria
    // dinheiro que já está na conta.
    const baixados = vBase.filter((v) => v.baixado);
    const emCumprimento = vBase.filter((v) => v.emCumprimento && !v.baixado);
    const valorCumprimento = emCumprimento.reduce((a, v) => a + v.valorCumprimento, 0);
    const ticket = vBase.length ? vBase.reduce((a, v) => a + v.valor, 0) / vBase.length : 0;
    const porFase: Record<string, { n: number; valor: number }> = {};
    for (const f of FASES_POS) porFase[f.key] = { n: 0, valor: 0 };
    for (const v of vBase) { const b = porFase[v.faseAtual] || (porFase[v.faseAtual] = { n: 0, valor: 0 }); b.n += 1; b.valor += v.valor; }
    // Dentro dos acordos, o que separa é se o dinheiro entrou. "Em tratativa"
    // e "aguardando pagamento" são os dois lados de uma promessa que ainda não
    // virou dinheiro; arquivado é a que virou.
    const aReceber = comAcordo.filter((v) => !v.acordo?.pago && !v.baixado);
    const recebidos = comAcordo.filter((v) => v.acordo?.pago);
    const emTratativa = aReceber.filter((v) => v.acordo?.status === ACORDO_TRATATIVA).length;

    return {
      totalGanho, nSentencas: comSentenca.length,
      totalAcordo, nAcordos: comAcordo.length,
      aReceberValor: aReceber.reduce((a, v) => a + (v.acordo?.valor ?? 0), 0),
      nAReceber: aReceber.length,
      emTratativa,
      recebidoValor: recebidos.reduce((a, v) => a + (v.acordo?.valor ?? 0), 0),
      nRecebidos: recebidos.length,
      transitou: (porFase[ETAPA_CUMPRIMENTO]?.valor ?? 0) + (porFase["Trânsito em julgado"]?.valor ?? 0),
      baixados,
      baixadoValor: baixados.reduce((a, v) => a + v.valor, 0),
      // Fila de cobrança: primeiro os que têm previsão, do mais próximo ao mais
      // distante; os sem data caem no fim, que é onde uma cobrança sem prazo
      // pertence.
      aReceber: [...aReceber].sort((a, b) =>
        (a.acordo?.previsao ?? "9999").localeCompare(b.acordo?.previsao ?? "9999")),
      valorCumprimento, nCumprimento: emCumprimento.length, ticket, porFase, emCumprimento,
    };
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
      <DialogBaixaTracker
        alvo={baixa}
        onFechar={() => setBaixa(null)}
        /* recarrega as vitórias: o processo baixado sai da lista sozinho,
           porque derivarVitorias passa a marcá-lo como fora do Tracker */
        onBaixado={() => procRes.refetch()}
      />
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-3xl font-medium tracking-tight">Tracker</h2>
          <p className="text-sm text-muted-foreground mt-1">Reflexo do System: o que já foi ganho — em sentença ou em acordo — e o valor quase certo em cumprimento.</p>
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
          {/* ── Dois caminhos para o mesmo dinheiro, um de cada lado ──
              Ganhar no julgamento e fechar um acordo são coisas diferentes, com
              números que não se somam, e misturá-los numa fileira só fazia o
              olho tentar comparar o que não é comparável. Os dois usam a cor do
              tema: sentença e acordo são caminhos diferentes pro MESMO dinheiro,
              e pintar um de outra cor sugeria uma hierarquia que não existe.
              Verde não é grupo, é ESTADO — vale nos dois lados e quer dizer a
              mesma coisa: dinheiro praticamente garantido. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Grupo
              icone={Hammer} titulo="Sentenças" anel="ring-primary/25" tom="text-primary"
              rotulo="Total ganho em 1º grau" valor={m.totalGanho}
              sub={`${m.nSentencas} ${m.nSentencas === 1 ? "sentença procedente" : "sentenças procedentes"}`}
              detalhes={[
                { icone: Trophy, rotulo: "Em cumprimento voluntário", valor: m.valorCumprimento, tom: "text-emerald-400",
                  sub: `${m.nCumprimento} ${m.nCumprimento === 1 ? "processo" : "processos"} · valor quase certo` },
                { icone: Scale, rotulo: "Transitou / em execução", valor: m.transitou, tom: "text-foreground",
                  sub: "condenações rumo ao recebimento" },
              ]}
            />
            <Grupo
              icone={Handshake} titulo="Acordos" anel="ring-primary/25" tom="text-primary"
              rotulo="Total fechado em acordo" valor={m.totalAcordo}
              sub={`${m.nAcordos} ${m.nAcordos === 1 ? "acordo fechado" : "acordos fechados"}`}
              detalhes={[
                { icone: CalendarClock, rotulo: "Aguardando pagamento", valor: m.aReceberValor, tom: "text-foreground",
                  sub: m.emTratativa > 0
                    ? `${m.nAReceber} ${m.nAReceber === 1 ? "acordo" : "acordos"} · ${m.emTratativa} ainda em tratativa`
                    : `${m.nAReceber} ${m.nAReceber === 1 ? "acordo" : "acordos"} · valor a receber` },
                { icone: CheckCircle2, rotulo: "Pago · arquivado", valor: m.recebidoValor, tom: "text-emerald-400",
                  sub: `${m.nRecebidos} ${m.nRecebidos === 1 ? "acordo quitado" : "acordos quitados"}` },
              ]}
            />
          </div>

          {/* Ticket médio atravessa os dois grupos, então fica fora dos dois —
              numa faixa fina, porque é contexto, não manchete. */}
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-2.5 flex-wrap">
            <Coins className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Ticket médio</span>
            <span className="text-lg font-semibold font-display tabular-nums">{brl(m.ticket)}</span>
            <span className="text-[11px] text-muted-foreground ml-auto">por vitória registrada, venha de sentença ou de acordo</span>
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
                    <div
                      key={v.id}
                      className="group flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3 hover:bg-emerald-500/[0.09] transition-colors"
                    >
                      <a href={`/processos/${v.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="h-9 w-9 rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30 grid place-items-center shrink-0">
                          <Trophy className="h-4 w-4 text-emerald-400" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{v.cliente_nome || v.numero_processo || "Processo"}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{v.materia || "Matéria não informada"}{v.comarca_uf ? ` · ${v.comarca_uf}` : ""}</p>
                        </div>
                        <span className="text-base font-semibold font-display tabular-nums text-emerald-400 shrink-0">{brl(v.valorCumprimento)}</span>
                      </a>
                      {/* Dar baixa sem sair do Tracker: é aqui que a pessoa está
                          olhando quando o alvará cai. */}
                      <button
                        onClick={() => setBaixa({
                          processoId: v.id, numeroProcesso: v.numero_processo,
                          clienteNome: v.cliente_nome, via: "alvara",
                          valorPrevisto: v.valorCumprimento,
                        })}
                        title="Alvará pago — dar baixa e lançar no Wallet"
                        className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-medium text-emerald-300/80 ring-1 ring-emerald-400/25 bg-emerald-400/[0.06] hover:bg-emerald-400/15 hover:text-emerald-200 transition-colors"
                      >
                        Alvará pago
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Acordos a receber: a fila de cobrança, por data de previsão ──
              Só os que ainda não foram pagos. Acordo arquivado não se cobra, e
              deixá-lo aqui fazia a tela avisar "atrasado há 35 dias" sobre um
              dinheiro que já tinha entrado. O total dos pagos está no painel. */}
          {m.aReceber.length > 0 && (
            <Card className="ring-1 ring-primary/25">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Handshake className="h-4 w-4 text-primary" /> Acordos a receber
                  <span className="ml-auto text-sm font-semibold text-primary tabular-nums">{brl(m.aReceberValor)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {m.aReceber.map((v) => {
                    const dias = diasAte(v.acordo?.previsao ?? null);
                    return (
                      <a
                        key={v.id}
                        href={`/processos/${v.id}`}
                        className="group flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.05] p-3 hover:bg-primary/[0.09] transition-colors"
                      >
                        <span className="h-9 w-9 rounded-lg bg-primary/15 ring-1 ring-primary/30 grid place-items-center shrink-0">
                          <Handshake className="h-4 w-4 text-primary" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{v.cliente_nome || v.numero_processo || "Processo"}</p>
                          <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                            <CalendarClock className="h-3 w-3 shrink-0" />
                            {v.acordo?.previsao
                              ? <>pagamento previsto para {fmtData(v.acordo.previsao)}{dias !== null && <span className={dias < 0 ? "text-red-400" : dias <= 7 ? "text-amber-300" : ""}>{" · "}{rotuloPrazo(dias)}</span>}</>
                              : v.acordo?.status === ACORDO_TRATATIVA
                                ? "em tratativa · sem previsão de pagamento"
                                : "previsão de pagamento a definir"}
                          </p>
                        </div>
                        <span className="text-base font-semibold font-display tabular-nums text-primary shrink-0">{brl(v.acordo?.valor ?? 0)}</span>
                      </a>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Já recebido: a rotatividade do Tracker ──
              O que saiu daqui não sumiu: virou dinheiro. Fica no fim, fora de
              tudo que responde "quanto ainda vai entrar", porque o Tracker
              cobrando o que já está na conta é o erro que a baixa existe pra
              evitar. */}
          {m.baixados.length > 0 && (
            <Card className="ring-1 ring-white/[0.06]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-muted-foreground">
                  <Landmark className="h-4 w-4" /> Já recebido — saiu do Tracker
                  <span className="ml-auto text-sm font-semibold tabular-nums text-emerald-400/80">{brl(m.baixadoValor)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {m.baixados.map((v) => (
                    <a
                      key={v.id}
                      href={`/processos/${v.id}`}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 hover:bg-white/[0.05] transition-colors"
                    >
                      <span className="h-9 w-9 rounded-lg bg-emerald-400/10 ring-1 ring-emerald-400/20 grid place-items-center shrink-0">
                        <Check className="h-4 w-4 text-emerald-400/80" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{v.cliente_nome || v.numero_processo || "Processo"}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {v.viaBaixa === "acordo" ? "acordo pago" : "alvará pago"}
                          {v.materia ? ` · ${v.materia}` : ""}
                        </p>
                      </div>
                      <span className="text-sm font-semibold font-display tabular-nums text-emerald-400/70 shrink-0">{brl(v.valor)}</span>
                    </a>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">
                  Esse dinheiro agora vive no Wallet. Aqui ele fica só como registro do giro.
                </p>
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
                  emptyMessage="Sem vitórias ainda"
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
                  emptyMessage="Sem vitórias ainda"
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
                  data={analytics.materiasValor.map((x) => ({ label: x.name, value: x.valor, hint: `${x.n} ${x.n === 1 ? "vitória" : "vitórias"}` }))}
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
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
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
                    ? <>Nenhuma vitória ainda. Registre a sentença ou o acordo dentro do processo, no System.</>
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
                                {/* A fase já diz "Acordo"; o que falta saber é
                                    se o dinheiro entrou. */}
                                {v.acordo && (
                                  v.acordo.pago
                                    ? <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-emerald-400/10 text-emerald-300 border-emerald-400/25">acordo pago</span>
                                    : <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/25">acordo a receber</span>
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
                            {/* Fechou por menos (ou por mais) do que a condenação:
                                mostra o de onde veio, senão o número parece errado. */}
                            {v.acordo && v.valorSentenca > 0 && v.valorSentenca !== v.valor && (
                              <span className="block text-[11px] text-muted-foreground tabular-nums">sentença {brl(v.valorSentenca)}</span>
                            )}
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

/* ─────────────────────── Grupo (sentenças / acordos) ───────────────────────
   Um painel por origem do dinheiro: o número grande é o total do grupo, e
   embaixo os dois recortes que importam dentro dele. A cor do grupo vive no
   cabeçalho e no anel; dentro, cada recorte usa a cor do seu ESTADO, e é por
   isso que o verde aparece nos dois painéis. */
function Grupo({ icone: Icone, titulo, anel, tom, rotulo, valor, sub, detalhes }: {
  icone: any; titulo: string; anel: string; tom: string;
  rotulo: string; valor: number; sub: string;
  detalhes: { icone: any; rotulo: string; valor: number; tom: string; sub: string }[];
}) {
  return (
    <SpotlightCard className={`ring-1 ${anel} flex flex-col`}>
      <div className="flex items-center gap-2">
        <span className={`h-7 w-7 rounded-lg bg-white/[0.05] grid place-items-center ${tom}`}>
          <Icone className="h-4 w-4" />
        </span>
        <p className={`text-[11px] font-medium uppercase tracking-[0.16em] ${tom}`}>{titulo}</p>
      </div>

      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-4">{rotulo}</p>
      <CountUp value={valor} format={brl} className={`block text-3xl md:text-4xl font-semibold font-display tabular-nums leading-none mt-1.5 ${tom}`} />
      <p className="text-[11px] text-muted-foreground mt-1.5">{sub}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4 pt-4 border-t border-white/[0.07]">
        {detalhes.map((d) => (
          <div key={d.rotulo} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <d.icone className="h-3 w-3 shrink-0" /> <span className="truncate">{d.rotulo}</span>
            </p>
            <CountUp value={d.valor} format={brl} className={`block text-lg font-semibold font-display tabular-nums mt-1 ${d.tom}`} />
            <p className="text-[10.5px] text-muted-foreground mt-0.5 leading-snug">{d.sub}</p>
          </div>
        ))}
      </div>
    </SpotlightCard>
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
  if (!data.length) return <p className="text-sm text-muted-foreground text-center py-8">Sem vitórias ainda.</p>;
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
