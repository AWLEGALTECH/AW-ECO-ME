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
import {
  Search, FileText, FolderOpen, Loader2, CheckCircle2, AlertTriangle,
  ChevronDown, ShieldAlert, ExternalLink, RefreshCw, ScanLine, ListChecks,
  ArrowDownRight, ArrowUpRight, ArrowLeft, Activity, Users, TrendingUp, Layers,
  Scale, CalendarDays, ClipboardList, X, ChevronRight, SearchX,
  Landmark, Utensils, Car, Home, GraduationCap, HeartPulse, CreditCard, Receipt, Banknote, ArrowLeftRight, Circle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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

interface Cliente { id: string; nome: string; cpf_cnpj: string | null; drive_folder_id: string | null; drive_folder_url: string | null; }
interface DriveFile { id: string; name: string; mimeType: string; }
interface Analise { id: string; cliente_id: string; status: string; arquivos: any[]; relatorio: string | null; resumo: any; erro: string | null; progresso: any; n_transacoes: number | null; created_at: string; }
interface Flag { id: string; analise_id: string; eixo: string | null; codigo: string | null; label: string | null; valor: any; confianca: number | null; evidencia: string | null; }

// ── Radar (SVG animado, clima de espionagem) ─────────────────────────────────
function RadarViz({ size = 120, blips = true, className = "" }: { size?: number; blips?: boolean; className?: string }) {
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
        <g className="spy-sweep">
          <path d="M50 50 L50 2 A48 48 0 0 1 95 33 Z" fill="url(#spy-beam)" />
          <line x1="50" y1="50" x2="50" y2="2" stroke="currentColor" strokeOpacity="0.5" strokeWidth="0.6" />
        </g>
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

export default function Spy() {
  useEffect(() => { document.title = `Spy · ${appConfig.name}`; }, []);
  const { user } = useAuth();
  const [busca, setBusca] = useState("");
  const [soPasta, setSoPasta] = useState(true);
  const [sel, setSel] = useState<Cliente | null>(null);
  const [pendingFoco, setPendingFoco] = useState<string | null>(null);

  const { data: clientes = [] } = useQuery({
    queryKey: ["spy-clientes"],
    queryFn: async (): Promise<Cliente[]> => {
      const { data, error } = await supabase.from("clientes")
        .select("id, nome, cpf_cnpj, drive_folder_id, drive_folder_url").order("nome");
      if (error) throw error;
      return (data || []) as any;
    },
  });

  const comPasta = useMemo(() => clientes.filter((c) => c.drive_folder_id).length, [clientes]);
  const lista = useMemo(() => {
    const s = busca.trim().toLowerCase();
    return clientes.filter((c) => {
      if (soPasta && !c.drive_folder_id) return false;
      if (!s) return true;
      return (c.nome || "").toLowerCase().includes(s) || (c.cpf_cnpj || "").includes(s);
    });
  }, [clientes, busca, soPasta]);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Spy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Inteligência sobre o cliente a partir dos extratos. Roda em segundo plano, então você pode navegar pelo Eco enquanto o radar trabalha.
        </p>
      </header>

      {sel ? (
        <SpyClientPage key={sel.id} cliente={sel} userId={user?.id || null} initialFoco={pendingFoco}
          onBack={() => { setSel(null); setPendingFoco(null); }} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[300px,1fr] gap-5">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden flex flex-col max-h-[76vh]">
            <div className="p-3 border-b border-white/[0.06] space-y-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…" className="pl-9 h-9" />
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-white/[0.03] p-0.5 text-[11px]">
                <button onClick={() => setSoPasta(true)}
                  className={`flex-1 py-1.5 rounded-md transition-colors ${soPasta ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                  Com pasta ({comPasta})
                </button>
                <button onClick={() => setSoPasta(false)}
                  className={`flex-1 py-1.5 rounded-md transition-colors ${!soPasta ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}>
                  Todos ({clientes.length})
                </button>
              </div>
            </div>
            <div className="overflow-y-auto scrollbar-thin">
              {lista.map((c) => (
                <button key={c.id} onClick={() => setSel(c)}
                  className="w-full text-left px-3 py-2.5 border-b border-white/[0.04] transition-colors hover:bg-white/[0.03] group">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-foreground truncate group-hover:text-primary transition-colors">{c.nome}</span>
                    <FolderOpen className={`h-3.5 w-3.5 shrink-0 ${c.drive_folder_id ? "text-emerald-400/70" : "text-muted-foreground/30"}`} />
                  </div>
                  {c.cpf_cnpj && <span className="text-[11px] text-muted-foreground">{c.cpf_cnpj}</span>}
                </button>
              ))}
              {lista.length === 0 && <p className="text-center text-xs text-muted-foreground py-8">Nenhum cliente.</p>}
            </div>
          </div>

          <IntelPanel totalClientes={clientes.length} comPasta={comPasta} clientes={clientes}
            onOpen={(c, aid) => { setSel(c); setPendingFoco(aid); }} />
        </div>
      )}
    </div>
  );
}

// ── Painel de inteligência (cruzamento de todas as análises) ─────────────────
function IntelPanel({ totalClientes, comPasta, clientes, onOpen }: { totalClientes: number; comPasta: number; clientes: Cliente[]; onOpen: (c: Cliente, analiseId: string) => void }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["spy-stats"],
    queryFn: async (): Promise<Analise[]> => {
      const { data, error } = await (supabase.from("spy_analise" as any) as any)
        .select("id, cliente_id, status, resumo, n_transacoes, created_at, progresso").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: (q: any) => ((q.state.data as Analise[] | undefined)?.some((a) => a.status === "processando") ? 3000 : false),
  });

  const emAndamento = useMemo(() => rows.filter((r) => r.status === "processando"), [rows]);
  const feitas = useMemo(() => rows.filter((r) => r.status === "concluida"), [rows]);
  const clienteDe = (id: string) => clientes.find((c) => c.id === id) || null;

  const stats = useMemo(() => {
    const concl = rows.filter((r) => r.status === "concluida");
    const rodando = rows.filter((r) => r.status === "processando").length;
    const seteDias = concl.filter((r) => Date.now() - new Date(r.created_at).getTime() < 7 * 864e5).length;
    const clientes = new Set(concl.map((r) => r.cliente_id)).size;
    const transacoes = concl.reduce((s, r) => s + (r.n_transacoes || 0), 0);
    const risco: Record<string, number> = { baixo: 0, medio: 0, alto: 0, critico: 0 };
    for (const r of concl) { const k = (r.resumo?.risco_geral || "").toLowerCase(); if (k in risco) risco[k]++; }
    return { feitas: concl.length, rodando, seteDias, clientes, transacoes, risco };
  }, [rows]);

  const totalRisco = stats.risco.baixo + stats.risco.medio + stats.risco.alto + stats.risco.critico;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] min-h-[60vh] p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.15em] text-primary/80 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Central de inteligência
          </p>
          <h2 className="text-lg font-semibold mt-1">Radar do Spy</h2>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-md">
            O cruzamento de tudo que o Spy já analisou. Selecione um cliente à esquerda pra abrir o dossiê dele.
          </p>
        </div>
        <RadarViz size={30} blips={false} className="shrink-0 opacity-50 hidden sm:block" />
      </div>

      {emAndamento.length > 0 && (
        <div className="mt-5 rounded-xl border border-primary/25 bg-primary/[0.04] p-3">
          <p className="text-[11px] uppercase tracking-wider text-primary/80 mb-2 flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Em andamento ({emAndamento.length})
          </p>
          <div className="space-y-1.5">
            {emAndamento.map((r) => {
              const c = clienteDe(r.cliente_id);
              const pct = Math.min(100, Math.max(0, Number(r.progresso?.pct) || 0));
              return (
                <button key={r.id} disabled={!c} onClick={() => c && onOpen(c, r.id)}
                  className="w-full text-left rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 hover:border-primary/40 transition-colors disabled:opacity-60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{c?.nome || "Cliente"}</span>
                    <span className="text-[10px] text-primary/80 tabular-nums shrink-0">{pct}%</span>
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 truncate">{r.progresso?.detalhe || "processando"}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-16 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Reunindo os dados…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
              <StatCard icon={<ScanLine className="h-4 w-4" />} valor={stats.feitas} label="Análises feitas"
                sub={stats.rodando ? `${stats.rodando} rodando agora` : stats.seteDias ? `${stats.seteDias} nos últimos 7 dias` : "-"} />
              <StatCard icon={<Users className="h-4 w-4" />} valor={stats.clientes} label="Clientes analisados"
                sub={`de ${comPasta} com pasta · ${totalClientes} no total`} />
              <StatCard icon={<TrendingUp className="h-4 w-4" />} valor={stats.transacoes} label="Transações lidas"
                sub="movimentações extraídas" />
              <StatCard icon={<Layers className="h-4 w-4" />} valor={totalRisco} label="Perfis com risco"
                sub={totalRisco ? "veja a distribuição" : "-"} />
            </div>

            {totalRisco > 0 && (
              <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Distribuição de risco</p>
                <div className="flex h-2.5 rounded-full overflow-hidden bg-white/[0.04]">
                  {(["baixo", "medio", "alto", "critico"] as const).map((k) =>
                    stats.risco[k] > 0 ? (
                      <div key={k} className={RISCO[k].bar} style={{ width: `${(stats.risco[k] / totalRisco) * 100}%` }} title={`${RISCO[k].label}: ${stats.risco[k]}`} />
                    ) : null
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                  {(["baixo", "medio", "alto", "critico"] as const).map((k) => (
                    <span key={k} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className={`h-2 w-2 rounded-full ${RISCO[k].bar}`} /> {RISCO[k].label}
                      <span className="tabular-nums text-foreground/80">{stats.risco[k]}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {feitas.length > 0 && (
              <div className="mt-6">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Análises feitas ({feitas.length})</p>
                <div className="space-y-1.5 max-h-[42vh] overflow-y-auto scrollbar-thin">
                  {feitas.map((r) => {
                    const c = clienteDe(r.cliente_id);
                    const risco = (r.resumo?.risco_geral || "").toLowerCase();
                    const rm = RISCO[risco];
                    return (
                      <button key={r.id} disabled={!c} onClick={() => c && onOpen(c, null)}
                        className="w-full text-left rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 hover:border-primary/40 transition-colors flex items-center justify-between gap-2 disabled:opacity-60">
                        <span className="text-sm truncate">{c?.nome || "Cliente"}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          {rm && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 ${rm.text} ${rm.ring}`}>{rm.label}</span>}
                          <span className="text-[10px] text-muted-foreground tabular-nums hidden sm:inline">{new Date(r.created_at).toLocaleDateString("pt-BR")}</span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {stats.feitas === 0 && (
              <p className="text-sm text-muted-foreground mt-8 text-center">
                Nenhuma análise ainda. Selecione um cliente e rode a primeira; o radar começa a preencher aqui.
              </p>
            )}
          </>
        )}
    </div>
  );
}

function StatCard({ icon, valor, label, sub }: { icon: ReactNode; valor: number; label: string; sub: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
      <div className="flex items-center gap-1.5 text-primary/70">{icon}</div>
      <div className="text-2xl font-semibold tabular-nums mt-1.5">{valor.toLocaleString("pt-BR")}</div>
      <div className="text-[12px] text-foreground/80 mt-0.5">{label}</div>
      <div className="text-[10.5px] text-muted-foreground mt-0.5 truncate">{sub}</div>
    </div>
  );
}

// ── Página do cliente (toma a tela; a análise é a protagonista) ──────────────
function SpyClientPage({ cliente, userId, onBack, initialFoco }: { cliente: Cliente; userId: string | null; onBack: () => void; initialFoco?: string | null }) {
  const qc = useQueryClient();
  const [selFiles, setSelFiles] = useState<Set<string>>(new Set());
  const [mostrarDocs, setMostrarDocs] = useState(false);
  const [foco, setFoco] = useState<string | null>(initialFoco || null);
  const [enviando, setEnviando] = useState(false);
  const [preparo, setPreparo] = useState<string | null>(null);
  const preRef = useRef<string | null>(null);

  const { data: drive, isLoading: loadingDrive, error: driveErr, refetch: refetchDrive } = useQuery({
    queryKey: ["spy-drive", cliente.drive_folder_id],
    enabled: !!cliente.drive_folder_id,
    queryFn: async (): Promise<DriveFile[]> => {
      const { data, error } = await supabase.functions.invoke("list-drive-files", {
        body: { folder_id: cliente.drive_folder_id, mime_filter: ["application/pdf"] },
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
      const { data, error } = await supabase.functions.invoke("spy-analisar", { body: { cliente_id: cliente.id, arquivos, created_by: userId } });
      if (error) { toast.error("Não consegui iniciar a análise."); return; }
      setMostrarDocs(false);
      qc.invalidateQueries({ queryKey: ["spy-analises", cliente.id] });
      const novoId = (data as any)?.analise_id || null;
      if (novoId) setFoco(novoId);
    } finally {
      setEnviando(false);
      setPreparo(null);
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

  // TELA CHEIA: análise em trâmite (estilo Finder).
  if (focoAnalise && focoAnalise.status === "processando") {
    return <AnaliseTelaCheia cliente={cliente} a={focoAnalise} onBackground={() => setFoco(null)} onCancel={() => cancelarAnalise(focoAnalise.id)} />;
  }

  return (
    <div className="spy-lock space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Todos os clientes
      </button>

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-3xl font-semibold tracking-tight truncate">{cliente.nome}</h2>
          {cliente.cpf_cnpj && <p className="text-xs text-muted-foreground mt-1">{cliente.cpf_cnpj}</p>}
        </div>
        {cliente.drive_folder_url && (
          <a href={cliente.drive_folder_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            <FolderOpen className="h-3.5 w-3.5" /> Pasta no Drive <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <FichaCliente ficha={ficha} />

      {rodando ? (
        <BannerRodando a={rodando} onOpen={() => setFoco(rodando.id)} onCancel={() => cancelarAnalise(rodando.id)} />
      ) : mostrarDocs ? (
        <DocPicker
          cliente={cliente} drive={drive} loading={loadingDrive} err={!!driveErr} temAnalise={!!ultima} enviando={enviando} preparo={preparo}
          selFiles={selFiles} onToggle={toggleFile} onRefetch={() => refetchDrive()}
          onAnalisar={analisar} onCancel={() => setMostrarDocs(false)}
        />
      ) : ultima ? (
        <AnaliseCard a={ultima} flags={flags.filter((f) => f.analise_id === ultima.id)} defaultAberto onRegenerar={() => setMostrarDocs(true)} />
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
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
      {temAnalise && (
        <p className="text-[12px] text-amber-400/90 mb-3 flex items-center gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Regenerar cria uma análise do zero e substitui a atual. Selecione os extratos.
        </p>
      )}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> {temAnalise ? "Extratos para a nova análise" : "Extratos para analisar"}</p>
        <div className="flex items-center gap-3">
          {cliente.drive_folder_id && (
            <button onClick={onRefetch} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><RefreshCw className="h-3 w-3" /> atualizar</button>
          )}
          <button onClick={onCancel} className="text-[11px] text-muted-foreground hover:text-foreground">cancelar</button>
        </div>
      </div>
      {!cliente.drive_folder_id ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Este cliente ainda não tem pasta no Drive.</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground py-4 text-center inline-flex items-center gap-2 justify-center w-full"><Loader2 className="h-4 w-4 animate-spin" /> Lendo o Drive…</p>
      ) : err ? (
        <p className="text-sm text-rose-400 py-4 text-center">Não consegui ler a pasta do Drive.</p>
      ) : (drive || []).length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Nenhum PDF na pasta.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {(drive || []).map((f) => {
              const on = selFiles.has(f.id);
              return (
                <button key={f.id} onClick={() => onToggle(f.id)}
                  className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors ${on ? "border-primary/40 bg-primary/10" : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14]"}`}>
                  <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-primary border-primary" : "border-white/20"}`}>
                    {on && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                  </span>
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1">{f.name}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
            <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
              {enviando && preparo
                ? <><Loader2 className="h-3 w-3 animate-spin" /> {preparo}</>
                : "Os extratos já vêm marcados. Ajuste se quiser."}
            </p>
            <Button onClick={onAnalisar} disabled={selFiles.size === 0 || enviando} className="gap-1.5">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
              {temAnalise ? "Regenerar" : "Analisar"} {selFiles.size > 0 ? `(${selFiles.size})` : ""}
            </Button>
          </div>
        </>
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

const SOCIO_CAMPOS: { key: string; label: string; fmt?: (v: string) => string }[] = [
  { key: "renda_mensal", label: "Renda mensal", fmt: (v) => { const n = Number(String(v).replace(/[^\d]/g, "")); return isFinite(n) && n > 0 ? fmtBRL(n) : String(v); } },
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
  const socioItens = SOCIO_CAMPOS
    .filter((c) => { const v = socio[c.key]; return v !== undefined && v !== null && String(v).trim() !== ""; })
    .map((c) => ({ key: c.key, label: c.label, valor: c.fmt ? c.fmt(String(socio[c.key])) : String(socio[c.key]) }));
  const temSocio = socioItens.length > 0;
  const obs = String(socio.observacoes_livres || "").trim();

  const saude = String(socio.condicao_saude || "").trim();

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 space-y-2.5 text-[13px]">
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

      <div className="border-t border-white/[0.06] pt-2.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5 mr-3 align-middle">
          <ClipboardList className="h-3.5 w-3.5" /> Socioeconômico
        </span>
        {temSocio ? (
          <span className="inline-flex flex-wrap gap-x-4 gap-y-1 align-middle text-[12.5px]">
            {socioItens.filter((i) => i.key !== "condicao_saude").map((i) => (
              <span key={i.key} className="inline-flex items-center gap-1">
                <span className="text-muted-foreground">{i.label}:</span>
                <span className="text-foreground/90">{i.valor}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="text-muted-foreground">o cliente não preencheu ainda.</span>
        )}
        {(saude || obs) && (
          <div className="mt-1.5 space-y-0.5">
            {saude && <p className="text-[12px] text-muted-foreground"><span className="text-foreground/70">Saúde:</span> {saude}</p>}
            {obs && <p className="text-[12px] text-muted-foreground"><span className="text-foreground/70">Obs.:</span> {obs}</p>}
          </div>
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

function AnaliseCard({ a, flags, defaultAberto, onRegenerar }: { a: Analise; flags: Flag[]; defaultAberto?: boolean; onRegenerar?: () => void }) {
  const [aberto, setAberto] = useState(!!defaultAberto);
  const [verTx, setVerTx] = useState(false);
  const docs: Array<{ name?: string }> = Array.isArray(a.arquivos) ? a.arquivos : [];
  const proc = a.status === "processando";
  const erro = a.status === "erro";
  const risco = (a.resumo?.risco_geral || "").toLowerCase();
  const riscoMeta = RISCO[risco];
  const pct = Math.min(100, Math.max(0, Number(a.progresso?.pct) || 0));

  const porEixo = useMemo(() => {
    const m = new Map<string, Flag[]>();
    for (const f of flags) { const k = f.eixo || "outro"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(f); }
    return [...m.entries()];
  }, [flags]);

  // Estado "rodando", cinematografico: radar varrendo + scanline sobre o card.
  if (proc) {
    return (
      <div className="spy-scan relative overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.04] p-4">
        <div className="flex items-center gap-4">
          <RadarViz size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary spy-blip" />
              <span className="text-sm font-medium text-foreground truncate">{a.progresso?.detalhe || "Analisando…"}</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
              <span>{a.progresso?.etapa || "processando"}</span>
              <span className="inline-flex items-center gap-2">
                <span className="tabular-nums text-primary/80">{pct}%</span>
                <span>· <Elapsed from={a.created_at} /></span>
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border bg-white/[0.02] overflow-hidden ${erro ? "border-rose-500/20" : "border-white/[0.07]"}`}>
      <button onClick={() => setAberto((o) => !o)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="flex items-center gap-2 min-w-0">
          {erro ? <AlertTriangle className="h-4 w-4 text-rose-400" /> : <ShieldAlert className="h-4 w-4 text-primary" />}
          <span className="text-sm font-medium truncate">
            {erro ? "Falhou" : `Análise · ${a.n_transacoes ?? 0} transações · ${flags.length} flags`}
          </span>
          {!erro && riscoMeta && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 ${riscoMeta.text} ${riscoMeta.ring}`}>risco {riscoMeta.label.toLowerCase()}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-BR")}</span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />
        </div>
      </button>

      {aberto && (
        <div className="px-4 pb-4 space-y-4 border-t border-white/[0.06] pt-4">
          {erro && <p className="text-sm text-rose-400 whitespace-pre-line">{a.erro}</p>}

          {a.relatorio && (
            <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-4">
              <p className="text-[10px] uppercase tracking-[0.15em] text-primary/80 mb-2 flex items-center gap-1.5">
                <ShieldAlert className="h-3.5 w-3.5" /> Dossiê
              </p>
              <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">{a.relatorio}</p>
            </div>
          )}

          {(a.n_transacoes ?? 0) > 0 && (
            <div>
              <button onClick={() => setVerTx((v) => !v)} className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">
                <ListChecks className="h-3.5 w-3.5" /> {verTx ? "Ocultar" : "Ver"} transações-chave ({a.n_transacoes})
              </button>
              {verTx && <TransacoesViewer analiseId={a.id} />}
            </div>
          )}

          {docs.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Extratos analisados
              </p>
              <div className="flex flex-wrap gap-1.5">
                {docs.map((d, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[11px] text-foreground/80 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1">
                    <FileText className="h-3 w-3 text-muted-foreground" /> {d.name || "documento"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {porEixo.length > 0 && (
            <details className="group">
              <summary className="text-[11px] uppercase tracking-wider text-muted-foreground cursor-pointer list-none inline-flex items-center gap-1 select-none">
                <ChevronDown className="h-3.5 w-3.5 group-open:rotate-180 transition-transform" /> Marcadores internos ({flags.length})
              </summary>
              <div className="space-y-2 mt-2">
                {porEixo.map(([eixo, fs]) => {
                  const m = eixoMeta(eixo);
                  return (
                    <div key={eixo} className="space-y-1.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ring-1 ${m.cls}`}>{m.label}</span>
                      {fs.map((f) => (
                        <div key={f.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 ml-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[13px] font-medium text-foreground">{f.label || f.codigo}</span>
                            {typeof f.confianca === "number" && <span className="text-[10px] text-muted-foreground tabular-nums">{Math.round(f.confianca * 100)}% conf.</span>}
                          </div>
                          {f.evidencia && <p className="text-[12px] text-muted-foreground mt-1 whitespace-pre-line">{f.evidencia}</p>}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </details>
          )}

          {onRegenerar && (
            <div className="pt-1 border-t border-white/[0.06]">
              <Button variant="outline" size="sm" onClick={onRegenerar} className="gap-1.5 h-8 mt-3">
                <RefreshCw className="h-3.5 w-3.5" /> Regenerar análise
              </Button>
            </div>
          )}
        </div>
      )}
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
