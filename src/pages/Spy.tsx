import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { appConfig } from "@/config/app-config";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search, FileText, FolderOpen, Loader2, CheckCircle2, AlertTriangle,
  ChevronDown, ShieldAlert, ExternalLink, RefreshCw, ScanLine, User, ListChecks,
  ArrowDownRight, ArrowUpRight, ArrowLeft, Activity, Users, TrendingUp, Layers,
} from "lucide-react";

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
      <header className="flex items-center gap-3">
        <div className="relative shrink-0">
          <RadarViz size={44} blips={false} />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            Spy
            <span className="text-[9px] uppercase font-semibold tracking-wide px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400 border border-amber-400/30">beta</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Inteligência sobre o cliente a partir dos extratos. Roda em segundo plano — você pode navegar pelo Eco enquanto o radar trabalha.
          </p>
        </div>
      </header>

      {sel ? (
        <SpyClientPage key={sel.id} cliente={sel} userId={user?.id || null} onBack={() => setSel(null)} />
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

          <IntelPanel totalClientes={clientes.length} comPasta={comPasta} />
        </div>
      )}
    </div>
  );
}

// ── Painel de inteligência (cruzamento de todas as análises) ─────────────────
function IntelPanel({ totalClientes, comPasta }: { totalClientes: number; comPasta: number }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["spy-stats"],
    queryFn: async (): Promise<Analise[]> => {
      const { data, error } = await (supabase.from("spy_analise" as any) as any)
        .select("id, cliente_id, status, resumo, n_transacoes, created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: (q: any) => ((q.state.data as Analise[] | undefined)?.some((a) => a.status === "processando") ? 4000 : false),
  });

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
    <div className="relative rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.03] to-transparent overflow-hidden min-h-[76vh] p-6">
      {/* radar de fundo, "vasculhando" */}
      <div className="pointer-events-none absolute -right-16 -top-16 opacity-[0.10]">
        <RadarViz size={340} blips={false} />
      </div>

      <div className="relative">
        <p className="text-[11px] uppercase tracking-[0.15em] text-primary/80 flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5" /> Central de inteligência
        </p>
        <h2 className="text-lg font-semibold mt-1">Radar do Spy</h2>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-md">
          O cruzamento de tudo que o Spy já analisou. Selecione um cliente à esquerda pra abrir o dossiê dele.
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-16 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Reunindo os dados…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
              <StatCard icon={<ScanLine className="h-4 w-4" />} valor={stats.feitas} label="Análises feitas"
                sub={stats.rodando ? `${stats.rodando} rodando agora` : stats.seteDias ? `${stats.seteDias} nos últimos 7 dias` : "—"} />
              <StatCard icon={<Users className="h-4 w-4" />} valor={stats.clientes} label="Clientes analisados"
                sub={`de ${comPasta} com pasta · ${totalClientes} no total`} />
              <StatCard icon={<TrendingUp className="h-4 w-4" />} valor={stats.transacoes} label="Transações lidas"
                sub="movimentações extraídas" />
              <StatCard icon={<Layers className="h-4 w-4" />} valor={totalRisco} label="Perfis com risco"
                sub={totalRisco ? "veja a distribuição" : "—"} />
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

            {stats.feitas === 0 && (
              <p className="text-sm text-muted-foreground mt-8 text-center">
                Nenhuma análise ainda. Selecione um cliente e rode a primeira — o radar começa a preencher aqui.
              </p>
            )}
          </>
        )}
      </div>
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

// ── Página do cliente (toma a tela, some da lista) ───────────────────────────
function SpyClientPage({ cliente, userId, onBack }: { cliente: Cliente; userId: string | null; onBack: () => void }) {
  return (
    <div className="spy-lock space-y-5">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Todos os clientes
      </button>
      <SpyWorkspace cliente={cliente} userId={userId} />
    </div>
  );
}

