import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Activity, RefreshCw, User, Search, Clock, ChevronDown } from "lucide-react";
import { appConfig } from "@/config/app-config";

interface LogRow {
  id: number;
  user_id: string | null;
  user_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: unknown;
  diff: unknown;
  created_at: string;
}

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  update: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  delete: "bg-destructive/15 text-destructive border-destructive/30",
  login:  "bg-primary/15 text-primary border-primary/30",
  login_failed: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  logout: "bg-muted text-muted-foreground border-border",
  signup: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  drive_folder_create: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
};

const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date(iso));

const PAGE_SIZE = 100;

export default function AdminLogs() {
  useEffect(() => { document.title = `Logs · ${appConfig.name}`; }, []);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [resourceFilter, setResourceFilter] = useState<string>("all");
  const [selected, setSelected] = useState<LogRow | null>(null);
  const [page, setPage] = useState(0);

  const q = useQuery({
    queryKey: ["audit-log", page, actionFilter, resourceFilter],
    queryFn: async (): Promise<LogRow[]> => {
      let query = supabase
        .from("audit_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (actionFilter !== "all") query = query.eq("action", actionFilter);
      if (resourceFilter !== "all") query = query.eq("resource_type", resourceFilter);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as LogRow[];
    },
    refetchInterval: 60_000,
  });

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return q.data || [];
    return (q.data || []).filter(l =>
      (l.user_email || "").toLowerCase().includes(t)
      || (l.resource_id || "").toLowerCase().includes(t)
      || (l.action || "").toLowerCase().includes(t)
      || (l.resource_type || "").toLowerCase().includes(t)
    );
  }, [q.data, search]);

  const acoesUnicas = useMemo(() => {
    const s = new Set<string>();
    (q.data || []).forEach(l => s.add(l.action));
    return Array.from(s).sort();
  }, [q.data]);

  const recursosUnicos = useMemo(() => {
    const s = new Set<string>();
    (q.data || []).forEach(l => s.add(l.resource_type));
    return Array.from(s).sort();
  }, [q.data]);

  return (
    <div className="space-y-6 max-w-7xl">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Logs do Sistema
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registro completo de eventos: criação, edição, exclusão, login, ações administrativas.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${q.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por usuário, recurso, ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Ação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas ações</SelectItem>
            {acoesUnicas.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={resourceFilter} onValueChange={(v) => { setResourceFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Tabela" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos recursos</SelectItem>
            {recursosUnicos.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? (
        <div className="text-center text-muted-foreground py-12 text-sm">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 text-sm">Nenhum log encontrado.</div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(l => (
            <button
              key={l.id}
              onClick={() => setSelected(l)}
              className="w-full text-left rounded-lg border border-border bg-card/40 hover:border-primary/40 hover:bg-card/60 transition-colors px-3 py-2.5 flex items-center gap-3"
            >
              <Badge variant="outline" className={`text-[10px] shrink-0 ${ACTION_COLORS[l.action] || "border-border"}`}>
                {l.action}
              </Badge>
              <span className="text-xs font-mono text-muted-foreground shrink-0 w-32 truncate">{l.resource_type}</span>
              <span className="text-xs flex-1 min-w-0 truncate">
                {l.user_email || <span className="italic text-muted-foreground">sistema</span>}
              </span>
              {l.resource_id && (
                <span className="text-[10px] font-mono text-muted-foreground/60 hidden md:inline truncate max-w-[180px]">
                  {l.resource_id}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground shrink-0 inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {fmtDateTime(l.created_at)}
              </span>
              <ChevronDown className="h-3 w-3 text-muted-foreground/40 shrink-0" />
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
          ← Anterior
        </Button>
        <span className="text-xs text-muted-foreground">Página {page + 1}</span>
        <Button variant="outline" size="sm" disabled={(q.data?.length || 0) < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>
          Próxima →
        </Button>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant="outline" className={`text-[10px] ${selected ? ACTION_COLORS[selected.action] || "border-border" : ""}`}>
                {selected?.action}
              </Badge>
              <span className="font-mono text-sm">{selected?.resource_type}</span>
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <Info label="Usuário" value={selected.user_email || "—"} icon={<User className="h-3 w-3" />} />
                <Info label="Quando" value={fmtDateTime(selected.created_at)} icon={<Clock className="h-3 w-3" />} />
                {selected.resource_id && <Info label="ID do recurso" value={selected.resource_id} mono />}
                <Info label="Log #" value={String(selected.id)} mono />
              </div>
              {selected.diff != null && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Diff (campos alterados)</p>
                  <pre className="bg-muted/30 rounded-lg p-3 text-[11px] overflow-x-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(selected.diff, null, 2)}
                  </pre>
                </div>
              )}
              {selected.details != null && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Detalhes</p>
                  <pre className="bg-muted/30 rounded-lg p-3 text-[11px] overflow-x-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(selected.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Info({ label, value, icon, mono }: { label: string; value: string; icon?: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground inline-flex items-center gap-1">{icon} {label}</p>
      <p className={`mt-0.5 ${mono ? "font-mono text-[11px]" : ""}`}>{value}</p>
    </div>
  );
}
