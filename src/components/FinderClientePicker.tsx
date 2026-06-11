import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Loader2, Search, User, FolderOpen } from "lucide-react";

export interface ClienteEscolhido {
  id: string;
  nome: string;
  folderId: string;
  driveUrl: string;
}

interface ClienteRow {
  id: string;
  nome: string;
  drive_folder_url: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (c: ClienteEscolhido) => void;
}

function folderIdDe(url: string | null): string | null {
  return url?.match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] || null;
}

// Seletor de cliente pro Finder padrão (não vinculado): o usuário escolhe de
// qual cliente quer puxar os documentos do Drive. No modo de análise primária
// isso não aparece — já vai direto na pasta do cliente da sessão.
export function FinderClientePicker({ open, onOpenChange, onPick }: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ClienteRow[]>([]);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (!open) return;
    setBusca("");
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("clientes")
        .select("id, nome, drive_folder_url")
        .order("nome", { ascending: true });
      setRows((data || []) as ClienteRow[]);
      setLoading(false);
    })();
  }, [open]);

  // Só faz sentido listar quem tem pasta no Drive (de onde puxar os docs).
  const comPasta = useMemo(() => rows.filter((r) => !!folderIdDe(r.drive_folder_url)), [rows]);
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return comPasta;
    return comPasta.filter((r) => r.nome.toLowerCase().includes(q));
  }, [comPasta, busca]);

  const escolher = (r: ClienteRow) => {
    const fid = folderIdDe(r.drive_folder_url);
    if (!fid) return;
    onPick({ id: r.id, nome: r.nome, folderId: fid, driveUrl: r.drive_folder_url! });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" />
            Puxar documentos de qual cliente?
          </DialogTitle>
          <DialogDescription>
            Escolha o cliente pra ver e selecionar os PDFs da pasta dele no Drive.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente…"
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando clientes…
          </div>
        ) : filtrados.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {comPasta.length === 0
              ? "Nenhum cliente com pasta no Drive ainda."
              : "Nenhum cliente encontrado."}
          </div>
        ) : (
          <ScrollArea className="max-h-[46vh] -mx-1 px-1">
            <ul className="space-y-1">
              {filtrados.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => escolher(r)}
                    className="w-full flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5 text-left hover:bg-card/70 hover:border-primary/50 transition-colors"
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <span className="flex-1 min-w-0 truncate text-sm font-medium">{r.nome}</span>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
