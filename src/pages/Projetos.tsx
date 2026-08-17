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
  Plus, ChevronLeft, ChevronUp, ChevronDown, Loader2, Check, X, CalendarDays, User, Trash2, Pencil,
  LayoutGrid, Archive, Pause, Play, Search, Flag,
} from "lucide-react";
import {
  PALETA, CORES, CORES_COLUNA, paleta, ICONES, ICONES_LISTA, icone,
  PRIORIDADES, type Prioridade, type CorKey, urgenciaPrazo, fmtDataCurta,
} from "@/lib/projetos";
import { SeletorPessoas, AvataresPessoas } from "@/components/SeletorPessoas";
import { CampoData } from "@/components/CampoData";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

interface Projeto {
  id: string; nome: string; descricao: string | null; cor: string; icone: string;
  status: string; ordem: number;
  created_at: string; concluido_at: string | null;
}
interface Sprint {
  id: string; projeto_id: string; nome: string; ordem: number;
  status: "planejada" | "ativa" | "concluida";
  prazo: string | null; iniciada_at: string | null; concluida_at: string | null;
}
interface Coluna { id: string; projeto_id: string; sprint_id: string | null; nome: string; ordem: number; cor: string; e_conclusao: boolean }
interface Card {
  id: string; projeto_id: string; coluna_id: string; titulo: string; descricao: string | null;
  sprint_id: string | null;
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

/* ──────────────────── Construtor de linhas nomeadas ──────────────────── */
interface ColunaDraft { nome: string; cor: CorKey }

// Lista editável usada em dois lugares: as SPRINTS na criação do projeto e as
// COLUNAS ao iniciar uma sprint. Mesma mecânica de nomear, reordenar e remover.
function ConstrutorLinhas({
  linhas, setLinhas, comCor, placeholder, placeholderUltima, rodape,
}: {
  linhas: ColunaDraft[];
  setLinhas: React.Dispatch<React.SetStateAction<ColunaDraft[]>>;
  comCor: boolean;
  placeholder: string;
  placeholderUltima?: string;
  rodape: string;
}) {
  const set = (i: number, patch: Partial<ColunaDraft>) =>
    setLinhas((old) => old.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const add = () =>
    setLinhas((old) => [...old, { nome: "", cor: CORES_COLUNA[old.length % CORES_COLUNA.length] }]);
  const rm = (i: number) => setLinhas((old) => old.filter((_, k) => k !== i));
  const mover = (i: number, dir: -1 | 1) =>
    setLinhas((old) => {
      const j = i + dir;
      if (j < 0 || j >= old.length) return old;
      const n = [...old];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const preenchidas = linhas.filter((c) => c.nome.trim());

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <AnimatePresence initial={false}>
          {linhas.map((c, i) => {
            const cp = paleta(c.cor);
            const ultima = i === linhas.length - 1;
            return (
              <motion.div key={i} layout
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                transition={{ ease: EASE, duration: 0.2 }}
                className="flex items-center gap-1.5">
                <span className="text-[10px] tabular-nums text-muted-foreground w-4 text-right shrink-0">{i + 1}</span>

                {comCor && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" title="Cor da coluna"
                        className={cn("h-9 w-9 rounded-lg grid place-items-center shrink-0 ring-1 transition-colors", cp.chip)}>
                        <span className={cn("h-3 w-3 rounded-full", cp.ponto)} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2" align="start">
                      <div className="grid grid-cols-7 gap-1.5">
                        {CORES.map((k) => (
                          <button key={k} type="button" onClick={() => set(i, { cor: k })} title={PALETA[k].rotulo}
                            className={cn("h-7 w-7 rounded-lg transition-all", PALETA[k].barra,
                              c.cor === k ? "ring-2 ring-offset-2 ring-offset-popover ring-white/70" : "opacity-60 hover:opacity-100")} />
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

                <Input
                  value={c.nome}
                  onChange={(e) => set(i, { nome: e.target.value })}
                  placeholder={ultima && placeholderUltima ? placeholderUltima : placeholder}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
                  className="h-9 flex-1"
                />

                <div className="flex items-center shrink-0">
                  <button type="button" onClick={() => mover(i, -1)} disabled={i === 0}
                    className="h-8 w-7 grid place-items-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground disabled:opacity-25 disabled:pointer-events-none transition-colors"
                    aria-label="Subir">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => mover(i, 1)} disabled={i === linhas.length - 1}
                    className="h-8 w-7 grid place-items-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground disabled:opacity-25 disabled:pointer-events-none transition-colors"
                    aria-label="Descer">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => rm(i)} disabled={linhas.length <= 1}
                    className="h-8 w-7 grid place-items-center rounded-md text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-25 disabled:pointer-events-none transition-colors"
                    aria-label="Remover">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <button type="button" onClick={add}
        className="w-full py-2 rounded-lg border border-dashed border-white/[0.12] text-[12px] text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-white/[0.02] transition-colors inline-flex items-center justify-center gap-1.5">
        <Plus className="h-3.5 w-3.5" /> {rodape}
      </button>

      {preenchidas.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          {preenchidas.map((c, i) => {
            const cp = comCor ? paleta(c.cor) : paleta("primary");
            return (
              <motion.span key={`${c.nome}-${i}`} layout
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ ease: EASE }}
                className={cn("text-[10.5px] px-2 py-1 rounded-full ring-1 inline-flex items-center gap-1.5", cp.chip)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", cp.ponto)} />
                {c.nome.trim()}
              </motion.span>
            );
          })}
        </div>
      )}
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
  const [envolvidos, setEnvolvidos] = useState<string[]>([]);
  const [sprints, setSprints] = useState<ColunaDraft[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (open) {
      setNome(""); setDescricao(""); setCor("primary"); setIc("Rocket");
      setEnvolvidos(userId ? [userId] : []);
      setSprints([{ nome: "", cor: "primary" }]);
      setSalvando(false);
    }
  }, [open, userId]);

  const Icone = icone(ic);
  const p = paleta(cor);
  const preenchidas = sprints.filter((c) => c.nome.trim());

  const toggleEnv = (id: string) =>
    setEnvolvidos((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]));

  const criar = async () => {
    if (!nome.trim()) { toast.error("Dê um nome ao projeto."); return; }
    if (!preenchidas.length) { toast.error("Nomeie ao menos uma sprint."); return; }
    setSalvando(true);
    const { error } = await (supabase.rpc as any)("fn_criar_projeto", {
      p_nome: nome.trim(), p_descricao: descricao.trim() || null, p_cor: cor, p_icone: ic,
      p_sprints: preenchidas.map((c) => c.nome.trim()),
      p_envolvidos: envolvidos, p_user: userId,
    });
    setSalvando(false);
    if (error) { toast.error("Não consegui criar: " + error.message); return; }
    toast.success("Projeto criado");
    onCriado(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-w-[95vw] max-h-[92dvh] flex flex-col overflow-hidden gap-3">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2.5">
            <span className={cn("h-9 w-9 rounded-xl grid place-items-center ring-1", p.chip)}>
              <Icone className="h-4 w-4" />
            </span>
            Novo projeto
          </DialogTitle>
          <DialogDescription>Nomeie os ciclos de trabalho. O quadro de cada um nasce quando a sprint for iniciada.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 overflow-y-auto px-1 -mx-1 py-1">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus
              placeholder="Ex: Campanha Meta Ads do Bradesco" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Descrição <span className="normal-case tracking-normal opacity-60">(opcional)</span>
            </Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2}
              className="resize-none" placeholder="O que este projeto precisa entregar" />
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Sprints</Label>
              <span className="text-[10.5px] text-muted-foreground">as colunas vêm depois</span>
            </div>
            <ConstrutorLinhas
              linhas={sprints} setLinhas={setSprints} comCor={false}
              placeholder="Nome da sprint" rodape="Adicionar sprint"
            />
          </div>

          {/* Identidade */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Cor</Label>
              <div className="grid grid-cols-7 gap-1.5">
                {CORES.map((c) => (
                  <button key={c} onClick={() => setCor(c)} title={PALETA[c].rotulo}
                    className={cn("h-8 rounded-lg transition-all duration-200", PALETA[c].barra,
                      cor === c ? "ring-2 ring-offset-2 ring-offset-background ring-white/70" : "opacity-50 hover:opacity-90")} />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Ícone</Label>
              <div className="grid grid-cols-6 gap-1.5">
                {ICONES_LISTA.map((n) => {
                  const I = ICONES[n];
                  return (
                    <button key={n} onClick={() => setIc(n)}
                      className={cn("h-8 rounded-lg grid place-items-center transition-all duration-200",
                        ic === n ? cn(p.chip, "ring-1") : "text-muted-foreground hover:bg-white/[0.05]")}>
                      <I className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Envolvidos <span className="normal-case tracking-normal opacity-60">(pode marcar vários)</span>
            </Label>
            <SeletorPessoas pessoas={perfis} selecionados={envolvidos} onToggle={toggleEnv} />
          </div>

        </div>

        <DialogFooter className="shrink-0 gap-2 pt-3">
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={criar} disabled={salvando || !nome.trim() || !preenchidas.length}>
            {salvando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Criar projeto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Editar projeto ───────────────────────── */
function EditarProjetoDialog({ projeto, perfis, envolvidosAtuais, onClose, onSalvo }: {
  projeto: Projeto | null; perfis: Perfil[]; envolvidosAtuais: string[];
  onClose: () => void; onSalvo: () => void;
}) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cor, setCor] = useState<string>("primary");
  const [ic, setIc] = useState<string>("Rocket");
  const [envolvidos, setEnvolvidos] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    if (projeto) {
      setNome(projeto.nome); setDescricao(projeto.descricao || "");
      setCor(projeto.cor); setIc(projeto.icone);
      setEnvolvidos(envolvidosAtuais);
      setSalvando(false); setExcluindo(false);
    }
  }, [projeto?.id]);

  if (!projeto) return null;
  const Icone = icone(ic);
  const p = paleta(cor);

  const salvar = async () => {
    if (!nome.trim()) { toast.error("O projeto precisa de um nome."); return; }
    setSalvando(true);
    const { error } = await (supabase.from("projetos" as never) as never as any)
      .update({ nome: nome.trim(), descricao: descricao.trim() || null, cor, icone: ic })
      .eq("id", projeto.id);
    if (!error) {
      // Envolvidos: apaga os que saíram, insere os que entraram.
      const saiu = envolvidosAtuais.filter((x) => !envolvidos.includes(x));
      const entrou = envolvidos.filter((x) => !envolvidosAtuais.includes(x));
      if (saiu.length) {
        await (supabase.from("projeto_envolvidos" as never) as never as any)
          .delete().eq("projeto_id", projeto.id).in("user_id", saiu);
      }
      if (entrou.length) {
        await (supabase.from("projeto_envolvidos" as never) as never as any)
          .insert(entrou.map((u) => ({ projeto_id: projeto.id, user_id: u })));
      }
    }
    setSalvando(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success("Projeto atualizado");
    onSalvo(); onClose();
  };

  const excluir = async () => {
    setExcluindo(true);
    const { error } = await (supabase.from("projetos" as never) as never as any).delete().eq("id", projeto.id);
    setExcluindo(false);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    toast.success("Projeto excluído");
    onSalvo(); onClose();
  };

  return (
    <Dialog open={!!projeto} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-w-[95vw] max-h-[92dvh] flex flex-col overflow-hidden gap-3">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2.5">
            <span className={cn("h-9 w-9 rounded-xl grid place-items-center ring-1", p.chip)}>
              <Icone className="h-4 w-4" />
            </span>
            Editar projeto
          </DialogTitle>
          <DialogDescription>As sprints e os cards continuam onde estão.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 min-h-0 overflow-y-auto px-1 py-1">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="resize-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Cor</Label>
              <div className="grid grid-cols-7 gap-1.5">
                {CORES.map((c) => (
                  <button key={c} onClick={() => setCor(c)} title={PALETA[c].rotulo}
                    className={cn("h-8 rounded-lg transition-all duration-200", PALETA[c].barra,
                      cor === c ? "ring-2 ring-offset-2 ring-offset-background ring-white/70" : "opacity-50 hover:opacity-90")} />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Ícone</Label>
              <div className="grid grid-cols-6 gap-1.5">
                {ICONES_LISTA.map((n) => {
                  const I = ICONES[n];
                  return (
                    <button key={n} onClick={() => setIc(n)}
                      className={cn("h-8 rounded-lg grid place-items-center transition-all duration-200",
                        ic === n ? cn(p.chip, "ring-1") : "text-muted-foreground hover:bg-white/[0.05]")}>
                      <I className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Envolvidos</Label>
            <SeletorPessoas pessoas={perfis} selecionados={envolvidos}
              onToggle={(id) => setEnvolvidos((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]))} />
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 pt-3 sm:justify-between">
          <Button variant="ghost" onClick={excluir} disabled={salvando || excluindo}
            className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10">
            {excluindo ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
            Excluir projeto
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando || !nome.trim()}>
              {salvando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Editar sprint ───────────────────────── */
function EditarSprintDialog({ sprint, onClose, onSalvo }: {
  sprint: Sprint | null; onClose: () => void; onSalvo: () => void;
}) {
  const [nome, setNome] = useState("");
  const [prazo, setPrazo] = useState("");
  const [status, setStatus] = useState<Sprint["status"]>("planejada");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    if (sprint) {
      setNome(sprint.nome); setPrazo(sprint.prazo || ""); setStatus(sprint.status);
      setSalvando(false); setExcluindo(false);
    }
  }, [sprint?.id]);

  if (!sprint) return null;

  const salvar = async () => {
    if (!nome.trim()) { toast.error("A sprint precisa de um nome."); return; }
    setSalvando(true);
    const { error } = await (supabase.from("projeto_sprints" as never) as never as any)
      .update({
        nome: nome.trim(), prazo: prazo || null, status,
        concluida_at: status === "concluida" ? (sprint.concluida_at || new Date().toISOString()) : null,
      }).eq("id", sprint.id);
    setSalvando(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success("Sprint atualizada");
    onSalvo(); onClose();
  };

  const excluir = async () => {
    setExcluindo(true);
    const { error } = await (supabase.from("projeto_sprints" as never) as never as any).delete().eq("id", sprint.id);
    setExcluindo(false);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    toast.success("Sprint excluída");
    onSalvo(); onClose();
  };

  const STATUS: { k: Sprint["status"]; rotulo: string }[] = [
    { k: "planejada", rotulo: "Planejada" },
    { k: "ativa", rotulo: "Em andamento" },
    { k: "concluida", rotulo: "Concluída" },
  ];

  return (
    <Dialog open={!!sprint} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md max-w-[95vw] max-h-[92dvh] flex flex-col overflow-hidden gap-3">
        <DialogHeader className="shrink-0">
          <DialogTitle>Editar sprint</DialogTitle>
          <DialogDescription>As colunas se mexem em Refazer colunas, no quadro.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5 flex-1 min-h-0 overflow-y-auto px-1 py-1">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Prazo</Label>
            <CampoData valor={prazo} onChange={setPrazo} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Situação</Label>
            <div className="flex items-center gap-1.5">
              {STATUS.map((st) => (
                <button key={st.k} onClick={() => setStatus(st.k)}
                  className={cn("flex-1 text-[11px] py-2 rounded-lg ring-1 transition-colors",
                    status === st.k ? "bg-primary/15 text-primary ring-primary/40" : "ring-white/[0.08] text-muted-foreground hover:bg-white/[0.04]")}>
                  {st.rotulo}
                </button>
              ))}
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
            <Button onClick={salvar} disabled={salvando || !nome.trim()}>
              {salvando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Iniciar sprint ───────────────────────── */
function IniciarSprintDialog({ sprint, reabrindo, onClose, onIniciada }: {
  sprint: Sprint | null; reabrindo: boolean; onClose: () => void; onIniciada: () => void;
}) {
  const [cols, setCols] = useState<ColunaDraft[]>([]);
  const [prazo, setPrazo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (sprint) {
      setCols([{ nome: "", cor: "muted" }, { nome: "", cor: "primary" }, { nome: "", cor: "emerald" }]);
      setPrazo(sprint.prazo || "");
      setSalvando(false);
    }
  }, [sprint?.id]);

  if (!sprint) return null;
  const preenchidas = cols.filter((c) => c.nome.trim());

  const iniciar = async () => {
    if (!preenchidas.length) { toast.error("Crie ao menos uma coluna."); return; }
    setSalvando(true);
    const { error } = await (supabase.rpc as any)("fn_iniciar_sprint", {
      p_sprint: sprint.id,
      p_colunas: preenchidas.map((c) => ({ nome: c.nome.trim(), cor: c.cor })),
      p_prazo: prazo || null,
    });
    setSalvando(false);
    if (error) { toast.error("Não consegui iniciar: " + error.message); return; }
    toast.success(`${sprint.nome} em andamento`);
    onIniciada(); onClose();
  };

  return (
    <Dialog open={!!sprint} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-w-[95vw] max-h-[92dvh] flex flex-col overflow-hidden gap-3">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-xl grid place-items-center ring-1 bg-primary/15 text-primary ring-primary/30">
              <Play className="h-4 w-4" />
            </span>
            {reabrindo ? "Refazer o quadro" : "Iniciar"} {sprint.nome}
          </DialogTitle>
          <DialogDescription>
            {reabrindo
              ? "Redefinir as colunas apaga o quadro atual desta sprint, e os cards dela vão junto."
              : "Agora que o escopo do ciclo está claro, nomeie as etapas por onde os cards vão passar."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 flex-1 min-h-0 overflow-y-auto px-1 py-1">
          <div className="flex items-baseline justify-between gap-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Colunas do quadro</Label>
            <span className="text-[10.5px] text-muted-foreground">a última conclui o card</span>
          </div>
          <ConstrutorLinhas
            linhas={cols} setLinhas={setCols} comCor
            placeholder="Nome da etapa" placeholderUltima="Nome da etapa final"
            rodape="Adicionar coluna"
          />

          <div className="space-y-1.5 pt-2 sm:max-w-[15rem]">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Prazo da sprint <span className="normal-case tracking-normal opacity-60">(opcional)</span>
            </Label>
            <CampoData valor={prazo} onChange={setPrazo} />
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 pt-3">
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={iniciar} disabled={salvando || !preenchidas.length}>
            {salvando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Play className="h-4 w-4 mr-1.5" />}
            {reabrindo ? "Refazer quadro" : "Iniciar sprint"}
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
      <DialogContent className="sm:max-w-lg max-w-[95vw] max-h-[92dvh] flex flex-col overflow-hidden gap-3">
        <DialogHeader className="shrink-0">
          <DialogTitle>Editar card</DialogTitle>
          <DialogDescription>Mover de coluna aqui vale o mesmo que arrastar no quadro.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5 flex-1 min-h-0 overflow-y-auto px-1 py-1">
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
              <Select value={colId} onValueChange={setColId}>
                <SelectTrigger><SelectValue placeholder="Escolha a coluna" /></SelectTrigger>
                <SelectContent>
                  {colunas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", paleta(c.cor).ponto)} />
                        {c.nome}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Prazo estipulado</Label>
              <CampoData valor={prazo} onChange={setPrazo} />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Responsável</Label>
            <SeletorPessoas
              pessoas={perfis}
              selecionados={resp ? [resp] : []}
              onToggle={(id) => setResp((old) => (old === id ? "" : id))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
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
  const [sprintAberta, setSprintAberta] = useState<string | null>(null);
  const [iniciarSprint, setIniciarSprint] = useState<{ sprint: Sprint; reabrindo: boolean } | null>(null);
  const [novaSprintAberta, setNovaSprintAberta] = useState(false);
  const [editProjeto, setEditProjeto] = useState<Projeto | null>(null);
  const [editSprint, setEditSprint] = useState<Sprint | null>(null);
  const [editCol, setEditCol] = useState<string | null>(null);
  const [nomeCol, setNomeCol] = useState("");
  const [nomeNovaSprint, setNomeNovaSprint] = useState("");
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

  const sprintsQ = useQuery({
    queryKey: ["projeto_sprints"],
    queryFn: async (): Promise<Sprint[]> => {
      const { data } = await (supabase.from("projeto_sprints" as never) as never as any)
        .select("*").order("ordem");
      return (data || []) as Sprint[];
    },
  });

  const colunasQ = useQuery({
    queryKey: ["projeto_colunas"],
    queryFn: async (): Promise<Coluna[]> => {
      const { data } = await (supabase.from("projeto_colunas" as never) as never as any)
        .select("*").order("ordem");
      return (data || []) as Coluna[];
    },
  });
  const envolvidosQ = useQuery({
    queryKey: ["projeto_envolvidos"],
    queryFn: async (): Promise<{ projeto_id: string; user_id: string }[]> => {
      const { data } = await (supabase.from("projeto_envolvidos" as never) as never as any).select("projeto_id, user_id");
      return (data || []) as { projeto_id: string; user_id: string }[];
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
  const sprints = sprintsQ.data || [];
  const envolvidos = envolvidosQ.data || [];
  const sprintsDe = (projetoId: string) => sprints.filter((x) => x.projeto_id === projetoId);
  const envolvidosDe = (projetoId: string) =>
    envolvidos.filter((e) => e.projeto_id === projetoId)
      .map((e) => perfis.find((pf) => pf.id === e.user_id))
      .filter(Boolean) as Perfil[];

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["projetos"] });
    qc.invalidateQueries({ queryKey: ["projeto_colunas"] });
    qc.invalidateQueries({ queryKey: ["projeto_cards"] });
    qc.invalidateQueries({ queryKey: ["projeto_envolvidos"] });
    qc.invalidateQueries({ queryKey: ["projeto_sprints"] });
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

  const criarCard = async (projetoId: string, sprintId: string, colunaId: string) => {
    const t = rascunho.trim();
    if (!t) { setNovoEmCol(null); return; }
    const ordem = cards.filter((c) => c.coluna_id === colunaId).length;
    // Entra otimista pra a animação acontecer no clique, não depois do
    // ida-e-volta com o banco. O id provisório é trocado no refetch.
    const tmp = `tmp-${Date.now()}`;
    qc.setQueryData<Card[]>(["projeto_cards"], (old) => [...(old || []), {
      id: tmp, projeto_id: projetoId, sprint_id: sprintId, coluna_id: colunaId, titulo: t, descricao: null,
      responsavel_id: null, prazo: null, prioridade: "normal", ordem,
      concluido_at: null, cliente_id: null, processo_id: null, chamado_id: null,
    } as Card]);
    setRascunho("");
    const { error } = await (supabase.from("projeto_cards" as never) as never as any).insert({
      projeto_id: projetoId, sprint_id: sprintId, coluna_id: colunaId, titulo: t, ordem,
      created_by: user?.id ?? null,
    });
    if (error) {
      qc.setQueryData<Card[]>(["projeto_cards"], (old) => (old || []).filter((c) => c.id !== tmp));
      toast.error("Erro: " + error.message);
      return;
    }
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

  const criarSprint = async (projetoId: string) => {
    const t = nomeNovaSprint.trim();
    if (!t) { setNovaSprintAberta(false); return; }
    const ordem = sprints.filter((x) => x.projeto_id === projetoId).length;
    const { error } = await (supabase.from("projeto_sprints" as never) as never as any)
      .insert({ projeto_id: projetoId, nome: t, ordem, created_by: user?.id ?? null });
    if (error) { toast.error("Erro: " + error.message); return; }
    setNomeNovaSprint(""); setNovaSprintAberta(false);
    qc.invalidateQueries({ queryKey: ["projeto_sprints"] });
  };

  // Renomear coluna não mexe nos cards. Refazer o quadro inteiro é outra
  // coisa, fica no botão de Refazer colunas.
  const salvarNomeColuna = async (colId: string) => {
    const t = nomeCol.trim();
    setEditCol(null);
    if (!t) return;
    const { error } = await (supabase.from("projeto_colunas" as never) as never as any)
      .update({ nome: t }).eq("id", colId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["projeto_colunas"] });
  };

  const trocarCorColuna = async (colId: string, cor: string) => {
    const { error } = await (supabase.from("projeto_colunas" as never) as never as any)
      .update({ cor }).eq("id", colId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["projeto_colunas"] });
  };

  const concluirSprint = async (sp: Sprint) => {
    const { error } = await (supabase.from("projeto_sprints" as never) as never as any)
      .update({ status: "concluida", concluida_at: new Date().toISOString() }).eq("id", sp.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${sp.nome} concluída`);
    qc.invalidateQueries({ queryKey: ["projeto_sprints"] });
  };

  const projetoAberto = projetos.find((p) => p.id === aberto) || null;

  /* ══════════════ QUADRO ══════════════ */
  if (projetoAberto) {
    const P = paleta(projetoAberto.cor);
    const Icone = icone(projetoAberto.icone);
    const doProjeto = sprints.filter((x) => x.projeto_id === projetoAberto.id).sort((a, b) => a.ordem - b.ordem);
    // Abre na sprint ativa; se não houver, na primeira.
    const spSel = doProjeto.find((x) => x.id === sprintAberta)
      || doProjeto.find((x) => x.status === "ativa")
      || doProjeto[0] || null;
    const cols = spSel ? colunas.filter((c) => c.sprint_id === spSel.id).sort((a, b) => a.ordem - b.ordem) : [];
    const cardsSprint = spSel ? cards.filter((c) => c.sprint_id === spSel.id) : [];
    const feitos = cardsSprint.filter((c) => c.concluido_at).length;
    const atrasados = cardsSprint.filter((c) => !c.concluido_at && c.prazo && c.prazo < new Date().toISOString().slice(0, 10)).length;
    const pct = cardsSprint.length ? (feitos / cardsSprint.length) * 100 : 0;

    return (
      <div className="space-y-5">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}
          className="flex items-start gap-3 flex-wrap">
          <button onClick={() => { setAberto(null); setSprintAberta(null); }}
            className="h-9 w-9 rounded-xl grid place-items-center border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06] transition-colors shrink-0">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className={cn("h-11 w-11 rounded-2xl grid place-items-center ring-1 shrink-0", P.chip)}>
            <Icone className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-medium tracking-tight">{projetoAberto.nome}</h2>
            <p className="text-[13px] text-muted-foreground line-clamp-2 leading-snug">
              {projetoAberto.descricao || "Sem descrição"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setEditProjeto(projetoAberto)} title="Editar projeto"
              className="h-9 w-9 rounded-xl grid place-items-center border border-white/[0.07] bg-white/[0.03] text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {atrasados > 0 && (
              <span className="text-[11px] px-2 py-1 rounded-full ring-1 bg-rose-500/15 text-rose-400 ring-rose-500/30">
                {atrasados} atrasado{atrasados > 1 ? "s" : ""}
              </span>
            )}
            {spSel?.status === "ativa" && <Anel pct={pct} cor={projetoAberto.cor} />}
          </div>
        </motion.div>

        {/* Faixa de sprints */}
        <div className="flex items-center gap-2 flex-wrap">
          {doProjeto.map((sp) => {
            const on = spSel?.id === sp.id;
            const nCards = cards.filter((c) => c.sprint_id === sp.id).length;
            return (
              <button key={sp.id} onClick={() => setSprintAberta(sp.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg ring-1 text-[12px] transition-all duration-200 inline-flex items-center gap-2",
                  on ? cn(P.chip, "ring-1") : "ring-white/[0.08] text-muted-foreground hover:bg-white/[0.04]",
                )}>
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0",
                  sp.status === "ativa" ? P.ponto : sp.status === "concluida" ? "bg-emerald-400" : "bg-muted-foreground/40")} />
                {sp.nome}
                {sp.status === "planejada" && <span className="text-[10px] opacity-60">planejada</span>}
                {sp.status === "concluida" && <span className="text-[10px] opacity-60">concluída</span>}
                {sp.status === "ativa" && nCards > 0 && <span className="text-[10px] tabular-nums opacity-70">{nCards}</span>}
                {sp.status !== "concluida" && sp.prazo && (() => {
                  const su = urgenciaPrazo(sp.prazo);
                  return su ? <span className={cn("text-[10px] px-1.5 rounded-full ring-1", su.chip)}>{su.label}</span> : null;
                })()}
              </button>
            );
          })}

          {novaSprintAberta ? (
            <div className="inline-flex items-center gap-1.5">
              <Input value={nomeNovaSprint} onChange={(e) => setNomeNovaSprint(e.target.value)} autoFocus
                placeholder="Nome da sprint" className="h-8 w-44 text-[12px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); criarSprint(projetoAberto.id); }
                  if (e.key === "Escape") { setNovaSprintAberta(false); setNomeNovaSprint(""); }
                }} />
              <Button size="sm" className="h-8 text-[11px]" onClick={() => criarSprint(projetoAberto.id)}>Criar</Button>
              <button onClick={() => { setNovaSprintAberta(false); setNomeNovaSprint(""); }}
                className="h-8 w-8 grid place-items-center rounded-md text-muted-foreground hover:bg-white/[0.05]">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button onClick={() => setNovaSprintAberta(true)}
              className="px-3 py-1.5 rounded-lg border border-dashed border-white/[0.12] text-[12px] text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors inline-flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Nova sprint
            </button>
          )}
        </div>

        {/* Sprint sem quadro ainda */}
        {spSel && cols.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ease: EASE }}
            className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8">
            <div className="flex items-center gap-3">
              <span className={cn("h-2 w-2 rounded-full shrink-0", "bg-muted-foreground/40")} />
              <h3 className="text-lg font-medium">{spSel.nome}</h3>
              <span className="text-[11px] px-2 py-0.5 rounded-full ring-1 ring-white/10 text-muted-foreground">planejada</span>
              {spSel.prazo && (
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" /> {fmtDataCurta(spSel.prazo)}
                </span>
              )}
            </div>
            <p className="text-[13px] text-muted-foreground mt-2 max-w-md">
              Esta sprint ainda não tem quadro. Ao iniciar, você nomeia as etapas por onde os cards
              vão passar; elas valem só para ela.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <Button onClick={() => setIniciarSprint({ sprint: spSel, reabrindo: false })}>
                <Play className="h-4 w-4 mr-1.5" /> Iniciar sprint
              </Button>
              <Button variant="ghost" onClick={() => setEditSprint(spSel)}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
              </Button>
            </div>
          </motion.div>
        ) : spSel ? (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{spSel.nome}</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {feitos}/{cardsSprint.length} {cardsSprint.length === 1 ? "card" : "cards"}
              </span>
              {spSel.prazo && (() => {
                const su = urgenciaPrazo(spSel.status === "concluida" ? null : spSel.prazo);
                return (
                  <span className={cn("text-[11px] px-2 py-0.5 rounded-full ring-1 inline-flex items-center gap-1",
                    su ? su.chip : "ring-white/10 text-muted-foreground")}>
                    <CalendarDays className="h-3 w-3" /> {fmtDataCurta(spSel.prazo)}{su ? ` · ${su.label}` : ""}
                  </span>
                );
              })()}
              <div className="ml-auto flex items-center gap-1">
                <button onClick={() => setEditSprint(spSel)}
                  className="text-[11px] px-2 py-1 rounded-md text-muted-foreground hover:bg-white/[0.05] hover:text-foreground transition-colors inline-flex items-center gap-1">
                  <Pencil className="h-3 w-3" /> Editar sprint
                </button>
                <button onClick={() => setIniciarSprint({ sprint: spSel, reabrindo: true })}
                  className="text-[11px] px-2 py-1 rounded-md text-muted-foreground hover:bg-white/[0.05] hover:text-foreground transition-colors inline-flex items-center gap-1">
                  <LayoutGrid className="h-3 w-3" /> Refazer colunas
                </button>
                {spSel.status === "ativa" && (
                  <button onClick={() => concluirSprint(spSel)}
                    className="text-[11px] px-2 py-1 rounded-md text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors inline-flex items-center gap-1">
                    <Check className="h-3 w-3" /> Concluir sprint
                  </button>
                )}
              </div>
            </div>

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
                    <div className="group/col flex items-center gap-2 px-1 pb-2.5">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button title="Cor da coluna"
                            className={cn("h-2 w-2 rounded-full shrink-0 transition-transform hover:scale-150", cp.ponto)} />
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2" align="start">
                          <div className="grid grid-cols-7 gap-1.5">
                            {CORES.map((k) => (
                              <button key={k} onClick={() => trocarCorColuna(col.id, k)} title={PALETA[k].rotulo}
                                className={cn("h-7 w-7 rounded-lg transition-all", PALETA[k].barra,
                                  col.cor === k ? "ring-2 ring-offset-2 ring-offset-popover ring-white/70" : "opacity-60 hover:opacity-100")} />
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>

                      {editCol === col.id ? (
                        <Input
                          value={nomeCol} onChange={(e) => setNomeCol(e.target.value)} autoFocus
                          onBlur={() => salvarNomeColuna(col.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); salvarNomeColuna(col.id); }
                            if (e.key === "Escape") setEditCol(null);
                          }}
                          className="h-7 text-[12px] font-semibold uppercase tracking-wider flex-1 px-2"
                        />
                      ) : (
                        <>
                          <span className="text-[12px] font-semibold uppercase tracking-wider truncate">{col.nome}</span>
                          <button onClick={() => { setEditCol(col.id); setNomeCol(col.nome); }} title="Renomear coluna"
                            className="opacity-0 group-hover/col:opacity-100 h-6 w-6 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-all shrink-0">
                            <Pencil className="h-3 w-3" />
                          </button>
                          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{doCol.length}</span>
                        </>
                      )}
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
                              initial={{ opacity: 0, y: -12, scale: 0.92 }}
                              animate={{ opacity: arrastando === c.id ? 0.4 : 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, x: 24, scale: 0.9, transition: { duration: 0.16 } }}
                              transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.7 }}
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
                      <motion.div className="mt-2"
                        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ ease: EASE, duration: 0.18 }}>
                        <Textarea
                          value={rascunho} onChange={(e) => setRascunho(e.target.value)} autoFocus rows={2}
                          placeholder="O que precisa ser feito?"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); criarCard(projetoAberto.id, spSel.id, col.id); }
                            if (e.key === "Escape") { setNovoEmCol(null); setRascunho(""); }
                          }}
                          className="resize-none text-[13px] bg-white/[0.03]"
                        />
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Button size="sm" className="h-7 text-[11px]" onClick={() => criarCard(projetoAberto.id, spSel.id, col.id)}>Adicionar</Button>
                          <button onClick={() => { setNovoEmCol(null); setRascunho(""); }}
                            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:bg-white/[0.05]">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </motion.div>
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
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-10">
            Este projeto ainda não tem sprint. Crie a primeira acima.
          </p>
        )}

        <CardDialog card={cardAberto} colunas={cols} perfis={perfis}
          onClose={() => setCardAberto(null)} onSalvo={() => qc.invalidateQueries({ queryKey: ["projeto_cards"] })} />
        <IniciarSprintDialog
          sprint={iniciarSprint?.sprint ?? null}
          reabrindo={!!iniciarSprint?.reabrindo}
          onClose={() => setIniciarSprint(null)}
          onIniciada={recarregar}
        />
        <EditarProjetoDialog
          projeto={editProjeto} perfis={perfis}
          envolvidosAtuais={envolvidosDe(projetoAberto.id).map((x) => x.id)}
          onClose={() => setEditProjeto(null)}
          onSalvo={() => { recarregar(); if (editProjeto) setAberto(editProjeto.id); }}
        />
        <EditarSprintDialog sprint={editSprint} onClose={() => setEditSprint(null)} onSalvo={recarregar} />
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
                Campanhas, mudanças internas, metas do trimestre: o que tem começo, meio e fim
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
              // Projeto não tem prazo; o sinal é a sprint aberta que vence antes.
              const spPrazo = sprintsDe(p.id)
                .filter((x) => x.status !== "concluida" && x.prazo)
                .sort((a, b) => (a.prazo || "").localeCompare(b.prazo || ""))[0] || null;
              const u = urgenciaPrazo(spPrazo?.prazo || null);
              const equipe = envolvidosDe(p.id);
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
                        {sprintsDe(p.id).length} sprint{sprintsDe(p.id).length === 1 ? "" : "s"}
                      </span>
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
                          <CalendarDays className="h-2.5 w-2.5" /> {spPrazo?.nome}: {fmtDataCurta(spPrazo?.prazo)}
                        </span>
                      )}
                      {p.status === "pausado" && (
                        <span className="px-1.5 py-0.5 rounded-full ring-1 bg-white/[0.05] text-muted-foreground ring-white/10 inline-flex items-center gap-1">
                          <Pause className="h-2.5 w-2.5" /> Pausado
                        </span>
                      )}
                      {equipe.length > 0 && (
                        <span className="ml-auto"><AvataresPessoas pessoas={equipe} max={3} /></span>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setEditProjeto(p)}
                        className="text-[11px] px-2 py-1 rounded-md text-muted-foreground hover:bg-white/[0.05] hover:text-foreground transition-colors inline-flex items-center gap-1">
                        <Pencil className="h-3 w-3" /> Editar
                      </button>
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

      <EditarProjetoDialog
        projeto={editProjeto} perfis={perfis}
        envolvidosAtuais={editProjeto ? envolvidosDe(editProjeto.id).map((x) => x.id) : []}
        onClose={() => setEditProjeto(null)} onSalvo={recarregar}
      />
    </div>
  );
}
