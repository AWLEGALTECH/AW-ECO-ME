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
import { SpotlightCard } from "@/components/SpotlightCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Trophy, Plus, User, CalendarDays, AlertTriangle, FolderUp, Trash2, Hash, Loader2,
  ChevronLeft, ChevronRight, Flame, Zap, Target, Users, Sparkles, Settings2, Coins, Check,
  ClipboardList, ListChecks, PiggyBank, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { RUBRICAS_FECHAMENTO, RUBRICA_LABEL } from "@/lib/rubricasFechamento";
import { BuscaRubrica, filtraPorBusca } from "@/components/BuscaRubrica";
import { hojeISO, mesDeHoje } from "@/lib/hoje";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
  permitir_excedentes: boolean;     // geral do mês: false retém o que passa da meta
}
interface Membro { id: string; nome: string | null; email: string | null }

/* ─────────────────────────── helpers ─────────────────────────── */
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const intBR = (n: number) => Math.round(n).toLocaleString("pt-BR");

// UTC adiantava o mês das 20h à meia-noite: um fechamento de 31/08 abria
// setembro. mesDeHoje usa o calendário de quem está olhando.
const hojeMes = () => mesDeHoje();
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
    permitir_excedentes: r.permitir_excedentes == null ? true : !!r.permitir_excedentes,
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
  permitirExcedentes: boolean | null;   // null = segue o geral do mês
  // Valor decidido pra esta pessoa neste mês, sem degrau, com o porquê junto.
  // Sobrepõe a faixa especial própria e a geral — é decisão manual.
  excepcionalAtivo: boolean;
  excepcionalValor: number;
  excepcionalObs: string | null;
}
/**
 * Regra vigente pra uma pessoa: se ela tem faixa especial PRÓPRIA ativa,
 * sobrepõe a faixa especial geral do mês; senão, usa a geral. O valor base
 * é sempre o do mês (não é individualizado). Retorna também se a faixa em
 * vigor é individual (pra sinalizar na UI).
 */
