// Bloqueio REAL, do lado do ECO, das linhas do drill-down do Finder que foram
// bloqueadas na análise comercial. O iframe do Finder é MESMA ORIGEM, então dá
// pra ler o DOM dele e bloquear — sem editar o bundle compilado.
//
// Mesmo cliente + mesmos extratos = análise determinística, então o `cat.label`
// que o Finder renderiza é idêntico à `rubrica` salva na análise comercial — o
// casamento por nome (normalizado) é confiável.
//
// Camadas:
//  1. ENFORCEMENT: delegação de clique em captura no document do iframe. Se o
//     clique cair num card bloqueado (e fora do cadeado), cancela.
//  2. VISUAL/AÇÃO: cadeado grande e centralizado como FILHO do card
//     (position:absolute; inset:0). Clicar no cadeado NÃO seleciona o desconto —
//     chama de volta o ECO (onLockClick) pra abrir o diálogo de desbloqueio.
//
// Ancoragem do card (robusta, independente de estilo inline): a partir do
// elemento do título (cujo texto direto é o `cat.label`), sobe até o primeiro
// ancestral cujo texto reúne label + "ocorr." + "R$" — ou seja, o próprio card
// (label + ocorrências + valor). Isso não depende de cursor/borderRadius exatos,
// que podem estar em elementos diferentes do card no bundle compilado.
//
// Defensivo: se a estrutura não bater, não faz nada — nunca quebra o Finder.

const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// Todos os nós de texto DIRETOS de um elemento (não só o primeiro), normalizados.
function textosDiretos(el: Element): string[] {
  const out: string[] = [];
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3 && n.textContent && n.textContent.trim()) out.push(n.textContent);
  }
  return out;
}

// A rubrica bloqueada que este elemento representa (via texto direto), ou null.
function bloqueadaDoEl(el: Element, bloqueadas: Set<string>): string | null {
  for (const t of textosDiretos(el)) {
    const k = norm(t);
    if (k && bloqueadas.has(k)) return k;
  }
  return null;
}

// Sobe do elemento até o card do drill-down. Preferência: primeiro ancestral
// cujo textContent tem "ocorr" E "R$" (a assinatura do card: label + ocorrências
// + valor). Fallback: ancestral clicável/arredondado (heurística antiga).
function acharCard(el: Element | null): HTMLElement | null {
  let cur = el as HTMLElement | null;
  let fallback: HTMLElement | null = null;
  for (let i = 0; i < 22 && cur; i++) {
    const txt = cur.textContent || "";
    if (/ocorr/i.test(txt) && /R\$/.test(txt)) return cur;
    const st = (cur as HTMLElement).style;
    if (st && !fallback) {
      if ((st.animation || "").indexOf("cIn") !== -1) fallback = cur;
      else if (st.cursor === "pointer" && (st.borderRadius || "").length > 0) fallback = cur;
    }
    cur = cur.parentElement;
  }
  return fallback;
}

// A rubrica bloqueada que este card representa (varre os textos diretos dos
// descendentes), ou null.
function rubricaBloqueadaDoCard(card: Element, bloqueadas: Set<string>): string | null {
  const els = card.querySelectorAll("*");
  for (const el of Array.from(els)) {
    const k = bloqueadaDoEl(el, bloqueadas);
    if (k) return k;
  }
  return null;
}

const EVTS = ["click", "mousedown", "pointerdown", "mouseup", "pointerup", "dblclick"] as const;

export interface BloqueioReport { docOk: boolean; cards: number; travados: number }

