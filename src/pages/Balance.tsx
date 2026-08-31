// BALANCE — o caixa do escritório.
//
// A ideia que organiza a tela: nem todo dinheiro que está na conta é do
// escritório. Um alvará entra inteiro, mas parte dele é do cliente e fica
// parada aqui até alguém decidir repassar. Por isso o topo não mostra "saldo",
// mostra três números — o que tem em conta, o que é de cliente, e o que sobra.
// Confundir os dois é como o escritório gasta dinheiro que não é dele.
//
// O resto segue o que foi combinado: regime de caixa com previsto (o lançamento
// nasce previsto ou realizado), várias contas com saldo próprio, e custos fixos
// que se materializam sozinhos todo mês.

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
  Wallet, Plus, ArrowUpRight, ArrowDownRight, Loader2, Landmark, HandCoins,
  Repeat, Check, CalendarClock, Trash2, PiggyBank, Users,
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

interface Conta { id: string; nome: string; tipo: string; instituicao: string | null; saldo_inicial: number; ativo: boolean }
interface Categoria { id: string; nome: string; tipo: "entrada" | "saida"; grupo: string | null; fixa: boolean }
interface Lancamento {
  id: string; conta_id: string; categoria_id: string | null;
  tipo: "entrada" | "saida"; valor: number; data: string;
  status: "previsto" | "realizado"; descricao: string;
  cliente_id: string | null; processo_id: string | null; origem: string;
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

export default function Balance() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>("movimento");

  const inval = () => {
    qc.invalidateQueries({ queryKey: ["balance"] });
  };

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
        .select("*").order("data", { ascending: false }).limit(400);
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

