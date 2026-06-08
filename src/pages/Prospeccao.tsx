import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Target, RefreshCw, Plus, Search, X, MessageCircle, Phone, Instagram, ExternalLink,
  MapPin, Clock, Star, TrendingUp, ArrowRight, ArrowLeft, History,
  Globe, Trophy, Ban, Mail, Upload, Layers, ChevronDown, ChevronUp, User, Filter,
  Calendar, UserCheck, Square, CheckSquare, MessageSquareText, Send, Workflow,
  FileSpreadsheet, FileText, Loader2,
} from "lucide-react";
import { appConfig } from "@/config/app-config";
import { parseLeads, type LeadParsed } from "@/lib/leadParser";
import { parsePlanilhaPadrao } from "@/lib/planilhaParser";
import { statusHorario, resumoHoje, semanaFormatada, horarioLimpo } from "@/lib/horario";
import { useUserDisplayNames } from "@/hooks/useUserDisplayNames";
import { useMensagensProntas } from "@/hooks/useMensagensProntas";
import { MinhasMensagensDialog } from "@/components/MinhasMensagensDialog";
import { iconePorNicho, NICHOS_SUGERIDOS } from "@/lib/nichos";

type Estagio = "aguardando_contato" | "em_cadencia" | "respondeu" | "diagnostico" | "proposta" | "follow_up" | "ganho" | "perdido";

const ESTAGIOS_ORDEM: Estagio[] = [
  "aguardando_contato", "em_cadencia", "respondeu", "diagnostico", "proposta",
];

const ESTAGIO_META: Record<Estagio, { label: string; cor: "primary" | "amber" | "emerald" | "red"; hint: string; acaoLabel: string }> = {
  aguardando_contato: { label: "Aguardando contato",  cor: "amber",   hint: "Leads frios — primeiro contato ainda nao feito.",        acaoLabel: "Iniciar cadencia" },
  em_cadencia:        { label: "Cadência iniciada",   cor: "primary", hint: "Mensagens (Insta/Zap/Call) enviadas, aguardando resposta.", acaoLabel: "Marcar como respondido" },
  respondeu:          { label: "Número do decisor adquirido", cor: "primary", hint: "Decisor identificado — registre o número direto de quem decide.", acaoLabel: "Agendar diagnóstico" },
  diagnostico:        { label: "Call de diagnóstico agendada", cor: "primary", hint: "Defina data e hora da call de diagnóstico.",               acaoLabel: "Avançar pra proposta" },
  proposta:           { label: "Call de proposta agendada",    cor: "primary", hint: "Defina data e hora da call de proposta.",                  acaoLabel: "Marcar ganho" },
  follow_up:          { label: "Follow-up",           cor: "amber",   hint: "Leads aguardando retorno em data agendada.",              acaoLabel: "" },
  ganho:              { label: "Ganho",               cor: "emerald", hint: "Conversao confirmada.",                                   acaoLabel: "" },
  perdido:            { label: "Perdido",             cor: "red",     hint: "Lead descartado / sem fit.",                              acaoLabel: "" },
};

interface Prospect {
  id: string;
  nome: string;
  telefone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  email: string | null;
  google_maps_url: string | null;
  site: string | null;
  avaliacao: number | null;
  horario_funcionamento: string | null;
  endereco: string | null;
  estagio: Estagio;
  status: "ativo" | "arquivado";
  nicho: string | null;
  observacoes: string | null;
  telefone_decisor: string | null;
  diagnostico_call_at: string | null;
  proposta_call_at: string | null;
  entrou_na_etapa_at: string;
  follow_up_at: string | null;
  responsavel_id: string | null;
  responsavel_email: string | null;
  created_at: string;
}

const diasNaEtapa = (iso: string): number =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));

const tempoNaEtapa = (iso: string): string => {
  const d = diasNaEtapa(iso);
  if (d === 0) return "hoje";
  if (d === 1) return "1 dia";
  return `${d} dias`;
};

// Formato curto pra exibir data+hora de call agendada no card.
const fmtCallCurto = (iso: string): string =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// Mostra "amanhã 14:00", "em 3d", "vencido há 2d" pra leads em follow-up.
const fmtFollowUp = (iso: string): string => {
  const target = new Date(iso);
  const ms = target.getTime() - Date.now();
  const dias = Math.round(ms / 86400000);
  const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(target);
  if (dias < -1) return `vencido há ${Math.abs(dias)}d`;
  if (dias === -1) return "vencido ontem";
  if (dias === 0) return `hoje ${hora}`;
  if (dias === 1) return `amanhã ${hora}`;
  if (dias < 7) return `em ${dias} dias (${hora})`;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(target);
};

