import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { appConfig } from "@/config/app-config";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Radar, Search, FileText, FolderOpen, Loader2, CheckCircle2, AlertTriangle,
  ChevronDown, ShieldAlert, ExternalLink, RefreshCw, ScanLine, User, ListChecks, ArrowDownRight, ArrowUpRight,
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
const RISCO: Record<string, string> = {
  baixo: "text-emerald-400 bg-emerald-500/12 ring-emerald-500/25",
  medio: "text-amber-400 bg-amber-400/12 ring-amber-400/25",
  alto: "text-orange-400 bg-orange-500/12 ring-orange-500/25",
  critico: "text-rose-400 bg-rose-500/12 ring-rose-500/25",
};
const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Cliente { id: string; nome: string; cpf_cnpj: string | null; drive_folder_id: string | null; drive_folder_url: string | null; }
interface DriveFile { id: string; name: string; mimeType: string; }
interface Analise { id: string; cliente_id: string; status: string; arquivos: any[]; relatorio: string | null; resumo: any; erro: string | null; progresso: any; n_transacoes: number | null; created_at: string; }
interface Flag { id: string; analise_id: string; eixo: string | null; codigo: string | null; label: string | null; valor: any; confianca: number | null; evidencia: string | null; }

export default function Spy() {
  useEffect(() => { document.title = `Spy · ${appConfig.name}`; }, []);
  const { user } = useAuth();
  const [busca, setBusca] = useState("");
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
  const lista = useMemo(() => {
    const s = busca.trim().toLowerCase();
    if (!s) return clientes;
    return clientes.filter((c) => (c.nome || "").toLowerCase().includes(s) || (c.cpf_cnpj || "").includes(s));
  }, [clientes, busca]);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Radar className="h-6 w-6 text-primary" /> Spy
          <span className="text-[9px] uppercase font-semibold tracking-wide px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400 border border-amber-400/30">beta</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Escolha um cliente, selecione os extratos no Drive e rode a análise. Ela roda em segundo plano
          (você pode navegar pelo Eco) e extrai as transações antes de interpretar. Inferências vêm com confiança e evidência.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[300px,1fr] gap-5">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden flex flex-col max-h-[75vh]">
          <div className="p-3 border-b border-white/[0.06]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente…" className="pl-9 h-9" />
            </div>
          </div>
          <div className="overflow-y-auto scrollbar-thin">
            {lista.map((c) => (
              <button key={c.id} onClick={() => setSel(c)}
                className={`w-full text-left px-3 py-2.5 border-b border-white/[0.04] transition-colors ${sel?.id === c.id ? "bg-primary/10" : "hover:bg-white/[0.03]"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-foreground truncate">{c.nome}</span>
                  <FolderOpen className={`h-3.5 w-3.5 shrink-0 ${c.drive_folder_id ? "text-emerald-400/70" : "text-muted-foreground/30"}`} />
                </div>
                {c.cpf_cnpj && <span className="text-[11px] text-muted-foreground">{c.cpf_cnpj}</span>}
              </button>
            ))}
            {lista.length === 0 && <p className="text-center text-xs text-muted-foreground py-8">Nenhum cliente.</p>}
          </div>
        </div>

        <div className="min-w-0">
          {!sel ? (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] py-24 text-center">
              <Radar className="h-10 w-10 text-muted-foreground/25 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Selecione um cliente pra começar.</p>
            </div>
          ) : (
            <SpyWorkspace cliente={sel} userId={user?.id || null} />
          )}
        </div>
      </div>
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
    toast.success("Análise iniciada — roda em segundo plano.");
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

function AnaliseCard({ a, flags }: { a: Analise; flags: Flag[] }) {
  const [aberto, setAberto] = useState(false);
  const [verTx, setVerTx] = useState(false);
  const proc = a.status === "processando";
  const erro = a.status === "erro";
  const risco = (a.resumo?.risco_geral || "").toLowerCase();
  const pct = Math.min(100, Math.max(0, Number(a.progresso?.pct) || 0));

  const porEixo = useMemo(() => {
    const m = new Map<string, Flag[]>();
    for (const f of flags) { const k = f.eixo || "outro"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(f); }
    return [...m.entries()];
  }, [flags]);

  return (
    <div className={`rounded-2xl border bg-white/[0.02] overflow-hidden ${erro ? "border-rose-500/20" : "border-white/[0.07]"}`}>
      <button onClick={() => !proc && setAberto((o) => !o)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <div className="flex items-center gap-2 min-w-0">
          {proc ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : erro ? <AlertTriangle className="h-4 w-4 text-rose-400" /> : <ShieldAlert className="h-4 w-4 text-primary" />}
          <span className="text-sm font-medium truncate">
            {proc ? (a.progresso?.detalhe || "Analisando…") : erro ? "Falhou" : `Análise · ${a.n_transacoes ?? 0} transações · ${flags.length} flags`}
          </span>
          {!proc && !erro && risco && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ring-1 ${RISCO[risco] || "text-muted-foreground bg-white/[0.04] ring-white/10"}`}>risco {risco}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-BR")}</span>
          {!proc && <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`} />}
        </div>
      </button>

      {proc && (
        <div className="px-4 pb-3">
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            <span>{a.progresso?.etapa || "processando"}</span><span className="tabular-nums">{pct}%</span>
          </div>
        </div>
      )}

      {aberto && !proc && (
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
