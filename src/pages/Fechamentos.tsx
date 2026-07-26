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
  ChevronLeft, ChevronRight, Flame, Zap, Target, Users, Sparkles, Settings2, Coins, Check,
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
 * quando os PRÓPRIOS descontos do mês ultrapassam o limite (e a faixa está
 * ativa). Ex.: base R$5/desconto até 20; do 21º em diante vale R$6.
 */
function especialAtivoPara(acoes: number, r: Regra) {
  if (!r.especial_ativo || r.valor_especial <= 0) return false;
  const lim = r.especial_limite ?? 0;
  return acoes > lim;
}

// Meta + bônus + faixa especial PRÓPRIA de uma pessoa no mês.
interface MetaUser {
  meta: number;
  bonus: number;
  especialAtivo: boolean;
  valorEspecial: number;
  especialLimite: number | null;
}
/**
 * Regra vigente pra uma pessoa: se ela tem faixa especial PRÓPRIA ativa,
 * sobrepõe a faixa especial geral do mês; senão, usa a geral. O valor base
 * é sempre o do mês (não é individualizado). Retorna também se a faixa em
 * vigor é individual (pra sinalizar na UI).
 */
function regraDoFoco(regraMes: Regra, mu?: MetaUser): { regra: Regra; individual: boolean } {
  if (mu && mu.especialAtivo && mu.valorEspecial > 0) {
    return {
      regra: { ...regraMes, especial_ativo: true, valor_especial: mu.valorEspecial, especial_limite: mu.especialLimite ?? 0 },
      individual: true,
    };
  }
  return { regra: regraMes, individual: false };
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

/* Anel circular de progresso da meta — % no centro. Segue o tema (--primary);
   fica esmeralda quando a meta é batida. Inspirado no anel do dashboard. */
function AnelMeta({ pct, bateu, size = 150, stroke = 13 }: { pct: number; bateu: boolean; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const alvo = Math.min(100, Math.max(0, pct));
  const gid = bateu ? "anelOk" : "anelPrim";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <defs>
          <linearGradient id="anelPrim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary) / 0.55)" />
            <stop offset="100%" stopColor="hsl(var(--primary))" />
          </linearGradient>
          <linearGradient id="anelOk" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(152 55% 55%)" />
            <stop offset="100%" stopColor="hsl(152 60% 42%)" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted-foreground) / 0.13)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (alvo / 100) * circ }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 7px ${bateu ? "hsl(152 60% 45% / 0.55)" : "hsl(var(--primary) / 0.5)"})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
        <CountUp value={alvo} format={(n) => `${Math.round(n)}%`} className={`text-4xl font-black tabular-nums leading-none ${bateu ? "text-emerald-400" : "text-primary"}`} />
        <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-1">{bateu ? "batida" : "da meta"}</span>
      </div>
    </div>
  );
}

/* Barra de progresso com marcos numéricos embaixo (0 · ¼ · ½ · ¾ · total),
   igual à régua do dashboard de referência. */
function BarraMarcos({ value, max, bateu }: { value: number; max: number; bateu: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const marcos = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  return (
    <div>
      <div className="relative h-2.5 rounded-full bg-black/25 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${bateu ? "bg-gradient-to-r from-emerald-400 to-emerald-500" : "bg-gradient-to-r from-primary/70 to-primary"}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
        {max > 0 && value >= max && <div className="fech-shimmer absolute inset-0 pointer-events-none" />}
      </div>
      <div className="flex justify-between mt-1 text-[9px] tabular-nums text-muted-foreground/55">
        {marcos.map((n, i) => <span key={i}>{intBR(n)}</span>)}
      </div>
    </div>
  );
}

/* Mini-métrica (rótulo + número) usada dentro do painel de meta. */
function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-black/15 px-3 py-2.5">
      <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/80">{label}</p>
      <p className="text-lg font-bold tabular-nums leading-tight mt-0.5">
        {value} {sub && <span className="text-[10px] font-normal text-muted-foreground">{sub}</span>}
      </p>
    </div>
  );
}

