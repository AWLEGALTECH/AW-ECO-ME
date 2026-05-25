import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

interface ClienteEsteira {
  id: string;
  nome: string;
  created_at: string;
  origem: string | null;
}

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

  // Query 1: demandas em vinculadas/protocolo
  const demRes = useQuery({
    queryKey: ["esteira-demandas"],
    queryFn: async (): Promise<DemandaEsteira[]> => {
      const { data, error } = await supabase
        .from("demandas" as any)
        .select("id, etapa, status, titulo, desconto, analise_pai_id, peca_drive_url, protocolado_at, created_at, completed_at, cliente_id, cliente:clientes(id, nome)")
        .in("etapa", ["analise_vinculada", "pronta_para_protocolo"])
        .neq("status", "cancelada")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as DemandaEsteira[];
    },
    refetchInterval: 30_000,
  });

  // Query 2: clientes com tag 'precisa_analise_extratos' E ainda sem
  // nenhuma analise_vinculada (pipeline nao iniciado de verdade).
  const cliRes = useQuery({
    queryKey: ["esteira-clientes-aguardando"],
    queryFn: async (): Promise<ClienteEsteira[]> => {
      const { data: tagged, error: e1 } = await supabase
        .from("clientes")
        .select("id, nome, created_at, origem")
        .eq("precisa_analise_extratos" as any, true)
        .order("created_at", { ascending: false });
      if (e1) throw e1;
      const ids = (tagged || []).map(c => c.id);
      if (ids.length === 0) return [];
      // Quais desses ja tem alguma analise_vinculada? (RPC seria ideal, mas
      // pra simplicidade fazemos um in + filtragem client-side.)
      const { data: vincs, error: e2 } = await supabase
        .from("demandas" as any)
        .select("cliente_id")
        .eq("etapa", "analise_vinculada")
        .neq("status", "cancelada")
        .in("cliente_id", ids);
      if (e2) throw e2;
      const comVinc = new Set((vincs || []).map((v: any) => v.cliente_id));
      return (tagged || []).filter(c => !comVinc.has(c.id)) as ClienteEsteira[];
    },
    refetchInterval: 30_000,
  });

  const refetchAll = () => { demRes.refetch(); cliRes.refetch(); };
  const isLoading = demRes.isLoading || cliRes.isLoading;
  const isFetching = demRes.isFetching || cliRes.isFetching;

  // Particiona
  const { aguardando, vincs, protos } = useMemo(() => {
    const dem = demRes.data || [];
    const vincsAll = dem.filter(d => d.etapa === "analise_vinculada");
    const protosAll = dem.filter(d => d.etapa === "pronta_para_protocolo");
    const protoIds = new Set(protosAll.map(p => p.analise_pai_id).filter(Boolean));
    return {
      aguardando: cliRes.data || [],
      vincs: vincsAll.filter(v => !protoIds.has(v.id)),
      protos: protosAll.filter(p => !p.protocolado_at),
    };
  }, [demRes.data, cliRes.data]);

  const total = aguardando.length + vincs.length + protos.length;

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
        <Button variant="outline" size="sm" onClick={refetchAll} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </header>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12 text-sm">Carregando…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Coluna
            titulo="1. Aguardando análise"
            descricao="Clientes com perfil de análise Bradesco que ainda não tiveram nenhuma análise vinculada"
            icon={ScanSearch}
            cor="primary"
            count={aguardando.length}
          >
            {aguardando.length === 0 ? (
              <Vazio />
            ) : (
              aguardando.map(c => (
                <CardLinha
                  key={c.id}
                  to={`/clientes/${c.id}`}
                  titulo={c.nome}
                  sub={c.origem === "writer" ? "Cadastrado via procuração" : "Cadastro manual"}
                  data={c.created_at}
                  acao="Iniciar análise"
                  acaoIcon={ScanSearch}
                />
              ))
            )}
          </Coluna>

          <Coluna
            titulo="2. Análises vinculadas"
            descricao="Aguardando confecção da peça no Writer"
            icon={GitBranch}
            cor="primary"
            count={vincs.length}
          >
            {vincs.length === 0 ? (
              <Vazio />
            ) : (
              vincs.map(d => (
                <CardLinha
                  key={d.id}
                  to={d.cliente?.id ? `/clientes/${d.cliente.id}` : "/clientes"}
                  titulo={d.cliente?.nome || "cliente"}
                  sub={d.desconto || d.titulo}
                  data={d.created_at}
                  acao="Confeccionar peça"
                  acaoIcon={PenSquare}
                />
              ))
            )}
          </Coluna>

          <Coluna
            titulo="3. Peças prontas"
            descricao="Geradas no Writer, aguardando protocolo no tribunal"
            icon={Send}
            cor="amber"
            count={protos.length}
          >
            {protos.length === 0 ? (
              <Vazio />
            ) : (
              protos.map(d => (
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
              ))
            )}
          </Coluna>
        </div>
      )}
    </div>
  );
}

function Coluna({
  titulo, descricao, icon: Icon, cor, count, children,
}: {
  titulo: string;
  descricao: string;
  icon: any;
  cor: "primary" | "amber";
  count: number;
  children: React.ReactNode;
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
          {count}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">{descricao}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Vazio() {
  return (
    <div className="text-[12px] italic text-muted-foreground/60 px-3 py-6 text-center border border-dashed border-border rounded-lg">
      Nada pendente nessa etapa.
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
