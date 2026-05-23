/* =========================================================================
   CADEIA — produção em sequência de várias peças do mesmo cliente.
   Ativa quando o writer é aberto com ?cadeia=1&cadeia_pos=N&cadeia_fila=<b64>.
   - renderBarraCadeia: injeta barra de progresso fixa na topbar
   - finalizarPecaPipeline: avisa o parent que a peça atual virou espelho de
     protocolo (postMessage) e, se houver, dispara a próxima da fila.
   - avancarCadeia: in-place reset do state pra próxima peça (sem reload)
   - encerrarCadeia: postMessage cadeiaCompleta -> parent navega de volta
   ========================================================================= */

function renderBarraCadeia() {
  const cad = state.cadeia;
  if (!cad || !cad.ativa) return;
  // remove se ja existe (re-render)
  const existente = document.getElementById('cadeia-bar');
  if (existente) existente.remove();

  const total = cad.total;
  const pos = cad.pos;
  const concluidas = pos - 1;
  const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0;

  const bar = document.createElement('div');
  bar.id = 'cadeia-bar';
  bar.style.cssText = `
    position: sticky; top: 0; z-index: 50;
    background: linear-gradient(180deg, hsl(var(--bg)) 0%, hsla(var(--bg), 0.92) 100%);
    border-bottom: 1px solid hsla(var(--accent-h), 75%, 65%, 0.25);
    padding: 10px 20px;
    font-family: Inter, system-ui, sans-serif;
  `;
  bar.innerHTML = `
    <div style="max-width: 1200px; margin: 0 auto; display: flex; align-items: center; gap: 14px;">
      <div style="
        height: 28px; width: 28px; border-radius: 8px;
        background: hsla(var(--accent-h), 75%, 65%, 0.15);
        border: 1px solid hsla(var(--accent-h), 75%, 65%, 0.3);
        display: flex; align-items: center; justify-content: center;
        color: hsl(var(--accent-h), 75%, 70%);
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px;">
          <span style="font-size: 13px; font-weight: 500; color: var(--text-strong, #f5f5f5);">
            Produção em cadeia
          </span>
          <span style="font-size: 11px; color: var(--text-ghost, #999);">
            Peça <strong style="color: hsl(var(--accent-h), 75%, 75%); font-variant-numeric: tabular-nums;">${pos}</strong>
            de <strong style="color: var(--text-strong, #ddd); font-variant-numeric: tabular-nums;">${total}</strong>
            · ${concluidas} concluída${concluidas === 1 ? '' : 's'}
          </span>
        </div>
        <div style="
          height: 4px; background: hsla(0, 0%, 100%, 0.06); border-radius: 999px;
          overflow: hidden;
        ">
          <div style="
            height: 100%; width: ${pct}%;
            background: linear-gradient(90deg, hsl(var(--accent-h), 75%, 65%), hsl(calc(var(--accent-h) + 10), 75%, 70%));
            transition: width 0.4s ease;
          "></div>
        </div>
      </div>
      <button id="cadeia-pular-btn" title="Pular esta peça e ir pra próxima da fila"
        style="
          font-size: 11px; padding: 6px 12px; border-radius: 8px;
          background: transparent; color: var(--text-ghost, #999);
          border: 1px solid hsla(0, 0%, 100%, 0.1);
          cursor: pointer; font-family: inherit;
        "
        onmouseover="this.style.color='#fff';this.style.borderColor='hsla(0,0%,100%,0.25)'"
        onmouseout="this.style.color='var(--text-ghost,#999)';this.style.borderColor='hsla(0,0%,100%,0.1)'"
      >Pular esta</button>
    </div>
  `;
  // injeta antes do main #view
  const view = document.getElementById('view');
  if (view && view.parentNode) {
    view.parentNode.insertBefore(bar, view);
  } else {
    document.body.insertBefore(bar, document.body.firstChild);
  }

  const btnPular = document.getElementById('cadeia-pular-btn');
  if (btnPular) {
    btnPular.onclick = () => {
      if (!confirm('Pular esta peça e ir pra próxima da fila?')) return;
      avancarCadeia();
    };
  }
}

// Avisa o parent (aw-eco-me) que a peça atual virou espelho de protocolo
// e aguarda ack antes de prosseguir pra próxima.
function finalizarPecaPipeline(driveUrl) {
  return new Promise((resolve) => {
    const demandaId = state.demandaConfeccaoId;
    if (!demandaId) {
      console.warn('[cadeia] sem demanda_id — peça não será registrada no pipeline');
      resolve({ ok: false, reason: 'sem_demanda' });
      return;
    }
    const ackHandler = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data && e.data.type === 'aw-eco-me:pecaFinalizadaAck') {
        window.removeEventListener('message', ackHandler);
        clearTimeout(timeoutId);
        resolve({ ok: !!e.data.ok });
      }
    };
    window.addEventListener('message', ackHandler);
    // timeout de 8s — se parent nao responder, segue
    const timeoutId = setTimeout(() => {
      window.removeEventListener('message', ackHandler);
      console.warn('[cadeia] timeout aguardando ack do parent');
      resolve({ ok: false, reason: 'timeout' });
    }, 8000);

    window.parent.postMessage({
      type: 'aw-eco-me:pecaFinalizada',
      payload: { demandaId, driveUrl: driveUrl || '' },
    }, window.location.origin);
  });
}

// Avança pra próxima peça da cadeia FORÇANDO reload do writer com novos
// params na URL. A URL é a fonte da verdade — assim qualquer reload do
// iframe (intencional ou não) recupera o estado correto da cadeia.
// Mantemos pacote1+pacote2 do cliente via supabase (app.js puxa por cliente_id),
// só os dados da peça (pacote3, IA, produto, rubricas, anexos) sao zerados.
function avancarCadeia() {
  const cad = state.cadeia;
  if (!cad || !cad.ativa) return false;
  const proxPos = cad.pos + 1;
  if (proxPos > cad.total) {
    encerrarCadeia();
    return false;
  }
  const prox = cad.fila[proxPos - 1];

  // Reconstroi URL com pos+1 e params da proxima peca.
  // Tambem flagga modoMesmoCliente=1 no URL pra o boot do writer pular
  // direto pra pacote3 quando o user selecionar o produto sugerido.
  const sp = new URLSearchParams(window.location.search);
  sp.set('cadeia_pos', String(proxPos));
  sp.set('modo_mesmo_cliente', '1');
  if (prox.desconto)   sp.set('desconto',   prox.desconto);
  if (prox.analise_id) sp.set('analise_id', prox.analise_id);
  sp.set('analise_url', prox.analise_url || '');
  if (prox.demanda_id) sp.set('demanda_id', prox.demanda_id);

  // Reload do iframe com os novos params — app.js reinicializa state.cadeia
  // a partir da URL, renderBarraCadeia mostra "pos/total" novo, fetchClienteAW
  // re-preenche pacote 1 e 2, etc.
  window.location.search = sp.toString();
  return true;
}

function encerrarCadeia() {
  const cad = state.cadeia;
  if (!cad) return;
  cad.ativa = false;
  window.parent.postMessage({
    type: 'aw-eco-me:cadeiaCompleta',
    payload: { cliente: cad.clienteId },
  }, window.location.origin);
}
