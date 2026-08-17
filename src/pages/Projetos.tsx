import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { SpotlightCard } from "@/components/SpotlightCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Plus, ChevronLeft, Loader2, Check, X, CalendarDays, User, Trash2, Pencil,
  LayoutGrid, Archive, Pause, Play, GripVertical, Search, Flag,
} from "lucide-react";
import {
  PALETA, CORES, paleta, ICONES, ICONES_LISTA, icone, TEMPLATES,
  PRIORIDADES, type Prioridade, urgenciaPrazo, fmtDataCurta,
} from "@/lib/projetos";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

interface Projeto {
  id: string; nome: string; descricao: string | null; cor: string; icone: string;
  dono_id: string | null; prazo: string | null; status: string; ordem: number;
  created_at: string; concluido_at: string | null;
}
interface Coluna { id: string; projeto_id: string; nome: string; ordem: number; cor: string; e_conclusao: boolean }
interface Card {
  id: string; projeto_id: string; coluna_id: string; titulo: string; descricao: string | null;
  responsavel_id: string | null; prazo: string | null; prioridade: Prioridade; ordem: number;
  concluido_at: string | null; cliente_id: string | null; processo_id: string | null; chamado_id: string | null;
}
interface Perfil { id: string; nome: string | null; email: string | null }

/* ───────────────────────── Anel de progresso ───────────────────────── */
function Anel({ pct, cor, size = 44 }: { pct: number; cor: string; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const p = paleta(cor);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3" className="stroke-white/[0.07]" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="3" strokeLinecap="round"
          className={cn("origin-center", p.texto)} stroke="currentColor"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * pct) / 100 }}
          transition={{ duration: 0.9, ease: EASE }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[10px] font-medium tabular-nums">
        {Math.round(pct)}%
      </span>
    </div>
  );
}

