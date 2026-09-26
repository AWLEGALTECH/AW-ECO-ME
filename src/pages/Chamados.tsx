import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { appConfig } from "@/config/app-config";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Ticket, Plus, Bug, Sparkles, Lightbulb, HelpCircle, MoreHorizontal,
  CircleDot, Hammer, Loader2, CheckCircle2, LayoutGrid, Link2, Clock, User, Search, X,
  Briefcase, Paperclip, Mic, type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { navItems, adminItems } from "@/components/AppSidebar";
import { ConversaDoChamado, BarraDaConversa } from "@/components/chamados/ConversaDoChamado";
import { BarraDeMensagem, type ItemDaBarra } from "@/components/chamados/BarraDeMensagem";
import { SpotlightCard } from "@/components/SpotlightCard";
import { mandarAnexo, mandarRecado } from "@/hooks/useChamadoMensagens";
import { tamanhoBonito } from "@/lib/comprimirAnexo";
import { CabecalhoDaPagina } from "@/components/CabecalhoDaPagina";

/* A CURVA DA CASA. Mesma de todas as telas: sai rápido, chega devagar, que é
   como as coisas com peso se movem. */
const CURVA = [0.22, 1, 0.36, 1] as const;

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

/* DOIS TIPOS, e não cinco.
 *
 * "Ideia", "Dúvida" e "Outro" saíram: na prática todo chamado é uma de duas
 * coisas, alguma coisa está quebrada ou alguma coisa podia ser melhor, e as
 * outras três só faziam a pessoa parar para escolher antes de conseguir
 * descrever o problema. Ideia é melhoria; dúvida vira mensagem na conversa do
 * chamado, que agora existe.
 *
 * Os antigos continuam sendo LIDOS, porque existem 7 chamados assim no
 * quadro. Eles só não podem mais ser escolhidos. Apagar o rótulo faria o
 * chamado "Outro" do Diego aparecer como Bug, que é pior que manter uma
 * categoria que ninguém escolhe mais.
 */
const TIPOS = [
  { key: "bug",      label: "Bug",      icon: Bug,      cls: CHIP },
  { key: "melhoria", label: "Melhoria", icon: Sparkles, cls: CHIP },
] as const;

const TIPOS_ANTIGOS = [
  { key: "ideia",  label: "Ideia",  icon: Lightbulb,      cls: CHIP },
  { key: "duvida", label: "Dúvida", icon: HelpCircle,     cls: CHIP },
  { key: "outro",  label: "Outro",  icon: MoreHorizontal, cls: CHIP },
] as const;

/** Para filtro e leitura: tudo o que pode aparecer num chamado já gravado. */
const TODOS_OS_TIPOS = [...TIPOS, ...TIPOS_ANTIGOS];

/* O ÍCONE DE "EM ANDAMENTO" É UM MARTELO.
 * Era um Loader2 girando, e rodopio quer dizer "espere, carregando" — ali não
 * havia nada carregando. Virou círculo tracejado, que era pior ainda: bola
 * pontilhada não quer dizer nada. Martelo quer: tem gente batendo nisso. */
const STATUS = {
  aberto:       { label: "Aberto",       icon: CircleDot,     cls: CHIP },
  em_andamento: { label: "Em andamento", icon: Hammer,       cls: CHIP },
  resolvido:    { label: "Resolvido",    icon: CheckCircle2,  cls: CHIP_APAGADO },
} as const;

/* EM ANDAMENTO VEM PRIMEIRO. É o que está na mão de alguém agora, e portanto o
   que tem dono e prazo; "aberto" é fila, e fila espera. Quem entra na tela
   quer saber antes de tudo o que já começou. */
const TABS = [
  { key: "em_andamento", label: "Em andamento" },
  { key: "aberto",       label: "Abertos" },
  { key: "resolvido",    label: "Resolvidos" },
  { key: "todos",        label: "Todos" },
] as const;

/* AS ÁREAS SÃO AS DA BARRA LATERAL, lidas de lá.
 *
 * Antes era uma cópia escrita à mão, e ela já tinha divergido: faltavam
 * Atendimento, Wallet, Projetos, Spy, Sheets e Marketing, e sobravam três que
 * não existem como aba ("Prospecção", "Notificações", "Login / acesso"). Quem
 * abria um chamado do Atendimento não achava o Atendimento na lista.
 *
 * Lendo do mesmo array que desenha o menu, aba nova aparece aqui sozinha no
 * dia em que nasce. Administração entra junto porque Usuários e Logs também
 * são telas onde algo pode quebrar. */
