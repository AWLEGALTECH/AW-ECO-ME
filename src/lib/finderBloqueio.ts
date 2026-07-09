// Bloqueio REAL, do lado do ECO, das linhas do drill-down do Finder que foram
// bloqueadas na análise comercial. O iframe do Finder é MESMA ORIGEM, então dá
// pra ler/alterar o DOM dele sem editar o bundle compilado.
//
// Como mesmo cliente + mesmos extratos = análise determinística, o `cat.label`
// que o Finder renderiza é idêntico à `rubrica` salva na análise comercial —
// o casamento por nome (normalizado, exato) é confiável.
//
// Estratégia defensiva: casa cada card de categoria pelo texto do título;
// desabilita clique (captura) e aplica trava visual + selo. Se a estrutura não
// bater, simplesmente não faz nada (degrada pro aviso; nunca quebra o Finder).

const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

function primeiroTextoDireto(el: Element): string {
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3 && n.textContent && n.textContent.trim()) return n.textContent;
  }
  return "";
}

// Sobe do título até o card da categoria (div com cursor:pointer + radius 12).
function acharCard(el: Element): HTMLElement | null {
  let cur: HTMLElement | null = el as HTMLElement;
  for (let i = 0; i < 8 && cur; i++) {
    const st = cur.style;
    if (st && st.cursor === "pointer" && st.borderRadius === "12px") return cur;
    cur = cur.parentElement;
  }
  return null;
}

export function instalarBloqueioFinder(iframe: HTMLIFrameElement | null, bloqueadas: Set<string>): () => void {
  if (!iframe || bloqueadas.size === 0) return () => {};

  let obs: MutationObserver | null = null;
  let iv: ReturnType<typeof setInterval> | null = null;
  let tries = 0;

  const blocker = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    (e as any).stopImmediatePropagation?.();
  };

  const aplicar = () => {
    let doc: Document | null = null;
    try { doc = iframe.contentDocument; } catch { return; }
    if (!doc) return;
    const els = doc.querySelectorAll("div,span");
    els.forEach((el) => {
      const t = norm(primeiroTextoDireto(el));
      if (!t || !bloqueadas.has(t)) return;
      const card = acharCard(el);
      if (!card || card.dataset.awBloq === "1") return;
      card.dataset.awBloq = "1";
      card.style.opacity = "0.5";
      card.style.filter = "grayscale(0.75)";
      card.style.cursor = "not-allowed";
      (["click", "mousedown", "pointerdown"] as const).forEach((ev) =>
        card.addEventListener(ev, blocker, true),
      );
      const badge = doc!.createElement("div");
      badge.setAttribute("data-aw-badge", "1");
      badge.textContent = "BLOQUEADO NO COMERCIAL";
      badge.style.cssText =
        "position:absolute;top:8px;right:12px;z-index:5;font:600 9px Inter,sans-serif;letter-spacing:.08em;color:#fbbf24;background:rgba(251,191,36,.14);border:1px solid rgba(251,191,36,.4);border-radius:999px;padding:2px 8px;pointer-events:none";
      card.appendChild(badge);
    });
  };

  const start = () => {
    let doc: Document | null = null;
    try { doc = iframe.contentDocument; } catch { return; }
    if (!doc || !doc.body) return;
    aplicar();
    if (!obs) {
      obs = new MutationObserver(() => aplicar());
      obs.observe(doc.body, { childList: true, subtree: true });
    }
  };

  iframe.addEventListener("load", start);
  start();
  // Backstop: o React monta o drill-down depois; reaplica por alguns segundos.
  iv = setInterval(() => {
    aplicar();
    if (++tries > 40) { if (iv) clearInterval(iv); iv = null; }
  }, 500);

  return () => {
    iframe.removeEventListener("load", start);
    if (obs) obs.disconnect();
    if (iv) clearInterval(iv);
    try {
      const doc = iframe.contentDocument;
      if (doc) {
        doc.querySelectorAll<HTMLElement>('[data-aw-bloq="1"]').forEach((c) => {
          (["click", "mousedown", "pointerdown"] as const).forEach((ev) =>
            c.removeEventListener(ev, blocker, true),
          );
          c.style.opacity = "";
          c.style.filter = "";
          c.style.cursor = "";
          delete c.dataset.awBloq;
        });
        doc.querySelectorAll('[data-aw-badge="1"]').forEach((b) => b.remove());
      }
    } catch { /* iframe pode ter navegado; ignora */ }
  };
}
