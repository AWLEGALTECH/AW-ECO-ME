import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Newspaper, Search, RefreshCw, CheckCircle2, Archive, ExternalLink, Hourglass, Inbox, Filter, Scale } from "lucide-react";
import { appConfig } from "@/config/app-config";

type StatusLeitura = "nao_lida" | "lida" | "arquivada";

interface Publicacao {
  id: string;
  advogado_id: string | null;
  djen_id: string | null;
  numero_processo: string | null;
  tribunal: string | null;
  orgao: string | null;
  data_disponibilizacao: string | null;
  data_publicacao: string | null;
  tipo_documento: string | null;
  conteudo: string | null;
  link_origem: string | null;
  status_leitura: StatusLeitura;
  lido_em: string | null;
  created_at: string;
}

interface Advogado { id: string; nome: string; oab: string; uf: string; ativo: boolean; }

const FILTROS: Array<{ k: StatusLeitura | "todas"; label: string; Icon: any }> = [
  { k: "nao_lida",  label: "Não lidas", Icon: Hourglass },
  { k: "lida",      label: "Lidas",     Icon: CheckCircle2 },
  { k: "arquivada", label: "Arquivadas",Icon: Archive },
  { k: "todas",     label: "Todas",     Icon: Inbox },
];

const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(d);
};

