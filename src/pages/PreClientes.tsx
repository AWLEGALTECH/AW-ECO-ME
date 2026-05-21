import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SpotlightCard } from "@/components/SpotlightCard";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, XCircle, Clock, FileSignature, User, Briefcase, Scale, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { appConfig } from "@/config/app-config";

interface PreCliente {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  rg: string | null;
  estado_civil: string | null;
  profissao: string | null;
  telefone: string | null;
  email: string | null;
  endereco_completo: string | null;
  produto: string | null;
  rubricas: string[] | null;
  valor_causa: number | null;
  status: "aguardando_assinatura" | "confirmado" | "cancelado";
  origem: string;
  cliente_id: string | null;
  created_at: string;
  confirmed_at: string | null;
}

const fmtBRL = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));

const STATUS_META: Record<PreCliente["status"], { label: string; color: string; Icon: any }> = {
  aguardando_assinatura: { label: "Aguardando assinatura", color: "text-amber-400 border-amber-400/30 bg-amber-400/5", Icon: Clock },
  confirmado:            { label: "Confirmado",            color: "text-emerald-400 border-emerald-400/30 bg-emerald-400/5", Icon: CheckCircle2 },
  cancelado:             { label: "Cancelado",             color: "text-muted-foreground border-border bg-muted/20", Icon: XCircle },
};

