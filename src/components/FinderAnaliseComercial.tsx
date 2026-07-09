import { useEffect, useRef, useState, type RefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Unlock, Save, ClipboardList, Loader2, Check } from "lucide-react";

// Ponte comercial DO LADO DO ECO sobre o Finder (iframe same-origin):
// escuta o evento `aw-finder:analysis-ready` que o Finder já dispara, captura
// as rubricas detectadas e abre um popup pra salvar a "análise comercial"
// (tabela analises_comerciais) marcando as rubricas NÃO ajuizáveis.
//
// OBS: é uma PONTE temporária pro bundle atual do Finder. Quando o build
// nativo do AW-FINDER (que já tem o botão "não ajuizável" embutido) for
// copiado pra public/finder-app/, este componente pode ser removido.

type Motivo = "cliente_nao_quer" | "ja_ajuizada";

interface RubricaCaptada { rubrica: string; valor: number | null; bloqueada: boolean; motivo: Motivo | null; }
interface AnaliseCaptada { nome: string; rubricas: RubricaCaptada[]; fileName: string | null; }

const fmtBRL = (v: number | null) =>
  v == null ? "-" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function extrairNome(meta: any, fileName: string | null): string {
  // O bundle atual do Finder expõe o titular em `meta.clientName`; mantemos os
  // demais por compatibilidade. Ignora o placeholder "CLIENTE".
  const cand = meta?.clientName || meta?.titular || meta?.nome || meta?.cliente || meta?.nomeCliente || meta?.holder;
  if (cand && String(cand).trim() && String(cand).trim().toUpperCase() !== "CLIENTE") return String(cand).trim();
  if (fileName) return String(fileName).replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  return "";
}

function extrairRubricas(detail: any): RubricaCaptada[] {
  const det = detail?.rubricasDetalhadas;
  const out: RubricaCaptada[] = [];
  if (Array.isArray(det)) {
    for (const g of det) {
      const label = g?.cat?.label || g?.label || g?.rubrica || g?.nome;
      if (!label) continue;
      let valor: number | null = null;
      if (Array.isArray(g?.items)) valor = g.items.reduce((s: number, it: any) => s + (Number(it?.valor) || 0), 0) || null;
      else if (g?.total != null) valor = Number(g.total) || null;
      else if (g?.valor != null) valor = Number(g.valor) || null;
      out.push({ rubrica: String(label), valor, bloqueada: false, motivo: null });
    }
  }
  if (out.length === 0 && Array.isArray(detail?.rubricas)) {
    for (const r of detail.rubricas) {
      const label = typeof r === "string" ? r : (r?.label || r?.rubrica || r?.nome);
      if (label) out.push({ rubrica: String(label), valor: Number(r?.valor) || null, bloqueada: false, motivo: null });
    }
  }
  return out;
}

