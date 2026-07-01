import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, animate } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { appConfig } from "@/config/app-config";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Trophy, Plus, User, CalendarDays, AlertTriangle, FolderUp, Trash2, Hash, Loader2,
  ChevronLeft, ChevronRight, Flame, Zap, Target, Users, Crown, Sparkles, Settings2, Coins,
} from "lucide-react";
import { RUBRICAS_FECHAMENTO, RUBRICA_LABEL } from "@/lib/rubricasFechamento";

/* ─────────────────────────── tipos ─────────────────────────── */
interface Fechamento {
  id: string;
  data: string;
  cliente_nome: string;
  cliente_id: string | null;
  rubricas: string[] | null;
  pendencia: boolean;
  pasta_drive: boolean;
  responsavel: string | null;
  user_id: string | null;
}
interface Regra {
  mes: string;
  valor_base: number;               // R$ por ação (faixa base)
  valor_especial: number;           // R$ por ação depois do limite (faixa especial)
  especial_ativo: boolean;          // admin liga/desliga a faixa especial no mês
  especial_limite: number | null;   // base vale ATÉ X ações; acima disso vale o especial
  meta_geral: number;
  bonus: number;
}
interface Membro { id: string; nome: string | null; email: string | null }

/* ─────────────────────────── helpers ─────────────────────────── */
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const intBR = (n: number) => Math.round(n).toLocaleString("pt-BR");

const hojeMes = () => new Date().toISOString().slice(0, 7);
function addMes(mes: string, delta: number) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const MESES_EXT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function mesExtenso(mes: string) {
  if (!mes) return "—";
  const [y, m] = mes.split("-").map(Number);
  return `${MESES_EXT[m - 1]} de ${y}`;
}
const fmtData = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const primeiroNome = (n: string | null | undefined) => (n || "").trim().split(/\s+/)[0] || "—";

function toRegra(mes: string, row: any): Regra {
  const r = row || {};
  return {
    mes,
    valor_base: Number(r.valor_base ?? 5),
    valor_especial: Number(r.valor_especial ?? 0),
    especial_ativo: !!r.especial_ativo,
    especial_limite: r.mult_especial_min == null ? null : Number(r.mult_especial_min),
    meta_geral: Number(r.meta_geral ?? 0),
    bonus: Number(r.bonus ?? 0),
  };
}
/**
 * Faixa especial vigente é INDIVIDUAL: cada pessoa passa pra faixa especial
 * quando as PRÓPRIAS ações do mês ultrapassam o limite (e o admin ativou a
 * faixa naquele mês). Ex.: base R$5/ação até 20; da 21ª em diante vale R$6.
 */
function especialAtivoPara(acoes: number, r: Regra) {
  if (!r.especial_ativo || r.valor_especial <= 0) return false;
  const lim = r.especial_limite ?? 0;
  return acoes > lim;
}
/** Valor por ação vigente (R$): base ou especial, conforme a faixa. */
function valorAcaoVigente(acoes: number, r: Regra) {
  return especialAtivoPara(acoes, r) ? r.valor_especial : r.valor_base;
}
/** Comissão = ações × valor_por_ação_vigente + bônus individual. */
function comissaoDe(acoes: number, r: Regra, bonusIndiv: number) {
  return acoes * valorAcaoVigente(acoes, r) + bonusIndiv;
}

/* ─────────────────────── mini-componentes ─────────────────────── */
function CountUp({ value, format, className }: { value: number; format?: (n: number) => string; className?: string }) {
  const [disp, setDisp] = useState(0);
  useEffect(() => {
    const controls = animate(0, value, { duration: 0.7, ease: "easeOut", onUpdate: (v) => setDisp(v) });
    return () => controls.stop();
  }, [value]);
  return <span className={className}>{format ? format(disp) : intBR(disp)}</span>;
}

