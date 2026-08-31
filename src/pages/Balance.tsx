// BALANCE — o caixa do escritório.
//
// A tela responde uma pergunta antes de qualquer outra: quanto tem na conta.
// Esse número é o protagonista e ocupa o topo sozinho. O que é de cliente e o
// que sobra pro escritório ficam embaixo, em corpo pequeno — importam, mas não
// competem com o saldo.
//
// CONTA É ETIQUETA, NÃO GAVETA. O saldo é um só. Cada lançamento carrega a
// conta de onde saiu como etiqueta, então dá pra saber por onde o dinheiro
// passou sem fatiar o total em saldos paralelos que ninguém soma de cabeça.
//
// O dinheiro do cliente entra inteiro na conta e fica aqui até o escritório
// decidir repassar. Por isso ele aparece descontado do "seu": é o que impede
// gastar dinheiro de terceiro achando que é caixa.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { parseMoneyBR } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SpotlightCard } from "@/components/SpotlightCard";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, ArrowUpRight, ArrowDownRight, Loader2, Landmark, HandCoins, Repeat, Check,
  Trash2, Users, Trophy, Handshake, Gavel, FileSignature, MessagesSquare, PiggyBank,
  Undo2, Microscope, Wallet, Sparkles, BadgeDollarSign, Building2, Plug,
  MonitorSmartphone, Megaphone, Receipt, CreditCard, CircleDashed, Scale, Banknote,
  UserCheck, Search, CalendarRange, Tag, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hoje = () => new Date().toISOString().slice(0, 10);
const fmtDia = (d?: string | null) => {
  if (!d) return "—";
  const [y, m, dd] = String(d).slice(0, 10).split("-");
  return `${dd}/${m}/${y}`;
};

/* O banco guarda o NOME do ícone; aqui ele vira componente. Categoria com nome
   desconhecido cai no genérico em vez de quebrar a lista. */
const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  Trophy, Handshake, Gavel, FileSignature, MessagesSquare, PiggyBank, Undo2, Users,
  Landmark, Microscope, Wallet, Sparkles, BadgeDollarSign, Building2, Plug,
  MonitorSmartphone, Megaphone, Receipt, CreditCard, CircleDashed, Scale, Banknote,
  UserCheck,
};
const IconeCat = ({ nome, className }: { nome?: string | null; className?: string }) => {
  const C = (nome && ICONES[nome]) || CircleDashed;
  return <C className={className} />;
};

interface Conta { id: string; nome: string; tipo: string; instituicao: string | null; saldo_inicial: number; ativo: boolean }
interface Categoria {
  id: string; nome: string; tipo: "entrada" | "saida"; grupo: string | null;
  fixa: boolean; icone: string | null; judicial: boolean;
}
interface Lancamento {
  id: string; conta_id: string; categoria_id: string | null;
  tipo: "entrada" | "saida"; valor: number; data: string;
  status: "previsto" | "realizado"; descricao: string; observacoes: string | null;
  cliente_id: string | null; processo_id: string | null; origem: string; created_at: string;
}
interface Repasse {
  id: string; cliente_id: string | null; processo_id: string | null;
  valor_devido: number; status: "pendente" | "pago"; created_at: string;
}
interface Recorrente {
  id: string; descricao: string; conta_id: string; categoria_id: string | null;
  tipo: "entrada" | "saida"; valor: number; dia_vencimento: number; ativo: boolean;
}

type Aba = "movimento" | "repasses" | "fixos" | "contas";
type Periodo = "mes" | "anterior" | "90" | "tudo" | "livre";

