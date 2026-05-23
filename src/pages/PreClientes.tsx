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
import { CheckCircle2, XCircle, Clock, FileSignature, User, Briefcase, Scale, Search, FolderOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  drive_folder_id: string | null;
  drive_folder_url: string | null;
  cliente_id: string | null;
  created_at: string;
  confirmed_at: string | null;
}

const fmtBRL = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));

function ConfirmarDialog({ pre, onConfirm }: { pre: PreCliente; onConfirm: (driveUrl: string) => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  // Pre-popula com a pasta ja criada automaticamente (edge function
  // create-drive-folder) quando o pre_cliente foi gerado.
  const [drive, setDrive] = useState(pre.drive_folder_url ?? "");
  const [busy, setBusy] = useState(false);
  const autoCreated = !!pre.drive_folder_url;

  const driveValido =
    /^https?:\/\/(drive|docs)\.google\.com\//i.test(drive.trim());

  const handleConfirmar = async () => {
    if (!driveValido) {
      toast.error("Cole um link válido do Google Drive (drive.google.com / docs.google.com).");
      return;
    }
    setBusy(true);
    try {
      await onConfirm(drive.trim());
      setOpen(false);
      setDrive("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setDrive(""); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-500">
          <CheckCircle2 className="h-4 w-4 mr-1.5" />
          Confirmar cadastro
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar cadastro de {pre.nome}?</DialogTitle>
          <DialogDescription>
            Vai criar um cliente em Clientes com os dados do pré-cadastro. Pra continuar, informe a pasta do Google Drive desse cliente — ela vai ficar vinculada ao perfil dele e guardar os documentos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 pt-2">
          <Label htmlFor="drive-url" className="flex items-center gap-2 text-sm">
            <FolderOpen className="h-4 w-4 text-primary" />
            Pasta do Google Drive <span className="text-destructive">*</span>
          </Label>
          <Input
            id="drive-url"
            type="url"
            placeholder="https://drive.google.com/drive/folders/..."
            value={drive}
            onChange={(e) => setDrive(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && driveValido && !busy) handleConfirmar(); }}
          />
          {autoCreated ? (
            <p className="text-[11px] text-emerald-400 inline-flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" /> Pasta criada automaticamente no Drive — você pode alterar se quiser.
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Cole o link da pasta (a URL que aparece quando você abre a pasta no Drive). Tem que começar com <code className="text-foreground/80">drive.google.com</code> ou <code className="text-foreground/80">docs.google.com</code>.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancelar</Button>
          <Button
            onClick={handleConfirmar}
            disabled={!driveValido || busy}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? "Confirmando…" : "Confirmar cadastro"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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

  const confirmar = async (pre: PreCliente, driveFolderUrl: string) => {
    if (!user) return;

    // 1. cria cliente (origem=writer) com RG e profissao em colunas proprias
    const dkInicial: any = (pre as any).dados_completos?.dadosKit ?? null;
    const { data: novoCliente, error: errCli } = await supabase
      .from("clientes")
      .insert({
        nome: pre.nome,
        cpf_cnpj: pre.cpf_cnpj,
        telefone: pre.telefone,
        email: pre.email,
        endereco: pre.endereco_completo,
        rg: pre.rg,
        profissao: pre.profissao,
        nacionalidade: pre.nacionalidade || dkInicial?.cliente_nacionalidade || null,
        estado_civil: pre.estado_civil || dkInicial?.cliente_estado_civil || null,
        orgao_expedidor: pre.orgao_expedidor || dkInicial?.cliente_orgao_expedidor || null,
        genero: dkInicial?.cliente_genero || null,
        observacoes: null,
        drive_folder_url: driveFolderUrl,
        origem: "writer",
      } as any)
      .select()
      .single();
    if (errCli) { toast.error("Erro ao criar cliente: " + errCli.message); return; }

    // 2. cria contrato vinculado (modalidade puxa do produto do writer)
    const dk: any = (pre as any).dados_completos?.dadosKit ?? null;
    const { data: contrato, error: errContrato } = await supabase
      .from("contratos" as any)
      .insert({
        cliente_id: novoCliente.id,
        modalidade: pre.produto || "Êxito",
        valor_total: pre.valor_causa,
        percentual_exito: dk?.honorarios_percentual_exito
          ? Number(dk.honorarios_percentual_exito) || null
          : null,
        motivo: dk?.causa_motivo_outro || dk?.causa_motivo || null,
        reus: pre.rubricas && pre.rubricas.length ? pre.rubricas : null,
        data_assinatura: dk?.contrato_data_assinatura || null,
        drive_url: driveFolderUrl,
        pre_cliente_id: pre.id,
        status: "ativo",
      })
      .select()
      .single();
    if (errContrato) console.error("[confirmar] falha criando contrato:", errContrato);

    // 3. cria a análise documental inicial (1ª etapa do pré-protocolo)
    await supabase
      .from("demandas" as any)
      .insert({
        cliente_id: novoCliente.id,
        contrato_id: (contrato as any)?.id ?? null,
        tipo: "pre_protocolo",
        etapa: "analise_documental",
        titulo: "Análise documental inicial",
        descricao: "Identificar quais descontos do cliente são ajuizáveis.",
        status: "pendente",
        created_by: user.id,
        ordem: 0,
      });

    // 4. fecha o pré-cliente
    const { error: errPre } = await supabase
      .from("pre_clientes")
      .update({
        status: "confirmado",
        cliente_id: novoCliente.id,
        confirmed_at: new Date().toISOString(),
        confirmed_by: user.id,
        drive_folder_url: driveFolderUrl,
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
                    <ConfirmarDialog pre={pre} onConfirm={(driveUrl) => confirmar(pre, driveUrl)} />

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
