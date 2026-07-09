import { useEffect, useState, type RefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lock, ClipboardList } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DescontosAnaliseComercial, rubricasDaAnalise } from "@/components/DescontosAnaliseComercial";
import { instalarBloqueioFinder } from "@/lib/finderBloqueio";

const normRub = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const MOTIVO_LABEL: Record<string, string> = {
  ja_ajuizada: "já ajuizada",
  cliente_nao_quer: "cliente não quer",
};

// Dá CIÊNCIA + BLOQUEIO REAL, dentro do Finder da análise primária, das rubricas
// bloqueadas na análise comercial. Cadeado clicável abre confirmação de
// desbloqueio (com motivo e quem fez a comercial).
export function FinderCienciaComercial({ clienteId, nome, iframeRef }: { clienteId: string; nome: string; iframeRef?: RefObject<HTMLIFrameElement> }) {
  const [analise, setAnalise] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [desbloqueandoKey, setDesbloqueandoKey] = useState<string | null>(null);
  const [criador, setCriador] = useState<string | null>(null);
  const [travados, setTravados] = useState<number | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("clientes")
        .select("analise_comercial")
        .eq("id", clienteId)
        .single();
      if (!cancel) setAnalise((data as any)?.analise_comercial ?? null);
    })();
    return () => { cancel = true; };
  }, [clienteId]);

  // Quem fez a análise comercial (pra citar no diálogo de desbloqueio).
  useEffect(() => {
    const id = analise?.id;
    if (!id) { setCriador(null); return; }
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("analises_comerciais" as any)
        .select("created_by_email")
        .eq("id", id)
        .maybeSingle();
      if (!cancel) setCriador((data as any)?.created_by_email ?? null);
    })();
    return () => { cancel = true; };
  }, [analise?.id]);

  const rubricas = rubricasDaAnalise(analise);
  const bloqueadas = rubricas.filter((r) => r.bloqueada);
  const desbRub = desbloqueandoKey ? rubricas.find((r) => normRub(r.rubrica) === desbloqueandoKey) || null : null;

  // Bloqueio REAL no drill-down do Finder (mesma origem). Clicar no cadeado
  // pede desbloqueio (setDesbloqueandoKey).
  useEffect(() => {
    if (!iframeRef?.current || bloqueadas.length === 0) return;
    const set = new Set(bloqueadas.map((r) => normRub(r.rubrica)));
    setTravados(null);
    return instalarBloqueioFinder(iframeRef.current, set, (k) => setDesbloqueandoKey(k), (n) => setTravados(n));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analise, iframeRef?.current]);

  const confirmarDesbloqueio = async () => {
    if (!desbloqueandoKey) return;
    const rawArr: any[] = Array.isArray(analise) ? analise : (analise?.rubricas || []);
    const novasRubricas = rawArr.map((r: any) =>
      normRub(r?.rubrica) === desbloqueandoKey ? { ...r, bloqueada: false, motivo: null } : r,
    );
    const nova = Array.isArray(analise) ? novasRubricas : { ...analise, rubricas: novasRubricas };
    const { error } = await supabase.from("clientes").update({ analise_comercial: nova } as any).eq("id", clienteId);
    if (error) { toast.error("Erro ao desbloquear: " + error.message); return; }
    setAnalise(nova);
    setDesbloqueandoKey(null);
    toast.success("Desconto desbloqueado — agora pode ser considerado na análise primária.");
  };

  if (rubricas.length === 0) return null;

  return (
    <>
      {/* Faixa de aviso — sempre visível quando há bloqueios no comercial. */}
      {bloqueadas.length > 0 ? (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-amber-400/40 bg-amber-400/10 text-amber-100 text-xs overflow-x-auto">
          <Lock className="h-3.5 w-3.5 shrink-0 text-amber-300" />
          <span className="font-semibold shrink-0">Bloqueado no comercial (não reconsiderar):</span>
          <div className="flex items-center gap-1.5">
            {bloqueadas.map((r, i) => (
              <span key={i} className="inline-flex items-center gap-1 shrink-0 rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 line-through">
                {r.rubrica}
                {r.motivo && <span className="text-amber-200/70 no-underline">· {MOTIVO_LABEL[r.motivo] || r.motivo}</span>}
              </span>
            ))}
          </div>
          {travados != null && (
            <span className="shrink-0 text-[10px] text-amber-200/70 tabular-nums" title="descontos travados no drill-down">
              {travados}/{bloqueadas.length} travado{travados === 1 ? "" : "s"}
            </span>
          )}
          <button
            onClick={() => setOpen(true)}
            className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-md border border-amber-400/40 px-2 py-1 hover:bg-amber-400/15 transition-colors font-medium"
          >
            <ClipboardList className="h-3.5 w-3.5" /> ver análise comercial
          </button>
        </div>
      ) : (
        <div className="shrink-0 flex items-center gap-2 px-4 py-1.5 border-b border-border/60 bg-card/40 text-[11px] text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5 text-primary" />
          Este cliente tem análise comercial.
          <button onClick={() => setOpen(true)} className="text-primary hover:underline font-medium">ver descontos</button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" /> Análise comercial de {nome}
            </DialogTitle>
            <DialogDescription>
              Decisões tomadas no comercial. Os descontos <strong>bloqueados</strong> foram descartados e não devem ser reconsiderados na análise primária.
            </DialogDescription>
          </DialogHeader>
          <DescontosAnaliseComercial analise={analise} />
        </DialogContent>
      </Dialog>

      {/* Confirmação de desbloqueio — disparada ao clicar no cadeado do card. */}
      <AlertDialog open={!!desbRub} onOpenChange={(o) => { if (!o) setDesbloqueandoKey(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-400" /> Desbloquear “{desbRub?.rubrica}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta rubrica foi <strong>bloqueada na análise comercial</strong>
              {criador ? <> de <strong>{criador}</strong></> : null}
              {desbRub?.motivo ? <>, com o motivo <strong>“{MOTIVO_LABEL[desbRub.motivo] || desbRub.motivo}”</strong></> : null}.
              {" "}Desbloquear vai permitir que ela seja considerada na análise primária.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarDesbloqueio} className="bg-amber-600 hover:bg-amber-500 text-white">
              Desbloquear mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
