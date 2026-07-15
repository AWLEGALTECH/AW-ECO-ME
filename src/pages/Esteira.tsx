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
  Workflow, RefreshCw, AlertTriangle, CheckCircle2, ExternalLink, X, ChevronDown, History, Search, Layers, Lock,
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
  analise_vinculada: "Vinculada Bradesco",
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
  cadastrado_por: string | null;
  observacoes: string | null;
  analise_comercial: any | null;
  // Quantas demandas downstream o cliente ja tem (analise_vinculada,
  // fluxo_artesanal, pronta_para_protocolo) — mostra no card como dica.
  // Como agora o cliente NAO sai da col 1 automaticamente, ele pode estar
  // aqui E ter pecas geradas. Esse contador deixa visivel.
  demandas_downstream: number;
}

// Design compartilhado com o Dashboard (SpotlightCard): superfícies "glassy".
// GLASS_PANEL = painel de coluna; GLASS_CARD = card de item dentro da coluna.
// Mantém a esteira visualmente coerente com o resto do sistema.
const GLASS_PANEL =
  "rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-md " +
  "shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.04)]";
const GLASS_CARD =
  "rounded-xl border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] hover:border-primary/40 transition-all duration-200";

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

// Formato curto da data de entrada, exibido junto do "X dias atras"
// no rodape do card. Ex: "04/06/26".
const fmtData = (iso: string | null): string => {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  }).format(new Date(iso));
};

