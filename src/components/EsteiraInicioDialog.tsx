import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  FolderOpen, ScanSearch, AlertTriangle, X, Check, ChevronLeft,
} from "lucide-react";

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
  // Sobrescreve o que acontece em "Confirmar viabilidade" / "Salvar e seguir".
  // Default: navega pra /finder?cliente=...&nome=...
  // Quando custom, deve cuidar da propria navegacao/setup.
  onConfirmar?: () => Promise<void> | void;
  // Customiza labels do modal pra contextos diferentes (ex: "Nova analise vinculada")
  titulo?: string;
}

type Stage = "actions" | "pendencia";
type PendenciaMode = "cancelar" | "seguir";

export function EsteiraInicioDialog({ open, onClose, cliente, userId, onCreated, onConfirmar, titulo }: Props) {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("actions");
  const [mode, setMode] = useState<PendenciaMode>("seguir");
  const [tipo, setTipo] = useState<TipoPendencia | "">("");
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setStage("actions"); setTipo(""); setCustom(""); };

  const handleClose = () => { onClose(); setTimeout(reset, 200); };

  const seguirParaAnalise = async () => {
    if (!cliente) return;
    if (onConfirmar) {
      await onConfirmar();
      handleClose();
    } else {
      handleClose();
      navigate(`/finder?cliente=${cliente.id}&nome=${encodeURIComponent(cliente.nome)}`);
    }
  };

  const abrirDrive = () => {
    if (!cliente?.drive_folder_url) {
      toast.error("Este cliente ainda não tem pasta associada no Drive.");
      return;
    }
    window.open(cliente.drive_folder_url, "_blank", "noopener,noreferrer");
  };

  const iniciarPendencia = (m: PendenciaMode) => {
    setMode(m);
    setStage("pendencia");
  };

  const salvarPendencia = async () => {
    if (!cliente) return;
    if (!tipo) { toast.error("Selecione o tipo de pendência."); return; }
    if (tipo === "personalizada" && !custom.trim()) {
      toast.error("Descreva a pendência personalizada.");
      return;
    }
    setSaving(true);
    const tipoLabel = TIPOS_PENDENCIA.find(t => t.key === tipo)?.label ?? tipo;
    const titulo = tipo === "personalizada"
      ? `Pendência: ${custom.trim().slice(0, 80)}`
      : `Pendência: ${tipoLabel}`;
    const { error } = await supabase.from("demandas" as any).insert({
      cliente_id: cliente.id,
      tipo: "pre_protocolo",
      etapa: "pendencia_documental",
      status: "pendente",
      titulo,
      descricao: tipo === "personalizada" ? custom.trim() : null,
      pendencia_tipo: tipo,
      created_by: userId,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pendência registrada");
    onCreated();
    if (mode === "seguir") {
      await seguirParaAnalise();
    } else {
      handleClose();
    }
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
            {stage === "actions"
              ? "Abra a pasta do Drive para conferir os documentos e escolha o próximo passo."
              : mode === "cancelar"
                ? "Selecione o que está pendente. Você vai voltar à esteira sem ir pra análise."
                : "Selecione o que está pendente. Em seguida você é levado ao Finder pra começar a análise."}
          </DialogDescription>
        </DialogHeader>

        <div key={stage} className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-4">
          {stage === "actions" && (
            <>
              {/* Botão principal: Drive */}
              <button
                onClick={abrirDrive}
                disabled={!cliente?.drive_folder_url}
                className="w-full flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-4 hover:bg-primary/15 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Abrir pasta no Drive</p>
                  <p className="text-[11px] text-muted-foreground">
                    {cliente?.drive_folder_url ? "Investigue os documentos do cliente" : "Cliente sem pasta associada"}
                  </p>
                </div>
              </button>

              <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground pt-2">Decisão</div>

              <div className="grid grid-cols-1 gap-2">
                <Button
                  onClick={seguirParaAnalise}
                  className="justify-start gap-2 h-auto py-3"
                >
                  <Check className="h-4 w-4" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Confirmar viabilidade e ir pra análise</p>
                    <p className="text-[11px] opacity-80 font-normal">Abre o Finder pra começar a análise dos extratos</p>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  onClick={() => iniciarPendencia("seguir")}
                  className="justify-start gap-2 h-auto py-3 border-amber-400/40 hover:border-amber-400/60 hover:bg-amber-400/5"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Relatar pendência e seguir pra análise</p>
                    <p className="text-[11px] opacity-80 font-normal">Cria pendência E vai pro Finder</p>
                  </div>
                </Button>

                <Button
                  variant="outline"
                  onClick={() => iniciarPendencia("cancelar")}
                  className="justify-start gap-2 h-auto py-3 border-destructive/30 hover:border-destructive/50 hover:bg-destructive/5"
                >
                  <X className="h-4 w-4 text-destructive" />
                  <div className="text-left">
                    <p className="text-sm font-medium">Relatar pendência e cancelar</p>
                    <p className="text-[11px] opacity-80 font-normal">Cria pendência e fecha — análise não é iniciada agora</p>
                  </div>
                </Button>
              </div>
            </>
          )}

          {stage === "pendencia" && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">Tipo de pendência</label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as TipoPendencia)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_PENDENCIA.map(t => (
                      <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {tipo === "personalizada" && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Descreva a pendência</label>
                  <Textarea
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder="Ex: falta termo de declaração assinado pelo cliente"
                    className="resize-none min-h-[80px]"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setStage("actions")} disabled={saving}>Voltar</Button>
                <Button onClick={salvarPendencia} disabled={saving || !tipo}>
                  {saving
                    ? "Salvando…"
                    : mode === "seguir"
                      ? <><ScanSearch className="h-4 w-4 mr-1" /> Salvar e ir pra análise</>
                      : <><Check className="h-4 w-4 mr-1" /> Salvar e fechar</>}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
