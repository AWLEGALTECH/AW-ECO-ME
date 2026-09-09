/* VALORES AJUIZADOS: quanto está em juízo, e onde.
 *
 * É o painel de entrada. O número-herói é o valor ajuizado; tudo abaixo o
 * decompõe (por estado, por matéria, por comarca, por fase) ou lista o que
 * pede atenção agora (a agenda de prazos).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SpotlightCard } from "@/components/SpotlightCard";
import {
  Briefcase, Users, DollarSign, TrendingUp, Gavel, MapPin, ClipboardList, ListChecks, CalendarClock, Zap, Eye, Trophy,
} from "lucide-react";
import { hojeISO as diaDeHoje } from "@/lib/hoje";
import { Entra, Tile, Painel, Money, Numero, BarList, Vazio, CARTAO_VIVO, countBy, sumBy, fmtBRL } from "./comum";

interface Processo {
  id: string;
  numero_processo: string;
  materia: string | null;
  fase_processual: string | null;
  valor_causa: number | null;
  comarca_uf: string | null;
  clientes?: { nome: string | null } | null;
}

interface TarefaRow {
  processo_id: string;
  numero_processo: string;
  cliente_nome: string | null;
  tipo: "acao" | "monitoramento" | "pendencia";
  titulo: string;
  conteudo: string | null;
  prazo: string | null;
}

const hojeISO = () => diaDeHoje();
const emDiasISO = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const fmtDate = (d: string) => { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; };

function urgencia(prazo: string) {
  const dias = Math.round((new Date(prazo + "T00:00:00").getTime() - new Date(hojeISO() + "T00:00:00").getTime()) / 86400000);
  if (dias < 0) return { label: `venceu há ${Math.abs(dias)}d`, cls: "text-rose-300", chip: "bg-rose-400/10 text-rose-300 ring-rose-400/25" };
  if (dias === 0) return { label: "vence hoje", cls: "text-rose-300", chip: "bg-rose-400/10 text-rose-300 ring-rose-400/25" };
  if (dias <= 3) return { label: `em ${dias}d`, cls: "text-orange-300", chip: "bg-orange-400/10 text-orange-300 ring-orange-400/25" };
  if (dias <= 7) return { label: `em ${dias}d`, cls: "text-amber-200", chip: "bg-amber-400/10 text-amber-200 ring-amber-400/25" };
  return { label: `em ${dias}d`, cls: "text-muted-foreground", chip: "bg-muted/30 text-muted-foreground ring-border" };
}

export default function PainelValores() {
  const navigate = useNavigate();
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [totalClientes, setTotalClientes] = useState(0);
  const [tarefas, setTarefas] = useState<TarefaRow[]>([]);
  const [janela, setJanela] = useState<"vencidas" | "7" | "30">("vencidas");

  useEffect(() => {
    (async () => {
      const [{ data: procs }, { count }, { data: tks }] = await Promise.all([
        supabase.from("processos").select("id, numero_processo, materia, fase_processual, valor_causa, comarca_uf, clientes(nome)"),
        supabase.from("clientes").select("*", { count: "exact", head: true }).is("arquivado_em" as any, null),
        supabase.from("vw_tarefas_processo" as never)
          .select("processo_id, numero_processo, cliente_nome, tipo, titulo, conteudo, prazo")
          .is("desfecho", null).not("prazo", "is", null).order("prazo", { ascending: true }),
      ]);
      if (procs) setProcessos(procs as unknown as Processo[]);
      setTotalClientes(count ?? 0);
      if (tks) setTarefas(tks as unknown as TarefaRow[]);
    })();
  }, []);

  const s = useMemo(() => {
    const soma = (l: Processo[]) => l.reduce((a, p) => a + (Number(p.valor_causa) || 0), 0);
    const comValor = processos.filter((p) => p.valor_causa != null);
    const susp = processos.filter((p) => p.fase_processual === "SUSPENSO");
    const arq = processos.filter((p) => p.fase_processual === "ARQUIVADO");
    return {
      total: processos.length,
      valorTotal: soma(processos),
      valorMedio: comValor.length ? soma(processos) / comValor.length : 0,
      valorAjuizado: soma(processos.filter((p) => p.fase_processual !== "ARQUIVADO")),
      valorAtivo: soma(processos.filter((p) => p.fase_processual !== "ARQUIVADO" && p.fase_processual !== "SUSPENSO")),
      valorSuspensos: soma(susp), valorArquivados: soma(arq),
      suspensos: susp.length, arquivados: arq.length,
    };
  }, [processos]);

  const emJuizo = useMemo(() => processos.filter((p) => p.fase_processual !== "ARQUIVADO"), [processos]);
  const valorMateria = useMemo(() => sumBy(emJuizo, (p) => p.materia, (p) => Number(p.valor_causa)), [emJuizo]);
  const valorComarca = useMemo(() => sumBy(emJuizo, (p) => p.comarca_uf, (p) => Number(p.valor_causa)), [emJuizo]);
  const valorFase = useMemo(() => sumBy(processos, (p) => p.fase_processual, (p) => Number(p.valor_causa)), [processos]);
  const maiores = useMemo(() => [...emJuizo].filter((p) => p.valor_causa).sort((a, b) => Number(b.valor_causa) - Number(a.valor_causa)).slice(0, 8), [emJuizo]);
  const distFase = useMemo(() => countBy(processos, (p) => p.fase_processual), [processos]);

  const prazos = useMemo(() => {
    const hoje = hojeISO(), d7 = emDiasISO(7), d30 = emDiasISO(30);
    const abertas = tarefas.filter((t) => t.prazo);
    return {
      vencidas: abertas.filter((t) => t.prazo! < hoje),
      ate7: abertas.filter((t) => t.prazo! >= hoje && t.prazo! <= d7),
      ate30: abertas.filter((t) => t.prazo! >= hoje && t.prazo! <= d30),
    };
  }, [tarefas]);
  const lista = janela === "vencidas" ? prazos.vencidas : janela === "7" ? prazos.ate7 : prazos.ate30;

  return (
    <div className="space-y-6">
      <Entra>
        <SpotlightCard className={`relative overflow-hidden p-8 border-primary/20 ${CARTAO_VIVO}`}>
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.18em] text-primary/80">Valor ajuizado</p>
              <p className="text-sm text-muted-foreground mt-1">Soma das causas em andamento, sem os processos arquivados</p>
              <Money value={s.valorAjuizado} className="block text-5xl sm:text-6xl font-semibold font-display mt-4 tracking-tight text-primary" />
            </div>
            <div className="hidden sm:flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20 shrink-0">
              <Gavel className="h-8 w-8 text-primary" />
            </div>
          </div>
        </SpotlightCard>
      </Entra>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Tile i={1} rotulo="Ativo" sub="Sem suspensos nem arquivados"
              valor={<Money value={s.valorAtivo} className="text-2xl" />} tom="text-emerald-300/90" />
        <Tile i={2} rotulo="Suspensos" sub={`${s.suspensos} processos parados`}
              valor={<Money value={s.valorSuspensos} className="text-2xl" />} tom="text-amber-200/80"
              onClick={() => navigate("/processos?fase=SUSPENSO")} />
        <Tile i={3} rotulo="Arquivados" sub={`${s.arquivados} processos encerrados`}
              valor={<Money value={s.valorArquivados} className="text-2xl" />} tom="text-foreground/80"
              onClick={() => navigate("/processos?fase=ARQUIVADO")} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile i={4} rotulo="Processos" valor={<Numero value={s.total} />} icone={Briefcase} onClick={() => navigate("/processos")} />
        <Tile i={5} rotulo="Clientes" valor={<Numero value={totalClientes} />} icone={Users} onClick={() => navigate("/clientes")} />
        <Tile i={6} rotulo="Valor total" valor={<Money value={s.valorTotal} className="text-2xl" />} icone={DollarSign} />
        <Tile i={7} rotulo="Valor médio" valor={<Money value={s.valorMedio} className="text-2xl" />} icone={TrendingUp} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Painel i={8} titulo="Valor por matéria" icone={ClipboardList} descricao="Em juízo, sem os arquivados.">
          <BarList data={valorMateria} total={s.valorAjuizado} max={10} formato="brl"
                   onItemClick={(n) => navigate(`/processos?materia=${encodeURIComponent(n)}`)} />
        </Painel>
        <Painel i={9} titulo="Valor por comarca" icone={MapPin} descricao="Onde o dinheiro está sendo disputado.">
          <BarList data={valorComarca} total={s.valorAjuizado} max={10} formato="brl"
                   onItemClick={(n) => navigate(`/processos?comarca=${encodeURIComponent(n)}`)} />
        </Painel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Painel i={10} titulo="Maiores causas" icone={Trophy} className="lg:col-span-3" descricao="As oito de maior valor em andamento.">
          {maiores.length === 0 ? <Vazio texto="Nenhum processo com valor." /> : (
            <div className="divide-y divide-border/40">
              {maiores.map((p) => (
                <button key={p.id} onClick={() => navigate(`/processos/${p.id}`)}
                        className="w-full flex items-center gap-3 py-2.5 px-1 text-left rounded transition-colors hover:bg-primary/[0.05]">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.clientes?.nome ?? "Sem cliente"}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.materia ?? "Sem matéria"} · <span className="font-mono">{p.numero_processo}</span></p>
                  </div>
                  <span className="text-sm tabular-nums text-primary/90 shrink-0">{fmtBRL(Number(p.valor_causa))}</span>
                </button>
              ))}
            </div>
          )}
        </Painel>
        <Painel i={11} titulo="Valor por fase" icone={ListChecks} className="lg:col-span-2">
          <BarList data={valorFase} total={s.valorTotal} max={10} formato="brl"
                   onItemClick={(n) => navigate(`/processos?fase=${encodeURIComponent(n)}`)} />
          <p className="text-xs text-muted-foreground mt-3">{distFase.length} fases distintas na carteira.</p>
        </Painel>
      </div>

      <Painel i={12} titulo="Prazos" icone={CalendarClock} descricao="A lista abre nos vencidos, que é o que ninguém pode deixar passar."
        direita={
          <div className="flex items-center gap-1">
            {([["vencidas", "Vencidos", prazos.vencidas.length, true], ["7", "7 dias", prazos.ate7.length, false], ["30", "30 dias", prazos.ate30.length, false]] as const).map(([key, label, qtd, urgente]) => (
              <button key={key} onClick={() => setJanela(key as typeof janela)}
                className={`text-xs px-3 py-1.5 rounded-full ring-1 transition-all duration-200 ${
                  janela === key
                    ? urgente && qtd > 0 ? "bg-rose-400/10 text-rose-200 ring-rose-400/30" : "bg-primary/15 text-primary ring-primary/40"
                    : "text-muted-foreground ring-border hover:bg-primary/[0.06] hover:ring-primary/30"}`}>
                {label} <span className={`ml-1 tabular-nums ${urgente && qtd > 0 && janela !== key ? "text-rose-300" : "opacity-70"}`}>{qtd}</span>
              </button>
            ))}
          </div>
        }>
        {lista.length === 0 ? (
          <Vazio texto={janela === "vencidas" ? "Nenhum prazo vencido. Carteira em dia." : `Nenhum prazo nos próximos ${janela} dias.`} />
        ) : (
          <div className="divide-y divide-border/40">
            {lista.map((t) => {
              const u = urgencia(t.prazo!);
              const acao = t.tipo === "acao";
              const Icon = acao ? Zap : Eye;
              return (
                <div key={`${t.processo_id}-${t.titulo}-${t.prazo}`}
                     className="flex items-center gap-3 py-2.5 px-1 cursor-pointer rounded transition-colors hover:bg-primary/[0.05]"
                     onClick={() => navigate(`/processos/${t.processo_id}`)}>
                  <span className={`h-8 w-8 shrink-0 rounded-lg grid place-items-center ring-1 ${acao ? "bg-primary/12 ring-primary/25" : "bg-muted/30 ring-border"}`}>
                    <Icon className={`h-4 w-4 ${acao ? "text-primary" : "text-muted-foreground"}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{t.titulo}</p>
                    <p className="text-xs text-muted-foreground truncate">{t.cliente_nome ?? "sem cliente"} · <span className="font-mono">{t.numero_processo}</span></p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-mono ${u.cls}`}>{fmtDate(t.prazo!)}</p>
                    <span className={`inline-flex items-center text-[11px] px-1.5 py-0.5 rounded-full ring-1 mt-0.5 ${u.chip}`}>{u.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <button onClick={() => navigate("/tarefas")} className="w-full mt-3 text-xs text-primary/90 hover:text-primary hover:underline transition-colors">
          Ver todas as tarefas
        </button>
      </Painel>
    </div>
  );
}