function SpyWorkspace({ cliente, userId }: { cliente: Cliente; userId: string | null }) {
  const qc = useQueryClient();
  const [selFiles, setSelFiles] = useState<Set<string>>(new Set());
  useEffect(() => { setSelFiles(new Set()); }, [cliente.id]);

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

  const { data: analises = [] } = useQuery({
    queryKey: ["spy-analises", cliente.id],
    queryFn: async (): Promise<Analise[]> => {
      const { data, error } = await (supabase.from("spy_analise" as any) as any)
        .select("*").eq("cliente_id", cliente.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: (q: any) => ((q.state.data as Analise[] | undefined)?.some((a) => a.status === "processando") ? 2500 : false),
  });
  const rodando = analises.some((a) => a.status === "processando");

  const { data: flags = [] } = useQuery({
    queryKey: ["spy-flags", cliente.id],
    queryFn: async (): Promise<Flag[]> => {
      const { data, error } = await (supabase.from("spy_flag" as any) as any).select("*").eq("cliente_id", cliente.id);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: rodando ? 3000 : false,
  });

  const toggleFile = (id: string) => setSelFiles((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const analisar = async () => {
    const arquivos = (drive || []).filter((f) => selFiles.has(f.id)).map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType }));
    if (!arquivos.length) { toast.error("Selecione ao menos um documento."); return; }
    const { error } = await supabase.functions.invoke("spy-analisar", { body: { cliente_id: cliente.id, arquivos, created_by: userId } });
    if (error) { toast.error("Não consegui iniciar a análise."); return; }
    toast.success("Análise iniciada — o radar está varrendo em segundo plano.");
    setSelFiles(new Set());
    qc.invalidateQueries({ queryKey: ["spy-analises", cliente.id] });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold flex items-center gap-2"><User className="h-4 w-4 text-primary" /> {cliente.nome}</h2>
          {cliente.cpf_cnpj && <p className="text-[11px] text-muted-foreground mt-0.5">{cliente.cpf_cnpj}</p>}
        </div>
        {cliente.drive_folder_url && (
          <a href={cliente.drive_folder_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            <FolderOpen className="h-3.5 w-3.5" /> Pasta no Drive <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Documentos no Drive (PDF)</p>
          {cliente.drive_folder_id && (
            <button onClick={() => refetchDrive()} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><RefreshCw className="h-3 w-3" /> atualizar</button>
          )}
        </div>
        {!cliente.drive_folder_id ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Este cliente ainda não tem pasta no Drive.</p>
        ) : loadingDrive ? (
          <p className="text-sm text-muted-foreground py-4 text-center inline-flex items-center gap-2 justify-center w-full"><Loader2 className="h-4 w-4 animate-spin" /> Lendo o Drive…</p>
        ) : driveErr ? (
          <p className="text-sm text-rose-400 py-4 text-center">Não consegui ler a pasta do Drive.</p>
        ) : (drive || []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nenhum PDF na pasta.</p>
        ) : (
          <>
            <div className="space-y-1.5">
              {(drive || []).map((f) => {
                const on = selFiles.has(f.id);
                return (
                  <button key={f.id} onClick={() => toggleFile(f.id)}
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
            <div className="flex items-center justify-between mt-3">
              <p className="text-[11px] text-muted-foreground">{rodando ? "Uma análise já está rodando (veja abaixo ou na barra do topo)." : "Selecione os extratos e rode."}</p>
              <Button onClick={analisar} disabled={selFiles.size === 0} className="gap-1.5">
                <ScanLine className="h-4 w-4" /> Analisar {selFiles.size > 0 ? `(${selFiles.size})` : ""}
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="space-y-3">
        {analises.map((a) => (
          <AnaliseCard key={a.id} a={a} flags={flags.filter((f) => f.analise_id === a.id)} />
        ))}
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

function AnaliseCard({ a, flags }: { a: Analise; flags: Flag[] }) {
  const [aberto, setAberto] = useState(false);
  const [verTx, setVerTx] = useState(false);
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

  // Estado "rodando" — cinematográfico: radar varrendo + scanline sobre o card.
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
          {tx.map((t, i) => (
            <tr key={i} className="border-b border-white/[0.04]">
              <td className="px-2 py-1 text-muted-foreground tabular-nums whitespace-nowrap">{t.data}</td>
              <td className="px-2 py-1 truncate max-w-[220px]">{t.descricao}</td>
              <td className={`px-2 py-1 text-right tabular-nums whitespace-nowrap ${t.sinal < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                <span className="inline-flex items-center gap-0.5 justify-end">
                  {t.sinal < 0 ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                  {t.valor != null ? fmtBRL(Number(t.valor)) : "—"}
                </span>
              </td>
              <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap text-muted-foreground">{t.saldo != null ? fmtBRL(Number(t.saldo)) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