export default function Prospeccao() {
  useEffect(() => { document.title = `Prospecção — ${appConfig.name}`; }, []);
  const { user } = useAuth();
  const [inserirOpen, setInserirOpen] = useState(false);
  const [mensagensOpen, setMensagensOpen] = useState(false);
  const [detalheOpen, setDetalheOpen] = useState<Prospect | null>(null);
  const [busca, setBusca] = useState("");
  // Filtro multi-select por responsavel. Set de user_ids. Set vazio = sem filtro.
  // Regra: 'aguardando_contato' SEMPRE aparece full (fila de entrada compartilhada).
  const [filtroResp, setFiltroResp] = useState<Set<string>>(new Set());

  const q = useQuery({
    queryKey: ["prospeccao-prospects"],
    queryFn: async (): Promise<Prospect[]> => {
      const { data, error } = await supabase
        .from("prospects" as any)
        .select("*")
        .eq("status", "ativo")
        .order("entrou_na_etapa_at", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return (data || []) as unknown as Prospect[];
    },
    refetchInterval: 30_000,
  });

  // Movimentacao por arrastar (drag-and-drop). Mesma logica do mover()
  // do popup, mas sem fechar dialog. Carimba responsavel quando lead
  // sai de 'aguardando_contato' pra 'em_cadencia' a primeira vez.
  const moverPorDrag = async (prospectId: string, paraEstagio: Estagio, paraNicho?: string | null) => {
    const p = (q.data || []).find(x => x.id === prospectId);
    if (!p) return;
    const mudaEstagio = p.estagio !== paraEstagio;
    const mudaNicho = paraNicho !== undefined && (p.nicho || "") !== (paraNicho || "");
    if (!mudaEstagio && !mudaNicho) return;
    const carimbar =
      p.estagio === "aguardando_contato" && paraEstagio === "em_cadencia" && !p.responsavel_id && user?.id;
    const patch: Record<string, unknown> = {};
    if (mudaEstagio) { patch.estagio = paraEstagio; patch.ultimo_contato_at = new Date().toISOString(); }
    if (mudaNicho) patch.nicho = paraNicho || null;
    if (carimbar) {
      patch.responsavel_id = user!.id;
      patch.responsavel_email = user!.email || null;
    }
    const { error } = await supabase.from("prospects" as any).update(patch).eq("id", prospectId);
    if (error) { toast.error(error.message); return; }
    if (mudaEstagio) {
      await supabase.from("prospect_eventos" as any).insert({
        prospect_id: prospectId,
        tipo: "movido",
        de_estagio: p.estagio,
        para_estagio: paraEstagio,
        user_id: user?.id || null,
        user_email: user?.email || null,
      });
      toast.success(`Movido para "${ESTAGIO_META[paraEstagio].label}".`);
    } else {
      toast.success(`Nicho atualizado para "${paraNicho || "—"}".`);
    }
    q.refetch();
  };

  const normalizar = (s: string | null | undefined) =>
    (s || "").toString().normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const filtrados = useMemo(() => {
    let lista = q.data || [];
    // Filtro por responsavel: 'aguardando_contato' sempre passa (fila comum);
    // pras demais colunas, so passa se o responsavel esta na selecao.
    if (filtroResp.size > 0) {
      lista = lista.filter(p =>
        p.estagio === "aguardando_contato" ||
        (p.responsavel_id && filtroResp.has(p.responsavel_id))
      );
    }
    const t = normalizar(busca).trim();
    if (!t) return lista;
    return lista.filter(p =>
      normalizar(p.nome).includes(t) ||
      normalizar(p.telefone).includes(t) ||
      normalizar(p.instagram).includes(t) ||
      normalizar(p.nicho).includes(t)
    );
  }, [q.data, busca, filtroResp]);

  const total = filtrados.length;
  const totalSemFiltro = (q.data || []).length;

  const porEstagio = useMemo(() => {
    const grupos: Record<Estagio, Prospect[]> = {
      aguardando_contato: [], em_cadencia: [], respondeu: [],
      diagnostico: [], proposta: [], follow_up: [], ganho: [], perdido: [],
    };
    for (const p of filtrados) grupos[p.estagio].push(p);
    // Follow-up: ordena pela data agendada mais próxima primeiro
    grupos.follow_up.sort((a, b) => (a.follow_up_at || "").localeCompare(b.follow_up_at || ""));
    return grupos;
  }, [filtrados]);

  // Conversao do funil ativo (ignora ganho/perdido)
  const conversao = useMemo(() => {
    const ativos = ESTAGIOS_ORDEM.reduce((acc, e) => acc + porEstagio[e].length, 0);
    const ganhos = porEstagio.ganho.length;
    const perdidos = porEstagio.perdido.length;
    const totalFunil = ativos + ganhos + perdidos;
    const taxa = totalFunil > 0 ? Math.round((ganhos / totalFunil) * 100) : 0;
    return { ativos, ganhos, perdidos, taxa };
  }, [porEstagio]);

  return (
    <div className="space-y-6 max-w-7xl">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Target className="h-6 w-6 text-primary" />
            Prospecção
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pipeline de leads frios. <strong className="text-foreground">{total}</strong>
            {busca.trim() && total !== totalSemFiltro && <> de {totalSemFiltro}</>} leads ativos
            {conversao.ganhos > 0 && <> · <span className="text-emerald-400">{conversao.ganhos} ganhos</span></>}
            {conversao.perdidos > 0 && <> · <span className="text-muted-foreground">{conversao.perdidos} perdidos</span></>}
            {conversao.taxa > 0 && <> · {conversao.taxa}% de conversão</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${q.isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMensagensOpen(true)}>
            <MessageSquareText className="h-3.5 w-3.5 mr-1.5" />
            Minhas mensagens
          </Button>
          <Button size="sm" onClick={() => setInserirOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Inserir leads
          </Button>
        </div>
      </header>

      <Tabs defaultValue="pipeline" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pipeline" className="gap-1.5">
            <Layers className="h-3.5 w-3.5" /> Pipeline
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5">
            <History className="h-3.5 w-3.5" /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, telefone, instagram ou nicho..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9 h-10"
              />
              {busca && (
                <button
                  onClick={() => setBusca("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <FiltroResponsavelBtn
              filtroResp={filtroResp}
              setFiltroResp={setFiltroResp}
              userId={user?.id || null}
            />
          </div>

          {q.isLoading ? (
            <div className="text-center text-muted-foreground py-12 text-sm">Carregando…</div>
          ) : (
            <div className="space-y-6">
              {/* TOPO: Aguardando contato, dividido por nicho (máx 6 por coluna) */}
              <AguardandoNichoBoard
                prospects={porEstagio.aguardando_contato}
                onCardClick={setDetalheOpen}
                onDropCard={moverPorDrag}
              />

              {/* Demais etapas do funil */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 pt-4 border-t border-border/40">
                {(["em_cadencia", "respondeu", "diagnostico", "proposta"] as Estagio[]).map((e) => (
                  <ColunaEstagio
                    key={e}
                    estagio={e}
                    prospects={porEstagio[e]}
                    onCardClick={setDetalheOpen}
                    onDropCard={moverPorDrag}
                  />
                ))}
              </div>

              {/* Follow-up: coluna propria pra leads aguardando retorno em data agendada */}
              {porEstagio.follow_up.length > 0 && (
                <div className="pt-2 border-t border-border/40">
                  <ColunaEstagio estagio="follow_up" prospects={porEstagio.follow_up} onCardClick={setDetalheOpen} onDropCard={moverPorDrag} />
                </div>
              )}

              {/* Ganho/Perdido legado: so aparece se ja houver historico de uso */}
              {(porEstagio.ganho.length > 0 || porEstagio.perdido.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/40">
                  {porEstagio.ganho.length > 0 && (
                    <ColunaEstagio estagio="ganho" prospects={porEstagio.ganho} onCardClick={setDetalheOpen} terminal />
                  )}
                  {porEstagio.perdido.length > 0 && (
                    <ColunaEstagio estagio="perdido" prospects={porEstagio.perdido} onCardClick={setDetalheOpen} terminal />
                  )}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="historico" className="space-y-4">
          <HistoricoView onProspectClick={setDetalheOpen} />
        </TabsContent>
      </Tabs>

      <InserirLeadsDialog
        open={inserirOpen}
        onClose={() => setInserirOpen(false)}
        userId={user?.id || null}
        onInserted={() => { q.refetch(); setInserirOpen(false); }}
      />

      <MinhasMensagensDialog
        open={mensagensOpen}
        onClose={() => setMensagensOpen(false)}
        userId={user?.id || null}
      />

      <ProspectDetalheDialog
        prospect={detalheOpen}
        onClose={() => setDetalheOpen(null)}
        userId={user?.id || null}
        userEmail={user?.email || null}
        onChanged={() => q.refetch()}
      />
    </div>
  );
}

// Nichos exibidos vazios como ilustração (além dos que têm leads).
const NICHOS_ILUSTRATIVOS = ["Restaurante", "Automotivo", "Educação"];

// Filtros de "lead mais completo" pra fila de aguardando contato.
const FILTROS_LEAD: { key: string; label: string; test: (p: Prospect) => boolean }[] = [
  { key: "wa",     label: "Com WhatsApp",  test: p => !!p.whatsapp },
  { key: "ig",     label: "Com Instagram", test: p => !!p.instagram },
  { key: "site",   label: "Com site",      test: p => !!p.site },
  { key: "aberto", label: "Aberto agora",  test: p => statusHorario(p.horario_funcionamento)?.aberto === true },
  { key: "aval",   label: "Com avaliação", test: p => p.avaliacao != null },
];

// Topo do pipeline: "Aguardando contato" dividido por nicho — uma coluna
// por nicho, cada uma mostrando no máx. 6 leads + uma box com o excedente.
function AguardandoNichoBoard({
  prospects, onCardClick, onDropCard,
}: {
  prospects: Prospect[];
  onCardClick: (p: Prospect) => void;
  onDropCard: (prospectId: string, paraEstagio: Estagio, paraNicho?: string | null) => void;
}) {
  const SEM = "__sem_nicho__";
  const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

  const colunas = useMemo(() => {
    const m = new Map<string, Prospect[]>();
    for (const p of prospects) {
      const key = p.nicho && p.nicho.trim() ? p.nicho.trim() : SEM;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(p);
    }
    const comLeads = Array.from(m.entries());
    const reais = comLeads.filter(([k]) => k !== SEM).sort((a, b) => b[1].length - a[1].length);
    const sem = comLeads.find(([k]) => k === SEM);
    // Colunas vazias ilustrativas — só as escolhidas e que ainda não têm leads.
    const presentes = new Set(reais.map(([k]) => norm(k)));
    const vazios: [string, Prospect[]][] = NICHOS_ILUSTRATIVOS
      .filter(lbl => !presentes.has(norm(lbl)))
      .map(lbl => [lbl, [] as Prospect[]]);
    return [...reais, ...(sem ? [sem] : []), ...vazios];
  }, [prospects]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <TrendingUp className="h-4 w-4 text-amber-400 shrink-0" />
        <h3 className="text-sm font-medium">Aguardando contato</h3>
        <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full border text-[11px] font-bold tabular-nums text-amber-400 bg-amber-400/10 border-amber-400/30">
          {prospects.length}
        </span>
        <span className="text-[11px] text-muted-foreground hidden sm:inline">· por nicho · filtre dentro de cada coluna</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {colunas.map(([key, leads]) => (
          <ColunaNicho
            key={key}
            nicho={key === SEM ? null : key}
            leads={leads}
            onCardClick={onCardClick}
            onDropCard={onDropCard}
          />
        ))}
      </div>
    </div>
  );
}

// Popover de filtros pra fila de aguardando contato (multi-select AND).
function FiltroLeadsBtn({
  filtros, setFiltros,
}: { filtros: Set<string>; setFiltros: (s: Set<string>) => void }) {
  const ativos = filtros.size;
  const toggle = (k: string) => {
    const next = new Set(filtros);
    if (next.has(k)) next.delete(k); else next.add(k);
    setFiltros(next);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={ativos > 0 ? "default" : "outline"} size="sm" className="h-6 px-1.5 gap-1 text-[11px] shrink-0" title="Filtrar leads desta coluna">
          <Filter className="h-3 w-3" />
          {ativos > 0 && <span className="tabular-nums">{ativos}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-0">
        <div className="p-3 border-b border-border">
          <div className="text-xs font-semibold">Filtrar leads</div>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
            Mostra só quem atende a <strong className="text-foreground/80">todos</strong> os critérios marcados.
          </p>
        </div>
        <div className="py-1">
          {FILTROS_LEAD.map(f => (
            <label key={f.key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 cursor-pointer">
              <Checkbox checked={filtros.has(f.key)} onCheckedChange={() => toggle(f.key)} />
              <span className="text-xs flex-1">{f.label}</span>
            </label>
          ))}
        </div>
        {ativos > 0 && (
          <div className="p-1.5 border-t border-border/60">
            <Button variant="ghost" size="sm" className="h-7 w-full text-[11px]" onClick={() => setFiltros(new Set())}>
              Limpar filtros
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ColunaNicho({
  nicho, leads, onCardClick, onDropCard,
}: {
  nicho: string | null;
  leads: Prospect[];
  onCardClick: (p: Prospect) => void;
  onDropCard: (prospectId: string, paraEstagio: Estagio, paraNicho?: string | null) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  // Filtro próprio da coluna (intralista).
  const [filtros, setFiltros] = useState<Set<string>>(new Set());
  const meta = nicho ? iconePorNicho(nicho) : null;
  const Icon = meta ? meta.Icon : Target;
  const cor = meta ? meta.cor : "text-muted-foreground";
  const LIMITE = 6;

  const filtrados = useMemo(() => {
    if (filtros.size === 0) return leads;
    const ativos = FILTROS_LEAD.filter(f => filtros.has(f.key));
    return leads.filter(p => ativos.every(f => f.test(p)));
  }, [leads, filtros]);

  const visiveis = filtrados.slice(0, LIMITE);
  const restantes = filtrados.length - visiveis.length;

  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const id = e.dataTransfer.getData("prospect-id");
    if (id) onDropCard(id, "aguardando_contato", nicho);
  };

  return (
    <div
      className={`space-y-2 min-w-0 rounded-lg transition-colors ${dragOver ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={drop}
    >
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`h-4 w-4 shrink-0 ${cor}`} />
          <h4 className="text-sm font-medium truncate">{nicho || "Sem nicho"}</h4>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {leads.length > 0 && <FiltroLeadsBtn filtros={filtros} setFiltros={setFiltros} />}
          <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full border text-[11px] font-bold tabular-nums text-amber-400 bg-amber-400/10 border-amber-400/30">
            {filtros.size > 0 && filtrados.length !== leads.length ? `${filtrados.length}/${leads.length}` : leads.length}
          </span>
        </div>
      </div>
      <div className="space-y-2">
        {visiveis.length === 0 ? (
          <div className="text-[12px] italic text-muted-foreground/50 px-3 py-6 text-center border border-dashed border-border/70 rounded-lg">
            {dragOver ? "Solte aqui pra mover" : (leads.length > 0 ? "Nenhum lead com esse filtro." : "Vazio.")}
          </div>
        ) : (
          visiveis.map(p => (
            <ProspectCard key={p.id} prospect={p} onClick={() => onCardClick(p)} terminal={false} />
          ))
        )}
        {restantes > 0 && (
          <div className="rounded-lg border border-dashed border-amber-400/40 bg-amber-400/5 px-3 py-2 text-center">
            <span className="text-[11px] font-medium text-amber-400">
              + {restantes} aguardando contato
            </span>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              além dos {LIMITE} acima neste nicho
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ColunaEstagio({
  estagio, prospects, onCardClick, terminal = false, onDropCard,
}: {
  estagio: Estagio;
  prospects: Prospect[];
  onCardClick: (p: Prospect) => void;
  terminal?: boolean;
  onDropCard?: (prospectId: string, paraEstagio: Estagio) => void;
}) {
  const meta = ESTAGIO_META[estagio];
  const [dragOver, setDragOver] = useState(false);
  const corBadge =
    meta.cor === "amber"   ? "text-amber-400 bg-amber-400/10 border-amber-400/30" :
    meta.cor === "emerald" ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" :
    meta.cor === "red"     ? "text-red-400 bg-red-400/10 border-red-400/30" :
                             "text-primary bg-primary/10 border-primary/30";
  const Icon =
    meta.cor === "emerald" ? Trophy :
    meta.cor === "red"     ? Ban    :
    meta.cor === "amber"   ? TrendingUp :
                             ArrowRight;

  // Drop zone: aceita prospect-id e chama onDropCard.
  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const id = e.dataTransfer.getData("prospect-id");
    if (id && onDropCard) onDropCard(id, estagio);
  };
  return (
    <div
      className={`space-y-2 min-w-0 rounded-lg transition-colors ${dragOver ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}
      onDragOver={(e) => { if (onDropCard) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={drop}
    >
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <h3 className="text-sm font-medium truncate">{meta.label}</h3>
        </div>
        <span className={`inline-flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full border text-[11px] font-bold tabular-nums shrink-0 ${corBadge}`}>
          {prospects.length}
        </span>
      </div>
      {!terminal && <p className="text-[11px] text-muted-foreground mb-2">{meta.hint}</p>}
      <div className="space-y-2">
        {prospects.length === 0 ? (
          <div className="text-[12px] italic text-muted-foreground/60 px-3 py-6 text-center border border-dashed border-border rounded-lg">
            {dragOver ? "Solte aqui pra mover" : "Vazio."}
          </div>
        ) : (
          prospects.map(p => (
            <ProspectCard key={p.id} prospect={p} onClick={() => onCardClick(p)} terminal={terminal} />
          ))
        )}
      </div>
    </div>
  );
}

// Selo de horário de funcionamento: "Aberto agora / Fechado agora" quando
// dá pra interpretar o horário; senão mostra o texto cru limpo. Usado no
// card e no popup.
function HorarioStatus({ raw, modo = "card" }: { raw: string | null; modo?: "card" | "popup" }) {
  if (!raw) return null;
  const st = statusHorario(raw);
  const resumo = resumoHoje(raw);
  if (!st) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground min-w-0 max-w-full">
        <Clock className="h-2.5 w-2.5 shrink-0" />
        <span className="truncate">{horarioLimpo(raw)}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <Clock className="h-2.5 w-2.5 shrink-0" />
      <span className={st.aberto ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>{st.label}</span>
      {resumo && resumo !== "Fechado hoje" && <span className="text-muted-foreground">· {resumo}</span>}
      {modo === "popup" && st.detalhe && <span className="text-muted-foreground">· {st.detalhe}</span>}
    </span>
  );
}

function ProspectCard({ prospect, onClick, terminal }: { prospect: Prospect; onClick: () => void; terminal: boolean }) {
  const { display: displayName } = useUserDisplayNames();
  const dias = diasNaEtapa(prospect.entrou_na_etapa_at);
  // Aging visual: mais velho na etapa = badge ambar (sinaliza follow-up).
  // Acima de 7d em qualquer etapa ativa fica amarelo.
  const stale = !terminal && dias >= 7;
  const dragArm = useRef(false);
  return (
    <button
      onClick={(e) => {
        // Se o card acabou de ser arrastado, ignora o click "fantasma"
        // que o browser dispara depois do dragend.
        if (dragArm.current) { dragArm.current = false; e.preventDefault(); return; }
        onClick();
      }}
      draggable={!terminal}
      onDragStart={(e) => {
        if (terminal) return;
        e.dataTransfer.setData("prospect-id", prospect.id);
        e.dataTransfer.effectAllowed = "move";
        dragArm.current = true;
      }}
      onDragEnd={() => { setTimeout(() => { dragArm.current = false; }, 100); }}
      className={`w-full text-left rounded-lg border p-3 transition-colors group cursor-grab active:cursor-grabbing ${
        terminal
          ? "border-border/40 bg-card/20 hover:bg-card/40 cursor-pointer"
          : stale
            ? "border-amber-400/40 bg-amber-400/5 hover:border-amber-400/70 hover:bg-amber-400/10"
            : "border-border bg-card/40 hover:border-primary/40 hover:bg-card/60"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className={`text-xs font-semibold line-clamp-2 ${terminal ? "text-muted-foreground" : ""}`}>
          {prospect.nome}
        </span>
        {prospect.avaliacao != null && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-400 shrink-0">
            <Star className="h-2.5 w-2.5 fill-amber-400" />
            {prospect.avaliacao.toFixed(1)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-2 flex-wrap">
        {prospect.whatsapp && (
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-2.5 w-2.5 text-emerald-400" /> WA
          </span>
        )}
        {prospect.telefone && !prospect.whatsapp && (
          <span className="inline-flex items-center gap-1">
            <Phone className="h-2.5 w-2.5" /> Tel
          </span>
        )}
        {prospect.instagram && (
          <span className="inline-flex items-center gap-1">
            <Instagram className="h-2.5 w-2.5 text-pink-400" /> @{prospect.instagram}
          </span>
        )}
      </div>
      {prospect.nicho && (() => {
        const { Icon, cor } = iconePorNicho(prospect.nicho);
        return (
          <div className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/80 truncate mb-1">
            <Icon className={`h-3 w-3 ${cor}`} /> {prospect.nicho}
          </div>
        );
      })()}
      {prospect.horario_funcionamento && (
        <div className="text-[10px] mb-1 min-w-0">
          <HorarioStatus raw={prospect.horario_funcionamento} />
        </div>
      )}
      {prospect.responsavel_email && (
        <div className="inline-flex items-center gap-1 text-[10px] text-primary/90 mb-1">
          <User className="h-2.5 w-2.5" />
          {displayName({ id: prospect.responsavel_id, email: prospect.responsavel_email })}
        </div>
      )}
      {prospect.estagio === "respondeu" && prospect.telefone_decisor && (
        <div className="inline-flex items-center gap-1 text-[10px] text-emerald-400 mb-1">
          <UserCheck className="h-2.5 w-2.5" />
          Decisor: {prospect.telefone_decisor}
        </div>
      )}
      {prospect.estagio === "diagnostico" && prospect.diagnostico_call_at && (
        <div className="inline-flex items-center gap-1 text-[10px] text-primary mb-1">
          <Calendar className="h-2.5 w-2.5" />
          Call {fmtCallCurto(prospect.diagnostico_call_at)}
        </div>
      )}
      {prospect.estagio === "proposta" && prospect.proposta_call_at && (
        <div className="inline-flex items-center gap-1 text-[10px] text-primary mb-1">
          <Calendar className="h-2.5 w-2.5" />
          Call {fmtCallCurto(prospect.proposta_call_at)}
        </div>
      )}
      {prospect.estagio === "follow_up" && prospect.follow_up_at && (
        <div className="text-[10px] inline-flex items-center gap-1 text-amber-400 mb-1">
          <Clock className="h-2.5 w-2.5" />
          Retomar {fmtFollowUp(prospect.follow_up_at)}
        </div>
      )}
      {!terminal && (
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
          <span className={`inline-flex items-center gap-1 text-[10px] ${stale ? "text-amber-400" : "text-muted-foreground"}`}>
            <Clock className="h-2.5 w-2.5" /> {tempoNaEtapa(prospect.entrou_na_etapa_at)} na etapa
          </span>
          <span className="text-[10px] text-primary/80 group-hover:text-primary transition-colors">
            ver detalhes →
          </span>
        </div>
      )}
    </button>
  );
}

// ============================================================================
// Dialog de inserção de leads (paste -> parser -> preview -> insert)
// ============================================================================

function InserirLeadsDialog({
  open, onClose, userId, onInserted,
}: { open: boolean; onClose: () => void; userId: string | null; onInserted: () => void }) {
  // metodo: "menu" (escolha) | "livre" (texto interpretativo) | "planilha" (upload xlsx)
  const [metodo, setMetodo] = useState<"menu" | "livre" | "planilha">("menu");
  const [texto, setTexto] = useState("");
  const [nicho, setNicho] = useState("");
  const [parseados, setParseados] = useState<LeadParsed[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [lendoPlanilha, setLendoPlanilha] = useState(false);

  const reset = () => {
    setMetodo("menu");
    setTexto("");
    setNicho("");
    setParseados(null);
  };

  const fechar = () => { onClose(); setTimeout(reset, 200); };

  const fazerPreview = () => {
    if (!texto.trim()) {
      toast.error("Cole o texto dos leads antes de processar.");
      return;
    }
    const res = parseLeads(texto);
    if (res.length === 0) {
      toast.error("Não consegui extrair nenhum lead — confira o formato.");
      return;
    }
    setParseados(res);
  };

  const onArquivoPlanilha = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
    if (!file) return;
    setLendoPlanilha(true);
    try {
      const res = await parsePlanilhaPadrao(file);
      if (res.length === 0) {
        toast.error("Nenhum lead encontrado — confira se a planilha segue o modelo (nome, telefones, instagram, site, horario, url).");
        return;
      }
      setParseados(res);
    } catch (err: any) {
      toast.error("Erro ao ler a planilha: " + (err?.message || String(err)));
    } finally {
      setLendoPlanilha(false);
    }
  };

  const editarParsedoNome = (idx: number, v: string) => {
    setParseados(prev => prev?.map((p, i) => i === idx ? { ...p, nome: v } : p) ?? null);
  };

  const removerParseado = (idx: number) => {
    setParseados(prev => prev?.filter((_, i) => i !== idx) ?? null);
  };

  const inserir = async () => {
    if (!parseados || parseados.length === 0) return;
    setSaving(true);
    // Todos os leads desse dialog compartilham o mesmo batch_id pra que
    // o histórico consiga agrupá-los e mostrar "X leads importados em Y
    // por Z" como uma única entrada na linha do tempo.
    const batchId = crypto.randomUUID();
    const rows = parseados.map(p => ({
      nome: p.nome,
      telefone: p.telefone,
      whatsapp: p.whatsapp,
      instagram: p.instagram,
      email: p.email,
      site: p.site,
      google_maps_url: p.google_maps_url,
      avaliacao: p.avaliacao,
      horario_funcionamento: p.horario_funcionamento,
      endereco: p.endereco,
      nicho: nicho.trim() || null,
      estagio: "aguardando_contato",
      batch_id: batchId,
      created_by: userId,
    }));
    // Insere em blocos pra suportar lotes grandes (centenas/milhares) sem
    // estourar o limite de payload/linhas de uma única requisição.
    const CHUNK = 200;
    let inseridos = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const fatia = rows.slice(i, i + CHUNK);
      const { error } = await supabase.from("prospects" as any).insert(fatia);
      if (error) {
        setSaving(false);
        toast.error(`Erro ao inserir (após ${inseridos} de ${rows.length}): ${error.message}`);
        if (inseridos > 0) onInserted();
        return;
      }
      inseridos += fatia.length;
    }
    setSaving(false);
    toast.success(`${inseridos} lead${inseridos === 1 ? "" : "s"} cadastrado${inseridos === 1 ? "" : "s"}.`);
    onInserted();
    setTimeout(reset, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) fechar(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Inserir leads
          </DialogTitle>
          <DialogDescription>
            {parseados
              ? "Revise os leads antes de salvar."
              : metodo === "menu"
                ? "Escolha como inserir os leads."
                : metodo === "livre"
                  ? "Cole a lista bruta. O parser identifica nome, telefone, site e Instagram automaticamente."
                  : "Suba a planilha padrão (.xlsx) — colunas: nome, telefones, instagram, site, horario, url."}
          </DialogDescription>
        </DialogHeader>

        {!parseados ? (
          metodo === "menu" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setMetodo("livre")}
                className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card/40 p-4 text-left hover:border-primary/40 hover:bg-card/60 transition-colors"
              >
                <FileText className="h-6 w-6 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Campo livre</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Cole qualquer lista de texto — o parser interpreta automaticamente.</p>
                </div>
              </button>
              <button
                onClick={() => setMetodo("planilha")}
                className="flex flex-col items-start gap-2 rounded-xl border border-border bg-card/40 p-4 text-left hover:border-primary/40 hover:bg-card/60 transition-colors"
              >
                <FileSpreadsheet className="h-6 w-6 text-emerald-400" />
                <div>
                  <p className="text-sm font-semibold">Planilha padrão</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Suba um Excel (.xlsx) no modelo padrão de exportação.</p>
                </div>
              </button>
            </div>
          ) : metodo === "livre" ? (
          <>
            <div className="space-y-3 pt-1">
              <div>
                <Label className="text-xs">Texto da lista *</Label>
                <Textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={12}
                  placeholder={`Dra. Michelle Lisboa - Harmonização Facial || Manaus
Número de contato: +55 92 98438-7420
Site: https://exemplo.com.br
Funcionamento: Seg-Sex: 09:00 as 19:00
Avaliação: 5.0

Próximo lead...`}
                  className="font-mono text-xs"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Funciona com qualquer formato razoável. Blocos separados por linha em branco.
                </p>
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1.5">
                  Nicho do lote
                  {nicho && (() => {
                    const { Icon, cor } = iconePorNicho(nicho);
                    return <Icon className={`h-3.5 w-3.5 ${cor}`} />;
                  })()}
                  <span className="text-muted-foreground">opcional</span>
                </Label>
                <Input
                  value={nicho}
                  onChange={(e) => setNicho(e.target.value)}
                  placeholder="ex: Clínica médica, Estética, Advocacia, Pet, Restaurante…"
                  list="nichos-sugeridos"
                />
                <datalist id="nichos-sugeridos">
                  {NICHOS_SUGERIDOS.map(n => <option key={n} value={n} />)}
                </datalist>
                <p className="text-[10px] text-muted-foreground mt-1">
                  O ícone do nicho aparece no card, no histórico e nos filtros.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMetodo("menu")}>← Voltar</Button>
              <Button variant="outline" onClick={fechar}>Cancelar</Button>
              <Button onClick={fazerPreview}>Processar e revisar →</Button>
            </DialogFooter>
          </>
          ) : (
          <>
            <div className="space-y-3 pt-1">
              <div>
                <Label className="text-xs flex items-center gap-1.5">
                  Nicho do lote
                  {nicho && (() => {
                    const { Icon, cor } = iconePorNicho(nicho);
                    return <Icon className={`h-3.5 w-3.5 ${cor}`} />;
                  })()}
                  <span className="text-muted-foreground">opcional</span>
                </Label>
                <Input
                  value={nicho}
                  onChange={(e) => setNicho(e.target.value)}
                  placeholder="ex: Clínica médica, Estética, Advocacia, Pet, Restaurante…"
                  list="nichos-sugeridos-planilha"
                />
                <datalist id="nichos-sugeridos-planilha">
                  {NICHOS_SUGERIDOS.map(n => <option key={n} value={n} />)}
                </datalist>
              </div>
              <label className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-8 text-center transition-colors cursor-pointer hover:border-primary/50 hover:bg-card/40 ${lendoPlanilha ? "opacity-60 pointer-events-none" : ""}`}>
                {lendoPlanilha ? (
                  <Loader2 className="h-7 w-7 text-primary animate-spin" />
                ) : (
                  <Upload className="h-7 w-7 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium">{lendoPlanilha ? "Lendo planilha…" : "Clique pra escolher o arquivo .xlsx"}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Colunas: nome · telefones · instagram · site · horario · url</p>
                </div>
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={onArquivoPlanilha}
                  disabled={lendoPlanilha}
                />
              </label>
              <p className="text-[10px] text-muted-foreground">
                A planilha precisa seguir o modelo exato (1ª linha = cabeçalho). Cada linha vira um lead na coluna "Aguardando contato".
              </p>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setMetodo("menu")} disabled={lendoPlanilha}>← Voltar</Button>
              <Button variant="outline" onClick={fechar} disabled={lendoPlanilha}>Cancelar</Button>
            </DialogFooter>
          </>
          )
        ) : (
          <>
            <div className="space-y-2 pt-1 min-w-0">
              <div className="text-xs text-muted-foreground">
                <strong className="text-foreground">{parseados.length}</strong> leads extraídos. Revise antes de salvar — você pode editar nome ou remover entradas.
                {parseados.length > 100 && (
                  <> Mostrando os <strong className="text-foreground">100</strong> primeiros pra revisão; <strong className="text-foreground">todos os {parseados.length}</strong> serão salvos.</>
                )}
              </div>
              <div className="rounded-lg border border-border divide-y divide-border/60 max-h-[45vh] overflow-y-auto overflow-x-hidden">
                {parseados.slice(0, 100).map((p, i) => (
                  <div key={i} className="p-2.5 space-y-1.5 text-xs min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <Input
                        value={p.nome}
                        onChange={(e) => editarParsedoNome(i, e.target.value)}
                        className="h-7 text-xs font-semibold flex-1 min-w-0"
                      />
                      <button
                        onClick={() => removerParseado(i)}
                        className="text-muted-foreground hover:text-red-400 transition-colors shrink-0"
                        title="Remover este lead"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground flex-wrap pl-1 min-w-0">
                      {p.telefone && <span className="shrink-0"><Phone className="inline h-2.5 w-2.5 mr-0.5" /> {p.telefone}</span>}
                      {p.email && <span className="truncate max-w-[160px]"><Mail className="inline h-2.5 w-2.5 mr-0.5" /> {p.email}</span>}
                      {p.instagram && <span className="truncate max-w-[160px]"><Instagram className="inline h-2.5 w-2.5 mr-0.5 text-pink-400" /> @{p.instagram}</span>}
                      {p.site && <span className="truncate max-w-[160px]"><Globe className="inline h-2.5 w-2.5 mr-0.5" /> {(() => { try { return new URL(p.site!).hostname.replace(/^www\./, ""); } catch { return p.site; } })()}</span>}
                      {p.google_maps_url && <span className="shrink-0"><MapPin className="inline h-2.5 w-2.5 mr-0.5 text-emerald-400" /> Maps</span>}
                      {p.endereco && <span className="truncate max-w-[200px]"><MapPin className="inline h-2.5 w-2.5 mr-0.5" /> {p.endereco}</span>}
                      {p.avaliacao != null && <span className="shrink-0"><Star className="inline h-2.5 w-2.5 mr-0.5 text-amber-400 fill-amber-400" /> {p.avaliacao.toFixed(1)}</span>}
                      {p.horario_funcionamento && <span className="truncate max-w-[220px]"><HorarioStatus raw={p.horario_funcionamento} /></span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter className="gap-2 sticky bottom-0 -mx-6 -mb-6 px-6 py-3 bg-background border-t border-border">
              <Button variant="outline" onClick={() => setParseados(null)} disabled={saving}>← Voltar</Button>
              <Button onClick={inserir} disabled={saving}>
                {saving ? "Salvando…" : `Salvar ${parseados.length} lead${parseados.length === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Dialog de detalhe + ações
// ============================================================================

// Cabeçalho de seção padrão dos popups de lead. Mantém o MESMO esquema
// visual em todas as colunas: título em caixa-alta acima do conteúdo, sem
// moldura — só os elementos clicáveis (botões/inputs) ficam destacados.
function SecaoPopup({ icon: Icon, titulo, children }: {
  icon?: any; titulo: string; children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />} {titulo}
      </div>
      {children}
    </section>
  );
}

interface Evento {
  id: string;
  tipo: string;
  de_estagio: string | null;
  para_estagio: string | null;
  texto: string | null;
  user_email: string | null;
  created_at: string;
}

function ProspectDetalheDialog({
  prospect, onClose, userId, userEmail, onChanged,
}: {
  prospect: Prospect | null;
  onClose: () => void;
  userId: string | null;
  userEmail: string | null;
  onChanged: () => void;
}) {
  const [nota, setNota] = useState("");
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpData, setFollowUpData] = useState("");
  const [followUpHora, setFollowUpHora] = useState("09:00");
  const [salvandoFollowUp, setSalvandoFollowUp] = useState(false);
  // Número do decisor (etapa "respondeu") e agendamento de call (etapas
  // "diagnostico"/"proposta"). overrides reflete localmente o que foi salvo
  // sem fechar o popup — o prospect vem como prop e nao muda em tempo real.
  const [decisorNum, setDecisorNum] = useState("");
  const [salvandoDecisor, setSalvandoDecisor] = useState(false);
  const [callData, setCallData] = useState("");
  const [callHora, setCallHora] = useState("09:00");
  const [salvandoCall, setSalvandoCall] = useState(false);
  const [overrides, setOverrides] = useState<Partial<Prospect>>({});
  const { display: displayName } = useUserDisplayNames();
  // Mensagens prontas do usuário atual: saudação que pré-preenche o
  // WhatsApp e a que é copiada ao abrir o Direct do Instagram.
  const { mensagens } = useMensagensProntas(userId);
  // Evita avançar pra cadência mais de uma vez por abertura do popup.
  const contatadoRef = useRef(false);

  // Sincroniza os campos editáveis ao abrir/trocar de lead.
  useEffect(() => {
    setOverrides({});
    contatadoRef.current = false;
    if (!prospect) return;
    setDecisorNum(prospect.telefone_decisor || "");
    const callAt = prospect.estagio === "diagnostico" ? prospect.diagnostico_call_at
                 : prospect.estagio === "proposta"   ? prospect.proposta_call_at
                 : null;
    const pad = (n: number) => String(n).padStart(2, "0");
    if (callAt) {
      const d = new Date(callAt);
      setCallData(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
      setCallHora(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    } else {
      const h = new Date();
      setCallData(`${h.getFullYear()}-${pad(h.getMonth() + 1)}-${pad(h.getDate())}`);
      setCallHora("09:00");
    }
  }, [prospect?.id]);

  const eventosQ = useQuery({
    queryKey: ["prospect-eventos", prospect?.id],
    enabled: !!prospect,
    queryFn: async (): Promise<Evento[]> => {
      if (!prospect) return [];
      const { data, error } = await supabase
        .from("prospect_eventos" as any)
        .select("id, tipo, de_estagio, para_estagio, texto, user_email, created_at")
        .eq("prospect_id", prospect.id)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as Evento[];
    },
  });

  const logEvento = async (tipo: Evento["tipo"], extras: Partial<Evento> = {}) => {
    if (!prospect) return;
    await supabase.from("prospect_eventos" as any).insert({
      prospect_id: prospect.id,
      tipo,
      user_id: userId,
      user_email: userEmail,
      ...extras,
    });
  };

  const mover = async (para: Estagio) => {
    if (!prospect) return;
    const de = prospect.estagio;
    // Quando o lead sai da inercia ("aguardando_contato" -> "em_cadencia")
    // e ainda nao tem responsavel, carimba quem fez a acao.
    const carimbarResponsavel =
      de === "aguardando_contato" && para === "em_cadencia" && !prospect.responsavel_id && userId;
    const patch: Record<string, unknown> = {
      estagio: para,
      ultimo_contato_at: new Date().toISOString(),
    };
    if (carimbarResponsavel) {
      patch.responsavel_id = userId;
      patch.responsavel_email = userEmail;
    }
    const { error } = await supabase.from("prospects" as any)
      .update(patch)
      .eq("id", prospect.id);
    if (error) { toast.error(error.message); return; }
    await logEvento("movido", { de_estagio: de, para_estagio: para });
    toast.success(`Movido para "${ESTAGIO_META[para].label}".`);
    eventosQ.refetch();
    onChanged();
    onClose();
  };

  // Marca um item do checklist de cadencia. Publica no chat como evento
  // de contato — todo mundo ve quem registrou e quando.
  const marcarContatoCadencia = async (canal: "wa" | "insta" | "tel") => {
    if (!prospect) return;
    const rotulo =
      canal === "wa" ? "Mensagem enviada via WhatsApp" :
      canal === "insta" ? "Mensagem enviada via Instagram" :
                          "Ligação realizada";
    await logEvento("contato", { texto: `cadencia.${canal}|${rotulo}` });
    eventosQ.refetch();
  };

  const agendarFollowUp = async () => {
    if (!prospect || !followUpData) return;
    setSalvandoFollowUp(true);
    const isoLocal = `${followUpData}T${followUpHora || "09:00"}:00`;
    const targetIso = new Date(isoLocal).toISOString();
    const de = prospect.estagio;
    const { error } = await supabase.from("prospects" as any)
      .update({ estagio: "follow_up", follow_up_at: targetIso })
      .eq("id", prospect.id);
    setSalvandoFollowUp(false);
    if (error) { toast.error(error.message); return; }
    await logEvento("follow_up", {
      de_estagio: de,
      para_estagio: "follow_up",
      texto: `Follow-up agendado pra ${new Date(isoLocal).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
    });
    toast.success("Follow-up agendado.");
    setFollowUpOpen(false);
    setFollowUpData("");
    onChanged();
    onClose();
  };

  const arquivar = async () => {
    if (!prospect) return;
    const { error } = await supabase.from("prospects" as any)
      .update({ status: "arquivado" })
      .eq("id", prospect.id);
    if (error) { toast.error(error.message); return; }
    await logEvento("status", { texto: "arquivado" });
    toast.success("Lead arquivado.");
    onChanged();
    onClose();
  };

  const salvarNota = async () => {
    if (!prospect || !nota.trim()) return;
    setSalvandoNota(true);
    await logEvento("nota", { texto: nota.trim() });
    setSalvandoNota(false);
    setNota("");
    eventosQ.refetch();
  };

  // Associa (ou atualiza/remove) o número do decisor ao lead. Mantém o
  // popup aberto e registra no chat. overrides reflete o valor na hora.
  const salvarDecisor = async () => {
    if (!prospect) return;
    const v = decisorNum.trim();
    if (v === (prospect.telefone_decisor || "")) return;
    setSalvandoDecisor(true);
    const { error } = await supabase.from("prospects" as any)
      .update({ telefone_decisor: v || null })
      .eq("id", prospect.id);
    setSalvandoDecisor(false);
    if (error) { toast.error(error.message); return; }
    setOverrides(o => ({ ...o, telefone_decisor: v || null }));
    await logEvento("status", { texto: v ? `associou o número do decisor: ${v}` : "removeu o número do decisor" });
    toast.success(v ? "Número do decisor salvo." : "Número do decisor removido.");
    eventosQ.refetch();
    onChanged();
  };

  // Agenda a data/hora da call da etapa atual (diagnóstico ou proposta).
  // Não muda o estágio — só carimba o horário. Mantém o popup aberto.
  const agendarCall = async () => {
    if (!prospect || !callData) return;
    const campo = prospect.estagio === "diagnostico" ? "diagnostico_call_at" : "proposta_call_at";
    const rotulo = prospect.estagio === "diagnostico" ? "call de diagnóstico" : "call de proposta";
    setSalvandoCall(true);
    const isoLocal = `${callData}T${callHora || "09:00"}:00`;
    const targetIso = new Date(isoLocal).toISOString();
    const { error } = await supabase.from("prospects" as any)
      .update({ [campo]: targetIso })
      .eq("id", prospect.id);
    setSalvandoCall(false);
    if (error) { toast.error(error.message); return; }
    setOverrides(o => ({ ...o, [campo]: targetIso }));
    await logEvento("agenda", {
      texto: `agendou ${rotulo} pra ${new Date(isoLocal).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
    });
    toast.success("Call agendada.");
    eventosQ.refetch();
    onChanged();
  };

  // Acionado ao clicar em QUALQUER botão de "Envio de mensagem". Se o lead
  // ainda está em "aguardando contato", avança automaticamente pra cadência
  // e carimba o usuário atual como responsável (sem precisar de "Avançar").
  const aoContatar = async () => {
    if (!prospect || contatadoRef.current) return;
    if (prospect.estagio !== "aguardando_contato") return;
    contatadoRef.current = true;
    const patch: Record<string, unknown> = {
      estagio: "em_cadencia",
      ultimo_contato_at: new Date().toISOString(),
    };
    if (!prospect.responsavel_id && userId) {
      patch.responsavel_id = userId;
      patch.responsavel_email = userEmail;
    }
    const { error } = await supabase.from("prospects" as any).update(patch).eq("id", prospect.id);
    if (error) { contatadoRef.current = false; toast.error(error.message); return; }
    await logEvento("movido", { de_estagio: "aguardando_contato", para_estagio: "em_cadencia" });
    setOverrides(o => ({ ...o, estagio: "em_cadencia" }));
    toast.success("Lead movido pra Cadência e atribuído a você.");
    eventosQ.refetch();
    onChanged();
  };

  if (!prospect) return null;

  const proximoEstagio: Estagio | null = (() => {
    const idx = ESTAGIOS_ORDEM.indexOf(prospect.estagio);
    if (idx === -1) return null;
    return ESTAGIOS_ORDEM[idx + 1] || null;
  })();
  const estagioAnterior: Estagio | null = (() => {
    const idx = ESTAGIOS_ORDEM.indexOf(prospect.estagio);
    if (idx <= 0) return null;
    return ESTAGIOS_ORDEM[idx - 1];
  })();

  // Quais canais ja foram registrados na cadencia (deriva dos eventos
  // do tipo 'contato' com prefixo "cadencia.X|").
  const cadenciaFeita = (() => {
    const out = { wa: false, insta: false, tel: false };
    for (const ev of eventosQ.data || []) {
      if (ev.tipo !== "contato" || !ev.texto) continue;
      if (ev.texto.startsWith("cadencia.wa|")) out.wa = true;
      else if (ev.texto.startsWith("cadencia.insta|")) out.insta = true;
      else if (ev.texto.startsWith("cadencia.tel|")) out.tel = true;
    }
    return out;
  })();

  // Saudações prontas. WhatsApp suporta ?text= nativo; Instagram não
  // permite pré-preencher Direct, então copiamos pro clipboard ao abrir.
  const waSaud = (mensagens["whatsapp_saudacao"] || "").trim();
  const igSaud = (mensagens["instagram_saudacao"] || "").trim();
  const comTexto = (url: string, texto: string) => {
    if (!texto) return url;
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}text=${encodeURIComponent(texto)}`;
  };

  const waDigits = prospect.whatsapp ? prospect.whatsapp.replace(/\D/g, "") : "";
  const waBase = prospect.whatsapp
    ? (prospect.whatsapp.startsWith("http") ? prospect.whatsapp : `https://wa.me/${waDigits}`)
    : null;
  const waLink = waBase ? comTexto(waBase, waSaud) : null;
  // Direct do lead. Copia a saudação pro clipboard no clique (é só colar).
  const igLink = prospect.instagram ? `https://ig.me/m/${prospect.instagram}` : null;
  const copiarSaudacaoIg = () => {
    if (!igSaud) return;
    navigator.clipboard?.writeText(igSaud).then(
      () => toast.success("Saudação copiada — é só colar (Ctrl+V) no Direct."),
      () => toast.error("Não consegui copiar a saudação."),
    );
  };
  const telLink = prospect.telefone ? `tel:${prospect.telefone.replace(/\D/g, "")}` : null;

  // Valores editáveis com override local (refletem o último save sem
  // depender de um refetch chegar até a prop prospect).
  const telefoneDecisor = "telefone_decisor" in overrides ? overrides.telefone_decisor ?? null : prospect.telefone_decisor;
  const diagnosticoCallAt = "diagnostico_call_at" in overrides ? overrides.diagnostico_call_at ?? null : prospect.diagnostico_call_at;
  const propostaCallAt = "proposta_call_at" in overrides ? overrides.proposta_call_at ?? null : prospect.proposta_call_at;
  const decisorDigits = telefoneDecisor ? telefoneDecisor.replace(/\D/g, "") : "";
  const decisorLink = telefoneDecisor
    ? (telefoneDecisor.startsWith("http") ? telefoneDecisor : `https://wa.me/${decisorDigits}`)
    : null;

  // Data minima do calendario de follow-up: hoje
  const hoje = new Date();
  const minDate = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

  return (
    <Dialog open={!!prospect} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2 pr-6">
            <Target className="h-5 w-5 text-primary mt-1 shrink-0" />
            <span className="break-words text-lg">{prospect.nome}</span>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            <EstagioBadge estagio={prospect.estagio} />
            {prospect.estagio === "follow_up" && prospect.follow_up_at && (
              <span className="text-[11px] inline-flex items-center gap-1 text-amber-400">
                <Clock className="h-3 w-3" /> {fmtFollowUp(prospect.follow_up_at)}
              </span>
            )}
            <span className="text-[11px]">há {tempoNaEtapa(prospect.entrou_na_etapa_at)} na etapa</span>
            {prospect.nicho && (() => {
              const { Icon, cor } = iconePorNicho(prospect.nicho);
              return (
                <span className="text-[11px] inline-flex items-center gap-1 text-muted-foreground">
                  <Icon className={`h-3 w-3 ${cor}`} /> {prospect.nicho}
                </span>
              );
            })()}
            {prospect.responsavel_email && (
              <span className="text-[11px] inline-flex items-center gap-1 text-primary">
                <User className="h-3 w-3" /> {displayName({ id: prospect.responsavel_id, email: prospect.responsavel_email })}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Metainfo do lead (avaliação, endereço, horário) — só informativo, sem moldura */}
        {(prospect.avaliacao != null || prospect.endereco || prospect.horario_funcionamento) && (
          <div className="space-y-1">
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
              {prospect.avaliacao != null && (
                <span className="inline-flex items-center gap-1 text-amber-400">
                  <Star className="h-3 w-3 fill-amber-400" /> {prospect.avaliacao.toFixed(1)}
                </span>
              )}
              {prospect.endereco && (
                <span className="inline-flex items-center gap-1 truncate max-w-[260px]">
                  <MapPin className="h-3 w-3" /> {prospect.endereco}
                </span>
              )}
              {prospect.horario_funcionamento && (
                <span className="text-[11px]"><HorarioStatus raw={prospect.horario_funcionamento} modo="popup" /></span>
              )}
            </div>
            {/* Grade da semana inteira (quando interpretável) */}
            {(() => {
              const semana = semanaFormatada(prospect.horario_funcionamento);
              if (!semana) return null;
              return (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                  {semana.map(d => (
                    <span key={d.abrev} className={d.hoje ? "text-foreground font-medium" : ""}>
                      {d.abrev} {d.horas}
                    </span>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* SEÇÃO: Envio de mensagem — canais de contato (clicáveis) */}
        {(waLink || igLink || decisorLink || (telLink && !waLink) || prospect.google_maps_url || prospect.email || prospect.site) && (
          <SecaoPopup icon={Send} titulo="Envio de mensagem">
            {(waLink || igLink || decisorLink) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {waLink && (
                  <ContatoBtn href={waLink} icon={MessageCircle} label="WhatsApp"
                    cor="emerald" big sub={prospect.telefone || waDigits} onClick={aoContatar} />
                )}
                {decisorLink && (
                  <ContatoBtn href={decisorLink} icon={UserCheck} label="Decisor (WhatsApp)"
                    cor="primary" big sub={telefoneDecisor!} onClick={aoContatar} />
                )}
                {igLink && (
                  <ContatoBtn href={igLink} icon={Instagram} label="Instagram"
                    cor="pink" big onClick={() => { copiarSaudacaoIg(); aoContatar(); }}
                    sub={igSaud ? `@${prospect.instagram} · copia saudação` : `@${prospect.instagram}`} />
                )}
              </div>
            )}
            {((telLink && !waLink) || prospect.google_maps_url || prospect.email || prospect.site) && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {telLink && !waLink && (
                  <ContatoBtn href={telLink} icon={Phone} label="Ligar"
                    cor="muted" sub={prospect.telefone || ""} onClick={aoContatar} />
                )}
                {prospect.google_maps_url && (
                  <ContatoBtn href={prospect.google_maps_url} icon={MapPin} label="Maps"
                    cor="muted" sub="Abrir local" onClick={aoContatar} />
                )}
                {prospect.email && (
                  <ContatoBtn href={`mailto:${prospect.email}`} icon={Mail} label="E-mail"
                    cor="muted" sub={prospect.email} onClick={aoContatar} />
                )}
                {prospect.site && (
                  <ContatoBtn href={prospect.site} icon={Globe} label="Site"
                    cor="muted" onClick={aoContatar}
                    sub={(() => { try { return new URL(prospect.site!).hostname.replace(/^www\./, ""); } catch { return prospect.site!; } })()} />
                )}
              </div>
            )}
          </SecaoPopup>
        )}

        {/* SEÇÃO: Número do decisor — só na etapa "respondeu" */}
        {prospect.estagio === "respondeu" && (
          <SecaoPopup icon={UserCheck} titulo="Número do decisor">
            <p className="text-[10px] text-muted-foreground">
              Número direto de quem decide. Fica clicável (WhatsApp) junto ao contato principal.
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={decisorNum}
                onChange={(e) => setDecisorNum(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvarDecisor(); } }}
                placeholder="ex: +55 92 99999-9999"
                className="h-8 text-xs flex-1"
              />
              <Button
                size="sm"
                onClick={salvarDecisor}
                disabled={salvandoDecisor || decisorNum.trim() === (telefoneDecisor || "")}
              >
                {salvandoDecisor ? "..." : "Salvar"}
              </Button>
            </div>
          </SecaoPopup>
        )}

        {/* SEÇÃO: Call agendada — etapas "diagnostico" e "proposta" */}
        {(prospect.estagio === "diagnostico" || prospect.estagio === "proposta") && (() => {
          const callLabel = prospect.estagio === "diagnostico" ? "Call de diagnóstico" : "Call de proposta";
          const callAtual = prospect.estagio === "diagnostico" ? diagnosticoCallAt : propostaCallAt;
          return (
            <SecaoPopup icon={Calendar} titulo={callLabel}>
              {callAtual ? (
                <div className="text-xs text-foreground inline-flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-primary" />
                  Agendada pra <strong>{fmtDataHora(callAtual)}</strong>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  Defina a data e a hora da call.
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <Input type="date" min={minDate} value={callData}
                  onChange={(e) => setCallData(e.target.value)} className="h-9 w-auto" />
                <Input type="time" value={callHora}
                  onChange={(e) => setCallHora(e.target.value)} className="h-9 w-auto" />
                <div className="flex-1" />
                <Button size="sm" onClick={agendarCall} disabled={!callData || salvandoCall}>
                  {salvandoCall ? "Agendando…" : callAtual ? "Reagendar" : "Agendar"}
                </Button>
              </div>
              <p className="text-[9px] text-muted-foreground/70 inline-flex items-center gap-1">
                <Calendar className="h-2.5 w-2.5" /> Integração com Google Calendar em breve.
              </p>
            </SecaoPopup>
          );
        })()}

        {/* SEÇÃO: Registro de cadência — só em "em_cadencia" */}
        {prospect.estagio === "em_cadencia" && (
          <SecaoPopup icon={TrendingUp} titulo="Registro de cadência">
            <div className="grid grid-cols-3 gap-1.5">
              <ChecklistContatoBtn
                icon={MessageCircle} label="WhatsApp" cor="emerald"
                feito={cadenciaFeita.wa} disabled={!waLink}
                onClick={() => marcarContatoCadencia("wa")}
              />
              <ChecklistContatoBtn
                icon={Instagram} label="Instagram" cor="pink"
                feito={cadenciaFeita.insta} disabled={!igLink}
                onClick={() => marcarContatoCadencia("insta")}
              />
              <ChecklistContatoBtn
                icon={Phone} label="Telefone" cor="primary"
                feito={cadenciaFeita.tel} disabled={!telLink && !waLink}
                onClick={() => marcarContatoCadencia("tel")}
              />
            </div>
          </SecaoPopup>
        )}

        {/* SEÇÃO: Registro no CRM — mover o lead no funil */}
        {prospect.estagio !== "ganho" && prospect.estagio !== "perdido" && (
          <SecaoPopup icon={Workflow} titulo="Registro no CRM">
            {estagioAnterior && (
              <button
                onClick={() => mover(estagioAnterior)}
                className="inline-flex items-center gap-1 px-2 h-7 rounded-md text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                title={`Voltar pra ${ESTAGIO_META[estagioAnterior].label}`}
              >
                <ArrowLeft className="h-3 w-3" />
                Voltar
              </button>
            )}
            {/* Follow-up + Arquivar lado a lado, largura total */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  if (prospect.estagio === "follow_up" && prospect.follow_up_at) {
                    const d = new Date(prospect.follow_up_at);
                    setFollowUpData(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
                    setFollowUpHora(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
                  } else {
                    setFollowUpData(minDate);
                    setFollowUpHora("09:00");
                  }
                  setFollowUpOpen(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-2 h-9 rounded-md border border-border bg-card/40 hover:bg-muted/50 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Clock className="h-3.5 w-3.5" />
                {prospect.estagio === "follow_up" ? "Reagendar" : "Follow-up"}
              </button>
              <button
                onClick={arquivar}
                className="inline-flex items-center justify-center gap-1.5 px-2 h-9 rounded-md border border-border bg-card/40 hover:bg-muted/50 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Ban className="h-3.5 w-3.5" />
                Arquivar
              </button>
            </div>
            {/* Avançar etapa — maior, ocupando a linha inteira */}
            {proximoEstagio && (
              <button
                onClick={() => mover(proximoEstagio)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-2 h-11 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 text-sm text-primary font-medium transition-colors"
              >
                <ArrowRight className="h-4 w-4" />
                Avançar etapa
              </button>
            )}
            {/* Mini-form de follow-up (expande ao clicar em Follow-up) */}
            {followUpOpen && (
              <div className="space-y-2 pt-1">
                <div className="text-[11px] text-amber-400/90 font-medium flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Quando retomar este lead?
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Input type="date" min={minDate} value={followUpData}
                    onChange={(e) => setFollowUpData(e.target.value)} className="h-9 w-auto" />
                  <Input type="time" value={followUpHora}
                    onChange={(e) => setFollowUpHora(e.target.value)} className="h-9 w-auto" />
                  <div className="flex-1" />
                  <Button variant="outline" size="sm" onClick={() => setFollowUpOpen(false)} disabled={salvandoFollowUp}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={agendarFollowUp} disabled={!followUpData || salvandoFollowUp}>
                    {salvandoFollowUp ? "Agendando…" : "Agendar"}
                  </Button>
                </div>
              </div>
            )}
          </SecaoPopup>
        )}

        {/* SEÇÃO: Histórico de notas */}
        <SecaoPopup icon={History} titulo="Histórico de notas">
          <ChatNotas
            eventos={eventosQ.data || []}
            currentEmail={userEmail}
          />
          <div className="flex items-end gap-2 pt-1">
            <Textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  salvarNota();
                }
              }}
              rows={2}
              placeholder="Adicionar nota ao chat…"
              className="resize-none text-xs"
            />
            <Button size="sm" onClick={salvarNota} disabled={salvandoNota || !nota.trim()}>
              {salvandoNota ? "..." : "Enviar"}
            </Button>
          </div>
        </SecaoPopup>
      </DialogContent>
    </Dialog>
  );
}

// Botão de contato grande com ícone + label + sub. Usado no topo do
// ProspectDetalheDialog. `big` é pros canais protagonistas (WA/Insta);
// cor="muted" pros secundarios (cinza).
// Botao + popover multi-select que filtra o kanban por responsavel.
// 'aguardando_contato' sempre escapa do filtro (fila comum) — isso é
// aplicado no filtrados() do Prospeccao(); aqui só controla a selecao.
function FiltroResponsavelBtn({
  filtroResp, setFiltroResp, userId,
}: {
  filtroResp: Set<string>;
  setFiltroResp: (s: Set<string>) => void;
  userId: string | null;
}) {
  const { profiles, isLoading } = useUserDisplayNames();
  const ativos = filtroResp.size;
  const toggle = (id: string) => {
    const next = new Set(filtroResp);
    if (next.has(id)) next.delete(id); else next.add(id);
    setFiltroResp(next);
  };
  const limpar = () => setFiltroResp(new Set());
  const soMeu = () => userId && setFiltroResp(new Set([userId]));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={ativos > 0 ? "default" : "outline"} size="default" className="h-10 gap-1.5 shrink-0">
          <User className="h-4 w-4" />
          {ativos === 0 ? "Responsável" : `${ativos} responsável${ativos === 1 ? "" : "is"}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-3 border-b border-border">
          <div className="text-xs font-semibold mb-1">Filtrar por responsável</div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Mostra só leads atribuídos aos selecionados. <strong className="text-foreground/80">Aguardando contato</strong> sempre aparece pra todos.
          </p>
        </div>
        <div className="p-1.5 flex items-center gap-1 border-b border-border/60">
          {userId && (
            <Button variant="ghost" size="sm" className="h-7 text-[11px] flex-1" onClick={soMeu}>
              Só meus leads
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 text-[11px] flex-1" onClick={limpar} disabled={ativos === 0}>
            Limpar
          </Button>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {isLoading ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">Carregando…</div>
          ) : profiles.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground">Sem usuários cadastrados.</div>
          ) : profiles.map(p => {
            const checked = filtroResp.has(p.id);
            return (
              <label
                key={p.id}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 cursor-pointer"
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(p.id)} />
                <span className="text-xs flex-1 truncate">{p.display}</span>
                {p.id === userId && <span className="text-[9px] text-primary/70 uppercase tracking-wider">você</span>}
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ContatoBtn({
  href, icon: Icon, label, sub, cor, big, onClick,
}: {
  href: string;
  icon: any;
  label: string;
  sub: string;
  cor: "emerald" | "primary" | "pink" | "muted";
  big?: boolean;
  onClick?: () => void;
}) {
  const cls =
    cor === "emerald" ? "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400" :
    cor === "pink"    ? "border-pink-500/40 bg-pink-500/10 hover:bg-pink-500/20 text-pink-400" :
    cor === "muted"   ? "border-border bg-card/40 hover:bg-muted/40 text-muted-foreground" :
                        "border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary";
  const sizing = big ? "p-3.5 gap-1.5" : "p-2.5 gap-1";
  const iconSize = big ? "h-4 w-4" : "h-3.5 w-3.5";
  const labelSize = big ? "text-sm" : "text-[11px]";
  const subSize = big ? "text-[11px]" : "text-[10px]";
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noreferrer" : undefined}
      onClick={onClick}
      className={`flex flex-col items-start rounded-lg border transition-colors min-w-0 ${sizing} ${cls}`}
    >
      <div className={`flex items-center gap-1.5 font-semibold ${labelSize}`}>
        <Icon className={iconSize} />
        {label}
      </div>
      <span className={`opacity-80 truncate w-full ${subSize}`}>{sub}</span>
    </a>
  );
}

// Item do checklist de cadência: clicado, registra contato e fica
// marcado. Quando `disabled`, indica que aquele canal nao existe no lead.
function ChecklistContatoBtn({
  icon: Icon, label, cor, feito, disabled, onClick,
}: {
  icon: any;
  label: string;
  cor: "emerald" | "pink" | "primary";
  feito: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  // Botão neutro (cinza) — só o ícone do app é colorido, pra não roubar
  // o protagonismo dos botões reais de envio (WhatsApp/Instagram no topo).
  const iconCor =
    cor === "emerald" ? "text-emerald-400" :
    cor === "pink"    ? "text-pink-400" :
                        "text-muted-foreground";
  return (
    <button
      onClick={onClick}
      disabled={disabled || feito}
      className={`flex items-center justify-center gap-1.5 px-2 h-8 rounded-md border border-border text-[11px] font-medium transition-colors disabled:cursor-not-allowed ${disabled && !feito ? "opacity-40" : ""} ${feito ? "bg-muted/50 text-foreground" : "bg-card/40 text-muted-foreground hover:bg-card/60 hover:text-foreground"}`}
      title={feito ? "Já registrado" : disabled ? "Sem dado pra esse canal" : `Marcar ${label} como contatado`}
    >
      {feito
        ? <CheckSquare className="h-4 w-4 shrink-0" />
        : <Square className="h-4 w-4 shrink-0 opacity-70" />}
      <Icon className={`h-3 w-3 shrink-0 ${iconCor}`} />
      <span className="truncate">{label}</span>
    </button>
  );
}

// Renderiza eventos como bolhas de chat. Notas têm bolha grande,
// sistema (criou/moveu/follow-up/status) vira linha cinza centralizada.
function ChatNotas({ eventos, currentEmail }: { eventos: Evento[]; currentEmail: string | null }) {
  if (eventos.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card/30 px-3 py-6 text-center text-[11px] italic text-muted-foreground/60">
        Nenhuma mensagem no chat ainda. Adicione a primeira nota abaixo.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-card/30 max-h-72 overflow-y-auto px-3 py-3 space-y-2.5">
      {eventos.map((ev) => {
        if (ev.tipo === "nota") {
          return <BolhaNota key={ev.id} ev={ev} isMine={currentEmail === ev.user_email} />;
        }
        return <LinhaSistema key={ev.id} ev={ev} />;
      })}
    </div>
  );
}

function BolhaNota({ ev, isMine }: { ev: Evento; isMine: boolean }) {
  const { display: displayName } = useUserDisplayNames();
  const quando = new Date(ev.created_at);
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(quando);
  const handle = ev.user_email ? displayName({ email: ev.user_email }) : "Sistema";
  const inicial = handle.charAt(0).toUpperCase() || "?";
  return (
    <div className={`flex gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${
        isMine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
      }`}>
        {inicial}
      </div>
      <div className={`flex flex-col gap-0.5 max-w-[78%] ${isMine ? "items-end" : "items-start"}`}>
        <div className={`flex items-center gap-1.5 text-[10px] text-muted-foreground ${isMine ? "flex-row-reverse" : ""}`}>
          <strong className="text-foreground/80">{handle}</strong>
          <span>·</span>
          <span className="tabular-nums">{fmt}</span>
        </div>
        <div className={`px-3 py-2 rounded-2xl text-xs whitespace-pre-wrap break-words ${
          isMine
            ? "bg-primary/20 text-foreground rounded-tr-sm"
            : "bg-muted/60 text-foreground rounded-tl-sm"
        }`}>
          {ev.texto}
        </div>
      </div>
    </div>
  );
}

// Pinta "WhatsApp" de verde e "Instagram" de roxo dentro do texto do chat.
const colorizeCanais = (texto: string): React.ReactNode =>
  texto.split(/(WhatsApp|Instagram)/gi).map((p, i) => {
    if (/^whatsapp$/i.test(p)) return <span key={i} className="text-emerald-400 font-medium">{p}</span>;
    if (/^instagram$/i.test(p)) return <span key={i} className="text-purple-400 font-medium">{p}</span>;
    return p;
  });

function LinhaSistema({ ev }: { ev: Evento }) {
  const { display: displayName } = useUserDisplayNames();
  const quando = new Date(ev.created_at);
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(quando);
  const who = ev.user_email ? displayName({ email: ev.user_email }) : "Sistema";
  let conteudo: React.ReactNode = null;
  if (ev.tipo === "criado") {
    conteudo = <><strong className="text-foreground/70">{who}</strong> criou o lead</>;
  } else if (ev.tipo === "movido" && ev.de_estagio && ev.para_estagio) {
    const de = ESTAGIO_META[ev.de_estagio as Estagio]?.label || ev.de_estagio;
    const pa = ESTAGIO_META[ev.para_estagio as Estagio]?.label || ev.para_estagio;
    conteudo = <><strong className="text-foreground/70">{who}</strong> moveu {de} → <span className="text-foreground/80">{pa}</span></>;
  } else if (ev.tipo === "follow_up") {
    conteudo = <><strong className="text-foreground/70">{who}</strong> {ev.texto || "agendou follow-up"}</>;
  } else if (ev.tipo === "agenda") {
    conteudo = <><strong className="text-foreground/70">{who}</strong> {ev.texto || "agendou call"}</>;
  } else if (ev.tipo === "status") {
    conteudo = <><strong className="text-foreground/70">{who}</strong> {ev.texto || "atualizou status"}</>;
  } else if (ev.tipo === "contato") {
    // Eventos de cadencia vem como "cadencia.wa|Mensagem enviada..."
    // — strip do prefixo na exibicao.
    const texto = (ev.texto || "").replace(/^cadencia\.(wa|insta|tel)\|/, "");
    conteudo = <><strong className="text-foreground/70">{who}</strong> ✓ {texto ? colorizeCanais(texto) : "registrou contato"}</>;
  }
  return (
    <div className="flex items-center gap-2 py-0.5 text-[10px] text-muted-foreground">
      <div className="h-px flex-1 bg-border/40" />
      <span className="px-2">{conteudo} · <span className="tabular-nums opacity-70">{fmt}</span></span>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  );
}

function EstagioBadge({ estagio }: { estagio: Estagio }) {
  const meta = ESTAGIO_META[estagio];
  const cls =
    meta.cor === "amber"   ? "text-amber-400 bg-amber-400/10 border-amber-400/30" :
    meta.cor === "emerald" ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" :
    meta.cor === "red"     ? "text-red-400 bg-red-400/10 border-red-400/30" :
                             "text-primary bg-primary/10 border-primary/30";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${cls}`}>
      {meta.label}
    </span>
  );
}

// ============================================================================
// Histórico — timeline de inserções agrupadas por batch_id
// ============================================================================

interface ProspectLite {
  id: string;
  nome: string;
  batch_id: string | null;
  nicho: string | null;
  created_at: string;
  created_by: string | null;
  estagio: Estagio;
  whatsapp: string | null;
  instagram: string | null;
  telefone: string | null;
}

interface Lote {
  batchId: string;
  criadoEm: string;
  autorId: string | null;
  autorEmail: string | null;
  autorNome: string;
  nicho: string | null;
  qtd: number;
  leads: ProspectLite[];
}

const fmtDataHora = (iso: string): string =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));

const fmtDiaCurto = (iso: string): string =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(iso));

const tempoAtras = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min atrás`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `${horas}h atrás`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `${dias}d atrás`;
  const meses = Math.floor(dias / 30);
  return `${meses}m atrás`;
};

function HistoricoView({ onProspectClick }: { onProspectClick: (p: Prospect) => void }) {
  const q = useQuery({
    queryKey: ["prospect-historico"],
    queryFn: async (): Promise<Lote[]> => {
      // 1) prospects mais recentes primeiro
      const { data: rows, error } = await supabase
        .from("prospects" as any)
        .select("id, nome, batch_id, nicho, created_at, created_by, estagio, whatsapp, instagram, telefone")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const prospects = (rows || []) as unknown as ProspectLite[];
      if (prospects.length === 0) return [];

      // 2) autor = created_by do lead (resolvido pra nome via useUserDisplayNames
      //    no LoteCard). Evita o .in(ids) gigante que falhava com lotes grandes
      //    e fazia o histórico mostrar "Sistema".

      // 3) agrupa por batch_id (sem batch_id -> lote individual)
      const mapa = new Map<string, ProspectLite[]>();
      for (const p of prospects) {
        const key = p.batch_id || `solo-${p.id}`;
        if (!mapa.has(key)) mapa.set(key, []);
        mapa.get(key)!.push(p);
      }

      // 4) constroi lotes ordenados por data desc
      const lotes: Lote[] = [];
      for (const [batchId, leads] of mapa) {
        const primeiro = leads[leads.length - 1]; // mais antigo do lote
        lotes.push({
          batchId,
          criadoEm: primeiro.created_at,
          autorId: primeiro.created_by,
          autorEmail: null,
          autorNome: primeiro.created_by ? "" : "Sistema",
          nicho: primeiro.nicho,
          qtd: leads.length,
          leads,
        });
      }
      lotes.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
      return lotes;
    },
    refetchInterval: 60_000,
  });

  if (q.isLoading) {
    return <div className="text-center text-muted-foreground py-12 text-sm">Carregando histórico…</div>;
  }
  const lotes = q.data || [];
  if (lotes.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm rounded-lg border border-dashed border-border">
        Nenhuma inserção registrada ainda.
      </div>
    );
  }

  // Separadores por dia
  const porDia = new Map<string, Lote[]>();
  for (const l of lotes) {
    const dia = l.criadoEm.slice(0, 10);
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia)!.push(l);
  }

  const totalLeads = lotes.reduce((acc, l) => acc + l.qtd, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 text-sm text-muted-foreground border-b border-border/60 pb-3">
        <span className="inline-flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-primary" />
          <strong className="text-foreground">{lotes.length}</strong> inserções
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Target className="h-4 w-4 text-primary" />
          <strong className="text-foreground">{totalLeads}</strong> leads no total
        </span>
        <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching} className="ml-auto">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${q.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      <div className="space-y-6">
        {Array.from(porDia.entries()).map(([dia, lotesDoDia]) => (
          <div key={dia} className="space-y-2">
            <div className="flex items-center gap-3 sticky top-0 bg-background/95 backdrop-blur z-10 py-1">
              <div className="h-px flex-1 bg-border/60" />
              <span className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">
                {fmtDiaCurto(dia)}
              </span>
              <div className="h-px flex-1 bg-border/60" />
            </div>
            <div className="space-y-2">
              {lotesDoDia.map(lote => (
                <LoteCard key={lote.batchId} lote={lote} onProspectClick={onProspectClick} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoteCard({ lote, onProspectClick }: { lote: Lote; onProspectClick: (p: Prospect) => void }) {
  const { display: displayName } = useUserDisplayNames();
  const [expandido, setExpandido] = useState(false);
  const single = lote.qtd === 1;
  const nichoIcone = iconePorNicho(lote.nicho);
  // Quando ha nicho, usa o icone+cor do nicho como avatar do lote.
  // Sem nicho, fallback pro icone padrao (Plus pra solo, Upload pra lote).
  const avatarBg = lote.nicho ? nichoIcone.bgCor : (single ? "bg-primary/15" : "bg-emerald-500/15");
  const AvatarIcon = lote.nicho ? nichoIcone.Icon : (single ? Plus : Upload);
  const avatarColor = lote.nicho ? nichoIcone.cor : (single ? "text-primary" : "text-emerald-400");
  const autorDisplay = lote.autorId
    ? displayName({ id: lote.autorId, email: lote.autorEmail })
    : (lote.autorEmail ? displayName({ email: lote.autorEmail }) : lote.autorNome);

  const abrirProspect = async (lite: ProspectLite) => {
    const { data } = await supabase
      .from("prospects" as any)
      .select("*")
      .eq("id", lite.id)
      .single();
    if (data) onProspectClick(data as unknown as Prospect);
  };

  return (
    <div className="rounded-xl border border-border bg-card/40 hover:border-primary/30 transition-colors">
      <button
        onClick={() => setExpandido(v => !v)}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <div className={`h-10 w-10 rounded-full ${avatarBg} flex items-center justify-center shrink-0`}>
          <AvatarIcon className={`h-4 w-4 ${avatarColor}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold">
              {single ? `1 lead inserido` : `${lote.qtd} leads importados`}
            </span>
            {lote.nicho && (
              <span className={`text-[11px] inline-flex items-center gap-1 ${nichoIcone.cor} ${nichoIcone.bgCor} border border-current/20 px-1.5 py-0.5 rounded-full`}>
                <nichoIcone.Icon className="h-2.5 w-2.5" />
                {lote.nicho}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <User className="h-2.5 w-2.5" />
              <strong className="text-foreground/80 font-medium">{autorDisplay}</strong>
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock className="h-2.5 w-2.5" />
              {fmtDataHora(lote.criadoEm)}
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span>{tempoAtras(lote.criadoEm)}</span>
          </div>
        </div>

        <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${expandido ? "rotate-180" : ""}`} />
      </button>

      {expandido && (
        <div className="border-t border-border/60 px-3 pb-3 pt-2 space-y-1">
          {lote.leads.map(lead => (
            <button
              key={lead.id}
              onClick={() => abrirProspect(lead)}
              className="w-full text-left rounded-md px-2 py-1.5 hover:bg-card/80 transition-colors group flex items-center gap-2"
            >
              <Target className="h-3 w-3 text-muted-foreground/60 group-hover:text-primary shrink-0" />
              <span className="text-xs font-medium truncate flex-1">{lead.nome}</span>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground shrink-0">
                {lead.whatsapp && <MessageCircle className="h-2.5 w-2.5 text-emerald-400" />}
                {lead.instagram && <Instagram className="h-2.5 w-2.5 text-pink-400" />}
                {lead.telefone && !lead.whatsapp && <Phone className="h-2.5 w-2.5" />}
                <EstagioMiniBadge estagio={lead.estagio} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EstagioMiniBadge({ estagio }: { estagio: Estagio }) {
  const meta = ESTAGIO_META[estagio];
  const cls =
    meta.cor === "amber"   ? "text-amber-400 bg-amber-400/10" :
    meta.cor === "emerald" ? "text-emerald-400 bg-emerald-400/10" :
    meta.cor === "red"     ? "text-red-400 bg-red-400/10" :
                             "text-primary bg-primary/10";
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${cls} ml-1`}>
      {meta.label}
    </span>
  );
}