  /* ── os três números do topo ──────────────────────────────────────────────
     Em conta: saldo inicial das contas + tudo que já foi realizado.
     De cliente: repasses pendentes — está na conta, mas não é do escritório.
     Do escritório: a diferença. É este o número que decide se dá pra gastar. */
  const resumo = useMemo(() => {
    const inicial = contas.filter((c) => c.ativo).reduce((a, c) => a + Number(c.saldo_inicial || 0), 0);
    const movimento = lancamentos
      .filter((l) => l.status === "realizado")
      .reduce((a, l) => a + (l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)), 0);
    const emConta = inicial + movimento;
    const deCliente = repasses.filter((r) => r.status === "pendente").reduce((a, r) => a + Number(r.valor_devido), 0);
    const previstoEntra = lancamentos.filter((l) => l.status === "previsto" && l.tipo === "entrada")
      .reduce((a, l) => a + Number(l.valor), 0);
    const previstoSai = lancamentos.filter((l) => l.status === "previsto" && l.tipo === "saida")
      .reduce((a, l) => a + Number(l.valor), 0);
    return { emConta, deCliente, doEscritorio: emConta - deCliente, previstoEntra, previstoSai };
  }, [contas, lancamentos, repasses]);

  const saldoDaConta = (contaId: string) => {
    const c = contas.find((x) => x.id === contaId);
    const base = Number(c?.saldo_inicial || 0);
    return base + lancamentos
      .filter((l) => l.conta_id === contaId && l.status === "realizado")
      .reduce((a, l) => a + (l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)), 0);
  };

  const repassesPendentes = repasses.filter((r) => r.status === "pendente");
  const previstos = lancamentos.filter((l) => l.status === "previsto")
    .sort((a, b) => a.data.localeCompare(b.data));

  /* ── diálogos ── */
  const [novaConta, setNovaConta] = useState(false);
  const [novoLanc, setNovoLanc] = useState<null | "entrada" | "saida">(null);
  const [novoFixo, setNovoFixo] = useState(false);
  const [pagando, setPagando] = useState<Repasse | null>(null);
  const [salvando, setSalvando] = useState(false);

  const semConta = !loadContas && contas.length === 0;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* cabeçalho */}
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <Wallet className="h-6 w-6 text-primary" /> Balance
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Entradas e saídas do escritório. O dinheiro de cliente aparece separado do que é seu.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setNovoLanc("entrada")} disabled={semConta}>
            <ArrowUpRight className="h-4 w-4 mr-1.5 text-emerald-400" /> Entrada
          </Button>
          <Button variant="outline" size="sm" onClick={() => setNovoLanc("saida")} disabled={semConta}>
            <ArrowDownRight className="h-4 w-4 mr-1.5 text-rose-400" /> Saída
          </Button>
        </div>
      </motion.div>

      {semConta ? (
        <SpotlightCard className="p-8 text-center">
          <Landmark className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-base font-semibold">Cadastre a primeira conta</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Todo lançamento sai ou entra de algum lugar. Comece pela conta onde o dinheiro do
            escritório fica, com o saldo que ela tem hoje.
          </p>
          <Button className="mt-4" onClick={() => setNovaConta(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nova conta
          </Button>
        </SpotlightCard>
      ) : (
        <>
          {/* os três números */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Cartao
              titulo="Em conta"
              valor={resumo.emConta}
              nota="soma de todas as contas"
              icone={<Landmark className="h-4 w-4" />}
            />
            <Cartao
              titulo="É de cliente"
              valor={resumo.deCliente}
              nota={repassesPendentes.length ? `${repassesPendentes.length} repasse(s) a fazer` : "nada a repassar"}
              icone={<Users className="h-4 w-4" />}
              tom={resumo.deCliente > 0 ? "alerta" : "neutro"}
            />
            <Cartao
              titulo="Do escritório"
              valor={resumo.doEscritorio}
              nota="o que dá pra usar"
              icone={<PiggyBank className="h-4 w-4" />}
              destaque
            />
          </div>

          {/* abas */}
          <div className="flex gap-1.5 flex-wrap">
            {([
              ["movimento", "Movimento", lancamentos.length],
              ["repasses", "Repasses", repassesPendentes.length],
              ["fixos", "Custos fixos", recorrentes.filter((r) => r.ativo).length],
              ["contas", "Contas", contas.length],
            ] as [Aba, string, number][]).map(([k, label, n]) => (
              <button
                key={k}
                onClick={() => setAba(k)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors border",
                  aba === k
                    ? "bg-primary/12 border-primary/30 text-foreground"
                    : "bg-white/[0.02] border-white/[0.06] text-muted-foreground hover:bg-white/[0.05]",
                )}
              >
                {label}
                {n > 0 && <span className="ml-1.5 text-[11px] opacity-60 tabular-nums">{n}</span>}
              </button>
            ))}
          </div>

          {aba === "movimento" && (
            <div className="space-y-4">
              {previstos.length > 0 && (
                <SpotlightCard className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CalendarClock className="h-4 w-4 text-amber-300" />
                    <h2 className="text-sm font-semibold">A vencer</h2>
                    <span className="text-[11px] text-muted-foreground">
                      {brl(resumo.previstoEntra)} a receber · {brl(resumo.previstoSai)} a pagar
                    </span>
                  </div>
                  <div className="space-y-1">
                    {previstos.slice(0, 12).map((l) => (
                      <LinhaLanc
                        key={l.id} l={l} contas={contas} categorias={categorias}
                        acao={
                          <Button
                            size="sm" variant="ghost" className="h-7 text-[11px]"
                            onClick={async () => {
                              const { error } = await (supabase.from("balance_lancamentos" as never) as never as any)
                                .update({ status: "realizado", pago_em: new Date().toISOString() }).eq("id", l.id);
                              if (error) return toast.error("Erro: " + error.message);
                              toast.success(l.tipo === "entrada" ? "Entrada confirmada." : "Pagamento confirmado.");
                              inval();
                            }}
                          >
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
                {lancamentos.filter((l) => l.status === "realizado").length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    Nenhum lançamento ainda.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {lancamentos.filter((l) => l.status === "realizado").slice(0, 60).map((l) => (
                      <LinhaLanc key={l.id} l={l} contas={contas} categorias={categorias} />
                    ))}
                  </div>
                )}
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
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Nenhum repasse pendente.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {repassesPendentes.map((r) => {
                    const dias = Math.floor(
                      (Date.now() - new Date(r.created_at).getTime()) / 86400000,
                    );
                    return (
                      <div
                        key={r.id}
                        className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                      >
                        <span className="h-8 w-8 rounded-lg bg-amber-400/10 ring-1 ring-amber-400/25 grid place-items-center shrink-0">
                          <HandCoins className="h-4 w-4 text-amber-300" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium truncate">{nomeCliente(r.cliente_id)}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            esperando há {dias === 0 ? "menos de um dia" : `${dias} dia${dias === 1 ? "" : "s"}`}
                          </span>
                        </span>
                        <span className="text-[13px] font-semibold tabular-nums shrink-0">
                          {brl(Number(r.valor_devido))}
                        </span>
                        <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => setPagando(r)}>
                          Repassar
                        </Button>
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
                  <Button
                    size="sm" variant="outline"
                    onClick={async () => {
                      const { data, error } = await supabase.rpc("fn_balance_materializar_recorrentes" as never, {} as never);
                      if (error) return toast.error("Erro: " + error.message);
                      const n = (data as any)?.criados ?? 0;
                      toast.success(n > 0 ? `${n} lançamento(s) gerado(s) para este mês.` : "Este mês já estava gerado.");
                      inval();
                    }}
                  >
                    Gerar este mês
                  </Button>
                  <Button size="sm" onClick={() => setNovoFixo(true)}>
                    <Plus className="h-4 w-4 mr-1.5" /> Novo
                  </Button>
                </div>
              </div>
              {recorrentes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Nenhum custo fixo cadastrado.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {recorrentes.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium truncate">{r.descricao}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          todo dia {r.dia_vencimento} · {contas.find((c) => c.id === r.conta_id)?.nome ?? "—"}
                          {!r.ativo && " · pausado"}
                        </span>
                      </span>
                      <span className={cn("text-[13px] font-semibold tabular-nums shrink-0",
                        r.tipo === "entrada" ? "text-emerald-400" : "text-rose-400")}>
                        {r.tipo === "entrada" ? "+" : "−"}{brl(Number(r.valor))}
                      </span>
                      <Button
                        size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0"
                        onClick={async () => {
                          const { error } = await (supabase.from("balance_recorrentes" as never) as never as any)
                            .delete().eq("id", r.id);
                          if (error) return toast.error("Erro: " + error.message);
                          toast.success("Custo fixo removido.");
                          inval();
                        }}
                      >
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
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-sm font-semibold">Contas</h2>
                <Button size="sm" onClick={() => setNovaConta(true)}>
                  <Plus className="h-4 w-4 mr-1.5" /> Nova conta
                </Button>
              </div>
              <div className="space-y-1.5">
                {contas.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                    <span className="h-8 w-8 rounded-lg bg-primary/10 ring-1 ring-primary/20 grid place-items-center shrink-0">
                      <Landmark className="h-4 w-4 text-primary" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium truncate">{c.nome}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {c.instituicao || c.tipo}{!c.ativo && " · inativa"}
                      </span>
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums shrink-0">
                      {brl(saldoDaConta(c.id))}
                    </span>
                  </div>
                ))}
              </div>
            </SpotlightCard>
          )}
        </>
      )}

      {/* ── diálogo: nova conta ── */}
      <Dialog open={novaConta} onOpenChange={(o) => !o && setNovaConta(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova conta</DialogTitle>
            <DialogDescription>
              O saldo inicial é o que a conta tem hoje. A partir dele o Balance soma os lançamentos.
            </DialogDescription>
          </DialogHeader>
          <FormNovaConta
            salvando={salvando}
            onSalvar={async (v) => {
              setSalvando(true);
              const { error } = await (supabase.from("balance_contas" as never) as never as any).insert(v);
              setSalvando(false);
              if (error) return toast.error("Erro: " + error.message);
              toast.success("Conta criada.");
              setNovaConta(false); inval();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* ── diálogo: lançamento ── */}
      <Dialog open={!!novoLanc} onOpenChange={(o) => !o && setNovoLanc(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{novoLanc === "entrada" ? "Nova entrada" : "Nova saída"}</DialogTitle>
            <DialogDescription>
              Marque como previsto se ainda não aconteceu — ele entra no "a vencer".
            </DialogDescription>
          </DialogHeader>
          {novoLanc && (
            <FormLancamento
              tipo={novoLanc}
              contas={contas.filter((c) => c.ativo)}
              categorias={categorias.filter((c) => c.tipo === novoLanc)}
              salvando={salvando}
              onSalvar={async (v) => {
                setSalvando(true);
                const { error } = await (supabase.from("balance_lancamentos" as never) as never as any)
                  .insert({ ...v, criado_por: user?.id ?? null,
                            pago_em: v.status === "realizado" ? new Date().toISOString() : null });
                setSalvando(false);
                if (error) return toast.error("Erro: " + error.message);
                toast.success("Lançamento registrado.");
                setNovoLanc(null); inval();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── diálogo: custo fixo ── */}
      <Dialog open={novoFixo} onOpenChange={(o) => !o && setNovoFixo(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo custo fixo</DialogTitle>
            <DialogDescription>
              Todo mês ele aparece como "a vencer" no dia escolhido, esperando confirmação.
            </DialogDescription>
          </DialogHeader>
          <FormRecorrente
            contas={contas.filter((c) => c.ativo)}
            categorias={categorias}
            salvando={salvando}
            onSalvar={async (v) => {
              setSalvando(true);
              const { error } = await (supabase.from("balance_recorrentes" as never) as never as any).insert(v);
              setSalvando(false);
              if (error) return toast.error("Erro: " + error.message);
              toast.success("Custo fixo criado.");
              setNovoFixo(false); inval();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* ── diálogo: pagar repasse ── */}
      <Dialog open={!!pagando} onOpenChange={(o) => !o && setPagando(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Repassar ao cliente</DialogTitle>
            <DialogDescription>
              {pagando && <>Sai {brl(Number(pagando.valor_devido))} para {nomeCliente(pagando.cliente_id)}.</>}
            </DialogDescription>
          </DialogHeader>
          <FormPagarRepasse
            contas={contas.filter((c) => c.ativo)}
            salvando={salvando}
            onSalvar={async (contaId, data) => {
              if (!pagando) return;
              setSalvando(true);
              const { error } = await supabase.rpc("fn_balance_pagar_repasse" as never, {
                p_repasse_id: pagando.id, p_conta_id: contaId, p_data: data, p_editor: user?.id ?? null,
              } as never);
              setSalvando(false);
              if (error) return toast.error("Erro: " + error.message);
              toast.success("Repasse registrado.");
              setPagando(null); inval();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─────────────────────────── peças ─────────────────────────── */

function Cartao({ titulo, valor, nota, icone, destaque, tom = "neutro" }: {
  titulo: string; valor: number; nota: string; icone: React.ReactNode;
  destaque?: boolean; tom?: "neutro" | "alerta";
}) {
  return (
    <SpotlightCard className={cn("p-4", destaque && "ring-1 ring-primary/25")}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className={cn(tom === "alerta" && valor > 0 ? "text-amber-300" : destaque ? "text-primary" : "")}>
          {icone}
        </span>
        <span className="text-[11px] uppercase tracking-wider">{titulo}</span>
      </div>
      <p className={cn(
        "text-2xl font-bold tabular-nums mt-1.5",
        valor < 0 ? "text-rose-400" : destaque ? "text-primary" : "",
      )}>
        {brl(valor)}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{nota}</p>
    </SpotlightCard>
  );
}

function LinhaLanc({ l, contas, categorias, acao }: {
  l: Lancamento; contas: Conta[]; categorias: Categoria[]; acao?: React.ReactNode;
}) {
  const cat = categorias.find((c) => c.id === l.categoria_id);
  const conta = contas.find((c) => c.id === l.conta_id);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2">
      <span className={cn("h-7 w-7 rounded-lg grid place-items-center shrink-0",
        l.tipo === "entrada" ? "bg-emerald-400/10 ring-1 ring-emerald-400/20" : "bg-rose-400/10 ring-1 ring-rose-400/20")}>
        {l.tipo === "entrada"
          ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
          : <ArrowDownRight className="h-3.5 w-3.5 text-rose-400" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium truncate">{l.descricao}</span>
        <span className="block text-[10.5px] text-muted-foreground truncate">
          {fmtDia(l.data)}{cat ? ` · ${cat.nome}` : ""}{conta ? ` · ${conta.nome}` : ""}
          {l.origem !== "manual" && ` · ${l.origem}`}
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

function FormNovaConta({ onSalvar, salvando }: {
  onSalvar: (v: Record<string, unknown>) => void; salvando: boolean;
}) {
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
        <Button
          disabled={salvando || !nome.trim()}
          onClick={() => onSalvar({
            nome: nome.trim(), instituicao: instituicao.trim() || null, tipo,
            saldo_inicial: parseMoneyBR(saldo) || 0,
          })}
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null} Criar conta
        </Button>
      </DialogFooter>
    </>
  );
}

function FormLancamento({ tipo, contas, categorias, onSalvar, salvando }: {
  tipo: "entrada" | "saida"; contas: Conta[]; categorias: Categoria[];
  onSalvar: (v: Record<string, unknown>) => void; salvando: boolean;
}) {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje());
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [catId, setCatId] = useState("");
  const [status, setStatus] = useState<"previsto" | "realizado">("realizado");
  const [obs, setObs] = useState("");
  const valido = descricao.trim() && (parseMoneyBR(valor) || 0) > 0 && contaId;
  return (
    <>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Descrição</Label>
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)}
            placeholder={tipo === "entrada" ? "ex: Honorário do processo X" : "ex: Aluguel de setembro"} className="mt-1" />
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
            <Label className="text-xs">Conta</Label>
            <Select value={contaId} onValueChange={setContaId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="escolha" /></SelectTrigger>
              <SelectContent>
                {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={catId} onValueChange={setCatId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="escolha" /></SelectTrigger>
              <SelectContent>
                {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          {(["realizado", "previsto"] as const).map((s) => (
            <button
              key={s} onClick={() => setStatus(s)}
              className={cn("flex-1 rounded-lg border px-3 py-2 text-[12px] transition-colors",
                status === s ? "border-primary/40 bg-primary/10 text-foreground"
                             : "border-white/[0.08] bg-white/[0.02] text-muted-foreground hover:bg-white/[0.05]")}
            >
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
        <Button
          disabled={salvando || !valido}
          onClick={() => onSalvar({
            descricao: descricao.trim(), valor: parseMoneyBR(valor), data, status, tipo,
            conta_id: contaId, categoria_id: catId || null, observacoes: obs.trim() || null,
          })}
        >
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
          <Input value={descricao} onChange={(e) => setDescricao(e.target.value)}
            placeholder="ex: Aluguel da sala" className="mt-1" />
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
              <SelectContent>
                {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={catId} onValueChange={setCatId}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="escolha" /></SelectTrigger>
              <SelectContent>
                {categorias.filter((c) => c.tipo === tipo).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
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
        <Button
          disabled={salvando || !valido}
          onClick={() => onSalvar({
            descricao: descricao.trim(), valor: parseMoneyBR(valor), dia_vencimento: diaN,
            tipo, conta_id: contaId, categoria_id: catId || null,
          })}
        >
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
            <SelectContent>
              {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
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
