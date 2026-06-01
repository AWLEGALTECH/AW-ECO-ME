import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ScanSearch, GitBranch, Send, ArrowRight, Clock, User, PenSquare, Hammer, Building2,
  Workflow, RefreshCw, AlertTriangle, CheckCircle2, ExternalLink, X, ChevronDown,
} from "lucide-react";
import { appConfig } from "@/config/app-config";
import { EsteiraInicioDialog, TIPOS_PENDENCIA } from "@/components/EsteiraInicioDialog";
import { DriveFolderButton } from "@/components/DriveFolderButton";
import { EspelhoProtocoloDialog, type Cliente as ClienteCheia, type Demanda as DemandaCheia } from "@/pages/ClienteDetail";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  requerido: string | null;
  observacoes: string | null;
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
  const navigate = useNavigate();
  const [inicioCliente, setInicioCliente] = useState<ClienteEsteira | null>(null);
  const [pendenciaOpen, setPendenciaOpen] = useState<DemandaEsteira | null>(null);
  const [confirmandoResolver, setConfirmandoResolver] = useState(false);
  // Espelho de protocolo (clicar em "Pecas Prontas" abre o dialog
  // direto, sem passar pela ficha do cliente).
  const [espelhoOpen, setEspelhoOpen] = useState<{ cliente: ClienteCheia; demanda: DemandaCheia } | null>(null);
  const [espelhoLoading, setEspelhoLoading] = useState(false);
  const abrirEspelho = async (d: DemandaEsteira) => {
    if (espelhoLoading || !d.cliente?.id) return;
    setEspelhoLoading(true);
    const [cliRes, demRes] = await Promise.all([
      supabase.from("clientes").select("*").eq("id", d.cliente.id).single(),
      supabase.from("demandas" as any).select("*").eq("id", d.id).single(),
    ]);
    setEspelhoLoading(false);
    if (cliRes.error || !cliRes.data) { toast.error("Não consegui carregar o cliente"); return; }
    if (demRes.error || !demRes.data)  { toast.error("Não consegui carregar a demanda"); return; }
    setEspelhoOpen({ cliente: cliRes.data as ClienteCheia, demanda: demRes.data as unknown as DemandaCheia });
  };
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const toggleExpand = (key: string) => setExpandidos(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // Query 1: demandas PENDENTES em vinculadas/protocolo/pendencia.
  const demRes = useQuery({
    queryKey: ["esteira-demandas"],
    queryFn: async (): Promise<DemandaEsteira[]> => {
      const { data, error } = await supabase
        .from("demandas" as any)
        .select("id, etapa, status, titulo, desconto, descricao, pendencia_tipo, analise_pai_id, peca_drive_url, protocolado_at, created_at, completed_at, cliente_id, cliente:clientes(id, nome, drive_folder_url)")
        .in("etapa", ["pendencia_documental", "analise_vinculada", "fluxo_artesanal", "pronta_para_protocolo"])
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
        .select("id, nome, created_at, origem, drive_folder_url, requerido, observacoes")
        .eq("precisa_analise_extratos" as any, true)
        .order("created_at", { ascending: false });
      if (e1) throw e1;
      const ids = (tagged || []).map(c => c.id);
      if (ids.length === 0) return [];
      // Cliente sai de "Aguardando" assim que tem uma demanda em qualquer
      // fluxo (Bradesco ou artesanal) que nao esteja cancelada.
      const { data: vincs, error: e2 } = await supabase
        .from("demandas" as any)
        .select("cliente_id")
        .in("etapa", ["analise_vinculada", "fluxo_artesanal"])
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
  const { pendencias, aguardando, vincs, artesanais, protos } = useMemo(() => {
    const dem = demRes.data || [];
    const pendenciasAll = dem.filter(d => d.etapa === "pendencia_documental");
    const vincsAll = dem.filter(d => d.etapa === "analise_vinculada");
    const artesanaisAll = dem.filter(d => d.etapa === "fluxo_artesanal");
    const protosAll = dem.filter(d => d.etapa === "pronta_para_protocolo");
    const protoIds = new Set(protosAll.map(p => p.analise_pai_id).filter(Boolean));
    return {
      pendencias: pendenciasAll,
      aguardando: cliRes.data || [],
      vincs: vincsAll.filter(v => !protoIds.has(v.id)),
      artesanais: artesanaisAll.filter(a => !protoIds.has(a.id)),
      protos: protosAll.filter(p => !p.protocolado_at),
    };
  }, [demRes.data, cliRes.data]);

  const total = pendencias.length + aguardando.length + vincs.length + artesanais.length + protos.length;

  // Avança uma peça artesanal direto pra "Peças prontas" (peça já no Drive).
  const avancarArtesanalParaPronta = async (d: DemandaEsteira) => {
    const nome = d.cliente?.nome || "cliente";
    const novoTitulo = `Pronto pra protocolo — ${d.desconto || nome}`;
    const { error } = await supabase.from("demandas" as any)
      .update({ etapa: "pronta_para_protocolo", titulo: novoTitulo })
      .eq("id", d.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Peça movida pra fila de protocolo");
    refetchAll();
  };

  const marcarResolvida = async (id: string) => {
    const { error } = await supabase.from("demandas" as any)
      .update({ status: "resolvida", completed_at: new Date().toISOString(), completed_by: user?.id || null })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Pendência marcada como resolvida");
    setConfirmandoResolver(false);
    setPendenciaOpen(null);
    refetchAll();
  };

  // Agrupa demandas por cliente — facilita varredura quando ha varias do mesmo
  const groupByCliente = (lista: DemandaEsteira[]) => {
    const groups = new Map<string, { nome: string; items: DemandaEsteira[] }>();
    for (const d of lista) {
      const key = d.cliente?.id || "_";
      if (!groups.has(key)) groups.set(key, { nome: d.cliente?.nome || "—", items: [] });
      groups.get(key)!.items.push(d);
    }
    return Array.from(groups.values());
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
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
              groupByCliente(pendencias).map(g => {
                const key = `pend-${g.items[0].cliente?.id || g.nome}`;
                const hint = pendenciaLabel(g.items[0]);
                return (
                  <ClienteAccordion
                    key={key}
                    nome={g.nome}
                    count={g.items.length}
                    accent="amber"
                    expanded={expandidos.has(key)}
                    onToggle={() => toggleExpand(key)}
                    hint={g.items.length === 1 ? hint : `${g.items.length} pendências documentais`}
                  >
                    {g.items.map(p => (
                      <PendenciaCard key={p.id} demanda={p} onClick={() => setPendenciaOpen(p)} />
                    ))}
                  </ClienteAccordion>
                );
              })
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
                  sub={
                    c.requerido ? (
                      <span className="inline-flex items-center gap-1.5 text-foreground/80">
                        <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate">{c.requerido}</span>
                      </span>
                    ) : (
                      <span className="text-foreground/80">
                        {c.origem === "writer" ? "Cadastrado via procuração" : "Cadastro manual"}
                      </span>
                    )
                  }
                  data={c.created_at}
                  acao="Iniciar análise"
                  acaoIcon={ScanSearch}
                />
              ))
            )}
          </Coluna>

          <Coluna
            titulo="2. Análise vinculada Bradesco"
            descricao="Aguardando confecção da peça no Writer"
            icon={GitBranch}
            cor="primary"
            count={vincs.length}
          >
            {vincs.length === 0 ? (
              <Vazio />
            ) : (
              groupByCliente(vincs).map(g => {
                const key = `vinc-${g.items[0].cliente?.id || g.nome}`;
                const hint = g.items[0].desconto || g.items[0].titulo;
                return (
                  <ClienteAccordion
                    key={key}
                    nome={g.nome}
                    count={g.items.length}
                    accent="primary"
                    expanded={expandidos.has(key)}
                    onToggle={() => toggleExpand(key)}
                    hint={g.items.length === 1 ? hint : `${g.items.length} análises vinculadas`}
                  >
                    {g.items.map(d => (
                      <CardLinha
                        key={d.id}
                        to={d.cliente?.id ? `/clientes/${d.cliente.id}` : "/clientes"}
                        titulo={d.desconto || d.titulo}
                        sub=""
                        data={d.created_at}
                        acao="Confeccionar peça"
                        acaoIcon={PenSquare}
                      />
                    ))}
                  </ClienteAccordion>
                );
              })
            )}
          </Coluna>

          <Coluna
            titulo="3. Fluxo artesanal"
            descricao="Casos não-Bradesco — peça será confeccionada manualmente"
            icon={Hammer}
            cor="primary"
            count={artesanais.length}
          >
            {artesanais.length === 0 ? (
              <Vazio />
            ) : (
              groupByCliente(artesanais).map(g => {
                const key = `art-${g.items[0].cliente?.id || g.nome}`;
                const hint = g.items[0].desconto || g.items[0].titulo;
                return (
                  <ClienteAccordion
                    key={key}
                    nome={g.nome}
                    count={g.items.length}
                    accent="primary"
                    expanded={expandidos.has(key)}
                    onToggle={() => toggleExpand(key)}
                    hint={g.items.length === 1 ? hint : `${g.items.length} peças artesanais`}
                  >
                    {g.items.map(d => (
                      <CardArtesanal
                        key={d.id}
                        demanda={d}
                        onAvancar={() => avancarArtesanalParaPronta(d)}
                      />
                    ))}
                  </ClienteAccordion>
                );
              })
            )}
          </Coluna>

          <Coluna
            titulo="4. Peças prontas"
            descricao="Geradas no Writer, aguardando protocolo no tribunal"
            icon={Send}
            cor="amber"
            count={protos.length}
          >
            {protos.length === 0 ? (
              <Vazio />
            ) : (
              groupByCliente(protos).map(g => {
                const key = `proto-${g.items[0].cliente?.id || g.nome}`;
                const firstTitle = g.items[0].desconto || g.items[0].titulo.replace(/^Pronto pra protocolo — /, "");
                return (
                  <ClienteAccordion
                    key={key}
                    nome={g.nome}
                    count={g.items.length}
                    accent="amber"
                    expanded={expandidos.has(key)}
                    onToggle={() => toggleExpand(key)}
                    hint={g.items.length === 1 ? firstTitle : `${g.items.length} peças prontas`}
                  >
                    {g.items.map(d => (
                      <CardBotaoLinha
                        key={d.id}
                        onClick={() => abrirEspelho(d)}
                        titulo={d.desconto || d.titulo.replace(/^Pronto pra protocolo — /, "")}
                        data={d.completed_at || d.created_at}
                        acao="Abrir espelho"
                        acaoIcon={Send}
                        accent="amber"
                      />
                    ))}
                  </ClienteAccordion>
                );
              })
            )}
          </Coluna>
        </div>
      )}

      <EsteiraInicioDialog
        open={!!inicioCliente}
        onClose={() => setInicioCliente(null)}
        cliente={inicioCliente ? { id: inicioCliente.id, nome: inicioCliente.nome, drive_folder_url: inicioCliente.drive_folder_url, observacoes: inicioCliente.observacoes } : null}
        userId={user?.id || null}
        onCreated={refetchAll}
      />

      <PendenciaDetalheDialog
        demanda={pendenciaOpen}
        onClose={() => setPendenciaOpen(null)}
        onResolver={() => setConfirmandoResolver(true)}
      />

      <AlertDialog open={confirmandoResolver} onOpenChange={(o) => !o && setConfirmandoResolver(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar pendência como resolvida?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta pendência sairá da esteira. Use só quando o documento já estiver no Drive
              do cliente e a pendência estiver de fato sanada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (pendenciaOpen) marcarResolvida(pendenciaOpen.id); }}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" /> Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EspelhoProtocoloDialog
        demanda={espelhoOpen?.demanda || null}
        cliente={espelhoOpen?.cliente || null}
        onClose={() => setEspelhoOpen(null)}
        onProtocolado={() => { setEspelhoOpen(null); refetchAll(); }}
        onVerPerfil={() => {
          const id = espelhoOpen?.cliente?.id;
          setEspelhoOpen(null);
          if (id) navigate(`/clientes/${id}?aba=demandas`);
        }}
      />
    </div>
  );
}

