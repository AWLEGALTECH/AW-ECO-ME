import { useState, useEffect, useCallback } from "react";
import { supabase, SUPABASE_FUNCTIONS_URL, SUPABASE_ANON_KEY } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Loader2, FolderOpen, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  folderId: string;
  clienteNome: string;
  // Acesso ao iframe do Finder (mesma origem) pra injetar os PDFs escolhidos
  // direto no <input type="file"> nativo dele — reaproveita o caminho de
  // ingestão do próprio Finder, sem precisar recompilar o bundle.
  getFinderInput: () => HTMLInputElement | null;
  getFinderWindow: () => Window | null;
}

function tamanhoLegivel(size?: string) {
  const n = size ? parseInt(size, 10) : NaN;
  if (!Number.isFinite(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Popup do eco que lista os PDFs da pasta do cliente no Drive e injeta os
// selecionados na análise do Finder. Substitui (no lado do eco) o seletor de
// documentos que o build antigo do Finder tinha embutido e que o build nativo
// do AW-FINDER não traz.
export function FinderDrivePicker({
  open, onOpenChange, folderId, clienteNome, getFinderInput, getFinderWindow,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<{ feito: number; total: number } | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    const { data, error } = await supabase.functions.invoke("list-drive-files", {
      body: { folder_id: folderId, mime_filter: ["application/pdf"] },
    });
    setLoading(false);
    if (error || !(data as any)?.ok) {
      setErro((data as any)?.error || error?.message || "Falha ao listar a pasta no Drive");
      return;
    }
    const fs = ((data as any).files || []) as DriveFile[];
    setFiles(fs);
    // Pré-seleciona só o que tem "extrato" no nome (o resto fica desmarcado).
    setSel(Object.fromEntries(fs.map((f) => [f.id, /extrato/i.test(f.name)])));
  }, [folderId]);

  useEffect(() => {
    if (open && folderId) carregar();
  }, [open, folderId, carregar]);

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setSel({});
      setErro(null);
      setProgresso(null);
    }
  }, [open]);

  const selecionados = files.filter((f) => sel[f.id]);
  const todosMarcados = files.length > 0 && selecionados.length === files.length;

  const toggleTodos = () => {
    if (todosMarcados) setSel({});
    else setSel(Object.fromEntries(files.map((f) => [f.id, true])));
  };

  const processar = async () => {
    if (!selecionados.length) return;
    const input = getFinderInput();
    const win = getFinderWindow();
    if (!input || !win) {
      toast.error("Não encontrei a área de upload do Finder. Recarregue a página e tente de novo.");
      return;
    }
    setEnviando(true);
    setProgresso({ feito: 0, total: selecionados.length });
    try {
      const dt = new (win as any).DataTransfer();
      for (let i = 0; i < selecionados.length; i++) {
        const f = selecionados[i];
        const resp = await fetch(`${SUPABASE_FUNCTIONS_URL}/fetch-drive-file`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ file_id: f.id }),
        });
        if (!resp.ok) throw new Error(`${f.name} (${resp.status})`);
        const buf = await resp.arrayBuffer();
        // Constrói o File/Uint8Array no realm do iframe pra evitar problemas
        // cross-realm ao atribuir em input.files.
        const bytes = new (win as any).Uint8Array(buf);
        const file = new (win as any).File([bytes], f.name, { type: f.mimeType || "application/pdf" });
        dt.items.add(file);
        setProgresso({ feito: i + 1, total: selecionados.length });
      }
      input.files = dt.files;
      input.dispatchEvent(new (win as any).Event("change", { bubbles: true }));
      toast.success(`${selecionados.length} documento(s) enviado(s) pra análise`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Falha ao carregar documentos: ${e?.message || e}`);
    } finally {
      setEnviando(false);
      setProgresso(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!enviando) onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" />
            Documentos da pasta de {clienteNome}
          </DialogTitle>
          <DialogDescription>
            Escolha os PDFs da pasta do cliente no Drive pra processar na análise — sem baixar pro computador.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Lendo a pasta no Drive…
          </div>
        ) : erro ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            <p className="text-sm text-muted-foreground max-w-xs">{erro}</p>
            <Button variant="outline" size="sm" onClick={carregar}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Tentar de novo
            </Button>
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <FileText className="h-6 w-6 opacity-50" />
            Nenhum PDF nesta pasta do Drive ainda.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <button
                onClick={toggleTodos}
                className="text-xs font-medium text-primary hover:underline"
              >
                {todosMarcados ? "Desmarcar todos" : "Selecionar todos"}
              </button>
              <span className="text-xs text-muted-foreground">
                {selecionados.length} de {files.length} selecionado(s)
              </span>
            </div>
            <ScrollArea className="max-h-[46vh] -mx-1 px-1">
              <ul className="space-y-1">
                {files.map((f) => (
                  <li key={f.id}>
                    <label className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5 cursor-pointer hover:bg-card/70 transition-colors">
                      <Checkbox
                        checked={!!sel[f.id]}
                        onCheckedChange={(v) => setSel((s) => ({ ...s, [f.id]: !!v }))}
                      />
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 min-w-0 truncate text-sm">{f.name}</span>
                      {f.size && (
                        <span className="text-[11px] text-muted-foreground shrink-0">{tamanhoLegivel(f.size)}</span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={processar} disabled={enviando || selecionados.length === 0}>
            {enviando ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                {progresso ? `Carregando ${progresso.feito}/${progresso.total}…` : "Carregando…"}
              </>
            ) : (
              <>Processar {selecionados.length || ""} documento(s)</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