/* ══════════════════════════ página ══════════════════════════ */
export default function Fechamentos() {
  useEffect(() => { document.title = `Fechamentos · ${appConfig.name}`; }, []);
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
    const m: Record<string, MetaUser> = {};
    const rows = Array.isArray(metasRes.data) ? metasRes.data : [];
    for (const r of rows) if (r.mes === mesAtivo) m[r.user_id] = {
      meta: Number(r.meta) || 0,
      bonus: Number(r.bonus) || 0,
      especialAtivo: !!r.especial_ativo,
      valorEspecial: Number(r.valor_especial) || 0,
      especialLimite: r.especial_limite == null ? null : Number(r.especial_limite),
    };
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

  // Quem pode ver o quadro geral: admin OU usuário com o flag liberado
  // (ex.: Dr. Matheus e Diego) — sem virar admin nem editar regras.
  const podeVerGeral = isAdmin || !!profile?.ver_fechamentos_geral;

  // Foco: quem pode ver geral escolhe o scope (ou geral); os demais veem a si.
  const focoId = podeVerGeral ? (scope === "geral" ? null : scope) : user?.id || null;
  const focoNome = focoId
    ? equipe.find((m) => m.id === focoId)?.nome || (focoId === user?.id ? profile?.nome : null)
    : null;

  const focoAcoes = focoId ? acoesDe[focoId] || 0 : 0;
  const focoMeta = focoId ? metasMap[focoId]?.meta || 0 : 0;
  const focoBonus = focoId ? metasMap[focoId]?.bonus || 0 : 0;
  // Regra vigente pro foco: faixa especial individual sobrepõe a geral do mês.
  const { regra: focoRegra } = regraDoFoco(regra, focoId ? metasMap[focoId] : undefined);
  const focoEspecialAtivo = especialAtivoPara(focoAcoes, focoRegra);
  const focoValorAcao = valorAcaoVigente(focoAcoes, focoRegra);
  const focoComissao = comissaoDe(focoAcoes, focoRegra, focoBonus);

  // Nº de pessoas da equipe com ao menos 1 ação no mês
  const pessoasContribuindo = useMemo(
    () => equipe.filter((m) => (acoesDe[m.id] || 0) > 0).length,
    [equipe, acoesDe],
  );

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
            <Trophy className="h-5 w-5 text-primary" /> Fechamentos &amp; Comissões
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

      {/* Seletor de quadro (quem pode ver o geral) */}
      {podeVerGeral && equipe.length > 0 && (
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
          {focoId ? (
            /* Aba individual: painel de meta com anel circular + os 3 cards
               (dinâmica, valor por desconto e comissão). */
            <>
              <PainelMeta
                titulo={`Meta individual${focoNome ? ` · ${primeiroNome(focoNome)}` : ""}`}
                icon={Target}
                acoes={focoAcoes}
                meta={focoMeta}
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <CardDinamica regra={focoRegra} acoes={focoAcoes} />
                <CardValorAcao regra={focoRegra} acoes={focoAcoes} vigente={focoValorAcao} especialAtivo={focoEspecialAtivo} />
                <CardComissao acoes={focoAcoes} valorAcao={focoValorAcao} bonus={focoBonus} total={focoComissao} />
              </div>
            </>
          ) : (
            /* Aba geral (admin ou liberado): painel de meta do time + ranking. */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <PainelMeta
                  titulo={`Quadro geral · ${mesExtenso(mesAtivo)}`}
                  icon={Users}
                  acoes={teamAcoes}
                  meta={regra.meta_geral}
                  nota={`${pessoasContribuindo} ${pessoasContribuindo === 1 ? "pessoa contribuindo" : "pessoas contribuindo"} este mês`}
                />
              </div>
              <RankingMes equipe={equipe} acoesDe={acoesDe} regra={regra} metasMap={metasMap} />
            </div>
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
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5" title={equipe.find((m) => m.id === f.user_id)?.nome || f.responsavel || "Voluntário"}>
                        <User className="h-3.5 w-3.5" />
                      </div>
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
                        {f.rubricas?.length || 0} {(f.rubricas?.length || 0) === 1 ? "desconto ajuizável" : "descontos ajuizáveis"}
                      </div>
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
                  <p className="text-xs text-muted-foreground/60 italic p-3">Sem descontos ajuizáveis neste mês.</p>
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

/* Painel GRANDE de meta (geral ou individual) — anel circular à esquerda,
   contagem + régua de marcos + mini-stats à direita. Estado esmeralda quando
   a meta é batida. É o centro do dashboard, inspirado no anel de referência. */
function PainelMeta({ titulo, icon: Icon, acoes, meta, nota }: {
  titulo: string; icon: any; acoes: number; meta: number; nota?: string;
}) {
  const bateu = meta > 0 && acoes >= meta;
  const pct = meta > 0 ? Math.min(100, Math.round((acoes / meta) * 100)) : 0;
  const faltam = Math.max(0, meta - acoes);
  return (
    <div className={`relative h-full overflow-hidden rounded-2xl border p-5 sm:p-6 ${bateu ? "border-emerald-500/40 bg-emerald-500/[0.07]" : "border-primary/25 bg-gradient-to-br from-primary/[0.10] via-primary/[0.04] to-transparent"}`}>
      <div className="flex items-center justify-between gap-2 mb-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-primary/80 font-semibold flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" /> {titulo}
        </p>
        {bateu && (
          <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] font-bold uppercase tracking-wide">
            <Check className="h-4 w-4" strokeWidth={3} /> Meta batida
          </span>
        )}
      </div>

      <div className="flex items-center gap-5 sm:gap-7 flex-wrap sm:flex-nowrap">
        <AnelMeta pct={pct} bateu={bateu} />

        <div className="flex-1 min-w-[220px]">
          <div className="flex items-end gap-2">
            <CountUp value={acoes} className="text-5xl font-black tabular-nums leading-none" />
            <span className="text-base text-muted-foreground mb-1">
              / {meta > 0 ? intBR(meta) : "—"} descontos
            </span>
          </div>
          <p className={`text-xs mt-1.5 ${bateu ? "text-emerald-400/90" : "text-muted-foreground"}`}>
            {meta > 0
              ? (bateu ? "Parabéns, meta do mês batida! 🎉" : <>Faltam <strong className="text-foreground">{intBR(faltam)}</strong> pra bater a meta</>)
              : "Meta do mês ainda não definida"}
          </p>

          {meta > 0 && <div className="mt-4"><BarraMarcos value={acoes} max={meta} bateu={bateu} /></div>}

          <div className="grid grid-cols-2 gap-2 mt-4">
            <MiniStat label="Meta do mês" value={meta > 0 ? intBR(meta) : "—"} sub="descontos" />
            <MiniStat label="Desempenho" value={intBR(acoes)} sub="descontos" />
          </div>

          {nota && <p className="text-[11px] text-muted-foreground mt-3">{nota}</p>}
        </div>
      </div>
    </div>
  );
}

/* Ranking do mês (aba geral) — placar do time por descontos, com pódio pros
   três primeiros e barrinha proporcional ao líder. */
function RankingMes({ equipe, acoesDe, regra, metasMap }: {
  equipe: Membro[]; acoesDe: Record<string, number>; regra: Regra; metasMap: Record<string, MetaUser>;
}) {
  const linhas = equipe
    .map((m) => {
      const acoes = acoesDe[m.id] || 0;
      const { regra: r } = regraDoFoco(regra, metasMap[m.id]);
      const comissao = comissaoDe(acoes, r, metasMap[m.id]?.bonus || 0);
      return { id: m.id, nome: m.nome, acoes, comissao };
    })
    .sort((a, b) => b.acoes - a.acoes || b.comissao - a.comissao);
  const topo = linhas[0]?.acoes || 0;
  const medalha = ["text-amber-400", "text-slate-300", "text-amber-700"];

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4 flex flex-col">
      <p className="text-[11px] uppercase tracking-[0.2em] text-primary/80 font-semibold flex items-center gap-1.5 mb-3">
        <Trophy className="h-3.5 w-3.5" /> Ranking do mês
      </p>
      {linhas.length === 0 ? (
        <p className="text-xs text-muted-foreground/70 italic">Sem equipe cadastrada.</p>
      ) : (
        <div className="space-y-2.5">
          {linhas.map((l, i) => {
            const pct = topo > 0 ? Math.max(4, Math.round((l.acoes / topo) * 100)) : 0;
            return (
              <div key={l.id} className="flex items-center gap-2.5">
                <span className={`w-5 text-center text-sm font-black tabular-nums ${i < 3 ? medalha[i] : "text-muted-foreground/60"}`}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium truncate">{primeiroNome(l.nome)}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
                      {intBR(l.acoes)} · <span className="text-foreground/80">{brl(l.comissao)}</span>
                    </span>
                  </div>
                  <div className="relative h-1.5 rounded-full bg-black/25 overflow-hidden mt-1">
                    <motion.div
                      className={`h-full rounded-full ${i === 0 ? "bg-gradient-to-r from-primary/70 to-primary" : "bg-primary/40"}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, ease: "easeOut", delay: i * 0.05 }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
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
        {especialAtivo ? <Flame className="h-3.5 w-3.5 text-amber-400" /> : <Zap className="h-3.5 w-3.5" />} Valor por desconto
      </p>
      <div className="mt-1 flex items-center gap-2">
        <span className={`text-4xl font-black tabular-nums leading-none ${especialAtivo ? "text-amber-400" : ""}`}>{brl(vigente)}</span>
        <span className="text-sm text-muted-foreground mb-0.5">/ desconto</span>
        {especialAtivo && <Sparkles className="h-5 w-5 text-amber-400" />}
      </div>
      <div className="mt-3 space-y-1 text-[11px]">
        <div className={`flex items-center justify-between ${!especialAtivo ? "text-foreground font-medium" : "text-muted-foreground"}`}>
          <span>Base{temEspecial ? ` (até ${intBR(lim)} descontos)` : ""}</span><span className="tabular-nums">{brl(regra.valor_base)}</span>
        </div>
        {temEspecial && (
          <div className={`flex items-center justify-between ${especialAtivo ? "text-amber-400 font-semibold" : "text-muted-foreground"}`}>
            <span>Especial (acima de {intBR(lim)})</span><span className="tabular-nums">{brl(regra.valor_especial)}</span>
          </div>
        )}
        {temEspecial && !especialAtivo && (
          <p className="text-[11px] text-amber-400/90 pt-1">Faltam <strong>{intBR(faltam)}</strong> descontos pra cada desconto valer {brl(regra.valor_especial)}</p>
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
        {intBR(acoes)} descontos × {brl(valorAcao)}/desconto
        {bonus > 0 && <> + {brl(bonus)} bônus</>}
      </p>
    </div>
  );
}

/* Banner gamificado: expõe a DINÂMICA do mês pro funcionário como uma frase
   corrida (base + faixa especial), com barra de progresso viva pra motivar. */
function BarraViva({ value, max, desbloqueado }: { value: number; max: number; desbloqueado: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : value > 0 ? 100 : 0;
  // Cor segue o tema (--primary). No estado desbloqueado, âmbar fixo — sinal
  // "quente" da faixa especial, igual aos outros cards. O glow pulsa mantendo
  // a cor constante numa var (--glow), então o framer interpola só os px.
  const fill = desbloqueado
    ? "linear-gradient(90deg, hsl(45 95% 58%), hsl(38 92% 50%), hsl(45 95% 58%))"
    : "linear-gradient(90deg, hsl(var(--primary) / 0.6), hsl(var(--primary)), hsl(var(--primary) / 0.6))";
  const glowColor = desbloqueado ? "hsl(45 95% 58% / 0.9)" : "hsl(var(--primary) / 0.85)";
  return (
    <div className="relative h-3.5 rounded-full bg-black/30 overflow-hidden">
      <motion.div
        className="fech-shimmer relative h-full rounded-full overflow-hidden"
        style={{ background: fill, ["--glow" as any]: glowColor }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%`, boxShadow: ["0 0 6px 0 var(--glow)", "0 0 22px 3px var(--glow)", "0 0 6px 0 var(--glow)"] }}
        transition={{ width: { duration: 1, ease: "easeOut" }, boxShadow: { duration: 1.5, repeat: Infinity, ease: "easeInOut" } }}
      />
    </div>
  );
}

/* Dinâmica do mês, versão compacta — cabe na linha dos 3 cards (individual).
   Mantém a frase corrida da regra e a barra viva gamificada. */
function CardDinamica({ regra, acoes }: { regra: Regra; acoes: number }) {
  const temEspecial = regra.especial_ativo && regra.valor_especial > 0;
  const lim = regra.especial_limite ?? 0;
  const alvo = lim + 1;
  const desbloqueado = especialAtivoPara(acoes, regra);
  const faltam = temEspecial && !desbloqueado ? Math.max(0, alvo - acoes) : 0;

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 ${desbloqueado ? "border-amber-400/50 bg-amber-400/10 fech-glow" : "border-border bg-card/50"}`}>
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold flex items-center gap-1.5">
        {desbloqueado ? <Flame className="h-3.5 w-3.5 text-amber-400" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />} Dinâmica do mês
      </p>

      <p className="mt-2 text-[13px] leading-snug">
        {temEspecial ? (
          <>
            Cada desconto vale <strong className="text-foreground">{brl(regra.valor_base)}</strong>; do{" "}
            <strong className={desbloqueado ? "text-amber-300" : "text-foreground"}>{intBR(alvo)}º</strong> em diante,{" "}
            <strong className={desbloqueado ? "text-amber-300" : "text-foreground"}>{brl(regra.valor_especial)}</strong>.
          </>
        ) : (
          <>Cada desconto vale <strong className="text-foreground">{brl(regra.valor_base)}</strong> do início ao fim.</>
        )}
      </p>

      {temEspecial && (
        <div className="mt-3 space-y-1.5">
          <BarraViva value={acoes} max={alvo} desbloqueado={desbloqueado} />
          <p className={`text-[11px] font-medium ${desbloqueado ? "text-amber-300" : "text-muted-foreground"}`}>
            {desbloqueado
              ? "Faixa especial ativa"
              : <>Faltam <strong className="text-foreground">{intBR(faltam)}</strong> pra {brl(regra.valor_especial)}/desconto</>}
          </p>
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
    toast.success("Fechamento registrado");
    reset();
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setTimeout(reset, 200); } }}>
      <DialogContent className="sm:max-w-2xl max-h-[88dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-400" /> Novo fechamento</DialogTitle>
          <DialogDescription>Marque os descontos ajuizáveis fechados. Cada um conta como 1 no placar.</DialogDescription>
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
              <Label>Descontos ajuizáveis fechados</Label>
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
            {saving ? "Salvando…" : `Salvar (${rubricas.size} ${rubricas.size === 1 ? "desconto" : "descontos"})`}
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
  metasMap: Record<string, MetaUser>;
  onSaved: () => void;
}) {
  const [valorBase, setValorBase] = useState("");
  const [especialAtivo, setEspecialAtivo] = useState(false);
  const [valorEsp, setValorEsp] = useState("");
  const [espLimite, setEspLimite] = useState("");
  const [metaGeral, setMetaGeral] = useState("");
  const [bonus, setBonus] = useState("");
  type MetaForm = { meta: string; bonus: string; espAtivo: boolean; espLimite: string; valorEsp: string };
  const [metas, setMetas] = useState<Record<string, MetaForm>>({});
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
    const m: Record<string, MetaForm> = {};
    for (const mem of equipe) {
      const cur = metasMap[mem.id];
      m[mem.id] = {
        meta: cur?.meta ? String(cur.meta) : "",
        bonus: cur?.bonus ? String(cur.bonus) : "",
        espAtivo: !!cur?.especialAtivo,
        espLimite: cur?.especialLimite == null ? "" : String(cur.especialLimite),
        valorEsp: cur?.valorEspecial ? String(cur.valorEspecial) : "",
      };
    }
    setMetas(m);
  }, [open, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchMeta = (id: string, patch: Partial<MetaForm>) =>
    setMetas((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

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

    const rows = equipe.map((m) => {
      const f = metas[m.id];
      const espOn = !!f?.espAtivo;
      return {
        mes,
        user_id: m.id,
        meta: int(f?.meta || ""),
        bonus: num(f?.bonus || ""),
        especial_ativo: espOn,
        valor_especial: espOn ? num(f?.valorEsp || "") : 0,
        especial_limite: espOn ? (f?.espLimite?.trim() ? int(f.espLimite) : null) : null,
        updated_at: new Date().toISOString(),
      };
    });
    if (rows.length) {
      const { error: e2 } = await supabase.from("fechamentos_metas" as any).upsert(rows, { onConflict: "mes,user_id" });
      if (e2) { setSaving(false); toast.error("Erro ao salvar metas: " + e2.message); return; }
    }
    setSaving(false);
    toast.success("Regras do mês salvas");
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
            <CampoNum label="Valor base (R$/desconto)" value={valorBase} onChange={setValorBase} />
            <CampoNum label="Meta geral (descontos)" value={metaGeral} onChange={setMetaGeral} />
            <CampoNum label="Bônus geral (R$)" value={bonus} onChange={setBonus} />
          </div>

          {/* Faixa especial GERAL — vale pra todo mundo que não tiver a própria */}
          <div className={`rounded-lg border p-3 ${especialAtivo ? "border-amber-400/40 bg-amber-400/5" : "border-border"}`}>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <Checkbox checked={especialAtivo} onCheckedChange={() => setEspecialAtivo((v) => !v)} />
              <Flame className={`h-4 w-4 ${especialAtivo ? "text-amber-400" : "text-muted-foreground"}`} />
              Faixa especial GERAL neste mês
              <span className="text-[10px] font-normal text-muted-foreground">· vale pra todos (quem tiver a própria sobrepõe)</span>
            </label>
            {especialAtivo && (
              <>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <CampoNum label="Base vale até (descontos)" value={espLimite} onChange={setEspLimite} placeholder="ex: 20" />
                  <CampoNum label="Valor especial (R$/desconto)" value={valorEsp} onChange={setValorEsp} placeholder="ex: 6" />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Cada desconto vale <strong>{brl(num(valorBase))}</strong> até <strong>{int(espLimite) || 0}</strong> descontos. Do{" "}
                  <strong>{(int(espLimite) || 0) + 1}º</strong> em diante, cada desconto passa a valer <strong>{brl(num(valorEsp))}</strong>.
                </p>
              </>
            )}
          </div>

          <div>
            <Label className="flex items-center gap-1.5 mb-2"><Target className="h-4 w-4" /> Metas, bônus e faixa especial por pessoa</Label>
            <div className="space-y-2">
              {equipe.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 rounded-lg border border-border">Nenhum membro na equipe.</p>
              ) : equipe.map((m) => {
                const f = metas[m.id];
                const espOn = !!f?.espAtivo;
                return (
                  <div key={m.id} className={`rounded-lg border p-3 ${espOn ? "border-amber-400/40 bg-amber-400/5" : "border-border"}`}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium flex-1 truncate">{m.nome || m.email}</span>
                      <div className="w-24">
                        <Input
                          value={f?.meta || ""}
                          onChange={(e) => patchMeta(m.id, { meta: e.target.value.replace(/[^\d]/g, "") })}
                          placeholder="meta"
                          inputMode="numeric"
                          className="h-8 text-sm tabular-nums"
                        />
                      </div>
                      <div className="w-28">
                        <Input
                          value={f?.bonus || ""}
                          onChange={(e) => patchMeta(m.id, { bonus: e.target.value.replace(/[^\d.,]/g, "") })}
                          placeholder="bônus R$"
                          inputMode="decimal"
                          className="h-8 text-sm tabular-nums"
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer mt-2.5">
                      <Checkbox checked={espOn} onCheckedChange={() => patchMeta(m.id, { espAtivo: !espOn })} />
                      <Flame className={`h-3.5 w-3.5 ${espOn ? "text-amber-400" : "text-muted-foreground"}`} />
                      Faixa especial própria
                      <span className="text-[10px] font-normal text-muted-foreground">· sobrepõe a geral só pra {primeiroNome(m.nome)}</span>
                    </label>
                    {espOn && (
                      <>
                        <div className="grid grid-cols-2 gap-3 mt-2.5">
                          <CampoNum label="Base vale até (descontos)" value={f?.espLimite || ""} onChange={(v) => patchMeta(m.id, { espLimite: v })} placeholder="ex: 20" />
                          <CampoNum label="Valor especial (R$/desconto)" value={f?.valorEsp || ""} onChange={(v) => patchMeta(m.id, { valorEsp: v })} placeholder="ex: 6" />
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-2">
                          Pra {primeiroNome(m.nome)}: cada desconto vale <strong>{brl(num(valorBase))}</strong> até <strong>{int(f?.espLimite || "") || 0}</strong>. Do{" "}
                          <strong>{(int(f?.espLimite || "") || 0) + 1}º</strong> em diante, vale <strong>{brl(num(f?.valorEsp || ""))}</strong>.
                        </p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">Campos: meta de descontos · bônus individual (R$) · faixa especial própria (opcional, sobrepõe a geral).</p>
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
