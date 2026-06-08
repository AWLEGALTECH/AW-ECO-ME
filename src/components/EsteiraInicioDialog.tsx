import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  ScanSearch, AlertTriangle, X, Check, ChevronLeft, Hammer, Building2, MessageSquare, User, ExternalLink, PenSquare, CheckCircle2,
} from "lucide-react";
import { DriveFolderButton } from "@/components/DriveFolderButton";

// Catálogo de tipos de pendência. A chave bate com demandas.pendencia_tipo.
export const TIPOS_PENDENCIA = [
  { key: "comprovante_residencia", label: "Comprovante de residência no nome" },
  { key: "extratos_bancarios",     label: "Extratos bancários" },
  { key: "contrato_drive",         label: "Contrato no drive" },
  { key: "rg",                     label: "RG" },
  { key: "cpf",                    label: "CPF" },
  { key: "procuracao",             label: "Procuração assinada" },
  { key: "personalizada",          label: "Outro (personalizada)" },
] as const;
export type TipoPendencia = typeof TIPOS_PENDENCIA[number]["key"];

interface Props {
  open: boolean;
  onClose: () => void;
  cliente: {
    id: string;
    nome: string;
    drive_folder_url?: string | null;
    observacoes?: string | null;
    requerido?: string | null;
    cadastrado_por?: string | null;
    origem?: string | null;
    demandas_downstream?: number;
  } | null;
  userId: string | null;
  onCreated: () => void;
  // Sobrescreve o que acontece em "Seguir fluxo Bradesco".
  // Default: navega pra /finder?cliente=...&nome=...
  onConfirmar?: () => Promise<void> | void;
  // Customiza titulo do modal pra contextos diferentes
  titulo?: string;
  // Quando true, exibe o botao "Finalizar analise primaria" — quem
  // controla a saida do cliente da coluna 1 da esteira. Usado apenas
  // quando o dialog eh aberto a partir da Esteira.
  permitirFinalizarPrimaria?: boolean;
}

type Stage = "actions" | "pendencia" | "pos_pendencia" | "artesanal_qtd" | "artesanal_specs";

