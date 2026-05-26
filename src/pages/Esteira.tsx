import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ScanSearch, GitBranch, Send, ArrowRight, Clock, User, PenSquare,
  Workflow, RefreshCw, AlertTriangle, FolderOpen, CheckCircle2,
} from "lucide-react";
import { appConfig } from "@/config/app-config";
import { EsteiraInicioDialog, TIPOS_PENDENCIA } from "@/components/EsteiraInicioDialog";

interface DemandaEsteira {
  id: string;
  etapa: string;
  status: string;
  titulo: string;
  desconto: string | null;
  descricao: string | null;
  pendencia_tipo: string | null;
  analise_pai_id: string | null;
  peca_drive_url: string | null;
  protocolado_at: string | null;
  created_at: string;
  completed_at: string | null;
  cliente_id: string;
  cliente: { id: string; nome: string; drive_folder_url?: string | null } | null;
}

interface ClienteEsteira {
  id: string;
  nome: string;
  created_at: string;
  origem: string | null;
  drive_folder_url: string | null;
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
  const { user } = useAuth();
  const [inicioCliente, setInicioCliente] = useState<ClienteEsteira | null>(null);

  // Query 1: demandas PENDENTES em vinculadas/protocolo/pendencia.
  const demRes = useQuery({
    queryKey: ["esteira-demandas"],
    queryFn: async (): Promise<DemandaEsteira[]> => {
      const { data, error } = await supabase
        .from("demandas" as any)
        .select("id, etapa, status, titulo, desconto, descricao, pendencia_tipo, analise_pai_id, peca_drive_url, protocolado_at, created_at, completed_at, cliente_id, cliente:clientes(id, nome, drive_folder_url)")
        .in("etapa", ["pendencia_documental", "analise_vinculada", "pronta_para_protocolo"])
        .eq("status", "pendente")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as DemandaEsteira[];
    },
    refetchInterval: 30_000,
  });

  // Query 2: clientes com tag 'precisa_analise_extratos' E que NUNCA
  // tiveram nenhuma analise_vinculada nao-cancelada (pipeline nao iniciado).
  const cliRes = useQuery({
    queryKey: ["esteira-clientes-aguardando"],
    queryFn: async (): Promise<ClienteEsteira[]> => {
      const { data: tagged, error: e1 } = await supabase
        .from("clientes")
        .select("id, nome, created_at, origem, drive_folder_url")
        .eq("precisa_analise_extratos" as any, true)
        .order("created_at", { ascending: false });
      if (e1) throw e1;
      const ids = (tagged || []).map(c => c.id);
      if (ids.length === 0) return [];
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
  const { pendencias, aguardando, vincs, protos } = useMemo(() => {
    const dem = demRes.data || [];
    const pendenciasAll = dem.filter(d => d.etapa === "pendencia_documental");
    const vincsAll = dem.filter(d => d.etapa === "analise_vinculada");
    const protosAll = dem.filter(d => d.etapa === "pronta_para_protocolo");
    const protoIds = new Set(protosAll.map(p => p.analise_pai_id).filter(Boolean));
    return {
      pendencias: pendenciasAll,
      aguardando: cliRes.data || [],
      vincs: vincsAll.filter(v => !protoIds.has(v.id)),
      protos: protosAll.filter(p => !p.protocolado_at),
    };
  }, [demRes.data, cliRes.data]);

  const total = pendencias.length + aguardando.length + vincs.length + protos.length;

  const marcarResolvida = async (id: string) => {
    const { error } = await supabase.from("demandas" as any)
      .update({ status: "resolvida", completed_at: new Date().toISOString(), completed_by: user?.id || null })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Pendência marcada como resolvida");
    refetchAll();
  };

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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Coluna
            titulo="0. Pendências"
            descricao="Documentos faltando — bloqueia o avanço até resolver"
            icon={AlertTriangle}
            cor="amber"
            count={pendencias.length}
          >
            {pendencias.length === 0 ? (
              <Vazio />
            ) : (
              pendencias.map(p => (
                <PendenciaCard key={p.id} demanda={p} onResolver={() => marcarResolvida(p.id)} />
              ))
            )}
          </Coluna>

          <Coluna
            titulo="1. Aguardando análise"
            descricao="Clientes com perfil de análise que ainda não tiveram análise iniciada"
            icon={ScanSearch}
            cor="primary"
            count={aguardando.length}
          >
            {aguardando.length === 0 ? (
              <Vazio />
            ) : (
              aguardando.map(c => (
                <CardBotao
                  key={c.id}
                  onClick={() => setInicioCliente(c)}
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

      <EsteiraInicioDialog
        open={!!inicioCliente}
        onClose={() => setInicioCliente(null)}
        cliente={inicioCliente ? { id: inicioCliente.id, nome: inicioCliente.nome, drive_folder_url: inicioCliente.drive_folder_url } : null}
        userId={user?.id || null}
        onCreated={refetchAll}
      />
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

function CardBotao({
  onClick, titulo, sub, data, acao, acaoIcon: AcaoIcon = ArrowRight,
}: {
  onClick: () => void;
  titulo: string;
  sub: string;
  data: string | null;
  acao: string;
  acaoIcon?: any;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-border bg-card/40 hover:border-primary/40 hover:bg-card/60 transition-colors p-3 group"
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
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary group-hover:gap-1.5 transition-all">
          {acao} <AcaoIcon className="h-3 w-3" />
        </span>
      </div>
    </button>
  );
}

function PendenciaCard({ demanda, onResolver }: { demanda: DemandaEsteira; onResolver: () => void }) {
  const tipoLabel = demanda.pendencia_tipo === "personalizada"
    ? demanda.descricao || "Personalizada"
    : TIPOS_PENDENCIA.find(t => t.key === demanda.pendencia_tipo)?.label || demanda.titulo;
  return (
    <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <User className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold truncate">{demanda.cliente?.nome || "cliente"}</span>
      </div>
      <div className="flex items-start gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-foreground/90 line-clamp-3">{tipoLabel}</p>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-amber-400/20">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-2.5 w-2.5" /> {tempoDecorrido(demanda.created_at)}
        </span>
        <div className="flex items-center gap-1">
          {demanda.cliente?.drive_folder_url && (
            <a
              href={demanda.cliente.drive_folder_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted/40"
              title="Abrir Drive"
            >
              <FolderOpen className="h-3 w-3" />
            </a>
          )}
          <button
            onClick={onResolver}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:gap-1.5 transition-all px-1.5 py-0.5 rounded hover:bg-primary/10"
          >
            <CheckCircle2 className="h-3 w-3" /> Resolvida
          </button>
        </div>
      </div>
    </div>
  );
}