function regraDoFoco(regraMes: Regra, mu?: MetaUser): { regra: Regra; individual: boolean } {
  // O EXCEPCIONAL VEM PRIMEIRO. Ele não é degrau: reprecifica a rubrica do
  // início ao fim. Se perdesse pra faixa especial, quem produzisse muito
  // receberia pela regra que a direção tinha decidido substituir — e a decisão
  // manual viraria letra morta justamente onde ela mais aparece.
  if (mu && mu.excepcionalAtivo && mu.excepcionalValor > 0) {
    return {
      regra: { ...regraMes, valor_base: mu.excepcionalValor, especial_ativo: false, valor_especial: 0, especial_limite: null },
      individual: true,
    };
  }
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

/* ─────────────────────── excedentes (bolsa) ───────────────────────
   Quando "permitir excedentes" está OFF pra pessoa, o que passa da meta no mês
   NÃO paga: vira bolsa (só contagem, por cliente). Na virada, entra no mês
   seguinte e paga pela regra do novo mês. Tudo derivado dos fechamentos. */
interface ExcedenteCliente { cliente_nome: string; cliente_id: string | null; rubricas: string[] }
interface Bolsa { total: number; porCliente: ExcedenteCliente[] }
const BOLSA_VAZIA: Bolsa = { total: 0, porCliente: [] };

/** Permitir excedentes vigente pra pessoa: override próprio > geral do mês. */
function permiteExcedentes(regraMes: Regra, mu?: MetaUser): boolean {
  if (mu && (mu.permitirExcedentes === true || mu.permitirExcedentes === false)) return mu.permitirExcedentes;
  return regraMes.permitir_excedentes;
}

/** Fechamentos de uma pessoa num mês, em ordem cronológica estável. */
function fechsPessoaMes(fechs: Fechamento[], userId: string, mes: string) {
  return fechs
    .filter((f) => f.user_id === userId && (f.data || "").slice(0, 7) === mes)
    .sort((a, b) => (a.data || "").localeCompare(b.data || "") || a.id.localeCompare(b.id));
}
const contaRubricas = (fs: Fechamento[]) => fs.reduce((a, f) => a + (f.rubricas?.length || 0), 0);

/** Bolsa gerada: achata (cliente, rubrica) em ordem e pega o que passa da meta. */
function calcBolsa(fs: Fechamento[], meta: number): Bolsa {
  if (meta <= 0) return BOLSA_VAZIA;
  const flat: { cliente_nome: string; cliente_id: string | null; rubrica: string }[] = [];
  for (const f of fs) for (const r of f.rubricas || []) flat.push({ cliente_nome: f.cliente_nome, cliente_id: f.cliente_id, rubrica: r });
  if (flat.length <= meta) return BOLSA_VAZIA;
  const excedentes = flat.slice(meta);
  const map = new Map<string, ExcedenteCliente>();
  for (const e of excedentes) {
    const key = e.cliente_id || e.cliente_nome;
    const cur = map.get(key) || { cliente_nome: e.cliente_nome, cliente_id: e.cliente_id, rubricas: [] };
    cur.rubricas.push(e.rubrica);
    map.set(key, cur);
  }
  return { total: excedentes.length, porCliente: [...map.values()] };
}

/** Quantas rubricas de CADA fechamento passam da meta (vão pro próximo mês). */
function bolsaPorFechamento(fs: Fechamento[], meta: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (meta <= 0) return out;
  let cum = 0;
  for (const f of fs) {
    const len = f.rubricas?.length || 0;
    const antes = cum;
    cum += len;
    const defer = cum > meta ? cum - Math.max(meta, antes) : 0;
    if (defer > 0) out[f.id] = defer;
  }
  return out;
}

interface ExcedInfo {
  producao: number;        // rubricas próprias no mês
  meta: number;
  retendo: boolean;        // retém o que passou da meta neste mês
  bolsa: Bolsa;            // gerada neste mês → vai pro próximo
  carregado: Bolsa;        // recebida do mês anterior → paga neste mês
  pagasProprias: number;   // rubricas próprias que pagam neste mês (capadas na meta se retém)
  rubricasPagas: number;   // pagasProprias + carregado.total (base da comissão)
}
/** Tudo que a pessoa retém/recebe num mês, derivado dos fechamentos + regras. */
function excedInfoPessoa(
  fechs: Fechamento[], userId: string, mes: string,
  regraDe: (m: string) => Regra, metaDe: (m: string, u: string) => MetaUser | undefined,
): ExcedInfo {
  const fs = fechsPessoaMes(fechs, userId, mes);
  const producao = contaRubricas(fs);
  const rMes = regraDe(mes);
  const muMes = metaDe(mes, userId);
  const meta = muMes?.meta || 0;
  const permite = permiteExcedentes(rMes, muMes);
  const retendo = !permite && meta > 0 && producao > meta;
  const bolsa = retendo ? calcBolsa(fs, meta) : BOLSA_VAZIA;

  // Carregado do mês anterior: só a produção PRÓPRIA do mês anterior que passou
  // da meta (excedente carregado não gera nova bolsa — paga e encerra).
  const mesAnt = addMes(mes, -1);
  const fsAnt = fechsPessoaMes(fechs, userId, mesAnt);
  const muAnt = metaDe(mesAnt, userId);
  const metaAnt = muAnt?.meta || 0;
  const permiteAnt = permiteExcedentes(regraDe(mesAnt), muAnt);
  const reteveAnt = !permiteAnt && metaAnt > 0 && contaRubricas(fsAnt) > metaAnt;
  const carregado = reteveAnt ? calcBolsa(fsAnt, metaAnt) : BOLSA_VAZIA;

  const pagasProprias = retendo ? meta : producao;
  return { producao, meta, retendo, bolsa, carregado, pagasProprias, rubricasPagas: pagasProprias + carregado.total };
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
          style={{ filter: `drop-shadow(0 0 ${bateu ? "10px hsl(152 66% 48% / 0.8)" : "7px hsl(var(--primary) / 0.5)"})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
        <CountUp value={alvo} format={(n) => `${Math.round(n)}%`} className={`text-4xl font-semibold font-display tabular-nums leading-none ${bateu ? "text-emerald-400" : "text-primary"}`} />
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
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold font-display tabular-nums leading-tight mt-0.5">
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

  // Acessores por mês qualquer (pra calcular o carregado do mês anterior).
  const toMetaUser = (r: any): MetaUser => ({
    meta: Number(r.meta) || 0,
    bonus: Number(r.bonus) || 0,
    especialAtivo: !!r.especial_ativo,
    valorEspecial: Number(r.valor_especial) || 0,
    especialLimite: r.especial_limite == null ? null : Number(r.especial_limite),
    excepcionalAtivo: !!r.excepcional_ativo,
    excepcionalValor: Number(r.excepcional_valor) || 0,
    excepcionalObs: r.excepcional_obs ?? null,
    permitirExcedentes: r.permitir_excedentes == null ? null : !!r.permitir_excedentes,
  });
  const regraDe = useMemo(() => {
    const rows = Array.isArray(regrasRes.data) ? regrasRes.data : [];
    return (mes: string) => toRegra(mes, rows.find((r) => r.mes === mes));
  }, [regrasRes.data]);
  const metaDe = useMemo(() => {
    const rows = Array.isArray(metasRes.data) ? metasRes.data : [];
    return (mes: string, userId: string) => {
      const r = rows.find((x) => x.mes === mes && x.user_id === userId);
      return r ? toMetaUser(r) : undefined;
    };
  }, [metasRes.data]);

  const regra = useMemo(() => regraDe(mesAtivo), [regraDe, mesAtivo]);
  const metasMap = useMemo(() => {
    const m: Record<string, MetaUser> = {};
    const rows = Array.isArray(metasRes.data) ? metasRes.data : [];
    for (const r of rows) if (r.mes === mesAtivo) m[r.user_id] = toMetaUser(r);
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
  // O registro individual de quem está em foco: é dele que sai o excepcional.
  const focoRegistro = focoId ? metasMap[focoId] : undefined;
  // Regra vigente pro foco: faixa especial individual sobrepõe a geral do mês.
  const { regra: focoRegra } = regraDoFoco(regra, focoId ? metasMap[focoId] : undefined);
  // Excedentes: o que a pessoa retém (bolsa) e o que recebe do mês anterior.
  const focoExced = useMemo(
    () => (focoId ? excedInfoPessoa(fechamentos, focoId, mesAtivo, regraDe, metaDe) : null),
    [focoId, fechamentos, mesAtivo, regraDe, metaDe],
  );
  // Comissão paga = rubricas próprias (capadas na meta se retém) + carregadas.
  const focoPagas = focoExced ? focoExced.rubricasPagas : focoAcoes;
  const focoEspecialAtivo = especialAtivoPara(focoPagas, focoRegra);
  const focoValorAcao = valorAcaoVigente(focoPagas, focoRegra);
  const focoComissao = comissaoDe(focoPagas, focoRegra, focoBonus);

  // Linhas de excedente pro rodapé da lista (contexto: foco ou time inteiro).
  //  · recebido = excedente do mês anterior, paga aqui (conta como fechamento).
  //  · bolsa    = retido neste mês, sem valor, vai pro próximo mês.
  const excedList = useMemo(() => {
    const alvos = focoId ? [focoId] : equipe.map((mm) => mm.id);
    const recebido: (ExcedenteCliente & { userId: string; valor: number })[] = [];
    const bolsa: (ExcedenteCliente & { userId: string })[] = [];
    for (const uid of alvos) {
      const info = excedInfoPessoa(fechamentos, uid, mesAtivo, regraDe, metaDe);
      const { regra: rr } = regraDoFoco(regraDe(mesAtivo), metaDe(mesAtivo, uid));
      const rate = valorAcaoVigente(info.rubricasPagas, rr);
      for (const c of info.carregado.porCliente) recebido.push({ ...c, userId: uid, valor: c.rubricas.length * rate });
      for (const c of info.bolsa.porCliente) bolsa.push({ ...c, userId: uid });
    }
    return { recebido, bolsa };
  }, [focoId, equipe, fechamentos, mesAtivo, regraDe, metaDe]);
  const mesAnteriorExt = mesExtenso(addMes(mesAtivo, -1));
  const mesProximoExt = mesExtenso(addMes(mesAtivo, 1));

  // Rubricas que PAGAM/CONTAM por pessoa (própria capada na meta + carregadas)
  // — base da comissão E do placar de rubricas (o excedente do mês anterior
  // conta também como fechamento, não só comissão).
  const pagasDe = useMemo(() => {
    const map: Record<string, number> = {};
    for (const mm of equipe) map[mm.id] = excedInfoPessoa(fechamentos, mm.id, mesAtivo, regraDe, metaDe).rubricasPagas;
    return map;
  }, [equipe, fechamentos, mesAtivo, regraDe, metaDe]);
  const teamPagas = useMemo(() => Object.values(pagasDe).reduce((a, b) => a + b, 0), [pagasDe]);

  // Quais fechamentos deste mês têm rubricas que vão pro próximo (p/ o ícone).
  const bolsaFechMap = useMemo(() => {
    const alvos = focoId ? [focoId] : equipe.map((mm) => mm.id);
    const out: Record<string, number> = {};
    for (const uid of alvos) {
      const muMes = metaDe(mesAtivo, uid);
      const meta = muMes?.meta || 0;
      if (permiteExcedentes(regraDe(mesAtivo), muMes) || meta <= 0) continue;
      Object.assign(out, bolsaPorFechamento(fechsPessoaMes(fechamentos, uid, mesAtivo), meta));
    }
    return out;
  }, [focoId, equipe, fechamentos, mesAtivo, regraDe, metaDe]);
  const totalCarregado = useMemo(() => excedList.recebido.reduce((a, c) => a + c.rubricas.length, 0), [excedList]);
  const totalRetido = useMemo(() => excedList.bolsa.reduce((a, c) => a + c.rubricas.length, 0), [excedList]);
  const excedenteInfo = { retido: totalRetido, recebido: totalCarregado, mesAnterior: mesAnteriorExt, mesProximo: mesProximoExt };

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
    // Excedente recebido do mês anterior também conta nas rubricas do mês.
    for (const c of excedList.recebido) for (const r of c.rubricas) cont[r] = (cont[r] || 0) + 1;
    return Object.entries(cont).sort((a, b) => b[1] - a[1]);
  }, [listaMes, excedList]);

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
    <div className="space-y-6">
      {/* Header — padrão do dashboard principal (font-display) */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-3xl font-medium tracking-tight">Fechamentos &amp; Comissões</h2>
          <p className="text-sm text-muted-foreground mt-1">Placar do mês, metas e comissão por multiplicador.</p>
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
                acoes={focoPagas}
                meta={focoMeta}
                excedente={excedenteInfo}
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <CardDinamica regra={focoRegra} acoes={focoPagas}
                  excepcional={!!focoRegistro?.excepcionalAtivo && focoRegistro.excepcionalValor > 0} />
                <CardValorAcao
                  regra={focoRegra} acoes={focoPagas} vigente={focoValorAcao}
                  especialAtivo={focoEspecialAtivo}
                  excepcional={focoRegistro?.excepcionalAtivo && focoRegistro.excepcionalValor > 0
                    ? { valor: focoRegistro.excepcionalValor, obs: focoRegistro.excepcionalObs }
                    : null}
                />
                <CardComissao acoes={focoPagas} valorAcao={focoValorAcao} bonus={focoBonus} total={focoComissao} />
              </div>
            </>
          ) : (
            /* Aba geral (admin ou liberado): painel de meta do time + ranking. */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <PainelMeta
                  titulo={`Quadro geral · ${mesExtenso(mesAtivo)}`}
                  icon={Users}
                  acoes={teamPagas}
                  meta={regra.meta_geral}
                  excedente={excedenteInfo}
                  nota={`${pessoasContribuindo} ${pessoasContribuindo === 1 ? "pessoa contribuindo" : "pessoas contribuindo"} este mês`}
                />
              </div>
              <RankingMes equipe={equipe} acoesDe={acoesDe} pagasDe={pagasDe} regra={regra} metasMap={metasMap} />
            </div>
          )}

          {/* ── LISTA + RUBRICAS ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  {focoNome ? `Fechamentos de ${primeiroNome(focoNome)}` : "Todos os fechamentos"}
                  <span className="ml-auto text-xs font-normal text-muted-foreground">{listaMes.length + excedList.recebido.length} no mês</span>
                </CardTitle>
                {excedList.recebido.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1">
                    <ArrowDownRight className="h-3 w-3 text-amber-400" />
                    {excedList.recebido.length} {excedList.recebido.length === 1 ? "veio" : "vieram"} de excedente de {mesAnteriorExt} ({intBR(totalCarregado)} rubricas)
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {listaMes.length === 0 && excedList.recebido.length === 0 && excedList.bolsa.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhum fechamento neste mês. Clique em <strong>Novo fechamento</strong> pra começar.
                  </p>
                ) : (
                  <>
                  <div className="divide-y divide-border/40">
                    {listaMes.map((f) => (
                      <div key={f.id} className="py-2.5 first:pt-0 last:pb-0 group">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5" title={equipe.find((m) => m.id === f.user_id)?.nome || f.responsavel || "Voluntário"}>
                              <User className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{f.cliente_nome}</span>
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
                                {f.rubricas?.length || 0} {(f.rubricas?.length || 0) === 1 ? "rubrica válida" : "rubricas válidas"}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {bolsaFechMap[f.id] > 0 && (
                              <span
                                className="inline-flex items-center text-emerald-400"
                                title={`${bolsaFechMap[f.id]} ${bolsaFechMap[f.id] === 1 ? "rubrica vai" : "rubricas vão"} para ${mesProximoExt}`}
                              >
                                <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />
                              </span>
                            )}
                            <button
                              onClick={() => excluir(f)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/60 hover:text-red-400"
                              title="Excluir fechamento"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {(f.rubricas?.length || 0) > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2 ml-9">
                            {f.rubricas!.map((r) => (
                              <span key={r} className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted/30 text-foreground/80" title={RUBRICA_LABEL[r] || r}>
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Excedente recebido do mês anterior — aparece como um cliente
                        normal, só com um iconezinho de que veio do mês passado.
                        Conta como fechamento E na comissão deste mês. */}
                    {excedList.recebido.map((c, i) => (
                      <div key={`rec-${c.userId}-${c.cliente_id || c.cliente_nome}-${i}`} className="py-2.5 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary mt-0.5">
                              <User className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{c.cliente_nome}</span>
                                {!focoId && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                    {primeiroNome(equipe.find((m) => m.id === c.userId)?.nome)}
                                  </span>
                                )}
                                {c.cliente_id && (
                                  <a href={`/clientes/${c.cliente_id}`} className="text-[10px] text-primary hover:underline">ver ficha</a>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1 flex-wrap">
                                <ArrowDownRight className="h-3 w-3 text-amber-400" /> excedente de {mesAnteriorExt}
                                <span className="text-muted-foreground/50">·</span>
                                {c.rubricas.length} {c.rubricas.length === 1 ? "rubrica válida" : "rubricas válidas"}
                              </div>
                              <div className="flex flex-wrap gap-1 mt-2">
                                {c.rubricas.map((r, idx) => (
                                  <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted/30 text-foreground/80" title={RUBRICA_LABEL[r] || r}>
                                    {r}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <span className="inline-flex items-center text-amber-400 shrink-0" title={`Recebido de ${mesAnteriorExt}`}>
                            <ArrowDownRight className="h-4 w-4" strokeWidth={2.5} />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-primary" /> Ações por rubrica
                </CardTitle>
              </CardHeader>
              <CardContent>
                {porRubrica.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Sem rubricas válidas neste mês.</p>
                ) : (
                  <div className="space-y-1.5">
                    {porRubrica.map(([r, n]) => {
                      const peak = porRubrica[0]?.[1] || 1;
                      const pct = (n / peak) * 100;
                      return (
                        <div key={r} className="group relative overflow-hidden rounded-md px-2.5 py-1.5">
                          <div className="absolute inset-y-0 left-0 bg-primary/15" style={{ width: `${pct}%` }} />
                          <div className="relative flex items-center justify-between gap-3">
                            <span className="text-sm truncate" title={RUBRICA_LABEL[r] || r}>{RUBRICA_LABEL[r] || r}</span>
                            <span className="text-xs font-mono text-muted-foreground tabular-nums shrink-0">{n}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
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
function PainelMeta({ titulo, icon: Icon, acoes, meta, nota, excedente }: {
  titulo: string; icon: any; acoes: number; meta: number; nota?: string;
  excedente?: { retido: number; recebido: number; mesAnterior: string; mesProximo: string };
}) {
  const bateu = meta > 0 && acoes >= meta;
  const pct = meta > 0 ? Math.min(100, Math.round((acoes / meta) * 100)) : 0;
  const faltam = Math.max(0, meta - acoes);
  const retido = excedente?.retido ?? 0;
  const recebido = excedente?.recebido ?? 0;
  // Produção própria do mês = o que contou pra meta menos o recebido de fora,
  // mais o que ficou retido. Assim as excedentes do mês nunca somem do controle.
  const fechadasNoMes = acoes - recebido + retido;
  return (
    <SpotlightCard className={`h-full ${bateu ? "border-emerald-500/25" : "border-primary/20"}`}>
      <div className="flex items-center justify-between gap-2 mb-5">
        <p className="text-xs uppercase tracking-[0.18em] text-primary/80 flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5" /> {titulo}
        </p>
        {bateu && (
          <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px] font-semibold uppercase tracking-wide">
            <Check className="h-4 w-4" strokeWidth={2.5} /> Meta batida
          </span>
        )}
      </div>

      <div className="flex items-center gap-5 sm:gap-7 flex-wrap sm:flex-nowrap">
        <AnelMeta pct={pct} bateu={bateu} />

        <div className="flex-1 min-w-[220px]">
          <div className="flex items-end gap-2 flex-wrap">
            <CountUp value={acoes} className="text-5xl font-semibold font-display tabular-nums leading-none" />
            <span className="text-base text-muted-foreground mb-1">
              / {meta > 0 ? intBR(meta) : "—"} rubricas válidas
            </span>
            {retido > 0 && (
              <span
                className="inline-flex items-center gap-1 text-xl font-semibold text-emerald-400 mb-0.5"
                title={`${intBR(retido)} excedentes vão para ${excedente?.mesProximo}`}
              >
                <ArrowUpRight className="h-5 w-5" strokeWidth={2.5} /> +{intBR(retido)}
                <span className="text-sm font-normal text-muted-foreground">excedentes · {excedente?.mesProximo}</span>
              </span>
            )}
          </div>
          <p className={`text-xs mt-1.5 ${bateu ? "text-emerald-400/90" : "text-muted-foreground"}`}>
            {meta > 0
              ? (bateu ? "Parabéns, meta do mês batida! 🎉" : <>Faltam <strong className="text-foreground">{intBR(faltam)}</strong> pra bater a meta</>)
              : "Meta do mês ainda não definida"}
          </p>

          {/* Recebidas do mês anterior — seta amarela pra baixo (recepcionando) */}
          {recebido > 0 && (
            <p className="inline-flex items-center gap-1 mt-2 text-[11px] text-muted-foreground">
              <ArrowDownRight className="h-3.5 w-3.5 text-amber-400" /> {intBR(recebido)} recebidas de {excedente?.mesAnterior}
            </p>
          )}

          {meta > 0 && <div className="mt-4"><BarraMarcos value={acoes} max={meta} bateu={bateu} /></div>}

          <div className="grid grid-cols-2 gap-2 mt-4">
            <MiniStat label="Meta do mês" value={meta > 0 ? intBR(meta) : "—"} sub="rubricas válidas" />
            <MiniStat label="Fechadas no mês" value={intBR(fechadasNoMes)} sub="rubricas válidas" />
          </div>

          {nota && <p className="text-[11px] text-muted-foreground mt-3">{nota}</p>}
        </div>
      </div>
    </SpotlightCard>
  );
}

/* Ranking do mês (aba geral) — placar do time por descontos, com pódio pros
   três primeiros e barrinha proporcional ao líder. */
function RankingMes({ equipe, acoesDe, pagasDe, regra, metasMap }: {
  equipe: Membro[]; acoesDe: Record<string, number>; pagasDe: Record<string, number>; regra: Regra; metasMap: Record<string, MetaUser>;
}) {
  const linhas = equipe
    .map((m) => {
      const acoes = acoesDe[m.id] || 0;
      const pagas = pagasDe[m.id] ?? acoes;
      const { regra: r } = regraDoFoco(regra, metasMap[m.id]);
      const comissao = comissaoDe(pagas, r, metasMap[m.id]?.bonus || 0);
      return { id: m.id, nome: m.nome, acoes, comissao };
    })
    .sort((a, b) => b.acoes - a.acoes || b.comissao - a.comissao);
  const topo = linhas[0]?.acoes || 0;
  const medalha = ["text-amber-400", "text-slate-300", "text-amber-700"];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Trophy className="h-4 w-4 text-primary" /> Ranking do mês
          <span className="ml-auto text-xs font-normal text-muted-foreground">{linhas.length} no time</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sem equipe cadastrada.</p>
        ) : (
          <div className="space-y-2.5">
            {linhas.map((l, i) => {
              const pct = topo > 0 ? Math.max(4, Math.round((l.acoes / topo) * 100)) : 0;
              return (
                <div key={l.id} className="flex items-center gap-2.5">
                  <span className={`w-5 text-center text-sm font-semibold font-display tabular-nums ${i < 3 ? medalha[i] : "text-muted-foreground/60"}`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium truncate">{primeiroNome(l.nome)}</span>
                      <span className="text-[11px] font-mono tabular-nums text-muted-foreground shrink-0">
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
      </CardContent>
    </Card>
  );
}

function CardValorAcao({ regra, acoes, vigente, especialAtivo, excepcional }: {
  regra: Regra; acoes: number; vigente: number; especialAtivo: boolean;
  /* Quando o valor veio de decisão manual, o card muda de cara e mostra o
     recado. Um número diferente do combinado sem o motivo ao lado é o que
     ninguém consegue explicar três meses depois. */
  excepcional?: { valor: number; obs: string | null } | null;
}) {
  const temEspecial = regra.especial_ativo && regra.valor_especial > 0;
  const lim = regra.especial_limite ?? 0;
  const faltam = temEspecial && !especialAtivo ? Math.max(0, lim + 1 - acoes) : 0;

  if (excepcional) {
    return (
      <SpotlightCard className="border-violet-400/40">
        <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-violet-300" /> Valor por rubrica válida
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-3xl font-normal font-display tabular-nums leading-none text-violet-300">{brl(excepcional.valor)}</span>
          <span className="text-sm text-muted-foreground mb-0.5">/ rubrica</span>
        </div>
        <p className="text-[11px] text-violet-300/90 mt-2.5 font-medium">
          Valor excepcional deste mês
        </p>
        {excepcional.obs
          ? <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-line">{excepcional.obs}</p>
          : <p className="text-[11px] text-amber-300/80 mt-1">Sem motivo registrado.</p>}
        <p className="text-[11px] text-muted-foreground/70 mt-2 pt-2 border-t border-white/[0.06]">
          Vale da primeira rubrica à última. O valor base do mês é {brl(regra.valor_base)}.
        </p>
      </SpotlightCard>
    );
  }

  return (
    <SpotlightCard className={especialAtivo ? "border-amber-400/40 fech-glow" : ""}>
      <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {especialAtivo ? <Flame className="h-3.5 w-3.5 text-amber-400" /> : <Zap className="h-3.5 w-3.5" />} Valor por rubrica válida
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <span className={`text-3xl font-normal font-display tabular-nums leading-none ${especialAtivo ? "text-amber-400" : ""}`}>{brl(vigente)}</span>
        <span className="text-sm text-muted-foreground mb-0.5">/ rubrica</span>
        {especialAtivo && <Sparkles className="h-5 w-5 text-amber-400" />}
      </div>
      <div className="mt-3 space-y-1 text-[11px]">
        <div className={`flex items-center justify-between ${!especialAtivo ? "text-foreground font-medium" : "text-muted-foreground"}`}>
          <span>Base{temEspecial ? ` (até ${intBR(lim)} rubricas)` : ""}</span><span className="tabular-nums">{brl(regra.valor_base)}</span>
        </div>
        {temEspecial && (
          <div className={`flex items-center justify-between ${especialAtivo ? "text-amber-400 font-semibold" : "text-muted-foreground"}`}>
            <span>Especial (acima de {intBR(lim)})</span><span className="tabular-nums">{brl(regra.valor_especial)}</span>
          </div>
        )}
        {temEspecial && !especialAtivo && (
          <p className="text-[11px] text-amber-400/90 pt-1">Faltam <strong>{intBR(faltam)}</strong> rubricas válidas pra cada rubrica valer {brl(regra.valor_especial)}</p>
        )}
        {!temEspecial && <p className="text-[11px] text-muted-foreground pt-1">Sem faixa especial neste mês.</p>}
      </div>
    </SpotlightCard>
  );
}

function CardComissao({ acoes, valorAcao, bonus, total }: { acoes: number; valorAcao: number; bonus: number; total: number }) {
  return (
    <SpotlightCard className="border-emerald-500/25">
      <p className="text-xs uppercase tracking-wider text-emerald-400/90 flex items-center gap-1.5">
        <Coins className="h-3.5 w-3.5" /> Comissão do mês
      </p>
      <div className="mt-1.5">
        <CountUp value={total} format={(n) => brl(n)} className="text-3xl font-semibold font-display tabular-nums leading-none text-emerald-400" />
      </div>
      <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
        {intBR(acoes)} rubricas válidas × {brl(valorAcao)}/rubrica
        {bonus > 0 && <> + {brl(bonus)} bônus</>}
      </p>
    </SpotlightCard>
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
function CardDinamica({ regra, acoes, excepcional }: {
  regra: Regra; acoes: number;
  /* `regra` já chega com o valor excepcional no lugar do base — quem resolve a
     precedência é regraDoFoco. Este sinal serve só pra tela não anunciar como
     "a dinâmica do mês" um valor que é de uma pessoa só. */
  excepcional?: boolean;
}) {
  const temEspecial = regra.especial_ativo && regra.valor_especial > 0;
  const lim = regra.especial_limite ?? 0;
  const alvo = lim + 1;
  const desbloqueado = especialAtivoPara(acoes, regra);
  const faltam = temEspecial && !desbloqueado ? Math.max(0, alvo - acoes) : 0;

  return (
    <SpotlightCard className={desbloqueado ? "border-amber-400/40 fech-glow" : ""}>
      <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {excepcional ? <Sparkles className="h-3.5 w-3.5 text-violet-300" />
          : desbloqueado ? <Flame className="h-3.5 w-3.5 text-amber-400" />
          : <Sparkles className="h-3.5 w-3.5 text-primary" />}
        {excepcional ? "Dinâmica desta pessoa" : "Dinâmica do mês"}
      </p>

      <p className="mt-2 text-[13px] leading-snug">
        {temEspecial ? (
          <>
            Cada rubrica válida vale <strong className="text-foreground">{brl(regra.valor_base)}</strong>; do{" "}
            <strong className={desbloqueado ? "text-amber-300" : "text-foreground"}>{intBR(alvo)}º</strong> em diante,{" "}
            <strong className={desbloqueado ? "text-amber-300" : "text-foreground"}>{brl(regra.valor_especial)}</strong>.
          </>
        ) : (
          <>
            Cada rubrica válida vale{" "}
            <strong className={excepcional ? "text-violet-300" : "text-foreground"}>{brl(regra.valor_base)}</strong>{" "}
            do início ao fim{excepcional ? ", por decisão deste mês" : ""}.
          </>
        )}
      </p>

      {temEspecial && (
        <div className="mt-3 space-y-1.5">
          <BarraViva value={acoes} max={alvo} desbloqueado={desbloqueado} />
          <p className={`text-[11px] font-medium ${desbloqueado ? "text-amber-300" : "text-muted-foreground"}`}>
            {desbloqueado
              ? "Faixa especial ativa"
              : <>Faltam <strong className="text-foreground">{intBR(faltam)}</strong> pra {brl(regra.valor_especial)}/rubrica</>}
          </p>
        </div>
      )}
    </SpotlightCard>
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
  const hoje = hojeISO();
  const [data, setData] = useState(hoje);
  const [clienteNome, setClienteNome] = useState("");
  const [userId, setUserId] = useState<string>(defaultUserId || "");
  const [rubricas, setRubricas] = useState<Set<string>>(new Set());
  const [buscaRub, setBuscaRub] = useState("");
  const rubricasFiltradas = useMemo(
    () => filtraPorBusca(RUBRICAS_FECHAMENTO, buscaRub, (r) => r.label),
    [buscaRub],
  );
  const [pendencia, setPendencia] = useState(false);
  const [pastaDrive, setPastaDrive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setUserId(defaultUserId || equipe[0]?.id || ""); }, [open, defaultUserId, equipe]);

  const reset = () => {
    setData(hoje); setClienteNome(""); setRubricas(new Set()); setBuscaRub("");
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
          <DialogDescription>Marque as rubricas válidas fechadas. Cada uma conta como 1 no placar.</DialogDescription>
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
              <Label>Ações válidas fechadas</Label>
              <span className="text-[11px] text-muted-foreground">{rubricas.size} selecionada(s)</span>
            </div>
            <div className="mb-1.5">
              <BuscaRubrica
                valor={buscaRub}
                onChange={setBuscaRub}
                total={RUBRICAS_FECHAMENTO.length}
                filtrados={rubricasFiltradas.length}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[40vh] overflow-y-auto pr-1 rounded-lg border border-border p-2">
              {rubricasFiltradas.length === 0 && (
                <p className="col-span-full text-[12px] text-muted-foreground text-center py-4">
                  Nenhuma ação com “{buscaRub.trim()}”.
                </p>
              )}
              {rubricasFiltradas.map((r) => {
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
            {saving ? "Salvando…" : `Salvar (${rubricas.size} ${rubricas.size === 1 ? "rubrica válida" : "rubricas válidas"})`}
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
  const [permitirExc, setPermitirExc] = useState(true);   // geral do mês
  type MetaForm = { meta: string; bonus: string; espAtivo: boolean; espLimite: string; valorEsp: string; permitirExc: string;
                    excAtivo: boolean; excValor: string; excObs: string };
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
    setPermitirExc(regra.permitir_excedentes);
    const m: Record<string, MetaForm> = {};
    for (const mem of equipe) {
      const cur = metasMap[mem.id];
      m[mem.id] = {
        meta: cur?.meta ? String(cur.meta) : "",
        bonus: cur?.bonus ? String(cur.bonus) : "",
        espAtivo: !!cur?.especialAtivo,
        espLimite: cur?.especialLimite == null ? "" : String(cur.especialLimite),
        valorEsp: cur?.valorEspecial ? String(cur.valorEspecial) : "",
        permitirExc: cur?.permitirExcedentes == null ? "" : String(cur.permitirExcedentes),
        excAtivo: !!cur?.excepcionalAtivo,
        excValor: cur?.excepcionalValor ? String(cur.excepcionalValor) : "",
        excObs: cur?.excepcionalObs ?? "",
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
      permitir_excedentes: permitirExc,
      updated_at: new Date().toISOString(),
    }, { onConflict: "mes" });
    if (e1) { setSaving(false); toast.error("Erro ao salvar regras: " + e1.message); return; }

    const rows = equipe.map((m) => {
      const f = metas[m.id];
      const espOn = !!f?.espAtivo;
      const excOn = !!f?.excAtivo;
      return {
        mes,
        user_id: m.id,
        excepcional_ativo: excOn,
        excepcional_valor: excOn ? num(f?.excValor || "") : null,
        // a observação só é apagada quando o excepcional é desligado; enquanto
        // ligado, ela é obrigatória na tela
        excepcional_obs: excOn ? (f?.excObs?.trim() || null) : null,
        meta: int(f?.meta || ""),
        bonus: num(f?.bonus || ""),
        especial_ativo: espOn,
        valor_especial: espOn ? num(f?.valorEsp || "") : 0,
        especial_limite: espOn ? (f?.espLimite?.trim() ? int(f.espLimite) : null) : null,
        permitir_excedentes: !f?.permitirExc ? null : f.permitirExc === "true",
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
      {/* Rolagem no CORPO, não no diálogo inteiro: com quatro pessoas e os
          blocos abertos, o rodapé descia junto e o botão de salvar sumia — dava
          pra preencher tudo e não achar onde confirmar. Agora cabeçalho e
          rodapé ficam fixos e só o meio rola. */}
      <DialogContent className="sm:max-w-2xl max-h-[88dvh] flex flex-col gap-0 overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-primary" /> Regras de {mesExtenso(mes)}</DialogTitle>
          <DialogDescription>Define o valor base, os multiplicadores, o bônus e as metas do mês. Vale só para {mesExtenso(mes)}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3 flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <CampoNum label="Valor base (R$/rubrica)" value={valorBase} onChange={setValorBase} />
            <CampoNum label="Meta geral (rubricas válidas)" value={metaGeral} onChange={setMetaGeral} />
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
                  <CampoNum label="Base vale até (rubricas)" value={espLimite} onChange={setEspLimite} placeholder="ex: 20" />
                  <CampoNum label="Valor especial (R$/rubrica)" value={valorEsp} onChange={setValorEsp} placeholder="ex: 6" />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Cada rubrica válida vale <strong>{brl(num(valorBase))}</strong> até <strong>{int(espLimite) || 0}</strong> rubricas. Do{" "}
                  <strong>{(int(espLimite) || 0) + 1}º</strong> em diante, cada rubrica passa a valer <strong>{brl(num(valorEsp))}</strong>.
                </p>
              </>
            )}
          </div>

          {/* Permitir excedentes GERAL — quando OFF, o que passa da meta vira bolsa */}
          <div className={`rounded-lg border p-3 ${!permitirExc ? "border-emerald-500/30 bg-emerald-500/5" : "border-border"}`}>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <Checkbox checked={permitirExc} onCheckedChange={() => setPermitirExc((v) => !v)} />
              <PiggyBank className={`h-4 w-4 ${!permitirExc ? "text-emerald-400" : "text-muted-foreground"}`} />
              Permitir excedentes neste mês
              <span className="text-[10px] font-normal text-muted-foreground">· vale pra todos (quem tiver o próprio sobrepõe)</span>
            </label>
            <p className="text-[11px] text-muted-foreground mt-2">
              {permitirExc
                ? "Ligado: tudo que a pessoa fechar paga no mês, mesmo passando da meta."
                : <>Desligado: ao bater a meta, o que passar <strong>não paga este mês</strong> — vira bolsa e entra em {mesExtenso(addMes(mes, 1))} pela regra de lá.</>}
            </p>
          </div>

          <div>
            <Label className="flex items-center gap-1.5 mb-2"><Target className="h-4 w-4" /> Metas, bônus e faixa especial por pessoa</Label>
            <div className="space-y-2">
              {equipe.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 rounded-lg border border-border">Nenhum membro na equipe.</p>
              ) : equipe.map((m) => {
                const f = metas[m.id];
                const espOn = !!f?.espAtivo;
                const excOn = !!f?.excAtivo;
                return (
                  <div key={m.id} className={cn("rounded-lg border p-3",
                    excOn ? "border-violet-400/40 bg-violet-400/[0.05]"
                          : espOn ? "border-amber-400/40 bg-amber-400/5" : "border-border")}>
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

                    {/* ── VALOR EXCEPCIONAL ──
                        Não é degrau: reprecifica a rubrica do início ao fim, e
                        sobrepõe as duas faixas especiais. Por isso vem antes
                        delas aqui também — quem liga isso precisa ver, na hora,
                        que está passando por cima do resto. */}
                    <div className={cn("rounded-lg border p-2.5 mt-2.5",
                      excOn ? "border-violet-400/40 bg-violet-400/[0.06]" : "border-white/[0.06]")}>
                      <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                        <Checkbox checked={excOn} onCheckedChange={() => patchMeta(m.id, { excAtivo: !excOn })} />
                        <Sparkles className={cn("h-3.5 w-3.5", excOn ? "text-violet-300" : "text-muted-foreground")} />
                        Valor excepcional
                        <span className="text-[10px] font-normal text-muted-foreground">
                          · só pra {primeiroNome(m.nome)}, só em {mesExtenso(mes)}
                        </span>
                      </label>

                      {excOn && (
                        <div className="mt-2.5 space-y-2.5">
                          <div className="grid grid-cols-2 gap-3">
                            <CampoNum
                              label="Valor por rubrica (R$)"
                              value={f?.excValor || ""}
                              onChange={(v) => patchMeta(m.id, { excValor: v })}
                              placeholder="ex: 9"
                            />
                            <div className="flex items-end pb-1">
                              <p className="text-[11px] text-muted-foreground leading-snug">
                                Vale da primeira rubrica à última. Ignora as faixas especiais.
                              </p>
                            </div>
                          </div>
                          <div>
                            <Label className="text-[11px] text-muted-foreground">
                              Por que este valor
                            </Label>
                            <Textarea
                              value={f?.excObs || ""}
                              onChange={(e) => patchMeta(m.id, { excObs: e.target.value })}
                              placeholder="o combinado, e com quem"
                              rows={2}
                              className="mt-1 text-sm resize-none"
                            />
                            {!f?.excObs?.trim() && (
                              <p className="text-[11px] text-amber-300/90 mt-1">
                                Escreva o motivo. Um valor fora do combinado sem registro do porquê
                                ninguém consegue explicar depois — nem pra quem recebeu, nem pra
                                quem não recebeu.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <label className={cn("flex items-center gap-2 text-xs font-medium cursor-pointer mt-2.5",
                      excOn && "opacity-40")}>
                      <Checkbox checked={espOn} disabled={excOn} onCheckedChange={() => patchMeta(m.id, { espAtivo: !espOn })} />
                      <Flame className={`h-3.5 w-3.5 ${espOn ? "text-amber-400" : "text-muted-foreground"}`} />
                      Faixa especial própria
                      <span className="text-[10px] font-normal text-muted-foreground">· sobrepõe a geral só pra {primeiroNome(m.nome)}</span>
                    </label>
                    {espOn && (
                      <div className={cn(excOn && "opacity-40 pointer-events-none")}>
                        {excOn && (
                          <p className="text-[11px] text-violet-300/90 mt-2">
                            Sem efeito enquanto o valor excepcional estiver ligado.
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-3 mt-2.5">
                          <CampoNum label="Base vale até (rubricas)" value={f?.espLimite || ""} onChange={(v) => patchMeta(m.id, { espLimite: v })} placeholder="ex: 20" />
                          <CampoNum label="Valor especial (R$/rubrica)" value={f?.valorEsp || ""} onChange={(v) => patchMeta(m.id, { valorEsp: v })} placeholder="ex: 6" />
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-2">
                          Pra {primeiroNome(m.nome)}: cada rubrica válida vale <strong>{brl(num(valorBase))}</strong> até <strong>{int(f?.espLimite || "") || 0}</strong>. Do{" "}
                          <strong>{(int(f?.espLimite || "") || 0) + 1}º</strong> em diante, vale <strong>{brl(num(f?.valorEsp || ""))}</strong>.
                        </p>
                      </div>
                    )}

                    {/* Excedentes próprios — sobrepõe o geral do mês só pra esta pessoa */}
                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1"><PiggyBank className="h-3.5 w-3.5" /> Excedentes:</span>
                      {([
                        { v: "", label: "Segue geral" },
                        { v: "true", label: "Permitir" },
                        { v: "false", label: "Reter" },
                      ] as const).map((opt) => {
                        const on = (f?.permitirExc || "") === opt.v;
                        return (
                          <button
                            key={opt.v || "geral"}
                            type="button"
                            onClick={() => patchMeta(m.id, { permitirExc: opt.v })}
                            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                              on
                                ? (opt.v === "false" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : "bg-primary/15 text-primary border-primary/30")
                                : "border-border text-muted-foreground hover:border-primary/40"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">Campos: meta de rubricas válidas · bônus individual (R$) · faixa especial própria · excedentes (segue o geral, ou força permitir/reter).</p>
          </div>
        </div>

        <DialogFooter className="shrink-0 pt-3 border-t border-white/[0.06]">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? "Salvando…" : "Salvar regras"}
          </Button>
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