function Barra({ value, max, className }: { value: number; max: number; className: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : value > 0 ? 100 : 0;
  const full = max > 0 && value >= max;
  return (
    <div className="relative h-2.5 rounded-full bg-black/25 overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${className}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
      {full && <div className="fech-shimmer absolute inset-0 pointer-events-none" />}
    </div>
  );
}

/* ══════════════════════════ página ══════════════════════════ */
export default function Fechamentos() {
  useEffect(() => { document.title = `Fechamentos — ${appConfig.name}`; }, []);
  const { user, profile, isAdmin } = useAuth();

  const [mesAtivo, setMesAtivo] = useState(hojeMes());
  const [novoOpen, setNovoOpen] = useState(false);
  const [regrasOpen, setRegrasOpen] = useState(false);
  const [scope, setScope] = useState<string>("geral"); // admin: 'geral' | userId

  /* queries */
  const fechRes = useQuery({
    queryKey: ["fechamentos"],
    queryFn: async (): Promise<Fechamento[]> => {
      const { data, error } = await supabase
        .from("fechamentos" as any)
        .select("id, data, cliente_nome, cliente_id, rubricas, pendencia, pasta_drive, responsavel, user_id")
        .order("data", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Fechamento[];
    },
    refetchInterval: 60_000,
  });

  const regrasRes = useQuery({
    // v2: descarta o cache persistido (localStorage) da versão antiga, que
    // guardava esta chave como objeto Record<string,number> — a nova query
    // devolve um array e `.find` quebraria no formato antigo reidratado.
    queryKey: ["fechamentos_regras_v2"],
    queryFn: async (): Promise<any[]> => {
      const { data, error } = await supabase.from("fechamentos_meses" as any).select("*");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const metasRes = useQuery({
    queryKey: ["fechamentos_metas"],
    queryFn: async (): Promise<any[]> => {
      const { data, error } = await supabase.from("fechamentos_metas" as any).select("*");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const equipeRes = useQuery({
    queryKey: ["fechamentos_equipe"],
    queryFn: async (): Promise<Membro[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, email, role, approved")
        .eq("approved", true)
        .order("nome");
      if (error) throw error;
      // "equipe" = quem fecha (users). Admin fica de fora do ranking/atribuição.
      return ((data || []) as any[]).filter((p) => p.role === "user").map((p) => ({ id: p.id, nome: p.nome, email: p.email }));
    },
  });

  const clientesRes = useQuery({
    queryKey: ["fechamentos_clientes_lookup"],
    queryFn: async (): Promise<{ id: string; nome: string }[]> => {
      const { data, error } = await supabase.from("clientes").select("id, nome").order("nome");
      if (error) throw error;
      return (data || []) as any;
    },
  });

  // Array.isArray em tudo: o cache reidratado do localStorage pode trazer
  // formatos antigos (ex.: objeto no lugar de array) e não pode derrubar a tela.
  const fechamentos = Array.isArray(fechRes.data) ? fechRes.data : [];
  const equipe = Array.isArray(equipeRes.data) ? equipeRes.data : [];
  const regra = useMemo(() => {
    const rows = Array.isArray(regrasRes.data) ? regrasRes.data : [];
    return toRegra(mesAtivo, rows.find((r) => r.mes === mesAtivo));
  }, [regrasRes.data, mesAtivo]);
  const metasMap = useMemo(() => {
    const m: Record<string, { meta: number; bonus: number }> = {};
    const rows = Array.isArray(metasRes.data) ? metasRes.data : [];
    for (const r of rows) if (r.mes === mesAtivo) m[r.user_id] = { meta: Number(r.meta) || 0, bonus: Number(r.bonus) || 0 };
    return m;
  }, [metasRes.data, mesAtivo]);

  const doMes = useMemo(() => fechamentos.filter((f) => (f.data || "").slice(0, 7) === mesAtivo), [fechamentos, mesAtivo]);
  const acoesDe = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of doMes) {
      const k = f.user_id || "—";
      map[k] = (map[k] || 0) + (f.rubricas?.length || 0);
    }
    return map;
  }, [doMes]);
  const teamAcoes = useMemo(() => doMes.reduce((a, f) => a + (f.rubricas?.length || 0), 0), [doMes]);

  // Foco: user comum vê a si; admin vê o scope escolhido (ou geral)
  const focoId = isAdmin ? (scope === "geral" ? null : scope) : user?.id || null;
  const focoNome = focoId
    ? equipe.find((m) => m.id === focoId)?.nome || (focoId === user?.id ? profile?.nome : null)
    : null;

  const focoAcoes = focoId ? acoesDe[focoId] || 0 : 0;
  const focoMeta = focoId ? metasMap[focoId]?.meta || 0 : 0;
  const focoBonus = focoId ? metasMap[focoId]?.bonus || 0 : 0;
  const focoEspecialAtivo = especialAtivoPara(focoAcoes, regra);
  const focoValorAcao = valorAcaoVigente(focoAcoes, regra);
  const focoComissao = comissaoDe(focoAcoes, regra, focoBonus);

  const ranking = useMemo(() => {
    return equipe
      .map((m) => {
        const a = acoesDe[m.id] || 0;
        const mt = metasMap[m.id] || { meta: 0, bonus: 0 };
        return { membro: m, acoes: a, meta: mt.meta, bonus: mt.bonus, especial: especialAtivoPara(a, regra), valorAcao: valorAcaoVigente(a, regra), comissao: comissaoDe(a, regra, mt.bonus) };
      })
      .sort((x, y) => y.acoes - x.acoes);
  }, [equipe, acoesDe, metasMap, regra]);

  // Lista/rubricas conforme o foco (individual filtra, geral mostra tudo)
  const listaMes = focoId ? doMes.filter((f) => f.user_id === focoId) : doMes;
  const porRubrica = useMemo(() => {
    const cont: Record<string, number> = {};
    for (const f of listaMes) for (const r of f.rubricas || []) cont[r] = (cont[r] || 0) + 1;
    return Object.entries(cont).sort((a, b) => b[1] - a[1]);
  }, [listaMes]);

  const refetchAll = () => { fechRes.refetch(); regrasRes.refetch(); metasRes.refetch(); };

  const excluir = async (f: Fechamento) => {
    if (!window.confirm(`Excluir o fechamento de ${f.cliente_nome} (${fmtData(f.data)})?`)) return;
    const { error } = await supabase.from("fechamentos" as any).delete().eq("id", f.id);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    toast.success("Fechamento excluído");
    refetchAll();
  };

  const carregando = fechRes.isLoading || equipeRes.isLoading;
  const ehMesAtual = mesAtivo === hojeMes();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-400" /> Fechamentos &amp; Comissões
          </h1>
          <p className="text-sm text-muted-foreground">Placar do mês, metas e comissão por multiplicador.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button variant="outline" onClick={() => setRegrasOpen(true)} className="gap-1.5">
              <Settings2 className="h-4 w-4" /> Regras do mês
            </Button>
          )}
          <Button onClick={() => setNovoOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Novo fechamento
          </Button>
        </div>
      </div>

      {/* Navegação de mês — estilo calendário, foco no mês atual */}
      <div className="flex items-center justify-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => setMesAtivo((m) => addMes(m, -1))} aria-label="Mês anterior">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-[190px] text-center">
          <div className="text-base font-semibold capitalize inline-flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" /> {mesExtenso(mesAtivo)}
          </div>
          {!ehMesAtual && (
            <button onClick={() => setMesAtivo(hojeMes())} className="block mx-auto mt-0.5 text-[11px] text-primary hover:underline">
              voltar pro mês atual
            </button>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMesAtivo((m) => addMes(m, 1))} aria-label="Próximo mês">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Seletor de quadro (admin) */}
      {isAdmin && equipe.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground mr-1">Quadro:</span>
          <ScopePill active={scope === "geral"} onClick={() => setScope("geral")} icon={Users} label="Geral" />
          {equipe.map((m) => (
            <ScopePill key={m.id} active={scope === m.id} onClick={() => setScope(m.id)} icon={User} label={primeiroNome(m.nome)} />
          ))}
        </div>
      )}

      {carregando ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (
        <>
          {/* ── DASHBOARD ── */}
          {/* GERAL (prioridade) */}
          <CardGeral
            acoes={teamAcoes}
            meta={regra.meta_geral}
            pessoas={ranking.filter((r) => r.acoes > 0).length}
            mes={mesAtivo}
          />

          {focoId ? (
            /* Quadro individual (user comum sempre; admin quando escolhe pessoa) */
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <CardIndividual nome={focoNome} acoes={focoAcoes} meta={focoMeta} />
              <CardValorAcao regra={regra} acoes={focoAcoes} vigente={focoValorAcao} especialAtivo={focoEspecialAtivo} />
              <CardComissao acoes={focoAcoes} valorAcao={focoValorAcao} bonus={focoBonus} total={focoComissao} />
            </div>
          ) : (
            /* Placar geral (admin, visão time) */
            <Leaderboard ranking={ranking} />
          )}

          {/* ── LISTA + RUBRICAS ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-2">
              <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground px-1">
                {focoNome ? `Fechamentos de ${primeiroNome(focoNome)}` : "Todos os fechamentos"} · {mesExtenso(mesAtivo)} ({listaMes.length})
              </h2>
              {listaMes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  Nenhum fechamento neste mês. Clique em <strong>Novo fechamento</strong> pra começar.
                </div>
              ) : listaMes.map((f) => (
                <div key={f.id} className="rounded-xl border border-border bg-card/40 p-3 group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{f.cliente_nome}</span>
                        {!focoId && f.user_id && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                            {primeiroNome(equipe.find((m) => m.id === f.user_id)?.nome || f.responsavel)}
                          </span>
                        )}
                        {f.cliente_id && (
                          <a href={`/clientes/${f.cliente_id}`} className="text-[10px] text-primary hover:underline">ver ficha</a>
                        )}
                        {f.pendencia && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-full px-1.5 py-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" /> pendência
                          </span>
                        )}
                        {f.pasta_drive && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 rounded-full px-1.5 py-0.5">
                            <FolderUp className="h-2.5 w-2.5" /> no Drive
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" /> {fmtData(f.data)}
                        <span className="text-muted-foreground/50">·</span>
                        {f.rubricas?.length || 0} {(f.rubricas?.length || 0) === 1 ? "ação" : "ações"}
                      </div>
                    </div>
                    <button
                      onClick={() => excluir(f)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/60 hover:text-red-400 shrink-0"
                      title="Excluir fechamento"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {(f.rubricas?.length || 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {f.rubricas!.map((r) => (
                        <span key={r} className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted/30 text-foreground/80" title={RUBRICA_LABEL[r] || r}>
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground px-1">Ações por rubrica</h2>
              <div className="rounded-xl border border-border bg-card/40 divide-y divide-border/60">
                {porRubrica.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 italic p-3">Sem ações neste mês.</p>
                ) : porRubrica.map(([r, n]) => (
                  <div key={r} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="text-xs truncate" title={RUBRICA_LABEL[r] || r}>{RUBRICA_LABEL[r] || r}</span>
                    <span className="text-xs tabular-nums shrink-0 font-semibold">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <NovoFechamentoDialog
        open={novoOpen}
        onClose={() => setNovoOpen(false)}
        clientes={Array.isArray(clientesRes.data) ? clientesRes.data : []}
        equipe={equipe}
        defaultUserId={focoId || user?.id || equipe[0]?.id || null}
        onSaved={() => { setNovoOpen(false); refetchAll(); }}
      />

      {isAdmin && (
        <RegrasDialog
          open={regrasOpen}
          onClose={() => setRegrasOpen(false)}
          mes={mesAtivo}
          regra={regra}
          equipe={equipe}
          metasMap={metasMap}
          onSaved={() => { setRegrasOpen(false); refetchAll(); }}
        />
      )}
    </div>
  );
}

/* ─────────────────────── componentes de UI ─────────────────────── */
function ScopePill({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border inline-flex items-center gap-1.5 transition-colors ${
        active ? "bg-primary/15 text-primary border-primary/30" : "border-border text-muted-foreground hover:border-primary/40"
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function CardGeral({ acoes, meta, pessoas, mes }: { acoes: number; meta: number; pessoas: number; mes: string }) {
  const bateu = meta > 0 && acoes >= meta;
  const pct = meta > 0 ? Math.min(100, Math.round((acoes / meta) * 100)) : 0;
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-5 ${bateu ? "border-emerald-500/40 bg-emerald-500/10" : "border-primary/30 bg-gradient-to-br from-primary/15 to-primary/5"}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary/80 font-semibold flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> Placar geral · {mesExtenso(mes)}
          </p>
          <div className="mt-1 flex items-end gap-2">
            <CountUp value={acoes} className="text-5xl font-black tabular-nums leading-none" />
            <span className="text-lg text-muted-foreground mb-1">
              {meta > 0 ? <>/ {intBR(meta)} ações</> : "ações"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {pessoas} {pessoas === 1 ? "pessoa contribuindo" : "pessoas contribuindo"} este mês
          </p>
        </div>
        {bateu ? (
          <div className="text-right animate-salt-bounce">
            <div className="text-2xl">🎉</div>
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">Meta batida!</span>
          </div>
        ) : meta > 0 ? (
          <div className="text-right">
            <div className="text-3xl font-black text-primary tabular-nums"><CountUp value={pct} format={(n) => `${Math.round(n)}%`} /></div>
            <span className="text-[11px] text-muted-foreground uppercase tracking-wide">da meta geral</span>
          </div>
        ) : null}
      </div>
      {meta > 0 && (
        <div className="mt-4">
          <Barra value={acoes} max={meta} className={bateu ? "bg-gradient-to-r from-emerald-400 to-emerald-500" : "bg-gradient-to-r from-primary/70 to-primary"} />
        </div>
      )}
    </div>
  );
}

function CardIndividual({ nome, acoes, meta }: { nome: string | null; acoes: number; meta: number }) {
  const bateu = meta > 0 && acoes >= meta;
  const pct = meta > 0 ? Math.min(100, Math.round((acoes / meta) * 100)) : 0;
  return (
    <div className={`rounded-2xl border p-4 ${bateu ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-card/50"}`}>
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold flex items-center gap-1.5">
        <Target className="h-3.5 w-3.5" /> Meta individual{nome ? ` · ${primeiroNome(nome)}` : ""}
      </p>
      <div className="mt-1 flex items-end gap-1.5">
        <CountUp value={acoes} className="text-4xl font-black tabular-nums leading-none" />
        <span className="text-sm text-muted-foreground mb-0.5">{meta > 0 ? <>/ {intBR(meta)}</> : "ações"}</span>
      </div>
      {meta > 0 && (
        <div className="mt-3 space-y-1">
          <Barra value={acoes} max={meta} className={bateu ? "bg-gradient-to-r from-emerald-400 to-emerald-500" : "bg-gradient-to-r from-violet-500 to-fuchsia-500"} />
          <p className="text-[11px] text-right text-muted-foreground">{bateu ? "🎉 meta batida" : `${pct}% · faltam ${intBR(Math.max(0, meta - acoes))}`}</p>
        </div>
      )}
    </div>
  );
}

function CardValorAcao({ regra, acoes, vigente, especialAtivo }: { regra: Regra; acoes: number; vigente: number; especialAtivo: boolean }) {
  const temEspecial = regra.especial_ativo && regra.valor_especial > 0;
  const lim = regra.especial_limite ?? 0;
  const faltam = temEspecial && !especialAtivo ? Math.max(0, lim + 1 - acoes) : 0;
  return (
    <div className={`rounded-2xl border p-4 ${especialAtivo ? "border-amber-400/50 bg-amber-400/10 fech-glow" : "border-border bg-card/50"}`}>
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold flex items-center gap-1.5">
        {especialAtivo ? <Flame className="h-3.5 w-3.5 text-amber-400" /> : <Zap className="h-3.5 w-3.5" />} Valor por ação
      </p>
      <div className="mt-1 flex items-center gap-2">
        <span className={`text-4xl font-black tabular-nums leading-none ${especialAtivo ? "text-amber-400" : ""}`}>{brl(vigente)}</span>
        <span className="text-sm text-muted-foreground mb-0.5">/ ação</span>
        {especialAtivo && <Sparkles className="h-5 w-5 text-amber-400" />}
      </div>
      <div className="mt-3 space-y-1 text-[11px]">
        <div className={`flex items-center justify-between ${!especialAtivo ? "text-foreground font-medium" : "text-muted-foreground"}`}>
          <span>Base{temEspecial ? ` (até ${intBR(lim)} ações)` : ""}</span><span className="tabular-nums">{brl(regra.valor_base)}</span>
        </div>
        {temEspecial && (
          <div className={`flex items-center justify-between ${especialAtivo ? "text-amber-400 font-semibold" : "text-muted-foreground"}`}>
            <span>Especial (acima de {intBR(lim)})</span><span className="tabular-nums">{brl(regra.valor_especial)}</span>
          </div>
        )}
        {temEspecial && !especialAtivo && (
          <p className="text-[11px] text-amber-400/90 pt-1">🔥 Faltam <strong>{intBR(faltam)}</strong> ações pra cada ação valer {brl(regra.valor_especial)}</p>
        )}
        {!temEspecial && <p className="text-[11px] text-muted-foreground pt-1">Sem faixa especial neste mês.</p>}
      </div>
    </div>
  );
}

function CardComissao({ acoes, valorAcao, bonus, total }: { acoes: number; valorAcao: number; bonus: number; total: number }) {
  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 p-4">
      <p className="text-[10px] uppercase tracking-[0.15em] text-emerald-400/90 font-semibold flex items-center gap-1.5">
        <Coins className="h-3.5 w-3.5" /> Comissão do mês
      </p>
      <div className="mt-1">
        <CountUp value={total} format={(n) => brl(n)} className="text-3xl font-black tabular-nums leading-none text-emerald-400" />
      </div>
      <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
        {intBR(acoes)} ações × {brl(valorAcao)}/ação
        {bonus > 0 && <> + {brl(bonus)} bônus</>}
      </p>
    </div>
  );
}

function Leaderboard({ ranking }: { ranking: { membro: Membro; acoes: number; meta: number; especial: boolean; valorAcao: number; comissao: number }[] }) {
  const medalhas = ["🥇", "🥈", "🥉"];
  return (
    <div className="rounded-2xl border border-border bg-card/40 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/60 flex items-center gap-2">
        <Crown className="h-4 w-4 text-amber-400" />
        <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-semibold">Ranking do time</span>
      </div>
      {ranking.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 italic p-4">Nenhum membro na equipe ainda.</p>
      ) : (
        <div className="divide-y divide-border/50">
          {ranking.map((r, i) => {
            const pct = r.meta > 0 ? Math.min(100, Math.round((r.acoes / r.meta) * 100)) : 0;
            return (
              <div key={r.membro.id} className={`px-4 py-3 flex items-center gap-3 ${i === 0 && r.acoes > 0 ? "bg-amber-400/5" : ""}`}>
                <div className="w-7 text-center text-lg shrink-0">{r.acoes > 0 && medalhas[i] ? medalhas[i] : <span className="text-sm text-muted-foreground">{i + 1}</span>}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{primeiroNome(r.membro.nome)}</span>
                    {r.especial && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-400/15 text-amber-400 border border-amber-400/30 inline-flex items-center gap-1"><Flame className="h-2.5 w-2.5" />{brl(r.valorAcao)}/ação</span>}
                  </div>
                  {r.meta > 0 && (
                    <div className="mt-1.5 max-w-[240px]">
                      <Barra value={r.acoes} max={r.meta} className="bg-gradient-to-r from-violet-500 to-fuchsia-500" />
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold tabular-nums">{intBR(r.acoes)} <span className="text-[11px] text-muted-foreground font-normal">ações{r.meta > 0 ? ` · ${pct}%` : ""}</span></div>
                  <div className="text-[11px] text-emerald-400 tabular-nums font-semibold">{brl(r.comissao)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── Novo fechamento ─────────────────────── */
function NovoFechamentoDialog({
  open, onClose, clientes, equipe, defaultUserId, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clientes: { id: string; nome: string }[];
  equipe: Membro[];
  defaultUserId: string | null;
  onSaved: () => void;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(hoje);
  const [clienteNome, setClienteNome] = useState("");
  const [userId, setUserId] = useState<string>(defaultUserId || "");
  const [rubricas, setRubricas] = useState<Set<string>>(new Set());
  const [pendencia, setPendencia] = useState(false);
  const [pastaDrive, setPastaDrive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setUserId(defaultUserId || equipe[0]?.id || ""); }, [open, defaultUserId, equipe]);

  const reset = () => {
    setData(hoje); setClienteNome(""); setRubricas(new Set());
    setPendencia(false); setPastaDrive(true);
  };
  const toggle = (k: string) => setRubricas((prev) => {
    const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n;
  });

  const salvar = async () => {
    if (!clienteNome.trim()) { toast.error("Informe o cliente."); return; }
    if (!data) { toast.error("Informe a data."); return; }
    if (!userId) { toast.error("Escolha o responsável."); return; }
    setSaving(true);
    const match = clientes.find((c) => c.nome.trim().toUpperCase() === clienteNome.trim().toUpperCase());
    const nomeResp = equipe.find((m) => m.id === userId)?.nome || null;
    const { error } = await supabase.from("fechamentos" as any).insert({
      data,
      cliente_nome: clienteNome.trim(),
      cliente_id: match?.id || null,
      rubricas: [...rubricas],
      pendencia,
      pasta_drive: pastaDrive,
      user_id: userId,
      responsavel: nomeResp,
      created_by: userId,
    });
    setSaving(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success("Fechamento registrado 🎯");
    reset();
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setTimeout(reset, 200); } }}>
      <DialogContent className="sm:max-w-2xl max-h-[88dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-400" /> Novo fechamento</DialogTitle>
          <DialogDescription>Marque as rubricas/ações fechadas. Cada uma conta como 1 ação no placar.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div>
              <Label>Responsável</Label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {equipe.length === 0 && <option value="">—</option>}
                {equipe.map((m) => <option key={m.id} value={m.id}>{m.nome || m.email}</option>)}
              </select>
            </div>
            <div>
              <Label>Cliente</Label>
              <Input list="fech-clientes" value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Nome do cliente" />
              <datalist id="fech-clientes">{clientes.map((c) => <option key={c.id} value={c.nome} />)}</datalist>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={pastaDrive} onCheckedChange={() => setPastaDrive((v) => !v)} /> Pasta no Drive
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={pendencia} onCheckedChange={() => setPendencia((v) => !v)} /> Tem pendência
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>Rubricas / ações fechadas</Label>
              <span className="text-[11px] text-muted-foreground">{rubricas.size} selecionada(s)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[40vh] overflow-y-auto pr-1 rounded-lg border border-border p-2">
              {RUBRICAS_FECHAMENTO.map((r) => {
                const on = rubricas.has(r.key);
                return (
                  <label key={r.key} className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${on ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                    <Checkbox checked={on} onCheckedChange={() => toggle(r.key)} />
                    <span className="truncate">{r.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { onClose(); setTimeout(reset, 200); }} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>
            {saving ? "Salvando…" : `Salvar (${rubricas.size} ${rubricas.size === 1 ? "ação" : "ações"})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────── Regras do mês (admin) ─────────────────────── */
function RegrasDialog({
  open, onClose, mes, regra, equipe, metasMap, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  mes: string;
  regra: Regra;
  equipe: Membro[];
  metasMap: Record<string, { meta: number; bonus: number }>;
  onSaved: () => void;
}) {
  const [valorBase, setValorBase] = useState("");
  const [especialAtivo, setEspecialAtivo] = useState(false);
  const [valorEsp, setValorEsp] = useState("");
  const [espLimite, setEspLimite] = useState("");
  const [metaGeral, setMetaGeral] = useState("");
  const [bonus, setBonus] = useState("");
  const [metas, setMetas] = useState<Record<string, { meta: string; bonus: string }>>({});
  const [saving, setSaving] = useState(false);

  // Recarrega os campos toda vez que abrir/trocar de mês
  useEffect(() => {
    if (!open) return;
    setValorBase(String(regra.valor_base));
    setEspecialAtivo(regra.especial_ativo);
    setValorEsp(regra.valor_especial ? String(regra.valor_especial) : "");
    setEspLimite(regra.especial_limite == null ? "" : String(regra.especial_limite));
    setMetaGeral(regra.meta_geral ? String(regra.meta_geral) : "");
    setBonus(regra.bonus ? String(regra.bonus) : "");
    const m: Record<string, { meta: string; bonus: string }> = {};
    for (const mem of equipe) {
      const cur = metasMap[mem.id];
      m[mem.id] = { meta: cur?.meta ? String(cur.meta) : "", bonus: cur?.bonus ? String(cur.bonus) : "" };
    }
    setMetas(m);
  }, [open, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  const num = (s: string) => parseFloat(String(s).replace(/\./g, "").replace(",", ".")) || 0;
  const int = (s: string) => Math.max(0, Math.round(num(s)));

  const salvar = async () => {
    setSaving(true);
    const espLim = espLimite.trim() === "" ? null : int(espLimite);
    const { error: e1 } = await supabase.from("fechamentos_meses" as any).upsert({
      mes,
      valor_base: num(valorBase) || 0,
      valor_especial: especialAtivo ? num(valorEsp) : 0,
      especial_ativo: especialAtivo,
      mult_especial_min: especialAtivo ? espLim : null,
      meta_geral: int(metaGeral),
      bonus: num(bonus),
      updated_at: new Date().toISOString(),
    }, { onConflict: "mes" });
    if (e1) { setSaving(false); toast.error("Erro ao salvar regras: " + e1.message); return; }

    const rows = equipe.map((m) => ({
      mes,
      user_id: m.id,
      meta: int(metas[m.id]?.meta || ""),
      bonus: num(metas[m.id]?.bonus || ""),
      updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      const { error: e2 } = await supabase.from("fechamentos_metas" as any).upsert(rows, { onConflict: "mes,user_id" });
      if (e2) { setSaving(false); toast.error("Erro ao salvar metas: " + e2.message); return; }
    }
    setSaving(false);
    toast.success("Regras do mês salvas ⚙️");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[88dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-primary" /> Regras de {mesExtenso(mes)}</DialogTitle>
          <DialogDescription>Define o valor base, os multiplicadores, o bônus e as metas do mês. Vale só para {mesExtenso(mes)}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <CampoNum label="Valor base (R$/ação)" value={valorBase} onChange={setValorBase} />
            <CampoNum label="Meta geral (ações)" value={metaGeral} onChange={setMetaGeral} />
            <CampoNum label="Bônus geral (R$)" value={bonus} onChange={setBonus} />
          </div>

          {/* Faixa especial — liga/desliga por mês */}
          <div className={`rounded-lg border p-3 ${especialAtivo ? "border-amber-400/40 bg-amber-400/5" : "border-border"}`}>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <Checkbox checked={especialAtivo} onCheckedChange={() => setEspecialAtivo((v) => !v)} />
              <Flame className={`h-4 w-4 ${especialAtivo ? "text-amber-400" : "text-muted-foreground"}`} />
              Ativar faixa especial neste mês
            </label>
            {especialAtivo && (
              <>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <CampoNum label="Base vale até (ações)" value={espLimite} onChange={setEspLimite} placeholder="ex: 20" />
                  <CampoNum label="Valor especial (R$/ação)" value={valorEsp} onChange={setValorEsp} placeholder="ex: 6" />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Cada ação vale <strong>{brl(num(valorBase))}</strong> até <strong>{int(espLimite) || 0}</strong> ações. Da{" "}
                  <strong>{(int(espLimite) || 0) + 1}ª</strong> em diante, cada ação passa a valer <strong>{brl(num(valorEsp))}</strong>.
                </p>
              </>
            )}
          </div>

          <div>
            <Label className="flex items-center gap-1.5 mb-2"><Target className="h-4 w-4" /> Metas e bônus por pessoa</Label>
            <div className="rounded-lg border border-border divide-y divide-border/60">
              {equipe.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3">Nenhum membro na equipe.</p>
              ) : equipe.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="text-sm font-medium flex-1 truncate">{m.nome || m.email}</span>
                  <div className="w-24">
                    <Input
                      value={metas[m.id]?.meta || ""}
                      onChange={(e) => setMetas((p) => ({ ...p, [m.id]: { ...p[m.id], meta: e.target.value.replace(/[^\d]/g, "") } }))}
                      placeholder="meta"
                      inputMode="numeric"
                      className="h-8 text-sm tabular-nums"
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      value={metas[m.id]?.bonus || ""}
                      onChange={(e) => setMetas((p) => ({ ...p, [m.id]: { ...p[m.id], bonus: e.target.value.replace(/[^\d.,]/g, "") } }))}
                      placeholder="bônus R$"
                      inputMode="decimal"
                      className="h-8 text-sm tabular-nums"
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">Coluna 1 = meta de ações · Coluna 2 = bônus individual (R$) somado à comissão.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar regras"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampoNum({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label className="text-[11px]">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))}
        placeholder={placeholder || "0"}
        inputMode="decimal"
        className="tabular-nums"
      />
    </div>
  );
}
