import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CampoData } from "@/components/CampoData";
import { supabase } from "@/integrations/supabase/client";
import { Archive, Loader2, AlertTriangle, ArchiveRestore } from "lucide-react";

/**
 * Arquivar tira o cliente da lista de ativos, e as duas perguntas aqui não são
 * burocracia: quem abrir a ficha desse cliente meses depois precisa saber, sem
 * perguntar pra ninguém, quando foi a última vez que se tentou falar com ele e
 * por que se desistiu. Por isso as duas são obrigatórias — arquivar sem elas
 * seria só esconder o cliente.
 */
export function ArquivarClienteDialog({ open, onClose, cliente, autorId, onArquivado }: {
  open: boolean;
  onClose: () => void;
  cliente: { id: string; nome: string; ultimo_contato_em?: string | null } | null;
  autorId: string | null;
  onArquivado: () => void;
}) {
  const [ultimoContato, setUltimoContato] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Reinicia ao abrir / trocar de cliente.
  const chave = `${cliente?.id ?? ""}|${open}`;
  const [chaveInit, setChaveInit] = useState("");
  if (open && chave !== chaveInit) {
    setChaveInit(chave);
    setUltimoContato(cliente?.ultimo_contato_em?.slice(0, 10) ?? "");
    setMotivo("");
  }

  const faltaData = !ultimoContato;
  const faltaMotivo = motivo.trim().length < 3;

  const arquivar = async () => {
    if (!cliente) return;
    if (faltaData) { toast.error("Informe a data da última tentativa de contato."); return; }
    if (faltaMotivo) { toast.error("Escreva por que este cliente está sendo arquivado."); return; }
    setSalvando(true);
    const { error } = await (supabase.from("clientes" as never) as never as any)
      .update({
        arquivado_em: new Date().toISOString(),
        arquivado_por: autorId,
        arquivado_motivo: motivo.trim(),
        ultimo_contato_em: ultimoContato,
      })
      .eq("id", cliente.id);
    setSalvando(false);
    if (error) { toast.error("Erro ao arquivar: " + error.message); return; }
    toast.success(`${cliente.nome} foi para os arquivados.`);
    onArquivado();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !salvando) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-amber-400" />
            Arquivar {cliente?.nome}
          </DialogTitle>
          <DialogDescription>
            Ele sai da lista de clientes ativos e passa a viver na área de arquivados.
            Nada é apagado — processos, contratos e histórico continuam onde estão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Última tentativa de contato <span className="text-amber-400">*</span>
            </label>
            <CampoData valor={ultimoContato} onChange={setUltimoContato} />
            <p className="text-[11px] text-muted-foreground leading-snug">
              Quando alguém falou — ou tentou falar — com este cliente pela última vez.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Por que está sendo arquivado <span className="text-amber-400">*</span>
            </label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              placeholder="Ex.: telefone fora de serviço desde junho, três tentativas por WhatsApp sem resposta e nenhum retorno ao e-mail."
              className="text-[13px] resize-none"
            />
            <p className="text-[11px] text-muted-foreground leading-snug">
              Escreva pensando em quem vai abrir esta ficha daqui a seis meses sem saber de nada.
            </p>
          </div>

          <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.05] px-3.5 py-2.5 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-muted-foreground leading-snug">
              Dá pra desarquivar depois, na própria ficha. As duas informações acima ficam
              gravadas no cliente de qualquer forma.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button
            onClick={arquivar}
            disabled={salvando || faltaData || faltaMotivo}
            className="bg-amber-500/90 hover:bg-amber-500 text-black"
          >
            {salvando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Archive className="h-4 w-4 mr-1.5" />}
            Arquivar cliente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Desarquivar é o caminho de volta: some o carimbo, o cliente reaparece nos ativos. */
export function DesarquivarClienteDialog({ open, onClose, cliente, onDesarquivado }: {
  open: boolean;
  onClose: () => void;
  cliente: { id: string; nome: string } | null;
  onDesarquivado: () => void;
}) {
  const [salvando, setSalvando] = useState(false);

  const desarquivar = async () => {
    if (!cliente) return;
    setSalvando(true);
    // O motivo e a data do último contato ficam: eles contam o que aconteceu
    // com este cliente, e isso continua sendo verdade depois de desarquivar.
    const { error } = await (supabase.from("clientes" as never) as never as any)
      .update({ arquivado_em: null, arquivado_por: null })
      .eq("id", cliente.id);
    setSalvando(false);
    if (error) { toast.error("Erro ao desarquivar: " + error.message); return; }
    toast.success(`${cliente.nome} voltou para os clientes ativos.`);
    onDesarquivado();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !salvando) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArchiveRestore className="h-5 w-5 text-primary" />
            Desarquivar {cliente?.nome}
          </DialogTitle>
          <DialogDescription>
            Ele volta para a lista de clientes ativos. O motivo do arquivamento e a data do
            último contato continuam registrados na ficha.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button onClick={desarquivar} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ArchiveRestore className="h-4 w-4 mr-1.5" />}
            Desarquivar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
