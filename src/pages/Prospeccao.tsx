import { useEffect, useMemo, useState } from "react";
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
import { toast } from "sonner";
import {
  Target, RefreshCw, Plus, Search, X, MessageCircle, Phone, Instagram, ExternalLink,
  MapPin, Clock, Star, TrendingUp, ArrowRight, ArrowLeft, History,
  Globe, Trophy, Ban, Mail, Upload, Layers, ChevronDown, ChevronUp, User,
} from "lucide-react";
import { appConfig } from "@/config/app-config";
import { parseLeads, type LeadParsed } from "@/lib/leadParser";
import { useUserDisplayNames } from "@/hooks/useUserDisplayNames";

type Estagio = "aguardando_contato" | "em_cadencia" | "respondeu" | "diagnostico" | "proposta" | "follow_up" | "ganho" | "perdido";

const ESTAGIOS_ORDEM: Estagio[] = [
  "aguardando_contato", "em_cadencia", "respondeu", "diagnostico", "proposta",
];

const ESTAGIO_META: Record<Estagio, { label: string; cor: "primary" | "amber" | "emerald" | "red"; hint: string; acaoLabel: string }> = {
  aguardando_contato: { label: "Aguardando contato",  cor: "amber",   hint: "Leads frios — primeiro contato ainda nao feito.",        acaoLabel: "Iniciar cadencia" },
  em_cadencia:        { label: "Cadência iniciada",   cor: "primary", hint: "Mensagens (Insta/Zap/Call) enviadas, aguardando resposta.", acaoLabel: "Marcar como respondido" },
  respondeu:          { label: "Respondeu",           cor: "primary", hint: "Lead engajou — agendar reunião de diagnóstico.",          acaoLabel: "Agendar diagnóstico" },
  diagnostico:        { label: "Diagnóstico",         cor: "primary", hint: "Reunião de diagnóstico marcada/realizada.",                acaoLabel: "Enviar proposta" },
  proposta:           { label: "Proposta",            cor: "primary", hint: "Proposta entregue, aguardando decisão.",                  acaoLabel: "Marcar ganho" },
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
  cidade: string | null;
  endereco: string | null;
  estagio: Estagio;
  status: "ativo" | "arquivado";
  lista_origem: string | null;
  observacoes: string | null;
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
  const [detalheOpen, setDetalheOpen] = useState<Prospect | null>(null);
  const [busca, setBusca] = useState("");

  const q = useQuery({
    queryKey: ["prospeccao-prospects"],
    queryFn: async (): Promise<Prospect[]> => {
      const { data, error } = await supabase
        .from("prospects" as any)
        .select("*")
        .eq("status", "ativo")
        .order("entrou_na_etapa_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as Prospect[];
    },
    refetchInterval: 30_000,
  });

  const normalizar = (s: string | null | undefined) =>
    (s || "").toString().normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const filtrados = useMemo(() => {
    const lista = q.data || [];
    const t = normalizar(busca).trim();
    if (!t) return lista;
    return lista.filter(p =>
      normalizar(p.nome).includes(t) ||
      normalizar(p.telefone).includes(t) ||
      normalizar(p.instagram).includes(t) ||
      normalizar(p.lista_origem).includes(t) ||
      normalizar(p.cidade).includes(t)
    );
  }, [q.data, busca]);

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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, telefone, instagram, lista ou cidade..."
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

          {q.isLoading ? (
            <div className="text-center text-muted-foreground py-12 text-sm">Carregando…</div>
          ) : (
            <div className="space-y-6">
              {/* Pipeline ativo */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                {ESTAGIOS_ORDEM.map((e) => (
                  <ColunaEstagio
                    key={e}
                    estagio={e}
                    prospects={porEstagio[e]}
                    onCardClick={setDetalheOpen}
                  />
                ))}
              </div>

              {/* Follow-up: coluna propria pra leads aguardando retorno em data agendada */}
              {porEstagio.follow_up.length > 0 && (
                <div className="pt-2 border-t border-border/40">
                  <ColunaEstagio estagio="follow_up" prospects={porEstagio.follow_up} onCardClick={setDetalheOpen} />
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

function ColunaEstagio({
  estagio, prospects, onCardClick, terminal = false,
}: {
  estagio: Estagio;
  prospects: Prospect[];
  onCardClick: (p: Prospect) => void;
  terminal?: boolean;
}) {
  const meta = ESTAGIO_META[estagio];
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
  return (
    <div className="space-y-2 min-w-0">
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
            Vazio.
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

function ProspectCard({ prospect, onClick, terminal }: { prospect: Prospect; onClick: () => void; terminal: boolean }) {
  const { display: displayName } = useUserDisplayNames();
  const dias = diasNaEtapa(prospect.entrou_na_etapa_at);
  // Aging visual: mais velho na etapa = badge ambar (sinaliza follow-up).
  // Acima de 7d em qualquer etapa ativa fica amarelo.
  const stale = !terminal && dias >= 7;
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-3 transition-colors group ${
        terminal
          ? "border-border/40 bg-card/20 hover:bg-card/40"
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
      {prospect.lista_origem && (
        <div className="text-[10px] text-muted-foreground/70 truncate mb-1">
          <span className="opacity-60">de</span> {prospect.lista_origem}
        </div>
      )}
      {prospect.responsavel_email && (
        <div className="inline-flex items-center gap-1 text-[10px] text-primary/90 mb-1">
          <User className="h-2.5 w-2.5" />
          {displayName({ id: prospect.responsavel_id, email: prospect.responsavel_email })}
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
  const [texto, setTexto] = useState("");
  const [listaOrigem, setListaOrigem] = useState("");
  const [cidade, setCidade] = useState("");
  const [parseados, setParseados] = useState<LeadParsed[] | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTexto("");
    setListaOrigem("");
    setCidade("");
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
      cidade: cidade.trim() || null,
      lista_origem: listaOrigem.trim() || null,
      estagio: "aguardando_contato",
      batch_id: batchId,
      created_by: userId,
    }));
    const { error } = await supabase.from("prospects" as any).insert(rows);
    setSaving(false);
    if (error) {
      toast.error("Erro ao inserir: " + error.message);
      return;
    }
    toast.success(`${rows.length} lead${rows.length === 1 ? "" : "s"} cadastrado${rows.length === 1 ? "" : "s"}.`);
    onInserted();
    setTimeout(reset, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) fechar(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Inserir leads
          </DialogTitle>
          <DialogDescription>
            Cole a lista bruta abaixo. O parser identifica nome, telefone, site e Instagram automaticamente.
          </DialogDescription>
        </DialogHeader>

        {!parseados ? (
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Lista (origem) <span className="text-muted-foreground">opcional</span></Label>
                  <Input
                    value={listaOrigem}
                    onChange={(e) => setListaOrigem(e.target.value)}
                    placeholder="ex: Manaus HOF 2026-06"
                  />
                </div>
                <div>
                  <Label className="text-xs">Cidade <span className="text-muted-foreground">opcional</span></Label>
                  <Input
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    placeholder="ex: Manaus"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={fechar}>Cancelar</Button>
              <Button onClick={fazerPreview}>Processar e revisar →</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-2 pt-1">
              <div className="text-xs text-muted-foreground">
                <strong className="text-foreground">{parseados.length}</strong> leads extraídos. Revise antes de salvar — você pode editar nome ou remover entradas.
              </div>
              <div className="rounded-lg border border-border divide-y divide-border/60 max-h-[40vh] overflow-y-auto">
                {parseados.map((p, i) => (
                  <div key={i} className="p-2.5 space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <Input
                        value={p.nome}
                        onChange={(e) => editarParsedoNome(i, e.target.value)}
                        className="h-7 text-xs font-semibold flex-1"
                      />
                      <button
                        onClick={() => removerParseado(i)}
                        className="text-muted-foreground hover:text-red-400 transition-colors"
                        title="Remover este lead"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap pl-1">
                      {p.telefone && <span><Phone className="inline h-2.5 w-2.5 mr-0.5" /> {p.telefone}</span>}
                      {p.email && <span className="truncate max-w-[160px]"><Mail className="inline h-2.5 w-2.5 mr-0.5" /> {p.email}</span>}
                      {p.instagram && <span><Instagram className="inline h-2.5 w-2.5 mr-0.5 text-pink-400" /> @{p.instagram}</span>}
                      {p.site && <span><Globe className="inline h-2.5 w-2.5 mr-0.5" /> {(() => { try { return new URL(p.site!).hostname.replace(/^www\./, ""); } catch { return p.site; } })()}</span>}
                      {p.google_maps_url && <span><MapPin className="inline h-2.5 w-2.5 mr-0.5 text-emerald-400" /> Maps</span>}
                      {p.endereco && <span className="truncate max-w-[200px]"><MapPin className="inline h-2.5 w-2.5 mr-0.5" /> {p.endereco}</span>}
                      {p.avaliacao != null && <span><Star className="inline h-2.5 w-2.5 mr-0.5 text-amber-400 fill-amber-400" /> {p.avaliacao.toFixed(1)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <DialogFooter className="gap-2">
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
  const { display: displayName } = useUserDisplayNames();

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

  const waDigits = prospect.whatsapp ? prospect.whatsapp.replace(/\D/g, "") : "";
  const waLink = prospect.whatsapp
    ? (prospect.whatsapp.startsWith("http") ? prospect.whatsapp : `https://wa.me/${waDigits}`)
    : null;
  const igLink = prospect.instagram ? `https://instagram.com/${prospect.instagram}` : null;
  const telLink = prospect.telefone ? `tel:${prospect.telefone.replace(/\D/g, "")}` : null;

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
            {prospect.lista_origem && (
              <span className="text-[11px] text-muted-foreground">· {prospect.lista_origem}</span>
            )}
            {prospect.responsavel_email && (
              <span className="text-[11px] inline-flex items-center gap-1 text-primary">
                <User className="h-3 w-3" /> {displayName({ id: prospect.responsavel_id, email: prospect.responsavel_email })}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* CANAIS PROTAGONISTAS — WhatsApp + Instagram (maiores, coloridos) */}
        {(waLink || igLink) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pb-2">
            {waLink && (
              <ContatoBtn href={waLink} icon={MessageCircle} label="WhatsApp"
                cor="emerald" big sub={prospect.telefone || waDigits} />
            )}
            {igLink && (
              <ContatoBtn href={igLink} icon={Instagram} label="Instagram"
                cor="pink" big sub={`@${prospect.instagram}`} />
            )}
          </div>
        )}
        {/* Canais secundarios — cinza, menores */}
        {(telLink && !waLink) || prospect.google_maps_url || prospect.email || prospect.site ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {telLink && !waLink && (
              <ContatoBtn href={telLink} icon={Phone} label="Ligar"
                cor="muted" sub={prospect.telefone || ""} />
            )}
            {prospect.google_maps_url && (
              <ContatoBtn href={prospect.google_maps_url} icon={MapPin} label="Maps"
                cor="muted" sub="Abrir local" />
            )}
            {prospect.email && (
              <ContatoBtn href={`mailto:${prospect.email}`} icon={Mail} label="E-mail"
                cor="muted" sub={prospect.email} />
            )}
            {prospect.site && (
              <ContatoBtn href={prospect.site} icon={Globe} label="Site"
                cor="muted"
                sub={(() => { try { return new URL(prospect.site!).hostname.replace(/^www\./, ""); } catch { return prospect.site!; } })()} />
            )}
          </div>
        ) : null}

        {/* Metainfo compacta (avaliacao, endereco, horario) */}
        {(prospect.avaliacao != null || prospect.endereco || prospect.horario_funcionamento) && (
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground border-y border-border/40 py-2 flex-wrap">
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
              <span className="inline-flex items-center gap-1 truncate max-w-[300px]">
                <Clock className="h-3 w-3" /> {prospect.horario_funcionamento}
              </span>
            )}
          </div>
        )}

        {/* CHECKLIST DE CADENCIA — só aparece em em_cadencia. Cada clique
            publica no chat como evento de contato (todos veem). */}
        {prospect.estagio === "em_cadencia" && (
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-2.5 space-y-1.5">
            <div className="text-[10px] uppercase tracking-[0.15em] text-primary/90 font-semibold flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Registrar contato realizado
            </div>
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
          </div>
        )}

        {/* AÇÕES DE FUNIL — Voltar discreto no topo + Avançar/Follow/Arquivar
            do mesmo tamanho, distribuídos em 3 colunas iguais. */}
        {prospect.estagio !== "ganho" && prospect.estagio !== "perdido" && (
          <div className="space-y-2">
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
            <div className="grid grid-cols-3 gap-2">
              {proximoEstagio ? (
                <button
                  onClick={() => mover(proximoEstagio)}
                  className="inline-flex items-center justify-center gap-1.5 px-2 h-9 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 text-xs text-primary font-medium transition-colors"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  Avançar etapa
                </button>
              ) : (
                <div />
              )}
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
          </div>
        )}

        {/* Mini-form pra agendar follow-up (inline, expansivel) */}
        {followUpOpen && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 space-y-2">
            <div className="text-[11px] uppercase tracking-[0.12em] text-amber-400/90 font-semibold flex items-center gap-1">
              <Clock className="h-3 w-3" /> Quando retomar este lead?
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="date"
                min={minDate}
                value={followUpData}
                onChange={(e) => setFollowUpData(e.target.value)}
                className="h-9 w-auto"
              />
              <Input
                type="time"
                value={followUpHora}
                onChange={(e) => setFollowUpHora(e.target.value)}
                className="h-9 w-auto"
              />
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

        {/* CHAT DE NOTAS */}
        <div className="space-y-2 pt-2">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
            <History className="h-3 w-3" /> Histórico de notas
          </div>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Botão de contato grande com ícone + label + sub. Usado no topo do
// ProspectDetalheDialog. `big` é pros canais protagonistas (WA/Insta);
// cor="muted" pros secundarios (cinza).
function ContatoBtn({
  href, icon: Icon, label, sub, cor, big,
}: {
  href: string;
  icon: any;
  label: string;
  sub: string;
  cor: "emerald" | "primary" | "pink" | "muted";
  big?: boolean;
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
  const corCls =
    cor === "emerald" ? "border-emerald-500/40 text-emerald-400" :
    cor === "pink"    ? "border-pink-500/40 text-pink-400" :
                        "border-primary/40 text-primary";
  const feitoCls = feito
    ? cor === "emerald" ? "bg-emerald-500/20" :
      cor === "pink"    ? "bg-pink-500/20" :
                          "bg-primary/20"
    : "bg-card/40 hover:bg-card/60";
  return (
    <button
      onClick={onClick}
      disabled={disabled || feito}
      className={`flex items-center justify-center gap-1.5 px-2 h-8 rounded-md border text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${corCls} ${feitoCls}`}
      title={feito ? "Já registrado" : disabled ? "Sem dado pra esse canal" : `Marcar ${label} como contatado`}
    >
      {feito ? <span className="font-bold">✓</span> : <Icon className="h-3.5 w-3.5" />}
      {label}
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
  } else if (ev.tipo === "status") {
    conteudo = <><strong className="text-foreground/70">{who}</strong> {ev.texto || "atualizou status"}</>;
  } else if (ev.tipo === "contato") {
    // Eventos de cadencia vem como "cadencia.wa|Mensagem enviada..."
    // — strip do prefixo na exibicao.
    const texto = (ev.texto || "").replace(/^cadencia\.(wa|insta|tel)\|/, "");
    conteudo = <><strong className="text-foreground/70">{who}</strong> ✓ {texto || "registrou contato"}</>;
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
  lista_origem: string | null;
  cidade: string | null;
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
  autorEmail: string | null;
  autorNome: string;
  listaOrigem: string | null;
  cidade: string | null;
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
        .select("id, nome, batch_id, lista_origem, cidade, created_at, created_by, estagio, whatsapp, instagram, telefone")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const prospects = (rows || []) as unknown as ProspectLite[];
      if (prospects.length === 0) return [];

      // 2) email do autor via prospect_eventos (trigger grava 'criado' com user_email)
      const ids = prospects.map(p => p.id);
      const { data: eventos } = await supabase
        .from("prospect_eventos" as any)
        .select("prospect_id, user_email")
        .eq("tipo", "criado")
        .in("prospect_id", ids);
      const emailPorProspect: Record<string, string> = {};
      for (const ev of (eventos || []) as any[]) {
        if (ev.user_email) emailPorProspect[ev.prospect_id] = ev.user_email;
      }

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
        const email = emailPorProspect[primeiro.id] || null;
        const nomeAutor = email ? email.split("@")[0] : "Sistema";
        lotes.push({
          batchId,
          criadoEm: primeiro.created_at,
          autorEmail: email,
          autorNome: nomeAutor,
          listaOrigem: primeiro.lista_origem,
          cidade: primeiro.cidade,
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
  const iconBg = single ? "bg-primary/15" : "bg-emerald-500/15";
  const iconColor = single ? "text-primary" : "text-emerald-400";
  const autorDisplay = lote.autorEmail ? displayName({ email: lote.autorEmail }) : lote.autorNome;

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
        <div className={`h-10 w-10 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>
          {single
            ? <Plus className={`h-4 w-4 ${iconColor}`} />
            : <Upload className={`h-4 w-4 ${iconColor}`} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-semibold">
              {single ? `1 lead inserido` : `${lote.qtd} leads importados`}
            </span>
            {lote.listaOrigem && (
              <span className="text-[11px] inline-flex items-center gap-1 text-primary/90 bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full">
                <Target className="h-2.5 w-2.5" />
                {lote.listaOrigem}
              </span>
            )}
            {lote.cidade && (
              <span className="text-[11px] inline-flex items-center gap-1 text-muted-foreground">
                <MapPin className="h-2.5 w-2.5" />
                {lote.cidade}
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
