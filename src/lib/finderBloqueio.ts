// Bloqueio REAL, do lado do ECO, das linhas do drill-down do Finder que foram
// bloqueadas na análise comercial. O iframe do Finder é MESMA ORIGEM, então dá
// pra ler o DOM dele e sobrepor um cadeado — sem editar o bundle compilado.
//
// Como mesmo cliente + mesmos extratos = análise determinística, o `cat.label`
// que o Finder renderiza é idêntico à `rubrica` salva na análise comercial —
// o casamento por nome (normalizado, exato) é confiável.
//
// Estratégia: em vez de estilizar o card do Finder (o React re-renderiza no
// hover e apaga qualquer alteração), coloca um OVERLAY de cadeado no <body> do
// iframe (fora da árvore React) e o mantém em cima do card via
// requestAnimationFrame. O overlay engole o clique (pointer-events), então o
// checkbox/detalhe daquele desconto nunca é acionado. Defensivo: se não achar a
// estrutura, não faz nada (degrada pro aviso; nunca quebra o Finder).

const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function primeiroTextoDireto(el: Element): string {
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3 && n.textContent && n.textContent.trim()) return n.textContent;
  }
  return "";
}

// Sobe do título até o card da categoria. Âncora robusta: os cards têm a
// animação de entrada `cIn` no style inline (exclusiva deles no drill-down).
function acharCard(el: Element): HTMLElement | null {
  let cur: HTMLElement | null = el as HTMLElement;
  for (let i = 0; i < 10 && cur; i++) {
    const anim = cur.style && cur.style.animation;
    if (anim && anim.indexOf("cIn") !== -1) return cur;
    cur = cur.parentElement;
  }
  return null;
}

export function instalarBloqueioFinder(iframe: HTMLIFrameElement | null, bloqueadas: Set<string>): () => void {
  if (!iframe || bloqueadas.size === 0) return () => {};

  const pares: Array<{ card: HTMLElement; ov: HTMLElement }> = [];
  let obs: MutationObserver | null = null;
  let iv: ReturnType<typeof setInterval> | null = null;
  let raf = 0;
  let tries = 0;
  let parado = false;

  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    (e as any).stopImmediatePropagation?.();
  };

  const criarOverlay = (doc: Document): HTMLElement => {
    const ov = doc.createElement("div");
    ov.setAttribute("data-aw-lock", "1");
    ov.style.cssText =
      "position:fixed;z-index:2147483000;display:flex;align-items:center;justify-content:center;gap:8px;border-radius:12px;background:rgba(8,8,10,0.62);border:1px solid rgba(251,191,36,0.55);cursor:not-allowed;color:#fbbf24;font:700 10px Inter,sans-serif;letter-spacing:.09em;pointer-events:auto;user-select:none";
    ov.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span>BLOQUEADO NO COMERCIAL</span>';
    (["click", "mousedown", "pointerdown", "mouseup", "pointerup", "dblclick"] as const).forEach((ev) =>
      ov.addEventListener(ev, swallow, true),
    );
    return ov;
  };

  const scan = () => {
    let doc: Document | null = null;
    try { doc = iframe.contentDocument; } catch { return; }
    if (!doc || !doc.body) return;
    const els = doc.querySelectorAll("div,span");
    els.forEach((el) => {
      const t = norm(primeiroTextoDireto(el));
      if (!t || !bloqueadas.has(t)) return;
      const card = acharCard(el);
      if (!card || card.dataset.awLocked === "1") return;
      card.dataset.awLocked = "1";
      const ov = criarOverlay(doc!);
      doc!.body.appendChild(ov);
      pares.push({ card, ov });
    });
  };

  const posicionar = () => {
    if (parado) return;
    for (const { card, ov } of pares) {
      if (!card.isConnected) { ov.style.display = "none"; continue; }
      const r = card.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) { ov.style.display = "none"; continue; }
      ov.style.display = "flex";
      ov.style.top = `${r.top}px`;
      ov.style.left = `${r.left}px`;
      ov.style.width = `${r.width}px`;
      ov.style.height = `${r.height}px`;
    }
    raf = requestAnimationFrame(posicionar);
  };

  const start = () => {
    let doc: Document | null = null;
    try { doc = iframe.contentDocument; } catch { return; }
    if (!doc || !doc.body) return;
    scan();
    if (!obs) {
      obs = new MutationObserver(() => scan());
      obs.observe(doc.body, { childList: true, subtree: true });
    }
  };

  iframe.addEventListener("load", start);
  start();
  raf = requestAnimationFrame(posicionar);
  // Backstop: o React monta o drill-down depois; reaplica por alguns segundos.
  iv = setInterval(() => {
    scan();
    if (++tries > 40) { if (iv) clearInterval(iv); iv = null; }
  }, 500);

  return () => {
    parado = true;
    iframe.removeEventListener("load", start);
    if (obs) obs.disconnect();
    if (iv) clearInterval(iv);
    if (raf) cancelAnimationFrame(raf);
    for (const { card, ov } of pares) {
      try { delete card.dataset.awLocked; } catch { /* noop */ }
      ov.remove();
    }
    pares.length = 0;
  };
}