/* ───────────────────────── Novo projeto ───────────────────────── */
function NovoProjetoDialog({ open, onClose, onCriado, perfis, userId }: {
  open: boolean; onClose: () => void; onCriado: () => void; perfis: Perfil[]; userId: string | null;
}) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cor, setCor] = useState<string>("primary");
  const [ic, setIc] = useState<string>("Rocket");
  const [dono, setDono] = useState<string>("");
  const [prazo, setPrazo] = useState("");
  const [template, setTemplate] = useState<string>("simples");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setNome(""); setDescricao(""); setCor("primary"); setIc("Rocket");
      setDono(userId || ""); setPrazo(""); setTemplate("simples"); setSalvando(false);
    }
  }, [open, userId]);

  const Icone = icone(ic);
  const p = paleta(cor);

  const criar = async () => {
    if (!nome.trim()) { toast.error("Dê um nome ao projeto."); return; }
    setSalvando(true);
    const { error } = await (supabase.rpc as any)("fn_criar_projeto", {
      p_nome: nome.trim(), p_descricao: descricao.trim() || null, p_cor: cor, p_icone: ic,
      p_dono: dono || null, p_prazo: prazo || null, p_template: template, p_user: userId,
    });
    setSalvando(false);
    if (error) { toast.error("Não consegui criar: " + error.message); return; }
    toast.success("Projeto criado");
    onCriado(); onClose();
  };

  const tpl = TEMPLATES.find((t) => t.key === template)!;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-w-[95vw] max-h-[88dvh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2.5">
            <span className={cn("h-9 w-9 rounded-xl grid place-items-center ring-1", p.chip)}>
              <Icone className="h-4.5 w-4.5" />
            </span>
            Novo projeto
          </DialogTitle>
          <DialogDescription>Escolha o funil e ajuste depois — as colunas são editáveis.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2 flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus
              placeholder="Ex: Campanha Meta Ads — Bradesco" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Descrição <span className="normal-case tracking-normal opacity-60">(opcional)</span>
            </Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2}
              className="resize-none" placeholder="O que este projeto precisa entregar" />
          </div>

          {/* Funil */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Funil</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TEMPLATES.map((t) => {
                const on = template === t.key;
                return (
                  <button key={t.key} onClick={() => setTemplate(t.key)}
                    className={cn(
                      "text-left rounded-xl border p-3 transition-all duration-200",
                      on ? cn(p.borda, p.suave) : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15]",
                    )}>
                    <div className="flex items-center gap-2">
                      <span className={cn("h-4 w-4 rounded-[5px] grid place-items-center shrink-0",
                        on ? cn(p.barra, "text-background") : "ring-1 ring-white/20")}>
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span className="text-[13px] font-semibold">{t.nome}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{t.hint}</p>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              {tpl.colunas.map((c, i) => (
                <motion.span key={c} layout
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, ease: EASE }}
                  className="text-[10.5px] px-2 py-1 rounded-full bg-white/[0.04] ring-1 ring-white/[0.08] text-muted-foreground">
                  {c}
                </motion.span>
              ))}
            </div>
          </div>

          {/* Identidade */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Cor</Label>
              <div className="flex items-center gap-2 flex-wrap">
                {CORES.map((c) => (
                  <button key={c} onClick={() => setCor(c)} title={PALETA[c].rotulo}
                    className={cn("h-7 w-7 rounded-lg transition-all duration-200", PALETA[c].barra,
                      cor === c ? "ring-2 ring-offset-2 ring-offset-background ring-white/60 scale-110" : "opacity-60 hover:opacity-100")} />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Ícone</Label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {ICONES_LISTA.map((n) => {
                  const I = ICONES[n];
                  return (
                    <button key={n} onClick={() => setIc(n)}
                      className={cn("h-7 w-7 rounded-lg grid place-items-center transition-all duration-200",
                        ic === n ? cn(p.chip, "ring-1 scale-110") : "text-muted-foreground hover:bg-white/[0.05]")}>
                      <I className="h-3.5 w-3.5" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Dono</Label>
              <select value={dono} onChange={(e) => setDono(e.target.value)}
                className="w-full rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-primary/50">
                <option value="">Sem dono</option>
                {perfis.map((pf) => <option key={pf.id} value={pf.id}>{pf.nome || pf.email}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Prazo <span className="normal-case tracking-normal opacity-60">(opcional)</span>
              </Label>
              <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 pt-3">
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={criar} disabled={salvando || !nome.trim()}>
            {salvando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Criar projeto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Detalhe do card ───────────────────────── */
function CardDialog({ card, colunas, perfis, onClose, onSalvo }: {
  card: Card | null; colunas: Coluna[]; perfis: Perfil[];
  onClose: () => void; onSalvo: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [resp, setResp] = useState("");
  const [prazo, setPrazo] = useState("");
  const [prio, setPrio] = useState<Prioridade>("normal");
  const [colId, setColId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    if (card) {
      setTitulo(card.titulo); setDescricao(card.descricao || "");
      setResp(card.responsavel_id || ""); setPrazo(card.prazo || "");
      setPrio(card.prioridade); setColId(card.coluna_id);
      setSalvando(false); setExcluindo(false);
    }
  }, [card?.id]);

  if (!card) return null;

  const salvar = async () => {
    if (!titulo.trim()) { toast.error("O card precisa de um título."); return; }
    setSalvando(true);
    const col = colunas.find((c) => c.id === colId);
    const { error } = await (supabase.from("projeto_cards" as never) as never as any)
      .update({
        titulo: titulo.trim(), descricao: descricao.trim() || null,
        responsavel_id: resp || null, prazo: prazo || null, prioridade: prio, coluna_id: colId,
        concluido_at: col?.e_conclusao ? (card.concluido_at || new Date().toISOString()) : null,
      }).eq("id", card.id);
    setSalvando(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    onSalvo(); onClose();
  };

  const excluir = async () => {
    setExcluindo(true);
    const { error } = await (supabase.from("projeto_cards" as never) as never as any).delete().eq("id", card.id);
    setExcluindo(false);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    toast.success("Card excluído");
    onSalvo(); onClose();
  };

  return (
    <Dialog open={!!card} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-w-[95vw] max-h-[88dvh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Editar card</DialogTitle>
          <DialogDescription>Mover de coluna aqui vale o mesmo que arrastar no quadro.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5 pt-1 flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Detalhes</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4} className="resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Coluna</Label>
              <select value={colId} onChange={(e) => setColId(e.target.value)}
                className="w-full rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-primary/50">
                {colunas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Responsável</Label>
              <select value={resp} onChange={(e) => setResp(e.target.value)}
                className="w-full rounded-lg border border-border bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-primary/50">
                <option value="">Ninguém</option>
                {perfis.map((pf) => <option key={pf.id} value={pf.id}>{pf.nome || pf.email}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Prazo</Label>
              <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Prioridade</Label>
              <div className="flex items-center gap-1.5">
                {(Object.keys(PRIORIDADES) as Prioridade[]).map((k) => (
                  <button key={k} onClick={() => setPrio(k)}
                    className={cn("flex-1 text-[11px] py-2 rounded-lg ring-1 transition-colors",
                      prio === k ? PRIORIDADES[k].chip : "ring-white/[0.08] text-muted-foreground hover:bg-white/[0.04]")}>
                    {PRIORIDADES[k].rotulo}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 gap-2 pt-3 sm:justify-between">
          <Button variant="ghost" onClick={excluir} disabled={salvando || excluindo}
            className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10">
            {excluindo ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
            Excluir
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando || !titulo.trim()}>
              {salvando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Página ───────────────────────── */
export default function Projetos() {
  useEffect(() => { document.title = "Projetos · AW ECO ME"; }, []);
  const { user } = useAuth();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState<string | null>(null);   // projeto_id no quadro
  const [novoOpen, setNovoOpen] = useState(false);
  const [cardAberto, setCardAberto] = useState<Card | null>(null);
  const [novoEmCol, setNovoEmCol] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [verArquivados, setVerArquivados] = useState(false);

  const perfisQ = useQuery({
    queryKey: ["perfis_projetos"],
    queryFn: async (): Promise<Perfil[]> => {
      const { data } = await supabase.from("profiles").select("id, nome, email").eq("approved", true).order("nome");
      return (data || []) as Perfil[];
    },
  });
  const perfis = perfisQ.data || [];
  const nomeDe = (id: string | null) => perfis.find((p) => p.id === id)?.nome || null;

  const projetosQ = useQuery({
    queryKey: ["projetos"],
    queryFn: async (): Promise<Projeto[]> => {
      const { data, error } = await (supabase.from("projetos" as never) as never as any)
        .select("*").order("ordem", { ascending: true }).order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Projeto[];
    },
  });
  const projetos = projetosQ.data || [];

  const colunasQ = useQuery({
    queryKey: ["projeto_colunas"],
    queryFn: async (): Promise<Coluna[]> => {
      const { data } = await (supabase.from("projeto_colunas" as never) as never as any)
        .select("*").order("ordem");
      return (data || []) as Coluna[];
    },
  });
  const cardsQ = useQuery({
    queryKey: ["projeto_cards"],
    queryFn: async (): Promise<Card[]> => {
      const { data } = await (supabase.from("projeto_cards" as never) as never as any)
        .select("*").order("ordem");
      return (data || []) as Card[];
    },
  });
  const colunas = colunasQ.data || [];
  const cards = cardsQ.data || [];

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["projetos"] });
    qc.invalidateQueries({ queryKey: ["projeto_colunas"] });
    qc.invalidateQueries({ queryKey: ["projeto_cards"] });
  };

  // Progresso por projeto = cards concluídos / total.
  const stats = useMemo(() => {
    const m = new Map<string, { total: number; feitos: number; atrasados: number }>();
    const hoje = new Date().toISOString().slice(0, 10);
    for (const p of projetos) m.set(p.id, { total: 0, feitos: 0, atrasados: 0 });
    for (const c of cards) {
      const s = m.get(c.projeto_id); if (!s) continue;
      s.total++;
      if (c.concluido_at) s.feitos++;
      else if (c.prazo && c.prazo < hoje) s.atrasados++;
    }
    return m;
  }, [projetos, cards]);

  const visiveis = projetos
    .filter((p) => (verArquivados ? p.status === "arquivado" : p.status !== "arquivado"))
    .filter((p) => !busca.trim() || p.nome.toLowerCase().includes(busca.toLowerCase().trim()));

  /* ── mover card (drag & drop nativo, sem dependência) ── */
  const moverCard = async (cardId: string, colunaId: string) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.coluna_id === colunaId) return;
    const col = colunas.find((c) => c.id === colunaId);
    const ordem = cards.filter((c) => c.coluna_id === colunaId).length;
    // Otimista: a UI move na hora, o banco confirma atrás.
    qc.setQueryData<Card[]>(["projeto_cards"], (old) =>
      (old || []).map((c) => c.id === cardId
        ? { ...c, coluna_id: colunaId, ordem, concluido_at: col?.e_conclusao ? new Date().toISOString() : null }
        : c));
    const { error } = await (supabase.from("projeto_cards" as never) as never as any)
      .update({
        coluna_id: colunaId, ordem,
        concluido_at: col?.e_conclusao ? (card.concluido_at || new Date().toISOString()) : null,
      }).eq("id", cardId);
    if (error) { toast.error("Não consegui mover: " + error.message); recarregar(); }
    else qc.invalidateQueries({ queryKey: ["projeto_cards"] });
  };

  const criarCard = async (projetoId: string, colunaId: string) => {
    const t = rascunho.trim();
    if (!t) { setNovoEmCol(null); return; }
    const ordem = cards.filter((c) => c.coluna_id === colunaId).length;
    const { error } = await (supabase.from("projeto_cards" as never) as never as any).insert({
      projeto_id: projetoId, coluna_id: colunaId, titulo: t, ordem, created_by: user?.id ?? null,
    });
    if (error) { toast.error("Erro: " + error.message); return; }
    setRascunho("");
    qc.invalidateQueries({ queryKey: ["projeto_cards"] });
  };

  const mudarStatus = async (p: Projeto, status: string) => {
    const { error } = await (supabase.from("projetos" as never) as never as any)
      .update({ status, concluido_at: status === "concluido" ? new Date().toISOString() : null })
      .eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "arquivado" ? "Projeto arquivado" : status === "pausado" ? "Projeto pausado" : "Projeto reativado");
    qc.invalidateQueries({ queryKey: ["projetos"] });
  };

  const projetoAberto = projetos.find((p) => p.id === aberto) || null;

  /* ══════════════ QUADRO ══════════════ */
  if (projetoAberto) {
    const cols = colunas.filter((c) => c.projeto_id === projetoAberto.id).sort((a, b) => a.ordem - b.ordem);
    const P = paleta(projetoAberto.cor);
    const Icone = icone(projetoAberto.icone);
    const s = stats.get(projetoAberto.id) || { total: 0, feitos: 0, atrasados: 0 };
    const pct = s.total ? (s.feitos / s.total) * 100 : 0;

    return (
      <div className="space-y-5">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}
          className="flex items-start gap-3 flex-wrap">
          <button onClick={() => setAberto(null)}
            className="h-9 w-9 rounded-xl grid place-items-center border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] transition-colors shrink-0">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className={cn("h-11 w-11 rounded-2xl grid place-items-center ring-1 shrink-0", P.chip)}>
            <Icone className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-medium tracking-tight truncate">{projetoAberto.nome}</h2>
            <p className="text-sm text-muted-foreground truncate">
              {projetoAberto.descricao || "Sem descrição"}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {s.atrasados > 0 && (
              <span className="text-[11px] px-2 py-1 rounded-full ring-1 bg-rose-500/15 text-rose-400 ring-rose-500/30">
                {s.atrasados} atrasado{s.atrasados > 1 ? "s" : ""}
              </span>
            )}
            <Anel pct={pct} cor={projetoAberto.cor} />
          </div>
        </motion.div>

        <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1">
          {cols.map((col, ci) => {
            const doCol = cards.filter((c) => c.coluna_id === col.id).sort((a, b) => a.ordem - b.ordem);
            const cp = paleta(col.cor);
            const alvo = sobre === col.id;
            return (
              <motion.div
                key={col.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: ci * 0.06, ease: EASE }}
                onDragOver={(e) => { e.preventDefault(); setSobre(col.id); }}
                onDragLeave={() => setSobre((s2) => (s2 === col.id ? null : s2))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain") || arrastando;
                  if (id) moverCard(id, col.id);
                  setSobre(null); setArrastando(null);
                }}
                className={cn(
                  "w-[290px] shrink-0 rounded-2xl border p-3 transition-all duration-200",
                  alvo ? cn(cp.borda, cp.suave, "ring-1", cp.anel) : "border-white/[0.07] bg-white/[0.02]",
                )}
              >
                <div className="flex items-center gap-2 px-1 pb-2.5">
                  <span className={cn("h-2 w-2 rounded-full shrink-0", cp.ponto)} />
                  <span className="text-[12px] font-semibold uppercase tracking-wider truncate">{col.nome}</span>
                  <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{doCol.length}</span>
                </div>

                <div className="space-y-2 min-h-[8px]">
                  <AnimatePresence initial={false}>
                    {doCol.map((c) => {
                      const u = urgenciaPrazo(c.concluido_at ? null : c.prazo);
                      const resp = nomeDe(c.responsavel_id);
                      return (
                        <motion.button
                          key={c.id}
                          layout
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: arrastando === c.id ? 0.4 : 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.96 }}
                          transition={{ ease: EASE, duration: 0.22 }}
                          draggable
                          onDragStart={(e) => { (e as any).dataTransfer?.setData("text/plain", c.id); setArrastando(c.id); }}
                          onDragEnd={() => { setArrastando(null); setSobre(null); }}
                          onClick={() => setCardAberto(c)}
                          className={cn(
                            "w-full text-left rounded-xl border border-white/[0.07] bg-white/[0.03] p-3",
                            "hover:border-white/[0.18] hover:bg-white/[0.05] transition-colors cursor-grab active:cursor-grabbing",
                            c.concluido_at && "opacity-60",
                          )}
                        >
                          <p className={cn("text-[13px] leading-snug", c.concluido_at && "line-through decoration-white/30")}>
                            {c.titulo}
                          </p>
                          {(u || resp || c.prioridade !== "normal") && (
                            <div className="flex items-center gap-1.5 flex-wrap mt-2">
                              {c.prioridade !== "normal" && (
                                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full ring-1 inline-flex items-center gap-1", PRIORIDADES[c.prioridade].chip)}>
                                  <Flag className="h-2.5 w-2.5" /> {PRIORIDADES[c.prioridade].rotulo}
                                </span>
                              )}
                              {u && (
                                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full ring-1 inline-flex items-center gap-1", u.chip)}>
                                  <CalendarDays className="h-2.5 w-2.5" /> {u.label}
                                </span>
                              )}
                              {resp && (
                                <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1 ml-auto">
                                  <User className="h-2.5 w-2.5" /> {resp.split(" ")[0]}
                                </span>
                              )}
                            </div>
                          )}
                        </motion.button>
                      );
                    })}
                  </AnimatePresence>
                </div>

                {novoEmCol === col.id ? (
                  <div className="mt-2">
                    <Textarea
                      value={rascunho} onChange={(e) => setRascunho(e.target.value)} autoFocus rows={2}
                      placeholder="O que precisa ser feito?"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); criarCard(projetoAberto.id, col.id); }
                        if (e.key === "Escape") { setNovoEmCol(null); setRascunho(""); }
                      }}
                      className="resize-none text-[13px] bg-white/[0.03]"
                    />
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <Button size="sm" className="h-7 text-[11px]" onClick={() => criarCard(projetoAberto.id, col.id)}>Adicionar</Button>
                      <button onClick={() => { setNovoEmCol(null); setRascunho(""); }}
                        className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:bg-white/[0.05]">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setNovoEmCol(col.id); setRascunho(""); }}
                    className="w-full mt-2 py-2 rounded-lg text-[12px] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground transition-colors inline-flex items-center justify-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Adicionar card
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>

        <CardDialog card={cardAberto} colunas={cols} perfis={perfis}
          onClose={() => setCardAberto(null)} onSalvo={() => qc.invalidateQueries({ queryKey: ["projeto_cards"] })} />
      </div>
    );
  }

  /* ══════════════ LOBBY ══════════════ */
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-3xl font-medium tracking-tight">Projetos</h2>
          <p className="text-sm text-muted-foreground mt-1">
            O trabalho do escritório que não é processo nem peça
          </p>
        </div>
        <Button onClick={() => setNovoOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Novo projeto
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar projeto…"
            className="w-full rounded-lg border border-border bg-white/[0.03] pl-8 pr-3 py-2 text-[13px] outline-none focus:border-primary/50" />
        </div>
        <button onClick={() => setVerArquivados((v) => !v)}
          className={cn("text-[11px] px-3 py-2 rounded-lg ring-1 transition-colors inline-flex items-center gap-1.5",
            verArquivados ? "bg-primary/15 text-primary ring-primary/30" : "ring-white/[0.08] text-muted-foreground hover:bg-white/[0.04]")}>
          <Archive className="h-3.5 w-3.5" /> Arquivados
        </button>
      </div>

      {projetosQ.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 rounded-2xl border border-white/[0.05] bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}
          className="rounded-2xl border border-dashed border-white/[0.1] py-16 text-center">
          <LayoutGrid className="h-8 w-8 text-muted-foreground/50 mx-auto" />
          <p className="text-sm font-medium mt-3">
            {verArquivados ? "Nenhum projeto arquivado" : busca ? "Nenhum projeto com esse nome" : "Nenhum projeto ainda"}
          </p>
          {!verArquivados && !busca && (
            <>
              <p className="text-[12.5px] text-muted-foreground mt-1 max-w-sm mx-auto">
                Campanhas, mudanças internas, metas do trimestre — o que tem começo, meio e fim
                mas não vira processo.
              </p>
              <Button className="mt-4" onClick={() => setNovoOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Criar o primeiro
              </Button>
            </>
          )}
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence initial={false}>
            {visiveis.map((p, i) => {
              const P = paleta(p.cor);
              const Icone = icone(p.icone);
              const s = stats.get(p.id) || { total: 0, feitos: 0, atrasados: 0 };
              const pct = s.total ? (s.feitos / s.total) * 100 : 0;
              const u = urgenciaPrazo(p.status === "concluido" ? null : p.prazo);
              const dono = nomeDe(p.dono_id);
              return (
                <motion.div key={p.id} layout
                  initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ delay: Math.min(i * 0.05, 0.3), ease: EASE }}>
                  <SpotlightCard className="p-5 h-full cursor-pointer" onClick={() => setAberto(p.id)}>
                    <div className="flex items-start gap-3">
                      <span className={cn("h-11 w-11 rounded-2xl grid place-items-center ring-1 shrink-0", P.chip)}>
                        <Icone className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold leading-tight truncate">{p.nome}</p>
                        <p className="text-[11.5px] text-muted-foreground line-clamp-2 mt-0.5">
                          {p.descricao || "Sem descrição"}
                        </p>
                      </div>
                      <Anel pct={pct} cor={p.cor} size={40} />
                    </div>

                    <div className="mt-4 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                      <motion.div className={cn("h-full rounded-full", P.barra)}
                        initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.9, ease: EASE, delay: 0.1 }} />
                    </div>

                    <div className="mt-3 flex items-center gap-2 flex-wrap text-[11px]">
                      <span className="text-muted-foreground tabular-nums">
                        {s.feitos}/{s.total} {s.total === 1 ? "card" : "cards"}
                      </span>
                      {s.atrasados > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full ring-1 bg-rose-500/15 text-rose-400 ring-rose-500/30">
                          {s.atrasados} atrasado{s.atrasados > 1 ? "s" : ""}
                        </span>
                      )}
                      {u && (
                        <span className={cn("px-1.5 py-0.5 rounded-full ring-1 inline-flex items-center gap-1", u.chip)}>
                          <CalendarDays className="h-2.5 w-2.5" /> {fmtDataCurta(p.prazo)}
                        </span>
                      )}
                      {p.status === "pausado" && (
                        <span className="px-1.5 py-0.5 rounded-full ring-1 bg-white/[0.05] text-muted-foreground ring-white/10 inline-flex items-center gap-1">
                          <Pause className="h-2.5 w-2.5" /> Pausado
                        </span>
                      )}
                      {dono && (
                        <span className="ml-auto text-muted-foreground inline-flex items-center gap-1">
                          <User className="h-2.5 w-2.5" /> {dono.split(" ")[0]}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}>
                      {p.status === "arquivado" ? (
                        <button onClick={() => mudarStatus(p, "ativo")}
                          className="text-[11px] px-2 py-1 rounded-md text-muted-foreground hover:bg-white/[0.05] hover:text-foreground transition-colors inline-flex items-center gap-1">
                          <Play className="h-3 w-3" /> Restaurar
                        </button>
                      ) : (
                        <>
                          <button onClick={() => mudarStatus(p, p.status === "pausado" ? "ativo" : "pausado")}
                            className="text-[11px] px-2 py-1 rounded-md text-muted-foreground hover:bg-white/[0.05] hover:text-foreground transition-colors inline-flex items-center gap-1">
                            {p.status === "pausado" ? <><Play className="h-3 w-3" /> Retomar</> : <><Pause className="h-3 w-3" /> Pausar</>}
                          </button>
                          <button onClick={() => mudarStatus(p, "arquivado")}
                            className="text-[11px] px-2 py-1 rounded-md text-muted-foreground hover:bg-white/[0.05] hover:text-foreground transition-colors inline-flex items-center gap-1">
                            <Archive className="h-3 w-3" /> Arquivar
                          </button>
                        </>
                      )}
                    </div>
                  </SpotlightCard>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <NovoProjetoDialog open={novoOpen} onClose={() => setNovoOpen(false)}
        onCriado={recarregar} perfis={perfis} userId={user?.id ?? null} />
    </div>
  );
}
