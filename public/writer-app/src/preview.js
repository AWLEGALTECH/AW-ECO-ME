/* =========================================================================
   PREVIEW — tela "gerando" (animação) + preview/edição dos trechos IA
   diffChars/lcsTable/renderTrechoComDiff: highlight visual de mudanças manuais
   regenerarZona: reabrir webhook pra regerar UM trecho específico
   restaurarOriginal: voltar ao trecho original do webhook
   ========================================================================= */
/* =========================================================================
   TELA GERANDO
   ========================================================================= */
function renderGerando(view, modo) {
  const etapas = modo === 'trechos'
    ? ['Verificando dados liberados', 'Contatando assistente redacional', 'Gerando trechos personalizados', 'Validando formatação', 'Preparando prévia']
    : ['Preparando template', 'Aplicando dados da ação', 'Encaixando trechos de IA', 'Gerando arquivo .docx'];

  view.innerHTML = `
    <div class="gen-page">
      <div class="gen-box">
        <div class="gen-eyebrow">Processando</div>
        <div class="gen-title">${modo === 'trechos' ? 'Compondo sua <span class="accent">peça</span>' : 'Finalizando o <span class="accent">documento</span>'}</div>
        <div class="gen-sub">${modo === 'trechos' ? 'A IA está gerando os trechos personalizados com base nos dados do caso.' : 'Aplicando edições e renderizando arquivo final.'}</div>

        <div class="gen-progress">
          <div id="genProgressFill" class="gen-progress-fill"></div>
        </div>
        <div class="gen-eta">
          <span id="genPercent" class="gen-percent">0%</span>
        </div>

        <div class="gen-checklist">
          ${etapas.map((e, i) => `
            <div class="gen-check" data-step="${i}">
              <div class="gen-check-icon"></div>
              <span>${e}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function rodarAnimacaoGeracao(modo) {
  renderGerando(document.getElementById('view'), modo);
  const total = modo === 'trechos' ? 5 : 4;
  const duracaoTotal = modo === 'trechos' ? 3500 : 1800;
  const intervalo = duracaoTotal / total;

  const fill = document.getElementById('genProgressFill');
  const percent = document.getElementById('genPercent');
  const checks = document.querySelectorAll('.gen-check');

  // Começa do zero
  if (fill) fill.style.width = '0%';
  if (percent) percent.textContent = '0%';
  checks.forEach(c => c.classList.remove('active', 'done'));

  // O check ativo é o próximo a ser concluído
  if (checks[0]) checks[0].classList.add('active');

  let i = 0;
  const avancar = () => {
    if (i >= total) return;
    // Finaliza o check atual (estala como done)
    if (checks[i]) {
      checks[i].classList.remove('active');
      checks[i].classList.add('done');
    }
    // Marca o próximo como active (se houver)
    if (checks[i + 1]) checks[i + 1].classList.add('active');
    // Progride a barra em sincronia com o check recém-concluído
    const pct = Math.round(((i + 1) / total) * 100);
    if (fill) fill.style.width = pct + '%';
    if (percent) percent.textContent = pct + '%';
    i++;
    if (i < total) setTimeout(avancar, intervalo);
  };
  // Primeira transição após um pequeno delay (dá tempo do active aparecer)
  setTimeout(avancar, intervalo);

  // Retorna promise que resolve quando a animação realmente termina
  // (último check done + buffer de 200ms pra transição de CSS acabar)
  return new Promise(resolve => {
    setTimeout(resolve, duracaoTotal + 250);
  });
}

/* =========================================================================
   PREVIEW
   ========================================================================= */
function renderPreview(view) {
  // ia_lastro_dano_material voltou a ser gerado por IA (com números calculados
  // injetados via zonas_config) — então aparece na aba Revisão como qualquer
  // outra zona, com botões de editar/regenerar. Os números (SM, cestas, meses
  // ME) seguem vindo do front pra nunca serem inventados pela IA.
  const zonas = state.produtoSelecionado.zonas_ia;
  // Reunião de rubricas: o tópico da Nota Técnica NUMOPEDE só faz sentido com
  // MAIS DE UMA rubrica. Produtos que têm o tópico no template: Débitos (1),
  // Tarifas (3), Juros (5), Mix Bradesco (14). O toggle liga/desliga sozinho
  // pela contagem de rubricas marcadas (na aba de descontos), salvo override.
  const TEM_REUNIAO = [1, 3, 5, 14].includes(state.produtoSelecionado.id);
  const nRubReuniao = (typeof contarRubricasMarcadas === 'function') ? contarRubricasMarcadas() : 0;
  if (TEM_REUNIAO && !state.dadosPacote3._reuniao_manual) {
    state.dadosPacote3.gerar_reuniao_rubricas = nRubReuniao > 1;
  }
  const reuniaoCard = TEM_REUNIAO
    ? renderReuniaoCard(state.dadosPacote3.gerar_reuniao_rubricas !== false, nRubReuniao)
    : '';
  // Aviso quando webhook não está configurado: usuário está vendo MOCK
  // (texto offline com 3 variantes que rotam por regenerar), não IA real.
  // Sem esse aviso, o usuário acha que a IA está com bug porque o regenerar
  // produzia texto idêntico (antes da correção do mock-variante).
  const semWebhook = !state.config || !state.config.webhookTrechos;
  const bannerOffline = semWebhook ? `
    <div class="banner-offline" style="margin: 0 0 18px; padding: 14px 18px; border-radius: 12px;
         background: rgba(251, 191, 36, 0.08); border: 1px solid rgba(251, 191, 36, 0.35);
         color: #fbbf24; font-size: 13px; line-height: 1.55; display: flex; gap: 12px; align-items: flex-start;">
      <span style="font-size: 18px; line-height: 1;">⚠️</span>
      <span>
        <strong>Modo offline (mock)</strong> — os trechos abaixo são exemplos pré-escritos, não saída da IA real.
        O botão "Regenerar" alterna entre 3 variantes locais. Para texto gerado pela IA com os dados do cliente,
        configure o webhook do n8n em <strong>⚙️ Configurações</strong> no canto superior direito.
      </span>
    </div>
  ` : '';

  view.innerHTML = `
    <div class="preview-page">
      <div class="form-header">
        <div class="form-eyebrow">Etapa 04 · ${state.produtoSelecionado.nome}</div>
        <div class="form-title">Revisão dos <span class="accent">trechos</span></div>
        <div class="form-sub">Cada trecho abaixo foi gerado pela IA com os dados do cliente. Edite livremente no teclado, regenere individualmente, ou aprove tudo.</div>
      </div>

      ${bannerOffline}

      <div class="preview-legend">
        <div class="legend-item"><span class="legend-swatch fixed"></span>Texto fixo validado</div>
        <div class="legend-item"><span class="legend-swatch ia"></span>Gerado por IA</div>
        <div class="legend-item"><span class="legend-swatch edited"></span>Editado manualmente</div>
      </div>

      ${reuniaoCard}
      ${zonas.map((z, i) => renderZonaCard(z, i)).join('')}

      <div class="form-footer">
        <button class="btn-link" onclick="navegarPara('pacote3')">← Voltar</button>
        <button class="btn btn-primary" onclick="gerarPecaFinal()">
          Aprovar e gerar peça →
        </button>
      </div>
    </div>
  `;

  document.querySelectorAll('.zone-text').forEach(el => {
    // Guarda o HTML renderizado inicial (sem marca de edição)
    renderTrechoComDiff(el);
    el.addEventListener('input', () => {
      const tag = el.dataset.tag;
      const novo = el.innerText; // .innerText preserva quebras de linha
      state.trechosIA[tag] = novo;
      const original = state.trechosIAOriginais[tag] || '';
      const card = el.closest('.zone-card');
      const badge = card.querySelector('.zone-badge-edited');
      if (novo !== original) {
        state.trechosEditados.add(tag);
        card.classList.add('edited');
        if (badge) badge.style.display = 'inline-block';
      } else {
        state.trechosEditados.delete(tag);
        card.classList.remove('edited');
        if (badge) badge.style.display = 'none';
      }
      const chars = card.querySelector('.zone-chars');
      if (chars) chars.textContent = `${novo.length} CARS · ${contarPalavras(novo)} PALAVRAS`;

      // Re-renderiza com destaque amarelo nas partes novas.
      // Mas fazer isso a cada tecla reseta o cursor — usamos debounce + preservação.
      agendarReRenderDiff(el);
    });
  });
}

/* Algoritmo LCS caractere-a-caractere — marca quais são "iguais ao original"
   e quais são "adicionados pelo usuário". Retorna array de {char, novo:bool}. */
function diffChars(original, atual) {
  const a = original || '';
  const b = atual || '';
  const m = a.length, n = b.length;

  // Otimização: se prefixo é igual, pula
  let inicio = 0;
  while (inicio < m && inicio < n && a[inicio] === b[inicio]) inicio++;
  // Otimização: se sufixo é igual, pula
  let fimA = m, fimB = n;
  while (fimA > inicio && fimB > inicio && a[fimA - 1] === b[fimB - 1]) { fimA--; fimB--; }

  const resultado = [];
  // Parte inicial idêntica
  for (let i = 0; i < inicio; i++) resultado.push({ char: b[i], novo: false });

  // Miolo divergente — LCS só nessa parte
  const subA = a.slice(inicio, fimA);
  const subB = b.slice(inicio, fimB);
  const lcs = lcsTable(subA, subB);
  // Reconstrói marcando cada caractere de subB como "novo" ou não
  let i = subA.length, j = subB.length;
  const miolo = [];
  while (j > 0) {
    if (i > 0 && subA[i - 1] === subB[j - 1]) {
      miolo.unshift({ char: subB[j - 1], novo: false });
      i--; j--;
    } else if (i === 0 || (j > 0 && (i === 0 || lcs[i][j - 1] >= lcs[i - 1][j]))) {
      miolo.unshift({ char: subB[j - 1], novo: true });
      j--;
    } else {
      i--;
    }
  }
  resultado.push(...miolo);

  // Parte final idêntica
  for (let k = fimB; k < n; k++) resultado.push({ char: b[k], novo: false });

  return resultado;
}

function lcsTable(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

/* Renderiza o conteúdo do trecho dentro do contenteditable com spans <user-edit>
   preservando a posição do cursor. */
function renderTrechoComDiff(el) {
  const tag = el.dataset.tag;
  const original = state.trechosIAOriginais[tag] || '';
  const atual = state.trechosIA[tag] || '';
  if (!atual) {
    el.innerHTML = '';
    return;
  }
  if (atual === original) {
    // Sem edição — texto puro, sem spans
    el.textContent = atual;
    return;
  }
  const diff = diffChars(original, atual);
  // Agrupa runs de chars do mesmo tipo (novos x antigos) pra diminuir spans
  let html = '';
  let bufNovo = '', bufVelho = '';
  const flush = () => {
    if (bufVelho) { html += escapeHtml(bufVelho); bufVelho = ''; }
    if (bufNovo)  { html += `<span class="user-edit">${escapeHtml(bufNovo)}</span>`; bufNovo = ''; }
  };
  for (const { char, novo } of diff) {
    if (novo) {
      if (bufVelho) flush();
      bufNovo += char;
    } else {
      if (bufNovo) flush();
      bufVelho += char;
    }
  }
  flush();
  el.innerHTML = html;
}

/* O re-render que preserva o cursor — rodado com pequeno delay após input */
let _reRenderTimer = null;
let _reRenderTarget = null;
function agendarReRenderDiff(el) {
  _reRenderTarget = el;
  if (_reRenderTimer) clearTimeout(_reRenderTimer);
  _reRenderTimer = setTimeout(() => {
    executarReRenderDiff();
  }, 180); // debounce pra não re-renderizar a cada tecla
}
function executarReRenderDiff() {
  const el = _reRenderTarget;
  if (!el || !el.isConnected) return;
  // Salva posição do cursor como offset absoluto dentro do texto
  const sel = window.getSelection();
  let caretOffset = 0;
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    if (el.contains(range.endContainer)) {
      const preRange = range.cloneRange();
      preRange.selectNodeContents(el);
      preRange.setEnd(range.endContainer, range.endOffset);
      caretOffset = preRange.toString().length;
    }
  }
  renderTrechoComDiff(el);
  // Restaura cursor no offset correto
  restaurarCursor(el, caretOffset);
}

function restaurarCursor(el, offset) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let contador = 0;
  let achou = false;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  let node;
  while ((node = walker.nextNode())) {
    const len = node.textContent.length;
    if (contador + len >= offset) {
      range.setStart(node, offset - contador);
      range.collapse(true);
      achou = true;
      break;
    }
    contador += len;
  }
  if (!achou) {
    // fallback: final
    range.selectNodeContents(el);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

function contarPalavras(s) {
  return (s.trim().match(/\S+/g) || []).length;
}

function renderZonaCard(zona, idx) {
  const texto = state.trechosIA[zona.tag] || '';
  const editado = state.trechosEditados.has(zona.tag);
  // Para zonas opcionais (lastro do dano material): mostra toggle no header.
  // Estado vem de state.dadosPacote3.gerar_lastro_dano_material (default true).
  const opcional = !!zona.opcional;
  let opcionalAtivo = true;
  if (opcional && zona.tag === 'ia_lastro_dano_material') {
    opcionalAtivo = state.dadosPacote3.gerar_lastro_dano_material !== false;
  } else if (opcional && zona.tag === 'ia_lastro_humanizado') {
    opcionalAtivo = state.dadosPacote3.gerar_lastro_humanizado !== false;
  }
  const desabilitada = opcional && !opcionalAtivo;
  return `
    <div class="zone-card ${editado ? 'edited' : ''} ${opcional ? 'zone-card-optional' : ''} ${desabilitada ? 'zone-card-disabled' : ''}" data-tag="${zona.tag}" style="animation-delay: ${idx * 0.05}s">
      <div class="zone-header">
        <div class="zone-header-left">
          <div class="zone-number">${String(idx + 1).padStart(2, '0')}</div>
          <div class="zone-info">
            <div class="zone-name">${zona.nome}${opcional ? ' <span class="zone-optional-tag">opcional</span>' : ''}</div>
            <div class="zone-tag">${zona.tag}</div>
          </div>
        </div>
        ${opcional ? `
          <label class="zone-toggle" title="${opcionalAtivo ? 'Este parágrafo SERÁ incluído na peça final' : 'Este parágrafo NÃO será incluído na peça final'}">
            <input type="checkbox" ${opcionalAtivo ? 'checked' : ''} onchange="toggleZonaOpcional('${zona.tag}', this.checked)">
            <span class="zone-toggle-slider"></span>
            <span class="zone-toggle-label">${opcionalAtivo ? 'Incluir' : 'Pular'}</span>
          </label>
        ` : `
          <div class="zone-badge-edited" style="${editado ? '' : 'display:none'}">Editado</div>
        `}
      </div>
      ${zona.contexto_antes ? `
        <div class="zone-context">
          <span class="ctx-label">↑ Antes</span>
          <span class="ctx-body">${zona.contexto_antes}</span>
        </div>
      ` : ''}
      <div class="zone-editor">
        <div class="zone-text" contenteditable="true" spellcheck="true" data-tag="${zona.tag}">${escapeHtml(texto)}</div>
      </div>
      ${zona.contexto_depois ? `
        <div class="zone-context">
          <span class="ctx-label">↓ Depois</span>
          <span class="ctx-body">${zona.contexto_depois}</span>
        </div>
      ` : ''}
      <div class="zone-actions">
        <button class="zone-action" onclick="regenerarZona('${zona.tag}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M23 4v6h-6M1 20v-6h6M20.5 9A9 9 0 0 0 5.6 5.6L1 10M3.5 15a9 9 0 0 0 14.9 3.4L23 14"/></svg>
          Regenerar
        </button>
        <button class="zone-action" onclick="toggleSugestaoZona('${zona.tag}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          Sugerir mudança
        </button>
        <button class="zone-action" onclick="restaurarOriginal('${zona.tag}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-7 3L3 9"/><path d="M3 4v5h5"/></svg>
          Restaurar
        </button>
        <span class="zone-chars">${texto.length} CARS · ${contarPalavras(texto)} PALAVRAS</span>
      </div>
      <div class="zone-sugestao" data-tag="${zona.tag}" style="display:none;">
        <div class="zone-sugestao-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          O que você gostaria que a IA mudasse neste trecho?
        </div>
        <textarea class="zone-sugestao-input" data-tag="${zona.tag}" placeholder="Ex: 'dê mais ênfase ao fato de que ela cuida sozinha da mãe idosa', 'mencione o impacto nos filhos menores', 'deixe mais curto e direto', 'use uma linguagem menos emotiva'..." rows="3"></textarea>
        <div class="zone-sugestao-acoes">
          <button class="zone-action zone-action-primary" onclick="regenerarZonaComSugestao('${zona.tag}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>
            Regenerar com sugestão
          </button>
          <button class="zone-action-link" onclick="toggleSugestaoZona('${zona.tag}')">Cancelar</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Abre/fecha o campo de sugestão de regeneração de uma zona.
 */
function toggleSugestaoZona(tag) {
  const bloco = document.querySelector(`.zone-sugestao[data-tag="${tag}"]`);
  if (!bloco) return;
  const aberto = bloco.style.display !== 'none';
  if (aberto) {
    bloco.style.display = 'none';
  } else {
    bloco.style.display = 'flex';
    // Foca no textarea automaticamente
    const ta = bloco.querySelector('.zone-sugestao-input');
    if (ta) setTimeout(() => ta.focus(), 50);
  }
}

/**
 * Toggle de zona OPCIONAL (ex: ia_lastro_dano_material).
 * Atualiza state.dadosPacote3.<flag> e re-renderiza só este card.
 * Se desmarcada, a zona não vai pro n8n e o parágrafo do template é apagado.
 */
function toggleZonaOpcional(tag, ativo) {
  if (tag === 'ia_lastro_dano_material') {
    state.dadosPacote3.gerar_lastro_dano_material = !!ativo;
  } else if (tag === 'ia_lastro_humanizado') {
    state.dadosPacote3.gerar_lastro_humanizado = !!ativo;
  }
  // Re-render só do card afetado (preserva os textos editados nas outras zonas)
  const card = document.querySelector(`.zone-card[data-tag="${tag}"]`);
  if (!card) return;
  const idx = Array.from(card.parentNode.children).indexOf(card);
  const zona = state.produtoSelecionado.zonas_ia.find(z => z.tag === tag);
  if (!zona) return;
  card.outerHTML = renderZonaCard(zona, idx);
}

/**
 * Card de toggle do tópico "Reunião de rubricas" (Nota Técnica NUMOPEDE).
 * Não é uma zona de IA — é um bloco fixo do template que a gente MANTÉM ou
 * REMOVE na geração do docx (aplicarReuniaoRubricas). Aparece junto com os
 * outros toggles na aba de revisão. Liga/desliga sozinho pela contagem de
 * rubricas; o advogado pode forçar pelo toggle.
 */
function renderReuniaoCard(ativo, nRub) {
  const auto = nRub > 1 ? 'ligado automaticamente (mais de uma rubrica)' : 'desligado automaticamente (apenas uma rubrica)';
  return `
    <div class="zone-card zone-card-optional ${ativo ? '' : 'zone-card-disabled'}" data-tag="ia_reuniao_rubricas">
      <div class="zone-header">
        <div class="zone-header-left">
          <div class="zone-number">§</div>
          <div class="zone-info">
            <div class="zone-name">Reunião de rubricas <span class="zone-optional-tag">opcional</span></div>
            <div class="zone-tag">Nota Técnica 01/2022-NUMOPEDE/TJAM · bloco fixo do template</div>
          </div>
        </div>
        <label class="zone-toggle" title="${ativo ? 'O tópico SERÁ incluído na peça' : 'O tópico NÃO será incluído na peça'}">
          <input type="checkbox" ${ativo ? 'checked' : ''} onchange="toggleReuniaoRubricas(this.checked)">
          <span class="zone-toggle-slider"></span>
          <span class="zone-toggle-label">${ativo ? 'Incluir' : 'Pular'}</span>
        </label>
      </div>
      <div class="zone-context">
        <span class="ctx-body">Justifica reunir várias rubricas numa única ação. Só faz sentido com <strong>mais de uma rubrica</strong>. Você marcou <strong>${nRub}</strong> rubrica${nRub === 1 ? '' : 's'}, então está ${auto}.</span>
      </div>
    </div>
  `;
}

/**
 * Toggle do tópico de reunião de rubricas. Marca como override manual pra não
 * ser sobrescrito pela contagem automática ao re-renderizar o preview.
 */
function toggleReuniaoRubricas(ativo) {
  state.dadosPacote3.gerar_reuniao_rubricas = !!ativo;
  state.dadosPacote3._reuniao_manual = true;
  const card = document.querySelector('.zone-card[data-tag="ia_reuniao_rubricas"]');
  if (card) {
    const nRub = (typeof contarRubricasMarcadas === 'function') ? contarRubricasMarcadas() : 0;
    card.outerHTML = renderReuniaoCard(!!ativo, nRub);
  }
}

/**
 * Regenera uma zona usando a sugestão digitada pelo usuário.
 * Se o textarea estiver vazio, cai pra regeneração pura (sem sugestão).
 */
async function regenerarZonaComSugestao(tag) {
  const bloco = document.querySelector(`.zone-sugestao[data-tag="${tag}"]`);
  const ta = bloco ? bloco.querySelector('.zone-sugestao-input') : null;
  const sugestao = ta ? ta.value.trim() : '';

  if (!sugestao) {
    // Campo vazio — só regenera sem sugestão
    await regenerarZona(tag);
    if (bloco) bloco.style.display = 'none';
    return;
  }

  // Regenera passando a sugestão no payload e limpa o campo depois
  await regenerarZona(tag, sugestao);
  if (ta) ta.value = '';
  if (bloco) bloco.style.display = 'none';
}

async function regenerarZona(tag, sugestaoUsuario) {
  const card = document.querySelector(`.zone-card[data-tag="${tag}"]`);
  const editor = card.querySelector('.zone-text');
  editor.classList.add('generating');
  editor.textContent = sugestaoUsuario
    ? 'Gerando nova versão com sua sugestão...'
    : 'Gerando nova versão...';
  editor.setAttribute('contenteditable', 'false');

  try {
    // ─────────────────────────────────────────────────────────────────────
    // CONTADOR DE REGENERAÇÃO + TEXTO ANTERIOR
    // ─────────────────────────────────────────────────────────────────────
    // Incrementa contador da zona e captura o texto que estava ali ANTES
    // do clique. Esses dois campos são enviados pra IA e usados pra forçar
    // VARIAÇÃO REAL: sem isso, mesmo input + temperatura baixa = resposta
    // praticamente idêntica à anterior, dando a impressão de que o botão
    // "Regenerar" não fez nada.
    if (typeof state.regeneracoesPorZona[tag] !== 'number') {
      state.regeneracoesPorZona[tag] = 0;
    }
    state.regeneracoesPorZona[tag] += 1;
    const tentativa = state.regeneracoesPorZona[tag];
    const textoAnterior = state.trechosIA[tag] || '';

    if (state.config.webhookTrechos) {
      // Payload inclui sugestao_usuario quando foi passada — o n8n usa isso
      // pra enriquecer o prompt daquela zona específica.
      const payloadBase = montarPayloadGeracao();

      // Regras EXTRAS de regeneração — empilhadas em cima das regras_globais
      // que já vieram do payloadBase. Forçam o ChatGPT a produzir uma versão
      // genuinamente diferente da anterior, não uma reformulação superficial.
      const regrasRegeneracao = [
        `REGENERAÇÃO Nº ${tentativa} desta zona (${tag}). O advogado clicou em "Regenerar" porque NÃO gostou da versão anterior. Você DEVE produzir uma versão SUBSTANCIALMENTE DIFERENTE — não basta trocar sinônimos.`,
        'EXIGÊNCIAS DE VARIAÇÃO: (1) abertura diferente do parágrafo (não comece com a mesma palavra/expressão); (2) ordem dos argumentos diferente; (3) ênfase em aspecto distinto do papel da zona; (4) escolhas lexicais diferentes ao longo de todo o trecho. Se a versão anterior era mais técnica, traga uma mais narrativa (ou vice-versa).',
        'O CAMPO "texto_anterior" mostra EXATAMENTE o que o advogado rejeitou. Não reproduza estrutura, frases ou abertura desse texto.',
        // Aleatoriedade injetada pra quebrar cache de prompt e empurrar o
        // sampling pra um ponto novo do espaço de respostas. O nonce não
        // é interpretado pela IA, mas faz o prompt completo ser único.
        `nonce_regeneracao: ${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      ];

      const payload = {
        ...payloadBase,
        zonas: [tag],
        sugestao_usuario: sugestaoUsuario || null,
        // Sinalização explícita pro n8n: este request é uma regeneração.
        regeneracao: {
          tentativa,
          texto_anterior: textoAnterior,
          tag,
        },
        regras_globais: [
          ...(payloadBase.regras_globais || []),
          ...regrasRegeneracao,
        ],
      };
      const json = await chamarWebhookTrechos(payload);
      if (!json.trechos || json.trechos[tag] == null) {
        throw new Error('O assistente de IA não retornou o trecho solicitado. Tente regenerar novamente.');
      }
      const novo = sanitizarTextoIA(json.trechos[tag]);
      state.trechosIA[tag] = novo;
      state.trechosIAOriginais[tag] = novo;
    } else {
      // Sem webhook configurado → modo offline (mock). Passamos `tentativa`
      // pra que o mock retorne uma variante diferente da exibida — sem isso,
      // mock retornaria SEMPRE o mesmo texto e o usuário veria o regenerar
      // como botão quebrado. Veja gerarTrechosMock() em ia.js: 3 variantes
      // por zona rotacionando por (tentativa % 3).
      await new Promise(r => setTimeout(r, 1500));
      const mock = gerarTrechosMock(tentativa);
      const variacaoMock = sanitizarTextoIA(mock[tag] || '');
      state.trechosIA[tag] = variacaoMock;
      state.trechosIAOriginais[tag] = variacaoMock;
    }
    state.trechosEditados.delete(tag);
    card.classList.remove('edited');
    const badge = card.querySelector('.zone-badge-edited');
    if (badge) badge.style.display = 'none';
    editor.classList.remove('generating');
    editor.setAttribute('contenteditable', 'true');
    renderTrechoComDiff(editor);
    const chars = card.querySelector('.zone-chars');
    if (chars) chars.textContent = `${state.trechosIA[tag].length} CARS · ${contarPalavras(state.trechosIA[tag])} PALAVRAS`;
  } catch (err) {
    editor.classList.remove('generating');
    editor.setAttribute('contenteditable', 'true');
    renderTrechoComDiff(editor);
    alert('Erro: ' + err.message);
  }
}

function restaurarOriginal(tag) {
  state.trechosIA[tag] = state.trechosIAOriginais[tag];
  state.trechosEditados.delete(tag);
  const card = document.querySelector(`.zone-card[data-tag="${tag}"]`);
  card.classList.remove('edited');
  const badge = card.querySelector('.zone-badge-edited');
  if (badge) badge.style.display = 'none';
  const editor = card.querySelector('.zone-text');
  renderTrechoComDiff(editor);
  const chars = card.querySelector('.zone-chars');
  if (chars) chars.textContent = `${state.trechosIA[tag].length} CARS · ${contarPalavras(state.trechosIA[tag])} PALAVRAS`;
}
