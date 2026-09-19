import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { appConfig } from "@/config/app-config";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Ticket, Plus, Bug, Sparkles, Lightbulb, HelpCircle, MoreHorizontal,
  CircleDot, Loader2, CheckCircle2, LayoutGrid, Link2, Clock, User, Search, X,
  LayoutDashboard, Users, FileSignature, Workflow, Newspaper, Briefcase,
  ListTodo, PenSquare, ScanSearch, Target, Trophy, Eye, Bell, LogIn, Paperclip, type LucideIcon,
} from "lucide-react";
import { ConversaDoChamado } from "@/components/chamados/ConversaDoChamado";
import { SpotlightCard } from "@/components/SpotlightCard";
import { GravadorDeAudio } from "@/components/atendimento/GravadorDeAudio";
import { mandarAnexo } from "@/hooks/useChamadoMensagens";
import { tamanhoBonito } from "@/lib/comprimirAnexo";

/* ── Catálogos ───────────────────────────────────────────────────────────────
 *
 * UMA COR SÓ, a do tema de quem está usando. O que separa uma categoria da
 * outra é o SÍMBOLO e o NOME, que é o que a pessoa lê de qualquer jeito.
 *
 * A versão anterior dava uma cor a cada coisa: bug vermelho, melhoria azul,
 * ideia âmbar, dúvida violeta, em andamento azul de novo. Com cinco tipos e
 * três status na mesma tela, a grade virava um mostruário, e nenhuma daquelas
 * cores significava nada: vermelho num bug não quer dizer urgente, e azul em
 * "melhoria" não quer dizer coisa nenhuma. Cor que não carrega informação
 * rouba a atenção de quem carrega.
 *
 * A ÚNICA EXCEÇÃO É O RESOLVIDO, e ela não é uma segunda cor: é a ausência
 * dela. O chamado fechado sai de cena, e apagá-lo é o que faz os abertos
 * saltarem numa lista onde os dois convivem.
 */
const CHIP = "text-primary bg-primary/[0.12] ring-primary/25";
const CHIP_APAGADO = "text-muted-foreground bg-white/[0.04] ring-white/10";

const TIPOS = [
  { key: "bug",      label: "Bug",      icon: Bug,            cls: CHIP },
  { key: "melhoria", label: "Melhoria", icon: Sparkles,       cls: CHIP },
  { key: "ideia",    label: "Ideia",    icon: Lightbulb,      cls: CHIP },
  { key: "duvida",   label: "Dúvida",   icon: HelpCircle,     cls: CHIP },
  { key: "outro",    label: "Outro",    icon: MoreHorizontal, cls: CHIP },
] as const;

const STATUS = {
  aberto:       { label: "Aberto",       icon: CircleDot,    cls: CHIP },
  // O rodopio do ícone já diz "andando". Era ele que informava; o azul era enfeite.
  em_andamento: { label: "Em andamento", icon: Loader2,      cls: CHIP },
  resolvido:    { label: "Resolvido",    icon: CheckCircle2, cls: CHIP_APAGADO },
} as const;

const TABS = [
  { key: "aberto",       label: "Abertos" },
  { key: "em_andamento", label: "Em andamento" },
  { key: "resolvido",    label: "Resolvidos" },
  { key: "todos",        label: "Todos" },
] as const;

// Abas/áreas do sistema com o ícone de cada uma (mesmos da barra lateral).
const SISTEMAS: { label: string; icon: LucideIcon }[] = [
  { label: "Geral / não sei", icon: LayoutGrid },
  { label: "Dashboard",       icon: LayoutDashboard },
  { label: "Clientes",        icon: Users },
  { label: "Pré-clientes",    icon: FileSignature },
  { label: "Esteira",         icon: Workflow },
  { label: "Publicações",     icon: Newspaper },
  { label: "Processos",       icon: Briefcase },
  { label: "Tarefas",         icon: ListTodo },
  { label: "Writer",          icon: PenSquare },
  { label: "Finder",          icon: ScanSearch },
  { label: "Prospecção",      icon: Target },
  { label: "Fechamentos",     icon: Trophy },
  { label: "Tracker",         icon: Eye },
  { label: "Notificações",    icon: Bell },
  { label: "Chamados",        icon: Ticket },
  { label: "Login / acesso",  icon: LogIn },
  { label: "Outros",          icon: MoreHorizontal },
];
const sistemaIcon = (nome: string | null): LucideIcon =>
  SISTEMAS.find((s) => s.label === nome)?.icon || LayoutGrid;

