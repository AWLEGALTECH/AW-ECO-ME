import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { appConfig } from "@/config/app-config";
import { toast } from "sonner";
import { SpotlightCard } from "@/components/SpotlightCard";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Ticket, Plus, Bug, Wrench, Lightbulb, CircleDot, Loader2, CheckCircle2,
  MapPin, Link2, Clock, User, Flag, X,
} from "lucide-react";

// ── Catálogos ────────────────────────────────────────────────────────────────
const TIPOS = [
  { key: "bug",           label: "Bug",           icon: Bug,       cls: "text-rose-400 bg-rose-500/12 ring-rose-500/25" },
  { key: "implementacao", label: "Implementação", icon: Wrench,     cls: "text-sky-400 bg-sky-500/12 ring-sky-500/25" },
  { key: "ideia",         label: "Ideia",         icon: Lightbulb,  cls: "text-amber-400 bg-amber-400/12 ring-amber-400/25" },
] as const;

const PRIORIDADES = [
  { key: "baixa", label: "Baixa", dot: "bg-muted-foreground/50", cls: "text-muted-foreground" },
  { key: "media", label: "Média", dot: "bg-amber-400",           cls: "text-amber-400" },
  { key: "alta",  label: "Alta",  dot: "bg-rose-500",            cls: "text-rose-400" },
] as const;

const STATUS = {
  aberto:       { label: "Aberto",       icon: CircleDot,   cls: "text-emerald-400 bg-emerald-500/12 ring-emerald-500/25" },
  em_andamento: { label: "Em andamento", icon: Loader2,     cls: "text-sky-400 bg-sky-500/12 ring-sky-500/25" },
  resolvido:    { label: "Resolvido",    icon: CheckCircle2, cls: "text-muted-foreground bg-white/[0.04] ring-white/10" },
} as const;

// Áreas/abas do sistema — ajuda quem resolve a localizar de cara.
const SISTEMAS = [
  "Geral / Não sei", "Dashboard", "Clientes", "Pré-clientes", "Esteira",
  "Publicações", "Processos", "Tarefas", "Writer", "Finder", "Prospecção",
  "Fechamentos", "Tracker", "Notificações", "Chamados", "Login / Acesso",
];

interface Chamado {
  id: string;
  titulo: string;
  tipo: "bug" | "implementacao" | "ideia";
  sistema: string | null;
  prioridade: "baixa" | "media" | "alta";
  referencia: string | null;
  observacoes: string | null;
  status: "aberto" | "em_andamento" | "resolvido";
  created_by: string;
  autor_nome: string | null;
  resolvido_por: string | null;
  resolvido_por_nome: string | null;
  resolvido_em: string | null;
  resolucao: string | null;
  created_at: string;
  updated_at: string;
}

