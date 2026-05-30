import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  ScanSearch, AlertTriangle, X, Check, ChevronLeft, PenSquare, Building2,
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
  cliente: { id: string; nome: string; drive_folder_url?: string | null } | null;
  userId: string | null;
  onCreated: () => void;
  // Sobrescreve o que acontece em "Seguir fluxo Bradesco".
  // Default: navega pra /finder?cliente=...&nome=...
  onConfirmar?: () => Promise<void> | void;
  // Customiza titulo do modal pra contextos diferentes
  titulo?: string;
}

type Stage = "actions" | "pendencia" | "pos_pendencia";

export function EsteiraInicioDialog({ open, onClose, cliente, userId, onCreated, onConfirmar, titulo }: Props) {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("actions");
  const [tipos, setTipos] = useState<Set<TipoPendencia>>(new Set());
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setStage("actions"); setTipos(new Set()); setCustom(""); };

  const toggleTipo = (key: TipoPendencia) => {
    setTipos(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleClose = () => { onClose(); setTimeout(reset, 200); };

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

  const seguirArtesanal = async () => {
    if (!cliente) return;
    setSaving(true);
    const { error } = await supabase.from("demandas" as any).insert({
      cliente_id: cliente.id,
      tipo: "pre_protocolo",
      etapa: "fluxo_artesanal",
      status: "pendente",
      titulo: `Peça artesanal — ${cliente.nome}`,
      descricao: "Caso não-Bradesco. Peça será confeccionada manualmente.",
      created_by: userId,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Cliente enviado pro fluxo artesanal");
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
    toast.success(rows.length === 1 ? "Pendência registrada" : `${rows.length} pendências registradas`);
    onCreated();
    setStage("pos_pendencia");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {stage === "pendencia" && (
              <button onClick={() => setStage("actions")} className="text-muted-foreground hover:text-foreground" aria-label="Voltar">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {titulo || "Iniciar análise"} — {cliente?.nome || "cliente"}
          </DialogTitle>
          <DialogDescription>
            {stage === "actions" && "1. Analise a pasta do Drive. Depois escolha o próximo passo."}
            {stage === "pendencia" && "Selecione tudo que está faltando nesse cliente."}
            {stage === "pos_pendencia" && "Apesar da pendência registrada, este cliente segue ou não?"}
          </DialogDescription>
        </DialogHeader>

        <div key={stage} className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-4">
          {stage === "actions" && (
            <>
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
                  onClick={seguirArtesanal}
                  disabled={saving}
                  className="justify-start gap-2 h-auto py-3"
                >
                  <PenSquare className="h-4 w-4 text-primary" />
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
                onClick={seguirArtesanal}
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