const tempoDecorrido = (iso: string | null): string => {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const dias = Math.floor(ms / 86400000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `${dias} dias atrás`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "1 mês atrás" : `${meses} meses atrás`;
};

export default function Publicacoes() {
  useEffect(() => { document.title = `Publicações — ${appConfig.name}`; }, []);
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<StatusLeitura | "todas">("nao_lida");
  const [advogadoFiltro, setAdvogadoFiltro] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<Publicacao | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  const advogadosRes = useQuery({
    queryKey: ["advogados_djen"],
    queryFn: async (): Promise<Advogado[]> => {
      const { data } = await supabase.from("advogados_djen" as any).select("id, nome, oab, uf, ativo").order("nome");
      return (data as any) || [];
    },
  });

  const pubsRes = useQuery({
    queryKey: ["publicacoes", filtro, advogadoFiltro],
    queryFn: async (): Promise<Publicacao[]> => {
      let q = supabase.from("publicacoes" as any).select("*").order("data_disponibilizacao", { ascending: false, nullsFirst: false });
      if (filtro !== "todas") q = q.eq("status_leitura", filtro);
      if (advogadoFiltro !== "todos") q = q.eq("advogado_id", advogadoFiltro);
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return (data as any) || [];
    },
    refetchInterval: 60_000,
  });

  const filtered = useMemo(() => {
    if (!busca.trim()) return pubsRes.data || [];
    const term = busca.toLowerCase();
    return (pubsRes.data || []).filter(p =>
      (p.numero_processo || "").toLowerCase().includes(term) ||
      (p.tribunal || "").toLowerCase().includes(term) ||
      (p.orgao || "").toLowerCase().includes(term) ||
      (p.conteudo || "").toLowerCase().includes(term)
    );
  }, [pubsRes.data, busca]);

  const sincronizar = async () => {
    setSincronizando(true);
    const { data, error } = await supabase.functions.invoke("djen-sync", { body: { dias: 7 } });
    setSincronizando(false);
    if (error) { toast.error("Falha no sync: " + error.message); return; }
    const r = (data as any)?.resultados || [];
    const novas = r.reduce((s: number, x: any) => s + (x.novas || 0), 0);
    toast.success(novas > 0 ? `${novas} nova(s) publicação(ões)` : "Tudo em dia, sem novidades");
    qc.invalidateQueries({ queryKey: ["publicacoes"] });
    qc.invalidateQueries({ queryKey: ["publicacoes_nao_lidas_count"] });
  };

  const marcar = async (id: string, status: StatusLeitura) => {
    const { error } = await supabase
      .from("publicacoes" as any)
      .update({ status_leitura: status, lido_em: status === "lida" ? new Date().toISOString() : null, lido_por: status === "lida" ? user?.id : null } as any)
      .eq("id", id);
    if (error) { toast.error("Erro ao atualizar: " + error.message); return; }
    qc.invalidateQueries({ queryKey: ["publicacoes"] });
    qc.invalidateQueries({ queryKey: ["publicacoes_nao_lidas_count"] });
    if (aberta?.id === id) setAberta(null);
  };

  const advogadoNome = (id: string | null) => {
    if (!id) return "—";
    return advogadosRes.data?.find(a => a.id === id)?.nome || "—";
  };

  const advogados = advogadosRes.data || [];
  const algumAtivo = advogados.some(a => a.ativo);

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Newspaper className="h-6 w-6 text-primary" />
            Publicações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Diário de Justiça Eletrônico Nacional (DJEN/CNJ) — endereçadas à OAB do escritório.
          </p>
        </div>
        <Button onClick={sincronizar} disabled={sincronizando || !algumAtivo} size="sm">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${sincronizando ? "animate-spin" : ""}`} />
          {sincronizando ? "Sincronizando..." : "Sincronizar agora"}
        </Button>
      </header>

      {advogados.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Inbox className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">Nenhum advogado cadastrado pra monitoramento</p>
            <p className="text-[12px] text-muted-foreground mt-1">
              Cadastre na tabela <code className="bg-muted/30 px-1 rounded">advogados_djen</code> (nome + OAB + UF + ativo) e o sync diário começa a popular.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1 rounded-xl border border-border bg-card/40 p-1">
              {FILTROS.map(f => {
                const Icon = f.Icon;
                const active = filtro === f.k;
                return (
                  <button
                    key={f.k}
                    onClick={() => setFiltro(f.k)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {f.label}
                  </button>
                );
              })}
            </div>

            {advogados.length > 1 && (
              <div className="flex items-center gap-1 rounded-xl border border-border bg-card/40 p-1">
                <button
                  onClick={() => setAdvogadoFiltro("todos")}
                  className={`px-3 py-1.5 text-xs rounded-lg ${advogadoFiltro === "todos" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Todos
                </button>
                {advogados.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setAdvogadoFiltro(a.id)}
                    className={`px-3 py-1.5 text-xs rounded-lg ${advogadoFiltro === a.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                    title={`${a.oab}/${a.uf}`}
                  >
                    {a.nome.split(" ")[0]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nº de processo, tribunal, órgão ou conteúdo..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9 h-11"
            />
          </div>

          {pubsRes.isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-12">Carregando…</p>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-400/60 mb-3" />
                <p className="text-sm font-medium">Nada {filtro === "nao_lida" ? "pendente de leitura" : "encontrado"} por aqui</p>
                <p className="text-[12px] text-muted-foreground mt-1">
                  {filtro === "nao_lida"
                    ? "Quando uma nova publicação for capturada, ela aparece aqui."
                    : "Troque o filtro acima ou rode um sync."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map(p => (
                <PublicacaoCard
                  key={p.id}
                  p={p}
                  advogadoNome={advogadoNome(p.advogado_id)}
                  onClick={() => setAberta(p)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <PublicacaoDialog
        p={aberta}
        advogadoNome={aberta ? advogadoNome(aberta.advogado_id) : ""}
        onClose={() => setAberta(null)}
        onMarcar={marcar}
      />
    </div>
  );
}

function PublicacaoCard({ p, advogadoNome, onClick }: { p: Publicacao; advogadoNome: string; onClick: () => void }) {
  const naoLida = p.status_leitura === "nao_lida";
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 transition-all ${
        naoLida
          ? "border-amber-400/30 bg-amber-400/5 hover:border-amber-400/60"
          : "border-border bg-card/40 hover:border-primary/40"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${
          naoLida ? "bg-amber-400/15 ring-1 ring-amber-400/30 text-amber-400" : "bg-muted/30 text-muted-foreground"
        }`}>
          <Scale className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {p.numero_processo || "Processo não informado"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {[p.tribunal, p.orgao].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">
              {fmtDate(p.data_disponibilizacao)} · {tempoDecorrido(p.data_disponibilizacao)}
            </span>
          </div>
          {p.conteudo && (
            <p className="text-[12px] text-foreground/80 line-clamp-2 mt-2">
              {p.conteudo}
            </p>
          )}
          <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-border/40">
            <span className="text-[10px] text-muted-foreground">
              {p.tipo_documento ? `${p.tipo_documento} · ` : ""}{advogadoNome}
            </span>
            {naoLida && (
              <span className="text-[10px] uppercase tracking-wider text-amber-400 font-medium">
                Não lida
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function PublicacaoDialog({
  p, advogadoNome, onClose, onMarcar,
}: {
  p: Publicacao | null;
  advogadoNome: string;
  onClose: () => void;
  onMarcar: (id: string, status: StatusLeitura) => void;
}) {
  if (!p) return null;
  return (
    <Dialog open={!!p} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            {p.numero_processo || "Publicação"}
          </DialogTitle>
          <DialogDescription>
            {[p.tribunal, p.orgao].filter(Boolean).join(" · ") || "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <Info label="Disponibilizado" value={fmtDate(p.data_disponibilizacao)} />
            <Info label="Tipo" value={p.tipo_documento || "—"} />
            <Info label="Advogado" value={advogadoNome} />
          </div>
          {p.conteudo && (
            <div className="rounded-md border border-border bg-muted/10 p-3">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1.5">Conteúdo</p>
              <p className="text-[13px] text-foreground/90 whitespace-pre-wrap leading-relaxed">{p.conteudo}</p>
            </div>
          )}
          {p.link_origem && (
            <a
              href={p.link_origem}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Abrir no portal de origem
            </a>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          {p.status_leitura !== "arquivada" && (
            <Button variant="outline" onClick={() => onMarcar(p.id, "arquivada")}>
              <Archive className="h-4 w-4 mr-1.5" /> Arquivar
            </Button>
          )}
          {p.status_leitura !== "lida" && (
            <Button onClick={() => onMarcar(p.id, "lida")} className="bg-emerald-600 hover:bg-emerald-500 text-white">
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Marcar como lida
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/10 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
      <p className="text-[12px] text-foreground/90 mt-0.5 truncate">{value}</p>
    </div>
  );
}
