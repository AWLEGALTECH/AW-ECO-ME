import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CampoData } from "@/components/CampoData";
import { supabase } from "@/integrations/supabase/client";
import { Archive, Loader2, AlertTriangle, ArchiveRestore, ListX } from "lucide-react";

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
  // Quantas demandas o cliente tem na fila agora — é o que vai ser cancelado.
  // Dizer o número antes evita a surpresa de ver a esteira encolher depois.
  const [naFila, setNaFila] = useState<number | null>(null);

  // Reinicia ao abrir / trocar de cliente.
  const chave = `${cliente?.id ?? ""}|${open}`;
  const [chaveInit, setChaveInit] = useState("");
  if (open && chave !== chaveInit) {
    setChaveInit(chave);
    setUltimoContato(cliente?.ultimo_contato_em?.slice(0, 10) ?? "");
    setMotivo("");
    setNaFila(null);
  }

  useEffect(() => {
    if (!open || !cliente) return;
    let cancelado = false;
    (async () => {
      const { count } = await (supabase.from("demandas" as never) as never as any)
        .select("id", { count: "exact", head: true })
        .eq("cliente_id", cliente.id)
        .in("status", ["pendente", "em_andamento", "bloqueada"]);
      if (!cancelado) setNaFila(count ?? 0);
    })();
    return () => { cancelado = true; };
  }, [open, cliente?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const faltaData = !ultimoContato;
  const faltaMotivo = motivo.trim().length < 3;

  const arquivar = async () => {
    if (!cliente) return;
    if (faltaData) { toast.error("Informe a data da última tentativa de contato."); return; }
    if (faltaMotivo) { toast.error("Escreva por que este cliente está sendo arquivado."); return; }
    setSalvando(true);
    // Arquivar mexe em duas tabelas — o cliente e a fila de demandas dele — e
    // as duas têm que andar juntas: cliente arquivado com demanda viva volta a
    // aparecer no pipeline. Por isso a gravação é uma função só, no banco.
    const { data, error } = await supabase.rpc("fn_arquivar_cliente" as any, {
      p_cliente_id: cliente.id,
      p_ultimo_contato: ultimoContato,
      p_motivo: motivo.trim(),
      p_autor: autorId,
    } as any);
    setSalvando(false);
    if (error) { toast.error("Erro ao arquivar: " + error.message); return; }
    const n = Number((data as any)?.demandas_canceladas ?? 0);
    toast.success(
      n > 0
        ? `${cliente.nome} foi para os arquivados — ${n} ${n === 1 ? "demanda saiu" : "demandas saíram"} da esteira.`
        : `${cliente.nome} foi para os arquivados.`,
      { duration: 4000 },
    );
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

          {/* O que sai da esteira é a consequência menos óbvia de arquivar, e
              a que mexe no trabalho dos outros. Tem que estar dita antes. */}
          {naFila !== null && naFila > 0 && (
            <div className="rounded-lg border border-rose-400/30 bg-rose-400/[0.06] px-3.5 py-2.5 flex items-start gap-2.5">
              <ListX className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-[11.5px] text-muted-foreground leading-snug">
                <strong className="text-rose-200">
                  {naFila === 1 ? "1 demanda sai da esteira" : `${naFila} demandas saem da esteira`}
                </strong>{" "}
                — o pipeline deste cliente zera. Elas continuam na ficha dele, marcadas como
                canceladas por arquivamento, com o motivo que você escrever acima.
              </p>
            </div>
          )}

          <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.05] px-3.5 py-2.5 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11.5px] text-muted-foreground leading-snug">
              Dá pra desarquivar depois, na própria ficha — e a fila volta ao ponto em que parou.
              As duas informações acima ficam gravadas no cliente de qualquer forma.
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
    // Desfaz exatamente o que o arquivamento fez: devolve à esteira as demandas
    // que ELE cancelou, no status em que estavam. O motivo e a data do último
    // contato ficam — eles contam o que aconteceu, e isso continua verdade.
    const { data, error } = await supabase.rpc("fn_desarquivar_cliente" as any, {
      p_cliente_id: cliente.id,
    } as any);
    setSalvando(false);
    if (error) { toast.error("Erro ao desarquivar: " + error.message); return; }
    const n = Number((data as any)?.demandas_restauradas ?? 0);
    toast.success(
      n > 0
        ? `${cliente.nome} voltou aos ativos — ${n} ${n === 1 ? "demanda voltou" : "demandas voltaram"} para a esteira.`
        : `${cliente.nome} voltou para os clientes ativos.`,
      { duration: 4000 },
    );
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