export default function PreClientes() {
  useEffect(() => { document.title = `Pré-clientes — ${appConfig.name}`; }, []);
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filtroStatus, setFiltroStatus] = useState<PreCliente["status"] | "todos">("aguardando_assinatura");
  const [busca, setBusca] = useState("");

  const { data: preClientes, isLoading } = useQuery({
    queryKey: ["pre_clientes", filtroStatus],
    queryFn: async () => {
      let q = supabase.from("pre_clientes").select("*").order("created_at", { ascending: false });
      if (filtroStatus !== "todos") q = q.eq("status", filtroStatus);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as PreCliente[];
    },
    refetchInterval: 5_000,
    refetchOnWindowFocus: true,
  });

  const confirmar = async (pre: PreCliente) => {
    if (!user) return;
    const { data: novoCliente, error: errCli } = await supabase
      .from("clientes")
      .insert({
        nome: pre.nome,
        cpf_cnpj: pre.cpf_cnpj,
        telefone: pre.telefone,
        email: pre.email,
        endereco: pre.endereco_completo,
        observacoes: `Originado do Writer · Produto: ${pre.produto || "—"}${pre.rg ? ` · RG: ${pre.rg}` : ""}${pre.profissao ? ` · ${pre.profissao}` : ""}`,
      })
      .select()
      .single();
    if (errCli) { toast.error("Erro ao criar cliente: " + errCli.message); return; }

    const { error: errPre } = await supabase
      .from("pre_clientes")
      .update({
        status: "confirmado",
        cliente_id: novoCliente.id,
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.id,
      })
      .eq("id", pre.id);
    if (errPre) { toast.error("Cliente criado, mas falhou atualizar pré-cliente: " + errPre.message); }
    toast.success(`Cliente ${pre.nome} cadastrado com sucesso`);
    qc.invalidateQueries({ queryKey: ["pre_clientes"] });
  };

  const preClientesFiltrados = (preClientes ?? []).filter(p => {
    if (!busca.trim()) return true;
    const q = busca.trim().toLowerCase();
    const haystack = [
      p.nome,
      p.cpf_cnpj,
      p.produto,
      p.telefone,
      p.email,
      ...(p.rubricas ?? []),
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q);
  });

  const cancelar = async (pre: PreCliente) => {
    if (!user) return;
    const { error } = await supabase
      .from("pre_clientes")
      .update({
        status: "cancelado",
        cancelled_at: new Date().toISOString(),
        cancelled_by: user.id,
      })
      .eq("id", pre.id);
    if (error) { toast.error("Erro ao cancelar: " + error.message); return; }
    toast.success("Pré-cliente cancelado");
    qc.invalidateQueries({ queryKey: ["pre_clientes"] });
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-medium tracking-tight">Pré-clientes</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastros gerados pelo Writer aguardando confirmação pós-assinatura do contrato.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card/40 p-1">
          {(["aguardando_assinatura", "confirmado", "cancelado", "todos"] as const).map(s => (
            <button
              key={s}
              onClick={() => setFiltroStatus(s)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                filtroStatus === s ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s === "aguardando_assinatura" ? "Aguardando" :
               s === "confirmado" ? "Confirmados" :
               s === "cancelado" ? "Cancelados" : "Todos"}
            </button>
          ))}
        </div>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, CPF, produto ou réu…"
          className="pl-9 h-11 bg-card/40 border-border"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !preClientesFiltrados.length ? (
        <SpotlightCard className="py-16 text-center">
          <FileSignature className="h-10 w-10 mx-auto text-muted-foreground/40" />
          <p className="mt-4 text-sm text-muted-foreground">
            {busca.trim()
              ? `Nenhum pré-cliente encontrado para "${busca}"`
              : `Nenhum pré-cliente ${filtroStatus !== "todos" ? "neste status" : "ainda"}.`}
          </p>
          {!busca.trim() && (
            <p className="text-xs text-muted-foreground/60 mt-1">
              Quando um contrato for gerado no Writer, ele aparece aqui pra confirmação.
            </p>
          )}
        </SpotlightCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {preClientesFiltrados.map(pre => {
            const meta = STATUS_META[pre.status];
            const podeAgir = pre.status === "aguardando_assinatura";
            return (
              <SpotlightCard key={pre.id} className="p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-medium truncate">{pre.nome}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {pre.cpf_cnpj || "Sem CPF"} · {fmtDate(pre.created_at)}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border ${meta.color}`}>
                    <meta.Icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                </div>

                <dl className="space-y-1.5 text-xs">
                  {pre.produto && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground w-20 shrink-0 flex items-center gap-1"><Briefcase className="h-3 w-3" />Produto</dt>
                      <dd className="text-foreground truncate">{pre.produto}</dd>
                    </div>
                  )}
                  {pre.rubricas && pre.rubricas.length > 0 && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground w-20 shrink-0 flex items-center gap-1"><Scale className="h-3 w-3" />Réu</dt>
                      <dd className="text-foreground truncate">{pre.rubricas.join(", ")}</dd>
                    </div>
                  )}
                  {pre.valor_causa != null && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground w-20 shrink-0">Valor</dt>
                      <dd className="text-primary tabular-nums">{fmtBRL(pre.valor_causa)}</dd>
                    </div>
                  )}
                  {(pre.telefone || pre.email) && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground w-20 shrink-0">Contato</dt>
                      <dd className="text-foreground truncate">
                        {[pre.telefone, pre.email].filter(Boolean).join(" · ")}
                      </dd>
                    </div>
                  )}
                </dl>

                {podeAgir && (
                  <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-500">
                          <CheckCircle2 className="h-4 w-4 mr-1.5" />
                          Confirmar cadastro
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirmar cadastro de {pre.nome}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Vai criar um cliente em Clientes com os dados do pré-cadastro e marcar o pré-cliente como confirmado. Não pode ser desfeito automaticamente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => confirmar(pre)}>Confirmar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" className="bg-red-600 hover:bg-red-500 text-white">
                          <XCircle className="h-4 w-4 mr-1.5" />
                          Cancelar
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Cancelar pré-cliente?</AlertDialogTitle>
                          <AlertDialogDescription>
                            O pré-cliente será marcado como cancelado e sai da fila de pendentes. Use isso quando o contrato não for assinado.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Voltar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => cancelar(pre)}>Cancelar pré-cliente</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}

                {pre.status === "confirmado" && pre.cliente_id && (
                  <div className="mt-4 pt-3 border-t border-border">
                    <a
                      href={`/clientes/${pre.cliente_id}`}
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <User className="h-3 w-3" />
                      Ver cliente cadastrado
                    </a>
                  </div>
                )}
              </SpotlightCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
