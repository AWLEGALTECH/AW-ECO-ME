// WALLET — o caixa do escritório.
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
//
// O MÊS É O PARÂMETRO PRINCIPAL. O escritório fecha as contas por mês, então a
// tela abre no mês corrente e a navegação é mês a mês, com o nome dele em
// destaque em cima da lista. Os outros recortes (90 dias, tudo, intervalo
// livre) continuam existindo, mas como exceção — não como o jeito normal de
// olhar.

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
  UserCheck, Search, CalendarRange, Tag, X, Hammer, Coffee, ChevronLeft, ChevronRight,
} from "lucide-react";
import { LogoBanco } from "@/components/LogoBanco";
import { mesAtual, mesDeslocado, mesPorExtenso, janelaDoMes } from "@/lib/mesRef";
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
  UserCheck, Hammer, Coffee,
};
const IconeCat = ({ nome, className }: { nome?: string | null; className?: string }) => {
  const C = (nome && ICONES[nome]) || CircleDashed;
  return <C className={className} />;
};

interface Conta {
  id: string; nome: string; tipo: string; instituicao: string | null;
  // slug da instituição; a tela usa pra escolher a marca na linha
  banco: string | null;
  saldo_inicial: number; ativo: boolean;
}
interface Categoria {
  id: string; nome: string; tipo: "entrada" | "saida"; grupo: string | null;
  fixa: boolean; icone: string | null; judicial: boolean;
}
interface Lancamento {
  id: string; conta_id: string; categoria_id: string | null;
  tipo: "entrada" | "saida"; valor: number; data: string;
  status: "previsto" | "realizado"; descricao: string; observacoes: string | null;
  cliente_id: string | null; processo_id: string | null; origem: string;
  // pro custo fixo, origem='recorrente' e origem_ref='<id do fixo>|YYYY-MM'.
  // É o que amarra o lançamento ao fixo que o gerou, sem casar por descrição.
  origem_ref: string | null;
  created_at: string;
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
/* "mes" agora é o mês NAVEGADO (mesRef), não "este mês": é o recorte padrão. */
type Periodo = "mes" | "90" | "tudo" | "livre";

export default function WalletPage() {
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
  const [mesRef, setMesRef] = useState<string>(mesAtual());
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [busca, setBusca] = useState("");
  const [catFiltro, setCatFiltro] = useState<string>("todas");

  // Andar no mês é o gesto principal: mexer nas setas devolve o recorte pro
  // mês, mesmo que a pessoa tenha ido pra "90 dias" ou pro intervalo livre.
  const andarMes = (passos: number) => {
    setMesRef((r) => mesDeslocado(r, passos));
    setPeriodo("mes");
  };

  const janela = useMemo(() => {
    const h = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    if (periodo === "mes") return janelaDoMes(mesRef);
    if (periodo === "90") return { de: iso(new Date(h.getTime() - 90 * 86400000)), ate: iso(h) };
    if (periodo === "livre") return { de: de || "0000-01-01", ate: ate || "9999-12-31" };
    return { de: "0000-01-01", ate: "9999-12-31" };
  }, [periodo, mesRef, de, ate]);

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

  /* ── custos fixos, lidos pela régua que está em vigor ──
     Quando a régua é UM MÊS, a pergunta é binária: pagou ou não pagou aquele
     mês. Quando é um intervalo (90 dias, tudo, escolher), essa pergunta não
     tem resposta única — três meses podem ter dois pagos e um em aberto — e aí
     a coluna vira o TOTAL pago no período, com quantos meses ele cobre.

     A ligação com o lançamento é pelo `origem_ref` que a materialização grava
     ('<id do fixo>|YYYY-MM'), nunca pela descrição: dois fixos podem se chamar
     igual, e renomear um não pode reescrever o histórico do outro. */
  const fixos = useMemo(() => {
    const porMes = periodo === "mes";
    const linhas = recorrentes.map((r) => {
      const meus = lancamentos.filter((l) => l.origem === "recorrente"
        && (l.origem_ref ?? "").startsWith(`${r.id}|`));

      if (porMes) {
        const doMes = meus.find((l) => l.origem_ref === `${r.id}|${mesRef}`);
        return {
          r,
          modo: "mes" as const,
          // sem lançamento no mês o fixo ainda não foi gerado — é diferente de
          // estar em aberto, e a tela diz qual dos dois é
          estado: !doMes ? ("nao_gerado" as const)
                : doMes.status === "realizado" ? ("pago" as const)
                : ("aberto" as const),
          lancamento: doMes,
          total: doMes && doMes.status === "realizado" ? Number(doMes.valor) : 0,
          meses: 0,
        };
      }

      const noPeriodo = meus.filter((l) => l.data >= janela.de && l.data <= janela.ate);
      const pagos = noPeriodo.filter((l) => l.status === "realizado");
      return {
        r,
        modo: "periodo" as const,
        estado: "total" as const,
        lancamento: undefined,
        total: pagos.reduce((a, l) => a + Number(l.valor), 0),
        meses: pagos.length,
        emAberto: noPeriodo.filter((l) => l.status === "previsto").length,
      };
    });

    const ativos = linhas.filter((f) => f.r.ativo);
    return {
      porMes,
      linhas,
      // o compromisso do mês: quanto os fixos ativos custam por mês
      mensal: ativos.reduce((a, f) => a + Number(f.r.valor), 0),
      pago: linhas.reduce((a, f) => a + f.total, 0),
      emAberto: porMes
        ? ativos.filter((f) => f.estado !== "pago").reduce((a, f) => a + Number(f.r.valor), 0)
        : 0,
    };
  }, [recorrentes, lancamentos, periodo, mesRef, janela]);

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
    /* Sem largura máxima e sem padding próprio: o SidebarLayout já dá o
       respiro, e o Tracker — que é a régua de formatação da casa — ocupa a
       tela inteira. Wallet fazia os dois, e por isso vinha estreito e
       centralizado enquanto o resto do app é largo. */
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
        <h2 className="font-display text-3xl font-medium tracking-tight">Wallet</h2>
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
          {/* ── o saldo e os fixos, lado a lado ──
              O saldo sozinho virava uma barra larga e vazia. Ao lado dele vai
              o compromisso do mês, que é a outra metade da mesma pergunta:
              quanto tem, e quanto já está comprometido. */}
          <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr] items-stretch">
            <SpotlightCard className="p-6 md:p-7">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Em conta</p>
              <p className={cn(
                "font-display text-3xl md:text-4xl font-semibold tabular-nums tracking-tight leading-none mt-2",
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

            {/* ── o compromisso do mês ── */}
            <SpotlightCard className="p-5 flex flex-col">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  <Repeat className="h-3.5 w-3.5" /> Custos fixos
                </p>
                <span className="text-[10.5px] text-muted-foreground/80">
                  {fixos.porMes ? mesPorExtenso(mesRef).nome : "no período"}
                </span>
              </div>

              <p className="font-display text-2xl font-semibold tabular-nums leading-none mt-2">
                {brl(fixos.mensal)}
                <span className="text-[11px] font-normal text-muted-foreground ml-1.5">/mês</span>
              </p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[12px]">
                <span className="text-muted-foreground">
                  <span className="font-semibold tabular-nums text-emerald-400">{brl(fixos.pago)}</span> pago
                </span>
                {fixos.porMes && (
                  <span className="text-muted-foreground">
                    <span className={cn("font-semibold tabular-nums",
                      fixos.emAberto > 0 ? "text-amber-300" : "text-foreground/70")}>
                      {brl(fixos.emAberto)}
                    </span>{" "}
                    em aberto
                  </span>
                )}
              </div>

              {/* a lista curta, com o ícone de cada um */}
              <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1.5 flex-1">
                {fixos.linhas.slice(0, 4).map((f) => (
                  <div key={f.r.id} className="flex items-center gap-2 min-w-0">
                    <IconeCat nome={cat(f.r.categoria_id)?.icone} className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-[12px] truncate min-w-0 flex-1">{f.r.descricao}</span>
                    <span className={cn("text-[11.5px] tabular-nums shrink-0",
                      f.estado === "pago" ? "text-emerald-400" : "text-muted-foreground")}>
                      {brl(Number(f.r.valor))}
                    </span>
                  </div>
                ))}
                {fixos.linhas.length === 0 && (
                  <p className="text-[12px] text-muted-foreground">Nenhum custo fixo cadastrado.</p>
                )}
              </div>

              <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => setAba("fixos")}>
                {fixos.linhas.length > 4
                  ? `Ver os ${fixos.linhas.length} custos fixos`
                  : "Abrir custos fixos"}
              </Button>
            </SpotlightCard>
          </div>

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
              {/* ── o mês, que é o recorte principal ── */}
              <NavegadorDeMes
                mesRef={mesRef}
                ativo={periodo === "mes"}
                onAndar={andarMes}
                onVoltarAoMes={() => setPeriodo("mes")}
              />

              {/* filtros */}
              <SpotlightCard className="p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <CalendarRange className="h-4 w-4 text-muted-foreground shrink-0" />
                  {([["mes", "Mês"], ["90", "90 dias"], ["tudo", "Tudo"], ["livre", "Escolher"]] as [Periodo, string][])
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
                      {/* o ícone junto do nome: é aqui que se aprende qual
                          desenho é qual categoria antes de filtrar por ela */}
                      {categorias.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="flex items-center gap-2">
                            <IconeCat nome={c.icone}
                              className={cn("h-3.5 w-3.5", c.tipo === "entrada" ? "text-emerald-400" : "text-rose-400")} />
                            {c.nome}
                          </span>
                        </SelectItem>
                      ))}
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
                        key={l.id} l={l} categoria={cat(l.categoria_id)}
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
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h2 className="text-sm font-semibold">Realizado</h2>
                  {/* o cabeçalho das colunas, pra categoria ler como coluna e
                      não como um chip solto no meio da linha */}
                  {realizados.length > 0 && (
                    <span className="hidden sm:flex items-center gap-3 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 pr-3">
                      <span className="w-[10.5rem]">Categoria</span>
                      <span className="w-[6.5rem] text-right">Valor</span>
                    </span>
                  )}
                </div>
                {realizados.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    Nenhum lançamento neste período.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {realizados.map((l) => (
                      <LinhaLanc key={l.id} l={l} categoria={cat(l.categoria_id)}
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
            <div className="space-y-4">
              {/* a mesma régua do movimento manda aqui */}
              <NavegadorDeMes
                mesRef={mesRef}
                ativo={periodo === "mes"}
                onAndar={andarMes}
                onVoltarAoMes={() => setPeriodo("mes")}
              />

              <SpotlightCard className="p-4 md:p-5">
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
                  {/* gera o mês que está sendo olhado, não "hoje": quem
                      navegou até julho quer fechar julho */}
                  <Button size="sm" variant="outline"
                    onClick={async () => {
                      const alvo = periodo === "mes" ? mesRef : mesAtual();
                      const { data, error } = await supabase.rpc(
                        "fn_balance_materializar_recorrentes" as never,
                        { p_mes: `${alvo}-01` } as never,
                      );
                      if (error) return toast.error("Erro: " + error.message);
                      const n = (data as any)?.criados ?? 0;
                      const nome = mesPorExtenso(alvo).nome.toLowerCase();
                      toast.success(n > 0 ? `${n} lançamento(s) gerado(s) para ${nome}.` : `${mesPorExtenso(alvo).nome} já estava gerado.`);
                      inval();
                    }}>
                    Gerar {periodo === "mes" ? mesPorExtenso(mesRef).nome.toLowerCase() : "este mês"}
                  </Button>
                  <Button size="sm" onClick={() => setNovoFixo(true)}><Plus className="h-4 w-4 mr-1.5" /> Novo</Button>
                </div>
              </div>
              {/* o compromisso do mês, antes da tabela */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 mb-4">
                <MiniNumero
                  icone={<Repeat className="h-3.5 w-3.5" />}
                  rotulo="Por mês"
                  valor={brl(fixos.mensal)}
                />
                <MiniNumero
                  icone={<Check className="h-3.5 w-3.5" />}
                  rotulo={fixos.porMes ? "Pago no mês" : "Total pago no período"}
                  valor={brl(fixos.pago)}
                  tom="emerald"
                  nota={!fixos.porMes ? `${fixos.linhas.reduce((a, f) => a + f.meses, 0)} pagamento(s)` : undefined}
                />
                {fixos.porMes && (
                  <MiniNumero
                    icone={<CalendarRange className="h-3.5 w-3.5" />}
                    rotulo="Falta pagar"
                    valor={brl(fixos.emAberto)}
                    tom={fixos.emAberto > 0 ? "amber" : "muted"}
                  />
                )}
              </div>

              {recorrentes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">Nenhum custo fixo cadastrado.</p>
              ) : (
                <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full min-w-[34rem] border-collapse">
                    <thead>
                      <tr className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground/80">
                        <th className="text-left font-medium pb-2 pl-1">Custo</th>
                        <th className="text-right font-medium pb-2 w-[7.5rem]">Valor</th>
                        <th className="text-right font-medium pb-2 w-[11rem] pr-1">
                          {fixos.porMes ? mesPorExtenso(mesRef).nome : "Total no período"}
                        </th>
                        <th className="w-9" />
                      </tr>
                    </thead>
                    <tbody>
                      {fixos.linhas.map((f) => (
                        <tr
                          key={f.r.id}
                          className="border-t border-white/[0.06] group hover:bg-white/[0.025] transition-colors"
                        >
                          <td className="py-2.5 pl-1">
                            <span className="flex items-center gap-2.5 min-w-0">
                              <span className="h-8 w-8 rounded-lg bg-white/[0.05] ring-1 ring-white/10 grid place-items-center shrink-0">
                                <IconeCat nome={cat(f.r.categoria_id)?.icone} className="h-4 w-4 text-muted-foreground" />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-[13px] font-medium truncate">{f.r.descricao}</span>
                                <span className="block text-[11px] text-muted-foreground truncate">
                                  todo dia {f.r.dia_vencimento}
                                  {cat(f.r.categoria_id) && ` · ${cat(f.r.categoria_id)!.nome}`}
                                  {!f.r.ativo && " · pausado"}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td className={cn("text-right text-[13px] font-semibold tabular-nums",
                            f.r.tipo === "entrada" ? "text-emerald-400" : "text-foreground")}>
                            {brl(Number(f.r.valor))}
                          </td>
                          <td className="text-right pr-1">
                            <StatusFixo
                              f={f}
                              onConfirmar={f.lancamento ? () => confirmar(f.lancamento!) : undefined}
                            />
                          </td>
                          <td className="text-right">
                            <Button size="sm" variant="ghost"
                              className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                              aria-label={`Remover ${f.r.descricao}`}
                              onClick={async () => {
                                const { error } = await (supabase.from("balance_recorrentes" as never) as never as any).delete().eq("id", f.r.id);
                                if (error) return toast.error("Erro: " + error.message);
                                toast.success("Custo fixo removido."); inval();
                              }}>
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Um mês sem nada gerado não é um mês sem custo: é um mês que
                  ninguém materializou ainda. Dizer isso evita ler a coluna
                  vazia como "não devo nada". */}
              {fixos.porMes && recorrentes.length > 0
                && fixos.linhas.every((f) => f.estado === "nao_gerado") && (
                <p className="text-[12px] text-muted-foreground mt-3 pt-3 border-t border-white/[0.06]">
                  Nenhum fixo foi gerado em {mesPorExtenso(mesRef).nome.toLowerCase()} ainda.
                  Clique em <span className="text-foreground">Gerar {mesPorExtenso(mesRef).nome.toLowerCase()}</span>{" "}
                  pra eles virarem "a vencer" e a coluna passar a responder pago ou em aberto.
                  {mesRef === "2026-08" && (
                    <> Em agosto, cuidado: o mês já entrou inteiro pelo extrato do banco, então
                    gerar aqui lançaria de novo o que já está na lista.</>
                  )}
                </p>
              )}
              </SpotlightCard>
            </div>
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
                      <span className="h-8 w-8 rounded-lg bg-white/[0.05] grid place-items-center shrink-0">
                        <LogoBanco banco={c.banco} nome={c.nome} tamanho="md" />
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

/* O mês em corpo grande, com as setas dos lados: é o título do que está sendo
   olhado, não mais um filtro. Quando o recorte em vigor é outro (90 dias,
   tudo, intervalo livre), o nome esmaece e um toque devolve o mês — assim a
   pessoa nunca fica olhando "Agosto" enquanto a lista mostra o ano inteiro. */
function NavegadorDeMes({ mesRef, ativo, onAndar, onVoltarAoMes }: {
  mesRef: string; ativo: boolean;
  onAndar: (passos: number) => void; onVoltarAoMes: () => void;
}) {
  const { nome, ano } = mesPorExtenso(mesRef);
  const ehAtual = mesRef === mesAtual();
  return (
    <div className="flex items-center justify-center gap-1">
      <Button
        variant="ghost" size="icon" className="h-9 w-9 shrink-0"
        onClick={() => onAndar(-1)} aria-label="Mês anterior"
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>

      <button
        onClick={onVoltarAoMes}
        className={cn(
          "px-3 py-1 rounded-lg text-center transition-opacity min-w-[11rem]",
          ativo ? "cursor-default" : "opacity-45 hover:opacity-80",
        )}
        aria-label={ativo ? undefined : "Voltar a filtrar por mês"}
      >
        <span className="block text-xl md:text-2xl font-bold tracking-tight leading-none">
          {nome}
        </span>
        <span className="block text-[11px] text-muted-foreground tabular-nums mt-0.5">
          {ano}{ehAtual && ativo && " · mês corrente"}
          {!ativo && " · toque pra usar"}
        </span>
      </button>

      <Button
        variant="ghost" size="icon" className="h-9 w-9 shrink-0"
        onClick={() => onAndar(1)} aria-label="Próximo mês"
      >
        <ChevronRight className="h-5 w-5" />
      </Button>
    </div>
  );
}

/* Número pequeno com ícone, pros resumos de custo fixo. */
function MiniNumero({ icone, rotulo, valor, tom = "muted", nota }: {
  icone: React.ReactNode; rotulo: string; valor: string;
  tom?: "muted" | "emerald" | "amber"; nota?: string;
}) {
  const cor = tom === "emerald" ? "text-emerald-400"
            : tom === "amber" ? "text-amber-300"
            : "text-foreground";
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
        <span className="text-muted-foreground/70">{icone}</span>{rotulo}
      </p>
      <p className={cn("font-display text-lg font-semibold tabular-nums leading-none mt-1.5", cor)}>{valor}</p>
      {nota && <p className="text-[10.5px] text-muted-foreground mt-1">{nota}</p>}
    </div>
  );
}

/* A coluna que muda de pergunta conforme a régua.
   Num mês: pagou, está em aberto, ou nem foi gerado ainda.
   Num intervalo: quanto foi pago no total e em quantos meses — porque
   "pago/não pago" não tem resposta única quando são vários meses. */
function StatusFixo({ f, onConfirmar }: {
  f: {
    modo: "mes" | "periodo";
    estado: "pago" | "aberto" | "nao_gerado" | "total";
    lancamento?: { data: string };
    total: number; meses: number; emAberto?: number;
  };
  onConfirmar?: () => void;
}) {
  if (f.modo === "periodo") {
    return (
      <span className="inline-block text-right">
        <span className={cn("block text-[13px] font-semibold tabular-nums",
          f.total > 0 ? "text-emerald-400" : "text-muted-foreground")}>
          {brl(f.total)}
        </span>
        <span className="block text-[10.5px] text-muted-foreground">
          {f.meses === 0 ? "nada pago" : `${f.meses} mês(es)`}
          {f.emAberto ? ` · ${f.emAberto} em aberto` : ""}
        </span>
      </span>
    );
  }

  if (f.estado === "pago") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 ring-1 ring-emerald-400/25 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
        <Check className="h-3 w-3" />
        Pago {f.lancamento && <span className="opacity-70 tabular-nums">{fmtDia(f.lancamento.data).slice(0, 5)}</span>}
      </span>
    );
  }

  if (f.estado === "aberto") {
    return (
      <button
        onClick={onConfirmar}
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 ring-1 ring-amber-400/25 px-2.5 py-1 text-[11px] font-medium text-amber-300 hover:bg-amber-400/20 transition-colors"
      >
        <CalendarRange className="h-3 w-3" /> Em aberto · dar baixa
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] ring-1 ring-white/10 px-2.5 py-1 text-[11px] text-muted-foreground">
      <CircleDashed className="h-3 w-3" /> Não gerado
    </span>
  );
}

function LinhaLanc({ l, categoria, onClick, acao }: {
  l: Lancamento; categoria?: Categoria;
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
          {/* em tela estreita a coluna de categoria não cabe; aqui ela volta */}
          {categoria && <span className="sm:hidden truncate"><span className="opacity-40 mr-1">·</span>{categoria.nome}</span>}
        </span>
      </span>

      {/* COLUNA DA CATEGORIA. O ícone sozinho não se explica — um martelo, um
          café e um megafone só querem dizer alguma coisa depois que alguém te
          conta. Aqui o nome anda junto do mesmo ícone da esquerda, na mesma
          altura em todas as linhas, então dá pra aprender a legenda lendo a
          coluna de cima a baixo. */}
      <span className="hidden sm:flex items-center gap-1.5 shrink-0 w-[10.5rem] min-w-0">
        {categoria ? (
          <>
            <IconeCat nome={categoria.icone} className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
            <span className="text-[11.5px] text-muted-foreground truncate">{categoria.nome}</span>
          </>
        ) : (
          <span className="text-[11.5px] text-muted-foreground/50">sem categoria</span>
        )}
      </span>

      {/* largura fixa pro valor: sem isso as colunas dançam de linha em linha
          e o cabeçalho não bate com nada */}
      <span className={cn("text-[13px] font-semibold tabular-nums shrink-0 sm:w-[6.5rem] sm:text-right",
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
  const [banco, setBanco] = useState("outro");
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
            <Label className="text-xs">Banco</Label>
            <Select value={banco} onValueChange={setBanco}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {([
                  ["caixa", "Caixa"], ["itau", "Itaú"], ["bb", "Banco do Brasil"],
                  ["bradesco", "Bradesco"], ["nubank", "Nubank"],
                  ["especie", "Espécie"], ["outro", "Outro"],
                ] as [string, string][]).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    <span className="flex items-center gap-2">
                      <LogoBanco banco={k} nome={label} />{label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Instituição</Label>
            <Input value={instituicao} onChange={(e) => setInstituicao(e.target.value)}
              placeholder="ex: Caixa Econômica Federal" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Saldo de hoje (R$)</Label>
            <Input value={saldo} onChange={(e) => setSaldo(e.target.value)} placeholder="0,00" className="mt-1" />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button disabled={salvando || !nome.trim()}
          onClick={() => onSalvar({
            nome: nome.trim(),
            instituicao: instituicao.trim() || null,
            banco: banco === "outro" ? null : banco,
            tipo,
            saldo_inicial: parseMoneyBR(saldo) || 0,
          })}>
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