export function instalarBloqueioFinder(
  iframe: HTMLIFrameElement | null,
  bloqueadas: Set<string>,
  onLockClick?: (rubricaNorm: string) => void,
  onReport?: (info: BloqueioReport) => void,
): () => void {
  if (!iframe || bloqueadas.size === 0) return () => {};

  let doc: Document | null = null;
  let observedDoc: Document | null = null;
  let obs: MutationObserver | null = null;
  let iv: ReturnType<typeof setInterval> | null = null;
  let tries = 0;
  let raf = 0;
  // Coalesce chamadas do observer (muitas mutações durante o render) num só
  // marcar por frame.
  const agendarMarcar = () => {
    const w = (doc && doc.defaultView) || window;
    if (raf) return;
    raf = w.requestAnimationFrame(() => { raf = 0; marcar(); });
  };

  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    (e as any).stopImmediatePropagation?.();
  };

  // Camada 1 — enforcement por delegação (ignora cliques no próprio cadeado,
  // que têm tratamento próprio pra abrir o diálogo).
  const onEvt = (e: Event) => {
    const alvo = e.target as Element | null;
    if (alvo && alvo.closest && alvo.closest('[data-aw-lock="1"]')) return;
    const card = acharCard(alvo);
    if (card && rubricaBloqueadaDoCard(card, bloqueadas)) swallow(e);
  };

  const marcar = () => {
    if (!doc) return;
    // Acha os elementos-título cujo texto direto é uma rubrica bloqueada e
    // sobe até o card pra sobrepor o cadeado.
    const els = doc.querySelectorAll<HTMLElement>("*");
    els.forEach((el) => {
      const key = bloqueadaDoEl(el, bloqueadas);
      if (!key) return;
      const card = acharCard(el);
      if (!card) return;
      if (card.querySelector(':scope [data-aw-lock="1"]') || card.matches('[data-aw-lock="1"]')) return;
      // Evita cadeado duplicado se o card ja foi marcado por outro descendente.
      if ((card as any)._awLocked) return;
      (card as any)._awLocked = true;
      const st = card.style;
      if (!st.position || st.position === "static") card.style.position = "relative";
      const ov = doc!.createElement("div");
      ov.setAttribute("data-aw-lock", "1");
      ov.style.cssText =
        "position:absolute;inset:0;z-index:50;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border-radius:12px;background:rgba(8,8,10,0.82);border:1.5px solid rgba(251,191,36,0.6);cursor:pointer;color:#fbbf24;font-family:Inter,sans-serif;text-align:center;user-select:none;pointer-events:auto";
      ov.innerHTML =
        '<div style="display:flex;align-items:center;gap:7px;font-weight:800;font-size:12.5px;letter-spacing:.07em"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>BLOQUEADO NA ANÁLISE COMERCIAL</div><span style="font-weight:500;font-size:10.5px;color:rgba(251,191,36,.75)">clique para desbloquear</span>';
      // clique abre o diálogo no ECO; demais eventos só engolem.
      ov.addEventListener("click", (e) => { swallow(e); onLockClick?.(key); }, true);
      (["mousedown", "pointerdown", "mouseup", "pointerup", "dblclick"] as const).forEach((ev) =>
        ov.addEventListener(ev, swallow, true),
      );
      card.appendChild(ov);
    });
    report();
  };

  const report = () => {
    if (!onReport) return;
    let d: Document | null = null;
    try { d = iframe.contentDocument; } catch { d = null; }
    if (!d) { onReport({ docOk: false, cards: 0, travados: 0 }); return; }
    const cards = Array.from(d.querySelectorAll<HTMLElement>("div"))
      .filter((c) => c.style && c.style.cursor === "pointer" && (c.style.borderRadius || "").length > 0).length;
    onReport({ docOk: true, cards, travados: d.querySelectorAll('[data-aw-lock="1"]').length });
  };

  const bind = () => {
    try { doc = iframe.contentDocument; } catch { doc = null; }
    if (!doc || !doc.body) { report(); return; }
    EVTS.forEach((ev) => doc!.addEventListener(ev, onEvt, true));
    // Re-anexa o observer se o documento mudou (iframe re-renderizou/navegou).
    if (observedDoc !== doc) {
      if (obs) obs.disconnect();
      obs = new MutationObserver(agendarMarcar);
      obs.observe(doc.body, { childList: true, subtree: true });
      observedDoc = doc;
    }
    marcar();
  };

  iframe.addEventListener("load", bind);
  bind();
  // Re-tenta por ~60s pra cobrir o tempo de upload/análise até o drill-down
  // renderizar; depois disso o MutationObserver mantém o bloqueio vivo.
  iv = setInterval(() => {
    bind();
    if (++tries > 120) { if (iv) clearInterval(iv); iv = null; }
  }, 500);

  return () => {
    iframe.removeEventListener("load", bind);
    if (obs) obs.disconnect();
    if (iv) clearInterval(iv);
    if (raf) { try { ((doc && doc.defaultView) || window).cancelAnimationFrame(raf); } catch { /* noop */ } raf = 0; }
    try {
      if (doc) {
        EVTS.forEach((ev) => doc!.removeEventListener(ev, onEvt, true));
        doc.querySelectorAll('[data-aw-lock="1"]').forEach((o) => {
          const card = o.parentElement as any;
          if (card) card._awLocked = false;
          o.remove();
        });
      }
    } catch { /* iframe pode ter navegado; ignora */ }
  };
}