export function EsteiraInicioDialog({ open, onClose, cliente, userId, onCreated, onConfirmar, titulo, permitirFinalizarPrimaria }: Props) {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("actions");
  const [finalizandoPrimaria, setFinalizandoPrimaria] = useState(false);
  const [tipos, setTipos] = useState<Set<TipoPendencia>>(new Set());
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);
  // Fluxo artesanal: quantidade de pecas + descricao de cada uma
  const [artesanalQtd, setArtesanalQtd] = useState<number>(1);
  const [artesanalSpecs, setArtesanalSpecs] = useState<string[]>([""]);

  const reset = () => {
    setStage("actions");
    setTipos(new Set());
    setCustom("");
    setArtesanalQtd(1);
    setArtesanalSpecs([""]);
  };

  const toggleTipo = (key: TipoPendencia) => {
    setTipos(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleClose = () => { onClose(); setTimeout(reset, 200); };

  const finalizarPrimaria = async () => {
    if (!cliente) return;
    setFinalizandoPrimaria(true);
    const { error } = await supabase
      .from("clientes")
      .update({
        analise_primaria_finalizada_at: new Date().toISOString(),
        analise_primaria_finalizada_by: userId,
      } as any)
      .eq("id", cliente.id);
    setFinalizandoPrimaria(false);
    if (error) { toast.error("Erro ao finalizar: " + error.message); return; }
    toast.success("Análise primária finalizada — cliente sai da coluna 1.");
    onCreated();
    handleClose();
  };

  const seguirBradesco = async () => {
    if (!cliente) return;
    if (onConfirmar) {
      await onConfirmar();
      handleClose();
    } else {
      handleClose();
      navigate(`/finder?cliente=${cliente.id}&nome=${encodeURIComponent(cliente.nome)}`);
    }
  };

  // Entra no fluxo de configuracao artesanal: primeiro escolhe quantas
  // pecas, depois descreve cada uma. So cria as demandas no final.
  const iniciarArtesanal = () => {
    setArtesanalQtd(1);
    setArtesanalSpecs([""]);
    setStage("artesanal_qtd");
  };

  const confirmarQtd = () => {
    const n = Math.max(1, Math.min(20, Math.floor(artesanalQtd || 1)));
    setArtesanalQtd(n);
    // Mantem o que ja foi digitado se a qtd diminui, completa com "" se aumenta
    setArtesanalSpecs(prev => {
      const next = [...prev];
      while (next.length < n) next.push("");
      next.length = n;
      return next;
    });
    setStage("artesanal_specs");
  };

  const setSpec = (idx: number, valor: string) => {
    setArtesanalSpecs(prev => {
      const next = [...prev];
      next[idx] = valor;
      return next;
    });
  };

  const criarPecasArtesanais = async () => {
    if (!cliente) return;
    const especs = artesanalSpecs.map(s => s.trim());
    if (especs.some(s => !s)) {
      toast.error("Descreva cada peça antes de continuar.");
      return;
    }
    setSaving(true);
    const total = especs.length;
    const rows = especs.map((spec, i) => {
      const sufixo = total > 1 ? ` (${i + 1}/${total})` : "";
      const tituloCurto = spec.length > 50 ? spec.slice(0, 50) + "…" : spec;
      return {
        cliente_id: cliente.id,
        tipo: "pre_protocolo",
        etapa: "fluxo_artesanal",
        status: "pendente",
        // titulo eh o que aparece como hint no card da esteira
        titulo: `Peça artesanal${sufixo} — ${tituloCurto}`,
        // descricao guarda a especificacao COMPLETA, exibida no popup
        descricao: spec,
        created_by: userId,
      };
    });
    const { error } = await supabase.from("demandas" as any).insert(rows);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(total === 1 ? "Peça artesanal criada" : `${total} peças artesanais criadas`);
    onCreated();
    handleClose();
  };

  const salvarPendencia = async () => {
    if (!cliente) return;
    if (tipos.size === 0) { toast.error("Selecione ao menos um tipo de pendência."); return; }
    if (tipos.has("personalizada") && !custom.trim()) {
      toast.error("Descreva a pendência personalizada.");
      return;
    }
    setSaving(true);
    const rows = Array.from(tipos).map(t => {
      const tipoLabel = TIPOS_PENDENCIA.find(x => x.key === t)?.label ?? t;
      const titulo = t === "personalizada"
        ? `Pendência: ${custom.trim().slice(0, 80)}`
        : `Pendência: ${tipoLabel}`;
      return {
        cliente_id: cliente.id,
        tipo: "pre_protocolo",
        etapa: "pendencia_documental",
        status: "pendente",
        titulo,
        descricao: t === "personalizada" ? custom.trim() : null,
        pendencia_tipo: t,
        created_by: userId,
      };
    });
    const { error } = await supabase.from("demandas" as any).insert(rows);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    // Cliente com pendência sai da fila de "Análise primária" e fica SÓ na
    // fila de pendências — nunca coexiste nas duas. Volta pra análise
    // primária automaticamente quando todas as pendências forem resolvidas.
    await supabase
      .from("clientes")
      .update({
        analise_primaria_finalizada_at: new Date().toISOString(),
        analise_primaria_finalizada_by: userId,
      } as any)
      .eq("id", cliente.id);
    toast.success(rows.length === 1 ? "Pendência registrada" : `${rows.length} pendências registradas`);
    onCreated();
    setStage("pos_pendencia");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {(stage === "pendencia" || stage === "artesanal_qtd") && (
              <button onClick={() => setStage("actions")} className="text-muted-foreground hover:text-foreground" aria-label="Voltar">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {stage === "artesanal_specs" && (
              <button onClick={() => setStage("artesanal_qtd")} className="text-muted-foreground hover:text-foreground" aria-label="Voltar">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {stage === "actions" && (
              <ScanSearch className="h-5 w-5 text-primary shrink-0" />
            )}
            {titulo || "Iniciar análise"} — {cliente?.nome || "cliente"}
          </DialogTitle>
          <DialogDescription>
            {stage === "actions" && "1. Analise a pasta do Drive. Depois escolha o próximo passo."}
            {stage === "pendencia" && "Selecione tudo que está faltando nesse cliente."}
            {stage === "pos_pendencia" && "Apesar da pendência registrada, este cliente segue ou não?"}
            {stage === "artesanal_qtd" && "Quantas peças serão confeccionadas pra esse cliente?"}
            {stage === "artesanal_specs" && "Descreva cada peça pra que o advogado saiba o que produzir."}
          </DialogDescription>
        </DialogHeader>

        <div key={stage} className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-4">
          {stage === "actions" && (
            <>
              {/* Resumo do card — mesmas infos exibidas na coluna 1 da
                  esteira (requerido, quem cadastrou, peças em produção),
                  mas expandidas pra leitura sem cortar. */}
              <div className="rounded-xl border border-border bg-card/40 px-4 py-3 space-y-2">
                <div className="flex items-start gap-2.5">
                  <Building2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Requerido</p>
                    <p className="text-sm font-medium text-foreground break-words">
                      {(cliente?.requerido || "").trim() || "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Cadastrado por</p>
                    <p className="text-sm text-foreground/90 break-words">
                      {(cliente?.cadastrado_por || "").trim() || "—"}
                      <span className="text-muted-foreground/70">
                        {" "}({cliente?.origem === "writer" ? "via procuração" : "manual"})
                      </span>
                    </p>
                  </div>
                </div>
                {(cliente?.demandas_downstream ?? 0) > 0 && (
                  <div className="flex items-center gap-2.5 pt-0.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <p className="text-sm text-emerald-400/90">
                      {cliente!.demandas_downstream === 1
                        ? "1 peça em produção"
                        : `${cliente!.demandas_downstream} peças em produção`}
                    </p>
                  </div>
                )}
              </div>

              {/* Observacoes deixadas por quem aprovou o pre-cliente */}
              {cliente?.observacoes && (
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 flex items-start gap-2.5">
                  <MessageSquare className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                  <div className="space-y-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-amber-400/80 font-semibold">
                      Observação do aprovador
                    </p>
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
                      {cliente.observacoes}
                    </p>
                  </div>
                </div>
              )}

              {/* Atalho pro perfil completo do cliente — primeiro botao */}
              {cliente && (
                <a
                  href={`/clientes/${cliente.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 hover:bg-primary/15 transition-colors"
                >
                  <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Abrir perfil do cliente</p>
                    <p className="text-[11px] text-muted-foreground">Veja dados, demandas e histórico completo</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-primary opacity-70" />
                </a>
              )}

              {/* Passo 1: Drive */}
              {cliente && (
                <DriveFolderButton
                  clienteId={cliente.id}
                  clienteNome={cliente.nome}
                  driveFolderUrl={cliente.drive_folder_url}
                />
              )}

              <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground pt-2">Decisão</div>

              <div className="grid grid-cols-1 gap-2">
                <Button
                  onClick={seguirBradesco}
                  className="justify-start gap-2 h-auto py-3"
                >
                  <Building2 className="h-4 w-4" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Seguir fluxo Bradesco</p>
                    <p className="text-[11px] opacity-80 font-normal">Abre o Finder pra análise vinculada Bradesco</p>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  onClick={iniciarArtesanal}
                  disabled={saving}
                  className="justify-start gap-2 h-auto py-3"
                >
                  <Hammer className="h-4 w-4 text-primary" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Seguir fluxo artesanal</p>
                    <p className="text-[11px] opacity-80 font-normal">Caso não-Bradesco. A peça será feita à mão.</p>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setStage("pendencia")}
                  className="justify-start gap-2 h-auto py-3 border-amber-400/40 hover:border-amber-400/60 hover:bg-amber-400/5"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Relatar pendência</p>
                    <p className="text-[11px] opacity-80 font-normal">Algo está faltando no Drive deste cliente</p>
                  </div>
                </Button>
              </div>

              {/* Finalizar analise primaria — so aparece quando chamado
                  pela esteira (col 1). Tira o cliente da fila enquanto
                  preserva qualquer demanda ja gerada (Bradesco / artesanal). */}
              {permitirFinalizarPrimaria && (
                <>
                  <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground pt-3">
                    Encerrar análise primária
                  </div>
                  <Button
                    variant="outline"
                    onClick={finalizarPrimaria}
                    disabled={finalizandoPrimaria}
                    className="w-full justify-start gap-2 h-auto py-3 border-emerald-500/40 hover:border-emerald-500/60 hover:bg-emerald-500/5"
                  >
                    <Check className="h-4 w-4 text-emerald-400" />
                    <div className="text-left">
                      <p className="text-sm font-medium">
                        {finalizandoPrimaria ? "Finalizando…" : "Finalizar análise primária"}
                      </p>
                      <p className="text-[11px] opacity-80 font-normal">
                        Tira o cliente da coluna 1. As peças geradas continuam nas colunas seguintes.
                      </p>
                    </div>
                  </Button>
                </>
              )}
            </>
          )}

          {stage === "pendencia" && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">
                  Tipos de pendência <span className="text-muted-foreground">(marque todas)</span>
                </label>
                <div className="rounded-lg border border-border divide-y divide-border/60">
                  {TIPOS_PENDENCIA.map(t => {
                    const checked = tipos.has(t.key);
                    return (
                      <label
                        key={t.key}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                          checked ? "bg-primary/5" : "hover:bg-muted/30"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleTipo(t.key)}
                        />
                        <span className="text-sm">{t.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {tipos.has("personalizada") && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Descreva a pendência personalizada</label>
                  <Textarea
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder="Ex: falta termo de declaração assinado pelo cliente"
                    className="resize-none min-h-[80px]"
                  />
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2">
                <span className="text-[11px] text-muted-foreground">
                  {tipos.size === 0
                    ? "Nenhuma selecionada"
                    : tipos.size === 1 ? "1 pendência" : `${tipos.size} pendências`}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => setStage("actions")} disabled={saving}>Voltar</Button>
                  <Button onClick={salvarPendencia} disabled={saving || tipos.size === 0}>
                    {saving ? "Salvando…" : <><Check className="h-4 w-4 mr-1" /> Salvar pendência</>}
                  </Button>
                </div>
              </div>
            </>
          )}

          {stage === "artesanal_qtd" && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">
                  Quantidade de peças
                </label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={artesanalQtd}
                  onChange={(e) => setArtesanalQtd(Number(e.target.value) || 1)}
                  className="h-12 text-lg font-semibold text-center"
                />
                <p className="text-[11px] text-muted-foreground">
                  Cada peça vira um card separado na coluna "Fluxo artesanal".
                  Mínimo 1, máximo 20.
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <Button variant="ghost" onClick={() => setStage("actions")} disabled={saving}>Voltar</Button>
                <Button onClick={confirmarQtd} disabled={saving || artesanalQtd < 1}>
                  Próximo: especificar peças
                </Button>
              </div>
            </>
          )}

          {stage === "artesanal_specs" && (
            <>
              <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
                {artesanalSpecs.map((spec, i) => (
                  <div key={i} className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground flex items-center gap-2">
                      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold">
                        {i + 1}
                      </span>
                      Peça {i + 1} de {artesanalQtd}
                    </label>
                    <Textarea
                      value={spec}
                      onChange={(e) => setSpec(i, e.target.value)}
                      placeholder="Ex.: Ação revisional contra Banco Pan — empréstimo consignado com taxa de 5,2% a.m., questionar abusividade."
                      className="resize-none min-h-[80px]"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <Button variant="ghost" onClick={() => setStage("artesanal_qtd")} disabled={saving}>Voltar</Button>
                <Button onClick={criarPecasArtesanais} disabled={saving}>
                  {saving ? "Criando…" : <><Check className="h-4 w-4 mr-1" /> Enviar pro fluxo</>}
                </Button>
              </div>
            </>
          )}

          {stage === "pos_pendencia" && (
            <div className="grid grid-cols-1 gap-2">
              <Button
                onClick={seguirBradesco}
                disabled={saving}
                className="justify-start gap-2 h-auto py-3"
              >
                <Building2 className="h-4 w-4" />
                <div className="text-left">
                  <p className="text-sm font-medium">Seguir fluxo Bradesco</p>
                  <p className="text-[11px] opacity-80 font-normal">Pendência fica registrada, mas a análise Bradesco começa agora</p>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={iniciarArtesanal}
                disabled={saving}
                className="justify-start gap-2 h-auto py-3"
              >
                <PenSquare className="h-4 w-4 text-primary" />
                <div className="text-left">
                  <p className="text-sm font-medium">Seguir fluxo artesanal</p>
                  <p className="text-[11px] opacity-80 font-normal">Vai pra fila de peças manuais com a pendência registrada</p>
                </div>
              </Button>

              <Button
                variant="outline"
                onClick={handleClose}
                disabled={saving}
                className="justify-start gap-2 h-auto py-3 border-destructive/30 hover:border-destructive/50 hover:bg-destructive/5"
              >
                <X className="h-4 w-4 text-destructive" />
                <div className="text-left">
                  <p className="text-sm font-medium">Não seguir agora</p>
                  <p className="text-[11px] opacity-80 font-normal">Fecha — só fica a pendência registrada</p>
                </div>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
