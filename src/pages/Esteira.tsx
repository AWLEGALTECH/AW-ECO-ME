import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  ScanSearch, GitBranch, Send, ArrowRight, Clock, User, PenSquare, Hammer, Building2,
  Workflow, RefreshCw, AlertTriangle, CheckCircle2, ExternalLink, X, ChevronDown, History, Search,
} from "lucide-react";
import { appConfig } from "@/config/app-config";
import { EsteiraInicioDialog, TIPOS_PENDENCIA } from "@/components/EsteiraInicioDialog";
import { DriveFolderButton } from "@/components/DriveFolderButton";
import { AcaoCard } from "@/components/AcaoCard";
import { EspelhoProtocoloDialog, type Cliente as ClienteCheia, type Demanda as DemandaCheia } from "@/pages/ClienteDetail";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface AuditInfo {
  who: string;
  when: string;
  verbo: "criou" | "moveu";
  de?: string;
  para?: string;
}

// Rotulos curtos das etapas pra exibir no log do card.
const ETAPA_LABEL: Record<string, string> = {
  analise_documental: "Análise",
  analise_vinculada: "Vinculada",
  fluxo_artesanal: "Artesanal",
  pronta_para_protocolo: "Pronta",
  pendencia_documental: "Pendência",
};

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
  cliente: { id: string; nome: string; drive_folder_url?: string | null; cadastrado_por?: string | null } | null;
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
  // Sub-popup ao clicar em card de Analise Vinculada — antes de levar pro
  // perfil do cliente, oferece tambem o atalho pra abrir a analise no Finder
  // (continuar a triagem) ou pular pra Writer (confeccionar a peca).
  const [vincAcoes, setVincAcoes] = useState<DemandaEsteira | null>(null);
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
        .select("id, etapa, status, titulo, desconto, descricao, pendencia_tipo, analise_pai_id, peca_drive_url, protocolado_at, created_at, completed_at, cliente_id, cliente:clientes(id, nome, drive_folder_url, cadastrado_por)")
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
      // Cliente sai de "Aguardando" assim que tem uma demanda em QUALQUER
      // etapa downstream (vinculada, artesanal, peca pronta, pendencia)
      // que nao esteja cancelada. Antes so checava vinculada/artesanal, o
      // que deixava clientes aparecerem em col 1 E col 4 simultaneamente
      // quando a peca avancava direto pra "pronta_para_protocolo".
      const { data: vincs, error: e2 } = await supabase
        .from("demandas" as any)
        .select("cliente_id")
        .in("etapa", ["analise_vinculada", "fluxo_artesanal", "pronta_para_protocolo", "pendencia_documental"])
        .neq("status", "cancelada")
        .in("cliente_id", ids);
      if (e2) throw e2;
      const comVinc = new Set((vincs || []).map((v: any) => v.cliente_id));
      return (tagged || []).filter(c => !comVinc.has(c.id)) as ClienteEsteira[];
    },
    refetchInterval: 30_000,
  });

  // Query 3: audit log das demandas visiveis — pra mostrar "movido por X
  // ha Y" no card. Pega o evento mais recente onde houve mudanca de etapa
  // (ou a criacao, se nunca foi movida).
  // IMPORTANTE: retorna Record<string, AuditInfo> (nao Map) pq o
  // PersistQueryClientProvider salva tudo no localStorage como JSON, e
  // Map nao serializa — vira {} no rehydrate e quebra .get() ao recarregar.
  // Mesma armadilha que tive em Publicacoes.
  const auditRes = useQuery({
    queryKey: ["esteira-audit", (demRes.data || []).map(d => d.id).sort().join(",")],
    enabled: !!demRes.data && demRes.data.length > 0,
    queryFn: async (): Promise<Record<string, AuditInfo>> => {
      const dems = demRes.data || [];
      const ids = dems.map(d => d.id);
      const out: Record<string, AuditInfo> = {};
      if (ids.length === 0) return out;
      // Fallback por demanda: se o audit_log nao tem user_email (caso de
      // demanda criada via SECURITY DEFINER ou funcao sem auth.uid()),
      // usa o cadastrado_por do cliente. Garante que TODO card mostra
      // algum responsavel.
      const fallbackPorDemanda: Record<string, string> = {};
      for (const d of dems) {
        const cp = (d.cliente as any)?.cadastrado_por;
        if (cp) fallbackPorDemanda[d.id] = String(cp).trim();
      }
      const { data } = await supabase
        .from("audit_log" as any)
        .select("resource_id, user_email, created_at, action, diff")
        .eq("resource_type", "demandas")
        .in("resource_id", ids)
        .order("created_at", { ascending: false })
        .limit(1000);
      for (const row of (data || []) as any[]) {
        const id = row.resource_id as string;
        if (out[id]) continue;
        const emailPart = (row.user_email || "").split("@")[0].trim();
        const who = emailPart || fallbackPorDemanda[id] || "Sistema";
        const etapaDiff = row.diff?.etapa;
        if (row.action === "create") {
          out[id] = { who, when: row.created_at, verbo: "criou" };
        } else if (etapaDiff) {
          out[id] = {
            who,
            when: row.created_at,
            verbo: "moveu",
            de: etapaDiff.before,
            para: etapaDiff.after,
          };
        }
      }
      // Garante entrada pra demandas sem nenhum audit (raro — significa que
      // o trigger nao rodou). Usa cadastrado_por + created_at da demanda.
      for (const d of dems) {
        if (out[d.id]) continue;
        out[d.id] = {
          who: fallbackPorDemanda[d.id] || "Sistema",
          when: d.created_at,
          verbo: "criou",
        };
      }
      return out;
    },
    refetchInterval: 30_000,
  });

  // Helper defensivo: aceita Record OU Map (legado, pra cache antigo que
  // ainda nao foi descartado pelo buster).
  const lookupAudit = (id: string | undefined | null): AuditInfo | undefined => {
    if (!id) return undefined;
    const d: any = auditRes.data;
    if (!d) return undefined;
    if (typeof d.get === "function") return d.get(id);
    return d[id];
  };

  const refetchAll = () => { demRes.refetch(); cliRes.refetch(); auditRes.refetch(); };
  const isLoading = demRes.isLoading || cliRes.isLoading;
  const isFetching = demRes.isFetching || cliRes.isFetching;

  // Particiona + aplica filtro de busca (nome do cliente, titulo, desconto
  // ou descricao da demanda). Case-insensitive, sem acentos.
  const [busca, setBusca] = useState("");
  const normalizar = (s: string | null | undefined) =>
    (s || "").toString().normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const { pendencias, aguardando, vincs, artesanais, protos, totalSemFiltro } = useMemo(() => {
    const dem = demRes.data || [];
    const pendenciasAll = dem.filter(d => d.etapa === "pendencia_documental");
    const vincsAll = dem.filter(d => d.etapa === "analise_vinculada");
    const artesanaisAll = dem.filter(d => d.etapa === "fluxo_artesanal");
    const protosAll = dem.filter(d => d.etapa === "pronta_para_protocolo");
    const protoIds = new Set(protosAll.map(p => p.analise_pai_id).filter(Boolean));
    const vincsFil = vincsAll.filter(v => !protoIds.has(v.id));
    const artesFil = artesanaisAll.filter(a => !protoIds.has(a.id));
    const protosFil = protosAll.filter(p => !p.protocolado_at);
    const aguarAll = cliRes.data || [];
    const totalAntesFiltro = pendenciasAll.length + aguarAll.length + vincsFil.length + artesFil.length + protosFil.length;

    const q = normalizar(busca).trim();
    if (!q) {
      return {
        pendencias: pendenciasAll,
        aguardando: aguarAll,
        vincs: vincsFil,
        artesanais: artesFil,
        protos: protosFil,
        totalSemFiltro: totalAntesFiltro,
      };
    }
    const demandaBate = (d: DemandaEsteira) =>
      normalizar(d.cliente?.nome).includes(q) ||
      normalizar(d.titulo).includes(q) ||
      normalizar(d.desconto).includes(q) ||
      normalizar(d.descricao).includes(q);
    const clienteBate = (c: ClienteEsteira) =>
      normalizar(c.nome).includes(q) ||
      normalizar(c.requerido).includes(q) ||
      normalizar(c.observacoes).includes(q);
    return {
      pendencias: pendenciasAll.filter(demandaBate),
      aguardando: aguarAll.filter(clienteBate),
      vincs: vincsFil.filter(demandaBate),
      artesanais: artesFil.filter(demandaBate),
      protos: protosFil.filter(demandaBate),
      totalSemFiltro: totalAntesFiltro,
    };
  }, [demRes.data, cliRes.data, busca]);

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
            Visão unificada de tudo pendente em produção. Total:{" "}
            <strong className="text-foreground">{total}</strong>
            {busca.trim() && totalSemFiltro !== total ? (
              <> de {totalSemFiltro}</>
            ) : null}
            {" "}item{total === 1 ? "" : "s"}{busca.trim() ? " (filtrado)" : ""}.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetchAll} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome do cliente, requerido, desconto ou descrição…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="pl-9 h-10"
        />
        {busca && (
          <button
            onClick={() => setBusca("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            title="Limpar busca"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

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
                      <PendenciaCard key={p.id} demanda={p} onClick={() => setPendenciaOpen(p)} audit={lookupAudit(p.id)} />
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
                      <CardBotaoLinha
                        key={d.id}
                        onClick={() => setVincAcoes(d)}
                        titulo={d.desconto || d.titulo}
                        data={d.created_at}
                        acao="Ver opções"
                        acaoIcon={PenSquare}
                        audit={lookupAudit(d.id)}
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
                        audit={lookupAudit(d.id)}
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
                        audit={lookupAudit(d.id)}
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

      {/* Sub-popup do card de Analise Vinculada: oferece atalhos pra
          (1) ficha do cliente, (2) Finder pra continuar a triagem,
          (3) Writer pra confeccionar a peca. Antes era um Link direto
          pro perfil, agora deixa o usuario escolher o destino. */}
      <Dialog open={!!vincAcoes} onOpenChange={(v) => !v && setVincAcoes(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-primary" />
              {vincAcoes?.cliente?.nome || "Análise vinculada"}
            </DialogTitle>
            <DialogDescription className="line-clamp-2">
              {vincAcoes?.desconto || vincAcoes?.titulo}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-1">
            <AcaoCard
              icon={User}
              titulo="Abrir ficha do cliente"
              hint="Dados, demandas e histórico completo"
              disabled={!vincAcoes?.cliente?.id}
              onClick={() => {
                const id = vincAcoes?.cliente?.id;
                setVincAcoes(null);
                if (id) navigate(`/clientes/${id}?aba=demandas`);
              }}
            />
            <AcaoCard
              icon={ScanSearch}
              titulo="Abrir análise no Finder"
              hint="Continuar triagem documental"
              disabled={!vincAcoes?.cliente?.id}
              onClick={() => {
                const cli = vincAcoes?.cliente;
                setVincAcoes(null);
                if (cli?.id && cli.nome) navigate(`/finder?cliente=${cli.id}&nome=${encodeURIComponent(cli.nome)}`);
              }}
            />
            <AcaoCard
              icon={PenSquare}
              titulo="Confeccionar peça no Writer"
              hint="Gerar inicial pra essa análise"
              variant="primary"
              disabled={!vincAcoes?.cliente?.id}
              onClick={() => {
                const cli = vincAcoes?.cliente;
                setVincAcoes(null);
                if (cli?.id && cli.nome) navigate(`/writer?cliente=${cli.id}&nome=${encodeURIComponent(cli.nome)}`);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
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


// Mostra "moveu por X · ha Y" baseado no audit_log. Aparece em cada card
// que tem demanda. Se vier sem audit (ainda carregando ou sem registro),
// renderiza nada.
function AuditFooter({ audit }: { audit?: AuditInfo }) {
  if (!audit) return null;
  const verbo = audit.verbo === "criou" ? "criou" : "moveu";
  const para = audit.para ? ETAPA_LABEL[audit.para] || audit.para : null;
  // Belt-and-suspenders: se por qualquer razao chegar who vazio ou "—",
  // exibe "Sistema" em vez de deixar a linha sem nome.
  const whoLimpo = (audit.who || "").trim();
  const who = whoLimpo && whoLimpo !== "—" ? whoLimpo : "Sistema";
  return (
    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70 pt-1 truncate">
      <History className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">
        <span className="font-medium text-foreground/70">{who}</span>{" "}
        {verbo}
        {para && verbo === "moveu" && <> → <span className="text-foreground/60">{para}</span></>}
        {" · "}
        {tempoDecorrido(audit.when)}
      </span>
    </div>
  );
}

function CardLinha({
  to, titulo, sub, data, acao, acaoIcon: AcaoIcon = ArrowRight, accent = "primary", audit,
}: {
  to: string;
  titulo: string;
  sub: string;
  data: string | null;
  acao: string;
  acaoIcon?: any;
  accent?: "primary" | "amber";
  audit?: AuditInfo;
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
      <AuditFooter audit={audit} />
    </Link>
  );
}

// Versao botao do CardLinha — usada quando o clique nao navega mas abre
// um dialog (ex: espelho de protocolo na coluna "Pecas Prontas").
function CardBotaoLinha({
  onClick, titulo, data, acao, acaoIcon: AcaoIcon = ArrowRight, accent = "primary", audit,
}: {
  onClick: () => void;
  titulo: string;
  data: string | null;
  acao: string;
  acaoIcon?: any;
  accent?: "primary" | "amber";
  audit?: AuditInfo;
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
      <AuditFooter audit={audit} />
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
function CardArtesanal({ demanda, onAvancar, audit }: { demanda: DemandaEsteira; onAvancar: () => void; audit?: AuditInfo }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
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
        <AuditFooter audit={audit} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Hammer className="h-5 w-5 text-primary" />
              {nomeCliente}
            </DialogTitle>
            <DialogDescription>Peça artesanal — {demanda.desconto || demanda.titulo}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2 pt-1">
            {demanda.cliente && (
              <AcaoCard
                icon={User}
                titulo="Abrir ficha do cliente"
                hint="Dados, demandas e histórico completo"
                onClick={() => {
                  const id = demanda.cliente!.id;
                  setOpen(false);
                  navigate(`/clientes/${id}?aba=demandas`);
                }}
              />
            )}
            {demanda.cliente && drive && (
              <AcaoCard
                icon={Building2}
                titulo="Abrir pasta no Drive"
                hint="Suba o .docx da peça aqui antes de confirmar"
                href={drive}
                external
                acaoIcon={ExternalLink}
              />
            )}
            {/* Sem URL: ainda usa o botao que cria a pasta */}
            {demanda.cliente && !drive && (
              <DriveFolderButton
                clienteId={demanda.cliente.id}
                clienteNome={nomeCliente}
                driveFolderUrl={drive}
              />
            )}
            <AcaoCard
              icon={Send}
              titulo="Concluir peça artesanal"
              hint="Move o card pra Peças prontas"
              variant="sucesso"
              onClick={handleConfirm}
            />
          </div>
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

function PendenciaCard({ demanda, onClick, audit }: { demanda: DemandaEsteira; onClick: () => void; audit?: AuditInfo }) {
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
      <AuditFooter audit={audit} />
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
  const navigate = useNavigate();
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
            {demanda.cliente?.nome || "Cliente"}
          </DialogTitle>
          <DialogDescription>Pendência documental — {tipoLabel}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Box informativa: contexto da pendencia (especifico desse dialog) */}
          {(mostrarMateria || comarca || obsLimpa) && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 px-3 py-2.5 space-y-2">
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
          )}

          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> Aberta {tempoDecorrido(demanda.created_at)}
          </div>

          {/* Acoes padronizadas */}
          <div className="space-y-2">
            {demanda.cliente?.id && (
              <AcaoCard
                icon={User}
                titulo="Abrir ficha do cliente"
                hint="Dados, demandas e histórico completo"
                onClick={() => {
                  const id = demanda.cliente!.id;
                  onClose();
                  navigate(`/clientes/${id}?aba=demandas`);
                }}
              />
            )}
            {demanda.cliente?.id && driveUrl && (
              <AcaoCard
                icon={Building2}
                titulo="Abrir pasta no Drive"
                hint="Subir o documento que tá faltando"
                href={driveUrl}
                external
                acaoIcon={ExternalLink}
              />
            )}
            {/* Sem URL do Drive: usa o componente original que cria a pasta */}
            {demanda.cliente?.id && !driveUrl && (
              <DriveFolderButton
                clienteId={demanda.cliente.id}
                clienteNome={demanda.cliente.nome}
                driveFolderUrl={driveUrl}
              />
            )}
            <AcaoCard
              icon={CheckCircle2}
              titulo="Marcar como resolvida"
              hint="Documento já está no Drive, tira da fila"
              variant="sucesso"
              onClick={onResolver}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