function tempoAtras(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

const tipoMeta = (t: string) => TIPOS.find((x) => x.key === t) || TIPOS[0];
const prioMeta = (p: string) => PRIORIDADES.find((x) => x.key === p) || PRIORIDADES[1];

export default function Chamados() {
  useEffect(() => { document.title = `Chamados · ${appConfig.name}`; }, []);
  const qc = useQueryClient();
  const { user, profile, isAdmin } = useAuth();
  const [abrir, setAbrir] = useState(false);
  const [detalhe, setDetalhe] = useState<Chamado | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
  const [verResolvidos, setVerResolvidos] = useState(false);

  const { data: chamados = [], isLoading } = useQuery({
    queryKey: ["chamados"],
    queryFn: async (): Promise<Chamado[]> => {
      const { data, error } = await (supabase.from("chamados" as any) as any)
        .select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Realtime: o hub reflete o que os outros abrem/resolvem sem refresh.
  useEffect(() => {
    const ch = supabase
      .channel("chamados-hub")
      .on("postgres_changes", { event: "*", schema: "public", table: "chamados" }, () => {
        qc.invalidateQueries({ queryKey: ["chamados"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const abertos = chamados.filter((c) => c.status !== "resolvido");
  const resolvidos = chamados.filter((c) => c.status === "resolvido");
  const base = verResolvidos ? resolvidos : abertos;
  const lista = filtroTipo ? base.filter((c) => c.tipo === filtroTipo) : base;

  const contByTipo = (t: string) => abertos.filter((c) => c.tipo === t).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold font-display flex items-center gap-2">
            <Ticket className="h-6 w-6 text-primary" /> Chamados
            <span className="text-[9px] uppercase font-semibold tracking-wide px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400 border border-amber-400/30">
              beta
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Achou um bug, quer uma melhoria ou teve uma ideia? Abre um chamado. Fica tudo
            aqui à vista de quem vai resolver.
          </p>
        </div>
        <Button onClick={() => setAbrir(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Abrir chamado
        </Button>
      </header>

      {/* Resumo + filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => { setVerResolvidos(false); setFiltroTipo(null); }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs ring-1 transition-colors ${
            !verResolvidos && !filtroTipo ? "bg-primary/12 text-primary ring-primary/25" : "bg-white/[0.03] text-muted-foreground ring-white/10 hover:ring-white/25"
          }`}
        >
          <CircleDot className="h-3.5 w-3.5" /> Abertos
          <span className="tabular-nums opacity-80">{abertos.length}</span>
        </button>
        {TIPOS.map((t) => {
          const on = !verResolvidos && filtroTipo === t.key;
          return (
            <button
              key={t.key}
              onClick={() => { setVerResolvidos(false); setFiltroTipo(on ? null : t.key); }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs ring-1 transition-colors ${
                on ? t.cls : "bg-white/[0.03] text-muted-foreground ring-white/10 hover:ring-white/25"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
              <span className="tabular-nums opacity-80">{contByTipo(t.key)}</span>
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          onClick={() => { setVerResolvidos((v) => !v); setFiltroTipo(null); }}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs ring-1 transition-colors ${
            verResolvidos ? "bg-white/[0.06] text-foreground ring-white/20" : "bg-white/[0.03] text-muted-foreground ring-white/10 hover:ring-white/25"
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Resolvidos
          <span className="tabular-nums opacity-80">{resolvidos.length}</span>
        </button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <p className="text-center text-sm text-muted-foreground py-16">Carregando…</p>
      ) : lista.length === 0 ? (
        <div className="text-center py-16">
          <Ticket className="h-10 w-10 text-muted-foreground/25 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {verResolvidos ? "Nenhum chamado resolvido ainda." : "Nenhum chamado aberto. Tudo em ordem 🎉"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {lista.map((c) => (
            <ChamadoCard key={c.id} c={c} onClick={() => setDetalhe(c)} />
          ))}
        </div>
      )}

      <AbrirChamadoDialog
        open={abrir}
        onOpenChange={setAbrir}
        onCriado={() => qc.invalidateQueries({ queryKey: ["chamados"] })}
        userId={user?.id || null}
        autorNome={profile?.nome || profile?.email || null}
      />

      <DetalheDialog
        chamado={detalhe}
        onOpenChange={(o) => { if (!o) setDetalhe(null); }}
        podeResolver={isAdmin}
        meuId={user?.id || null}
        meuNome={profile?.nome || profile?.email || null}
        onMudou={() => qc.invalidateQueries({ queryKey: ["chamados"] })}
        setDetalhe={setDetalhe}
      />
    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
function ChamadoCard({ c, onClick }: { c: Chamado; onClick: () => void }) {
  const t = tipoMeta(c.tipo);
  const p = prioMeta(c.prioridade);
  const st = STATUS[c.status];
  return (
    <SpotlightCard className="p-4 sm:p-5 cursor-pointer" onClick={onClick}>
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ring-1 ${t.cls}`}>
          <t.icon className="h-3 w-3" /> {t.label}
        </span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ring-1 ${st.cls}`}>
          <st.icon className={`h-3 w-3 ${c.status === "em_andamento" ? "animate-spin" : ""}`} /> {st.label}
        </span>
      </div>

      <h3 className="text-sm font-semibold text-foreground mt-3 line-clamp-2">{c.titulo}</h3>
      {c.observacoes && (
        <p className="text-[12px] text-muted-foreground mt-1 line-clamp-2 whitespace-pre-line">{c.observacoes}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px] text-muted-foreground">
        {c.sistema && (
          <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {c.sistema}</span>
        )}
        <span className={`inline-flex items-center gap-1 ${p.cls}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} /> {p.label}
        </span>
        {c.referencia && (
          <span className="inline-flex items-center gap-1 min-w-0"><Link2 className="h-3 w-3 shrink-0" /> <span className="truncate max-w-[140px]">{c.referencia}</span></span>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06] text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> {c.autor_nome || "Alguém"}</span>
        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {tempoAtras(c.created_at)}</span>
      </div>
    </SpotlightCard>
  );
}

// ── Abrir chamado ───────────────────────────────────────────────────────────
function AbrirChamadoDialog({
  open, onOpenChange, onCriado, userId, autorNome,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCriado: () => void;
  userId: string | null;
  autorNome: string | null;
}) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<string>("bug");
  const [sistema, setSistema] = useState<string>(SISTEMAS[0]);
  const [prioridade, setPrioridade] = useState<string>("media");
  const [referencia, setReferencia] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setTitulo(""); setTipo("bug"); setSistema(SISTEMAS[0]);
      setPrioridade("media"); setReferencia(""); setObservacoes("");
    }
  }, [open]);

  const criar = async () => {
    if (!titulo.trim()) { toast.error("Dá um título pro chamado."); return; }
    setSalvando(true);
    const { error } = await (supabase.from("chamados" as any) as any).insert({
      titulo: titulo.trim(),
      tipo, sistema, prioridade,
      referencia: referencia.trim() || null,
      observacoes: observacoes.trim() || null,
      created_by: userId,
      autor_nome: autorNome,
    });
    setSalvando(false);
    if (error) { toast.error("Erro ao abrir: " + error.message); return; }
    toast.success("Chamado aberto");
    onOpenChange(false);
    onCriado();
  };

  const inputCls = "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-primary/50";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> Abrir chamado
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto scrollbar-thin pr-1">
          {/* Tipo */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">O que é</label>
            <div className="grid grid-cols-3 gap-1.5">
              {TIPOS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTipo(t.key)}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs ring-1 transition-colors ${
                    tipo === t.key ? t.cls : "bg-white/[0.03] text-muted-foreground ring-white/10 hover:ring-white/25"
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" /> {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Título</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls}
              placeholder="Resumo em uma linha" autoFocus />
          </div>

          {/* Sistema + Prioridade */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Onde (aba/sistema)
              </label>
              <select value={sistema} onChange={(e) => setSistema(e.target.value)} className={inputCls}>
                {SISTEMAS.map((s) => <option key={s} value={s} className="bg-background">{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Flag className="h-3 w-3" /> Prioridade
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {PRIORIDADES.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setPrioridade(p.key)}
                    className={`flex items-center justify-center gap-1 px-1 py-2 rounded-lg text-xs ring-1 transition-colors ${
                      prioridade === p.key ? "bg-white/[0.06] text-foreground ring-white/25" : "bg-white/[0.03] text-muted-foreground ring-white/10 hover:ring-white/20"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} /> {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Referência */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Link2 className="h-3 w-3" /> Referência (opcional)
            </label>
            <input value={referencia} onChange={(e) => setReferencia(e.target.value)} className={inputCls}
              placeholder="Nº do processo, cliente ou link específico" />
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Observações</label>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={4}
              className={`${inputCls} resize-y`}
              placeholder="O que aconteceu, o passo a passo pra reproduzir, o que você esperava…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={criar} disabled={salvando}>{salvando ? "Abrindo…" : "Abrir chamado"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Detalhe / resolução ─────────────────────────────────────────────────────
function DetalheDialog({
  chamado, onOpenChange, podeResolver, meuId, meuNome, onMudou, setDetalhe,
}: {
  chamado: Chamado | null;
  onOpenChange: (o: boolean) => void;
  podeResolver: boolean;
  meuId: string | null;
  meuNome: string | null;
  onMudou: () => void;
  setDetalhe: (c: Chamado | null) => void;
}) {
  const [resolucao, setResolucao] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setResolucao(chamado?.resolucao || ""); }, [chamado?.id]);
  if (!chamado) return null;

  const t = tipoMeta(chamado.tipo);
  const p = prioMeta(chamado.prioridade);
  const st = STATUS[chamado.status];

  const mudarStatus = async (status: Chamado["status"]) => {
    setSalvando(true);
    const patch: any = { status };
    if (status === "resolvido") {
      patch.resolvido_por = meuId;
      patch.resolvido_por_nome = meuNome;
      patch.resolvido_em = new Date().toISOString();
      patch.resolucao = resolucao.trim() || null;
    } else {
      patch.resolvido_por = null; patch.resolvido_por_nome = null; patch.resolvido_em = null;
    }
    const { data, error } = await (supabase.from("chamados" as any) as any)
      .update(patch).eq("id", chamado.id).select("*").single();
    setSalvando(false);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(status === "resolvido" ? "Chamado resolvido" : status === "em_andamento" ? "Marcado em andamento" : "Reaberto");
    setDetalhe(data as Chamado);
    onMudou();
  };

  return (
    <Dialog open={!!chamado} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap pr-6">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ring-1 ${t.cls}`}>
              <t.icon className="h-3 w-3" /> {t.label}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ring-1 ${st.cls}`}>
              <st.icon className={`h-3 w-3 ${chamado.status === "em_andamento" ? "animate-spin" : ""}`} /> {st.label}
            </span>
            <span className={`inline-flex items-center gap-1 text-[11px] ${p.cls}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} /> {p.label}
            </span>
          </div>
          <DialogTitle className="text-left mt-2">{chamado.titulo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto scrollbar-thin pr-1 text-sm">
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <Info icon={MapPin} label="Onde" value={chamado.sistema || "Não informado"} />
            <Info icon={User} label="Aberto por" value={chamado.autor_nome || "Alguém"} />
            {chamado.referencia && <Info icon={Link2} label="Referência" value={chamado.referencia} />}
            <Info icon={Clock} label="Quando" value={new Date(chamado.created_at).toLocaleString("pt-BR")} />
          </div>

          {chamado.observacoes && (
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Observações</p>
              <p className="whitespace-pre-line text-foreground/90">{chamado.observacoes}</p>
            </div>
          )}

          {chamado.status === "resolvido" && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
              <p className="text-[10px] uppercase tracking-wider text-emerald-400/80 mb-1 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Resolvido
                {chamado.resolvido_por_nome ? ` por ${chamado.resolvido_por_nome}` : ""}
                {chamado.resolvido_em ? ` · ${tempoAtras(chamado.resolvido_em)}` : ""}
              </p>
              {chamado.resolucao && <p className="whitespace-pre-line text-foreground/90">{chamado.resolucao}</p>}
            </div>
          )}

          {podeResolver && chamado.status !== "resolvido" && (
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Nota de resolução (opcional)</label>
              <textarea value={resolucao} onChange={(e) => setResolucao(e.target.value)} rows={2}
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-primary/50 resize-y"
                placeholder="O que foi feito / decidido" />
            </div>
          )}
        </div>

        {podeResolver && (
          <DialogFooter className="flex-wrap gap-2">
            {chamado.status === "aberto" && (
              <Button variant="outline" onClick={() => mudarStatus("em_andamento")} disabled={salvando} className="gap-1.5">
                <Loader2 className="h-3.5 w-3.5" /> Em andamento
              </Button>
            )}
            {chamado.status === "em_andamento" && (
              <Button variant="outline" onClick={() => mudarStatus("aberto")} disabled={salvando} className="gap-1.5">
                <CircleDot className="h-3.5 w-3.5" /> Voltar p/ aberto
              </Button>
            )}
            {chamado.status === "resolvido" ? (
              <Button variant="outline" onClick={() => mudarStatus("aberto")} disabled={salvando} className="gap-1.5">
                <X className="h-3.5 w-3.5" /> Reabrir
              </Button>
            ) : (
              <Button onClick={() => mudarStatus("resolvido")} disabled={salvando} className="gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> {salvando ? "Salvando…" : "Marcar resolvido"}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Icon className="h-3 w-3" /> {label}</p>
      <p className="text-foreground/90 truncate mt-0.5">{value}</p>
    </div>
  );
}
