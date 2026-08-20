import { useEffect, useRef, useState, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
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

type Motivo = "cliente_nao_quer" | "ja_ajuizada" | "rubrica_invalida";

interface RubricaCaptada { rubrica: string; valor: number | null; bloqueada: boolean; motivo: Motivo | null; naoReembolsavel?: boolean; }
interface AnaliseCaptada { nome: string; rubricas: RubricaCaptada[]; fileName: string | null; }

const fmtBRL = (v: number | null) =>
  v == null ? "-" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const normRub = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function extrairNome(meta: any, fileName: string | null): string {
  // O bundle atual do Finder expõe o titular em `meta.clientName`; mantemos os
  // demais por compatibilidade. Ignora o placeholder "CLIENTE".
  const cand = meta?.clientName || meta?.titular || meta?.nome || meta?.cliente || meta?.nomeCliente || meta?.holder;
  if (cand && String(cand).trim() && String(cand).trim().toUpperCase() !== "CLIENTE") return String(cand).trim();
  if (fileName) return String(fileName).replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  return "";
}

// Soma o valor de um grupo (formatos variados do bundle).
function valorDoGrupo(g: any): number | null {
  if (Array.isArray(g?.items)) return g.items.reduce((s: number, it: any) => s + (Number(it?.valor) || 0), 0) || null;
  if (g?.total != null) return Number(g.total) || null;
  if (g?.valor != null) return Number(g.valor) || null;
  return null;
}

// Capta TODAS as rubricas que o Finder mostra no drill-down por categoria,
// inclusive as NÃO REEMBOLSÁVEIS (ex.: Invest Fácil). O evento expõe:
//   - `grouped`: lista COMPLETA (Object.values do agrupamento, com naoReembolsavel)
//   - `rubricasDetalhadas`/`rubricas`: só o subconjunto reembolsável
// Então priorizamos `grouped` e fazemos união com o resto por segurança —
// assim tudo que aparece no drill-down pode ser bloqueado na análise comercial.
function extrairRubricas(detail: any): RubricaCaptada[] {
  const byKey = new Map<string, RubricaCaptada>();
  const add = (label: any, valor: number | null, naoReemb: boolean) => {
    const rub = String(label ?? "").trim();
    if (!rub) return;
    const k = normRub(rub);
    const prev = byKey.get(k);
    if (prev) {
      if (prev.valor == null && valor != null) prev.valor = valor;
      if (naoReemb) prev.naoReembolsavel = true;
      return;
    }
    byKey.set(k, { rubrica: rub, valor, bloqueada: false, motivo: null, naoReembolsavel: naoReemb });
  };

  // 1) grouped — lista completa (inclui não reembolsáveis)
  if (Array.isArray(detail?.grouped)) {
    for (const g of detail.grouped) {
      add(g?.cat?.label ?? g?.label ?? g?.rubrica ?? g?.nome, valorDoGrupo(g), !!g?.cat?.naoReembolsavel);
    }
  }
  // 2) rubricasDetalhadas — reembolsáveis (união por segurança)
  if (Array.isArray(detail?.rubricasDetalhadas)) {
    for (const g of detail.rubricasDetalhadas) {
      add(g?.cat?.label ?? g?.label ?? g?.rubrica ?? g?.nome, valorDoGrupo(g), false);
    }
  }
  // 3) fallback final: lista simples de rubricas
  if (byKey.size === 0 && Array.isArray(detail?.rubricas)) {
    for (const r of detail.rubricas) {
      const label = typeof r === "string" ? r : (r?.label ?? r?.rubrica ?? r?.nome);
      add(label, typeof r === "string" ? null : (Number(r?.valor) || null), false);
    }
  }
  return [...byKey.values()];
}

export function FinderAnaliseComercial({
  iframeRef,
  refazerClienteId = null,
  refazerNome = null,
}: {
  iframeRef: RefObject<HTMLIFrameElement>;
  // Quando setado, o salvar NÃO cria no catálogo — refaz a análise comercial
  // deste cliente (recalcula o fechamento) e volta pro perfil dele.
  refazerClienteId?: string | null;
  refazerNome?: string | null;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const refazendo = !!refazerClienteId;
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
        idx === i ? (r.bloqueada ? { ...r, bloqueada: false, motivo: null } : { ...r, bloqueada: true, motivo: r.motivo || "rubrica_invalida" }) : r
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
    const rubricas = analise.rubricas.map((r) => ({
      rubrica: r.rubrica, valor: r.valor, bloqueada: r.bloqueada, motivo: r.bloqueada ? r.motivo : null,
    }));

    // Modo REFAZER: recalcula a análise/fechamento deste cliente e volta.
    if (refazendo) {
      // Sem p_creditar_a: refazer a análise inteira pelo Finder não é a mesma
      // coisa que acrescentar uma ação pontual, e não há uma pergunta de
      // responsabilização aqui. As ações novas seguem o crédito de quem já
      // respondia pelo cliente — que é o comportamento de sempre.
      const { data, error } = await supabase.rpc("fn_editar_analise_comercial" as any, {
        p_cliente_id: refazerClienteId,
        p_analise: { origem: "finder", rubricas },
        p_editor: user?.id || null,
      } as any);
      setSalvando(false);
      if (error) { toast.error("Erro ao salvar: " + error.message); return; }
      // Recalculou o fechamento no banco — invalida o quadro pra não ficar
      // preso no cache velho (staleTime 30s + persistência em localStorage).
      qc.invalidateQueries({ queryKey: ["fechamentos"] });
      const r = (data as any) || {};
      setSalvouId("ok");
      const partes = [
        r.novas > 0 ? `${r.novas} ${r.novas === 1 ? "ação nova" : "ações novas"} para ${r.creditadas_a || "—"}` : null,
        r.removidas > 0 ? `${r.removidas} ${r.removidas === 1 ? "retirada" : "retiradas"}` : null,
      ].filter(Boolean);
      toast.success(partes.length ? `Análise refeita — ${partes.join(" · ")}.` : "Análise refeita.", { duration: 4000 });
      setTimeout(() => navigate(`/clientes/${refazerClienteId}`), 900);
      return;
    }

    const payload = {
      nome: analise.nome.trim(),
      origem: "finder",
      created_by: user?.id || null,
      created_by_email: user?.email || null,
      rubricas,
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
        className={`fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg shadow-black/30 hover:brightness-110 transition ${
          salvouId ? "bg-emerald-600 text-white" : "bg-primary text-primary-foreground"
        }`}
      >
        {salvouId ? <Check className="h-4 w-4" strokeWidth={3} /> : <ClipboardList className="h-4 w-4" />}
        {salvouId
          ? (refazendo ? "Análise refeita" : "Análise comercial gerada")
          : (refazendo ? `Salvar nova análise${refazerNome ? " de " + refazerNome : ""}` : "Gerar análise comercial")}
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
              <ClipboardList className="h-5 w-5 text-primary" />
              {refazendo ? `Refazer análise comercial${refazerNome ? " — " + refazerNome : ""}` : "Gerar análise comercial"}
            </DialogTitle>
            <DialogDescription>
              {refazendo
                ? <>Marque as <strong>não ajuizáveis</strong>. Ao salvar, esta análise <strong>substitui</strong> a anterior deste cliente e <strong>recalcula o fechamento</strong> (mantendo quem captou).</>
                : <>Todas as rubricas do drill-down aparecem aqui. Marque as <strong>não ajuizáveis</strong> (rúbrica inválida, já ajuizada ou cliente não quer). Fica salvo pro Writer e pra análise primária.</>}
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
                  <span className={`text-[13px] flex-1 min-w-0 truncate ${r.bloqueada ? "line-through decoration-amber-400/50 text-foreground/70" : ""}`}>
                    {r.rubrica}
                    {r.naoReembolsavel && (
                      <span className="ml-1.5 align-middle no-underline text-[9px] uppercase tracking-wide text-amber-300/90 bg-amber-400/10 border border-amber-400/25 rounded px-1 py-0.5">não reembolsável</span>
                    )}
                  </span>
                  <span className="text-[12px] tabular-nums text-muted-foreground shrink-0 w-24 text-right">{fmtBRL(r.valor)}</span>
                  {r.bloqueada ? (
                    <select value={r.motivo || "rubrica_invalida"} onChange={(e) => setRubrica(i, { motivo: e.target.value as Motivo })}
                      className="shrink-0 text-[11px] bg-background border border-amber-400/40 rounded-md px-1.5 py-1 text-amber-200">
                      <option value="rubrica_invalida">Rúbrica inválida</option>
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
              {salvouId ? (refazendo ? "Salva" : "Gerada") : refazendo ? "Salvar e recalcular" : "Gerar análise comercial"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