export default function Balance() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("movimento");
  const inval = () => qc.invalidateQueries({ queryKey: ["balance"] });

  // As cinco consultas ficam escritas uma a uma de propósito. Um helper que
  // envolvesse useQuery seria um hook chamado de dentro de função comum — o
  // lint pega, e a ordem dos hooks é o tipo de coisa que quebra em silêncio.
  const { data: contas = [], isLoading: loadContas } = useQuery({
    queryKey: ["balance", "contas"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("balance_contas" as never) as never as any)
        .select("*").order("ordem").order("nome");
      if (error) throw error;
      return (data || []) as Conta[];
    },
  });
  const { data: categorias = [] } = useQuery({
    queryKey: ["balance", "categorias"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("balance_categorias" as never) as never as any)
        .select("*").eq("ativo", true).order("tipo").order("ordem");
      if (error) throw error;
      return (data || []) as Categoria[];
    },
  });
  const { data: lancamentos = [] } = useQuery({
    queryKey: ["balance", "lancamentos"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("balance_lancamentos" as never) as never as any)
        .select("*").order("data", { ascending: false }).limit(800);
      if (error) throw error;
      return (data || []) as Lancamento[];
    },
  });
  const { data: repasses = [] } = useQuery({
    queryKey: ["balance", "repasses"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("balance_repasses" as never) as never as any)
        .select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as Repasse[];
    },
  });
  const { data: recorrentes = [] } = useQuery({
    queryKey: ["balance", "recorrentes"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("balance_recorrentes" as never) as never as any)
        .select("*").order("dia_vencimento");
      if (error) throw error;
      return (data || []) as Recorrente[];
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["balance", "clientes-nomes"],
    queryFn: async () => {
      const { data } = await supabase.from("clientes").select("id, nome").order("nome");
      return (data || []) as { id: string; nome: string }[];
    },
  });
  const nomeCliente = (id: string | null) => clientes.find((c) => c.id === id)?.nome ?? "cliente";
  const cat = (id: string | null) => categorias.find((c) => c.id === id);
  const conta = (id: string) => contas.find((c) => c.id === id);

  /* ── o saldo é um só ── */
  const resumo = useMemo(() => {
    const inicial = contas.filter((c) => c.ativo).reduce((a, c) => a + Number(c.saldo_inicial || 0), 0);
    const movimento = lancamentos.filter((l) => l.status === "realizado")
      .reduce((a, l) => a + (l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)), 0);
    const emConta = inicial + movimento;
    const deCliente = repasses.filter((r) => r.status === "pendente")
      .reduce((a, r) => a + Number(r.valor_devido), 0);
    return { emConta, deCliente, doEscritorio: emConta - deCliente };
  }, [contas, lancamentos, repasses]);

  /* ── filtros ── */
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [busca, setBusca] = useState("");
  const [catFiltro, setCatFiltro] = useState<string>("todas");

  const janela = useMemo(() => {
    const h = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    if (periodo === "mes") return { de: iso(new Date(h.getFullYear(), h.getMonth(), 1)), ate: iso(new Date(h.getFullYear(), h.getMonth() + 1, 0)) };
    if (periodo === "anterior") return { de: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), ate: iso(new Date(h.getFullYear(), h.getMonth(), 0)) };
    if (periodo === "90") return { de: iso(new Date(h.getTime() - 90 * 86400000)), ate: iso(h) };
    if (periodo === "livre") return { de: de || "0000-01-01", ate: ate || "9999-12-31" };
    return { de: "0000-01-01", ate: "9999-12-31" };
  }, [periodo, de, ate]);

  const filtrados = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    return lancamentos.filter((l) => {
      if (l.data < janela.de || l.data > janela.ate) return false;
      if (catFiltro !== "todas" && l.categoria_id !== catFiltro) return false;
      if (!termo) return true;
      const c = cat(l.categoria_id)?.nome ?? "";
      return `${l.descricao} ${c}`.toLowerCase().includes(termo);
    });
  }, [lancamentos, janela, catFiltro, busca, categorias]);

  const previstos = filtrados.filter((l) => l.status === "previsto").sort((a, b) => a.data.localeCompare(b.data));
  const realizados = filtrados.filter((l) => l.status === "realizado");
  const totalPeriodo = useMemo(() => {
    const e = realizados.filter((l) => l.tipo === "entrada").reduce((a, l) => a + Number(l.valor), 0);
    const s = realizados.filter((l) => l.tipo === "saida").reduce((a, l) => a + Number(l.valor), 0);
    return { entrou: e, saiu: s, liquido: e - s };
  }, [realizados]);

  const repassesPendentes = repasses.filter((r) => r.status === "pendente");

  /* ── diálogos ── */
  const [novaConta, setNovaConta] = useState(false);
  const [novoLanc, setNovoLanc] = useState<null | "entrada" | "saida">(null);
  const [novoFixo, setNovoFixo] = useState(false);
  const [pagando, setPagando] = useState<Repasse | null>(null);
  const [detalhe, setDetalhe] = useState<Lancamento | null>(null);
  const [salvando, setSalvando] = useState(false);
  const semConta = !loadContas && contas.length === 0;

  const confirmar = async (l: Lancamento) => {
    const { error } = await (supabase.from("balance_lancamentos" as never) as never as any)
      .update({ status: "realizado", pago_em: new Date().toISOString() }).eq("id", l.id);
    if (error) return toast.error("Erro: " + error.message);
    toast.success(l.tipo === "entrada" ? "Entrada confirmada." : "Pagamento confirmado.");
    inval();
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1200px] mx-auto">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Balance</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Entradas e saídas do escritório. O dinheiro de cliente aparece separado do que é seu.
        </p>
      </motion.div>

      {semConta ? (
        <SpotlightCard className="p-8 text-center">
          <Landmark className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-base font-semibold">Cadastre a primeira conta</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            A conta é a etiqueta que diz por onde o dinheiro passou. Comece pela principal, com o
            saldo que ela tem hoje.
          </p>
          <Button className="mt-4" onClick={() => setNovaConta(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nova conta
          </Button>
        </SpotlightCard>
      ) : (
        <>
          {/* ── o saldo, sozinho ── */}
          <SpotlightCard className="p-6 md:p-7">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Em conta</p>
            <p className={cn(
              "text-4xl md:text-5xl font-bold tabular-nums tracking-tight mt-1.5",
              resumo.emConta < 0 && "text-rose-400",
            )}>
              {brl(resumo.emConta)}
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3 text-[12.5px]">
              <span className="text-muted-foreground">
                <span className={cn("font-semibold tabular-nums", resumo.deCliente > 0 ? "text-amber-300" : "text-foreground/70")}>
                  {brl(resumo.deCliente)}
                </span>{" "}
                é de cliente
              </span>
              <span className="text-muted-foreground">
                <span className="font-semibold tabular-nums text-foreground">{brl(resumo.doEscritorio)}</span>{" "}
                do escritório
              </span>
            </div>
            <div className="flex gap-2 mt-5">
              <Button size="sm" variant="outline" onClick={() => setNovoLanc("entrada")}>
                <ArrowUpRight className="h-4 w-4 mr-1.5 text-emerald-400" /> Entrada
              </Button>
              <Button size="sm" variant="outline" onClick={() => setNovoLanc("saida")}>
                <ArrowDownRight className="h-4 w-4 mr-1.5 text-rose-400" /> Saída
              </Button>
            </div>
          </SpotlightCard>

          {/* ── abas ── */}
          <div className="flex gap-1.5 flex-wrap">
            {([
              ["movimento", "Movimento", lancamentos.length],
              ["repasses", "Repasses", repassesPendentes.length],
              ["fixos", "Custos fixos", recorrentes.filter((r) => r.ativo).length],
              ["contas", "Contas", contas.length],
            ] as [Aba, string, number][]).map(([k, label, n]) => (
              <button
                key={k} onClick={() => setAba(k)}
                className={cn("px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors border",
                  aba === k ? "bg-primary/12 border-primary/30 text-foreground"
                            : "bg-white/[0.02] border-white/[0.06] text-muted-foreground hover:bg-white/[0.05]")}
              >
                {label}{n > 0 && <span className="ml-1.5 text-[11px] opacity-60 tabular-nums">{n}</span>}
              </button>
            ))}
          </div>

          {aba === "movimento" && (
            <div className="space-y-4">
              {/* filtros */}
              <SpotlightCard className="p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-muted-foreground shrink-0" />
                  {([["mes", "Este mês"], ["anterior", "Mês passado"], ["90", "90 dias"], ["tudo", "Tudo"], ["livre", "Escolher"]] as [Periodo, string][])
                    .map(([k, label]) => (
                      <button
                        key={k} onClick={() => setPeriodo(k)}
                        className={cn("px-2.5 py-1 rounded-md text-[12px] transition-colors border",
                          periodo === k ? "bg-primary/12 border-primary/30 text-foreground"
                                        : "bg-white/[0.02] border-white/[0.06] text-muted-foreground hover:bg-white/[0.05]")}
                      >
                        {label}
                      </button>
                    ))}
                  {periodo === "livre" && (
                    <span className="flex items-center gap-1.5">
                      <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-8 w-[9.5rem] text-[12px]" />
                      <span className="text-muted-foreground text-xs">até</span>
                      <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-8 w-[9.5rem] text-[12px]" />
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  <span className="relative flex-1 min-w-[12rem]">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={busca} onChange={(e) => setBusca(e.target.value)}
                      placeholder="Buscar por descrição ou categoria" className="h-8 pl-8 text-[12.5px]"
                    />
                  </span>
                  <Select value={catFiltro} onValueChange={setCatFiltro}>
                    <SelectTrigger className="h-8 w-[13rem] text-[12.5px]">
                      <Tag className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as categorias</SelectItem>
                      {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {(busca || catFiltro !== "todas") && (
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => { setBusca(""); setCatFiltro("todas"); }}>
                      <X className="h-3.5 w-3.5 mr-1" /> Limpar
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5 pt-2.5 border-t border-white/[0.06] text-[12px]">
                  <span className="text-muted-foreground">
                    entrou <span className="text-emerald-400 font-semibold tabular-nums">{brl(totalPeriodo.entrou)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    saiu <span className="text-rose-400 font-semibold tabular-nums">{brl(totalPeriodo.saiu)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    saldo do período{" "}
                    <span className={cn("font-semibold tabular-nums", totalPeriodo.liquido < 0 ? "text-rose-400" : "text-foreground")}>
                      {brl(totalPeriodo.liquido)}
                    </span>
                  </span>
                </div>
              </SpotlightCard>

              {previstos.length > 0 && (
                <SpotlightCard className="p-4">
                  <h2 className="text-sm font-semibold mb-3">A vencer</h2>
                  <div className="space-y-1">
                    {previstos.map((l) => (
                      <LinhaLanc
                        key={l.id} l={l} categoria={cat(l.categoria_id)} conta={conta(l.conta_id)}
                        onClick={() => setDetalhe(l)}
                        acao={
                          <Button size="sm" variant="ghost" className="h-7 text-[11px] shrink-0"
                            onClick={(e) => { e.stopPropagation(); confirmar(l); }}>
                            <Check className="h-3.5 w-3.5 mr-1" /> Confirmar
                          </Button>
                        }
                      />
                    ))}
                  </div>
                </SpotlightCard>
              )}

              <SpotlightCard className="p-4">
                <h2 className="text-sm font-semibold mb-3">Realizado</h2>
                {realizados.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    Nenhum lançamento neste período.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {realizados.map((l) => (
                      <LinhaLanc key={l.id} l={l} categoria={cat(l.categoria_id)} conta={conta(l.conta_id)}
                        onClick={() => setDetalhe(l)} />
                    ))}
                  </div>
                )}
                {/* lançar sem precisar voltar ao topo */}
                <div className="flex gap-2 mt-3 pt-3 border-t border-white/[0.06]">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setNovoLanc("entrada")}>
                    <ArrowUpRight className="h-4 w-4 mr-1.5 text-emerald-400" /> Entrada
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setNovoLanc("saida")}>
                    <ArrowDownRight className="h-4 w-4 mr-1.5 text-rose-400" /> Saída
                  </Button>
                </div>
              </SpotlightCard>
            </div>
          )}

          {aba === "repasses" && (
            <SpotlightCard className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <HandCoins className="h-4 w-4 text-amber-300" />
                <h2 className="text-sm font-semibold">Clientes esperando repasse</h2>
              </div>
              <p className="text-[12px] text-muted-foreground mb-3 max-w-2xl">
                Esse dinheiro entrou na conta do escritório mas é do cliente. Sai quando vocês
                decidirem — o sistema só não deixa esquecer.
              </p>
              {repassesPendentes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum repasse pendente.</p>
              ) : (
                <div className="space-y-1.5">
                  {repassesPendentes.map((r) => {
                    const dias = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000);
                    return (
                      <div key={r.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                        <span className="h-8 w-8 rounded-lg bg-amber-400/10 ring-1 ring-amber-400/25 grid place-items-center shrink-0">
                          <HandCoins className="h-4 w-4 text-amber-300" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium truncate">{nomeCliente(r.cliente_id)}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            esperando há {dias === 0 ? "menos de um dia" : `${dias} dia${dias === 1 ? "" : "s"}`}
                          </span>
                        </span>
                        <span className="text-[13px] font-semibold tabular-nums shrink-0">{brl(Number(r.valor_devido))}</span>
                        <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => setPagando(r)}>Repassar</Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </SpotlightCard>
          )}

          {aba === "fixos" && (
            <SpotlightCard className="p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Repeat className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold">Custos fixos</h2>
                  </div>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    Aparecem sozinhos como "a vencer" todo mês. Você só confirma quando pagar.
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline"
                    onClick={async () => {
                      const { data, error } = await supabase.rpc("fn_balance_materializar_recorrentes" as never, {} as never);
                      if (error) return toast.error("Erro: " + error.message);
                      const n = (data as any)?.criados ?? 0;
                      toast.success(n > 0 ? `${n} lançamento(s) gerado(s) para este mês.` : "Este mês já estava gerado.");
                      inval();
                    }}>
                    Gerar este mês
                  </Button>
                  <Button size="sm" onClick={() => setNovoFixo(true)}><Plus className="h-4 w-4 mr-1.5" /> Novo</Button>
                </div>
              </div>
              {recorrentes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum custo fixo cadastrado.</p>
              ) : (
                <div className="space-y-1.5">
                  {recorrentes.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                      <span className="h-8 w-8 rounded-lg bg-white/[0.05] ring-1 ring-white/10 grid place-items-center shrink-0">
                        <IconeCat nome={cat(r.categoria_id)?.icone} className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium truncate">{r.descricao}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          todo dia {r.dia_vencimento} · {conta(r.conta_id)?.nome ?? "—"}{!r.ativo && " · pausado"}
                        </span>
                      </span>
                      <span className={cn("text-[13px] font-semibold tabular-nums shrink-0",
                        r.tipo === "entrada" ? "text-emerald-400" : "text-rose-400")}>
                        {r.tipo === "entrada" ? "+" : "−"}{brl(Number(r.valor))}
                      </span>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0"
                        onClick={async () => {
                          const { error } = await (supabase.from("balance_recorrentes" as never) as never as any).delete().eq("id", r.id);
                          if (error) return toast.error("Erro: " + error.message);
                          toast.success("Custo fixo removido."); inval();
                        }}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </SpotlightCard>
          )}

          {aba === "contas" && (
            <SpotlightCard className="p-4">
              <div className="flex items-center justify-between gap-3 mb-1">
                <h2 className="text-sm font-semibold">Contas</h2>
                <Button size="sm" onClick={() => setNovaConta(true)}><Plus className="h-4 w-4 mr-1.5" /> Nova conta</Button>
              </div>
              <p className="text-[12px] text-muted-foreground mb-3 max-w-2xl">
                A conta é a etiqueta de cada lançamento — diz por onde o dinheiro passou. O saldo
                do escritório continua sendo um só, lá em cima.
              </p>
              <div className="space-y-1.5">
                {contas.map((c) => {
                  const usos = lancamentos.filter((l) => l.conta_id === c.id).length;
                  return (
                    <div key={c.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                      <span className="h-8 w-8 rounded-lg bg-primary/10 ring-1 ring-primary/20 grid place-items-center shrink-0">
                        <Landmark className="h-4 w-4 text-primary" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium truncate">{c.nome}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {c.instituicao || c.tipo} · saldo inicial {brl(Number(c.saldo_inicial))}
                          {!c.ativo && " · inativa"}
                        </span>
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                        {usos} lançamento{usos === 1 ? "" : "s"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </SpotlightCard>
          )}
        </>
      )}

      {/* ── detalhe do lançamento ── */}
      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="max-w-md">
          {detalhe && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2.5">
                  <span className={cn("h-8 w-8 rounded-lg grid place-items-center shrink-0",
                    detalhe.tipo === "entrada" ? "bg-emerald-400/10 ring-1 ring-emerald-400/25" : "bg-rose-400/10 ring-1 ring-rose-400/25")}>
                    <IconeCat nome={cat(detalhe.categoria_id)?.icone}
                      className={cn("h-4 w-4", detalhe.tipo === "entrada" ? "text-emerald-400" : "text-rose-400")} />
                  </span>
                  <span className="min-w-0 truncate">{detalhe.descricao}</span>
                </DialogTitle>
                <DialogDescription className="sr-only">Detalhes do lançamento</DialogDescription>
              </DialogHeader>
              <p className={cn("text-3xl font-bold tabular-nums",
                detalhe.tipo === "entrada" ? "text-emerald-400" : "text-rose-400")}>
                {detalhe.tipo === "entrada" ? "+" : "−"}{brl(Number(detalhe.valor))}
              </p>
              <dl className="mt-1 divide-y divide-white/[0.06]">
                {[
                  ["Data", fmtDia(detalhe.data)],
                  ["Situação", detalhe.status === "previsto" ? "Ainda vai acontecer" : "Já aconteceu"],
                  ["Categoria", cat(detalhe.categoria_id)?.nome ?? "sem categoria"],
                  ["Conta", conta(detalhe.conta_id)?.nome ?? "—"],
                  ["Cliente", detalhe.cliente_id ? nomeCliente(detalhe.cliente_id) : "—"],
                  ["Registrado por", detalhe.origem === "manual" ? "lançamento manual"
                    : detalhe.origem === "tracker" ? "baixa do Tracker"
                    : detalhe.origem === "recorrente" ? "custo fixo do mês"
                    : "fechamento"],
                  ["Observações", detalhe.observacoes || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-4 py-2">
                    <dt className="text-[12px] text-muted-foreground shrink-0">{k}</dt>
                    <dd className="text-[12.5px] text-right min-w-0 break-words">{v}</dd>
                  </div>
                ))}
              </dl>
              <DialogFooter className="gap-2">
                {detalhe.status === "previsto" && (
                  <Button variant="outline" onClick={() => { confirmar(detalhe); setDetalhe(null); }}>
                    <Check className="h-4 w-4 mr-1.5" /> Confirmar
                  </Button>
                )}
                <Button
                  variant="ghost" className="text-rose-400 hover:text-rose-300"
                  onClick={async () => {
                    const { error } = await (supabase.from("balance_lancamentos" as never) as never as any)
                      .delete().eq("id", detalhe.id);
                    if (error) return toast.error("Erro: " + error.message);
                    toast.success("Lançamento excluído."); setDetalhe(null); inval();
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" /> Excluir
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── nova conta ── */}
      <Dialog open={novaConta} onOpenChange={(o) => !o && setNovaConta(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova conta</DialogTitle>
            <DialogDescription>
              O saldo inicial é o que ela tem hoje. Ele entra no total do escritório.
            </DialogDescription>
          </DialogHeader>
          <FormNovaConta salvando={salvando} onSalvar={async (v) => {
            setSalvando(true);
            const { error } = await (supabase.from("balance_contas" as never) as never as any).insert(v);
            setSalvando(false);
            if (error) return toast.error("Erro: " + error.message);
            toast.success("Conta criada."); setNovaConta(false); inval();
          }} />
        </DialogContent>
      </Dialog>

      {/* ── lançamento ── */}
      <Dialog open={!!novoLanc} onOpenChange={(o) => !o && setNovoLanc(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{novoLanc === "entrada" ? "Nova entrada" : "Nova saída"}</DialogTitle>
            <DialogDescription>
              Marque como "ainda vai acontecer" se for previsão — ele entra no "a vencer".
            </DialogDescription>
          </DialogHeader>
          {novoLanc && (
            <FormLancamento
              tipo={novoLanc}
              contas={contas.filter((c) => c.ativo)}
              categorias={categorias.filter((c) => c.tipo === novoLanc)}
              clientes={clientes}
              salvando={salvando}
              onSalvar={async (v) => {
                setSalvando(true);
                const { error } = await (supabase.from("balance_lancamentos" as never) as never as any)
                  .insert({ ...v, criado_por: user?.id ?? null,
                            pago_em: v.status === "realizado" ? new Date().toISOString() : null });
                setSalvando(false);
                if (error) return toast.error("Erro: " + error.message);
                toast.success("Lançamento registrado."); setNovoLanc(null); inval();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── custo fixo ── */}
      <Dialog open={novoFixo} onOpenChange={(o) => !o && setNovoFixo(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo custo fixo</DialogTitle>
            <DialogDescription>
              Todo mês ele aparece como "a vencer" no dia escolhido, esperando confirmação.
            </DialogDescription>
          </DialogHeader>
          <FormRecorrente contas={contas.filter((c) => c.ativo)} categorias={categorias} salvando={salvando}
            onSalvar={async (v) => {
              setSalvando(true);
              const { error } = await (supabase.from("balance_recorrentes" as never) as never as any).insert(v);
              setSalvando(false);
              if (error) return toast.error("Erro: " + error.message);
              toast.success("Custo fixo criado."); setNovoFixo(false); inval();
            }} />
        </DialogContent>
      </Dialog>

      {/* ── pagar repasse ── */}
      <Dialog open={!!pagando} onOpenChange={(o) => !o && setPagando(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Repassar ao cliente</DialogTitle>
            <DialogDescription>
              {pagando && <>Sai {brl(Number(pagando.valor_devido))} para {nomeCliente(pagando.cliente_id)}.</>}
            </DialogDescription>
          </DialogHeader>
          <FormPagarRepasse contas={contas.filter((c) => c.ativo)} salvando={salvando}
            onSalvar={async (contaId, data) => {
              if (!pagando) return;
              setSalvando(true);
              const { error } = await supabase.rpc("fn_balance_pagar_repasse" as never, {
                p_repasse_id: pagando.id, p_conta_id: contaId, p_data: data, p_editor: user?.id ?? null,
              } as never);
              setSalvando(false);
              if (error) return toast.error("Erro: " + error.message);
              toast.success("Repasse registrado."); setPagando(null); inval();
            }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─────────────────────────── peças ─────────────────────────── */

function LinhaLanc({ l, categoria, conta, onClick, acao }: {
  l: Lancamento; categoria?: Categoria; conta?: Conta;
  onClick: () => void; acao?: React.ReactNode;
}) {
  return (
    <div
      role="button" tabIndex={0} onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      className="w-full flex items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2 text-left cursor-pointer transition-colors hover:border-primary/25 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
    >
      <span className={cn("h-8 w-8 rounded-lg grid place-items-center shrink-0",
        l.tipo === "entrada" ? "bg-emerald-400/10 ring-1 ring-emerald-400/20" : "bg-rose-400/10 ring-1 ring-rose-400/20")}>
        <IconeCat nome={categoria?.icone} className={cn("h-4 w-4", l.tipo === "entrada" ? "text-emerald-400" : "text-rose-400")} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium truncate">{l.descricao}</span>
        <span className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground min-w-0">
          <span className="shrink-0">{fmtDia(l.data)}</span>
          {categoria && <><span className="opacity-40">·</span><span className="truncate">{categoria.nome}</span></>}
          {conta && (
            <span className="shrink-0 rounded px-1.5 py-[1px] bg-white/[0.06] text-muted-foreground/90">
              {conta.nome}
            </span>
          )}
        </span>
      </span>
      <span className={cn("text-[13px] font-semibold tabular-nums shrink-0",
        l.tipo === "entrada" ? "text-emerald-400" : "text-rose-400")}>
        {l.tipo === "entrada" ? "+" : "−"}{brl(Number(l.valor))}
      </span>
      {acao}
    </div>
  );
}

function FormNovaConta({ onSalvar, salvando }: { onSalvar: (v: Record<string, unknown>) => void; salvando: boolean }) {
  const [nome, setNome] = useState("");
  const [instituicao, setInstituicao] = useState("");
  const [tipo, setTipo] = useState("corrente");
  const [saldo, setSaldo] = useState("");
  return (
    <>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Nome da conta</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex: Conta PJ" className="mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Instituição</Label>
            <Input value={instituicao} onChange={(e) => setInstituicao(e.target.value)} placeholder="ex: Itaú" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="corrente">Conta corrente</SelectItem>
                <SelectItem value="poupanca">Poupança</SelectItem>
                <SelectItem value="especie">Dinheiro em espécie</SelectItem>
                <SelectItem value="investimento">Investimento</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs">Saldo de hoje (R$)</Label>
          <Input value={saldo} onChange={(e) => setSaldo(e.target.value)} placeholder="0,00" className="mt-1" />
        </div>
      </div>
      <DialogFooter>
        <Button disabled={salvando || !nome.trim()}
          onClick={() => onSalvar({ nome: nome.trim(), instituicao: instituicao.trim() || null, tipo, saldo_inicial: parseMoneyBR(saldo) || 0 })}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null} Criar conta
        </Button>
      </DialogFooter>
    </>
  );
}

function FormLancamento({ tipo, contas, categorias, clientes, onSalvar, salvando }: {
  tipo: "entrada" | "saida"; contas: Conta[]; categorias: Categoria[];
  clientes: { id: string; nome: string }[];
  onSalvar: (v: Record<string, unknown>) => void; salvando: boolean;
}) {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje());
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [catId, setCatId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [status, setStatus] = useState<"previsto" | "realizado">("realizado");
  const [obs, setObs] = useState("");
  const catSel = categorias.find((c) => c.id === catId);
  const valido = descricao.trim() && (parseMoneyBR(valor) || 0) > 0 && contaId;

  // As categorias judiciais vêm primeiro e separadas: é o dinheiro que nasce de
  // processo, e é ele que amarra o lançamento a um cliente.
  const judiciais = categorias.filter((c) => c.judicial);
  const demais = categorias.filter((c) => !c.judicial);

  return (
    <>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Descrição</Label>
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)}
            placeholder={tipo === "entrada" ? "ex: Alvará do processo X" : "ex: Aluguel de setembro"} className="mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Valor (R$)</Label>
            <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">{status === "previsto" ? "Vencimento" : "Data"}</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="mt-1" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={catId} onValueChange={setCatId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="escolha" /></SelectTrigger>
              <SelectContent>
                {judiciais.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Do processo</div>
                    {judiciais.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <IconeCat nome={c.icone} className="h-3.5 w-3.5" />{c.nome}
                        </span>
                      </SelectItem>
                    ))}
                    <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Do escritório</div>
                  </>
                )}
                {demais.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2">
                      <IconeCat nome={c.icone} className="h-3.5 w-3.5" />{c.nome}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Conta</Label>
            <Select value={contaId} onValueChange={setContaId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="escolha" /></SelectTrigger>
              <SelectContent>
                {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {catSel?.judicial && (
          <div>
            <Label className="text-xs">Cliente <span className="text-muted-foreground">· opcional</span></Label>
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="de quem é esse dinheiro" /></SelectTrigger>
              <SelectContent>
                {clientes.slice(0, 300).map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex gap-2">
          {(["realizado", "previsto"] as const).map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={cn("flex-1 rounded-lg border px-3 py-2 text-[12px] transition-colors",
                status === s ? "border-primary/40 bg-primary/10 text-foreground"
                             : "border-white/[0.08] bg-white/[0.02] text-muted-foreground hover:bg-white/[0.05]")}>
              {s === "realizado" ? "Já aconteceu" : "Ainda vai acontecer"}
            </button>
          ))}
        </div>
        <div>
          <Label className="text-xs">Observações</Label>
          <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className="mt-1" />
        </div>
      </div>
      <DialogFooter>
        <Button disabled={salvando || !valido}
          onClick={() => onSalvar({
            descricao: descricao.trim(), valor: parseMoneyBR(valor), data, status, tipo,
            conta_id: contaId, categoria_id: catId || null, cliente_id: clienteId || null,
            observacoes: obs.trim() || null,
          })}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null} Registrar
        </Button>
      </DialogFooter>
    </>
  );
}

function FormRecorrente({ contas, categorias, onSalvar, salvando }: {
  contas: Conta[]; categorias: Categoria[];
  onSalvar: (v: Record<string, unknown>) => void; salvando: boolean;
}) {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [dia, setDia] = useState("5");
  const [tipo, setTipo] = useState<"entrada" | "saida">("saida");
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [catId, setCatId] = useState("");
  const diaN = Number(dia);
  const valido = descricao.trim() && (parseMoneyBR(valor) || 0) > 0 && contaId && diaN >= 1 && diaN <= 31;
  return (
    <>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Descrição</Label>
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="ex: Aluguel da sala" className="mt-1" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Valor (R$)</Label>
            <Input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Dia do mês</Label>
            <Input value={dia} onChange={(e) => setDia(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => { setTipo(v as "entrada" | "saida"); setCatId(""); }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="saida">Saída</SelectItem>
                <SelectItem value="entrada">Entrada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Conta</Label>
            <Select value={contaId} onValueChange={setContaId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="escolha" /></SelectTrigger>
              <SelectContent>{contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={catId} onValueChange={setCatId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="escolha" /></SelectTrigger>
              <SelectContent>
                {categorias.filter((c) => c.tipo === tipo).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="flex items-center gap-2"><IconeCat nome={c.icone} className="h-3.5 w-3.5" />{c.nome}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Mês que não tem o dia escolhido usa o último dia dele — dia 31 em fevereiro cai no 28.
        </p>
      </div>
      <DialogFooter>
        <Button disabled={salvando || !valido}
          onClick={() => onSalvar({ descricao: descricao.trim(), valor: parseMoneyBR(valor), dia_vencimento: diaN, tipo, conta_id: contaId, categoria_id: catId || null })}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null} Criar
        </Button>
      </DialogFooter>
    </>
  );
}

function FormPagarRepasse({ contas, onSalvar, salvando }: {
  contas: Conta[]; onSalvar: (contaId: string, data: string) => void; salvando: boolean;
}) {
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [data, setData] = useState(hoje());
  return (
    <>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Sai de qual conta</Label>
          <Select value={contaId} onValueChange={setContaId}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="escolha" /></SelectTrigger>
            <SelectContent>{contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Data do repasse</Label>
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="mt-1" />
        </div>
      </div>
      <DialogFooter>
        <Button disabled={salvando || !contaId} onClick={() => onSalvar(contaId, data)}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null} Confirmar repasse
        </Button>
      </DialogFooter>
    </>
  );
}