const SISTEMAS: { label: string; icon: LucideIcon }[] = [
  ...navItems.map((i) => ({ label: i.title, icon: i.icon })),
  ...adminItems.map((i) => ({ label: i.title, icon: i.icon })),
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
const tipoMeta = (t: string) => TODOS_OS_TIPOS.find((x) => x.key === t) || TIPOS[0];

export default function Chamados() {
  useEffect(() => { document.title = `Chamados · ${appConfig.name}`; }, []);
  const qc = useQueryClient();
  const { user, profile, isAdmin } = useAuth();
  const [abrir, setAbrir] = useState(false);
  const [detalhe, setDetalhe] = useState<Chamado | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("em_andamento");
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
      <CabecalhoDaPagina titulo="Chamados"
        subtitulo="Achou um bug, quer uma melhoria ou teve uma ideia? Abre um chamado. Fica tudo aqui à vista de quem vai resolver."
        acoes={<Button onClick={() => setAbrir(true)} className="gap-1.5"><Plus className="h-4 w-4" /> Abrir chamado</Button>} />

      {/* ── ABAS DE STATUS ─────────────────────────────────────────────────
          UM ÚNICO FUNDO QUE DESLIZA, e não um que acende numa aba e apaga na
          outra. É a diferença entre a marca ir de "Em andamento" para
          "Abertos" na frente do olho, que diz de onde para onde você foi, e
          dois piscares que não dizem nada. `layoutId` é o que faz o framer
          entender que são o MESMO elemento em lugares diferentes. */}
      <LayoutGroup id="abas-chamados">
        <div className="inline-flex rounded-xl bg-white/[0.03] border border-white/[0.07] p-1">
          {TABS.map((t) => {
            const on = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="relative px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
              >
                {on && (
                  <motion.span
                    layoutId="aba-ativa"
                    className="absolute inset-0 rounded-lg bg-primary/15"
                    /* MOLA, e não duração fixa: o que tem peso desacelera ao
                       chegar, em vez de parar seco no fim do percurso. */
                    transition={{ type: "spring", stiffness: 380, damping: 34 }}
                  />
                )}
                <span className={`relative z-10 transition-colors ${on ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                  {t.label}
                </span>
                <span className={`relative z-10 tabular-nums text-[10px] ${on ? "text-primary/80" : "text-muted-foreground/60"}`}>
                  {countTab(t.key)}
                </span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>

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

      {/* Filtro por tipo. Os tipos aposentados só entram na fila quando ainda
          existe chamado deles: some sozinho quando o último for resolvido. */}
      <div className="flex flex-wrap items-center gap-2">
        {TODOS_OS_TIPOS.filter((t) => TIPOS.some((x) => x.key === t.key) || countTipo(t.key) > 0).map((t) => {
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
        /* A TROCA DE ABA É UMA TROCA DE CONTEÚDO, e o conteúdo entra em vez de
           aparecer. A chave é a aba: sem ela o React reaproveitaria os mesmos
           nós e a lista nova nasceria já montada, sem movimento nenhum.
           O escalonamento para no décimo cartão de propósito: com quarenta, o
           último entraria dois segundos depois do primeiro, e aí não é mais
           animação, é espera. */
        <motion.div
          key={`${tab}-${filtroTipo ?? ""}`}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3"
        >
          {lista.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: CURVA, delay: Math.min(i, 9) * 0.03 }}
            >
              <ChamadoCard c={c} onClick={() => setDetalhe(c)} />
            </motion.div>
          ))}
        </motion.div>
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
          <st.icon className="h-3 w-3" /> {st.label}
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
  /* NASCE VAZIO. Com uma opção já escolhida, ela é o que a pressa marca, e a
     aba do chamado deixa de dizer onde o problema está. */
  const [sistema, setSistema] = useState<string>("");
  const [referencia, setReferencia] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [chacoalhar, setChacoalhar] = useState(false);
  /* O QUE A PESSOA JÁ COMPÔS, na ordem em que compôs.
     Texto, print e áudio entram todos aqui, misturados, quantos ela quiser:
     é o mesmo gesto do WhatsApp, onde ninguém pensa em "campo de observação"
     e "campo de anexo". Eles esperam na memória porque sem chamado não há id,
     e criar o chamado antes da confirmação deixaria chamado vazio no quadro
     toda vez que alguém desistisse no meio. */
  const [itens, setItens] = useState<ItemDaBarra[]>([]);

  useEffect(() => {
    if (open) {
      setTitulo(""); setTipo("bug"); setSistema("");
      setReferencia(""); setChacoalhar(false);
      setItens((v) => { v.forEach((i) => i.url && URL.revokeObjectURL(i.url)); return []; });
    }
  }, [open]);

  const tirarItem = (i: number) => setItens((v) => {
    const alvo = v[i];
    if (alvo?.url) URL.revokeObjectURL(alvo.url);
    return v.filter((_, j) => j !== i);
  });

  // Referência (busca na base de processos) só faz sentido em Processos.
  const ehProcessos = sistema === "Processos";
  useEffect(() => { if (!ehProcessos) setReferencia(""); }, [ehProcessos]);

  const criar = async () => {
    if (!titulo.trim()) { toast.error("Dá um título pro chamado."); return; }
    if (!sistema) {
      setChacoalhar(true);
      toast.error("Escolha em qual aba do sistema aconteceu.");
      return;
    }
    setSalvando(true);

    /* A PRIMEIRA MENSAGEM DE TEXTO TAMBÉM VIRA `observacoes`.
       Não é duplicação à toa: `observacoes` é o que o cartão da grade mostra
       como prévia e o que a busca vasculha, e os dois precisam de texto puro,
       sem ir buscar a conversa de cada chamado. Ela nunca é editada, então as
       duas cópias não têm como divergir. */
    const primeiroTexto = itens.find((i) => i.texto.trim() && !i.arquivo)?.texto.trim()
      || itens.find((i) => i.texto.trim())?.texto.trim()
      || null;

    const { data, error } = await (supabase.from("chamados" as any) as any).insert({
      titulo: titulo.trim(),
      tipo, sistema,
      referencia: ehProcessos ? (referencia.trim() || null) : null,
      observacoes: primeiroTexto,
      created_by: userId,
      autor_nome: autorNome,
    }).select("id").single();
    if (error) { setSalvando(false); toast.error("Erro ao abrir: " + error.message); return; }

    /* O QUE FOI COMPOSTO SOBE DEPOIS, com o chamado já criado e na mesma
       ordem em que foi escrito. Um item que falhe não derruba o chamado: o
       título e a primeira observação já estão gravados, e o aviso diz quantos
       ficaram de fora — eles podem ser remandados na conversa do chamado. */
    const id = (data as { id: string }).id;
    let falharam = 0;
    for (const item of itens) {
      try {
        if (item.arquivo) {
          await mandarAnexo({
            chamadoId: id, arquivo: item.arquivo, nome: item.nome || "arquivo",
            legenda: item.texto, duracao: item.duracao ?? null,
            autorId: userId, autorNome: autorNome,
          });
        } else {
          await mandarRecado({
            chamadoId: id, texto: item.texto, autorId: userId, autorNome: autorNome,
          });
        }
      } catch { falharam++; }
    }
    setSalvando(false);
    if (falharam > 0) {
      toast.warning(`Chamado aberto, mas ${falharam} ${falharam === 1 ? "item não subiu" : "itens não subiram"}. Dá pra mandar de novo abrindo o chamado.`);
    } else {
      toast.success("Chamado aberto");
    }
    onOpenChange(false);
    onCriado();
  };

  const inputCls = "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-primary/50";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Mesma coluna de altura fixa do detalhe: cabeçalho parado em cima,
          barra e ações paradas embaixo, e só o meio rolando. */}
      <DialogContent className="max-w-lg max-h-[88dvh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> Abrir chamado
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-6 pb-3 space-y-4">
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
            <Select value={sistema} onValueChange={(v) => { setSistema(v); setChacoalhar(false); }}>
              <SelectTrigger
                onAnimationEnd={() => setChacoalhar(false)}
                className={`bg-white/[0.03] ${chacoalhar ? "chacoalha border-red-400/60" : "border-white/10"}`}>
                <SelectValue placeholder="Escolha a aba" />
              </SelectTrigger>
              <SelectContent>
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

          {/* ── AS OBSERVAÇÕES SÃO A CONVERSA ───────────────────────────────
              Antes eram duas coisas: um campo de texto e, embaixo, um bloco de
              anexo. Dois lugares para dizer a mesma coisa, e quem está
              descrevendo um problema não quer decidir em qual dos dois a
              próxima frase entra. Agora é uma barra só, igual à do
              Atendimento: escreve, cola, grava, manda, quantas vezes quiser.
              O que já foi mandado sobe aqui como bolha, e o chamado nasce com
              tudo isso dentro. */}
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Observações
            </label>

            <AnimatePresence initial={false}>
              {itens.map((item, i) => (
                <motion.div
                  key={`${i}-${item.nome || item.texto.slice(0, 12)}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginTop: 0 }}
                  transition={{ duration: 0.18, ease: CURVA }}
                  className="group flex items-start gap-2 rounded-xl bg-primary/[0.08] ring-1 ring-primary/15 p-2"
                >
                  {item.url && <img src={item.url} alt="" className="h-11 w-11 rounded-lg object-cover shrink-0" />}
                  {!item.url && item.arquivo && (
                    <span className="h-11 w-11 rounded-lg bg-white/[0.05] grid place-items-center shrink-0">
                      {item.duracao != null
                        ? <Mic className="h-4 w-4 text-muted-foreground" />
                        : <Paperclip className="h-4 w-4 text-muted-foreground" />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 pt-0.5">
                    {item.texto && (
                      <span className="block text-[12.5px] whitespace-pre-wrap break-words">{item.texto}</span>
                    )}
                    {item.arquivo && (
                      <span className="block text-[10px] text-muted-foreground mt-0.5">
                        {item.duracao != null
                          ? `áudio de ${item.duracao}s`
                          : `${item.nome} · ${tamanhoBonito(item.arquivo.size)}`}
                        {item.arquivo.type.startsWith("image/") && item.arquivo.size > 200 * 1024 && " · vai encolher"}
                      </span>
                    )}
                  </span>
                  <button type="button" onClick={() => tirarItem(i)} title="Tirar"
                    className="h-6 w-6 shrink-0 grid place-items-center rounded-md text-muted-foreground/50 hover:text-red-400 hover:bg-white/[0.06] transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>

          </div>
        </div>

        {/* A BARRA FICA COM A PESSOA. Dentro da caixa que rola, cada item
            mandado empurrava o campo de digitar para baixo e sumia com ele
            justo quando se ia escrever o próximo. */}
        <div className="shrink-0 border-t border-white/[0.07] bg-background/80 backdrop-blur-sm px-6 py-3 space-y-2.5">
          <BarraDeMensagem
            ocupado={salvando}
            /* Curto o bastante para caber numa linha entre o clipe e o
               microfone. O texto longo de antes quebrava em duas e deixava
               a barra com cara de campo cortado. */
            placeholder="Descreva, cole um print, grave um áudio…"
            onItem={(item) => setItens((v) => [...v, item])}
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
            <Button size="sm" onClick={criar} disabled={salvando}>
              {salvando ? (itens.some((i) => i.arquivo) ? "Subindo anexos…" : "Abrindo…") : "Abrir chamado"}
            </Button>
          </div>
        </div>
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
      {/* ── UMA COLUNA DE ALTURA FIXA, e um só lugar que rola ──────────────
          O diálogo crescia com o conteúdo: com conversa longa ele passava da
          tela e empurrava "Em andamento" e "Marcar resolvido" para fora, onde
          não havia como chegar. Agora o cabeçalho fica no topo, a barra de
          escrever e as ações ficam ancoradas embaixo, e só o miolo rola. O que
          decide o que fazer com o chamado está sempre à mão. */}
      <DialogContent className="max-w-lg max-h-[88dvh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <div className="flex items-center gap-2 flex-wrap pr-6">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ring-1 ${t.cls}`}>
              <t.icon className="h-3 w-3" /> {t.label}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] ring-1 ${st.cls}`}>
              <st.icon className="h-3 w-3" /> {st.label}
            </span>
          </div>
          <DialogTitle className="text-left mt-2">{chamado.titulo}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-6 pb-3 space-y-3 text-sm">
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

          <div className="pt-1">
            <ConversaDoChamado chamadoId={chamado.id} meuId={meuId} meuNome={meuNome} />
          </div>
        </div>

        {/* ── O RODAPÉ ANCORADO ─────────────────────────────────────────────
            Barra de escrever e ações no mesmo bloco, parados. O fio de cima é
            o que diz que o conteúdo passa por baixo: sem ele, o rodapé parece
            o fim do documento e a pessoa não procura mais nada acima.
            As ações ficam na MESMA LINHA da conversa, e não numa faixa
            separada, porque decidir o status e responder são o mesmo momento:
            se lê, se pergunta, se resolve. */}
        <div className="shrink-0 border-t border-white/[0.07] bg-background/80 backdrop-blur-sm px-6 py-3 space-y-2.5">
          <BarraDaConversa chamadoId={chamado.id} meuId={meuId} meuNome={meuNome} />

          {podeResolver && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {chamado.status === "aberto" && (
                <Button variant="outline" size="sm" onClick={() => mudarStatus("em_andamento")} disabled={salvando} className="gap-1.5">
                  <Hammer className="h-3.5 w-3.5" /> Em andamento
                </Button>
              )}
              {chamado.status === "em_andamento" && (
                <Button variant="outline" size="sm" onClick={() => mudarStatus("aberto")} disabled={salvando} className="gap-1.5">
                  <CircleDot className="h-3.5 w-3.5" /> Voltar p/ aberto
                </Button>
              )}
              {chamado.status === "resolvido" ? (
                <Button variant="outline" size="sm" onClick={() => mudarStatus("aberto")} disabled={salvando} className="gap-1.5">
                  <X className="h-3.5 w-3.5" /> Reabrir
                </Button>
              ) : (
                <Button size="sm" onClick={() => mudarStatus("resolvido")} disabled={salvando} className="gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> {salvando ? "Salvando…" : "Marcar resolvido"}
                </Button>
              )}
            </div>
          )}
        </div>
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
