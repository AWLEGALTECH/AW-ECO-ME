import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Building2, Hammer, ClipboardList, ChevronLeft, Loader2, Check } from "lucide-react";
import { RUBRICAS_FECHAMENTO } from "@/lib/rubricasFechamento";

type Motivo = "rubrica_invalida" | "ja_ajuizada" | "cliente_nao_quer";
const MOTIVO_LABEL: Record<Motivo, string> = {
  rubrica_invalida: "Rúbrica inválida",
  ja_ajuizada: "Já ajuizada",
  cliente_nao_quer: "Cliente não quer",
};

type Estado = "fora" | "ajuizavel" | "bloqueada";
interface Item { rubrica: string; estado: Estado; motivo: Motivo; }

// Lê as rubricas de uma análise (aceita array direto ou { rubricas: [...] }).
function rubricasDaAnalise(ac: any): { rubrica: string; bloqueada: boolean; motivo: Motivo | null }[] {
  const arr = Array.isArray(ac) ? ac : ac?.rubricas;
  if (!Array.isArray(arr)) return [];
  return arr.map((r: any) => ({ rubrica: String(r?.rubrica ?? "").trim(), bloqueada: !!r?.bloqueada, motivo: r?.motivo ?? null }))
    .filter((r) => r.rubrica);
}

interface Props {
  open: boolean;
  onClose: () => void;
  cliente: { id: string; nome: string; analise_comercial?: any } | null;
  onSaved: () => void;
  editorId: string | null;
}

