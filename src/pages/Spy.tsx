import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { extrairTextoPdf } from "@/lib/pdfText";
import { analisarExtrato } from "@/lib/parseExtrato";
import { useAuth } from "@/hooks/useAuth";
import { appConfig } from "@/config/app-config";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, FileText, FolderOpen, Loader2, CheckCircle2, Check, AlertTriangle,
  ChevronDown, ShieldAlert, ExternalLink, RefreshCw, ScanLine, ListChecks,
  ArrowDownRight, ArrowUpRight, ArrowLeft, Activity, Users, TrendingUp, Layers,
  Scale, CalendarDays, ClipboardList, X, ChevronRight, SearchX, Eye,
  Landmark, Utensils, Car, Home, GraduationCap, HeartPulse, CreditCard, Receipt, Banknote, ArrowLeftRight, Circle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as ChartTooltip } from "recharts";
import { useTheme } from "@/hooks/useTheme";

// Mesma paleta do gráfico da aba Processos (o stroke SVG não resolve var()).
const PRIMARY_HSL: Record<string, string> = {
  default: "hsl(270, 100%, 62%)",
  "midnight-blue": "hsl(222, 90%, 58%)",
  vermelho: "hsl(0, 84%, 58%)",
  "space-gray": "hsl(215, 18%, 62%)",
  sei: "hsl(270, 100%, 62%)",
};
function ChartTip({ active, payload, label, render }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-popover/95 backdrop-blur px-2.5 py-1.5 text-xs shadow-lg">
      {render(label, payload[0].value)}
    </div>
  );
}

const EIXOS: Record<string, { label: string; cls: string }> = {
  financeira:      { label: "Financeira",      cls: "text-rose-400 bg-rose-500/12 ring-rose-500/25" },
  credores:        { label: "Credores",        cls: "text-amber-400 bg-amber-400/12 ring-amber-400/25" },
  produtos:        { label: "Produtos",        cls: "text-sky-400 bg-sky-500/12 ring-sky-500/25" },
  consumo:         { label: "Consumo",         cls: "text-violet-400 bg-violet-500/12 ring-violet-500/25" },
  vulnerabilidade: { label: "Vulnerabilidade", cls: "text-orange-400 bg-orange-500/12 ring-orange-500/25" },
  perfil:          { label: "Perfil",          cls: "text-emerald-400 bg-emerald-500/12 ring-emerald-500/25" },
  temporal:        { label: "Temporal",        cls: "text-primary bg-primary/12 ring-primary/25" },
};
const eixoMeta = (e: string | null) => EIXOS[e || ""] || { label: e || "Outro", cls: "text-muted-foreground bg-white/[0.04] ring-white/10" };
const RISCO: Record<string, { label: string; text: string; ring: string; bar: string }> = {
  baixo:   { label: "Baixo",   text: "text-emerald-400", ring: "ring-emerald-500/25 bg-emerald-500/12", bar: "bg-emerald-400" },
  medio:   { label: "Médio",   text: "text-amber-400",   ring: "ring-amber-400/25 bg-amber-400/12",     bar: "bg-amber-400" },
  alto:    { label: "Alto",    text: "text-orange-400",  ring: "ring-orange-500/25 bg-orange-500/12",   bar: "bg-orange-400" },
  critico: { label: "Crítico", text: "text-rose-400",    ring: "ring-rose-500/25 bg-rose-500/12",       bar: "bg-rose-400" },
};
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Categoria da transação (ícone + cor), inferida da descrição.
interface Cat { key: string; label: string; Icon: LucideIcon; cls: string; }
const CATS: { test: RegExp; cat: Cat }[] = [
  { test: /SALARIO|BENEFICIO|APOSENTAD|\bINSS\b|PREFEITURA|PENSAO|PROVENTO|VENCIMENTO|BOLSA FAMILIA|AUXILIO/i, cat: { key: "renda", label: "Renda/benefício", Icon: Landmark, cls: "text-emerald-400" } },
  { test: /MERCAD|SUPERMERC|PADARIA|ACOUGUE|IFOOD|RESTAURANT|LANCHON|ALIMENT|HORTIFRUT|ATACAD/i, cat: { key: "alimentacao", label: "Alimentação", Icon: Utensils, cls: "text-orange-400" } },
  { test: /POSTO|COMBUST|GASOLINA|\bUBER\b|\b99\b|TAXI|ONIBUS|PASSAGEM|PEDAGIO|ESTACIONAM|\bIPVA\b/i, cat: { key: "transporte", label: "Transporte", Icon: Car, cls: "text-sky-400" } },
  { test: /ALUGUEL|CONDOMIN|ENERGIA|CEMIG|COPASA|\bLUZ\b|\bAGUA\b|\bGAS\b|INTERNET|\bIPTU\b|MORADIA|CLARO|VIVO|\bTIM\b/i, cat: { key: "moradia", label: "Moradia/contas", Icon: Home, cls: "text-amber-400" } },
  { test: /ESCOLA|FACULD|UNIVERS|COLEGIO|MENSALIDADE|\bCURSO\b|EDUCAC|CRECHE/i, cat: { key: "escola", label: "Educação", Icon: GraduationCap, cls: "text-violet-400" } },
  { test: /FARMAC|DROGA|HOSPITAL|CLINICA|MEDIC|LABORAT|SAUDE|UNIMED|ODONTO|AMIL|HAPVIDA/i, cat: { key: "saude", label: "Saúde", Icon: HeartPulse, cls: "text-rose-400" } },
  { test: /EMPRESTIMO|CONSIGNAD|FINANCIAMENTO|PARCELA|CREDIARIO|CARTAO|FATURA|CREFISA|\bBMG\b|AGIBANK/i, cat: { key: "credito", label: "Crédito/dívida", Icon: CreditCard, cls: "text-rose-400" } },
  { test: /TARIFA|\bTAXA\b|MANUTENC|CESTA|ANUIDADE|\bIOF\b|PACOTE SERV/i, cat: { key: "tarifa", label: "Tarifa bancária", Icon: Receipt, cls: "text-muted-foreground" } },
  { test: /SAQUE|CORBAN|CAIXA ELETR|\bSAQ\b/i, cat: { key: "saque", label: "Saque", Icon: Banknote, cls: "text-amber-400" } },
  { test: /\bPIX\b|\bTED\b|\bDOC\b|TRANSFER/i, cat: { key: "transferencia", label: "Transferência", Icon: ArrowLeftRight, cls: "text-primary" } },
];
const CAT_OUTRO: Cat = { key: "outro", label: "Outro", Icon: Circle, cls: "text-muted-foreground" };
const categoria = (desc: string): Cat => { const d = String(desc || ""); for (const c of CATS) if (c.test.test(d)) return c.cat; return CAT_OUTRO; };

// Traduz o erro técnico de um extrato para linguagem humana.
const motivoHumano = (erro: any): string => {
  const e = String(erro || "");
  if (/timeout|tempo excedido|aborted/i.test(e)) return "demorou demais e foi interrompido";
  if (/sem texto/i.test(e)) return "PDF sem texto legível (provável imagem/escaneado)";
  if (/sem_creditos|no credits|insufficient_quota/i.test(e)) return "sem créditos de IA no momento";
  if (/incompleto/i.test(e)) return "resposta incompleta da IA";
  return (e.slice(0, 80) || "não foi possível ler");
};

interface Cliente { id: string; nome: string; cpf_cnpj: string | null; drive_folder_id: string | null; drive_folder_url: string | null; requerido?: string | null; }
interface DriveFile { id: string; name: string; mimeType: string; }

// Alguns clientes têm só a URL da pasta (drive_folder_id nulo) — extrai o id
// da própria URL para o Spy funcionar do mesmo jeito.
const drivePastaId = (c: Pick<Cliente, "drive_folder_id" | "drive_folder_url">) =>
  c.drive_folder_id || c.drive_folder_url?.match(/\/folders\/([A-Za-z0-9_-]+)/)?.[1] || null;
interface Analise { id: string; cliente_id: string; status: string; arquivos: any[]; parciais?: any[]; relatorio: string | null; resumo: any; erro: string | null; progresso: any; n_transacoes: number | null; created_at: string; }
interface Flag { id: string; analise_id: string; eixo: string | null; codigo: string | null; label: string | null; valor: any; confianca: number | null; evidencia: string | null; }

