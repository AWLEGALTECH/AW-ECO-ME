import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lock, ClipboardList } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DescontosAnaliseComercial, rubricasDaAnalise } from "@/components/DescontosAnaliseComercial";

const MOTIVO_LABEL: Record<string, string> = {
  ja_ajuizada: "já ajuizada",
  cliente_nao_quer: "cliente não quer",
};

// Dá CIÊNCIA, dentro do Finder da análise primária (modo cliente-vinculado),
// do que foi decidido na análise comercial daquele cliente. Faixa fixa com os
// descontos BLOQUEADOS (não reconsiderar) + painel completo ao clicar.
export function FinderCienciaComercial({ clienteId, nome }: { clienteId: string; nome: string }) {
  const [analise, setAnalise] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

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

  const rubricas = rubricasDaAnalise(analise);
  if (rubricas.length === 0) return null;
  const bloqueadas = rubricas.filter((r) => r.bloqueada);

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
          <button
            onClick={() => setOpen(true)}
            className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-md border border-amber-400/40 px-2 py-1 hover:bg-amber-400/15 transition-colors font-medium"
          >
            <ClipboardList className="h-3.5 w-3.5" /> ver análise comercial
          </button>
        </div>
      ) : (
        // Só ajuizáveis (nenhum bloqueio) — botão discreto pra consultar.
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
    </>
  );
}
