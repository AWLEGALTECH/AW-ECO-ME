import { useEffect, useRef, useState, type RefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Unlock, Save, ClipboardList, Loader2, Check } from "lucide-react";

// Camada comercial DO LADO DO ECO sobre o Finder (iframe same-origin):
//  - escuta o evento `aw-finder:analysis-ready` que o Finder já dispara e
//    captura as rubricas detectadas;
//  - INJETA, em cada card de rubrica, um controle de "bloquear" (rubrica não
//    ajuizável) + motivo — sem tocar no bundle do Finder;
//  - esconde o selo "Motor Ativo";
//  - salva a "análise comercial" (tabela analises_comerciais) com as flags.

type Motivo = "cliente_nao_quer" | "ja_ajuizada";

interface RubricaCaptada {
  rubrica: string;
  valor: number | null;
  bloqueada: boolean;
  motivo: Motivo | null;
}
interface AnaliseCaptada {
  nome: string;
  rubricas: RubricaCaptada[];
  fileName: string | null;
}

const fmtBRL = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const MOTIVO_LABEL: Record<Motivo, string> = {
  cliente_nao_quer: "Cliente não quer",
  ja_ajuizada: "Já ajuizada",
};

function extrairNome(meta: any, fileName: string | null): string {
  const cand = meta?.titular || meta?.nome || meta?.cliente || meta?.nomeCliente || meta?.holder;
  if (cand && String(cand).trim()) return String(cand).trim();
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

  // Ref sempre com a análise atual, pros handlers injetados no DOM do iframe.
  const analiseRef = useRef<AnaliseCaptada | null>(null);
  analiseRef.current = analise;
  const attachedWin = useRef<Window | null>(null);

  // ---- captura do evento do Finder ----
  useEffect(() => {
    const onReady = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setAnalise({
        nome: extrairNome(detail?.meta, detail?.fileName || null),
        rubricas: extrairRubricas(detail),
        fileName: detail?.fileName || null,
      });
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

  const toggleBloqueioLabel = (label: string) => {
    setAnalise((a) => {
      if (!a) return a;
      const rubricas = a.rubricas.map((r) =>
        r.rubrica === label
          ? (r.bloqueada ? { ...r, bloqueada: false, motivo: null } : { ...r, bloqueada: true, motivo: r.motivo || "cliente_nao_quer" })
          : r
      );
      return { ...a, rubricas };
    });
  };
  const setMotivoLabel = (label: string, motivo: Motivo) => {
    setAnalise((a) => a && { ...a, rubricas: a.rubricas.map((r) => r.rubrica === label ? { ...r, bloqueada: true, motivo } : r) });
  };
  const setRubrica = (i: number, patch: Partial<RubricaCaptada>) => {
    setAnalise((a) => a && { ...a, rubricas: a.rubricas.map((r, idx) => idx === i ? { ...r, ...patch } : r) });
  };

  // ---- injeção no DOM do iframe: esconde "Motor Ativo" + controle por card ----
  useEffect(() => {
    let obs: MutationObserver | null = null;
    let iv: ReturnType<typeof setInterval> | null = null;
    let raf = 0;

    const sync = () => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      try {
        // 1) esconder "Motor Ativo"
        const nodes = doc.querySelectorAll("span,div,button");
        for (const el of Array.from(nodes)) {
          if ((el as HTMLElement).dataset.awMotorHidden) continue;
          if (el.children.length === 0 && (el.textContent || "").trim() === "Motor Ativo") {
            const pill = (el.closest("div") as HTMLElement) || (el as HTMLElement);
            pill.style.display = "none";
            (el as HTMLElement).dataset.awMotorHidden = "1";
          }
        }

        // 2) controle de bloqueio por card de rubrica — rodapé integrado
        const a = analiseRef.current;
        if (!a || a.rubricas.length === 0) return;
        for (const r of a.rubricas) {
          const card = acharCard(doc, r.rubrica);
          if (!card) continue;
          // sinaliza bloqueio com uma barra de acento à esquerda (não dimeriza
          // o card inteiro, pra não atrapalhar a leitura).
          card.style.flexWrap = "wrap";
          card.style.boxShadow = r.bloqueada ? "inset 3px 0 0 #fbbf24" : "";

          let ctrl = card.querySelector(":scope > .aw-block-ctrl") as HTMLElement | null;
          if (!ctrl) {
            ctrl = doc.createElement("div");
            ctrl.className = "aw-block-ctrl";
            card.appendChild(ctrl);
          }
          desenharCtrl(doc, ctrl, r, { toggle: toggleBloqueioLabel, motivo: setMotivoLabel });
        }
      } catch { /* same-origin pode falhar em transições — ignora */ }
    };

    const agendar = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(sync); };

    const setup = () => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc || !doc.body) return;
      if (obs) obs.disconnect();
      obs = new MutationObserver(agendar);
      obs.observe(doc.body, { childList: true, subtree: true });
      sync();
    };

    setup();
    iv = setInterval(setup, 1500); // re-ata se o iframe recarregar
    return () => { if (obs) obs.disconnect(); if (iv) clearInterval(iv); cancelAnimationFrame(raf); };
  }, [iframeRef]);

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
    toast.success("Análise comercial salva — disponível no Writer.");
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
        {salvouId ? "Análise comercial salva ✓" : "Salvar análise comercial"}
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
              <ClipboardList className="h-5 w-5 text-primary" /> Salvar análise comercial
            </DialogTitle>
            <DialogDescription>
              Bloqueie as rubricas <strong>não ajuizáveis</strong> aqui ou direto nos cards do Finder. Fica salvo pro Writer e pra análise primária.
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
                  <button onClick={() => toggleBloqueioLabel(r.rubrica)} className={`shrink-0 ${r.bloqueada ? "text-amber-400" : "text-muted-foreground/50 hover:text-foreground"}`} title={r.bloqueada ? "Liberar" : "Marcar como não ajuizável"}>
                    {r.bloqueada ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                  </button>
                  <span className={`text-[13px] flex-1 min-w-0 truncate ${r.bloqueada ? "line-through decoration-amber-400/50 text-foreground/70" : ""}`}>{r.rubrica}</span>
                  <span className="text-[12px] tabular-nums text-muted-foreground shrink-0 w-24 text-right">{fmtBRL(r.valor)}</span>
                  {r.bloqueada ? (
                    <select value={r.motivo || "cliente_nao_quer"} onChange={(e) => setRubrica(i, { motivo: e.target.value as Motivo })}
                      className="shrink-0 text-[11px] bg-background border border-amber-400/40 rounded-md px-1.5 py-1 text-amber-200">
                      <option value="cliente_nao_quer">Cliente não quer</option>
                      <option value="ja_ajuizada">Já ajuizada</option>
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
              {salvouId ? "Salva" : "Salvar análise comercial"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Acha o card de rubrica no doc do Finder: o menor container que contém o
// label da rubrica E o texto "N ocorr." (evita pegar o título ou a página).
function acharCard(doc: Document, label: string): HTMLElement | null {
  const cands = doc.querySelectorAll("div,section,li,article");
  let best: HTMLElement | null = null;
  let bestLen = Infinity;
  for (const el of Array.from(cands) as HTMLElement[]) {
    const txt = el.textContent || "";
    if (txt.includes(label) && /\d+\s*ocorr/i.test(txt) && txt.length < 400) {
      if (txt.length < bestLen) { best = el; bestLen = txt.length; }
    }
  }
  return best;
}

// SVG de cadeado pequeno, herda a cor do texto (currentColor).
const LOCK_SVG =
  `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

// (Re)desenha o controle como um rodapé INTEGRADO ao card — usa as variáveis
// de tema do próprio Finder (--aw-*) pra parecer nativo.
function desenharCtrl(
  doc: Document,
  ctrl: HTMLElement,
  r: RubricaCaptada,
  on: { toggle: (l: string) => void; motivo: (l: string, m: Motivo) => void },
) {
  ctrl.style.cssText =
    "flex:0 0 100%;width:100%;margin-top:12px;padding-top:10px;border-top:1px solid var(--aw-border,rgba(255,255,255,0.1));" +
    "display:flex;align-items:center;gap:8px;font-family:Inter,system-ui,sans-serif;";

  const corBtn = r.bloqueada ? "#fbbf24" : "var(--aw-text-muted,rgba(255,255,255,0.6))";
  const bgBtn = r.bloqueada ? "rgba(251,191,36,0.12)" : "var(--aw-card-2,rgba(255,255,255,0.04))";
  const brBtn = r.bloqueada ? "rgba(251,191,36,0.5)" : "var(--aw-border,rgba(255,255,255,0.12))";

  const toggleBtn =
    `<button data-act="toggle" title="${r.bloqueada ? "Liberar rubrica" : "Marcar como não ajuizável"}" ` +
    `style="display:inline-flex;align-items:center;gap:6px;font:600 11px/1 Inter,sans-serif;padding:6px 10px;border-radius:8px;cursor:pointer;border:1px solid ${brBtn};background:${bgBtn};color:${corBtn};">` +
    `${LOCK_SVG}${r.bloqueada ? "Não ajuizável" : "Bloquear rubrica"}</button>`;

  const chip = (m: Motivo, ativo: boolean) =>
    `<button data-m="${m}" style="font:600 10px/1 Inter,sans-serif;padding:5px 8px;border-radius:7px;cursor:pointer;` +
    `border:1px solid ${ativo ? "#fbbf24" : "rgba(251,191,36,0.35)"};background:${ativo ? "rgba(251,191,36,0.18)" : "transparent"};color:#fbbf24;">${MOTIVO_LABEL[m]}</button>`;

  const motivos = r.bloqueada
    ? `<span style="font:500 10px/1 Inter,sans-serif;color:var(--aw-text-dim,rgba(255,255,255,0.4));margin-left:auto">Motivo:</span>` +
      chip("cliente_nao_quer", r.motivo === "cliente_nao_quer") +
      chip("ja_ajuizada", r.motivo === "ja_ajuizada")
    : "";

  ctrl.innerHTML = toggleBtn + motivos;

  // Não propaga o clique pro card (que abriria o drill-down).
  ctrl.onclick = (ev) => {
    ev.stopPropagation();
    const btn = (ev.target as HTMLElement).closest("button") as HTMLButtonElement | null;
    if (!btn) return;
    ev.preventDefault();
    if (btn.dataset.act === "toggle") on.toggle(r.rubrica);
    else if (btn.dataset.m) on.motivo(r.rubrica, btn.dataset.m as Motivo);
  };
}
