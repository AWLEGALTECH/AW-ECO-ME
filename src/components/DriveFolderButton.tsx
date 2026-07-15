import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FolderOpen, FolderPlus, Loader2, ExternalLink } from "lucide-react";
import { logEvent } from "@/lib/audit";

interface Props {
  clienteId: string;
  clienteNome: string;
  driveFolderUrl: string | null | undefined;
  onCreated?: (url: string) => void;
  // variantes visuais
  variant?: "card" | "inline" | "minimal" | "row";
}

// Botao unico que:
//   - Tem url: abre a pasta no Drive em nova aba
//   - Nao tem: cria a pasta via edge function create-cliente-drive-folder
//     e ja propaga o url pelo callback (sem precisar refetch externo)
export function DriveFolderButton({ clienteId, clienteNome, driveFolderUrl, onCreated, variant = "card" }: Props) {
  const [creating, setCreating] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const url = driveFolderUrl || localUrl;

  const criar = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setCreating(true);
    const { data, error } = await supabase.functions.invoke(
      "create-cliente-drive-folder",
      { body: { cliente_id: clienteId, override_nome: clienteNome } },
    );
    setCreating(false);
    if (error || !(data as any)?.ok) {
      const msg = (data as any)?.error || error?.message || "Falha desconhecida";
      toast.error(`Não foi possível criar a pasta: ${msg}`);
      return;
    }
    const newUrl = (data as any).folder_url as string;
    setLocalUrl(newUrl);
    toast.success("Pasta criada no Drive");
    logEvent("drive_folder_create", "clientes", clienteId, { nome: clienteNome, folder_url: newUrl });
    onCreated?.(newUrl);
  };

  if (variant === "minimal") {
    if (url) {
      return (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}>
          <FolderOpen className="h-3.5 w-3.5" /> Drive
        </a>
      );
    }
    return (
      <button onClick={criar} disabled={creating}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50">
        {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderPlus className="h-3.5 w-3.5" />}
        {creating ? "Criando…" : "Criar pasta"}
      </button>
    );
  }

  if (variant === "inline") {
    if (url) {
      return (
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
          onClick={(e) => e.stopPropagation()}>
          <FolderOpen className="h-4 w-4" /> Abrir pasta no Drive <ExternalLink className="h-3 w-3" />
        </a>
      );
    }
    return (
      <button onClick={criar} disabled={creating}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 disabled:opacity-50">
        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
        {creating ? "Criando pasta…" : "Criar pasta no Drive"}
      </button>
    );
  }

  // variant === "row" — casa com o ActionRow quieto do EsteiraInicioDialog:
  // linha neutra glassy, cor só no chip do ícone.
  if (variant === "row") {
    const rowBase =
      "w-full flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] " +
      "hover:bg-white/[0.05] hover:border-white/[0.12] px-4 py-3 transition-all duration-200 disabled:opacity-50";
    const chip = "h-10 w-10 rounded-xl bg-primary/12 ring-1 ring-primary/25 text-primary flex items-center justify-center shrink-0";
    if (url) {
      return (
        <a href={url} target="_blank" rel="noopener noreferrer" className={rowBase} onClick={(e) => e.stopPropagation()}>
          <div className={chip}><FolderOpen className="h-5 w-5" /></div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-sm font-semibold text-foreground">Abrir pasta no Drive</p>
            <p className="text-[11px] text-muted-foreground leading-snug">Faça o upload dos documentos do cliente</p>
          </div>
          <ExternalLink className="h-4 w-4 text-primary opacity-70 shrink-0" />
        </a>
      );
    }
    return (
      <button onClick={criar} disabled={creating} className={rowBase}>
        <div className={chip}>
          {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <FolderPlus className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-semibold text-foreground">{creating ? "Criando pasta no Drive…" : "Criar pasta no Drive"}</p>
          <p className="text-[11px] text-muted-foreground leading-snug">Este cliente ainda não tem pasta associada</p>
        </div>
      </button>
    );
  }

  // variant === "card" (default)
  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 hover:bg-primary/15 transition-colors"
        onClick={(e) => e.stopPropagation()}>
        <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
          <FolderOpen className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Abrir pasta no Drive</p>
          <p className="text-[11px] text-muted-foreground">Faça o upload dos documentos do cliente</p>
        </div>
        <ExternalLink className="h-4 w-4 text-primary opacity-70" />
      </a>
    );
  }
  return (
    <button onClick={criar} disabled={creating}
      className="w-full flex items-center gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60 px-4 py-3 transition-colors disabled:opacity-50">
      <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
        {creating ? <Loader2 className="h-5 w-5 text-primary animate-spin" /> : <FolderPlus className="h-5 w-5 text-primary" />}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-semibold">{creating ? "Criando pasta no Drive…" : "Criar pasta no Drive"}</p>
        <p className="text-[11px] text-muted-foreground">Este cliente ainda não tem pasta associada</p>
      </div>
    </button>
  );
}