interface Chamado {
  id: string;
  titulo: string;
  tipo: "bug" | "melhoria" | "ideia" | "duvida" | "outro";
  sistema: string | null;
  referencia: string | null;
  observacoes: string | null;
  status: "aberto" | "em_andamento" | "resolvido";
  created_by: string;
  autor_nome: string | null;
  resolvido_por: string | null;
  resolvido_por_nome: string | null;
  resolvido_em: string | null;
  resolucao: string | null;
  created_at: string;
  updated_at: string;
}

function tempoAtras(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}
const tipoMeta = (t: string) => TIPOS.find((x) => x.key === t) || TIPOS[0];

export default function Chamados() {
  useEffect(() => { document.title = `Chamados · ${appConfig.name}`; }, []);
  const qc = useQueryClient();
  const { user, profile, isAdmin } = useAuth();
  const [abrir, setAbrir] = useState(false);
  const [detalhe, setDetalhe] = useState<Chamado | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("aberto");
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const { data: chamados = [], isLoading } = useQuery({
    queryKey: ["chamados"],
    queryFn: async (): Promise<Chamado[]> => {
      const { data, error } = await (supabase.from("chamados" as any) as any)
        .select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("chamados-hub")
      .on("postgres_changes", { event: "*", schema: "public", table: "chamados" }, () => {
        qc.invalidateQueries({ queryKey: ["chamados"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const porTab = useMemo(
    () => chamados.filter((c) => (tab === "todos" ? true : c.status === tab)),
    [chamados, tab],
  );
  const lista = useMemo(() => {
    const s = busca.trim().toLowerCase();
    return porTab.filter((c) => {
      if (filtroTipo && c.tipo !== filtroTipo) return false;
      if (!s) return true;
      return [c.titulo, c.observacoes, c.autor_nome, c.sistema, c.referencia]
        .some((v) => (v || "").toLowerCase().includes(s));
    });
  }, [porTab, filtroTipo, busca]);

  const countTab = (k: string) => (k === "todos" ? chamados.length : chamados.filter((c) => c.status === k).length);
  const countTipo = (t: string) => porTab.filter((c) => c.tipo === t).length;

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Ticket className="h-6 w-6 text-primary" /> Chamados
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Achou um bug, quer uma melhoria ou teve uma ideia? Abre um chamado. Fica tudo aqui
            à vista de quem vai resolver.
          </p>
        </div>
        <Button onClick={() => setAbrir(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Abrir chamado
        </Button>
      </header>

      {/* Abas de status (estilo pré-clientes) */}
      <div className="inline-flex rounded-xl bg-white/[0.03] border border-white/[0.07] p-1">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                on ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span className={`tabular-nums text-[10px] ${on ? "opacity-80" : "opacity-60"}`}>{countTab(t.key)}</span>
            </button>
          );
        })}
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por título, observação, autor, aba ou referência…"
          className="pl-9"
        />
      </div>

      {/* Filtro por tipo */}
      <div className="flex flex-wrap items-center gap-2">
        {TIPOS.map((t) => {
          const on = filtroTipo === t.key;
          const n = countTipo(t.key);
          return (
            <button
              key={t.key}
              onClick={() => setFiltroTipo(on ? null : t.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs ring-1 transition-colors ${
                on ? t.cls : "bg-white/[0.03] text-muted-foreground ring-white/10 hover:ring-white/25"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" /> {t.label}
              <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
        {filtroTipo && (
          <button onClick={() => setFiltroTipo(null)} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <X className="h-3 w-3" /> limpar
          </button>
        )}
      </div>

      {/* Lista */}
      {isLoading ? (
        <p className="text-center text-sm text-muted-foreground py-16">Carregando…</p>
      ) : lista.length === 0 ? (
        <div className="text-center py-16">
          <Ticket className="h-10 w-10 text-muted-foreground/25 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {tab === "resolvido" ? "Nenhum chamado resolvido ainda."
              : tab === "todos" ? "Nenhum chamado ainda."
              : "Nada por aqui. Tudo em ordem 🎉"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {lista.map((c) => (
            <ChamadoCard key={c.id} c={c} onClick={() => setDetalhe(c)} />
          ))}
        </div>
      )}

      <AbrirChamadoDialog
        open={abrir}
        onOpenChange={setAbrir}
        onCriado={() => qc.invalidateQueries({ queryKey: ["chamados"] })}
        userId={user?.id || null}
        autorNome={profile?.nome || profile?.email || null}
      />

      <DetalheDialog
        chamado={detalhe}
        onOpenChange={(o) => { if (!o) setDetalhe(null); }}
        podeResolver={isAdmin}
        meuId={user?.id || null}
        meuNome={profile?.nome || profile?.email || null}
        onMudou={() => qc.invalidateQueries({ queryKey: ["chamados"] })}
        setDetalhe={setDetalhe}
      />
    </div>
  );
}

// ── Card (estilo pré-clientes: largura cheia, badge de status, metadados) ─────
function ChamadoCard({ c, onClick }: { c: Chamado; onClick: () => void }) {
  const t = tipoMeta(c.tipo);
  const st = STATUS[c.status];
  const SisIcon = sistemaIcon(c.sistema);
  return (
    /* O MESMO CARTÃO DO PAINEL, com o brilho que segue o ponteiro. A grade de
       chamados é uma tela de escolher: a pessoa passa o mouse procurando o
       dela, e o cartão que acende sob o cursor é o que diz "é este que você
       vai abrir". A borda dura de antes não dizia nada até o clique. */
    <SpotlightCard
      onClick={onClick}
      comoBotao
      rotulo={`Abrir chamado ${c.titulo}`}
      className="h-full p-4 rounded-xl flex flex-col text-left"
    >
      {/* topo: tipo + status */}
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] ring-1 shrink-0 ${t.cls}`}>
          <t.icon className="h-3 w-3" /> {t.label}
        </span>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] ring-1 shrink-0 ${st.cls}`}>
          <st.icon className={`h-3 w-3 ${c.status === "em_andamento" ? "animate-spin" : ""}`} /> {st.label}
        </span>
      </div>

      {/* corpo: título + observação (cresce para alinhar os rodapés) */}
      <div className="flex-1 min-h-0 mt-2.5">
        <h3 className="text-[13.5px] font-semibold text-foreground leading-snug line-clamp-2">{c.titulo}</h3>
        {c.observacoes && (
          <p className="text-[11.5px] text-muted-foreground mt-1.5 line-clamp-3 whitespace-pre-line leading-snug">{c.observacoes}</p>
        )}
      </div>

      {/* rodapé: sistema, referência, autor e tempo */}
      <div className="mt-3 pt-2.5 border-t border-white/[0.06] text-[10.5px] text-muted-foreground space-y-1">
        <div className="flex items-center gap-x-2.5 gap-y-1 flex-wrap">
          <span className="inline-flex items-center gap-1"><SisIcon className="h-3 w-3 shrink-0" /> {c.sistema || "Geral"}</span>
          {c.referencia && (
            <span className="inline-flex items-center gap-1 min-w-0"><Link2 className="h-3 w-3 shrink-0" /> <span className="truncate max-w-[140px]">{c.referencia}</span></span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 min-w-0"><User className="h-3 w-3 shrink-0" /> <span className="truncate">{c.autor_nome || "Alguém"}</span></span>
          <span className="inline-flex items-center gap-1 shrink-0"><Clock className="h-3 w-3" /> {tempoAtras(c.created_at)}</span>
        </div>
      </div>
    </SpotlightCard>
  );
}

// ── Seletor de processo (só aparece quando a aba é Processos) ─────────────────
function RefProcessoPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [q, setQ] = useState(value);
  const [aberto, setAberto] = useState(false);

  const { data: procs = [] } = useQuery({
    queryKey: ["chamados-processos-lookup"],
    queryFn: async (): Promise<{ id: string; numero_processo: string | null; clientes: { nome: string | null } | null }[]> => {
      const { data, error } = await supabase
        .from("processos")
        .select("id, numero_processo, clientes(nome)")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data || []) as any;
    },
  });

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return procs
      .filter((p) => (p.numero_processo || "").toLowerCase().includes(s) || (p.clientes?.nome || "").toLowerCase().includes(s))
      .slice(0, 8);
  }, [q, procs]);

  const inputCls = "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-primary/50";

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); onChange(e.target.value); setAberto(true); }}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        className={inputCls}
        placeholder="Busque pelo número do processo ou nome do cliente"
      />
      {aberto && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/10 bg-card/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] max-h-56 overflow-y-auto scrollbar-thin">
          {results.map((p) => {
            const label = `${p.numero_processo || "sem número"} · ${p.clientes?.nome || "sem cliente"}`;
            return (
              <button
                key={p.id}
                onMouseDown={(e) => { e.preventDefault(); setQ(label); onChange(label); setAberto(false); }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-white/[0.05] flex items-center gap-2"
              >
                <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="font-mono">{p.numero_processo || "sem número"}</span>
                <span className="text-muted-foreground truncate">· {p.clientes?.nome || "sem cliente"}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Abrir chamado ─────────────────────────────────────────────────────────────
function AbrirChamadoDialog({
  open, onOpenChange, onCriado, userId, autorNome,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCriado: () => void;
  userId: string | null;
  autorNome: string | null;
}) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<string>("bug");
  const [sistema, setSistema] = useState<string>(SISTEMAS[0].label);
  const [referencia, setReferencia] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  /* Os anexos esperam AQUI até o chamado existir: sem id não há pasta para
     onde subir, e criar o chamado antes de a pessoa confirmar deixaria
     chamado vazio no quadro toda vez que alguém desistisse no meio. */
  const [anexos, setAnexos] = useState<{ arquivo: File | Blob; nome: string; duracao?: number | null; url?: string }[]>([]);
  const seletor = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitulo(""); setTipo("bug"); setSistema(SISTEMAS[0].label);
      setReferencia(""); setObservacoes("");
      setAnexos((v) => { v.forEach((a) => a.url && URL.revokeObjectURL(a.url)); return []; });
    }
  }, [open]);

  const juntarAnexos = (lista: FileList | null) => {
    const novos = Array.from(lista || []).map((f) => ({
      arquivo: f, nome: f.name,
      url: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
    }));
    if (novos.length) setAnexos((v) => [...v, ...novos]);
  };

  const tirarAnexo = (i: number) => setAnexos((v) => {
    v[i]?.url && URL.revokeObjectURL(v[i].url!);
    return v.filter((_, j) => j !== i);
  });

  const colarPrint = (e: React.ClipboardEvent) => {
    const img = Array.from(e.clipboardData?.items || [])
      .find((i) => i.kind === "file" && i.type.startsWith("image/"))?.getAsFile();
    if (!img) return;
    e.preventDefault();
    const nome = img.name && img.name !== "image.png"
      ? img.name
      : `print-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
    const arquivo = new File([img], nome, { type: img.type });
    setAnexos((v) => [...v, { arquivo, nome, url: URL.createObjectURL(arquivo) }]);
  };

  // Referência (busca na base de processos) só faz sentido em Processos.
  const ehProcessos = sistema === "Processos";
  useEffect(() => { if (!ehProcessos) setReferencia(""); }, [ehProcessos]);

  const criar = async () => {
    if (!titulo.trim()) { toast.error("Dá um título pro chamado."); return; }
    setSalvando(true);
    const { data, error } = await (supabase.from("chamados" as any) as any).insert({
      titulo: titulo.trim(),
      tipo, sistema,
      referencia: ehProcessos ? (referencia.trim() || null) : null,
      observacoes: observacoes.trim() || null,
      created_by: userId,
      autor_nome: autorNome,
    }).select("id").single();
    if (error) { setSalvando(false); toast.error("Erro ao abrir: " + error.message); return; }

    /* OS ANEXOS SOBEM DEPOIS, com o chamado já criado.
       Um que falhe não derruba o chamado: o texto já está gravado e é o que
       menos pode se perder. O aviso diz quantos ficaram de fora, e eles podem
       ser remandados na conversa do chamado. */
    let falharam = 0;
    for (const a of anexos) {
      try {
        await mandarAnexo({
          chamadoId: (data as { id: string }).id,
          arquivo: a.arquivo, nome: a.nome, duracao: a.duracao ?? null,
          autorId: userId, autorNome: autorNome,
        });
      } catch { falharam++; }
    }
    setSalvando(false);
    if (falharam > 0) {
      toast.warning(`Chamado aberto, mas ${falharam} ${falharam === 1 ? "anexo não subiu" : "anexos não subiram"}. Dá pra mandar de novo abrindo o chamado.`);
    } else {
      toast.success(anexos.length ? `Chamado aberto com ${anexos.length} ${anexos.length === 1 ? "anexo" : "anexos"}` : "Chamado aberto");
    }
    onOpenChange(false);
    onCriado();
  };

  const inputCls = "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-primary/50";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> Abrir chamado
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[65vh] overflow-y-auto scrollbar-thin pr-1">
          {/* Tipo */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">O que é</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {TIPOS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTipo(t.key)}
                  className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs ring-1 transition-colors ${
                    tipo === t.key ? t.cls : "bg-white/[0.03] text-muted-foreground ring-white/10 hover:ring-white/25"
                  }`}
                >
                  <t.icon className="h-3.5 w-3.5" /> {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Título</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls}
              placeholder="Resumo em uma linha" autoFocus />
          </div>

          {/* Onde (aba/sistema) — dropdown custom com ícone por aba */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <LayoutGrid className="h-3 w-3" /> Onde (aba do sistema)
            </label>
            <Select value={sistema} onValueChange={setSistema}>
              <SelectTrigger className="bg-white/[0.03] border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {SISTEMAS.map((s) => (
                  <SelectItem key={s.label} value={s.label}>
                    <span className="flex items-center gap-2">
                      <s.icon className="h-3.5 w-3.5 text-muted-foreground" /> {s.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Referência — só em Processos, explorando a base */}
          {ehProcessos && (
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Link2 className="h-3 w-3" /> Processo (referência)
              </label>
              <RefProcessoPicker value={referencia} onChange={setReferencia} />
            </div>
          )}

          {/* Observações */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Observações</label>
            {/* COLAR O PRINT AQUI DENTRO. É o gesto mais curto que existe:
                Cmd+Shift+4, Cmd+V. Quem já está descrevendo o problema tem o
                print na área de transferência naquele exato segundo. */}
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={4}
              onPaste={colarPrint}
              className={`${inputCls} resize-y`}
              placeholder="O que aconteceu, o passo a passo pra reproduzir, o que você esperava… (dá pra colar print aqui)" />
          </div>

          {/* ── PRINT E ÁUDIO NA ABERTURA ───────────────────────────────────
              Estavam só dentro do chamado já criado, e esse era o lugar
              errado: quem abre o chamado tem o print na mão AGORA, e obrigar
              a criar, reabrir e então anexar é o atrito que faz o print nunca
              ser mandado. Aqui os anexos esperam na memória e sobem junto
              assim que o chamado nasce e ganha um id. */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Print, áudio ou arquivo
            </label>
            <p className="text-[10.5px] text-muted-foreground/70 leading-snug">
              Uma imagem explica em dois segundos o que três parágrafos não explicam. Imagem grande
              encolhe sozinha antes de subir.
            </p>

            {anexos.length > 0 && (
              <div className="space-y-1.5 pt-0.5">
                {anexos.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.04] ring-1 ring-white/[0.07] p-2">
                    {a.url
                      ? <img src={a.url} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
                      : <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] truncate">{a.nome}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {tamanhoBonito(a.arquivo.size)}
                        {a.arquivo.type.startsWith("image/") && a.arquivo.size > 200 * 1024 && " · vai encolher"}
                      </span>
                    </span>
                    <button type="button" onClick={() => tirarAnexo(i)}
                      className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-red-400 hover:bg-white/[0.06]">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-1.5 pt-0.5">
              <input ref={seletor} type="file" className="hidden" multiple
                accept="image/*,application/pdf,audio/*,.doc,.docx,.xls,.xlsx,.csv,.txt"
                onChange={(e) => { juntarAnexos(e.target.files); e.target.value = ""; }} />
              <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5"
                onClick={() => seletor.current?.click()} disabled={salvando}>
                <Paperclip className="h-3.5 w-3.5" /> Anexar
              </Button>
              {/* O mesmo gravador do Atendimento: aqui ele não manda, guarda. */}
              <GravadorDeAudio
                onEnviar={async (blob, seg) => {
                  setAnexos((v) => [...v, {
                    arquivo: blob, nome: `audio-${Date.now()}.webm`, duracao: seg,
                  }]);
                }}
                disabled={salvando}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={criar} disabled={salvando}>
            {salvando ? (anexos.length ? "Subindo anexos…" : "Abrindo…") : "Abrir chamado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Detalhe / resolução ───────────────────────────────────────────────────────
function DetalheDialog({
  chamado, onOpenChange, podeResolver, meuId, meuNome, onMudou, setDetalhe,
}: {
  chamado: Chamado | null;
  onOpenChange: (o: boolean) => void;
  podeResolver: boolean;
  meuId: string | null;
  meuNome: string | null;
  onMudou: () => void;
  setDetalhe: (c: Chamado | null) => void;
}) {
  const [resolucao, setResolucao] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { setResolucao(chamado?.resolucao || ""); }, [chamado?.id]);
  if (!chamado) return null;

  const t = tipoMeta(chamado.tipo);
  const st = STATUS[chamado.status];
  const SisIcon = sistemaIcon(chamado.sistema);

  const mudarStatus = async (status: Chamado["status"]) => {
    setSalvando(true);
    const patch: any = { status };
    if (status === "resolvido") {
      patch.resolvido_por = meuId;
      patch.resolvido_por_nome = meuNome;
      patch.resolvido_em = new Date().toISOString();
      patch.resolucao = resolucao.trim() || null;
    } else {
      patch.resolvido_por = null; patch.resolvido_por_nome = null; patch.resolvido_em = null;
    }
    const { data, error } = await (supabase.from("chamados" as any) as any)
      .update(patch).eq("id", chamado.id).select("*").single();
    setSalvando(false);
    if (error) { toast.error("Erro: " + error.message); return; }
    toast.success(status === "resolvido" ? "Chamado resolvido" : status === "em_andamento" ? "Marcado em andamento" : "Reaberto");
    setDetalhe(data as Chamado);
    onMudou();
  };

  return (
    <Dialog open={!!chamado} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2 flex-wrap pr-6">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ring-1 ${t.cls}`}>
              <t.icon className="h-3 w-3" /> {t.label}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ring-1 ${st.cls}`}>
              <st.icon className={`h-3 w-3 ${chamado.status === "em_andamento" ? "animate-spin" : ""}`} /> {st.label}
            </span>
          </div>
          <DialogTitle className="text-left mt-2">{chamado.titulo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto scrollbar-thin pr-1 text-sm">
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <Info icon={SisIcon} label="Onde" value={chamado.sistema || "Geral"} />
            <Info icon={User} label="Aberto por" value={chamado.autor_nome || "Alguém"} />
            {chamado.referencia && <Info icon={Link2} label="Processo" value={chamado.referencia} />}
            <Info icon={Clock} label="Quando" value={new Date(chamado.created_at).toLocaleString("pt-BR")} />
          </div>

          {chamado.observacoes && (
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Observações</p>
              <p className="whitespace-pre-line text-foreground/90">{chamado.observacoes}</p>
            </div>
          )}

          {chamado.status === "resolvido" && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
              <p className="text-[10px] uppercase tracking-wider text-emerald-400/80 mb-1 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Resolvido
                {chamado.resolvido_por_nome ? ` por ${chamado.resolvido_por_nome}` : ""}
                {chamado.resolvido_em ? ` · ${tempoAtras(chamado.resolvido_em)}` : ""}
              </p>
              {chamado.resolucao && <p className="whitespace-pre-line text-foreground/90">{chamado.resolucao}</p>}
            </div>
          )}

          {podeResolver && chamado.status !== "resolvido" && (
            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Nota de resolução (opcional)</label>
              <textarea value={resolucao} onChange={(e) => setResolucao(e.target.value)} rows={2}
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-primary/50 resize-y"
                placeholder="O que foi feito / decidido" />
            </div>
          )}
        </div>

        {/* A CONVERSA FICA FORA DA CAIXA QUE ROLA, colada na barra de escrever.
            Dentro dela, mandar um recado empurraria o campo de digitar para
            fora da vista junto com o resto — e a barra é o lugar onde a pessoa
            está com a mão. Mesma razão de a barra do Atendimento não rolar
            junto com as bolhas. */}
        <div className="border-t border-white/[0.07] pt-3">
          <ConversaDoChamado chamadoId={chamado.id} meuId={meuId} meuNome={meuNome} />
        </div>

        {podeResolver && (
          <DialogFooter className="flex-wrap gap-2">
            {chamado.status === "aberto" && (
              <Button variant="outline" onClick={() => mudarStatus("em_andamento")} disabled={salvando} className="gap-1.5">
                <Loader2 className="h-3.5 w-3.5" /> Em andamento
              </Button>
            )}
            {chamado.status === "em_andamento" && (
              <Button variant="outline" onClick={() => mudarStatus("aberto")} disabled={salvando} className="gap-1.5">
                <CircleDot className="h-3.5 w-3.5" /> Voltar p/ aberto
              </Button>
            )}
            {chamado.status === "resolvido" ? (
              <Button variant="outline" onClick={() => mudarStatus("aberto")} disabled={salvando} className="gap-1.5">
                <X className="h-3.5 w-3.5" /> Reabrir
              </Button>
            ) : (
              <Button onClick={() => mudarStatus("resolvido")} disabled={salvando} className="gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> {salvando ? "Salvando…" : "Marcar resolvido"}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Icon className="h-3 w-3" /> {label}</p>
      <p className="text-foreground/90 truncate mt-0.5">{value}</p>
    </div>
  );
}
