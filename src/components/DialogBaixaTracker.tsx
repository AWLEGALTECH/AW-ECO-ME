// A BAIXA DO TRACKER, em duas telas.
//
// Chegar em ALVARÁ PAGO ou ACORDO PAGO não é mudar um status: é declarar que o
// dinheiro entrou. O processo sai do Tracker e vira lançamento no Wallet — e
// lançamento de entrada é como nota: tem valor bruto, tem o que é de terceiro e
// tem o que fica. Por isso são duas telas e não uma:
//
//   1. TEM CERTEZA? A pergunta seca, dizendo o que vai acontecer nos dois
//      sistemas. Quem clicou sem querer para aqui.
//   2. A NOTA. Quanto entrou, quanto é do cliente, quanto fica com o
//      escritório, em que dia. Só depois disso o dinheiro é lançado.
//
// O MESMO DIÁLOGO ATENDE AS DUAS PORTAS — a lista do Tracker e a ficha do
// processo. Duas cópias divergiriam na primeira correção, e uma delas deixaria
// de perguntar alguma coisa.
//
// A partilha vem preenchida à mão de propósito. O percentual do contrato não
// está registrado em lugar nenhum e agosto teve contrato de 30%, de 40% e de
// 50% — supor meio a meio erraria um em cada três, e o erro sairia como
// repasse a menos pro cliente.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { parseMoneyBR } from "@/lib/money";
import { hojeISO } from "@/lib/hoje";
import { dividirBaixa, type ViaBaixa } from "@/lib/baixaTracker";
import { sugerirRepasse, type ContratoDoCliente } from "@/lib/repasseContrato";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChuvaDeDinheiro } from "@/components/ChuvaDeDinheiro";
import {
  Loader2, Landmark, Handshake, ArrowRight, Check, TriangleAlert, Users, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface AlvoBaixa {
  processoId: string;
  clienteId: string | null;
  numeroProcesso: string | null;
  clienteNome: string | null;
  via: ViaBaixa;
  /** o que o Tracker esperava receber — vira sugestão, não imposição */
  valorPrevisto: number;
}

interface Conta { id: string; nome: string; ativo: boolean }
interface Contrato { id: string; percentual_exito: number | null; modalidade: string | null }

export function DialogBaixaTracker({ alvo, onFechar, onBaixado }: {
  alvo: AlvoBaixa | null;
  onFechar: () => void;
  /** chamado depois que o dinheiro entrou e o status foi carimbado */
  onBaixado?: (r: { status: string; lancamentoId: string }) => void;
}) {
  const { user } = useAuth();
  const [passo, setPasso] = useState<1 | 2>(1);
  const [contas, setContas] = useState<Conta[]>([]);
  const [contaId, setContaId] = useState("");
  const [valor, setValor] = useState("");
  const [doCliente, setDoCliente] = useState("");
  const [data, setData] = useState(hojeISO());
  const [salvando, setSalvando] = useState(false);
  const [festa, setFesta] = useState(false);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  // Quem digitou manda. A sugestão do contrato só preenche enquanto o campo
  // estiver intocado — sobrescrever o que a pessoa acabou de digitar é o tipo
  // de gentileza que faz repassar o valor errado.
  const [clienteTocado, setClienteTocado] = useState(false);

  const ehAcordo = alvo?.via === "acordo";
  const rotuloVia = ehAcordo ? "acordo" : "alvará";

  // Reabrir tem que recomeçar do primeiro passo com os campos do processo
  // certo. Guardar por id evita o diálogo voltar com o valor do anterior — foi
  // exatamente esse bug que removeu rubrica de verdade do ZENILDO.
  useEffect(() => {
    if (!alvo) return;
    setPasso(1);
    setValor(alvo.valorPrevisto > 0 ? alvo.valorPrevisto.toFixed(2).replace(".", ",") : "");
    setDoCliente("");
    setClienteTocado(false);
    setContratos([]);
    setData(hojeISO());
  }, [alvo?.processoId, alvo?.via]);

  useEffect(() => {
    if (!alvo) return;
    (async () => {
      const { data: cs } = await (supabase.from("balance_contas" as never) as never as any)
        .select("id, nome, ativo").eq("ativo", true).order("ordem");
      const lista = (cs || []) as Conta[];
      setContas(lista);
      setContaId((atual) => atual || lista[0]?.id || "");

      // O contrato diz o percentual de êxito do escritório; o resto é do
      // cliente. Sem contrato, o campo fica vazio e a pessoa preenche.
      if (alvo.clienteId) {
        const { data: ct } = await (supabase.from("contratos" as never) as never as any)
          .select("id, percentual_exito, modalidade")
          .eq("cliente_id", alvo.clienteId)
          .eq("status", "ativo")
          .order("data_assinatura", { ascending: false });
        setContratos((ct || []) as Contrato[]);
      }
    })();
  }, [alvo?.processoId, alvo?.clienteId]);

  const bruto = parseMoneyBR(valor) || 0;
  const cliente = parseMoneyBR(doCliente) || 0;
  const divisao = useMemo(() => dividirBaixa(bruto, cliente), [bruto, cliente]);

  const sugestao = useMemo(
    () => sugerirRepasse(bruto, contratos as ContratoDoCliente[]),
    [bruto, contratos],
  );

  // Preenche a parte do cliente pelo contrato enquanto ninguém tiver digitado
  // ali. Se a pessoa mexeu, o campo é dela — recalcular por cima seria trocar
  // o valor de repasse debaixo da mão de quem está confirmando.
  useEffect(() => {
    if (clienteTocado || sugestao.valor == null) return;
    setDoCliente(sugestao.valor.toFixed(2).replace(".", ","));
  }, [sugestao.valor, clienteTocado]);

  const confirmar = async () => {
    if (!alvo || !divisao.valido || !contaId) return;
    setSalvando(true);
    const { data: r, error } = await supabase.rpc("fn_balance_baixar_tracker" as never, {
      p_processo_id: alvo.processoId,
      p_conta_id: contaId,
      p_valor_bruto: bruto,
      p_valor_cliente: cliente,
      p_data: data,
      p_via: alvo.via,
      p_editor: user?.id ?? null,
    } as never);
    setSalvando(false);

    if (error) {
      // O índice único barra a segunda baixa no mesmo dia — é proteção, não
      // falha, e merece ser dito com todas as letras.
      const dup = /duplicate key|unique/i.test(error.message);
      toast.error(dup
        ? "Este processo já foi baixado nesta data. Confira o Wallet antes de lançar de novo."
        : "Não foi possível dar baixa: " + error.message);
      return;
    }

    const res = r as { status: string; lancamento_id: string };
    setFesta(true);
    toast.success(
      `${ehAcordo ? "Acordo" : "Alvará"} recebido · ${brl(bruto)} no Wallet.`,
      { description: divisao.doEscritorio !== bruto
          ? `${brl(divisao.doEscritorio)} do escritório · ${brl(cliente)} a repassar`
          : "Tudo do escritório." },
    );
    onBaixado?.({ status: res.status, lancamentoId: res.lancamento_id });
    onFechar();
  };

  return (
    <>
      <ChuvaDeDinheiro ativo={festa} onFim={() => setFesta(false)} />

      <Dialog open={!!alvo} onOpenChange={(o) => !o && onFechar()}>
        <DialogContent className="max-w-lg">
          {alvo && passo === 1 && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {ehAcordo ? <Handshake className="h-5 w-5 text-amber-300" />
                            : <Landmark className="h-5 w-5 text-emerald-400" />}
                  Dar baixa no Tracker?
                </DialogTitle>
                <DialogDescription>
                  Marcar como {ehAcordo ? "ACORDO PAGO" : "ALVARÁ PAGO"} declara que o dinheiro
                  entrou. Duas coisas acontecem juntas:
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2.5">
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
                  <p className="text-[13px] font-medium truncate">
                    {alvo.clienteNome || "Processo"}
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums truncate">
                    {alvo.numeroProcesso || "sem número"}
                  </p>
                </div>

                <Passo n={1} icone={<ArrowRight className="h-3.5 w-3.5" />}>
                  O processo <span className="text-foreground">sai do Tracker</span> — ele deixa de
                  ser dinheiro previsto.
                </Passo>
                <Passo n={2} icone={<Landmark className="h-3.5 w-3.5" />}>
                  Entra no <span className="text-foreground">Wallet</span> como recebimento, com a
                  parte do cliente separada.
                </Passo>

                <p className="flex items-start gap-2 text-[12px] text-amber-300/90 pt-1">
                  <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  Isso mexe no saldo do escritório. Na tela seguinte você confere os valores
                  antes de qualquer coisa ser lançada.
                </p>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
                <Button onClick={() => setPasso(2)}>
                  Tenho certeza <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </DialogFooter>
            </>
          )}

          {alvo && passo === 2 && (
            <>
              <DialogHeader>
                <DialogTitle>Quanto entrou</DialogTitle>
                <DialogDescription>
                  O {rotuloVia} entra inteiro na conta. A parte do cliente fica separada como
                  repasse pendente até vocês decidirem enviar.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Valor recebido (R$)</Label>
                    <Input value={valor} onChange={(e) => setValor(e.target.value)}
                      placeholder="0,00" className="mt-1 tabular-nums" autoFocus />
                    {alvo.valorPrevisto > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        o Tracker esperava {brl(alvo.valorPrevisto)}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">Parte do cliente (R$)</Label>
                    <Input
                      value={doCliente}
                      onChange={(e) => { setClienteTocado(true); setDoCliente(e.target.value); }}
                      placeholder="0,00" className="mt-1 tabular-nums" />
                    {/* A conta escrita, não só o número: se eu tiver invertido a
                        direção do percentual, isso denuncia antes de confirmar. */}
                    {sugestao.valor != null ? (
                      <p className={cn("text-[11px] mt-1",
                        sugestao.ambiguo ? "text-amber-300/90" : "text-muted-foreground")}>
                        {sugestao.explicacao}
                        {!clienteTocado && !sugestao.ambiguo && " Confira e ajuste se for o caso."}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {sugestao.explicacao || "em branco, é tudo do escritório"}
                      </p>
                    )}
                  </div>
                </div>

                {/* a nota: bruto, o que é de terceiro, o que fica */}
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] divide-y divide-white/[0.06]">
                  <LinhaNota rotulo={`${ehAcordo ? "Acordo" : "Alvará"} recebido`}
                    valor={brl(bruto)} icone={<Landmark className="h-3.5 w-3.5" />} />
                  <LinhaNota rotulo="A repassar ao cliente" valor={`− ${brl(cliente)}`}
                    icone={<Users className="h-3.5 w-3.5" />}
                    tom={cliente > 0 ? "amber" : "muted"}
                    nota={divisao.valido && cliente > 0 ? `${divisao.percentualCliente}% do recebido` : undefined} />
                  <LinhaNota rotulo="Fica com o escritório" forte
                    valor={brl(divisao.valido ? divisao.doEscritorio : 0)}
                    icone={<Building2 className="h-3.5 w-3.5" />} tom="emerald" />
                </div>

                {!divisao.valido && bruto > 0 && (
                  <p className="text-[12px] text-rose-400">{divisao.erro}</p>
                )}

                <div className={cn("grid gap-3", contas.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
                  <div>
                    <Label className="text-xs">Dia em que caiu</Label>
                    <Input type="date" value={data} onChange={(e) => setData(e.target.value)}
                      className="mt-1" />
                  </div>
                  {contas.length > 1 && (
                    <div>
                      <Label className="text-xs">Em qual conta</Label>
                      <Select value={contaId} onValueChange={setContaId}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="escolha" /></SelectTrigger>
                        <SelectContent>
                          {contas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setPasso(1)}>Voltar</Button>
                <Button disabled={salvando || !divisao.valido || !contaId} onClick={confirmar}>
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                            : <Check className="h-4 w-4 mr-1.5" />}
                  Lançar {brl(bruto)} no Wallet
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Passo({ n, icone, children }: { n: number; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-[12.5px] text-muted-foreground">
      <span className="h-6 w-6 rounded-md bg-white/[0.05] ring-1 ring-white/10 grid place-items-center shrink-0 text-muted-foreground">
        {icone}
      </span>
      <span className="pt-0.5">{children}</span>
    </div>
  );
}

function LinhaNota({ rotulo, valor, icone, tom = "muted", forte, nota }: {
  rotulo: string; valor: string; icone: React.ReactNode;
  tom?: "muted" | "amber" | "emerald"; forte?: boolean; nota?: string;
}) {
  const cor = tom === "emerald" ? "text-emerald-400" : tom === "amber" ? "text-amber-300" : "text-foreground";
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5">
      <span className="text-muted-foreground/70 shrink-0">{icone}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[12.5px]", forte ? "font-medium text-foreground" : "text-muted-foreground")}>
          {rotulo}
        </span>
        {nota && <span className="block text-[10.5px] text-muted-foreground/80">{nota}</span>}
      </span>
      <span className={cn("tabular-nums shrink-0", forte ? "text-[15px] font-semibold" : "text-[13px]", cor)}>
        {valor}
      </span>
    </div>
  );
}
