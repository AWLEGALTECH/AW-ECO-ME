import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ScanSearch, GitBranch, Send, ArrowRight, Clock, User, PenSquare, Workflow, RefreshCw,
} from "lucide-react";
import { appConfig } from "@/config/app-config";

interface DemandaEsteira {
  id: string;
  etapa: string;
  status: string;
  titulo: string;
  desconto: string | null;
  analise_pai_id: string | null;
  peca_drive_url: string | null;
  protocolado_at: string | null;
  created_at: string;
  completed_at: string | null;
  cliente_id: string;
  cliente: { id: string; nome: string } | null;
}

const fmtDate = (iso: string | null) =>
  !iso ? "—" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));

const tempoDecorrido = (iso: string | null): string => {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const dias = Math.floor(ms / 86400000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "1 dia atrás";
  if (dias < 30) return `${dias} dias atrás`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "1 mês atrás" : `${meses} meses atrás`;
};

export default function Esteira() {
  useEffect(() => { document.title = `Esteira Pré-Protocolo — ${appConfig.name}`; }, []);

  const { data: rows, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["esteira-pre-protocolo"],
    queryFn: async (): Promise<DemandaEsteira[]> => {
      const { data, error } = await supabase
        .from("demandas" as any)
        .select("id, etapa, status, titulo, desconto, analise_pai_id, peca_drive_url, protocolado_at, created_at, completed_at, cliente_id, cliente:clientes(id, nome)")
        .in("etapa", ["analise_documental", "analise_vinculada", "pronta_para_protocolo"])
        .neq("status", "cancelada")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as DemandaEsteira[];
    },
    refetchInterval: 30_000,
  });

  // Particiona em 3 colunas com regras de "pendente":
  // - analise_documental: sem filhas (sem analises vinculadas ainda)
  // - analise_vinculada: sem peca pronta vinculada (sem filho pronta_para_protocolo)
  // - pronta_para_protocolo: sem protocolado_at
  const { docs, vincs, protos } = useMemo(() => {
    const all = rows || [];
    const docsAll = all.filter(d => d.etapa === "analise_documental");
    const vincsAll = all.filter(d => d.etapa === "analise_vinculada");
    const protosAll = all.filter(d => d.etapa === "pronta_para_protocolo");
    const vincIds = new Set(vincsAll.map(v => v.analise_pai_id).filter(Boolean));
    const protoIds = new Set(protosAll.map(p => p.analise_pai_id).filter(Boolean));
    return {
      docs: docsAll.filter(d => !vincIds.has(d.id)),
      vincs: vincsAll.filter(v => !protoIds.has(v.id)),
      protos: protosAll.filter(p => !p.protocolado_at),
    };
  }, [rows]);

  const total = docs.length + vincs.length + protos.length;

  return (
    <div className="space-y-6 max-w-7xl">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Workflow className="h-6 w-6 text-primary" />
            Esteira Pré-Protocolo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visão unificada de tudo pendente em produção. Total: <strong className="text-foreground">{total}</strong> item{total === 1 ? "" : "s"}.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </header>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12 text-sm">Carregando…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Coluna
            titulo="1. Análise documental"
            descricao="Sessões abertas sem análises vinculadas ainda"
            icon={ScanSearch}
            cor="primary"
            itens={docs}
            renderCard={(d) => (
              <CardLinha
                key={d.id}
                to={d.cliente?.id ? `/clientes/${d.cliente.id}` : "/clientes"}
                titulo={d.cliente?.nome || "cliente"}
                sub={d.titulo}
                data={d.created_at}
                acao="Abrir cliente"
              />
            )}
          />

          <Coluna
            titulo="2. Análises vinculadas"
            descricao="Aguardando confecção da peça no Writer"
            icon={GitBranch}
            cor="primary"
            itens={vincs}
            renderCard={(d) => (
              <CardLinha
                key={d.id}
                to={d.cliente?.id ? `/clientes/${d.cliente.id}` : "/clientes"}
                titulo={d.cliente?.nome || "cliente"}
                sub={d.desconto || d.titulo}
                data={d.created_at}
                acao="Confeccionar peça"
                acaoIcon={PenSquare}
              />
            )}
          />

          <Coluna
            titulo="3. Peças prontas"
            descricao="Geradas no Writer, aguardando protocolo no tribunal"
            icon={Send}
            cor="amber"
            itens={protos}
            renderCard={(d) => (
              <CardLinha
                key={d.id}
                to={d.cliente?.id ? `/clientes/${d.cliente.id}` : "/clientes"}
                titulo={d.cliente?.nome || "cliente"}
                sub={d.desconto || d.titulo}
                data={d.completed_at || d.created_at}
                acao="Abrir espelho"
                acaoIcon={Send}
                accent="amber"
              />
            )}
          />
        </div>
      )}
    </div>
  );
}

function Coluna({
  titulo, descricao, icon: Icon, cor, itens, renderCard,
}: {
  titulo: string;
  descricao: string;
  icon: any;
  cor: "primary" | "amber";
  itens: DemandaEsteira[];
  renderCard: (d: DemandaEsteira) => React.ReactNode;
}) {
  const corClass = cor === "amber"
    ? "text-amber-400 bg-amber-400/10 border-amber-400/30"
    : "text-primary bg-primary/10 border-primary/30";
  return (
    <div className="space-y-2 min-w-0">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <h3 className="text-sm font-medium truncate">{titulo}</h3>
        </div>
        <span className={`inline-flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full border text-[11px] font-bold tabular-nums shrink-0 ${corClass}`}>
          {itens.length}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">{descricao}</p>
      <div className="space-y-2">
        {itens.length === 0 ? (
          <div className="text-[12px] italic text-muted-foreground/60 px-3 py-6 text-center border border-dashed border-border rounded-lg">
            Nada pendente nessa etapa.
          </div>
        ) : (
          itens.map(renderCard)
        )}
      </div>
    </div>
  );
}

function CardLinha({
  to, titulo, sub, data, acao, acaoIcon: AcaoIcon = ArrowRight, accent = "primary",
}: {
  to: string;
  titulo: string;
  sub: string;
  data: string | null;
  acao: string;
  acaoIcon?: any;
  accent?: "primary" | "amber";
}) {
  const accentText = accent === "amber" ? "text-amber-400" : "text-primary";
  return (
    <Link
      to={to}
      className="block rounded-lg border border-border bg-card/40 hover:border-primary/40 hover:bg-card/60 transition-colors p-3 group"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <User className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold truncate">{titulo}</span>
      </div>
      <p className="text-[12px] text-foreground/80 line-clamp-2 mb-2">{sub}</p>
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-2.5 w-2.5" /> {tempoDecorrido(data)}
        </span>
        <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${accentText} group-hover:gap-1.5 transition-all`}>
          {acao} <AcaoIcon className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}