export default function Esteira() {
  useEffect(() => { document.title = `Esteira Pré-Protocolo · ${appConfig.name}`; }, []);
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
        // FIFO: mais antigos no topo, recem-chegados ao final. Cada coluna
        // re-ordena pelo seu campo de entrada na fase (created_at na maioria,
        // completed_at pra 'pronta_para_protocolo').
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as DemandaEsteira[];
    },
    refetchInterval: 30_000,
  });

  // Query 2: clientes com tag 'precisa_analise_extratos' que ainda NAO
  // tiveram a "analise primaria" expressamente finalizada. Antes, o
  // criterio era "sem nenhuma demanda downstream" — o que tirava o cliente
  // automaticamente da col 1 quando a primeira analise vinculada ou peca
  // artesanal era criada. Agora o advogado decide o momento, clicando em
  // "Finalizar analise primaria" no dialog do cliente. Enquanto isso,
  // o cliente pode aparecer aqui E nas colunas seguintes em paralelo.
  const cliRes = useQuery({
    // v2: bump da chave pra descartar cache persistida (localStorage) que
    // foi salva antes de eu incluir cadastrado_por/requerido no select —
    // senao o rehydrate serve dado antigo sem esses campos (aparece "—").
    queryKey: ["esteira-clientes-analise-primaria", "v3"],
    queryFn: async (): Promise<ClienteEsteira[]> => {
      const { data: tagged, error: e1 } = await supabase
        .from("clientes")
        .select("id, nome, created_at, origem, drive_folder_url, requerido, cadastrado_por, observacoes, analise_comercial")
        .eq("precisa_analise_extratos" as any, true)
        .is("analise_primaria_finalizada_at" as any, null)
        .order("created_at", { ascending: true });
      if (e1) throw e1;
      const ids = (tagged || []).map(c => c.id);
      if (ids.length === 0) return [];
      // Conta demandas downstream pra mostrar como hint no card (deixa
      // claro que ja existem pecas em produção pra esse cliente).
      const { data: downs, error: e2 } = await supabase
        .from("demandas" as any)
        .select("cliente_id, etapa")
        .in("etapa", ["analise_vinculada", "fluxo_artesanal", "pronta_para_protocolo"])
        .neq("status", "cancelada")
        .in("cliente_id", ids);
      if (e2) throw e2;
      const contagem = new Map<string, number>();
      for (const r of (downs || []) as any[]) {
        contagem.set(r.cliente_id, (contagem.get(r.cliente_id) || 0) + 1);
      }
      return (tagged || []).map(c => ({
        ...(c as any),
        demandas_downstream: contagem.get(c.id) || 0,
      })) as ClienteEsteira[];
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
    // 'pronta_para_protocolo' eh uma demanda que TROCOU de etapa (UPDATE),
    // entao created_at nao reflete a entrada nessa fase. Re-ordena pelo
    // completed_at (timestamp do UPDATE pra pronta) com fallback created_at.
    const protosFil = protosAll
      .filter(p => !p.protocolado_at)
      .sort((a, b) => (a.completed_at || a.created_at || "").localeCompare(b.completed_at || b.created_at || ""));
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

  // REGRA DE BLOQUEIO POR PENDÊNCIA:
  // Todo cliente que tem ao menos uma pendência documental EM ABERTO
  // (etapa 'pendencia_documental' + status 'pendente') tem TODAS as suas
  // outras demandas (vinculadas, artesanais, prontas) marcadas como
  // bloqueadas — ficam visíveis, mas acinzentadas, com cadeado e ação
  // desabilitada. Ao resolver a pendência (status vira 'resolvida'), ela
  // some desta lista e as demandas voltam a ser liberadas automaticamente.
  //
  // Calculado a partir de demRes.data CRU (não do array filtrado por busca)
  // pra que o bloqueio NUNCA dependa do filtro de pesquisa — assim nenhuma
  // demanda some de vista nem fica liberada por engano quando há busca ativa.
  const clientesComPendencia = useMemo(() => {
    const s = new Set<string>();
    for (const d of (demRes.data || [])) {
      if (d.etapa === "pendencia_documental" && d.status === "pendente" && d.cliente_id) {
        s.add(d.cliente_id);
      }
    }
    return s;
  }, [demRes.data]);
  const MOTIVO_BLOQUEIO = "Bloqueada — este cliente tem uma pendência documental em aberto. Resolva a pendência na coluna 0 pra liberar.";

  // Avança uma peça artesanal direto pra "Peças prontas" (peça já no Drive).
  // Garante a demanda confeccao_peca pra uma análise vinculada (idempotente:
  // devolve o id existente se já houver). Espelha garantirConfeccaoDemanda do
  // ClienteDetail pra reaproveitar o mesmo fluxo a partir da esteira.
  const garantirConfeccaoDemanda = async (av: DemandaEsteira): Promise<string | null> => {
    const { data: existe } = await supabase
      .from("demandas" as any)
      .select("id")
      .eq("cliente_id", av.cliente_id)
      .eq("etapa", "confeccao_peca")
      .eq("analise_pai_id", av.id)
      .maybeSingle();
    if (existe) return (existe as any).id;
    const { data: nova, error } = await supabase.from("demandas" as any).insert({
      cliente_id: av.cliente_id,
      tipo: "pre_protocolo",
      etapa: "confeccao_peca",
      titulo: `Peça — ${av.desconto || "desconto"}`,
      descricao: "Confecção da peça a partir da análise vinculada.",
      desconto: av.desconto,
      status: "em_andamento",
      analise_pai_id: av.id,
      created_by: user?.id || null,
      ordem: 2,
    }).select("id").single();
    if (error) { toast.error("Erro ao criar demanda: " + error.message); return null; }
    return (nova as any).id;
  };

  // Abre o Writer pra confeccionar a peça de uma análise vinculada — mesma
  // lógica do botão "Confeccionar peça" da ficha do cliente (ClienteDetail):
  // garante a demanda confeccao_peca (idempotente) e passa o contexto completo
  // (modo=peticao + desconto + análise) pro Writer pré-preencher a qualificação,
  // sugerir o produto certo e registrar a peça no Espelho de Protocolo ao final.
  const confeccionarPecaVinculada = async (av: DemandaEsteira) => {
    const demandaId = await garantirConfeccaoDemanda(av);
    if (!demandaId) return;
    const params = new URLSearchParams({
      cliente: av.cliente_id,
      nome: av.cliente?.nome || "",
      modo: "peticao",
      desconto: av.desconto || "",
      analise_id: av.id,
      analise_url: av.peca_drive_url || "",
      demanda_id: demandaId,
    });
    navigate(`/writer?${params.toString()}`);
  };

  // Produz todas as peças de um cliente em sequência (modo cadeia) — espelha o
  // "Produzir em cadeia" da ficha do cliente. Pré-cria/recupera a demanda de
  // cada análise pendente, monta a fila e abre o Writer no primeiro item.
  const produzirCadeiaCliente = async (items: DemandaEsteira[]) => {
    if (items.length < 2) {
      toast.error("Cadeia precisa de pelo menos 2 análises pendentes.");
      return;
    }
    const fila: Array<{ demanda_id: string; analise_id: string; analise_url: string; desconto: string }> = [];
    for (const av of items) {
      const did = await garantirConfeccaoDemanda(av);
      if (!did) return;
      fila.push({
        demanda_id: did,
        analise_id: av.id,
        analise_url: av.peca_drive_url || "",
        desconto: av.desconto || "",
      });
    }
    const fila_b64 = btoa(unescape(encodeURIComponent(JSON.stringify(fila))));
    const primeiro = fila[0];
    const params = new URLSearchParams({
      cliente: items[0].cliente_id,
      nome: items[0].cliente?.nome || "",
      modo: "peticao",
      desconto: primeiro.desconto,
      analise_id: primeiro.analise_id,
      analise_url: primeiro.analise_url,
      demanda_id: primeiro.demanda_id,
      cadeia: "1",
      cadeia_pos: "1",
      cadeia_fila: fila_b64,
    });
    navigate(`/writer?${params.toString()}`);
  };


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

  // Cancela uma peça artesanal direto da esteira. Se o cliente acabar
  // sem nenhuma análise vinculada / peça artesanal viva, reabre a
  // "análise primária" (volta pra coluna 1).
  const cancelarArtesanal = async (d: DemandaEsteira) => {
    const cliId = d.cliente?.id;
    const { error } = await supabase.from("demandas" as any)
      .update({ status: "cancelada" })
      .eq("id", d.id);
    if (error) { toast.error(error.message); return; }

    if (cliId) {
      const { data: vivas } = await supabase
        .from("demandas" as any)
        .select("id")
        .eq("cliente_id", cliId)
        .in("etapa", ["analise_vinculada", "fluxo_artesanal"])
        .neq("status", "cancelada")
        .limit(1);
      if (!vivas || vivas.length === 0) {
        const { data: cli } = await supabase
          .from("clientes")
          .select("precisa_analise_extratos")
          .eq("id", cliId)
          .single();
        if ((cli as any)?.precisa_analise_extratos) {
          await supabase
            .from("clientes")
            .update({
              analise_primaria_finalizada_at: null,
              analise_primaria_finalizada_by: null,
            } as any)
            .eq("id", cliId);
          toast.info("Sem peças ativas — cliente voltou pra 'Análise primária'.");
          refetchAll();
          return;
        }
      }
    }
    toast.success("Peça cancelada");
    refetchAll();
  };

  // Marca a pendência como resolvida. Se for a ÚLTIMA pendência aberta do
  // cliente e ele não estiver em produção ativa, devolve pra fila de
  // "Análise primária" (col 1) — garantindo que ninguém fique no limbo.
  const marcarResolvida = async (d: DemandaEsteira) => {
    const { error } = await supabase.from("demandas" as any)
      .update({ status: "resolvida", completed_at: new Date().toISOString(), completed_by: user?.id || null })
      .eq("id", d.id);
    if (error) { toast.error(error.message); return; }

    const cliId = d.cliente?.id || null;
    let voltou = false;
    if (cliId) {
      const { data: abertas } = await supabase
        .from("demandas" as any)
        .select("id")
        .eq("cliente_id", cliId)
        .eq("etapa", "pendencia_documental")
        .eq("status", "pendente")
        .limit(1);
      if (!abertas || abertas.length === 0) {
        const { data: ativas } = await supabase
          .from("demandas" as any)
          .select("id")
          .eq("cliente_id", cliId)
          .in("etapa", ["analise_vinculada", "fluxo_artesanal", "pronta_para_protocolo", "confeccao_peca", "protocolada", "processual"])
          .neq("status", "cancelada")
          .limit(1);
        if (!ativas || ativas.length === 0) {
          const { data: cli } = await supabase
            .from("clientes")
            .select("precisa_analise_extratos, analise_primaria_finalizada_at")
            .eq("id", cliId)
            .single();
          const foraDaFila = !(cli as any)?.precisa_analise_extratos || !!(cli as any)?.analise_primaria_finalizada_at;
          await supabase
            .from("clientes")
            .update({
              precisa_analise_extratos: true,
              analise_primaria_finalizada_at: null,
              analise_primaria_finalizada_by: null,
            } as any)
            .eq("id", cliId);
          voltou = foraDaFila;
        }
      }
    }

    setConfirmandoResolver(false);
    setPendenciaOpen(null);
    toast.success(voltou
      ? "Pendências resolvidas — cliente voltou pra 'Análise primária'."
      : "Pendência marcada como resolvida");
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 items-start">
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
            titulo="1. Análise primária"
            descricao="Primeira análise do cliente. Só sai daqui quando o advogado clicar em 'Finalizar análise primária'."
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
                    <div className="space-y-1.5">
                      {/* Requerido (réu) — direto após o ícone, em destaque. */}
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="truncate font-medium text-foreground">
                          {c.requerido || "—"}
                        </span>
                      </span>
                      {/* Quem cadastrou — direto após o ícone. */}
                      <span className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate text-foreground/90">
                          {(c.cadastrado_por || "").trim() || "—"}
                          <span className="text-muted-foreground/70">
                            {" "}({c.origem === "writer" ? "via procuração" : "manual"})
                          </span>
                        </span>
                      </span>
                      {c.demandas_downstream > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400/90">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          {c.demandas_downstream === 1
                            ? "1 peça em produção"
                            : `${c.demandas_downstream} peças em produção`}
                        </span>
                      )}
                    </div>
                  }
                  data={c.created_at}
                  acao={c.demandas_downstream > 0 ? "Continuar / finalizar" : "Iniciar análise"}
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
                const bloqueado = clientesComPendencia.has(g.items[0].cliente_id);
                return (
                  <ClienteAccordion
                    key={key}
                    nome={g.nome}
                    count={g.items.length}
                    accent="primary"
                    expanded={expandidos.has(key)}
                    onToggle={() => toggleExpand(key)}
                    hint={g.items.length === 1 ? hint : `${g.items.length} análises vinculadas`}
                    locked={bloqueado}
                    lockedHint={MOTIVO_BLOQUEIO}
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
                        bloqueada={bloqueado}
                        motivoBloqueio={MOTIVO_BLOQUEIO}
                      />
                    ))}
                    {/* Produzir em cadeia — mesma ação da ficha do cliente:
                        gera todas as peças pendentes do cliente em sequência.
                        Some quando o cliente está bloqueado por pendência. */}
                    {g.items.length >= 2 && !bloqueado && (
                      <Button
                        size="sm"
                        onClick={() => produzirCadeiaCliente(g.items)}
                        className="w-full mt-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                        title="Gera todas as peças pendentes deste cliente em sequência, sem voltar pra esteira entre uma e outra"
                      >
                        <Layers className="h-3.5 w-3.5 mr-1.5" />
                        Produzir em cadeia ({g.items.length})
                      </Button>
                    )}
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
                const bloqueado = clientesComPendencia.has(g.items[0].cliente_id);
                return (
                  <ClienteAccordion
                    key={key}
                    nome={g.nome}
                    count={g.items.length}
                    accent="primary"
                    expanded={expandidos.has(key)}
                    onToggle={() => toggleExpand(key)}
                    hint={g.items.length === 1 ? hint : `${g.items.length} peças artesanais`}
                    locked={bloqueado}
                    lockedHint={MOTIVO_BLOQUEIO}
                  >
                    {g.items.map(d => (
                      <CardArtesanal
                        key={d.id}
                        demanda={d}
                        onAvancar={() => avancarArtesanalParaPronta(d)}
                        onCancelar={() => cancelarArtesanal(d)}
                        audit={lookupAudit(d.id)}
                        bloqueada={bloqueado}
                        motivoBloqueio={MOTIVO_BLOQUEIO}
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
                const bloqueado = clientesComPendencia.has(g.items[0].cliente_id);
                return (
                  <ClienteAccordion
                    key={key}
                    nome={g.nome}
                    count={g.items.length}
                    accent="primary"
                    expanded={expandidos.has(key)}
                    onToggle={() => toggleExpand(key)}
                    hint={g.items.length === 1 ? firstTitle : `${g.items.length} peças prontas`}
                    locked={bloqueado}
                    lockedHint={MOTIVO_BLOQUEIO}
                  >
                    {g.items.map(d => (
                      <CardBotaoLinha
                        key={d.id}
                        onClick={() => abrirEspelho(d)}
                        titulo={d.desconto || d.titulo.replace(/^Pronto pra protocolo — /, "")}
                        data={d.completed_at || d.created_at}
                        acao="Abrir espelho"
                        acaoIcon={Send}
                        accent="primary"
                        audit={lookupAudit(d.id)}
                        bloqueada={bloqueado}
                        motivoBloqueio={MOTIVO_BLOQUEIO}
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
        cliente={inicioCliente ? {
          id: inicioCliente.id,
          nome: inicioCliente.nome,
          drive_folder_url: inicioCliente.drive_folder_url,
          observacoes: inicioCliente.observacoes,
          requerido: inicioCliente.requerido,
          cadastrado_por: inicioCliente.cadastrado_por,
          origem: inicioCliente.origem,
          demandas_downstream: inicioCliente.demandas_downstream,
          analise_comercial: inicioCliente.analise_comercial,
        } : null}
        userId={user?.id || null}
        onCreated={refetchAll}
        permitirFinalizarPrimaria
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
              onClick={(e) => { e.preventDefault(); if (pendenciaOpen) marcarResolvida(pendenciaOpen); }}
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
        <DialogContent className="sm:max-w-md max-h-[88dvh] overflow-y-auto">
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
                const av = vincAcoes;
                setVincAcoes(null);
                if (av?.cliente_id) confeccionarPecaVinculada(av);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClienteAccordion({
  nome, count, accent, expanded, onToggle, hint, children, locked, lockedHint,
}: {
  nome: string;
  count: number;
  accent: "amber" | "primary";
  expanded: boolean;
  onToggle: () => void;
  hint?: string;
  children: React.ReactNode;
  // locked = cliente com pendência: tinge o grupo de âmbar e mostra cadeado,
  // pra ficar óbvio (mesmo colapsado) que essas demandas estão bloqueadas.
  locked?: boolean;
  lockedHint?: string;
}) {
  const accentBorder = locked
    ? "border-amber-400/40"
    : accent === "amber" ? "border-amber-400/30 hover:border-amber-400/60" : "border-white/[0.07] hover:border-primary/40";
  const accentBg = locked ? "bg-amber-400/[0.04]" : accent === "amber" ? "bg-amber-400/5 hover:bg-amber-400/10" : "bg-white/[0.03] hover:bg-white/[0.06]";
  const accentBadge = accent === "amber" ? "text-amber-400 bg-amber-400/15 border-amber-400/30" : "text-primary bg-primary/15 border-primary/30";
  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${accentBorder} ${expanded ? "bg-white/[0.02]" : accentBg} ${locked ? "opacity-80" : ""}`}
      title={locked ? (lockedHint || "Bloqueado por pendência") : undefined}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 text-left"
      >
        {locked
          ? <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          : <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <span className="text-xs font-semibold truncate flex-1">{nome}</span>
        <span className={`inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full border text-[10px] font-bold tabular-nums shrink-0 ${accentBadge}`}>
          {count}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {locked && (
        <div className="px-3 pb-2 -mt-1">
          <p className="text-[11px] text-amber-400/90 line-clamp-1 inline-flex items-center gap-1">
            <Lock className="h-2.5 w-2.5 shrink-0" /> Bloqueado por pendência
          </p>
        </div>
      )}
      {!expanded && hint && !locked && (
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
  const chipClass = cor === "amber"
    ? "bg-amber-400/10 ring-amber-400/25 text-amber-400"
    : "bg-primary/10 ring-primary/25 text-primary";
  const badgeClass = cor === "amber"
    ? "text-amber-400 bg-amber-400/15 border-amber-400/30"
    : "text-primary bg-primary/15 border-primary/30";
  return (
    <div className={`relative ${GLASS_PANEL} p-4 space-y-3 min-w-0`}>
      {/* Fio superior sutil — mesma assinatura do SpotlightCard do dash */}
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-2xl bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="flex items-center gap-2.5">
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ring-1 ${chipClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold truncate flex-1 min-w-0">{titulo}</h3>
        <span className={`inline-flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full border text-[11px] font-bold tabular-nums shrink-0 ${badgeClass}`}>
          {count}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">{descricao}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Vazio() {
  return (
    <div className="text-[12px] italic text-muted-foreground/60 px-3 py-6 text-center border border-dashed border-white/[0.08] rounded-xl">
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
      className={`block ${GLASS_CARD} p-3 group`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <User className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold truncate">{titulo}</span>
      </div>
      <p className="text-[12px] text-foreground/80 line-clamp-2 mb-2">{sub}</p>
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-2.5 w-2.5" />
          <span>{tempoDecorrido(data)}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="tabular-nums">{fmtData(data)}</span>
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
  bloqueada = false, motivoBloqueio,
}: {
  onClick: () => void;
  titulo: string;
  data: string | null;
  acao: string;
  acaoIcon?: any;
  accent?: "primary" | "amber";
  audit?: AuditInfo;
  bloqueada?: boolean;
  motivoBloqueio?: string;
}) {
  const accentText = accent === "amber" ? "text-amber-400" : "text-primary";
  // Bloqueada: card permanece VISÍVEL (nada some), mas acinzentado, com
  // cadeado e sem ação — só leitura. title mostra o motivo ao passar o mouse.
  if (bloqueada) {
    return (
      <div
        title={motivoBloqueio || "Bloqueada"}
        aria-disabled="true"
        className="block w-full text-left rounded-xl border border-dashed border-amber-400/30 bg-muted/20 p-3 opacity-60 cursor-not-allowed select-none"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Lock className="h-3 w-3 text-amber-400 shrink-0" />
          <span className="text-xs font-semibold truncate">{titulo}</span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            <span>{tempoDecorrido(data)}</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="tabular-nums">{fmtData(data)}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400/90">
            <Lock className="h-3 w-3" /> Bloqueada
          </span>
        </div>
        <AuditFooter audit={audit} />
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`block w-full text-left ${GLASS_CARD} p-3 group`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <User className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold truncate">{titulo}</span>
      </div>
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-2.5 w-2.5" />
          <span>{tempoDecorrido(data)}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="tabular-nums">{fmtData(data)}</span>
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
      className={`w-full text-left ${GLASS_CARD} p-3 group`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <User className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-xs font-semibold truncate">{titulo}</span>
      </div>
      <div className="text-[12px] text-foreground/80 line-clamp-2 mb-2">{sub}</div>
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-2.5 w-2.5" />
          <span>{tempoDecorrido(data)}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="tabular-nums">{fmtData(data)}</span>
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
function CardArtesanal({ demanda, onAvancar, onCancelar, audit, bloqueada = false, motivoBloqueio }: { demanda: DemandaEsteira; onAvancar: () => void; onCancelar: () => void; audit?: AuditInfo; bloqueada?: boolean; motivoBloqueio?: string }) {
  const [open, setOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const navigate = useNavigate();
  const drive = demanda.cliente?.drive_folder_url;
  const nomeCliente = demanda.cliente?.nome || "cliente";
  const handleConfirm = () => {
    setOpen(false);
    onAvancar();
  };
  const handleCancel = () => {
    setOpen(false);
    setConfirmCancel(false);
    onCancelar();
  };
  // Bloqueada: card visível, acinzentado, com cadeado, sem abrir o dialog.
  if (bloqueada) {
    return (
      <div
        title={motivoBloqueio || "Bloqueada"}
        aria-disabled="true"
        className="w-full text-left rounded-xl border border-dashed border-amber-400/30 bg-muted/20 p-3 opacity-60 cursor-not-allowed select-none"
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Lock className="h-3 w-3 text-amber-400 shrink-0" />
          <span className="text-xs font-semibold truncate">
            {demanda.desconto || demanda.titulo}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            <span>{tempoDecorrido(demanda.created_at)}</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="tabular-nums">{fmtData(demanda.created_at)}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400/90">
            <Lock className="h-3 w-3" /> Bloqueada
          </span>
        </div>
        <AuditFooter audit={audit} />
      </div>
    );
  }
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`w-full text-left ${GLASS_CARD} p-3 group`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Hammer className="h-3 w-3 text-primary shrink-0" />
          <span className="text-xs font-semibold truncate">
            {demanda.desconto || demanda.titulo}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-2.5 w-2.5" />
            <span>{tempoDecorrido(demanda.created_at)}</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="tabular-nums">{fmtData(demanda.created_at)}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary group-hover:gap-1.5 transition-all">
            Concluir peça <Send className="h-3 w-3" />
          </span>
        </div>
        <AuditFooter audit={audit} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[88dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Hammer className="h-5 w-5 text-primary" />
              {nomeCliente}
            </DialogTitle>
            <DialogDescription>Peça artesanal</DialogDescription>
          </DialogHeader>

          {/* Especificacao da peca (digitada por quem iniciou o fluxo).
              Aparece como um aviso pro advogado saber o que produzir. */}
          {demanda.descricao && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-[0.15em] text-primary/80 font-semibold mb-1">
                Especificação da peça
              </p>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
                {demanda.descricao}
              </p>
            </div>
          )}

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

            <button
              onClick={() => setConfirmCancel(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/70 hover:text-red-400 transition-colors py-2 mt-1"
            >
              <X className="h-3 w-3" /> Cancelar esta peça
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar esta peça artesanal?</AlertDialogTitle>
            <AlertDialogDescription>
              A peça <strong>{demanda.desconto || demanda.titulo}</strong> sai da esteira. Ela continua aparecendo riscada na ficha do cliente pra histórico. Se este for o último item ativo do cliente, ele volta pra "Análise primária".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-red-600 hover:bg-red-500">
              Cancelar peça
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
      className="w-full text-left rounded-xl border border-amber-400/30 bg-amber-400/5 hover:border-amber-400/60 hover:bg-amber-400/10 transition-all duration-200 p-3 space-y-1.5"
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
          <Clock className="h-2.5 w-2.5" />
          <span>{tempoDecorrido(demanda.created_at)}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="tabular-nums">{fmtData(demanda.created_at)}</span>
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
      <DialogContent className="max-w-md max-h-[88dvh] overflow-y-auto">
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
            <Clock className="h-3 w-3" /> Aberta {tempoDecorrido(demanda.created_at)} <span className="text-muted-foreground/50">·</span> <span className="tabular-nums">{fmtData(demanda.created_at)}</span>
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
