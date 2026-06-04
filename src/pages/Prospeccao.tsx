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
import { toast } from "sonner";
import {
  Target, RefreshCw, Plus, Search, X, MessageCircle, Phone, Instagram, ExternalLink,
  MapPin, Clock, Star, TrendingUp, ArrowRight, ArrowLeft, History,
  Globe, Trophy, Ban, Mail,
} from "lucide-react";
import { appConfig } from "@/config/app-config";
import { parseLeads, type LeadParsed } from "@/lib/leadParser";

type Estagio = "aguardando_contato" | "em_cadencia" | "respondeu" | "diagnostico" | "proposta" | "ganho" | "perdido";

const ESTAGIOS_ORDEM: Estagio[] = [
  "aguardando_contato", "em_cadencia", "respondeu", "diagnostico", "proposta",
];

const ESTAGIO_META: Record<Estagio, { label: string; cor: "primary" | "amber" | "emerald" | "red"; hint: string; acaoLabel: string }> = {
  aguardando_contato: { label: "Aguardando contato",  cor: "amber",   hint: "Leads frios — primeiro contato ainda nao feito.",        acaoLabel: "Iniciar cadencia" },
  em_cadencia:        { label: "Em cadência",         cor: "primary", hint: "Mensagens (Insta/Zap/Call) enviadas, aguardando resposta.", acaoLabel: "Marcar como respondido" },
  respondeu:          { label: "Respondeu",           cor: "primary", hint: "Lead engajou — agendar reunião de diagnóstico.",          acaoLabel: "Agendar diagnóstico" },
  diagnostico:        { label: "Diagnóstico",         cor: "primary", hint: "Reunião de diagnóstico marcada/realizada.",                acaoLabel: "Enviar proposta" },
  proposta:           { label: "Proposta",            cor: "primary", hint: "Proposta entregue, aguardando decisão.",                  acaoLabel: "Marcar ganho" },
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
      diagnostico: [], proposta: [], ganho: [], perdido: [],
    };
    for (const p of filtrados) grupos[p.estagio].push(p);
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

          {/* Terminais (ganho / perdido) compactos abaixo */}
          {(porEstagio.ganho.length > 0 || porEstagio.perdido.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/40">
              <ColunaEstagio estagio="ganho"   prospects={porEstagio.ganho}   onCardClick={setDetalheOpen} terminal />
              <ColunaEstagio estagio="perdido" prospects={porEstagio.perdido} onCardClick={setDetalheOpen} terminal />
            </div>
          )}
        </div>
      )}

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

  const eventosQ = useQuery({
    queryKey: ["prospect-eventos", prospect?.id],
    enabled: !!prospect,
    queryFn: async (): Promise<Evento[]> => {
      if (!prospect) return [];
      const { data, error } = await supabase
        .from("prospect_eventos" as any)
        .select("id, tipo, de_estagio, para_estagio, texto, user_email, created_at")
        .eq("prospect_id", prospect.id)
        .order("created_at", { ascending: false })
        .limit(50);
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
    const { error } = await supabase.from("prospects" as any)
      .update({ estagio: para, ultimo_contato_at: new Date().toISOString() })
      .eq("id", prospect.id);
    if (error) { toast.error(error.message); return; }
    await logEvento("movido", { de_estagio: de, para_estagio: para });
    toast.success(`Movido para "${ESTAGIO_META[para].label}".`);
    eventosQ.refetch();
    onChanged();
    onClose();
  };

  const finalizar = async (resultado: "ganho" | "perdido") => {
    if (!prospect) return;
    const { error } = await supabase.from("prospects" as any)
      .update({ estagio: resultado })
      .eq("id", prospect.id);
    if (error) { toast.error(error.message); return; }
    await logEvento("status", { de_estagio: prospect.estagio, para_estagio: resultado });
    toast.success(resultado === "ganho" ? "Lead marcado como Ganho 🎉" : "Lead marcado como Perdido.");
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
    toast.success("Nota adicionada.");
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

  const waLink = prospect.whatsapp
    ? prospect.whatsapp.startsWith("http") ? prospect.whatsapp : `https://wa.me/${prospect.whatsapp.replace(/\D/g, "")}`
    : null;
  const igLink = prospect.instagram ? `https://instagram.com/${prospect.instagram}` : null;

  return (
    <Dialog open={!!prospect} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2">
            <Target className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <span className="break-words">{prospect.nome}</span>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 flex-wrap">
            <EstagioBadge estagio={prospect.estagio} />
            <span className="text-[11px]">há {tempoNaEtapa(prospect.entrou_na_etapa_at)} na etapa</span>
            {prospect.lista_origem && (
              <span className="text-[11px] text-muted-foreground">· {prospect.lista_origem}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Contatos */}
        <div className="space-y-1.5 rounded-lg border border-border bg-card/30 p-3">
          {prospect.telefone && (
            <InfoRow icon={Phone} label="Telefone" value={prospect.telefone} />
          )}
          {waLink && (
            <InfoRow icon={MessageCircle} label="WhatsApp" value={
              <a href={waLink} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline inline-flex items-center gap-1">
                Abrir conversa <ExternalLink className="h-3 w-3" />
              </a>
            } />
          )}
          {igLink && (
            <InfoRow icon={Instagram} label="Instagram" value={
              <a href={igLink} target="_blank" rel="noreferrer" className="text-pink-400 hover:underline inline-flex items-center gap-1">
                @{prospect.instagram} <ExternalLink className="h-3 w-3" />
              </a>
            } />
          )}
          {prospect.email && (
            <InfoRow icon={Mail} label="E-mail" value={
              <a href={`mailto:${prospect.email}`} className="text-primary hover:underline break-all">
                {prospect.email}
              </a>
            } />
          )}
          {prospect.site && (
            <InfoRow icon={Globe} label="Site" value={
              <a href={prospect.site} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 break-all">
                {(() => { try { return new URL(prospect.site!).hostname.replace(/^www\./, ""); } catch { return prospect.site; } })()} <ExternalLink className="h-3 w-3" />
              </a>
            } />
          )}
          {prospect.endereco && (
            <InfoRow icon={MapPin} label="Endereço" value={
              <span className="text-[12px] text-foreground/90 break-words">{prospect.endereco}</span>
            } />
          )}
          {prospect.google_maps_url && (
            <InfoRow icon={MapPin} label="Maps" value={
              <a href={prospect.google_maps_url} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline inline-flex items-center gap-1">
                Abrir no Google Maps <ExternalLink className="h-3 w-3" />
              </a>
            } />
          )}
          {prospect.avaliacao != null && (
            <InfoRow icon={Star} label="Avaliação" value={
              <span className="inline-flex items-center gap-1 text-amber-400">
                <Star className="h-3 w-3 fill-amber-400" /> {prospect.avaliacao.toFixed(1)}
              </span>
            } />
          )}
          {prospect.horario_funcionamento && (
            <InfoRow icon={Clock} label="Horário" value={
              <span className="text-[11px] text-muted-foreground line-clamp-2">{prospect.horario_funcionamento}</span>
            } />
          )}
        </div>

        {/* Ações de avanço/recuo */}
        {prospect.estagio !== "ganho" && prospect.estagio !== "perdido" && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Mover</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {proximoEstagio && (
                <Button onClick={() => mover(proximoEstagio)} className="justify-start gap-2 h-auto py-2.5">
                  <ArrowRight className="h-4 w-4" />
                  <div className="text-left text-[11px]">
                    <p className="font-medium">{ESTAGIO_META[prospect.estagio].acaoLabel}</p>
                    <p className="opacity-70">→ {ESTAGIO_META[proximoEstagio].label}</p>
                  </div>
                </Button>
              )}
              {estagioAnterior && (
                <Button variant="outline" onClick={() => mover(estagioAnterior)} className="justify-start gap-2 h-auto py-2.5">
                  <ArrowLeft className="h-4 w-4" />
                  <div className="text-left text-[11px]">
                    <p className="font-medium">Voltar etapa</p>
                    <p className="opacity-70">← {ESTAGIO_META[estagioAnterior].label}</p>
                  </div>
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => finalizar("ganho")}
                className="justify-start gap-2 border-emerald-500/40 hover:border-emerald-500/60 hover:bg-emerald-500/10 text-emerald-400"
              >
                <Trophy className="h-4 w-4" /> Marcar como Ganho
              </Button>
              <Button
                variant="outline"
                onClick={() => finalizar("perdido")}
                className="justify-start gap-2 border-red-500/30 hover:border-red-500/50 hover:bg-red-500/10 text-red-400"
              >
                <Ban className="h-4 w-4" /> Marcar como Perdido
              </Button>
            </div>
          </div>
        )}

        {/* Nota */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Adicionar nota</div>
          <div className="flex items-end gap-2">
            <Textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              placeholder="Ex.: Pediu pra retornar quinta. Tem interesse mas precisa falar com o sócio."
              className="resize-none text-xs"
            />
            <Button size="sm" onClick={salvarNota} disabled={salvandoNota || !nota.trim()}>
              {salvandoNota ? "..." : "Salvar"}
            </Button>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1">
            <History className="h-3 w-3" /> Histórico
          </div>
          <div className="rounded-lg border border-border bg-card/30 divide-y divide-border/40 max-h-60 overflow-y-auto">
            {(eventosQ.data || []).length === 0 ? (
              <p className="text-[11px] italic text-muted-foreground/60 px-3 py-4 text-center">Sem eventos ainda.</p>
            ) : (
              (eventosQ.data || []).map((e) => <EventoLinha key={e.id} ev={e} />)
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[12px]">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <span className="text-muted-foreground w-20 shrink-0 text-[11px]">{label}</span>
      <span className="flex-1 break-words">{value}</span>
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

function EventoLinha({ ev }: { ev: Evento }) {
  const quando = new Date(ev.created_at);
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(quando);
  const who = (ev.user_email || "").split("@")[0] || "Sistema";
  let conteudo: React.ReactNode = null;
  if (ev.tipo === "criado") {
    conteudo = <span><strong>{who}</strong> criou o lead</span>;
  } else if (ev.tipo === "movido" && ev.de_estagio && ev.para_estagio) {
    const de = ESTAGIO_META[ev.de_estagio as Estagio]?.label || ev.de_estagio;
    const pa = ESTAGIO_META[ev.para_estagio as Estagio]?.label || ev.para_estagio;
    conteudo = <span><strong>{who}</strong> moveu {de} → <span className="text-foreground">{pa}</span></span>;
  } else if (ev.tipo === "status" && ev.para_estagio) {
    const pa = ESTAGIO_META[ev.para_estagio as Estagio]?.label || ev.para_estagio;
    conteudo = <span><strong>{who}</strong> finalizou como <span className="text-foreground">{pa}</span></span>;
  } else if (ev.tipo === "nota") {
    conteudo = <span><strong>{who}</strong>: <span className="text-foreground/90 whitespace-pre-wrap">{ev.texto}</span></span>;
  } else if (ev.tipo === "contato") {
    conteudo = <span><strong>{who}</strong> registrou contato: {ev.texto}</span>;
  }
  return (
    <div className="px-3 py-2 text-[11px] flex items-start gap-2">
      <span className="text-muted-foreground tabular-nums shrink-0 mt-0.5">{fmt}</span>
      <span className="flex-1 text-muted-foreground">{conteudo}</span>
    </div>
  );
}