function ClienteAccordion({
  nome, count, accent, expanded, onToggle, hint, children,
}: {
  nome: string;
  count: number;
  accent: "amber" | "primary";
  expanded: boolean;
  onToggle: () => void;
  hint?: string;
  children: React.ReactNode;
}) {
  const accentBorder = accent === "amber" ? "border-amber-400/30 hover:border-amber-400/60" : "border-border hover:border-primary/40";
  const accentBg = accent === "amber" ? "bg-amber-400/5 hover:bg-amber-400/10" : "bg-card/40 hover:bg-card/60";
  const accentBadge = accent === "amber" ? "text-amber-400 bg-amber-400/15 border-amber-400/30" : "text-primary bg-primary/15 border-primary/30";
  return (
    <div className={`rounded-lg border transition-colors ${accentBorder} ${expanded ? "" : accentBg}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 text-left"
      >
        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold truncate flex-1">{nome}</span>
        <span className={`inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full border text-[10px] font-bold tabular-nums shrink-0 ${accentBadge}`}>
          {count}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {!expanded && hint && (
        <div className="px-3 pb-3 -mt-1">
          <p className="text-[11px] text-muted-foreground line-clamp-1">{hint}</p>
        </div>
      )}
      {expanded && (
        <div className="px-2 pb-2 space-y-1.5 border-t border-border/40 pt-2">
          {children}
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

// Versao botao do CardLinha — usada quando o clique nao navega mas abre
// um dialog (ex: espelho de protocolo na coluna "Pecas Prontas").
function CardBotaoLinha({
  onClick, titulo, data, acao, acaoIcon: AcaoIcon = ArrowRight, accent = "primary",
}: {
  onClick: () => void;
  titulo: string;
  data: string | null;
  acao: string;
  acaoIcon?: any;
  accent?: "primary" | "amber";
}) {
  const accentText = accent === "amber" ? "text-amber-400" : "text-primary";
  return (
    <button
      onClick={onClick}
      className="block w-full text-left rounded-lg border border-border bg-card/40 hover:border-primary/40 hover:bg-card/60 transition-colors p-3 group"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <User className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold truncate">{titulo}</span>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-2.5 w-2.5" /> {tempoDecorrido(data)}
        </span>
        <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${accentText} group-hover:gap-1.5 transition-all`}>
          {acao} <AcaoIcon className="h-3 w-3" />
        </span>
      </div>
    </button>
  );
}