export function RefazerAnaliseComercialDialog({ open, onClose, cliente, onSaved, editorId }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [stage, setStage] = useState<"chooser" | "manual">("chooser");
  const [salvando, setSalvando] = useState(false);

  // Estado inicial do editor: catálogo + o que já existe na análise atual.
  const inicial = useMemo<Item[]>(() => {
    const atuais = rubricasDaAnalise(cliente?.analise_comercial);
    const byNorm = new Map(atuais.map((a) => [a.rubrica.toLowerCase(), a]));
    const catalogoLabels = RUBRICAS_FECHAMENTO.map((r) => r.label);
    const extras = atuais.filter((a) => !catalogoLabels.some((l) => l.toLowerCase() === a.rubrica.toLowerCase()));
    const base = [...catalogoLabels, ...extras.map((e) => e.rubrica)];
    return base.map((label) => {
      const at = byNorm.get(label.toLowerCase());
      return {
        rubrica: label,
        estado: (at ? (at.bloqueada ? "bloqueada" : "ajuizavel") : "fora") as Estado,
        motivo: (at?.motivo as Motivo) || "rubrica_invalida",
      };
    });
  }, [cliente?.analise_comercial]);

  const [itens, setItens] = useState<Item[]>(inicial);
  // Reinicia quando abre / troca de cliente.
  const [chaveInit, setChaveInit] = useState<string>("");
  const chaveAtual = `${cliente?.id || ""}|${open}`;
  if (open && chaveAtual !== chaveInit) {
    setChaveInit(chaveAtual);
    setItens(inicial);
    setStage("chooser");
  }

  const ajuizaveis = itens.filter((i) => i.estado === "ajuizavel").length;

  const setEstado = (idx: number, estado: Estado) =>
    setItens((old) => old.map((it, i) => (i === idx ? { ...it, estado } : it)));
  const setMotivo = (idx: number, motivo: Motivo) =>
    setItens((old) => old.map((it, i) => (i === idx ? { ...it, motivo } : it)));

  const irBradesco = () => {
    if (!cliente) return;
    onClose();
    navigate(`/finder?refazerComercial=${cliente.id}&refazerNome=${encodeURIComponent(cliente.nome)}`);
  };

  const salvarManual = async () => {
    if (!cliente) return;
    const incluidas = itens.filter((i) => i.estado !== "fora");
    if (incluidas.length === 0) {
      toast.error("Inclua ao menos uma rubrica (ajuizável ou bloqueada).");
      return;
    }
    setSalvando(true);
    const analise = {
      origem: "manual",
      rubricas: incluidas.map((i) => ({
        rubrica: i.rubrica,
        valor: null,
        bloqueada: i.estado === "bloqueada",
        motivo: i.estado === "bloqueada" ? i.motivo : null,
      })),
    };
    const { data, error } = await supabase.rpc("fn_refazer_analise_comercial" as any, {
      p_cliente_id: cliente.id,
      p_analise: analise,
      p_editor: editorId,
    } as any);
    setSalvando(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    // O recálculo mexe no quadro de fechamento. Sem invalidar, o cache
    // persistido (staleTime 30s) segue mostrando o valor antigo.
    qc.invalidateQueries({ queryKey: ["fechamentos"] });
    const r = (data as any) || {};
    toast.success(
      r.acao === "atualizado"
        ? `Análise refeita — fechamento de ${r.responsavel || "captador"}: ${r.antes} → ${r.depois} ação(ões).`
        : `Análise salva e fechamento criado (${r.depois} ação(ões)).`,
      { duration: 4000 },
    );
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[88dvh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {stage === "manual" && (
              <button onClick={() => setStage("chooser")} className="text-muted-foreground hover:text-foreground" aria-label="Voltar">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <ClipboardList className="h-5 w-5 text-primary" />
            Refazer análise comercial — {cliente?.nome}
          </DialogTitle>
          <DialogDescription>
            {stage === "chooser"
              ? "Escolha o tipo de análise. A nova substitui a anterior e recalcula o fechamento (mantendo quem captou)."
              : "Marque cada rubrica como ajuizável (conta), bloqueada (não conta) ou fora."}
          </DialogDescription>
        </DialogHeader>

        {stage === "chooser" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <button
              onClick={irBradesco}
              className="text-left rounded-xl border border-primary/30 bg-gradient-to-br from-primary/[0.13] to-transparent hover:border-primary/55 p-4 transition-colors"
            >
              <div className="h-10 w-10 rounded-xl bg-primary/15 ring-1 ring-primary/30 text-primary flex items-center justify-center mb-3">
                <Building2 className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold">Bradesco (Finder)</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Abre o Finder pra fazer uma nova análise do extrato. Ao salvar, volta pra cá.
              </p>
            </button>
            <button
              onClick={() => setStage("manual")}
              className="text-left rounded-xl border border-white/[0.08] bg-white/[0.03] hover:border-primary/40 hover:bg-white/[0.05] p-4 transition-colors"
            >
              <div className="h-10 w-10 rounded-xl bg-white/[0.05] ring-1 ring-white/10 text-foreground/80 flex items-center justify-center mb-3">
                <Hammer className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold">Não-Bradesco (manual)</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Monte a análise à mão a partir da lista de rubricas, marcando as ajuizáveis.
              </p>
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-1 py-1 shrink-0">
              <span className="text-[11px] text-muted-foreground">
                {ajuizaveis} ajuizável(is) = <strong className="text-foreground">{Math.max(1, ajuizaveis)}</strong> ação(ões) no fechamento
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
              {itens.map((it, i) => (
                <div key={it.rubrica} className={`flex items-center gap-2 px-3 py-2 ${it.estado === "bloqueada" ? "bg-amber-400/5" : it.estado === "ajuizavel" ? "bg-emerald-500/[0.04]" : ""}`}>
                  <span className={`text-[13px] flex-1 min-w-0 truncate ${it.estado === "fora" ? "text-muted-foreground/60" : it.estado === "bloqueada" ? "line-through decoration-amber-400/50 text-foreground/70" : ""}`}>
                    {it.rubrica}
                  </span>
                  {it.estado === "bloqueada" && (
                    <select
                      value={it.motivo}
                      onChange={(e) => setMotivo(i, e.target.value as Motivo)}
                      className="shrink-0 text-[11px] bg-background border border-amber-400/40 rounded-md px-1.5 py-1 text-amber-200"
                    >
                      {(Object.keys(MOTIVO_LABEL) as Motivo[]).map((m) => (
                        <option key={m} value={m}>{MOTIVO_LABEL[m]}</option>
                      ))}
                    </select>
                  )}
                  <div className="shrink-0 inline-flex rounded-md overflow-hidden border border-border text-[10px]">
                    {(["ajuizavel", "bloqueada", "fora"] as Estado[]).map((e) => (
                      <button
                        key={e}
                        onClick={() => setEstado(i, e)}
                        className={`px-2 py-1 transition-colors ${
                          it.estado === e
                            ? e === "ajuizavel" ? "bg-emerald-500/20 text-emerald-300"
                              : e === "bloqueada" ? "bg-amber-400/20 text-amber-300"
                              : "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted/40"
                        }`}
                      >
                        {e === "ajuizavel" ? "Ajuizável" : e === "bloqueada" ? "Bloqueada" : "Fora"}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter className="shrink-0 gap-2 pt-2">
              <Button variant="ghost" onClick={() => setStage("chooser")} disabled={salvando}>Voltar</Button>
              <Button onClick={salvarManual} disabled={salvando}>
                {salvando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                Salvar e recalcular
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
