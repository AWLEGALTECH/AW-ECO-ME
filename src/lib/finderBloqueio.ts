// Bloqueio REAL, do lado do ECO, das linhas do drill-down do Finder que foram
// bloqueadas na análise comercial. O iframe do Finder é MESMA ORIGEM, então dá
// pra ler o DOM dele e bloquear — sem editar o bundle compilado.
//
// Mesmo cliente + mesmos extratos = análise determinística, então o `cat.label`
// que o Finder renderiza é idêntico à `rubrica` salva na análise comercial — o
// casamento por nome (normalizado, exato) é confiável.
//
// Duas camadas:
//  1. ENFORCEMENT (garantido): delegação de clique em fase de captura no
//     document do iframe. A cada clique, sobe do alvo até o card; se o card for
//     de um desconto bloqueado, cancela o evento. Independe de achar o card
//     antes e sobrevive a qualquer re-render do React.
//  2. VISUAL: cadeado como FILHO do card (position:absolute; inset:0 — sem
//     `fixed`, imune a ancestral com transform). Se o React tirar no re-render,
//     o MutationObserver recoloca.
//
// Defensivo: se a estrutura não bater, não faz nada — nunca quebra o Finder.

const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function primeiroTextoDireto(el: Element): string {
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3 && n.textContent && n.textContent.trim()) return n.textContent;
  }
  return "";
}

// Sobe até o card da categoria. Âncora: animação de entrada `cIn` (exclusiva dos
// cards); com fallback pra cursor:pointer + borderRadius 12px.
function acharCard(el: Element | null): HTMLElement | null {
  let cur = el as HTMLElement | null;
  for (let i = 0; i < 14 && cur; i++) {
    const st = cur.style;
    if (st) {
      if ((st.animation || "").indexOf("cIn") !== -1) return cur;
      if (st.cursor === "pointer" && st.borderRadius === "12px") return cur;
    }
    cur = cur.parentElement;
  }
  return null;
}

// O card tem, entre seus descendentes, um título cujo texto direto é o label da
// categoria. Casa contra o conjunto de bloqueadas.
function cardBloqueado(card: Element, bloqueadas: Set<string>): boolean {
  const els = card.querySelectorAll("div,span");
  for (const el of Array.from(els)) {
    const t = norm(primeiroTextoDireto(el));
    if (t && bloqueadas.has(t)) return true;
  }
  return false;
}

const EVTS = ["click", "mousedown", "pointerdown", "mouseup", "pointerup", "dblclick"] as const;

export function instalarBloqueioFinder(iframe: HTMLIFrameElement | null, bloqueadas: Set<string>): () => void {
  if (!iframe || bloqueadas.size === 0) return () => {};

  let doc: Document | null = null;
  let obs: MutationObserver | null = null;
  let iv: ReturnType<typeof setInterval> | null = null;
  let tries = 0;

  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    (e as any).stopImmediatePropagation?.();
  };

  // Camada 1 — enforcement por delegação.
  const onEvt = (e: Event) => {
    const card = acharCard(e.target as Element);
    if (card && cardBloqueado(card, bloqueadas)) swallow(e);
  };

  // Camada 2 — overlay visual filho do card.
  const marcar = () => {
    if (!doc) return;
    const cards = doc.querySelectorAll<HTMLElement>("div");
    cards.forEach((card) => {
      const st = card.style;
      if (!st || (st.animation || "").indexOf("cIn") === -1) return;
      if (!cardBloqueado(card, bloqueadas)) return;
      if (card.querySelector(':scope > [data-aw-lock="1"]')) return;
      if (!st.position || st.position === "static") card.style.position = "relative";
      const ov = doc!.createElement("div");
      ov.setAttribute("data-aw-lock", "1");
      ov.style.cssText =
        "position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;gap:8px;border-radius:12px;background:rgba(8,8,10,0.62);border:1px solid rgba(251,191,36,0.55);cursor:not-allowed;color:#fbbf24;font:700 10px Inter,sans-serif;letter-spacing:.09em;pointer-events:auto;user-select:none";
      ov.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span>BLOQUEADO NO COMERCIAL</span>';
      EVTS.forEach((ev) => ov.addEventListener(ev, swallow, true));
      card.appendChild(ov);
    });
  };

  const bind = () => {
    try { doc = iframe.contentDocument; } catch { doc = null; }
    if (!doc || !doc.body) return;
    // addEventListener é idempotente (mesma fn + capture) — pode chamar de novo.
    EVTS.forEach((ev) => doc!.addEventListener(ev, onEvt, true));
    marcar();
    if (!obs) {
      obs = new MutationObserver(() => marcar());
      obs.observe(doc.body, { childList: true, subtree: true });
    }
  };

  iframe.addEventListener("load", bind);
  bind();
  iv = setInterval(() => {
    bind();
    if (++tries > 40) { if (iv) clearInterval(iv); iv = null; }
  }, 500);

  return () => {
    iframe.removeEventListener("load", bind);
    if (obs) obs.disconnect();
    if (iv) clearInterval(iv);
    try {
      if (doc) {
        EVTS.forEach((ev) => doc!.removeEventListener(ev, onEvt, true));
        doc.querySelectorAll('[data-aw-lock="1"]').forEach((o) => o.remove());
      }
    } catch { /* iframe pode ter navegado; ignora */ }
  };
}