// ── Radar (SVG animado, clima de espionagem; estatico = só o desenho) ────────
function RadarViz({ size = 120, blips = true, estatico = false, className = "" }: { size?: number; blips?: boolean; estatico?: boolean; className?: string }) {
  if (estatico) blips = false;
  return (
    <div className={`relative text-primary ${className}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <defs>
          <linearGradient id="spy-beam" x1="50%" y1="50%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeOpacity="0.16" />
        <circle cx="50" cy="50" r="33" fill="none" stroke="currentColor" strokeOpacity="0.12" />
        <circle cx="50" cy="50" r="18" fill="none" stroke="currentColor" strokeOpacity="0.12" />
        <line x1="2" y1="50" x2="98" y2="50" stroke="currentColor" strokeOpacity="0.10" />
        <line x1="50" y1="2" x2="50" y2="98" stroke="currentColor" strokeOpacity="0.10" />
        {!estatico && (
          <g className="spy-sweep">
            <path d="M50 50 L50 2 A48 48 0 0 1 95 33 Z" fill="url(#spy-beam)" />
            <line x1="50" y1="50" x2="50" y2="2" stroke="currentColor" strokeOpacity="0.5" strokeWidth="0.6" />
          </g>
        )}
      </svg>
      {blips && (
        <>
          <span className="spy-blip absolute h-1.5 w-1.5 rounded-full bg-primary" style={{ left: "68%", top: "34%", animationDelay: "0.2s" }} />
          <span className="spy-blip absolute h-1 w-1 rounded-full bg-emerald-400" style={{ left: "36%", top: "62%", animationDelay: "0.9s" }} />
          <span className="spy-blip absolute h-1 w-1 rounded-full bg-amber-400" style={{ left: "58%", top: "70%", animationDelay: "1.4s" }} />
        </>
      )}
    </div>
  );
}

type ModoLobby = "analisados" | "pendentes" | "andamento" | "novo";
// Transação-alvo vinda do banco geral: abre o perfil do cliente e destaca a
// linha correspondente dentro do quadro do extrato.
type AlvoTx = { data: string | null; valor: number; descricao: string };

export default function Spy() {
  useEffect(() => { document.title = `Spy · ${appConfig.name}`; }, []);
  const { user } = useAuth();
  const [sel, setSel] = useState<Cliente | null>(null);
  const [modo, setModo] = useState<ModoLobby | null>(null);
  const [verBanco, setVerBanco] = useState(false);
  const [alvoTx, setAlvoTx] = useState<AlvoTx | null>(null);
  const [pendingFoco, setPendingFoco] = useState<string | null>(null);

  const { data: clientes = [] } = useQuery({
    queryKey: ["spy-clientes"],
    queryFn: async (): Promise<Cliente[]> => {
      const { data, error } = await supabase.from("clientes")
        .select("id, nome, cpf_cnpj, drive_folder_id, drive_folder_url, requerido").order("nome");
      if (error) throw error;
      return (data || []) as any;
    },
  });

  const { data: analises = [] } = useQuery({
    queryKey: ["spy-stats"],
    queryFn: async (): Promise<Analise[]> => {
      const { data, error } = await (supabase.from("spy_analise" as any) as any)
        .select("id, cliente_id, status, resumo, n_transacoes, created_at, progresso").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: (q: any) => ((q.state.data as Analise[] | undefined)?.some((a) => a.status === "processando") ? 3000 : false),
  });

  const comPasta = useMemo(() => clientes.filter((c) => drivePastaId(c)).length, [clientes]);

  return (
    <div className="w-full space-y-5">
      {!sel && (
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Spy</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inteligência sobre o cliente a partir dos extratos. Roda em segundo plano, então você pode navegar pelo Eco enquanto o radar trabalha.
          </p>
        </header>
      )}

      {sel ? (
        <SpyClientPage key={sel.id} cliente={sel} userId={user?.id || null} initialFoco={pendingFoco} alvoTx={alvoTx}
          onBack={() => { setSel(null); setPendingFoco(null); setAlvoTx(null); }} />
      ) : verBanco ? (
        <BancoTransacoes clientes={clientes} onBack={() => setVerBanco(false)}
          onAbrir={(c, alvo) => { setAlvoTx(alvo); setSel(c); setVerBanco(false); }} />
      ) : modo ? (
        <LobbyLista modo={modo} clientes={clientes} analises={analises} onBack={() => setModo(null)}
          onOpen={(c, aid) => { setSel(c); setPendingFoco(aid); }} />
      ) : (
        <Lobby clientes={clientes} analises={analises} comPasta={comPasta} onModo={setModo} onBanco={() => setVerBanco(true)} />
      )}
    </div>
  );
}

// ── Lobby: console de vigilância (número monitorado + coletas + 2 ações) ─────
// Gauge de cobertura: meio-círculo "X de Y alvos varridos".
function GaugeCobertura({ feito, total }: { feito: number; total: number }) {
  const pct = total > 0 ? Math.min(1, feito / total) : 0;
  const C = Math.PI * 50; // comprimento do arco de 180°
  return (
    <div className="relative w-full max-w-[240px] mx-auto">
      <svg viewBox="0 0 120 64" className="w-full">
        <path d="M 10 58 A 50 50 0 0 1 110 58" fill="none" stroke="currentColor" strokeOpacity="0.09" strokeWidth="9" strokeLinecap="round" className="text-foreground" />
        <path d="M 10 58 A 50 50 0 0 1 110 58" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" className="text-primary transition-all duration-1000"
          strokeDasharray={String(C)} strokeDashoffset={C * (1 - pct)} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <p className="font-mono text-2xl font-semibold tabular-nums leading-none">{Math.round(pct * 100)}%</p>
        <p className="font-mono text-[10px] text-muted-foreground mt-1">{feito} de {total} alvos varridos</p>
      </div>
    </div>
  );
}

// Contador que sobe até o valor (clima de painel de vigilância).
function ContadorVivo({ ate }: { ate: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = performance.now(); const dur = 900;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setV(Math.round(ate * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ate]);
  return <>{v.toLocaleString("pt-BR")}</>;
}

function Lobby({ clientes, analises, comPasta, onModo, onBanco }: {
  clientes: Cliente[]; analises: Analise[]; comPasta: number; onModo: (m: ModoLobby) => void; onBanco: () => void;
}) {
  const concluidas = useMemo(() => analises.filter((a) => a.status === "concluida"), [analises]);
  const rodando = useMemo(() => analises.filter((a) => a.status === "processando"), [analises]);
  const analisadosIds = useMemo(() => new Set(concluidas.map((a) => a.cliente_id)), [concluidas]);
  const nAnalisados = analisadosIds.size;
  const nPendentes = useMemo(
    () => clientes.filter((c) => drivePastaId(c) && !analisadosIds.has(c.id)).length,
    [clientes, analisadosIds],
  );
  const totalTx = concluidas.reduce((s, r) => s + (r.n_transacoes || 0), 0);
  const ultima = concluidas[0] || null;

  return (
    <div className="space-y-4">
      {/* Console de vigilância */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.03] spy-grid">
        <div className="pointer-events-none absolute -right-14 -bottom-28 opacity-[0.07] hidden sm:block" aria-hidden>
          <RadarViz size={400} estatico />
        </div>
        <div className="relative p-6">
          <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.22em]">
            <span className="inline-flex items-center text-primary/80">
              <span className="h-1.5 w-1.5 rounded-full bg-primary spy-blip" />
            </span>
            <span className="text-muted-foreground/50 hidden sm:block">AW Spy · uso interno</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr,300px] gap-x-12 gap-y-8 items-center mt-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-mono">Transações sob monitoramento</p>
              <p className="text-5xl md:text-6xl font-semibold tabular-nums tracking-tight mt-2 font-mono text-foreground">
                <ContadorVivo ate={totalTx} />
              </p>
              <div className="mt-4 space-y-1 font-mono text-[11.5px] text-muted-foreground">
                <p>▸ {concluidas.length.toLocaleString("pt-BR")} coleta(s) concluída(s)</p>
                <p>▸ {nAnalisados} cliente(s) sob análise · {comPasta} alvos com pasta</p>
                <p>▸ última varredura: {ultima ? `${new Date(ultima.created_at).toLocaleDateString("pt-BR")} · ${(ultima.n_transacoes || 0).toLocaleString("pt-BR")} transações` : "—"}</p>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-mono mb-2.5 text-center">Cobertura da carteira</p>
              <GaugeCobertura feito={nAnalisados} total={comPasta} />
            </div>
          </div>
        </div>
      </div>

      {/* Ações: iniciar análise + banco de transações + banco de análises */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button onClick={() => onModo("novo")}
          className="group text-left rounded-2xl border border-primary/40 bg-primary/[0.08] p-5 flex items-center gap-4 transition-all duration-200 hover:bg-primary/[0.14] hover:-translate-y-0.5">
          <span className="h-12 w-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            <ScanLine className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold text-foreground">Iniciar nova análise</span>
            <span className="block text-[12px] text-muted-foreground mt-0.5">{comPasta} clientes com pasta no Drive · {nPendentes} ainda sem análise</span>
          </span>
          <ChevronRight className="h-5 w-5 text-primary group-hover:translate-x-0.5 transition-transform shrink-0" />
        </button>

        <button onClick={onBanco}
          className="group text-left rounded-2xl border border-white/[0.09] bg-white/[0.02] p-5 flex items-center gap-4 transition-all duration-200 hover:border-primary/40 hover:bg-white/[0.04] hover:-translate-y-0.5">
          <span className="h-12 w-12 rounded-xl bg-primary/[0.1] ring-1 ring-primary/20 text-primary flex items-center justify-center shrink-0">
            <ArrowLeftRight className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold text-foreground">Banco de transações</span>
            <span className="block text-[12px] text-muted-foreground mt-0.5">{totalTx.toLocaleString("pt-BR")} transações de todos os clientes</span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
        </button>

        <button onClick={() => onModo("analisados")}
          className="group text-left rounded-2xl border border-white/[0.09] bg-white/[0.02] p-5 flex items-center gap-4 transition-all duration-200 hover:border-primary/40 hover:bg-white/[0.04] hover:-translate-y-0.5">
          <span className="h-12 w-12 rounded-xl bg-primary/[0.1] ring-1 ring-primary/20 text-primary flex items-center justify-center shrink-0">
            <Eye className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[17px] font-semibold text-foreground">Banco de análises</span>
            <span className="block text-[12px] text-muted-foreground mt-0.5">{nAnalisados} ficha(s) pronta(s) para consulta</span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
        </button>
      </div>

      {/* Analisando agora: progresso vivo */}
      {rodando.length > 0 && (
        <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-4">
          <p className="text-[10px] uppercase tracking-wider text-primary/80 mb-2.5 flex items-center gap-1.5 font-mono">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando agora
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {rodando.map((r) => {
              const c = clientes.find((x) => x.id === r.cliente_id);
              const pct = Math.min(100, Math.max(0, Number(r.progresso?.pct) || 0));
              return (
                <div key={r.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{c?.nome || "Cliente"}</span>
                    <span className="text-[10px] text-primary/80 tabular-nums shrink-0">{pct}%</span>
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Lista do lobby: clientes filtrados pela opção escolhida ──────────────────
const MODO_META: Record<ModoLobby, { titulo: string; sub: string }> = {
  analisados: { titulo: "Clientes com análise", sub: "clique para abrir a ficha" },
  pendentes: { titulo: "Clientes pendentes", sub: "com pasta no Drive e ainda sem análise — clique para analisar" },
  andamento: { titulo: "Análises em andamento", sub: "clique para acompanhar o radar" },
  novo: { titulo: "Nova análise", sub: "escolha o cliente para rodar o Spy" },
};

function LobbyLista({ modo, clientes, analises, onBack, onOpen }: {
  modo: ModoLobby; clientes: Cliente[]; analises: Analise[]; onBack: () => void; onOpen: (c: Cliente, analiseId: string | null) => void;
}) {
  const [busca, setBusca] = useState("");
  const [fComarca, setFComarca] = useState("todas");
  const [fRequerido, setFRequerido] = useState("todos");
  const concluidas = useMemo(() => analises.filter((a) => a.status === "concluida"), [analises]);
  const rodando = useMemo(() => analises.filter((a) => a.status === "processando"), [analises]);
  const ultimaDe = (cid: string) => concluidas.find((a) => a.cliente_id === cid) || null;
  const rodandoDe = (cid: string) => rodando.find((a) => a.cliente_id === cid) || null;

  // Comarca vem dos PROCESSOS do cliente (um cliente pode ter mais de uma).
  const { data: procs = [] } = useQuery({
    queryKey: ["spy-proc-comarcas"],
    queryFn: async (): Promise<{ cliente_id: string; comarca_uf: string | null }[]> => {
      const { data, error } = await supabase.from("processos").select("cliente_id, comarca_uf");
      if (error) throw error;
      return (data || []) as any;
    },
  });
  const comarcasDoCliente = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const pr of procs) {
      const cm = String(pr.comarca_uf || "").trim().toUpperCase();
      if (!cm || !pr.cliente_id) continue;
      if (!m.has(pr.cliente_id)) m.set(pr.cliente_id, new Set());
      m.get(pr.cliente_id)!.add(cm);
    }
    return m;
  }, [procs]);

  const base = useMemo(() => {
    const analisados = new Set(concluidas.map((a) => a.cliente_id));
    const emAnd = new Set(rodando.map((a) => a.cliente_id));
    switch (modo) {
      case "analisados": return clientes.filter((c) => analisados.has(c.id));
      case "pendentes": return clientes.filter((c) => drivePastaId(c) && !analisados.has(c.id) && !emAnd.has(c.id));
      case "andamento": return clientes.filter((c) => emAnd.has(c.id));
      case "novo": return clientes.filter((c) => drivePastaId(c));
    }
  }, [modo, clientes, concluidas, rodando]);

  const lista = useMemo(() => {
    const s = busca.trim().toLowerCase();
    return base.filter((c) => {
      if (fComarca !== "todas" && !comarcasDoCliente.get(c.id)?.has(fComarca)) return false;
      if (fRequerido !== "todos" && String(c.requerido || "").trim().toUpperCase() !== fRequerido) return false;
      if (!s) return true;
      return (c.nome || "").toLowerCase().includes(s) || (c.cpf_cnpj || "").includes(s);
    });
  }, [base, busca, fComarca, fRequerido, comarcasDoCliente]);

  const opcoesComarca = useMemo(() => {
    const cont = new Map<string, number>();
    for (const c of base) for (const cm of (comarcasDoCliente.get(c.id) || [])) cont.set(cm, (cont.get(cm) || 0) + 1);
    return [...cont.entries()].sort((a, b) => b[1] - a[1]);
  }, [base, comarcasDoCliente]);
  const opcoesRequerido = useMemo(() => {
    const cont = new Map<string, number>();
    for (const c of base) { const r = String(c.requerido || "").trim().toUpperCase(); if (r) cont.set(r, (cont.get(r) || 0) + 1); }
    return [...cont.entries()].sort((a, b) => b[1] - a[1]);
  }, [base]);

  const meta = MODO_META[modo];

  return (
    <div className="spy-lock space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Central do Spy
          </button>
          <h2 className="text-xl font-semibold tracking-tight mt-1.5">{meta.titulo} <span className="text-muted-foreground font-normal">({lista.length})</span></h2>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">{meta.sub}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…" className="pl-9 h-9" />
          </div>
          <Select value={fComarca} onValueChange={setFComarca}>
            <SelectTrigger className="h-9 w-full sm:w-48 text-[12.5px]"><SelectValue placeholder="Comarca" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Comarca: todas</SelectItem>
              {opcoesComarca.map(([cm, n]) => <SelectItem key={cm} value={cm}>{cm} ({n})</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fRequerido} onValueChange={setFRequerido}>
            <SelectTrigger className="h-9 w-full sm:w-56 text-[12.5px]"><SelectValue placeholder="Requerido" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Requerido: todos</SelectItem>
              {opcoesRequerido.map(([r, n]) => <SelectItem key={r} value={r}>{r} ({n})</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/[0.1] py-16 text-center text-sm text-muted-foreground">
          <SearchX className="h-6 w-6 mx-auto mb-2 opacity-50" />
          {busca ? `Nenhum cliente bate com "${busca}".` : "Nenhum cliente aqui por enquanto."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {lista.map((c) => {
            const rod = rodandoDe(c.id);
            const ult = ultimaDe(c.id);
            const pct = rod ? Math.min(100, Math.max(0, Number(rod.progresso?.pct) || 0)) : null;
            return (
              <button key={c.id} onClick={() => onOpen(c, rod ? rod.id : null)}
                className="group text-left rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 transition-all duration-200 hover:border-primary/40 hover:bg-white/[0.04]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate group-hover:text-primary transition-colors">{c.nome}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-[11px] text-muted-foreground">{c.cpf_cnpj || "sem CPF"}</span>
                  {rod ? (
                    <span className="text-[10px] text-primary tabular-nums inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {pct}%</span>
                  ) : ult ? (
                    <span className="text-[10px] px-1.5 py-px rounded-full ring-1 text-emerald-400 ring-emerald-500/25 bg-emerald-500/10">análise de {new Date(ult.created_at).toLocaleDateString("pt-BR")}</span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-px rounded-full ring-1 text-muted-foreground ring-white/10 bg-white/[0.03]">sem análise</span>
                  )}
                </div>
                {rod && (
                  <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Banco de transações gerais: colunas de jornal VIRTUALIZADAS ──────────────
// Todos os dados ficam em memória (busca completa e instantânea), mas o DOM só
// desenha as linhas visíveis na janela de rolagem — leve mesmo com dezenas de
// milhares. Colunas calculadas na mão: coluna 1 = primeiro quarto da lista,
// coluna 2 = o seguinte... (lê-se de cima pra baixo e segue pro topo da próxima).
const LINHA_H = 24; // altura fixa de cada linha (px) — chave da virtualização
function BancoTransacoes({ clientes, onBack, onAbrir }: {
  clientes: Cliente[]; onBack: () => void; onAbrir: (c: Cliente, alvo: AlvoTx) => void;
}) {
  const [busca, setBusca] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [alturaVis, setAlturaVis] = useState(600);
  const [cols, setCols] = useState(4);

  // Carregamento PROGRESSIVO e resiliente: as linhas aparecem conforme chegam
  // (dá pra usar e buscar no meio), 4 páginas de 1000 por rodada, retry por
  // página — a falha de uma não derruba as demais (o tudo-em-paralelo antigo
  // recomeçava do zero a cada falha e nunca terminava no 4G).
  const [txs, setTxs] = useState<any[]>([]);
  const [totalEsperado, setTotalEsperado] = useState(0);
  const [carregandoBanco, setCarregandoBanco] = useState(true);
  const [paginasFalhas, setPaginasFalhas] = useState(0);
  useEffect(() => {
    let vivo = true;
    const pagina = async (de: number, ate: number): Promise<any[]> => {
      for (let tent = 1; tent <= 3; tent++) {
        try {
          const { data, error } = await (supabase.from("spy_transacao" as any) as any)
            .select("id, cliente_id, data, valor, sinal, descricao")
            .order("data", { ascending: false }).order("id", { ascending: true })
            .range(de, ate);
          if (error) throw error;
          return data || [];
        } catch (_e) {
          if (tent === 3) { if (vivo) setPaginasFalhas((n) => n + 1); return []; }
          await new Promise((r) => setTimeout(r, 700 * tent));
        }
      }
      return [];
    };
    (async () => {
      try {
        const { count } = await (supabase.from("spy_transacao" as any) as any).select("id", { count: "exact", head: true });
        const total = count ?? 0;
        if (!vivo) return;
        setTotalEsperado(total);
        const out: any[] = [];
        for (let de = 0; de < total && vivo; de += 4000) {
          const rodada: Promise<any[]>[] = [];
          for (let ini2 = de; ini2 < Math.min(de + 4000, total); ini2 += 1000) {
            rodada.push(pagina(ini2, Math.min(ini2 + 999, total - 1)));
          }
          const partes = await Promise.all(rodada);
          out.push(...partes.flat());
          if (vivo) setTxs(out.slice());
        }
      } finally {
        if (vivo) setCarregandoBanco(false);
      }
    })();
    return () => { vivo = false; };
  }, []);
  const isLoading = carregandoBanco && txs.length === 0;

  const clientePor = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const enriquecidas = useMemo(() => txs.map((t: any) => {
    const v = (Number(t.valor) || 0) * (Number(t.sinal) < 0 ? -1 : 1);
    const nome = clientePor.get(t.cliente_id)?.nome || "";
    return {
      ...t, v, nome,
      blob: `${t.data || ""} ${t.descricao || ""} ${nome} ${Math.abs(v).toFixed(2)} ${fmtBRL(Math.abs(v))}`.toLowerCase(),
    };
  }), [txs, clientePor]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? enriquecidas.filter((t) => t.blob.includes(q)) : enriquecidas;
  }, [enriquecidas, busca]);

  // Mede a janela e decide o nº de colunas pelo espaço real.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const medir = () => {
      setAlturaVis(el.clientHeight || 600);
      const w = el.clientWidth || 1200;
      setCols(w > 1500 ? 4 : w > 1050 ? 3 : w > 680 ? 2 : 1);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isLoading]);

  // Rolagem com rAF (uma atualização por frame, sem engasgo).
  const onScroll = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      setScrollTop(scrollRef.current?.scrollTop || 0);
    });
  };
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); setScrollTop(0); }, [busca]);

  const porColuna = cols > 0 ? Math.ceil(filtradas.length / cols) : 0;
  const i0 = Math.max(0, Math.floor(scrollTop / LINHA_H) - 12);
  const i1 = Math.min(porColuna, Math.ceil((scrollTop + alturaVis) / LINHA_H) + 12);
  const fmtD = (d: any) => { const pp = String(d || "").split("-"); return pp.length === 3 ? `${pp[2]}/${pp[1]}/${pp[0].slice(2)}` : "—"; };

  return (
    <div className="spy-lock space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Central do Spy
          </button>
          <h2 className="text-xl font-semibold tracking-tight mt-1.5 flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-primary" /> Banco de transações
            <span className="font-mono text-[13px] font-normal text-muted-foreground tabular-nums">({(totalEsperado || txs.length).toLocaleString("pt-BR")})</span>
            {carregandoBanco && txs.length > 0 && (
              <span className="font-mono text-[11px] font-normal text-primary/80 tabular-nums inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> {txs.length.toLocaleString("pt-BR")} carregadas…
              </span>
            )}
          </h2>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {busca ? `${filtradas.length.toLocaleString("pt-BR")} de ${txs.length.toLocaleString("pt-BR")} transações` : "Todas as transações monitoradas"} · leitura em colunas, de cima pra baixo · clique para abrir o cliente
          </p>
        </div>
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por descrição, cliente ou valor…" className="pl-9 h-10 font-mono text-[13px]" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-20 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando o banco completo…
        </div>
      ) : filtradas.length === 0 ? (
        <div className="rounded-xl border border-white/[0.09] bg-black/25 py-14">
          <p className="text-[12.5px] text-muted-foreground text-center">
            {busca ? `Nenhuma transação bate com "${busca}".` : "O banco enche conforme as análises rodarem."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/[0.09] bg-black/25 p-3">
          <div ref={scrollRef} onScroll={onScroll} className="h-[70vh] overflow-y-auto scrollbar-thin">
            <div className="flex gap-x-6 items-start">
              {Array.from({ length: cols }, (_, ci) => {
                const base = ci * porColuna;
                const fatia = filtradas.slice(base + i0, Math.min(base + i1, base + porColuna, filtradas.length));
                return (
                  <div key={ci} className="flex-1 min-w-0" style={{ height: porColuna * LINHA_H }}>
                    <div style={{ transform: `translateY(${i0 * LINHA_H}px)` }}>
                      {fatia.map((t: any) => {
                        const neg = t.v < 0;
                        const cat = categoria(t.descricao || "");
                        const c = clientePor.get(t.cliente_id);
                        return (
                          <button key={t.id} disabled={!c}
                            onClick={() => c && onAbrir(c, { data: t.data, valor: t.v, descricao: t.descricao || "" })}
                            style={{ height: LINHA_H }}
                            className="w-full text-left flex items-center gap-1.5 border-b border-white/[0.045] font-mono text-[10.5px] leading-none hover:bg-primary/[0.07] transition-colors disabled:opacity-50 group">
                            <span className={`${cat.cls} h-1.5 w-1.5 rounded-full bg-current shrink-0 opacity-80`} />
                            <span className="text-muted-foreground tabular-nums shrink-0 w-[54px]">{fmtD(t.data)}</span>
                            <span className="text-foreground/55 truncate shrink-0 max-w-[84px] group-hover:text-primary transition-colors">{(t.nome || "").split(" ")[0] || "—"}</span>
                            <span className="truncate flex-1 text-foreground/85">{t.descricao || "—"}</span>
                            <span className={`tabular-nums shrink-0 ${neg ? "text-rose-400" : "text-emerald-400"}`}>{neg ? "-" : "+"}{fmtBRL(Math.abs(t.v))}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-center pt-2.5 pb-0.5 text-[10.5px] font-mono text-muted-foreground/60">
            {filtradas.length.toLocaleString("pt-BR")} transação(ões) — role para percorrer todas
            {paginasFalhas > 0 && <span className="text-amber-400/80"> · {paginasFalhas} bloco(s) não carregaram, recarregue a página</span>}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Página do cliente (toma a tela; a análise é a protagonista) ──────────────
function SpyClientPage({ cliente, userId, onBack, initialFoco, alvoTx }: { cliente: Cliente; userId: string | null; onBack: () => void; initialFoco?: string | null; alvoTx?: AlvoTx | null }) {
  const qc = useQueryClient();
  const [selFiles, setSelFiles] = useState<Set<string>>(new Set());
  const [mostrarDocs, setMostrarDocs] = useState(false);
  const [foco, setFoco] = useState<string | null>(initialFoco || null);
  const [enviando, setEnviando] = useState(false);
  const [preparo, setPreparo] = useState<string | null>(null);
  const [preparoPct, setPreparoPct] = useState(0); // avanço da leitura local dos PDFs
  const [reanalisando, setReanalisando] = useState(false);
  // Mantém a tela de análise aberta entre o fim da extração e o "Cruzar dados".
  const [posAnalise, setPosAnalise] = useState(false);
  const [gerandoInsights, setGerandoInsights] = useState(false);
  // Ponte entre "invoquei o motor" e "o poll viu a análise processando": sem
  // isso o radar desmonta e remonta (piscava) no vão entre os dois estados.
  const [aguardaMotor, setAguardaMotor] = useState(false);
  const invocouEmRef = useRef(0);
  const preRef = useRef<string | null>(null);

  const pastaId = drivePastaId(cliente);
  const { data: drive, isLoading: loadingDrive, error: driveErr, refetch: refetchDrive } = useQuery({
    queryKey: ["spy-drive", pastaId],
    enabled: !!pastaId,
    queryFn: async (): Promise<DriveFile[]> => {
      const { data, error } = await supabase.functions.invoke("list-drive-files", {
        body: { folder_id: pastaId, mime_filter: ["application/pdf"] },
      });
      if (error) throw error;
      return (data?.files || data || []) as DriveFile[];
    },
  });

  // Pré-seleciona o que parece extrato (nome contém "extrato"), uma vez por cliente.
  useEffect(() => {
    if (!drive || preRef.current === cliente.id) return;
    preRef.current = cliente.id;
    setSelFiles(new Set(drive.filter((f) => /extrato/i.test(f.name)).map((f) => f.id)));
  }, [drive, cliente.id]);

  const { data: ficha } = useQuery({
    queryKey: ["spy-ficha", cliente.id],
    queryFn: async () => {
      const [cli, contr, fech] = await Promise.all([
        supabase.from("clientes").select("dados_socioeconomicos, requerido").eq("id", cliente.id).maybeSingle(),
        (supabase.from("contratos" as any) as any).select("reus, data_assinatura, modalidade, motivo").eq("cliente_id", cliente.id).order("data_assinatura", { ascending: false, nullsFirst: false }).limit(1),
        (supabase.from("fechamentos" as any) as any).select("responsavel, data").eq("cliente_id", cliente.id).order("data", { ascending: false }).limit(1),
      ]);
      return {
        socio: (cli.data?.dados_socioeconomicos as Record<string, any> | null) || null,
        requerido: (cli.data?.requerido as string | null) || null,
        contrato: (contr.data?.[0] as any) || null,
        fechamento: (fech.data?.[0] as any) || null,
      };
    },
  });

  const { data: analises = [] } = useQuery({
    queryKey: ["spy-analises", cliente.id],
    queryFn: async (): Promise<Analise[]> => {
      const { data, error } = await (supabase.from("spy_analise" as any) as any)
        .select("*").eq("cliente_id", cliente.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: (q: any) => ((q.state.data as Analise[] | undefined)?.some((a) => a.status === "processando") ? 2000 : false),
  });
  const rodando = analises.find((a) => a.status === "processando") || null;
  const concluidas = analises.filter((a) => a.status === "concluida");
  const erroAnalise = analises.find((a) => a.status === "erro") || null;
  const ultima = concluidas[0] || null;

  // Solta a ponte quando o poll enxerga a análise (processando, ou já concluída
  // se o motor foi mais rápido que o intervalo do poll).
  useEffect(() => {
    if (!aguardaMotor) return;
    const processando = analises.some((a) => a.status === "processando");
    const terminouDepois = analises.some((a) => a.status !== "processando" && new Date((a as any).updated_at || a.created_at).getTime() >= invocouEmRef.current);
    if (processando || terminouDepois) setAguardaMotor(false);
  }, [analises, aguardaMotor]);
  useEffect(() => {
    if (!aguardaMotor) return;
    const id = setTimeout(() => setAguardaMotor(false), 30000); // trava de segurança
    return () => clearTimeout(id);
  }, [aguardaMotor]);

  // % real da extração: o nº de quadros prontos (parciais) sobre o nº de
  // extratos enviados — não depende do pct que o servidor grava por janela.
  const pctDe = (a: Analise | null) => {
    if (!a) return null;
    const total = (Array.isArray(a.arquivos) ? a.arquivos : []).length;
    const prontos = (Array.isArray(a.parciais) ? a.parciais : []).length;
    const doServidor = Math.min(100, Math.max(0, Number(a.progresso?.pct) || 0));
    const daContagem = total > 0 ? Math.round((prontos / total) * 100) : 0;
    return Math.min(99, Math.max(doServidor, daContagem)); // 100 só quando concluir
  };

  const { data: flags = [] } = useQuery({
    queryKey: ["spy-flags", cliente.id],
    queryFn: async (): Promise<Flag[]> => {
      const { data, error } = await (supabase.from("spy_flag" as any) as any).select("*").eq("cliente_id", cliente.id);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: rodando ? 4000 : false,
  });

  const focoAnalise = foco ? analises.find((a) => a.id === foco) || null : null;
  // Assim que a análise em foco termina, sai da tela cheia e cai no dossiê pronto.
  useEffect(() => {
    if (foco && focoAnalise && focoAnalise.status !== "processando") setFoco(null);
  }, [foco, focoAnalise]);

  // Quando a ficha de insights fica pronta, sai do fluxo de análise e volta ao
  // perfil, onde a ficha aparece no topo.
  const ultimaConcluida = analises.find((x) => x.status === "concluida") || null;
  useEffect(() => {
    if (posAnalise && !gerandoInsights && !analises.some((x) => x.status === "processando") && (ultimaConcluida?.resumo as any)?.insights) {
      setPosAnalise(false);
    }
  }, [posAnalise, analises, ultimaConcluida, gerandoInsights]);

  const toggleFile = (id: string) => setSelFiles((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const analisar = async () => {
    if (enviando) return; // trava contra duplo-disparo
    const escolhidos = (drive || []).filter((f) => selFiles.has(f.id));
    if (!escolhidos.length) { toast.error("Selecione ao menos um extrato."); return; }
    setEnviando(true);
    try {
      // Extrai o TEXTO de cada PDF no navegador e, na sequência, roda a Camada 0
      // (parseExtrato): enumera os lançamentos e tenta RECONCILIAR pelo saldo.
      // - reconciliou → manda o ledger pronto (o servidor não gasta IA nesse extrato).
      // - não reconciliou → manda o texto cru pro servidor ler com IA (motor antigo).
      // Assim o pior caso é o comportamento de hoje, e economiza quando a conta fecha.
      const arquivos: Array<any> = [];
      const ilegiveis: string[] = [];
      for (let i = 0; i < escolhidos.length; i++) {
        const f = escolhidos[i];
        setPreparo(`Lendo ${f.name} (${i + 1}/${escolhidos.length})`);
        setPreparoPct(Math.round((i / escolhidos.length) * 100));
        try {
          const resp = await supabase.functions.invoke("fetch-drive-file", { body: { file_id: f.id } });
          if (resp.error) throw resp.error;
          const blob = resp.data as Blob;
          const buf = await blob.arrayBuffer();
          const ext = await extrairTextoPdf(f.name, buf);
          if (ext.vazio) { ilegiveis.push(f.name); continue; }
          const p = analisarExtrato(f.name, ext.texto);
          if (p.reconciliado && p.transacoes.length >= 3) {
            arquivos.push({
              id: f.id, name: f.name, paginas: ext.paginas,
              periodo: p.periodo, header: p.header, reconciliado: true,
              saldoInicial: p.saldoInicial, saldoFinal: p.saldoFinal,
              transacoes: p.transacoes, resumo: p.resumo, candidatos: p.candidatos,
            });
          } else {
            // fallback: servidor lê com IA (mantém a profundidade do motor antigo)
            arquivos.push({ id: f.id, name: f.name, paginas: ext.paginas, texto: ext.texto });
          }
        } catch (_e) {
          ilegiveis.push(f.name);
        }
      }
      if (!arquivos.length) {
        toast.error(ilegiveis.length
          ? "Não consegui ler o texto desses PDFs (podem estar escaneados como imagem)."
          : "Não consegui preparar os extratos.");
        return;
      }
      if (ilegiveis.length) toast.warning(`${ilegiveis.length} extrato(s) sem texto legível foram ignorados: ${ilegiveis.join(", ")}`);
      setPreparo("Iniciando análise…");
      setPreparoPct(100);
      const { data, error } = await supabase.functions.invoke("spy-analisar", { body: { cliente_id: cliente.id, arquivos, created_by: userId } });
      if (error) { toast.error("Não consegui iniciar a análise."); return; }
      setMostrarDocs(false);
      setPosAnalise(true); // segue na tela de análise: radar → quadros → cruzar dados
      invocouEmRef.current = Date.now();
      setAguardaMotor(true); // segura o radar até o poll enxergar a análise
      qc.invalidateQueries({ queryKey: ["spy-analises", cliente.id] });
      const novoId = (data as any)?.analise_id || null;
      if (novoId) setFoco(novoId);
    } finally {
      setEnviando(false);
      setPreparo(null);
      setPreparoPct(0);
    }
  };

  // Insights comerciais (roteiro): o servidor computa o digest por código e faz
  // 1 chamada de IA para prioridades, fichas, narrativa e resumo. Fica salvo.
  const gerarInsights = async (a: Analise) => {
    if (gerandoInsights) return;
    setGerandoInsights(true);
    setPosAnalise(true); // página dedicada de carregamento (radar + feed hacker)
    try {
      const { data, error } = await supabase.functions.invoke("spy-insights", { body: { cliente_id: cliente.id, analise_id: a.id } });
      if (error || (data as any)?.error) { toast.error(`Não consegui gerar os insights${(data as any)?.error ? `: ${(data as any).error}` : ""}.`); return; }
      // Segura a tela hacker até a ficha chegar do banco e então vai DIRETO
      // pro perfil com os insights (sem piscar a tela de quadros no meio).
      await qc.refetchQueries({ queryKey: ["spy-analises", cliente.id] });
      setPosAnalise(false);
      toast.success("Insights gerados.");
    } finally {
      setGerandoInsights(false);
    }
  };

  // Reanalisa SÓ os documentos que faltaram: re-extrai/reconcilia esses no
  // navegador e chama o servidor no modo "reprocessar" — ele cria uma nova
  // análise reaproveitando os que já deram certo e re-cruza tudo.
  const reanalisar = async (a: Analise, docNames: string[]) => {
    if (reanalisando || !docNames.length) return;
    setReanalisando(true);
    try {
      const alvo = new Set(docNames);
      const arquivos: Array<any> = [];
      const originais: Array<{ id?: string; name?: string }> = Array.isArray(a.arquivos) ? a.arquivos : [];
      for (const d of originais) {
        if (!alvo.has(d.name as string)) { arquivos.push({ id: d.id, name: d.name }); continue; } // já feito → stub
        try {
          const resp = await supabase.functions.invoke("fetch-drive-file", { body: { file_id: d.id } });
          if (resp.error) throw resp.error;
          const buf = await (resp.data as Blob).arrayBuffer();
          const ext = await extrairTextoPdf(d.name as string, buf);
          if (ext.vazio) { arquivos.push({ id: d.id, name: d.name, texto: "" }); continue; }
          const p = analisarExtrato(d.name as string, ext.texto);
          if (p.reconciliado && p.transacoes.length >= 3) {
            arquivos.push({ id: d.id, name: d.name, reconciliado: true, periodo: p.periodo, header: p.header, saldoInicial: p.saldoInicial, saldoFinal: p.saldoFinal, transacoes: p.transacoes, resumo: p.resumo, candidatos: p.candidatos });
          } else {
            arquivos.push({ id: d.id, name: d.name, texto: ext.texto });
          }
        } catch { arquivos.push({ id: d.id, name: d.name, texto: "" }); }
      }
      const { data, error } = await supabase.functions.invoke("spy-analisar", { body: { reprocessar: a.id, cliente_id: cliente.id, arquivos, created_by: userId } });
      if (error) { toast.error("Não consegui reanalisar."); return; }
      qc.invalidateQueries({ queryKey: ["spy-analises", cliente.id] });
      const novoId = (data as any)?.analise_id || null;
      if (novoId) setFoco(novoId);
      toast.success("Reanalisando os documentos que faltaram…");
    } finally {
      setReanalisando(false);
    }
  };

  const cancelarAnalise = async (id: string) => {
    setFoco(null);
    await (supabase.from("spy_analise" as any) as any).delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["spy-analises", cliente.id] });
    qc.invalidateQueries({ queryKey: ["spy-stats"] });
    qc.invalidateQueries({ queryKey: ["spy-processando"] });
    toast.success("Análise cancelada.");
  };

  // ── TELA DE ANÁLISE (estilo Finder): anexar → radar (extração) → quadros →
  // cruzar dados (página hacker) → volta ao perfil com a ficha no topo. ────────
  if (mostrarDocs || enviando || rodando || posAnalise || aguardaMotor) {
    const sair = () => { setMostrarDocs(false); setPosAnalise(false); setAguardaMotor(false); };
    const fase = gerandoInsights ? "hacker" : (enviando || rodando || aguardaMotor) ? "radar" : mostrarDocs ? "picker" : ultima ? "quadros" : "vazio";
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button onClick={sair} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> {cliente.nome}
          </button>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Análise Spy</p>
        </div>

        {/* key={fase} remonta o bloco a cada etapa → animação de transição (spy-lock) */}
        <div key={fase} className="spy-lock">
          {fase === "hacker" && ultima ? (
            <TelaHacker a={ultima} />
          ) : fase === "radar" ? (
            <TelaRadar
              nome={cliente.nome}
              detalhe={rodando
                ? `${(Array.isArray(rodando.parciais) ? rodando.parciais.length : 0)} de ${(Array.isArray(rodando.arquivos) ? rodando.arquivos.length : 0)} extratos mapeados`
                : enviando ? (preparo || "Preparando os extratos…") : "Iniciando o motor…"}
              pct={rodando ? pctDe(rodando) : enviando ? preparoPct : null}
              desde={rodando?.created_at || null}
              onCancel={rodando ? () => { cancelarAnalise(rodando.id); sair(); } : undefined}
            />
          ) : fase === "picker" ? (
            <DocPicker
              cliente={cliente} drive={drive} loading={loadingDrive} err={!!driveErr} temAnalise={!!ultima} enviando={enviando} preparo={preparo}
              selFiles={selFiles} onToggle={toggleFile} onRefetch={() => refetchDrive()} onAnalisar={analisar} onCancel={sair}
            />
          ) : fase === "quadros" && ultima ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] px-4 py-3.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Extração concluída · {ultima.n_transacoes ?? 0} transações mapeadas</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Revise os quadros abaixo e cruze os dados para gerar a ficha do cliente.</p>
                </div>
                <Button onClick={() => gerarInsights(ultima)} className="gap-2 h-10 px-5 shrink-0">
                  <ScanLine className="h-4 w-4" /> Cruzar dados
                </Button>
              </div>
              <AnaliseCard a={ultima} flags={flags.filter((f) => f.analise_id === ultima.id)} defaultAberto ocultarInsights onReanalisar={(names) => reanalisar(ultima, names)} reanalisando={reanalisando} />
            </div>
          ) : (
            <SemAnalise onStart={() => setMostrarDocs(true)} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="spy-lock space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Todos os clientes
      </button>

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-3xl font-semibold tracking-tight truncate flex items-center gap-3">
            <Eye className="h-7 w-7 text-primary shrink-0" /> <span className="truncate">{cliente.nome}</span>
          </h2>
          {cliente.cpf_cnpj && <p className="text-xs text-muted-foreground mt-1">{cliente.cpf_cnpj}</p>}
        </div>
        {cliente.drive_folder_url && (
          <a href={cliente.drive_folder_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            <FolderOpen className="h-3.5 w-3.5" /> Pasta no Drive <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <FichaCliente ficha={ficha} />

      {ultima ? (
        <AnaliseCard a={ultima} flags={flags.filter((f) => f.analise_id === ultima.id)} defaultAberto onRegenerar={() => setMostrarDocs(true)} onReanalisar={(names) => reanalisar(ultima, names)} reanalisando={reanalisando} onInsights={() => gerarInsights(ultima)} gerandoInsights={gerandoInsights} alvoTx={alvoTx} />
      ) : erroAnalise ? (
        <AnaliseErro a={erroAnalise} onTentar={() => setMostrarDocs(true)} />
      ) : (
        <SemAnalise onStart={() => setMostrarDocs(true)} />
      )}
    </div>
  );
}

// Tela cheia dedicada à análise em trâmite: console com radar e feed lado a lado.
function AnaliseTelaCheia({ cliente, a, onBackground, onCancel }: { cliente: Cliente; a: Analise; onBackground: () => void; onCancel: () => void }) {
  const pct = Math.min(100, Math.max(0, Number(a.progresso?.pct) || 0));
  const feed: Array<{ msg: string; kind: string }> = Array.isArray(a.progresso?.feed) ? a.progresso.feed : [];
  const cancelar = () => { if (window.confirm("Cancelar esta análise? O progresso é descartado.")) onCancel(); };
  return (
    <div className="spy-lock space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] uppercase tracking-[0.15em] text-primary/80 flex items-center gap-1.5 font-mono">
          <Activity className="h-3.5 w-3.5" /> Análise em andamento
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={cancelar} className="gap-1.5 h-8 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10">
            <X className="h-3.5 w-3.5" /> Cancelar
          </Button>
          <Button variant="outline" size="sm" onClick={onBackground} className="gap-1.5 h-8">
            <ArrowLeft className="h-3.5 w-3.5" /> Rodar em segundo plano
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,400px),1fr] gap-4 items-stretch">
        {/* Painel do radar */}
        <div className="spy-scan spy-grid relative overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.04] p-6 flex flex-col items-center justify-center text-center min-h-[56vh]">
          <RadarViz size={150} />
          <h2 className="text-lg font-semibold mt-5 font-mono tracking-tight break-words max-w-full">{cliente.nome}</h2>
          <p className="text-sm text-foreground/80 mt-1">{a.progresso?.detalhe || "Vasculhando os extratos…"}</p>
          <div className="w-full max-w-xs mt-4 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground uppercase tracking-wider font-mono">
            <span>{a.progresso?.etapa || "processando"}</span>
            <span className="tabular-nums text-primary/80">{pct}%</span>
            <span className="tabular-nums"><Elapsed from={a.created_at} /></span>
          </div>
        </div>

        {/* Console do feed */}
        <div className="rounded-2xl border border-white/[0.08] bg-black/50 overflow-hidden flex flex-col min-h-[56vh]">
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-white/[0.06] bg-white/[0.02]">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono inline-flex items-center gap-1.5">
              <ScanLine className="h-3.5 w-3.5" /> Vasculhando
            </span>
          </div>
          <FeedBody feed={feed} />
        </div>
      </div>
    </div>
  );
}

const FEED_STYLE: Record<string, { cls: string; sig: string }> = {
  step: { cls: "text-foreground/70", sig: "›" },
  ok:   { cls: "text-emerald-400/90", sig: "✓" },
  tx:   { cls: "text-muted-foreground", sig: "·" },
  warn: { cls: "text-rose-400", sig: "!" },
  done: { cls: "text-primary font-medium", sig: "★" },
};

function FeedBody({ feed }: { feed: Array<any> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [feed.length]);
  return (
    <div ref={ref} className="font-mono text-[11.5px] leading-relaxed p-4 flex-1 overflow-y-auto scrollbar-thin space-y-0.5">
      {feed.length === 0 && <div className="text-muted-foreground/60">Iniciando...</div>}
      {feed.map((f, i) => {
        if (f.kind === "tx" && f.desc !== undefined) {
          const cat = categoria(f.desc);
          const CatIcon = cat.Icon;
          const pos = f.sinal > 0;
          return (
            <div key={i} className="flex items-center gap-1.5">
              {pos ? <ArrowUpRight className="h-3 w-3 text-emerald-400 shrink-0" /> : <ArrowDownRight className="h-3 w-3 text-rose-400 shrink-0" />}
              <CatIcon className={`h-3 w-3 shrink-0 ${cat.cls}`} />
              <span className="text-muted-foreground/60 tabular-nums shrink-0">{f.data}</span>
              <span className="text-muted-foreground truncate flex-1">{f.desc}</span>
              <span className={`tabular-nums shrink-0 ${pos ? "text-emerald-400/90" : "text-rose-400/90"}`}>
                {pos ? "+" : "-"}{f.valor != null ? fmtBRL(Math.abs(Number(f.valor))) : ""}
              </span>
            </div>
          );
        }
        const st = FEED_STYLE[f.kind] || FEED_STYLE.step;
        return (
          <div key={i} className={st.cls}>
            <span className="text-muted-foreground/40 select-none">{st.sig} </span>{f.msg}
          </div>
        );
      })}
      <span className="spy-blip inline-block text-primary">▋</span>
    </div>
  );
}

// Banner compacto quando há uma análise rodando e o usuário está na página do cliente.
function BannerRodando({ a, onOpen, onCancel }: { a: Analise; onOpen: () => void; onCancel: () => void }) {
  const pct = Math.min(100, Math.max(0, Number(a.progresso?.pct) || 0));
  const cancelar = () => { if (window.confirm("Cancelar esta análise? O progresso é descartado.")) onCancel(); };
  return (
    <div className="spy-scan relative overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.04] p-4 flex items-center gap-4">
      <button onClick={onOpen} className="flex items-center gap-4 flex-1 min-w-0 text-left">
        <RadarViz size={56} blips={false} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary spy-blip" />
            <span className="text-sm font-medium truncate">{a.progresso?.detalhe || "Analisando…"}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
            <span>Toque para ver ao vivo</span>
            <span className="inline-flex items-center gap-2"><span className="tabular-nums text-primary/80">{pct}%</span><Elapsed from={a.created_at} /></span>
          </div>
        </div>
      </button>
      <button onClick={cancelar} title="Cancelar análise" className="shrink-0 text-rose-400 hover:text-rose-300 p-1.5 rounded-md hover:bg-rose-500/10 transition-colors">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// Estado "sem análise": só o botão primeiro (revela os extratos ao clicar).
function SemAnalise({ onStart }: { onStart: () => void }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 flex flex-col items-center text-center">
      <div className="h-14 w-14 rounded-full border border-white/[0.08] bg-white/[0.02] flex items-center justify-center">
        <SearchX className="h-6 w-6 text-muted-foreground/60" />
      </div>
      <h3 className="text-base font-semibold mt-4">Este cliente ainda não foi analisado</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">
        Rode a análise do Spy nos extratos bancários para revelar quem é a pessoa e onde dá pra ajudar.
      </p>
      <Button onClick={onStart} className="gap-1.5 mt-5">
        <ScanLine className="h-4 w-4" /> Fazer análise do Spy
      </Button>
    </div>
  );
}

// Análise que falhou (ex.: conta OpenAI sem créditos). Mensagem clara + retry.
function AnaliseErro({ a, onTentar }: { a: Analise; onTentar: () => void }) {
  const semCredito = /sem cr[eé]dito|no credits|insufficient_quota|billing/i.test(String(a.erro || ""));
  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-6 flex flex-col items-center text-center">
      <div className="h-12 w-12 rounded-full border border-amber-500/25 bg-amber-500/10 flex items-center justify-center">
        <AlertTriangle className="h-5 w-5 text-amber-400" />
      </div>
      <h3 className="text-base font-semibold mt-4">
        {semCredito ? "Conta OpenAI sem créditos" : "A análise não pôde ser concluída"}
      </h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md">
        {semCredito
          ? "O motor de análise (OpenAI) está sem saldo. Adicione créditos na conta e rode de novo. Nenhuma cobrança extra foi feita."
          : (a.erro || "Tente novamente em instantes.")}
      </p>
      <Button onClick={onTentar} variant="outline" className="gap-1.5 mt-5">
        <RefreshCw className="h-4 w-4" /> Tentar de novo
      </Button>
    </div>
  );
}

// Seleção dos extratos (revelada pelo botão, com os extratos já pré-marcados).
function DocPicker({ cliente, drive, loading, err, temAnalise, enviando, preparo, selFiles, onToggle, onRefetch, onAnalisar, onCancel }: {
  cliente: Cliente; drive: DriveFile[] | undefined; loading: boolean; err: boolean; temAnalise?: boolean; enviando?: boolean; preparo?: string | null;
  selFiles: Set<string>; onToggle: (id: string) => void; onRefetch: () => void; onAnalisar: () => void; onCancel: () => void;
}) {
  const anexados = (drive || []).filter((f) => selFiles.has(f.id));
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
      {/* Barra superior: extrair dados */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.06] bg-white/[0.02] flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><ScanLine className="h-3.5 w-3.5" /> {temAnalise ? "Nova análise" : "Preparar análise"}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {enviando && preparo ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> {preparo}</span>
              : temAnalise ? "Isto cria uma análise do zero e substitui a atual." : "Anexe os extratos e extraia os dados."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onCancel} className="text-[11px] text-muted-foreground hover:text-foreground px-2">cancelar</button>
          <Button onClick={onAnalisar} disabled={selFiles.size === 0 || enviando} className="gap-1.5 h-9 px-4">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            Extrair dados {selFiles.size > 0 ? `(${selFiles.size})` : ""}
          </Button>
        </div>
      </div>

      {!drivePastaId(cliente) ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Este cliente ainda não tem pasta no Drive.</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center inline-flex items-center gap-2 justify-center w-full"><Loader2 className="h-4 w-4 animate-spin" /> Lendo o Drive…</p>
      ) : err ? (
        <p className="text-sm text-rose-400 py-8 text-center">Não consegui ler a pasta do Drive.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/[0.06]">
          {/* Esquerda (padrão Finder): arquivos do Drive para ANEXAR */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><FolderOpen className="h-3.5 w-3.5" /> Pasta do Drive ({(drive || []).length})</p>
              <button onClick={onRefetch} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><RefreshCw className="h-3 w-3" /> atualizar</button>
            </div>
            {(drive || []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Nenhum PDF na pasta.</p>
            ) : (
              <div className="space-y-1.5 max-h-[340px] overflow-y-auto scrollbar-thin pr-1">
                {(drive || []).map((f) => {
                  const on = selFiles.has(f.id);
                  return (
                    <button key={f.id} onClick={() => onToggle(f.id)}
                      className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-all duration-200 ${on ? "border-primary/30 bg-primary/[0.05] opacity-50 scale-[0.99]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:translate-x-0.5"}`}>
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate flex-1">{f.name}</span>
                      <span className={`text-[10px] shrink-0 ${on ? "text-primary" : "text-muted-foreground"}`}>{on ? "anexado ✓" : "+ anexar"}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {/* Direita: fila da análise (anexados) */}
          <div className="p-4 min-h-[280px]">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Fila de análise ({anexados.length})</p>
            {anexados.length === 0 ? (
              <div className="h-40 rounded-lg border border-dashed border-white/[0.12] flex items-center justify-center text-[12px] text-muted-foreground text-center px-4">
                Nenhum extrato na fila.<br />Clique nos arquivos do Drive ao lado para anexar.
              </div>
            ) : (
              <div className="space-y-1.5">
                {anexados.map((f) => (
                  <div key={f.id} className="spy-lock flex items-center gap-2.5 px-3 py-2 rounded-lg border border-primary/30 bg-primary/[0.07]">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm truncate flex-1">{f.name}</span>
                    <button onClick={() => onToggle(f.id)} className="text-muted-foreground hover:text-rose-400 shrink-0" title="Remover"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ficha do cliente (entrada + socioeconômico) ─────────────────────────────
type Ficha = {
  socio: Record<string, any> | null;
  requerido: string | null;
  contrato: { reus: string[] | null; data_assinatura: string | null } | null;
  fechamento: { responsavel: string | null; data: string | null } | null;
} | undefined;

// Interpreta valores digitados no formato brasileiro: "5.500,00" é 5500 (o
// parser antigo descartava a vírgula e virava 550000 — zeros a mais no Spy).
const parseValorBR = (v: string): number | null => {
  let t = String(v).replace(/[^\d.,]/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if ((t.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return isFinite(n) && n > 0 ? n : null;
};
const SOCIO_CAMPOS: { key: string; label: string; fmt?: (v: string) => string }[] = [
  { key: "renda_mensal", label: "Renda mensal", fmt: (v) => { const n = parseValorBR(v); return n !== null ? fmtBRL(n) : String(v); } },
  { key: "idade", label: "Idade" },
  { key: "escolaridade", label: "Escolaridade" },
  { key: "numero_filhos", label: "Filhos" },
  { key: "idades_filhos", label: "Idades dos filhos" },
  { key: "tipo_moradia", label: "Moradia" },
  { key: "unico_provedor", label: "Único provedor" },
  { key: "conjuge_trabalha", label: "Cônjuge trabalha" },
  { key: "outros_dependentes", label: "Outros dependentes" },
  { key: "condicao_saude", label: "Saúde" },
];

const fmtDataBR = (d: string | null | undefined) => {
  if (!d) return null;
  const dt = new Date(`${d}T00:00:00`);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("pt-BR");
};

function FichaCliente({ ficha }: { ficha: Ficha }) {
  if (!ficha) return null;
  const reus: string[] = Array.isArray(ficha.contrato?.reus) ? (ficha.contrato!.reus as string[]).filter(Boolean) : [];
  const parteRequerida = reus.length ? reus.join(", ") : (ficha.requerido || null);
  const dataAssin = fmtDataBR(ficha.contrato?.data_assinatura || ficha.fechamento?.data);
  const responsavel = ficha.fechamento?.responsavel || null;

  const socio: Record<string, any> = ficha.socio || {};
  const v = (k: string) => { const x = socio[k]; return x === undefined || x === null || String(x).trim() === "" ? null : String(x).trim(); };
  const fmtRenda = SOCIO_CAMPOS[0].fmt!;
  const obs = String(socio.observacoes_livres || "").trim();
  const saude = v("condicao_saude");

  // Mesmo design dos cards da ficha, no tema padrão — só um pouco mais
  // brilhantes, porque a fonte é outra: o próprio cliente.
  const SocioCard = ({ icon: I, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub?: string }) => (
    <div className="rounded-2xl border border-white/[0.12] bg-white/[0.04] p-4 flex items-start gap-3.5">
      <span className="h-11 w-11 rounded-xl bg-primary/[0.14] ring-1 ring-primary/25 text-primary flex items-center justify-center shrink-0"><I className="h-5 w-5" /></span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-[19px] font-semibold text-foreground leading-tight mt-0.5 truncate">{value}</p>
        {sub && <p className="text-[11.5px] text-muted-foreground mt-1 leading-snug line-clamp-2">{sub}</p>}
      </div>
    </div>
  );

  const cards: Array<{ icon: LucideIcon; label: string; value: string; sub?: string }> = [];
  if (v("renda_mensal")) cards.push({ icon: Banknote, label: "Renda mensal (informada)", value: fmtRenda(v("renda_mensal")!) });
  if (v("idade")) cards.push({ icon: CalendarDays, label: "Idade", value: `${v("idade")} anos` });
  if (v("escolaridade")) cards.push({ icon: GraduationCap, label: "Escolaridade", value: v("escolaridade")! });
  if (v("numero_filhos")) cards.push({ icon: Users, label: "Filhos", value: v("numero_filhos")!, sub: v("idades_filhos") ? `idades: ${v("idades_filhos")}` : undefined });
  if (v("tipo_moradia")) cards.push({ icon: Home, label: "Moradia", value: capitalizar(v("tipo_moradia")) });
  if (v("unico_provedor")) cards.push({
    icon: Scale, label: "Único provedor", value: capitalizar(v("unico_provedor")),
    sub: [v("conjuge_trabalha") ? `cônjuge trabalha: ${v("conjuge_trabalha")}` : null, v("outros_dependentes") ? `outros dependentes: ${v("outros_dependentes")}` : null].filter(Boolean).join(" · ") || undefined,
  });
  if (saude && !/^n[aã]o$/i.test(saude)) cards.push({ icon: HeartPulse, label: "Saúde", value: saude });

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-[13px]">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5">
            <Scale className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Requerido:</span>
            <span className={parteRequerida ? "text-foreground/90" : "text-muted-foreground"}>{parteRequerida || "não informado"}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Assinado:</span>
            <span className={dataAssin ? "text-foreground/90" : "text-muted-foreground"}>
              {dataAssin ? (responsavel ? `${dataAssin} · com ${responsavel}` : dataAssin) : "não informado"}
            </span>
          </span>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" /> Socioeconômico
          </p>
          <span className="text-[9px] px-1.5 py-px rounded-full ring-1 text-primary ring-primary/25 bg-primary/10">informado pelo cliente</span>
        </div>
        {cards.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {cards.map((c, i) => <SocioCard key={i} {...c} />)}
            </div>
            {obs && <p className="text-[12px] text-muted-foreground mt-2"><span className="text-foreground/70">Obs.:</span> {obs}</p>}
          </>
        ) : (
          <p className="text-[12.5px] text-muted-foreground rounded-xl border border-dashed border-white/[0.1] px-4 py-3">O cliente ainda não preencheu o formulário socioeconômico.</p>
        )}
      </div>
    </div>
  );
}

// tempo de rodagem vivo
function Elapsed({ from }: { from: string }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, []);
  const secs = Math.max(0, Math.floor((Date.now() - new Date(from).getTime()) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return <span className="tabular-nums">{mm}:{ss}</span>;
}

// Tela de EXTRAÇÃO: só o radar, centralizado, com o passo atual e a barra.
function TelaRadar({ nome, detalhe, pct, desde, onCancel }: { nome: string; detalhe: string; pct: number | null; desde: string | null; onCancel?: () => void }) {
  return (
    <div className="spy-scan relative overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.03] spy-grid min-h-[420px] flex flex-col items-center justify-center gap-5 p-8">
      <RadarViz size={150} />
      <div className="text-center max-w-md">
        <p className="text-lg font-semibold tracking-tight">{nome}</p>
        <p className="text-[13px] text-muted-foreground mt-1 inline-flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary spy-blip" /> {detalhe}
        </p>
      </div>
      <div className="w-full max-w-sm">
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct ?? 8}%` }} />
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
          <span>analisando</span>
          <span className="inline-flex items-center gap-2">
            {pct !== null && <span className="tabular-nums text-primary/80">{pct}%</span>}
            {desde && <span>· <Elapsed from={desde} /></span>}
          </span>
        </div>
      </div>
      {onCancel && (
        <button onClick={onCancel} className="text-[11px] text-muted-foreground hover:text-rose-400 inline-flex items-center gap-1"><X className="h-3.5 w-3.5" /> Cancelar</button>
      )}
    </div>
  );
}

// Feed "hacker": as transações do cliente correndo rápido num terminal.
function HackerFeed({ linhas }: { linhas: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => { const id = setInterval(() => setI((x) => x + 1), 55); return () => clearInterval(id); }, []);
  if (!linhas.length) return null;
  const vis: string[] = [];
  for (let k = 13; k >= 0; k--) { const idx = i - k; if (idx >= 0) vis.push(linhas[idx % linhas.length]); }
  return (
    <div className="spy-hack relative rounded-xl border border-white/[0.08] bg-black/40 font-mono text-[11px] leading-relaxed p-3.5 h-64 overflow-hidden w-full max-w-lg">
      {vis.map((l, k) => (
        <p key={i - (vis.length - 1 - k)} className={`truncate ${k === vis.length - 1 ? "text-emerald-400/75" : k >= vis.length - 4 ? "text-emerald-400/40" : "text-muted-foreground/30"}`}>▸ {l}</p>
      ))}
    </div>
  );
}

// Tela de CRUZAMENTO: radar + card com as transações sendo processadas em
// ritmo hacker, enquanto a IA monta a ficha.
function TelaHacker({ a }: { a: Analise }) {
  const linhas = useMemo(() => {
    const parciais: any[] = Array.isArray(a.parciais) ? a.parciais : [];
    const out: string[] = [];
    for (const p of parciais) if (Array.isArray(p.transacoes)) for (const t of p.transacoes) out.push(`${t.data || ""}  ${String(t.descricao || "").slice(0, 58)}  ${Number(t.valor) < 0 ? "-" : "+"}${Math.abs(Number(t.valor) || 0).toFixed(2)}`);
    // embaralha de leve para não rodar em ordem estrita
    for (let k = out.length - 1; k > 0; k--) { const r = (k * 7919) % (k + 1); [out[k], out[r]] = [out[r], out[k]]; }
    return out;
  }, [a.id]);
  return (
    <div className="spy-scan relative overflow-hidden rounded-2xl border border-emerald-500/15 bg-transparent spy-grid min-h-[460px] flex flex-col items-center justify-center gap-5 p-8">
      <RadarViz size={110} className="text-emerald-400/70" />
      <div className="text-center">
        <p className="text-lg font-semibold tracking-tight">Cruzando dados</p>
        <p className="text-[13px] text-muted-foreground mt-1">A IA está processando as {a.n_transacoes ?? linhas.length} transações e montando a ficha do cliente…</p>
      </div>
      <HackerFeed linhas={linhas} />
    </div>
  );
}

// Quadro de UM extrato (isolado): mapeamento NEUTRO de TODAS as transações, num
// grid denso estilo terminal financeiro, em múltiplas colunas (não empilha tudo).
function QuadroExtrato({ p, alvoTx }: { p: any; alvoTx?: AlvoTx | null }) {
  const [busca, setBusca] = useState("");
  const txs: any[] = Array.isArray(p?.transacoes) ? p.transacoes : [];
  const alvoRef = useRef<HTMLDivElement | null>(null);
  // Transação-alvo (veio do banco geral): acha a linha neste quadro — primeiro
  // por data+valor+descrição exata; se não, relaxa pra data+valor.
  const alvoIdx = useMemo(() => {
    if (!alvoTx) return -1;
    const vAlvo = Math.abs(Number(alvoTx.valor) || 0).toFixed(2);
    const dAlvo = String(alvoTx.data || "");
    const descAlvo = String(alvoTx.descricao || "").trim();
    let i = txs.findIndex((t) => String(t.data || "") === dAlvo && Math.abs(Number(t.valor) || 0).toFixed(2) === vAlvo && String(t.descricao || "").trim() === descAlvo);
    if (i < 0 && descAlvo === "") i = txs.findIndex((t) => String(t.data || "") === dAlvo && Math.abs(Number(t.valor) || 0).toFixed(2) === vAlvo);
    return i;
  }, [txs, alvoTx]);
  useEffect(() => {
    if (alvoIdx >= 0) {
      const id = setTimeout(() => alvoRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 350);
      return () => clearTimeout(id);
    }
  }, [alvoIdx]);
  const q = busca.trim().toLowerCase();
  const visiveis = q
    ? txs.filter((t) => `${t.data || ""} ${t.descricao || ""} ${Math.abs(Number(t.valor) || 0).toFixed(2)}`.toLowerCase().includes(q))
    : txs;
  const entradas = txs.reduce((s, t) => s + (Number(t.valor) > 0 ? Number(t.valor) : 0), 0);
  const saidas = txs.reduce((s, t) => s + (Number(t.valor) < 0 ? Math.abs(Number(t.valor)) : 0), 0);
  const res = entradas - saidas;
  const b = p?.reconciliado ? { txt: "conferido pelo saldo", cls: "text-emerald-400 ring-emerald-500/25 bg-emerald-500/10" } : { txt: "lido por IA", cls: "text-sky-400 ring-sky-500/25 bg-sky-500/10" };
  const KPI = ({ label, value, cls = "text-foreground" }: { label: string; value: string; cls?: string }) => (
    <div className="px-3 py-2">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-[13px] font-medium tabular-nums ${cls}`}>{value}</p>
    </div>
  );

  return (
    <div className="rounded-xl border border-white/[0.09] bg-black/25 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-white/[0.07] bg-white/[0.02]">
        <span className="text-[13px] font-medium inline-flex items-center gap-2 min-w-0 font-mono">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" /> <span className="truncate">{p.name}</span>
          {p.periodo && <span className="text-[11px] text-muted-foreground shrink-0">· {p.periodo}</span>}
        </span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 shrink-0 ${b.cls}`}>{b.txt}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/[0.06] border-b border-white/[0.07] bg-white/[0.01]">
        <KPI label="Lançamentos" value={String(txs.length)} />
        <KPI label="Entradas" value={fmtBRL(entradas)} cls="text-emerald-400" />
        <KPI label="Saídas" value={fmtBRL(saidas)} cls="text-rose-400" />
        <KPI label="Resultado" value={fmtBRL(res)} cls={res >= 0 ? "text-emerald-400" : "text-rose-400"} />
      </div>

      {txs.length > 0 && (
        <div className="px-3 pt-2.5 flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar transação…"
              className="w-full h-8 rounded-md border border-white/[0.08] bg-white/[0.02] pl-8 pr-7 text-[12px] font-mono outline-none focus:border-primary/40 placeholder:text-muted-foreground/60"
            />
            {busca && (
              <button onClick={() => setBusca("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
            )}
          </div>
          {q && <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{visiveis.length} de {txs.length}</span>}
        </div>
      )}
      {txs.length > 0 && (
        <div className="max-h-[70vh] overflow-y-auto scrollbar-thin p-3">
          {visiveis.length === 0 ? (
            <p className="text-[12px] text-muted-foreground text-center py-6">Nenhuma transação bate com "{busca}".</p>
          ) : (
          <div className="columns-1 md:columns-2 2xl:columns-3 gap-x-6">
            {visiveis.map((t, i) => {
              const cat = categoria(t.descricao); const neg = Number(t.valor) < 0;
              const ehAlvo = !busca && alvoIdx >= 0 && txs[alvoIdx] === t;
              return (
                <div key={i} ref={ehAlvo ? alvoRef : undefined}
                  className={`break-inside-avoid flex items-center gap-2 py-[3px] font-mono text-[11px] leading-tight ${ehAlvo ? "bg-amber-400/15 ring-1 ring-amber-400/50 rounded-md px-1.5 -mx-1.5 border-b border-transparent" : "border-b border-white/[0.045]"}`}>
                  <span className={`${cat.cls} h-1.5 w-1.5 rounded-full bg-current shrink-0 opacity-80`} />
                  <span className="text-muted-foreground tabular-nums shrink-0 w-[72px]">{t.data || "—"}</span>
                  <span className="truncate flex-1 text-foreground/75">{t.descricao}</span>
                  <span className={`tabular-nums shrink-0 ${neg ? "text-rose-400" : "text-emerald-400"}`}>{neg ? "-" : "+"}{fmtBRL(Math.abs(Number(t.valor) || 0))}</span>
                </div>
              );
            })}
          </div>
          )}
        </div>
      )}
    </div>
  );
}

// Insights comerciais (saída da IA sobre o digest computado por código):
// resumo comercial, prioridades 🔴🟡🟢 com ficha completa e narrativa.
const SEG_LABEL: Record<string, string> = {
  roupas_departamento: "Roupas e departamento", supermercado_atacado: "Supermercados e atacado",
  farmacia: "Farmácias", marketplace: "Marketplaces",
  saude_clinicas: "Saúde e clínicas", estetica: "Estética e cuidados", concessionarias: "Concessionárias (energia/água)",
};
// Cor fixa e coerente por segmento — a mesma na fatia da pizza, na legenda e
// no grupo de transações (nada de paleta aleatória por índice).
const SEG_COR: Record<string, string> = {
  supermercado_atacado: "#10b981",   // verde · alimentação
  farmacia: "#f43f5e",               // rosa-vermelho · farmácia
  saude_clinicas: "#14b8a6",         // teal · saúde/clínicas
  estetica: "#ec4899",               // pink · estética
  marketplace: "#38bdf8",            // azul-céu · compras online
  roupas_departamento: "#f59e0b",    // âmbar · vestuário
  concessionarias: "#eab308",        // amarelo · energia/água
};
const MARCO_LABEL: Record<string, string> = {
  primeiro_sinal_endividamento: "Primeiro sinal de endividamento",
  primeiro_emprestimo: "Primeiro empréstimo",
  aumento_uso_cartao: "Aumento do uso do cartão",
  entrada_no_rotativo: "Entrada no rotativo do cartão",
  novo_emprestimo: "Novo empréstimo",
  renegociacao: "Renegociação de dívida",
  refinanciamento: "Refinanciamento",
  maior_concentracao_de_dividas: "Maior concentração de dívidas",
};
const capitalizar = (s: any) => { const t = String(s || "").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ""; };

// Logos das instituições: favicon do site oficial (serviço público do Google).
// Se não carregar, cai no ícone pintado com a cor da marca.
const INST_MARCA: Record<string, { dominio: string; cor: string }> = {
  "Bradesco": { dominio: "bradesco.com.br", cor: "#CC092F" },
  "Itaú": { dominio: "itau.com.br", cor: "#EC7000" },
  "Santander": { dominio: "santander.com.br", cor: "#EC0000" },
  "Caixa Econômica": { dominio: "caixa.gov.br", cor: "#0070AF" },
  "Banco do Brasil": { dominio: "bb.com.br", cor: "#F8D117" },
  "Banco Inter": { dominio: "bancointer.com.br", cor: "#FF7A00" },
  "C6 Bank": { dominio: "c6bank.com.br", cor: "#9AA1A9" },
  "Nubank": { dominio: "nubank.com.br", cor: "#820AD1" },
  "PagBank": { dominio: "pagbank.com.br", cor: "#01AA3C" },
  "Mercado Pago": { dominio: "mercadopago.com.br", cor: "#00AEEF" },
  "PicPay": { dominio: "picpay.com", cor: "#21C25E" },
  "Neon": { dominio: "neon.com.br", cor: "#00A5EB" },
  "Will Bank": { dominio: "willbank.com.br", cor: "#FFD500" },
  "Crefisa": { dominio: "crefisa.com.br", cor: "#00539F" },
  "Agibank": { dominio: "agibank.com.br", cor: "#0090FF" },
  "BMG": { dominio: "bancobmg.com.br", cor: "#FF6900" },
  "Banco Pan": { dominio: "bancopan.com.br", cor: "#00B4E5" },
  "Facta": { dominio: "facta.com.br", cor: "#00A859" },
  "Losango": { dominio: "losango.com.br", cor: "#E30613" },
  "Omni": { dominio: "omni.com.br", cor: "#F58220" },
  "Credsystem": { dominio: "credsystem.com.br", cor: "#E4002B" },
  "Midway (Riachuelo)": { dominio: "midway.com.br", cor: "#00A5A8" },
  "Riachuelo": { dominio: "riachuelo.com.br", cor: "#00A5A8" },
  "Renner/Realize": { dominio: "lojasrenner.com.br", cor: "#C8102E" },
  "Pernambucanas": { dominio: "pernambucanas.com.br", cor: "#F26522" },
  "Casas Bahia": { dominio: "casasbahia.com.br", cor: "#1A4A9E" },
  "Magalu/Luizacred": { dominio: "magazineluiza.com.br", cor: "#0086FF" },
  "Carrefour": { dominio: "carrefour.com.br", cor: "#004E9F" },
  "Sicoob": { dominio: "sicoob.com.br", cor: "#003641" },
  "Sicredi": { dominio: "sicredi.com.br", cor: "#3FA110" },
  "Banco BV": { dominio: "bv.com.br", cor: "#243BFF" },
  "Daycoval": { dominio: "daycoval.com.br", cor: "#00437A" },
  "Safra": { dominio: "safra.com.br", cor: "#06357A" },
};
// Detecção do banco/financeira no histórico de um crédito (para dizer de onde
// o empréstimo veio). Sem match → banco emissor do extrato.
const INST_RE: Array<[RegExp, string]> = [
  [/BRADESCO/i, "Bradesco"], [/ITAU|ITAÚ/i, "Itaú"], [/SANTANDER/i, "Santander"],
  [/CAIXA ECON|\bCEF\b/i, "Caixa Econômica"], [/BANCO DO BRASIL|BCO (DO )?BRASIL/i, "Banco do Brasil"],
  [/CREFISA/i, "Crefisa"], [/AGIBANK/i, "Agibank"], [/\bBMG\b/i, "BMG"], [/\bPAN\b/i, "Banco Pan"],
  [/\bFACTA\b/i, "Facta"], [/LOSANGO/i, "Losango"], [/\bOMNI\b/i, "Omni"], [/DAYCOVAL/i, "Daycoval"],
  [/\bSAFRA\b/i, "Safra"], [/\bBV\b|VOTORANTIM/i, "Banco BV"], [/SICOOB/i, "Sicoob"], [/SICREDI/i, "Sicredi"],
  [/\bINTER\b/i, "Banco Inter"], [/\bC6\b/i, "C6 Bank"], [/NUBANK|NU PAGAMENTOS/i, "Nubank"],
];

function LogoBanco({ nome }: { nome: string }) {
  const [erro, setErro] = useState(false);
  const marca = INST_MARCA[nome];
  if (!marca || erro) {
    return (
      <span className="h-9 w-9 rounded-lg bg-white/[0.04] ring-1 ring-white/[0.1] flex items-center justify-center shrink-0" style={marca ? { color: marca.cor } : undefined}>
        <Landmark className={`h-4 w-4 ${marca ? "" : "text-primary"}`} />
      </span>
    );
  }
  return (
    <span className="h-9 w-9 rounded-lg bg-white ring-1 ring-white/15 flex items-center justify-center shrink-0 overflow-hidden">
      <img src={`https://www.google.com/s2/favicons?domain=${marca.dominio}&sz=64`} alt={nome} loading="lazy" className="h-[22px] w-[22px] object-contain" onError={() => setErro(true)} />
    </span>
  );
}
const marcoLabel = (m: any) => MARCO_LABEL[String(m || "")] || capitalizar(String(m || "").replace(/_/g, " "));
const fmtQuando = (q: any) => {
  const s = String(q || "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (iso) return iso[3] ? `${iso[3]}/${iso[2]}/${iso[1]}` : `${iso[2]}/${iso[1]}`;
  return s;
};

// Pizza interativa em SVG (donut): hover realça a fatia e mostra o segmento no
// centro; clique seleciona o segmento (o pai destaca as transações dele).
function PizzaConsumo({ dados, selecionado, onSelecionar }: {
  dados: { seg: string; label: string; cor: string; value: number }[];
  selecionado?: string | null;
  onSelecionar?: (seg: string | null) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const total = dados.reduce((s, d) => s + d.value, 0);
  if (!total) return null;
  const foco = hover ?? selecionado ?? null;
  const focoDado = foco ? dados.find((d) => d.seg === foco) : null;
  const alternar = (seg: string) => onSelecionar?.(selecionado === seg ? null : seg);
  let acc = 0;
  return (
    <div className="flex items-center gap-5 flex-wrap">
      <div className="relative shrink-0">
        <svg viewBox="0 0 42 42" className="h-36 w-36 -rotate-90">
          {dados.map((d) => {
            const pct = (d.value / total) * 100;
            const ativo = foco === d.seg;
            const el = (
              <circle key={d.seg} cx="21" cy="21" r="15.915" fill="none" stroke={d.cor}
                strokeWidth={ativo ? 8.8 : 7} strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-acc}
                opacity={foco && !ativo ? 0.3 : 1}
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHover(d.seg)} onMouseLeave={() => setHover(null)}
                onClick={() => alternar(d.seg)}
              />
            );
            acc += pct;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-7">
          {focoDado ? (
            <>
              <p className="text-[9.5px] text-muted-foreground leading-tight line-clamp-2">{focoDado.label}</p>
              <p className="text-[14px] font-semibold tabular-nums text-foreground mt-0.5">{Math.round((focoDado.value / total) * 100)}%</p>
              <p className="text-[10px] text-muted-foreground tabular-nums">{fmtBRL(focoDado.value)}</p>
            </>
          ) : (
            <>
              <p className="text-[9.5px] uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="text-[12.5px] font-semibold tabular-nums text-foreground mt-0.5">{fmtBRL(total)}</p>
            </>
          )}
        </div>
      </div>
      <div className="space-y-0.5 min-w-0 flex-1">
        {dados.map((d) => {
          const ativo = foco === d.seg;
          return (
            <button key={d.seg} type="button"
              onMouseEnter={() => setHover(d.seg)} onMouseLeave={() => setHover(null)}
              onClick={() => alternar(d.seg)}
              className={`w-full text-left text-[11.5px] flex items-center gap-2 rounded-md px-1.5 py-1 transition-all duration-200 cursor-pointer ${ativo ? "bg-white/[0.05]" : foco ? "opacity-45" : "hover:bg-white/[0.03]"} ${selecionado === d.seg ? "ring-1 ring-primary/30" : ""}`}>
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: d.cor }} />
              <span className="text-foreground/85 truncate">{d.label}</span>
              <span className="text-muted-foreground tabular-nums ml-auto pl-3 shrink-0">{fmtBRL(d.value)} · {Math.round((d.value / total) * 100)}%</span>
            </button>
          );
        })}
        {selecionado && <p className="text-[10px] text-muted-foreground pl-1.5 pt-1">segmento destacado acima · clique de novo para limpar</p>}
      </div>
    </div>
  );
}
function Sec({ icon: Icon, title, children, right }: { icon: LucideIcon; title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.015] overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" /> {title}</p>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
function InsightsView({ ins, dg, txs = [] }: { ins: any; dg?: any; txs?: any[] }) {
  const { palette } = useTheme();
  const corPrimaria = PRIMARY_HSL[palette] ?? PRIMARY_HSL.default;
  // Segmento de consumo selecionado na pizza (clique) — destaca as transações
  // daquele segmento dentro da própria seção de relações de consumo.
  const [segSel, setSegSel] = useState<string | null>(null);
  const rc = ins?.resumo_comercial || {};
  const emprestimos: any[] = Array.isArray(ins?.emprestimos) ? ins.emprestimos : [];
  const linha: any[] = Array.isArray(ins?.linha_endividamento) ? ins.linha_endividamento : [];

  const instituicoes: any[] = [...(Array.isArray(dg?.instituicoes) ? dg.instituicoes : [])].sort((a, b) => (b.ocorrencias || 0) - (a.ocorrencias || 0));
  const cartoes = dg?.cartoes;
  const veiculo = dg?.veiculo;
  const varejo = dg?.varejo || {};
  const superC = dg?.supermercados_consumo;
  const telecom: any[] = Array.isArray(dg?.telecom) ? dg.telecom : [];
  const entradaSaida: any[] = Array.isArray(dg?.entradas_seguidas_de_saidas) ? dg.entradas_seguidas_de_saidas : [];
  const contrapartes: any[] = Array.isArray(dg?.contrapartes_pix) ? dg.contrapartes_pix : [];

  // Números vindos do digest (determinísticos): um dado por card, sem misturar.
  const NOME_MES = ["", "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const creditos: any[] = Array.isArray(dg?.creditos_recebidos) ? dg.creditos_recebidos : [];
  const totalCred = creditos.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const fonteTop = dg?.renda?.fontes?.[0];
  const saz = dg?.sazonalidade_mes_do_ano || {};
  const topMes = Object.entries(saz).sort((a: any, b: any) => (b[1]?.emprestimos || 0) - (a[1]?.emprestimos || 0))[0] as any;
  const relacoes = String(rc.principais_relacoes || "").split(" · ").filter((r) => r && r !== "—");

  // Pizza das relações de consumo: total gasto por segmento do varejo.
  const pieDados = Object.entries(varejo)
    .filter(([, v]: any) => v?.length)
    .map(([seg, list]: any) => ({ seg, label: SEG_LABEL[seg] || seg, cor: SEG_COR[seg] || "#64748b", value: list.reduce((s: number, v: any) => s + (Number(v.total) || 0), 0) }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  // Série mensal de combustível (linha do tempo do veículo), computada das
  // transações mapeadas: todos os meses do período, com zero onde não houve.
  const serieVeiculo = useMemo(() => {
    const comb = new Map<string, number>();
    let min = "", max = "";
    for (const t of txs) {
      const d = String(t?.data || "");
      if (!/^\d{4}-\d{2}/.test(d)) continue;
      const m = d.slice(0, 7);
      if (!min || m < min) min = m;
      if (!max || m > max) max = m;
      if (Number(t.valor) < 0 && /POSTO|COMBUST|GASOLINA/i.test(String(t.descricao || ""))) {
        comb.set(m, (comb.get(m) || 0) + Math.abs(Number(t.valor)));
      }
    }
    if (!min || !comb.size) return [];
    const pts: { mes: string; valor: number }[] = [];
    let [y, mo] = min.split("-").map(Number);
    const [ym, mm2] = max.split("-").map(Number);
    while (y < ym || (y === ym && mo <= mm2)) {
      const k = `${y}-${String(mo).padStart(2, "0")}`;
      pts.push({ mes: k, valor: +(comb.get(k) || 0).toFixed(2) });
      mo++; if (mo > 12) { mo = 1; y++; }
    }
    return pts;
  }, [txs]);
  const fmtMes = (m: string) => { const [a, b] = String(m).split("-"); return b ? `${b}/${a.slice(2)}` : m; };

  const StatCard = ({ icon: I, label, value, sub }: { icon: LucideIcon; label: string; value: string; sub?: string }) => (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 flex items-start gap-3.5">
      <span className="h-11 w-11 rounded-xl bg-primary/[0.08] ring-1 ring-primary/15 text-primary flex items-center justify-center shrink-0"><I className="h-5 w-5" /></span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-[19px] font-semibold text-foreground leading-tight mt-0.5 truncate">{value}</p>
        {sub && <p className="text-[11.5px] text-muted-foreground mt-1 leading-snug line-clamp-2">{sub}</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Resumo: um dado por card, ícone na lateral, proporção de dashboard */}
      {dg ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            <StatCard icon={Banknote} label="Renda média mensal" value={fmtBRL(dg.renda?.media_mensal || 0)} sub={`${dg.renda?.meses_com_renda || 0} meses com renda no período`} />
            <StatCard icon={Landmark} label="Fonte de renda" value={String(fonteTop?.nome || "—").replace(/^TRANSF SALDO C\/SAL P\/CC\s*/i, "").trim() || "—"} sub={fonteTop ? `${fonteTop.n} recebimentos · ${fmtBRL(fonteTop.total)}` : undefined} />
            <StatCard icon={Layers} label="Instituições financeiras" value={String(instituicoes.length)} sub={instituicoes.map((i: any) => i.nome).join(", ") || "—"} />
            <StatCard icon={CreditCard} label="Empréstimos" value={String(creditos.length)} sub={dg.sinais_refinanciamento?.length ? `${dg.sinais_refinanciamento.length} com sinal de refinanciamento` : "sem sinal de refinanciamento"} />
            <StatCard icon={Receipt} label="Total emprestado" value={fmtBRL(totalCred)} sub="soma dos créditos de empréstimo do período" />
            <StatCard icon={CalendarDays} label="Primeiro crédito" value={creditos[0] ? String(creditos[0].data).split("-").reverse().join("/") : "—"} sub={creditos[0] ? `${fmtBRL(creditos[0].valor)} · ${String(creditos[0].descricao || "").slice(0, 42)}` : undefined} />
            <StatCard icon={TrendingUp} label="Mês de maior contratação" value={topMes && topMes[1]?.emprestimos > 0 ? NOME_MES[parseInt(topMes[0], 10)] : "—"} sub={topMes && topMes[1]?.emprestimos > 0 ? `${topMes[1].emprestimos} contratações, somando os anos` : undefined} />
          </div>
          {relacoes.length > 0 && (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 flex items-start gap-3.5">
              <span className="h-11 w-11 rounded-xl bg-primary/[0.08] ring-1 ring-primary/15 text-primary flex items-center justify-center shrink-0"><Users className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Principais relações</p>
                <div className="flex flex-wrap gap-1.5">
                  {relacoes.map((r, i) => <span key={i} className="text-[12px] rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-foreground/90">{r}</span>)}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {Object.entries({ "Renda identificada": rc.renda_identificada, "Instituições": rc.instituicoes, "Empréstimos": rc.emprestimos, "Primeiro crédito": rc.primeiro_credito, "Maior contratação": rc.periodo_maior_contratacao, "Principais relações": rc.principais_relacoes }).map(([label, value]) => (
            <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className="text-[12.5px] text-foreground/90 mt-0.5 leading-snug">{String(value || "—")}</p>
            </div>
          ))}
        </div>
      )}

      {/* Ciclo do endividamento: passos numerados, rótulos legíveis */}
      {linha.length > 0 && (
        <Sec icon={TrendingUp} title="Ciclo do endividamento">
          <p className="text-[11.5px] text-muted-foreground mb-3.5">A ordem dos acontecimentos no extrato: quando começou, como evoluiu e onde chegou.</p>
          <div>
            {linha.map((m, i) => {
              // do amarelo (início) ao vermelho (auge do endividamento)
              const f = linha.length > 1 ? i / (linha.length - 1) : 1;
              const cor = f < 0.34 ? "bg-amber-400/10 ring-amber-400/30 text-amber-400" : f < 0.67 ? "bg-orange-400/10 ring-orange-400/30 text-orange-400" : "bg-rose-500/10 ring-rose-500/30 text-rose-400";
              const trilho = f < 0.34 ? "bg-amber-400/25" : f < 0.67 ? "bg-orange-400/25" : "bg-rose-500/25";
              return (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`h-6 w-6 rounded-full ring-1 text-[11px] font-semibold flex items-center justify-center shrink-0 ${cor}`}>{i + 1}</span>
                  {i < linha.length - 1 && <span className={`w-px flex-1 my-1 ${trilho}`} />}
                </div>
                <div className={`min-w-0 ${i < linha.length - 1 ? "pb-4" : ""}`}>
                  <p className="text-[12.5px] font-medium text-foreground">{marcoLabel(m.marco)} <span className="text-[11px] font-normal text-muted-foreground tabular-nums">· {fmtQuando(m.quando)}</span></p>
                  <p className="text-[12px] text-foreground/75 leading-relaxed">{m.detalhe}</p>
                </div>
              </div>
              );
            })}
          </div>
        </Sec>
      )}

      {/* Instituições financeiras: uma por linha, ícone ao lado */}
      {instituicoes.length > 0 && (
        <Sec icon={Landmark} title={`Instituições financeiras (${instituicoes.length})`}>
          <div className="divide-y divide-white/[0.05]">
            {instituicoes.map((i, k) => (
              <div key={k} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <LogoBanco nome={i.nome} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-foreground truncate">{i.nome}</p>
                  <p className="text-[11px] text-muted-foreground">{capitalizar(i.tipo)}{i.recorrencia ? ` · ${i.recorrencia}` : ""}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] tabular-nums text-foreground/90">{i.ocorrencias} mov.</p>
                  {(i.pago > 0 || i.recebido > 0) && (
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {i.recebido > 0 ? `+${fmtBRL(i.recebido)}` : ""}{i.recebido > 0 && i.pago > 0 ? " · " : ""}{i.pago > 0 ? `-${fmtBRL(i.pago)}` : ""}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Sec>
      )}

      {/* Cartões */}
      {cartoes && (cartoes.pagamentos > 0 || cartoes.mora_cartao?.n > 0) && (
        <Sec icon={CreditCard} title="Cartões">
          <div className="space-y-1.5 text-[12px]">
            <p><span className="text-muted-foreground">Pagamentos de fatura/cartão:</span> <span className="tabular-nums text-foreground/90">{cartoes.pagamentos}x · {fmtBRL(cartoes.total)}</span></p>
            {cartoes.mora_cartao?.n > 0
              ? <p className="text-amber-400">⚠ Mora de cartão {cartoes.mora_cartao.n}x ({fmtBRL(cartoes.mora_cartao.total)}) · indício de pagamento parcial/rotativo. Solicitar faturas.</p>
              : <p className="text-muted-foreground">Sem mora de cartão identificada no período.</p>}
          </div>
        </Sec>
      )}

      {/* Indícios de veículo: cards claros + linha do tempo do gasto com combustível */}
      {veiculo && veiculo.abastecimentos > 0 && (
        <Sec icon={Car} title="Indícios de veículo">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: "Abastecimentos", value: `${veiculo.abastecimentos}x`, sub: "lançamentos de combustível no período" },
                { label: "Total com combustível", value: fmtBRL(veiculo.total), sub: `${veiculo.meses_com_gasto} de ${veiculo.meses_no_periodo} meses com gasto` },
                { label: "Média por mês", value: `${fmtBRL(veiculo.media_mensal_quando_ha)}`, sub: "nos meses em que houve gasto" },
              ].map((c, i) => (
                <div key={i} className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 flex items-start gap-3.5">
                  <span className="h-11 w-11 rounded-xl bg-primary/[0.08] ring-1 ring-primary/15 text-primary flex items-center justify-center shrink-0"><Car className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
                    <p className="text-[19px] font-semibold text-foreground leading-tight mt-0.5 truncate">{c.value}</p>
                    <p className="text-[11.5px] text-muted-foreground mt-1 leading-snug">{c.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {serieVeiculo.length > 1 && (
              <div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                  <span>Gasto com combustível mês a mês</span>
                  <span>{fmtMes(veiculo.primeiro_mes)} a {fmtMes(veiculo.ultimo_mes)}</span>
                </div>
                <div className="h-[160px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={serieVeiculo} margin={{ top: 6, right: 14, left: 4, bottom: 0 }}>
                      <defs>
                        <linearGradient id="areaVeiculo" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={corPrimaria} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={corPrimaria} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="mes" tickFormatter={fmtMes} tick={{ fontSize: 10, fill: "currentColor" }} className="text-muted-foreground"
                        axisLine={false} tickLine={false} minTickGap={24} />
                      <YAxis tick={{ fontSize: 10, fill: "currentColor" }} className="text-muted-foreground" axisLine={false} tickLine={false} width={52}
                        tickFormatter={(n: number) => `R$${Math.round(n)}`} />
                      <ChartTooltip content={<ChartTip render={(l: string, valor: number) => (<><p className="font-medium">{fmtMes(l)}</p><p className="text-muted-foreground">{fmtBRL(valor)} em combustível</p></>)} />} />
                      <Area type="monotone" dataKey="valor" stroke={corPrimaria} strokeWidth={2} fill="url(#areaVeiculo)" animationDuration={700} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {veiculo.surgiu_no_meio_do_periodo && (
              <p className="text-[12px] text-foreground/85 rounded-lg border border-primary/15 bg-primary/[0.05] px-3 py-2">
                O gasto com combustível <span className="font-medium">começou em {fmtMes(veiculo.primeiro_mes)}</span> — antes disso não havia. Possível veículo recente; vale verificar financiamento.
              </p>
            )}
          </div>
        </Sec>
      )}

      {/* Varejo, supermercados e telecom */}
      {(Object.keys(varejo).some((k) => varejo[k]?.length) || superC?.n > 0 || telecom.length > 0) && (
        <Sec icon={Home} title="Relações de consumo">
          <div className="space-y-2.5">
            {Object.entries(varejo).filter(([, v]: any) => v?.length).map(([seg, list]: any) => (
              <div key={seg} className={`rounded-lg transition-all duration-300 ${segSel ? (segSel === seg ? "ring-1 ring-primary/25 bg-primary/[0.04] p-2.5 -mx-1" : "opacity-35") : ""}`}>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: SEG_COR[seg] || "#64748b" }} /> {SEG_LABEL[seg] || seg}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((v: any, k: number) => (
                    <span key={k} className="inline-flex items-center gap-1.5 text-[11px] rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1">
                      <span className="text-foreground/90 truncate max-w-[180px]">{v.nome}</span>
                      <span className="text-muted-foreground tabular-nums">{v.n}x · {fmtBRL(v.total)}</span>
                      {v.credito_proprio_conhecido && <span className="text-[9px] px-1 py-px rounded ring-1 text-amber-400 ring-amber-400/30 bg-amber-400/10">tem crédito próprio</span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {pieDados.length > 1 && (
              <div className="pt-3 mt-1 border-t border-white/[0.05]">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Gasto por segmento · passe o mouse e clique para destacar</p>
                <PizzaConsumo dados={pieDados} selecionado={segSel} onSelecionar={setSegSel} />
              </div>
            )}
            {(superC?.n > 0 || telecom.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {superC?.n > 0 && (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2.5">
                      <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: SEG_COR.supermercado_atacado }} /> Supermercados · modelo de consumo
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                      <div><p className="text-[10px] text-muted-foreground">Compras</p><p className="text-[16px] font-semibold tabular-nums leading-tight">{superC.n}</p></div>
                      <div><p className="text-[10px] text-muted-foreground">Gasto médio por compra</p><p className="text-[16px] font-semibold tabular-nums leading-tight">{fmtBRL(superC.gasto_medio_por_compra)}</p></div>
                      <div><p className="text-[10px] text-muted-foreground">1ª metade do período</p><p className="text-[14px] font-medium tabular-nums leading-tight">{fmtBRL(superC.total_primeira_metade)}</p></div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">2ª metade do período</p>
                        <p className={`text-[14px] font-medium tabular-nums leading-tight ${superC.total_segunda_metade > superC.total_primeira_metade ? "text-amber-400" : ""}`}>
                          {fmtBRL(superC.total_segunda_metade)}{superC.total_segunda_metade > superC.total_primeira_metade ? " ↑" : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {telecom.length > 0 && (
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2.5">Telefonia e internet</p>
                    <div className="divide-y divide-white/[0.05]">
                      {telecom.slice(0, 4).map((t: any, k: number) => (
                        <div key={k} className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
                          <p className="text-[12px] text-foreground/85 truncate">{t.nome}</p>
                          <div className="text-right shrink-0">
                            <p className="text-[12px] tabular-nums text-foreground/90">{t.n} contas</p>
                            <p className="text-[10.5px] tabular-nums text-muted-foreground">{t.menor !== t.maior ? `${fmtBRL(t.menor)} a ${fmtBRL(t.maior)}` : fmtBRL(t.menor)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Sec>
      )}

      {/* PIX: tabela clara de contrapartes (quem, quantas vezes, quanto foi e quanto veio) */}
      {(contrapartes.length > 0 || entradaSaida.length > 0) && (
        <Sec icon={ArrowLeftRight} title="PIX e transferências · principais contrapartes">
          <div className="space-y-3">
            {contrapartes.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="text-left font-medium pb-1.5 pr-3">Contraparte</th>
                      <th className="text-right font-medium pb-1.5 px-2">Movs.</th>
                      <th className="text-right font-medium pb-1.5 px-2">Enviado</th>
                      <th className="text-right font-medium pb-1.5 pl-2">Recebido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {contrapartes.slice(0, 8).map((c: any, k: number) => (
                      <tr key={k}>
                        <td className="py-2 pr-3 text-foreground/90"><span className="block truncate max-w-[240px]">{c.nome}</span></td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{c.n}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-rose-400">{c.enviado > 0 ? fmtBRL(c.enviado) : "—"}</td>
                        <td className="py-2 pl-2 text-right tabular-nums text-emerald-400">{c.recebido > 0 ? fmtBRL(c.recebido) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {entradaSaida.length > 0 && (
              <p className="text-[12px] text-amber-400">⚠ Em {entradaSaida.length} momento(s), uma entrada alta saiu quase por completo em até 48h — vale confirmar a finalidade.</p>
            )}
          </div>
        </Sec>
      )}

      {/* Empréstimos: card grande e clicável; aberto, uma ficha completa por
          crédito com o banco de origem (logo), rotulando cada informação. */}
      {(creditos.length > 0 || emprestimos.length > 0) && (() => {
        const bancoExtrato = instituicoes.find((i: any) => i.recorrencia === "banco do extrato")?.nome || null;
        const refiKeys = new Set((Array.isArray(dg?.sinais_refinanciamento) ? dg.sinais_refinanciamento : []).map((r: any) => `${r.credito?.data}|${r.credito?.valor}`));
        const fmtD = (d: any) => (d ? String(d).split("-").reverse().join("/") : "—");
        const nEmp = creditos.length || emprestimos.length;
        const nRefi = creditos.filter((c: any) => refiKeys.has(`${c.data}|${c.valor}`)).length;
        const loans = creditos.length
          ? creditos.map((c: any, i: number) => {
              const detectado = INST_RE.find(([re]) => re.test(String(c.descricao || "")))?.[1] || null;
              return {
                valor: fmtBRL(Number(c.valor) || 0), data: fmtD(c.data), descricao: String(c.descricao || ""),
                banco: detectado || bancoExtrato, viaExtrato: !detectado && !!bancoExtrato,
                pct: c.pct_da_renda_mensal, dias: c.dias_desde_anterior,
                refi: refiKeys.has(`${c.data}|${c.valor}`), ficha: emprestimos[i],
              };
            })
          : emprestimos.map((e: any) => ({ valor: e.valor, data: e.data, descricao: "", banco: bancoExtrato, viaExtrato: !!bancoExtrato, pct: null, dias: null, refi: false, ficha: e }));
        return (
          <Sec icon={CreditCard} title={`Créditos de empréstimo (${nEmp})`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mb-3">
              <StatCard icon={CreditCard} label="Empréstimos no período" value={String(nEmp)} sub={nRefi ? `${nRefi} com sinal de refinanciamento` : "sem sinal de refinanciamento"} />
              {totalCred > 0 && <StatCard icon={Receipt} label="Total emprestado" value={fmtBRL(totalCred)} sub="soma dos créditos de empréstimo" />}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 items-start">
              {loans.map((l: any, i: number) => (
                <div key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3.5 flex gap-3.5">
                  <LogoBanco nome={l.banco || ""} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2.5 flex-wrap">
                      <span className="text-[16px] font-semibold tabular-nums text-foreground">{l.valor}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{l.data}</span>
                      {l.banco && (
                        <span className="text-[10px] px-1.5 py-px rounded-full ring-1 ring-white/[0.1] bg-white/[0.03] text-foreground/80">
                          via {l.banco}{l.viaExtrato ? " · banco do extrato" : ""}
                        </span>
                      )}
                      {l.refi && <span className="text-[10px] px-1.5 py-px rounded-full ring-1 text-amber-400 ring-amber-400/25 bg-amber-400/10">sinal de refinanciamento</span>}
                    </div>
                    {l.descricao && <p className="font-mono text-[10.5px] text-muted-foreground mt-1 truncate">{l.descricao}</p>}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-2.5">
                      {l.pct != null && (
                        <div><p className="text-[9.5px] uppercase tracking-wide text-muted-foreground">% da renda mensal</p><p className="text-[13px] font-medium tabular-nums mt-0.5">{l.pct}%</p></div>
                      )}
                      <div><p className="text-[9.5px] uppercase tracking-wide text-muted-foreground">Intervalo do anterior</p><p className="text-[13px] font-medium tabular-nums mt-0.5">{l.dias != null ? `${l.dias} dias` : "primeiro do período"}</p></div>
                      {l.ficha?.parcelas && (
                        <div className="col-span-2 sm:col-span-1"><p className="text-[9.5px] uppercase tracking-wide text-muted-foreground">Parcelas</p><p className="text-[12px] text-foreground/85 mt-0.5 leading-snug">{l.ficha.parcelas}</p></div>
                      )}
                    </div>
                    {l.ficha?.detalhe && <p className="text-[11.5px] text-foreground/70 mt-2 leading-relaxed">{l.ficha.detalhe}</p>}
                  </div>
                </div>
              ))}
            </div>
          </Sec>
        );
      })()}

    </div>
  );
}

function AnaliseCard({ a, flags, defaultAberto, onRegenerar, onReanalisar, reanalisando, onCancel, onInsights, gerandoInsights, ocultarInsights, alvoTx }: { a: Analise; flags: Flag[]; defaultAberto?: boolean; onRegenerar?: () => void; onReanalisar?: (docNames: string[]) => void; reanalisando?: boolean; onCancel?: () => void; onInsights?: () => void; gerandoInsights?: boolean; ocultarInsights?: boolean; alvoTx?: AlvoTx | null }) {
  const [aberto, setAberto] = useState(!!defaultAberto);
  const arquivos: Array<{ name?: string }> = Array.isArray(a.arquivos) ? a.arquivos : [];
  const parciais: any[] = Array.isArray(a.parciais) ? a.parciais : [];
  const feitos = new Set(parciais.map((p) => p.name));
  const quadros = parciais.filter((p) => !p.falhou && Array.isArray(p.transacoes));
  const pendentes = arquivos.filter((d) => !feitos.has(d.name as string)).map((d) => (d.name as string) || "documento");
  const proc = a.status === "processando";
  const erro = a.status === "erro";
  const pct = Math.min(100, Math.max(0, Number(a.progresso?.pct) || 0));

  const porEixo = useMemo(() => {
    const m = new Map<string, Flag[]>();
    for (const f of flags) { const k = f.eixo || "outro"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(f); }
    return [...m.entries()];
  }, [flags]);

  // Corpo compartilhado (mesmo enquanto roda e depois de pronto): abrangência +
  // um QUADRO por extrato, aparecendo em streaming conforme cada um conclui.
  const corpo = (
    <div className="space-y-4">
      {erro && <p className="text-sm text-rose-400 whitespace-pre-line">{a.erro}</p>}

      {/* FICHA DO CLIENTE (insights) no topo do perfil. */}
      {!ocultarInsights && !proc && !erro && quadros.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><Scale className="h-3.5 w-3.5" /> Ficha do cliente</p>
            {(a.resumo as any)?.insights && onInsights && (
              <button onClick={onInsights} disabled={gerandoInsights} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 disabled:opacity-50">
                <RefreshCw className={`h-3 w-3 ${gerandoInsights ? "animate-spin" : ""}`} /> Recruzar dados
              </button>
            )}
          </div>
          {(a.resumo as any)?.insights ? (
            <InsightsView ins={(a.resumo as any).insights} dg={(a.resumo as any).digest} txs={quadros.flatMap((p) => (Array.isArray(p.transacoes) ? p.transacoes : []))} />
          ) : onInsights ? (
            <div className="rounded-xl border border-dashed border-white/[0.12] p-4 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[12px] text-muted-foreground">As transações estão mapeadas, mas os dados ainda não foram cruzados com a IA.</p>
              <Button size="sm" onClick={onInsights} disabled={gerandoInsights} className="gap-1.5 h-8 shrink-0">
                {gerandoInsights ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
                {gerandoInsights ? "Cruzando…" : "Cruzar dados"}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      {/* Falhas viram só um aviso fino (a central de abrangência foi aposentada). */}
      {parciais.some((p) => p.falhou) && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-[12px] text-amber-400 flex items-center gap-2 flex-wrap">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{parciais.filter((p) => p.falhou).map((p) => p.name).join(", ")} sem análise.</span>
          {onReanalisar && (
            <button onClick={() => onReanalisar(parciais.filter((p) => p.falhou).map((p) => p.name))} disabled={reanalisando} className="ml-auto inline-flex items-center gap-1 text-amber-300 hover:underline disabled:opacity-50">
              <RefreshCw className={`h-3 w-3 ${reanalisando ? "animate-spin" : ""}`} /> reanalisar
            </button>
          )}
        </div>
      )}
      {(quadros.length > 0 || pendentes.length > 0) && (
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Quadros por extrato</p>
          {quadros.map((p, i) => <QuadroExtrato key={p.name || i} p={p} alvoTx={alvoTx} />)}
          {pendentes.map((n) => (
            <div key={n} className="rounded-xl border border-primary/15 bg-primary/[0.03] p-4 flex items-center gap-2.5 text-[12px] text-muted-foreground">
              <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" /> Analisando <span className="text-foreground/80">{n}</span>…
            </div>
          ))}
        </div>
      )}
      {onRegenerar && !proc && (
        <div className="pt-1 border-t border-white/[0.06]">
          <Button variant="outline" size="sm" onClick={onRegenerar} className="gap-1.5 h-8 mt-3">
            <RefreshCw className="h-3.5 w-3.5" /> Nova análise
          </Button>
        </div>
      )}
    </div>
  );

  // Rodando: cabeçalho com radar + os quadros já prontos aparecendo em streaming.
  if (proc) {
    return (
      <div className="rounded-2xl border border-primary/25 bg-primary/[0.03] overflow-hidden">
        <div className="spy-scan relative flex items-center gap-4 p-4 border-b border-white/[0.06]">
          <RadarViz size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary spy-blip" /><span className="text-sm font-medium text-foreground truncate">{a.progresso?.detalhe || "Analisando…"}</span></div>
            <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} /></div>
            <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
              <span>{a.progresso?.etapa || "processando"}</span>
              <span className="inline-flex items-center gap-2"><span className="tabular-nums text-primary/80">{pct}%</span><span>· <Elapsed from={a.created_at} /></span></span>
            </div>
          </div>
          {onCancel && <button onClick={onCancel} className="shrink-0 self-start text-[11px] text-muted-foreground hover:text-rose-400 inline-flex items-center gap-1"><X className="h-3.5 w-3.5" /> Cancelar</button>}
        </div>
        <div className="p-4">{corpo}</div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border bg-white/[0.02] overflow-hidden ${erro ? "border-rose-500/20" : "border-white/[0.07]"}`}>
      <button onClick={() => setAberto((o) => !o)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="flex items-center gap-2 min-w-0">
          {erro ? <AlertTriangle className="h-4 w-4 text-rose-400" /> : <ShieldAlert className="h-4 w-4 text-primary" />}
          <span className="text-sm font-medium truncate">
            {erro ? "Falhou" : `Análise · ${quadros.length} quadro(s) · ${a.n_transacoes ?? 0} transações`}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-BR")}</span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
        </div>
      </button>

      {aberto && <div className="px-4 pb-4 border-t border-white/[0.06] pt-4">{corpo}</div>}
    </div>
  );
}

function TransacoesViewer({ analiseId }: { analiseId: string }) {
  const { data: tx = [], isLoading } = useQuery({
    queryKey: ["spy-tx", analiseId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("spy_transacao" as any) as any)
        .select("data, descricao, valor, sinal, saldo").eq("analise_id", analiseId).order("data").limit(300);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  if (isLoading) return <p className="text-[11px] text-muted-foreground mt-2">Carregando transações…</p>;
  if (!tx.length) return <p className="text-[11px] text-muted-foreground mt-2">Sem transações.</p>;
  return (
    <div className="mt-2 rounded-lg border border-white/[0.06] overflow-hidden max-h-72 overflow-y-auto scrollbar-thin">
      <table className="w-full text-[11px]">
        <tbody>
          {tx.map((t, i) => {
            const cat = categoria(t.descricao);
            const CatIcon = cat.Icon;
            return (
              <tr key={i} className="border-b border-white/[0.04]">
                <td className="px-2 py-1 text-muted-foreground tabular-nums whitespace-nowrap">{t.data}</td>
                <td className="px-2 py-1">
                  <span className="inline-flex items-center gap-1.5 max-w-[220px]">
                    <CatIcon className={`h-3.5 w-3.5 shrink-0 ${cat.cls}`} />
                    <span className="truncate">{t.descricao}</span>
                  </span>
                </td>
                <td className={`px-2 py-1 text-right tabular-nums whitespace-nowrap ${t.sinal < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                  <span className="inline-flex items-center gap-0.5 justify-end">
                    {t.sinal < 0 ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                    {t.valor != null ? fmtBRL(Number(t.valor)) : "-"}
                  </span>
                </td>
                <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap text-muted-foreground">{t.saldo != null ? fmtBRL(Number(t.saldo)) : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