function CardBotao({
  onClick, titulo, sub, data, acao, acaoIcon: AcaoIcon = ArrowRight,
}: {
  onClick: () => void;
  titulo: string;
  sub: ReactNode;
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
      <div className="text-[12px] text-foreground/80 line-clamp-2 mb-2">{sub}</div>
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

// Card do "Fluxo artesanal": card inteiro e clicavel. Ao clicar, abre um
// dialog com botao pra abrir a pasta do Drive (subir a peca) e so depois
// permite confirmar a conclusao — evita conclusao acidental.
function CardArtesanal({ demanda, onAvancar }: { demanda: DemandaEsteira; onAvancar: () => void }) {
  const [open, setOpen] = useState(false);
  const drive = demanda.cliente?.drive_folder_url;
  const nomeCliente = demanda.cliente?.nome || "cliente";
  const handleConfirm = () => {
    setOpen(false);
    onAvancar();
  };
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full text-left rounded-lg border border-border bg-card/40 hover:border-primary/40 hover:bg-card/60 transition-colors p-3 group"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Hammer className="h-3 w-3 text-primary shrink-0" />
          <span className="text-xs font-semibold truncate">
            {demanda.desconto || demanda.titulo}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5" /> {tempoDecorrido(demanda.created_at)}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary group-hover:gap-1.5 transition-all">
            Concluir peça <Send className="h-3 w-3" />
          </span>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Hammer className="h-4 w-4 text-primary" />
              Concluir peça artesanal
            </DialogTitle>
            <DialogDescription>
              {nomeCliente} — {demanda.desconto || demanda.titulo}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-1">
            {/* Atalho pro perfil — primeiro botao */}
            {demanda.cliente && (
              <a
                href={`/clientes/${demanda.cliente.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 hover:bg-primary/15 transition-colors"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Abrir perfil do cliente</p>
                  <p className="text-[11px] text-muted-foreground">Veja dados, demandas e histórico completo</p>
                </div>
                <ExternalLink className="h-4 w-4 text-primary opacity-70" />
              </a>
            )}
            <p className="text-sm text-foreground/80">
              1. Suba o arquivo da peça na pasta do Drive deste cliente.
            </p>
            {demanda.cliente && (
              <DriveFolderButton
                clienteId={demanda.cliente.id}
                clienteNome={nomeCliente}
                driveFolderUrl={drive}
              />
            )}
            <p className="text-sm text-foreground/80 pt-1">
              2. Depois, confirme abaixo. O card vai pra <strong>Peças prontas</strong> e sai da fila artesanal.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              <X className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <Button onClick={handleConfirm} className="bg-emerald-600 hover:bg-emerald-500 text-white">
              <Send className="h-4 w-4 mr-1" /> Confirmar conclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Pendencias importadas da planilha tem a descricao no formato:
//   "<obs real opcional> | comarca: X | importado da planilha (status original: ...)"
// Separa a obs real dos metadados pra renderizar limpo.
function parsePendenciaDescricao(d: string | null): { obs: string | null; comarca: string | null } {
  if (!d) return { obs: null, comarca: null };
  let s = d.replace(/\s*\|\s*importado da planilha[^|]*$/i, "").trim();
  const m = s.match(/\|\s*comarca:\s*([^|]+)/i);
  const comarca = m ? m[1].trim() : null;
  s = s.replace(/\s*\|\s*comarca:\s*[^|]+/i, "").trim();
  return { obs: s || null, comarca };
}

function pendenciaLabel(demanda: DemandaEsteira): string {
  if (demanda.pendencia_tipo === "personalizada") {
    const { obs } = parsePendenciaDescricao(demanda.descricao);
    return obs || "Pendência personalizada";
  }
  return TIPOS_PENDENCIA.find(t => t.key === demanda.pendencia_tipo)?.label || demanda.titulo;
}

function PendenciaCard({ demanda, onClick }: { demanda: DemandaEsteira; onClick: () => void }) {
  const tipoLabel = pendenciaLabel(demanda);
  const materia = demanda.titulo.replace(/^Pend[êe]ncia documental\s*—\s*/i, "");
  const mostrarMateria = materia && materia !== demanda.titulo && materia !== tipoLabel;
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-amber-400/30 bg-amber-400/5 hover:border-amber-400/60 hover:bg-amber-400/10 transition-colors p-3 space-y-1.5"
    >
      <div className="flex items-start gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[12px] text-foreground/90 line-clamp-2 flex-1">{tipoLabel}</p>
      </div>
      {mostrarMateria && (
        <p className="text-[10px] text-muted-foreground line-clamp-1 pl-5">{materia}</p>
      )}
      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-amber-400/20">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-2.5 w-2.5" /> {tempoDecorrido(demanda.created_at)}
        </span>
        <span className="text-[10px] text-amber-400/70 font-medium">ver detalhes →</span>
      </div>
    </button>
  );
}

function PendenciaDetalheDialog({
  demanda, onClose, onResolver,
}: {
  demanda: DemandaEsteira | null;
  onClose: () => void;
  onResolver: () => void;
}) {
  if (!demanda) return null;
  const tipoLabel = demanda.pendencia_tipo === "personalizada"
    ? "Personalizada"
    : TIPOS_PENDENCIA.find(t => t.key === demanda.pendencia_tipo)?.label || demanda.pendencia_tipo || "—";
  const driveUrl = demanda.cliente?.drive_folder_url;
  const { obs: obsLimpa, comarca } = parsePendenciaDescricao(demanda.descricao);
  const materia = demanda.titulo.replace(/^Pend[êe]ncia documental\s*—\s*/i, "");
  const mostrarMateria = materia && materia !== demanda.titulo;

  return (
    <Dialog open={!!demanda} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            Pendência documental
          </DialogTitle>
          <DialogDescription>{demanda.cliente?.nome || "cliente"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Atalho pro perfil — primeiro botao */}
          {demanda.cliente?.id && (
            <a
              href={`/clientes/${demanda.cliente.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 hover:bg-primary/15 transition-colors"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Abrir perfil do cliente</p>
                <p className="text-[11px] text-muted-foreground">Veja dados, demandas e histórico completo</p>
              </div>
              <ExternalLink className="h-4 w-4 text-primary opacity-70" />
            </a>
          )}

          <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 px-3 py-2 space-y-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-amber-400/80 mb-1">Tipo</p>
              <p className="text-sm font-medium">{tipoLabel}</p>
            </div>
            {mostrarMateria && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-amber-400/80 mb-1">Matéria</p>
                <p className="text-[12px] text-foreground/90">{materia}</p>
              </div>
            )}
            {comarca && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-amber-400/80 mb-1">Comarca</p>
                <p className="text-[12px] text-foreground/90">{comarca}</p>
              </div>
            )}
            {obsLimpa && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.15em] text-amber-400/80 mb-1">Observação</p>
                <p className="text-[12px] text-foreground/90 whitespace-pre-line">{obsLimpa}</p>
              </div>
            )}
          </div>

          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> Aberta {tempoDecorrido(demanda.created_at)}
          </div>

          {demanda.cliente?.id && (
            <DriveFolderButton
              clienteId={demanda.cliente.id}
              clienteNome={demanda.cliente.nome}
              driveFolderUrl={driveUrl}
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1" /> Fechar
          </Button>
          <Button onClick={onResolver} className="bg-emerald-600 hover:bg-emerald-500 text-white">
            <CheckCircle2 className="h-4 w-4 mr-1" /> Marcar como resolvida
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