export function FinderAnaliseComercial({ iframeRef }: { iframeRef: RefObject<HTMLIFrameElement> }) {
  const { user } = useAuth();
  const [analise, setAnalise] = useState<AnaliseCaptada | null>(null);
  const [open, setOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvouId, setSalvouId] = useState<string | null>(null);
  const attachedWin = useRef<Window | null>(null);

  useEffect(() => {
    const onReady = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setAnalise({ nome: extrairNome(detail?.meta, detail?.fileName || null), rubricas: extrairRubricas(detail), fileName: detail?.fileName || null });
      setSalvouId(null);
    };
    const onReset = () => { setAnalise(null); setSalvouId(null); };
    const attach = () => {
      const win = iframeRef.current?.contentWindow as Window | null;
      if (!win || win === attachedWin.current) return;
      if (attachedWin.current) {
        attachedWin.current.removeEventListener("aw-finder:analysis-ready", onReady as EventListener);
        attachedWin.current.removeEventListener("aw-finder:reset", onReset as EventListener);
      }
      win.addEventListener("aw-finder:analysis-ready", onReady as EventListener);
      win.addEventListener("aw-finder:reset", onReset as EventListener);
      attachedWin.current = win;
    };
    attach();
    const iv = setInterval(attach, 1500);
    return () => {
      clearInterval(iv);
      if (attachedWin.current) {
        attachedWin.current.removeEventListener("aw-finder:analysis-ready", onReady as EventListener);
        attachedWin.current.removeEventListener("aw-finder:reset", onReset as EventListener);
        attachedWin.current = null;
      }
    };
  }, [iframeRef]);

  const toggleBloqueio = (i: number) => {
    setAnalise((a) => {
      if (!a) return a;
      const rubricas = a.rubricas.map((r, idx) =>
        idx === i ? (r.bloqueada ? { ...r, bloqueada: false, motivo: null } : { ...r, bloqueada: true, motivo: r.motivo || "ja_ajuizada" }) : r
      );
      return { ...a, rubricas };
    });
  };
  const setRubrica = (i: number, patch: Partial<RubricaCaptada>) =>
    setAnalise((a) => a && { ...a, rubricas: a.rubricas.map((r, idx) => idx === i ? { ...r, ...patch } : r) });

  const salvar = async () => {
    if (!analise) return;
    if (!analise.nome.trim()) { toast.error("Informe o nome do cliente."); return; }
    setSalvando(true);
    const payload = {
      nome: analise.nome.trim(),
      origem: "finder",
      created_by: user?.id || null,
      created_by_email: user?.email || null,
      rubricas: analise.rubricas.map((r) => ({ rubrica: r.rubrica, valor: r.valor, bloqueada: r.bloqueada, motivo: r.bloqueada ? r.motivo : null })),
    };
    const { data, error } = await supabase.from("analises_comerciais" as any).insert(payload as any).select("id").single();
    setSalvando(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    setSalvouId((data as any)?.id || "ok");
    toast.success("Análise comercial gerada. Disponível no Writer.");
  };

  if (!analise) return null;
  const nBloq = analise.rubricas.filter((r) => r.bloqueada).length;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium shadow-lg shadow-black/30 hover:brightness-110 transition"
      >
        <ClipboardList className="h-4 w-4" />
        {salvouId ? "Análise comercial gerada" : "Gerar análise comercial"}
        {!salvouId && nBloq > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] bg-amber-400/20 text-amber-200 rounded-full px-1.5">
            <Lock className="h-3 w-3" /> {nBloq}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" /> Gerar análise comercial
            </DialogTitle>
            <DialogDescription>
              Marque as rubricas <strong>não ajuizáveis</strong> (cliente não quer ou já ajuizada). Fica salvo pro Writer e pra análise primária.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nome do cliente *</Label>
                <Input value={analise.nome} onChange={(e) => setAnalise((a) => a && { ...a, nome: e.target.value })} placeholder="Nome do titular" />
              </div>
              <div className="flex items-end text-[11px] text-muted-foreground">
                {analise.rubricas.length} rubrica(s) · {nBloq} marcada(s) como não ajuizável(is)
              </div>
            </div>

            <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
              {analise.rubricas.length === 0 ? (
                <p className="text-center text-[12px] text-muted-foreground py-6">Nenhuma rubrica capturada.</p>
              ) : analise.rubricas.map((r, i) => (
                <div key={i} className={`flex items-center gap-2 px-3 py-2 ${r.bloqueada ? "bg-amber-400/5" : ""}`}>
                  <button onClick={() => toggleBloqueio(i)} className={`shrink-0 ${r.bloqueada ? "text-amber-400" : "text-muted-foreground/50 hover:text-foreground"}`} title={r.bloqueada ? "Liberar" : "Marcar como não ajuizável"}>
                    {r.bloqueada ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                  </button>
                  <span className={`text-[13px] flex-1 min-w-0 truncate ${r.bloqueada ? "line-through decoration-amber-400/50 text-foreground/70" : ""}`}>{r.rubrica}</span>
                  <span className="text-[12px] tabular-nums text-muted-foreground shrink-0 w-24 text-right">{fmtBRL(r.valor)}</span>
                  {r.bloqueada ? (
                    <select value={r.motivo || "ja_ajuizada"} onChange={(e) => setRubrica(i, { motivo: e.target.value as Motivo })}
                      className="shrink-0 text-[11px] bg-background border border-amber-400/40 rounded-md px-1.5 py-1 text-amber-200">
                      <option value="ja_ajuizada">Já ajuizada</option>
                      <option value="cliente_nao_quer">Cliente não quer</option>
                    </select>
                  ) : <span className="shrink-0 w-[104px]" />}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
            <Button onClick={salvar} disabled={salvando || !!salvouId}>
              {salvando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : salvouId ? <Check className="h-4 w-4 mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
              {salvouId ? "Gerada" : "Gerar análise comercial"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
