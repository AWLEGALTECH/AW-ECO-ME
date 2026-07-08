/* =========================================================================
   RENDER — todas as funções de UI (lobby, pacotes 1/2/3, blocos, navegação)
   Inclui handlers de upload (selfie + tabela XLSX), parsers de planilha,
   detecção automática de rubricas e bind de formulários.
   ========================================================================= */
function navegarPara(tela) {
  // Persistencia automatica: ao sair de pacote1 ou pacote2 com cliente AW
  // selecionado, salva o que foi preenchido de volta no Supabase do aw-eco-me.
  // Isso faz com que clientes antigos (importados sem qualificacao) fiquem
  // completos depois da 1a peca, e nunca mais precisem ser preenchidos.
  const sainPa = (state.tela === 'pacote1' || state.tela === 'pacote2') && tela !== state.tela;
  if (sainPa && state.clienteSelecionado && state.clienteSelecionado.aw_id && typeof salvarDadosClienteAW === 'function') {
    salvarDadosClienteAW(state.clienteSelecionado.aw_id)
      .then(r => { if (r && r.ok && !r.skipped) console.log('[writer] cliente salvo'); })
      .catch(e => console.warn('[writer] falha salvando cliente:', e));
  }
  state.tela = tela;
  const semStepper = ['lobby', 'done', 'modalidade', 'pacoteKit', 'kitDescontos', 'kitDone'];
  document.getElementById('stepper').classList.toggle('hidden', semStepper.includes(tela));
  atualizarStepper(tela);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  render();
  if (typeof history !== 'undefined') {
    try { history.pushState({ tela }, '', '#' + tela); } catch (e) {}
  }
}

// Mapa de "voltar" por tela: pra cada destino, qual é a tela natural anterior.
function voltarTela(telaAtual) {
  const back = {
    lobby: null,                // já no lobby; back não faz nada
    modalidade: 'lobby',
    pacoteKit: 'modalidade',
    kitDescontos: 'pacoteKit',
    kitDone: 'lobby',
    pacote1: 'lobby',
    pacote2: 'pacote1',
    pacote3: 'pacote2',
    preview: 'pacote3',
    gerando: 'preview',
    done: 'lobby',
  };
  return back[telaAtual] || null;
}

function atualizarStepper(tela) {
  const mapa = { pacote1: 1, pacote2: 2, pacote3: 3, preview: 4, gerando: 4 };
  const step = mapa[tela] || 0;
  document.querySelectorAll('.step-dot').forEach((dot, i) => {
    dot.classList.remove('active', 'done');
    if (i + 1 < step) dot.classList.add('done');
    if (i + 1 === step) dot.classList.add('active');
  });
}

function render() {
  const view = document.getElementById('view');
  switch (state.tela) {
    case 'lobby': renderLobby(view); break;
    case 'modalidade': renderModalidade(view); break;
    case 'origemCliente': renderOrigemCliente(view); break;
    case 'selecaoCliente': renderSelecaoCliente(view); break;
    case 'pacoteKit': renderKitForm(view); break;
    case 'kitDescontos': renderKitDescontos(view); break;
    case 'kitDone': renderKitDone(view); break;
    case 'pacote1': renderPacote1(view); break;
    case 'pacote2': renderPacote2(view); break;
    case 'pacote3': renderPacote3(view); break;
    case 'preview': renderPreview(view); break;
    case 'gerando': /* renderizado em gerar */ break;
    case 'done': renderDone(view); break;
  }
}

/* =========================================================================
   LOBBY
   ========================================================================= */
function renderLobby(view) {
  const ativos = PRODUTOS.filter(p => p.ativo).length;
  const locked = PRODUTOS.filter(p => !p.ativo).length;
  const busca = (state.buscaLobby || '').trim();

  // Quando viemos de uma análise vinculada (Confeccionar peça do aw-eco-me),
  // não faz sentido mostrar a prateleira de Kits (procurações/contratos).
  const ehModoPeca = !!state.contextoAnaliseVinculada;
  const universoProdutos = ehModoPeca
    ? PRODUTOS.filter(p => !(p.categoria && /representa/i.test(p.categoria)))
    : PRODUTOS;

  // Filtrar por busca (nome, réu, rubricas, categoria, sublabel)
  const filtrados = filtrarProdutos(universoProdutos, busca);

  // Agrupar por categoria
  const porCategoria = {};
  filtrados.forEach(p => {
    const cat = p.categoria || 'Outros';
    if (!porCategoria[cat]) porCategoria[cat] = [];
    porCategoria[cat].push(p);
  });

  // Prateleira "Produto Sugerido" — só aparece quando há contexto de análise
  // vinculada com sugestão calculada. Mostra o produto sugerido em destaque.
  const sugerido = (ehModoPeca && state.produtoSugeridoId)
    ? universoProdutos.find(p => p.id === state.produtoSugeridoId)
    : null;

  view.innerHTML = `
    <div class="lobby">
      ${state.modoMesmoCliente ? `
        <!-- [TEMP-MESMO-CLIENTE] BEGIN — banner do modo "mesmo cliente". Pra remover: apagar este bloco. -->
        <div style="margin:16px 0 24px; padding:14px 18px; border:1px solid rgba(120,180,255,.35); border-radius:10px; background:rgba(120,180,255,.08); display:flex; align-items:center; gap:14px; flex-wrap:wrap; font-size:14px; line-height:1.45; animation:fadeSlide 0.4s ease both;">
          <div style="flex:1; min-width:240px;">
            <div style="font-weight:600; color:#a8c8ff; margin-bottom:2px;">Modo "Mesmo cliente" ativo</div>
            <div style="opacity:.85;">Selecione o próximo produto para <strong>${escapeHtml(state.dadosPacote1.nome_completo || 'o mesmo cliente')}</strong>. Você só vai preencher os dados da ação (Etapa 03) — qualificação e perfil já estão prontos.</div>
          </div>
          <button onclick="cancelarMesmoCliente()" style="padding:8px 14px; background:transparent; border:1px solid rgba(255,255,255,.25); border-radius:8px; color:inherit; cursor:pointer; font-size:13px;">Cancelar</button>
        </div>
        <!-- [TEMP-MESMO-CLIENTE] END -->
      ` : ''}
      ${state.contextoAnaliseVinculada ? (() => {
        const sug = state.produtoSugeridoId
          ? PRODUTOS.find(p => p.id === state.produtoSugeridoId)
          : null;
        const p1 = state.dadosPacote1 || {};
        const camposCriticos = ['cpf', 'rg', 'profissao', 'endereco_completo'];
        const faltando = camposCriticos.filter(k => !p1[k] || String(p1[k]).trim() === '');
        const labels = { cpf: 'CPF', rg: 'RG', profissao: 'Profissão', endereco_completo: 'Endereço' };
        return `
        <!-- Banner: confeccao de peca a partir de analise vinculada do aw-eco-me -->
        <div style="margin:16px 0 24px; padding:14px 18px; border:1px solid hsla(var(--accent-h),60%,60%,0.35); border-radius:12px; background:hsla(var(--accent-h),60%,60%,0.08); display:flex; align-items:center; gap:14px; flex-wrap:wrap; font-size:13px; line-height:1.45; animation:fadeSlide 0.4s ease both;">
          <div style="flex:1; min-width:240px;">
            <div style="font-weight:600; color:hsl(270 60% 78%); margin-bottom:4px; font-size:12px; letter-spacing:1.5px; text-transform:uppercase;">Confeccionando peça vinculada</div>
            <div style="opacity:.92;">Cliente: <strong style="color:hsl(0 0% 95%);">${escapeHtml(p1.nome_completo || 'sem nome')}</strong> · Desconto: <strong style="color:hsl(0 0% 95%);">${escapeHtml(state.contextoAnaliseVinculada.desconto || '—')}</strong></div>
            ${sug ? `<div style="opacity:.75; margin-top:6px; font-size:12px;">💡 Sugestão: <strong style="color:hsl(270 60% 80%);">${escapeHtml(sug.nome)}</strong> ${state.produtoSugeridoMotivo ? `<span style="opacity:.7;">· ${escapeHtml(state.produtoSugeridoMotivo)}</span>` : ''}</div>` : ''}
            ${faltando.length > 0 ? `<div style="margin-top:8px; padding:8px 10px; background:hsla(38,92%,55%,0.08); border:1px solid hsla(38,92%,55%,0.30); border-radius:8px; color:hsl(38 92% 75%); font-size:11px;">⚠ Cliente sem ${faltando.map(k=>labels[k]).join(', ')} — preencha na Etapa 01 e os dados ficam salvos no perfil pra próximas peças.</div>` : ''}
          </div>
        </div>
        `;
      })() : ''}
      ${state.clienteParaReaproveitar ? `
        <!-- [BRIDGE-CLIENTE] banner do reaproveitamento de cliente entre fluxos. -->
        <div style="margin:16px 0 24px; padding:14px 18px; border:1px solid rgba(120,180,255,.35); border-radius:10px; background:rgba(120,180,255,.08); display:flex; align-items:center; gap:14px; flex-wrap:wrap; font-size:14px; line-height:1.45; animation:fadeSlide 0.4s ease both;">
          <div style="flex:1; min-width:240px;">
            <div style="font-weight:600; color:#a8c8ff; margin-bottom:2px;">Modo "Mesmo cliente" ativo</div>
            <div style="opacity:.85;">Selecione o próximo produto para <strong>${escapeHtml(state.clienteParaReaproveitar.nome_completo || 'o mesmo cliente')}</strong>. Os dados de qualificação já estão prontos — você só preenche o que for específico da nova peça.</div>
          </div>
          <button onclick="cancelarReaproveitarCliente()" style="padding:8px 14px; background:transparent; border:1px solid rgba(255,255,255,.25); border-radius:8px; color:inherit; cursor:pointer; font-size:13px;">Cancelar</button>
        </div>
      ` : ''}
      <div class="lobby-hero">
        <div class="lobby-hero-left">
          <h1>Selecione o <span class="accent">produto</span> jurídico.</h1>
        </div>
        <div class="lobby-hero-right">
          <div class="stat-label">Catálogo</div>
          <div class="stat-value"><span class="tabular">${ativos}</span> ativos · <span class="tabular">${locked}</span> em validação</div>
        </div>
      </div>

      <div class="search-bar">
        <svg class="search-bar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          id="buscaLobby"
          type="search"
          name="aw-writer-search"
          class="search-bar-input"
          placeholder="Buscar ação..."
          value="${escapeHtml(busca)}"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
        >
        ${busca
          ? `<button class="search-bar-clear" onclick="limparBusca()" title="Limpar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>`
          : ''
        }
      </div>

      ${filtrados.length === 0
        ? `<div class="search-empty">
            <strong>Nenhum produto encontrado</strong>
            para <em>"${escapeHtml(busca)}"</em>. Tente outro termo ou <button class="btn-link" style="padding:0;display:inline" onclick="limparBusca()">limpe a busca</button>.
          </div>`
        : `
          ${sugerido && !busca ? `
            <div class="shelf" style="position:relative;">
              <div class="shelf-header">
                <div class="shelf-title" style="color:hsl(270 60% 78%); display:inline-flex; align-items:center; gap:8px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  Produto Sugerido
                </div>
                <div class="shelf-divider" style="background:linear-gradient(90deg, hsla(var(--accent-h),60%,60%,0.35), transparent);"></div>
                <div class="shelf-count" style="color:hsl(270 60% 72%);">com base na análise vinculada</div>
              </div>
              <div class="shelf-scroll-wrap">
                <div class="shelf-grid">
                  ${renderProductCard(sugerido, 0)}
                </div>
              </div>
            </div>
          ` : ''}
          ${Object.entries(porCategoria).map(([categoria, produtos]) => `
            <div class="shelf">
              <div class="shelf-header">
                <div class="shelf-title">${categoria}</div>
                <div class="shelf-divider"></div>
                <div class="shelf-count">${produtos.length} ${produtos.length === 1 ? 'produto' : 'produtos'}${busca ? ' encontrados' : ''}</div>
              </div>
              <div class="shelf-scroll-wrap">
                <div class="shelf-grid">
                  ${produtos.map((p, i) => renderProductCard(p, i)).join('')}
                </div>
              </div>
            </div>
          `).join('')}
        `
      }
    </div>
  `;

  // Hook de input e atalho ⌘K
  const input = document.getElementById('buscaLobby');
  if (input) {
    // Se já tem busca ativa, manter foco na digitação
    if (busca) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    input.addEventListener('input', debounce(e => {
      state.buscaLobby = e.target.value;
      render();
    }, 150));
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        state.buscaLobby = '';
        render();
      }
    });
  }
}

function filtrarProdutos(produtos, busca) {
  if (!busca) return produtos;
  const termo = busca.toLowerCase().trim();
  return produtos.filter(p => {
    const campos = [
      p.nome, p.sublabel, p.categoria, p.reu,
      ...(p.rubricas || []),
    ].filter(Boolean).join(' ').toLowerCase();
    return campos.includes(termo);
  });
}

function limparBusca() {
  state.buscaLobby = '';
  render();
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function debounce(fn, ms) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/**
 * Inicializa state.rubricas com as keys corretas do produto selecionado,
 * todas marcadas como true por padrão.
 * Para produtos antigos sem rubricas_keys (produto 1), fallback pro modelo
 * histórico { cartao, parcela, bx }.
 */
function inicializarRubricasDoProduto(produto) {
  // Se o produto tem rubricas_keys explícitas (produto novo), usa elas
  if (produto.rubricas_keys && Array.isArray(produto.rubricas_keys)) {
    const out = {};
    for (const k of produto.rubricas_keys) out[k] = true;
    return out;
  }
  // Fallback pro produto 1 (Descontos Indevidos) — comportamento legado
  return { cartao: true, parcela: true, bx: true };
}

function renderProductCard(p, idx) {
  const hasImage = p.capa && p.capa.length > 0;
  const coverStyle = hasImage ? `background-image: url('${p.capa}')` : '';
  const coverClass = hasImage ? 'has-image' : 'placeholder';
  const letraDoProduto = p.nome.charAt(0);
  const rubricas = p.rubricas || [];
  const chipClass = p.ativo ? '' : 'locked';

  return `
    <div class="product-card ${p.ativo ? '' : 'locked'}"
         style="animation-delay: ${idx * 0.06}s"
         ${p.ativo ? `onclick="selecionarProduto(${p.id})"` : ''}>
      <div class="product-cover ${coverClass}" style="${coverStyle}">
        ${!hasImage ? `<div class="product-cover-mark">${letraDoProduto}</div>` : ''}
      </div>
      <div class="product-content">
        <div class="product-top">
          <div class="product-chip ${p.ativo ? (p.versaoBeta ? 'beta' : '') : 'locked'}">${p.ativo ? (p.versaoBeta ? 'Versão beta' : 'Disponível') : 'Bloqueado'}</div>
        </div>
        <div class="product-bottom">
          ${p.reu ? `<div class="product-reu">${p.reu}</div>` : ''}
          <div class="product-title">${p.nome}</div>
          <div class="product-sub">${p.sublabel}</div>
          ${rubricas.length > 0 ? `
            <div class="product-rubricas">
              ${p.rubricas_grupos
                ? `<span class="rubrica-chip ${chipClass}">Todas as rubricas</span>`
                : rubricas.map(r => `<span class="rubrica-chip ${chipClass}">${r}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function selecionarProduto(id) {
  const produto = PRODUTOS.find(p => p.id === id);
  if (!produto || !produto.ativo) return;
  state.produtoSelecionado = produto;

  // [BRIDGE-CLIENTE] BEGIN — o adv clicou "outra peça mesmo cliente" numa
  // tela done anterior (kit ou regular). Reaproveitamos a qualificação do
  // cliente direto no novo fluxo escolhido. A flag é consumida aqui (single-use).
  if (state.clienteParaReaproveitar) {
    const c = state.clienteParaReaproveitar;
    state.clienteParaReaproveitar = null;
    if (produto.kit) {
      // Kit: prefilla state.dadosKit, leva pra escolha de modalidade.
      state.dadosKit = inicializarDadosKit();
      state.dadosKit.cliente_nome_completo = c.nome_completo || '';
      state.dadosKit.cliente_genero = c.genero || 'masculino';
      state.dadosKit.cliente_nacionalidade = c.nacionalidade || (c.genero === 'feminino' ? 'brasileira' : 'brasileiro');
      state.dadosKit.cliente_estado_civil = c.estado_civil || '';
      state.dadosKit.cliente_profissao = c.profissao || '';
      state.dadosKit.cliente_rg = c.rg || '';
      state.dadosKit.cliente_orgao_expedidor = c.orgao_expedidor || '';
      state.dadosKit.cliente_cpf = c.cpf || '';
      state.dadosKit.cliente_endereco_completo = c.endereco_completo || '';
      state.arquivoKitContrato = null;
      state.arquivoKitProcuracao = null;
      state.modalidadeSelecionada = null;
      navegarPara('modalidade');
      return;
    } else {
      // Produto regular: prefilla dadosPacote1, leva pro pacote2 (perfil
      // socioeconômico ainda precisa ser preenchido pra esse produto).
      state.dadosPacote1 = { ...c };
      state.dadosPacote2 = {};
      state.dadosPacote3 = { gerar_lastro_dano_material: true };
      state.trechosIA = {};
      state.trechosIAOriginais = {};
      state.trechosEditados = new Set();
      state.anexos = { selfie: null, tabelaXlsx: null };
      state.rubricas = inicializarRubricasDoProduto(produto);
      state.seguranca = { ...SEGURANCA_DEFAULT };
      state.arquivoFinalBlob = null;
      navegarPara('pacote2');
      return;
    }
  }
  // [BRIDGE-CLIENTE] END

  // Kit (Representação · Kit Inicial) tem fluxo próprio: primeiro seleciona
  // a modalidade de honorários, depois preenche o contrato e gera 2 peças
  // (contrato + procuração unificada).
  if (produto.kit) {
    state.modalidadeSelecionada = null;
    navegarPara('modalidade');
    return;
  }

  // [TEMP-MESMO-CLIENTE] BEGIN — modo "mesmo cliente" preserva pacote1+2 e
  // pula direto pra pacote3. A bandeira é setada por novaPecaMesmoCliente().
  // Pra remover: apagar este bloco inteiro entre BEGIN/END.
  if (state.modoMesmoCliente) {
    state.modoMesmoCliente = false; // consome a bandeira
    state.rubricas = inicializarRubricasDoProduto(produto);
    navegarPara('pacote3');
    return;
  }
  // [TEMP-MESMO-CLIENTE] END

  // Preserva pacote 1 + pacote 2 quando viemos de uma analise vinculada
  // do aw-eco-me (ja foram pre-preenchidos com os dados do cliente do banco)
  // OU quando um cliente foi puxado da base (clienteSelecionado). Sem essa
  // segunda condicao, abrir o writer com ?cliente=ID e escolher o produto
  // no lobby apagava a qualificacao ja carregada — os campos voltavam vazios
  // mesmo com o cliente ainda selecionado no dropdown.
  // Caso contrario (cliente novo, sem nada puxado), limpa pra comecar zerado.
  if (!state.contextoAnaliseVinculada && !state.clienteSelecionado) {
    state.dadosPacote1 = {};
    state.dadosPacote2 = {};
  }
  // Preserva campos pre-preenchidos pela analise vinculada
  // (fetchAnaliseVinculadaMeta seta em state.dadosPacote3 antes do user
  // clicar no produto): numero_agencia, numero_conta, data_inicio_descontos,
  // data_fim_descontos. Sem isso, o reset abaixo apagava o autofill.
  // Comarca/UF tambem preservadas — herdadas em cadeia ou modo mesmo cliente.
  const ag = state.dadosPacote3 && state.dadosPacote3.numero_agencia;
  const cc = state.dadosPacote3 && state.dadosPacote3.numero_conta;
  const di = state.dadosPacote3 && state.dadosPacote3.data_inicio_descontos;
  const df = state.dadosPacote3 && state.dadosPacote3.data_fim_descontos;
  const cm = state.dadosPacote3 && state.dadosPacote3.comarca;
  const uf = state.dadosPacote3 && state.dadosPacote3.uf;
  state.dadosPacote3 = { gerar_lastro_dano_material: true };
  if (state.contextoAnaliseVinculada) {
    if (ag) state.dadosPacote3.numero_agencia = ag;
    if (cc) state.dadosPacote3.numero_conta = cc;
    if (di) state.dadosPacote3.data_inicio_descontos = di;
    if (df) state.dadosPacote3.data_fim_descontos = df;
  }
  if (cm) state.dadosPacote3.comarca = cm;
  if (uf) state.dadosPacote3.uf = uf;
  state.trechosIA = {};
  state.trechosIAOriginais = {};
  state.anexos = { selfie: null, tabelaXlsx: null };
  state.rubricas = inicializarRubricasDoProduto(produto);
  state.trechosEditados = new Set();
  state.seguranca = { ...SEGURANCA_DEFAULT };
  state.arquivoFinalBlob = null;
  navegarPara('pacote1');
}

// [TEMP-MESMO-CLIENTE] BEGIN — cancelar o modo "mesmo cliente" do banner
// no lobby. Reseta a bandeira e força re-render. Pra remover: deletar bloco.
function cancelarMesmoCliente() {
  state.modoMesmoCliente = false;
  state.dadosPacote1 = {};
  state.dadosPacote2 = {};
  state.anexos = { selfie: null, tabelaXlsx: null };
  render();
}
// [TEMP-MESMO-CLIENTE] END

// Cancela o reaproveitamento de cliente vindo do kit (bridge entre fluxos).
function cancelarReaproveitarCliente() {
  state.clienteParaReaproveitar = null;
  render();
}

/* =========================================================================
   MODALIDADE — tela exclusiva do fluxo de Kit (Representação)
   Permite escolher entre os 4 modelos de honorários antes de preencher
   os dados do contrato. Cada kit gera 2 peças: contrato + procuração.
   ========================================================================= */
const MODALIDADES_KIT = [
  {
    id: 'exito',
    nome: 'Êxito',
    tagline: 'Sem entrada. Só sucesso.',
    descricao: 'Honorário cobrado exclusivamente sobre o proveito econômico obtido. Risco zero pro cliente, alinhamento total de incentivos.',
    badge: '0% entrada',
  },
  {
    id: 'exito_final',
    nome: 'Êxito + Final',
    tagline: 'Entrada simbólica + percentual.',
    descricao: 'Combina honorário inicial (custos da causa) com participação sobre o proveito econômico. Modelo equilibrado e mais comum.',
    badge: 'Entrada + %',
  },
  {
    id: 'final',
    nome: 'Final · À vista',
    tagline: 'Valor único, pago na assinatura.',
    descricao: 'Honorário fixo, sem cláusula de êxito. Indicado pra causas com escopo definido e prazo curto, especialmente defesas.',
    badge: 'À vista',
  },
  {
    id: 'exito_parcelado',
    nome: 'Êxito Parcelado',
    tagline: 'Entrada em parcelas + percentual.',
    descricao: 'Parcela a entrada em 2 ou mais prestações, mantendo a participação sobre o êxito. Dá fôlego pro cliente adimplir o início.',
    badge: 'Parcelado + %',
  },
];

function renderModalidade(view) {
  const produto = state.produtoSelecionado;
  const nomeProduto = produto ? produto.nome : 'Kit';
  view.innerHTML = `
    <div class="lobby">
      <div class="lobby-hero">
        <div class="lobby-hero-left">
          <div class="modalidade-breadcrumb">
            <button class="btn-link" onclick="navegarPara('lobby')">← Voltar ao catálogo</button>
          </div>
          <h1>Escolha a <span class="accent">modalidade</span> de honorários.</h1>
          <div class="modalidade-sub">${escapeHtml(nomeProduto)} · cada modalidade gera um contrato diferente + a procuração unificada com declaração de hipossuficiência.</div>
        </div>
        <div class="lobby-hero-right">
          <div class="stat-label">Modalidades</div>
          <div class="stat-value"><span class="tabular">${MODALIDADES_KIT.length}</span> opções</div>
        </div>
      </div>

      <div class="modalidade-grid">
        ${MODALIDADES_KIT.map((m, i) => renderModalidadeCard(m, i)).join('')}
      </div>
    </div>
  `;
}

function renderModalidadeCard(m, idx) {
  return `
    <div class="modalidade-card"
         style="animation-delay: ${idx * 0.08}s"
         onclick="selecionarModalidade('${m.id}')">
      <div class="modalidade-card-top">
        <div class="modalidade-badge">${m.badge}</div>
        <div class="modalidade-num">0${idx + 1}</div>
      </div>
      <div class="modalidade-card-body">
        <div class="modalidade-nome">${m.nome}</div>
        <div class="modalidade-tagline">${m.tagline}</div>
        <div class="modalidade-desc">${m.descricao}</div>
      </div>
      <div class="modalidade-card-foot">
        <span class="modalidade-cta">Selecionar →</span>
      </div>
    </div>
  `;
}

function selecionarModalidade(id) {
  const modalidade = MODALIDADES_KIT.find(m => m.id === id);
  if (!modalidade) return;
  state.modalidadeSelecionada = modalidade;
  // Reseta dados do kit pra não vazar de uma sessão anterior.
  state.dadosKit = inicializarDadosKit();
  state.arquivoKitContrato = null;
  state.arquivoKitProcuracao = null;
  // Antes do formulário, o usuário escolhe DE ONDE vem o cliente.
  navegarPara('origemCliente');
}

/* =========================================================================
   ORIGEM DO CLIENTE — tela de cards (mesmo design da modalidade) antes do
   formulário do kit. Escolhe começar de: cliente da base, análise comercial
   (Finder) ou cadastro do zero. Cada card tem um ícone.
   ========================================================================= */
const ORIGENS_CLIENTE = [
  {
    id: 'analise',
    nome: 'Análise comercial',
    tagline: 'Vinda do Finder.',
    descricao: 'Puxa um cliente de uma pré-análise comercial do Finder, já com as rubricas não ajuizáveis marcadas.',
    badge: 'Finder',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><path d="M9 12h6M9 16h4"/></svg>`,
  },
  {
    id: 'base',
    nome: 'Cliente da base',
    tagline: 'Já cadastrado no sistema.',
    descricao: 'Puxa um cliente que já existe na base. Preenche nome, CPF, qualificação e endereço automaticamente.',
    badge: 'Base',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  },
  {
    id: 'zero',
    nome: 'Cadastro do zero',
    tagline: 'Cliente novo.',
    descricao: 'Começa com o formulário em branco e preenche os dados do cliente manualmente.',
    badge: 'Novo',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>`,
  },
];

function renderOrigemCliente(view) {
  const produto = state.produtoSelecionado;
  const nomeProduto = produto ? produto.nome : 'Kit';
  view.innerHTML = `
    <div class="lobby">
      <div class="lobby-hero">
        <div class="lobby-hero-left">
          <div class="modalidade-breadcrumb">
            <button class="btn-link" onclick="navegarPara('modalidade')">← Voltar às modalidades</button>
          </div>
          <h1>De onde vem o <span class="accent">cliente</span>?</h1>
          <div class="modalidade-sub">${escapeHtml(nomeProduto)} · escolha como começar o cadastro do contrato.</div>
        </div>
        <div class="lobby-hero-right">
          <div class="stat-label">Origem</div>
          <div class="stat-value"><span class="tabular">${ORIGENS_CLIENTE.length}</span> opções</div>
        </div>
      </div>

      <div class="modalidade-grid">
        ${ORIGENS_CLIENTE.map((o, i) => renderOrigemCard(o, i)).join('')}
      </div>
    </div>
  `;
}

function renderOrigemCard(o, idx) {
  return `
    <div class="modalidade-card origem-card"
         style="animation-delay: ${idx * 0.08}s"
         onclick="selecionarOrigemCliente('${o.id}')">
      <div class="modalidade-card-top">
        <div class="origem-card-icon">${o.icon}</div>
        <div class="modalidade-badge">${o.badge}</div>
      </div>
      <div class="modalidade-card-body">
        <div class="modalidade-nome">${o.nome}</div>
        <div class="modalidade-tagline">${o.tagline}</div>
        <div class="modalidade-desc">${o.descricao}</div>
      </div>
      <div class="modalidade-card-foot">
        <span class="modalidade-cta">Selecionar →</span>
      </div>
    </div>
  `;
}

function selecionarOrigemCliente(tipo) {
  if (!state.dadosKit) state.dadosKit = inicializarDadosKit();
  state.dadosKit.origem_cliente = tipo;
  // Trocar pra zero/base descarta uma análise do Finder escolhida antes, pra
  // não pular a sinalização de descontos por engano.
  if (tipo !== 'analise') {
    state.dadosKit._analise_comercial = null;
    state.dadosKit.analise_comercial_id = '';
  }
  // 'zero' vai direto pro formulário; base/análise passam pela lista de seleção.
  if (tipo === 'zero') { navegarPara('pacoteKit'); return; }
  navegarPara('selecaoCliente');
}

/* =========================================================================
   SELEÇÃO DE CLIENTE — página de lista pesquisável (base OU análise comercial),
   aberta ao escolher a origem. Clicar numa linha preenche o kit e vai pro form.
   ========================================================================= */
function _selcNorm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function renderSelecaoCliente(view) {
  const origem = (state.dadosKit && state.dadosKit.origem_cliente) || 'base';
  const isAnalise = origem === 'analise';
  const itens = isAnalise ? (state.analisesComerciais || []) : (state.clientesAW || []);
  const rows = itens.map(it => renderSelcRow(it, isAnalise)).join('');
  view.innerHTML = `
    <div class="lobby">
      <div class="lobby-hero">
        <div class="lobby-hero-left">
          <div class="modalidade-breadcrumb">
            <button class="btn-link" onclick="navegarPara('origemCliente')">← Voltar</button>
          </div>
          <h1>Selecione ${isAnalise ? 'a <span class="accent">análise</span>' : 'o <span class="accent">cliente</span>'}</h1>
          <div class="modalidade-sub">${isAnalise ? 'Pré-análises comerciais salvas no Finder.' : 'Clientes já cadastrados na base.'}</div>
        </div>
        <div class="lobby-hero-right">
          <div class="stat-label">${isAnalise ? 'Análises' : 'Clientes'}</div>
          <div class="stat-value"><span class="tabular" id="selcCount">${itens.length}</span></div>
        </div>
      </div>

      <div class="selc-search">
        <input type="text" id="selcBusca" autofocus
               placeholder="${isAnalise ? 'Buscar por nome…' : 'Buscar por nome ou CPF…'}"
               oninput="filtrarSelecaoCliente(this.value)">
      </div>

      <div class="selc-list" id="selcList">
        ${itens.length ? rows : `<div class="selc-empty">${isAnalise ? 'Nenhuma análise comercial salva ainda.' : 'Nenhum cliente na base ainda.'}</div>`}
      </div>
    </div>
  `;
}

function renderSelcRow(it, isAnalise) {
  if (isAnalise) {
    const nome = it.nome || 'sem nome';
    const n = Array.isArray(it.rubricas) ? it.rubricas.length : 0;
    const bloq = Array.isArray(it.rubricas) ? it.rubricas.filter(r => r && r.bloqueada).length : 0;
    const meta = `${n} rubrica(s)${bloq ? ` · ${bloq} não ajuizável(is)` : ''}`;
    return `
      <button type="button" class="selc-row" data-search="${escapeAttr(_selcNorm(nome))}"
              onclick="escolherAnaliseComercialLista('${escapeAttr(it.id)}')">
        <span class="selc-nome">${escapeHtml(nome)}</span>
        <span class="selc-meta">${escapeHtml(meta)}</span>
      </button>`;
  }
  const nome = it.nome_completo || 'sem nome';
  const cpf = it.cpf || '';
  const meta = cpf ? `CPF ${cpf}` : '';
  return `
    <button type="button" class="selc-row" data-search="${escapeAttr(_selcNorm(nome + ' ' + cpf))}"
            onclick="escolherClienteBase('${escapeAttr(it.aw_id)}')">
      <span class="selc-nome">${escapeHtml(nome)}</span>
      <span class="selc-meta">${escapeHtml(meta)}</span>
    </button>`;
}

function filtrarSelecaoCliente(q) {
  const nq = _selcNorm(q);
  const list = document.getElementById('selcList');
  if (!list) return;
  let vis = 0;
  list.querySelectorAll('.selc-row').forEach(row => {
    const match = !nq || (row.getAttribute('data-search') || '').includes(nq);
    row.style.display = match ? '' : 'none';
    if (match) vis++;
  });
  const c = document.getElementById('selcCount');
  if (c) c.textContent = vis;
}

async function escolherClienteBase(awId) {
  if (!awId || !state.dadosKit) return;
  let c = (state.clientesAW || []).find(x => x.aw_id === awId);
  if (!c && typeof fetchClienteAW === 'function') c = await fetchClienteAW(awId);
  if (c && typeof aplicarClienteNoKit === 'function') aplicarClienteNoKit(c);
  navegarPara('pacoteKit');
}

function escolherAnaliseComercialLista(id) {
  if (!id || !state.dadosKit) return;
  if (typeof onKitSelectAnaliseComercial === 'function') {
    // reaproveita o preenchimento (nome + CPF + guarda a análise), depois navega
    onKitSelectAnaliseComercial(id);
  }
  navegarPara('pacoteKit');
}

/* =========================================================================
   PACOTE 1
   ========================================================================= */
function renderPacote1(view) {
  const campos = [
    { key: 'nome_completo', label: 'Nome completo', tipo: 'text', wide: true },
    { key: 'genero', label: 'Gênero', tipo: 'select', opcoes: [
      { value: 'masculino', label: 'Masculino' },
      { value: 'feminino', label: 'Feminino' },
    ] },
    { key: 'nacionalidade', label: 'Nacionalidade', tipo: 'text' },
    { key: 'estado_civil', label: 'Estado civil', tipo: 'select', opcoes: [
      { value: 'solteiro', label: 'Solteiro(a)' },
      { value: 'casado', label: 'Casado(a)' },
      { value: 'divorciado', label: 'Divorciado(a)' },
      { value: 'viúvo', label: 'Viúvo(a)' },
      { value: 'união estável', label: 'União estável' },
    ] },
    { key: 'profissao', label: 'Profissão', tipo: 'text' },
    { key: 'rg', label: 'RG', tipo: 'text' },
    { key: 'orgao_expedidor', label: 'Órgão expedidor', tipo: 'text' },
    { key: 'cpf', label: 'CPF', tipo: 'text' },
    { key: 'endereco_completo', label: 'Endereço completo', tipo: 'text', wide: true },
  ];

  view.innerHTML = `
    <div class="form-page">
      <div class="form-header">
        <div class="form-eyebrow">Etapa 01 · ${state.produtoSelecionado.nome}</div>
        <div class="form-title">Qualificação do <span class="accent">requerente</span></div>
        <div class="form-sub">Dados essenciais para procuração, contrato e qualificação na inicial. Todos obrigatórios.</div>
      </div>

      ${renderBlocoClientes()}

      <div class="info-banner">
        <div class="info-banner-content">
          <span class="info-banner-label">Segurança de dados</span>
          Cada campo tem um toggle de escudo. Por padrão, identificadores sensíveis como CPF, RG e endereço ficam <strong>bloqueados</strong> — vão apenas para o documento final, nunca para a IA.
        </div>
      </div>

      <div class="field-grid">
        ${campos.map(c => renderCampo(c, state.dadosPacote1, 'pacote1', true)).join('')}
      </div>

      ${renderBlocoAnexoSelfie()}

      <div class="form-footer">
        <button class="btn-link" onclick="navegarPara('lobby')">← Voltar ao lobby</button>
        <button id="btnAvancar1" class="btn btn-primary" onclick="navegarPara('pacote2')">
          Avançar · Socioeconômico →
        </button>
      </div>
    </div>
  `;

  bindFormInputs('pacote1');
  atualizarBtnAvancar1();
}

/* =========================================================================
   ANEXOS — SELFIE (Pacote 1)
   ========================================================================= */
function renderBlocoAnexoSelfie() {
  const sel = state.anexos.selfie;
  const pulado = sel === 'pulado';
  const anexado = sel && typeof sel === 'object';

  return `
    <div class="anexo-block ${anexado ? 'anexado' : ''} ${pulado ? 'pulado' : ''}">
      <div class="anexo-header">
        <div>
          <div class="anexo-title">Selfie do cliente · procuração</div>
          <div class="anexo-sub">Imagem do cliente segurando o documento de identidade para compor a procuração. Pode ser anexada depois.</div>
        </div>
        <div class="anexo-badge">${anexado ? 'Anexado' : pulado ? 'Será anexado depois' : 'Obrigatório'}</div>
      </div>

      ${anexado ? `
        <div class="anexo-preview">
          <img src="${sel.base64}" alt="Preview selfie" class="anexo-preview-img" />
          <div class="anexo-preview-info">
            <div class="anexo-preview-nome">${sel.nome}</div>
            <div class="anexo-preview-tamanho">${(sel.tamanho / 1024).toFixed(0)} KB</div>
            <button class="anexo-remover" onclick="removerSelfie()">Remover</button>
          </div>
        </div>
      ` : `
        <div class="anexo-dropzone" id="dropzoneSelfie"
             ondragover="event.preventDefault(); this.classList.add('drag-over')"
             ondragleave="this.classList.remove('drag-over')"
             ondrop="handleDropSelfie(event)">
          <svg class="anexo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
          <div class="anexo-dropzone-title">${pulado ? 'Você optou por anexar depois' : 'Arraste a imagem ou clique para selecionar'}</div>
          <div class="anexo-dropzone-sub">Formatos aceitos: JPG, PNG, WEBP · até 5 MB</div>
          <div class="anexo-dropzone-actions">
            <label class="btn btn-primary btn-small">
              <input type="file" accept="image/jpeg,image/png,image/webp" onchange="handleFileSelfie(event)" style="display:none">
              Escolher arquivo
            </label>
            ${!pulado ? `
              <button class="btn btn-ghost btn-small" onclick="pularSelfie()">Anexarei depois</button>
            ` : `
              <button class="btn btn-ghost btn-small" onclick="desfazerPularSelfie()">Voltar a anexar</button>
            `}
          </div>
        </div>
      `}
    </div>
  `;
}

async function handleFileSelfie(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  await processarSelfie(file);
}

async function handleDropSelfie(ev) {
  ev.preventDefault();
  ev.currentTarget.classList.remove('drag-over');
  const file = ev.dataTransfer.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('Arquivo precisa ser imagem (JPG, PNG ou WEBP).');
    return;
  }
  await processarSelfie(file);
}

async function processarSelfie(file) {
  if (file.size > 5 * 1024 * 1024) {
    alert('Imagem muito grande (máx 5 MB).');
    return;
  }
  const base64 = await fileParaBase64(file);
  state.anexos.selfie = {
    base64,          // data:image/jpeg;base64,... (completo, pronto pra src)
    mimeType: file.type,
    nome: file.name,
    tamanho: file.size,
  };
  render();
}

function fileParaBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function pularSelfie() {
  state.anexos.selfie = 'pulado';
  render();
}

function desfazerPularSelfie() {
  state.anexos.selfie = null;
  render();
}

function removerSelfie() {
  state.anexos.selfie = null;
  render();
}

/* =========================================================================
   ANEXOS — TABELA DE DESCONTOS XLSX (Pacote 3)
   ========================================================================= */

function renderBlocoAnexoTabela() {
  const tab = state.anexos.tabelaXlsx;
  const pulado = tab === 'pulado';
  const anexado = tab && typeof tab === 'object';

  let infoAnexado = '';
  if (anexado) {
    const linhasDado = tab.linhasDataApenas || tab.linhas || [];
    const totalLinhas = linhasDado.length;
    const totalFormatado = tab.valorTotal != null
      ? `R$ ${tab.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '—';
    const dobroFormatado = tab.valorDobro != null
      ? `R$ ${tab.valorDobro.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '—';

    // Mapa rubricaKey -> label legivel do produto atual (cada produto tem
    // rubricas_keys[] e rubricas[] paralelos)
    const prod = state.produtoSelecionado;
    const labelRubrica = (key) => {
      if (!prod || !Array.isArray(prod.rubricas_keys)) return key;
      const idx = prod.rubricas_keys.indexOf(key);
      return idx >= 0 ? prod.rubricas[idx] : key;
    };
    // Conta de itens nao classificados — sinal de alerta pro user revisar
    const semRubrica = linhasDado.filter(l => !l.rubricaKey).length;

    const expandido = state._anexoDescontosExpandido === true;

    infoAnexado = `
      <div class="anexo-preview">
        <div class="anexo-preview-icon-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="anexo-preview-icon-large">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
          </svg>
        </div>
        <div class="anexo-preview-info">
          <div class="anexo-preview-nome">${tab.nomeArquivo}</div>
          <div class="anexo-preview-tamanho">${totalLinhas} descontos · Total ${totalFormatado} · Dobro ${dobroFormatado}${semRubrica > 0 ? ` · <span style="color:hsl(38 92% 65%);font-weight:600;">${semRubrica} sem classificacao</span>` : ''}</div>
          <div style="display:flex; gap:10px; align-items:center; margin-top:8px;">
            <button onclick="toggleAnexoDescontos()" class="anexo-remover" style="background:hsla(var(--accent-h),60%,60%,0.12); border:1px solid hsla(var(--accent-h),60%,60%,0.4); color:hsl(var(--accent-h),60%,80%);">
              ${expandido ? 'Esconder revisão' : 'Revisar planilha com rubricas'}
            </button>
            <button class="anexo-remover" onclick="removerTabelaXlsx()">Remover</button>
          </div>
          ${expandido ? `
            <div style="margin-top:12px; padding:0; background:hsla(0,0%,100%,0.02); border:1px solid hsla(0,0%,100%,0.06); border-radius:10px; max-height:420px; overflow-y:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:11.5px; font-family:Inter,sans-serif;">
                <thead style="position:sticky; top:0; background:hsla(0,0%,0%,0.4); backdrop-filter:blur(8px); z-index:1;">
                  <tr style="border-bottom:1px solid hsla(0,0%,100%,0.08);">
                    <th style="padding:9px 10px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:1.2px; color:var(--text-ghost,#888); font-weight:700;">Data</th>
                    <th style="padding:9px 10px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:1.2px; color:var(--text-ghost,#888); font-weight:700;">Descrição</th>
                    <th style="padding:9px 10px; text-align:right; font-size:10px; text-transform:uppercase; letter-spacing:1.2px; color:var(--text-ghost,#888); font-weight:700;">Valor</th>
                    <th style="padding:9px 10px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:1.2px; color:var(--text-ghost,#888); font-weight:700;">Rubrica detectada</th>
                  </tr>
                </thead>
                <tbody>
                  ${linhasDado.map(l => {
                    const rkey = l.rubricaKey;
                    const rLabel = rkey ? labelRubrica(rkey) : null;
                    return `
                      <tr style="border-bottom:1px solid hsla(0,0%,100%,0.04);">
                        <td style="padding:7px 10px; color:var(--text-dim,#bbb); font-variant-numeric:tabular-nums; white-space:nowrap;">${escapeHtml(l.data || '')}</td>
                        <td style="padding:7px 10px; color:var(--text-strong,#e5e5e5); overflow:hidden; text-overflow:ellipsis; max-width:280px; white-space:nowrap;" title="${escapeHtml(l.descricao || '')}">${escapeHtml(l.descricao || '')}</td>
                        <td style="padding:7px 10px; color:var(--text-strong,#e5e5e5); font-variant-numeric:tabular-nums; text-align:right; white-space:nowrap;">R$ ${Number(l.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style="padding:7px 10px;">
                          ${rkey
                            ? `<span style="display:inline-block; font-size:10px; font-weight:600; letter-spacing:0.3px; padding:3px 8px; border-radius:999px; background:hsla(var(--accent-h),60%,60%,0.12); color:hsl(var(--accent-h),60%,80%); border:1px solid hsla(var(--accent-h),60%,60%,0.3); white-space:nowrap;">${escapeHtml(rLabel)}</span>`
                            : `<span style="display:inline-block; font-size:10px; font-weight:600; padding:3px 8px; border-radius:999px; background:hsla(38,92%,60%,0.1); color:hsl(38,92%,72%); border:1px solid hsla(38,92%,60%,0.3); white-space:nowrap;" title="Nao classificado automaticamente — marque a rubrica manualmente abaixo">⚠ revisar</span>`}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
              <div style="padding:9px 12px; background:hsla(0,0%,100%,0.02); border-top:1px solid hsla(0,0%,100%,0.06); font-size:10.5px; color:var(--text-ghost,#888); line-height:1.5;">
                Confira se cada desconto bate com a rubrica detectada. Se algo estiver fora, use os checkboxes de rubrica abaixo pra ajustar manualmente.
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  return `
    <div class="anexo-block ${anexado ? 'anexado' : ''} ${pulado ? 'pulado' : ''}">
      <div class="anexo-header">
        <div>
          <div class="anexo-title">Tabela de descontos · planilha XLSX</div>
          <div class="anexo-sub">Planilha com a discriminação dos descontos indevidos. Os valores serão incorporados ao documento e usados para autopreencher "Valor total" e "Valor em dobro".</div>
        </div>
        <div class="anexo-badge">${anexado ? 'Anexada' : pulado ? 'Será anexada depois' : 'Obrigatória'}</div>
      </div>

      ${anexado ? infoAnexado : state.planilhaCarregando ? `
        <div class="anexo-dropzone" style="border-color:hsla(var(--accent-h),60%,60%,0.4); background:hsla(var(--accent-h),60%,60%,0.05);">
          <div style="display:flex;align-items:center;justify-content:center;gap:14px;flex-direction:column;padding:16px 0;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="hsl(270 60% 70%)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite;">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            <div style="font-size:14px;font-weight:500;color:hsl(270 60% 80%);">Baixando planilha vinculada…</div>
            <div style="font-size:11px;color:var(--text-mute);">Vamos anexar automaticamente assim que chegar</div>
          </div>
        </div>
      ` : state.planilhaErro ? `
        <div class="anexo-dropzone" style="border-color:hsla(0,72%,55%,0.4); background:hsla(0,72%,55%,0.05);">
          <svg class="anexo-icon" viewBox="0 0 24 24" fill="none" stroke="hsl(0 72% 65%)" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <div class="anexo-dropzone-title" style="color:hsl(0 72% 75%);">Não consegui baixar a planilha vinculada</div>
          <div class="anexo-dropzone-sub">${state.planilhaErro} · você pode tentar de novo ou anexar manualmente</div>
          <div class="anexo-dropzone-actions">
            <button class="btn btn-primary btn-small" onclick="tentarBaixarPlanilhaVinculada()">Tentar de novo</button>
            <label class="btn btn-ghost btn-small">
              <input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onchange="handleFileTabela(event)" style="display:none">
              Anexar manualmente
            </label>
          </div>
        </div>
      ` : `
        <div class="anexo-dropzone" id="dropzoneTabela"
             ondragover="event.preventDefault(); this.classList.add('drag-over')"
             ondragleave="this.classList.remove('drag-over')"
             ondrop="handleDropTabela(event)">
          <svg class="anexo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
          </svg>
          <div class="anexo-dropzone-title">${pulado ? 'Você optou por anexar depois' : 'Arraste o XLSX ou clique para selecionar'}</div>
          <div class="anexo-dropzone-sub">Formatos aceitos: .xlsx, .xls · primeira aba será lida automaticamente</div>
          <div class="anexo-dropzone-actions" style="flex-direction:column;align-items:stretch;gap:12px;">
            ${state.contextoAnaliseVinculada && state.contextoAnaliseVinculada.analise_url ? `
              <button onclick="tentarBaixarPlanilhaVinculada()"
                style="display:inline-flex;align-items:center;justify-content:center;gap:10px;background:hsla(var(--accent-h),60%,60%,0.18);border:1.5px solid hsla(var(--accent-h),60%,60%,0.55);border-radius:12px;color:hsl(270 60% 82%);font-family:Inter,sans-serif;font-size:0.82rem;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;padding:16px 26px;cursor:pointer;transition:all 0.2s;box-shadow:0 0 28px hsla(var(--accent-h),60%,60%,0.18);"
                onmouseenter="this.style.background='hsla(var(--accent-h),60%,60%,0.28)';this.style.boxShadow='0 0 36px hsla(var(--accent-h),60%,60%,0.35)';this.style.borderColor='hsla(var(--accent-h),60%,60%,0.80)';this.style.transform='translateY(-1px)';"
                onmouseleave="this.style.background='hsla(var(--accent-h),60%,60%,0.18)';this.style.boxShadow='0 0 28px hsla(var(--accent-h),60%,60%,0.18)';this.style.borderColor='hsla(var(--accent-h),60%,60%,0.55)';this.style.transform='translateY(0)';">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                Usar da Análise Vinculada
              </button>
            ` : ''}
            <div style="display:flex;align-items:center;gap:10px;justify-content:center;flex-wrap:wrap;">
              <label class="btn btn-primary btn-small">
                <input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onchange="handleFileTabela(event)" style="display:none">
                Escolher outro arquivo
              </label>
              ${!pulado ? `
                <button class="btn btn-ghost btn-small" onclick="pularTabelaXlsx()">Anexarei depois</button>
              ` : `
                <button class="btn btn-ghost btn-small" onclick="desfazerPularTabelaXlsx()">Voltar a anexar</button>
              `}
            </div>
          </div>
        </div>
      `}
    </div>
  `;
}

async function handleFileTabela(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  await processarTabelaXlsx(file);
}

// Baixa a planilha vinculada (URL gravada no Supabase) e processa
// como se fosse upload do user. Idempotente — pula se ja tem planilha.
async function carregarPlanilhaDaAnaliseVinculada(url) {
  if (!url) return { ok: false, reason: 'sem url' };
  if (state.anexos && state.anexos.tabelaXlsx && typeof state.anexos.tabelaXlsx === 'object') {
    return { ok: true, skipped: 'ja carregada' };
  }
  state.planilhaCarregando = true;
  state.planilhaErro = null;
  if (typeof render === 'function') render();
  try {
    console.log('[writer] baixando planilha da analise vinculada:', url);
    const resp = await fetch(url, { mode: 'cors', cache: 'no-store' });
    if (!resp.ok) {
      const msg = 'HTTP ' + resp.status;
      console.warn('[writer] download planilha falhou', msg);
      state.planilhaCarregando = false;
      state.planilhaErro = msg;
      if (typeof render === 'function') render();
      return { ok: false, error: msg };
    }
    const blob = await resp.blob();
    const fileName = url.split('/').pop() || 'analise-vinculada.xlsx';
    const file = new File([blob], decodeURIComponent(fileName), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    await processarTabelaXlsx(file);
    state.planilhaCarregando = false;
    state.planilhaErro = null;
    console.log('[writer] planilha da analise vinculada carregada');
    return { ok: true };
  } catch (e) {
    console.warn('[writer] excecao baixando planilha', e);
    state.planilhaCarregando = false;
    state.planilhaErro = String(e && e.message || e);
    if (typeof render === 'function') render();
    return { ok: false, error: String(e) };
  }
}

// Re-tenta o download (acionavel pelo botao no banner de erro)
async function tentarBaixarPlanilhaVinculada() {
  const url = state.contextoAnaliseVinculada && state.contextoAnaliseVinculada.analise_url;
  if (!url) return;
  await carregarPlanilhaDaAnaliseVinculada(url);
}

async function handleDropTabela(ev) {
  ev.preventDefault();
  ev.currentTarget.classList.remove('drag-over');
  const file = ev.dataTransfer.files[0];
  if (!file) return;
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    alert('Arquivo precisa ser .xlsx ou .xls');
    return;
  }
  await processarTabelaXlsx(file);
}

async function processarTabelaXlsx(file) {
  if (typeof XLSX === 'undefined') {
    alert('Biblioteca XLSX não carregou. Recarregue a página.');
    return;
  }
  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, cellStyles: true });
    const primeiraAba = workbook.SheetNames[0];
    if (!primeiraAba) {
      alert('Planilha sem abas.');
      return;
    }
    const ws = workbook.Sheets[primeiraAba];

    // Array de arrays bruto (todas as linhas, incluindo subtítulos mesclados)
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'dd/mm/yyyy', defval: '' });
    if (rows.length < 2) {
      alert('Planilha parece vazia.');
      return;
    }

    // Lista de células mescladas (pra detectar subtítulos que ocupam várias colunas)
    const merges = ws['!merges'] || [];
    const linhasMescladas = new Set();
    for (const m of merges) {
      // Linha mesclada horizontalmente (começa em col 0, termina >= col 2, mesma linha)
      if (m.s.c === 0 && m.e.c >= 2 && m.s.r === m.e.r) {
        linhasMescladas.add(m.s.r);
      }
    }

    // Classifica cada linha da planilha em: cabecalho, subtitulo, dado, valor_total, valor_dobro
    // Preservamos TODAS as linhas pra que a tabela no .docx seja fiel ao XLSX
    const linhasClassificadas = [];
    const linhasDataParaCalcular = []; // só as de dado, pra computar min/max de data

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (row.every(v => v === '' || v == null)) continue; // pula linhas totalmente vazias

      const primeiraCel = (row[0] || '').toString().trim();
      const primeiraCelUp = primeiraCel.toUpperCase();

      // Linhas especiais de total
      if (primeiraCelUp === 'VALOR TOTAL') {
        linhasClassificadas.push({ tipo: 'valor_total', valor: parseValor(row[row.length - 1]) });
        continue;
      }
      if (primeiraCelUp === 'VALOR EM DOBRO' || primeiraCelUp === 'VALOR DOBRO') {
        linhasClassificadas.push({ tipo: 'valor_dobro', valor: parseValor(row[row.length - 1]) });
        continue;
      }

      // Linha de cabeçalho (primeira "Data" + segunda "Descrição")
      if (primeiraCel === 'Data' && (row[1] || '').toString().trim() === 'Descrição') {
        linhasClassificadas.push({ tipo: 'cabecalho' });
        continue;
      }

      // Subtítulo (célula mesclada ocupando horizontalmente a linha)
      if (linhasMescladas.has(r)) {
        linhasClassificadas.push({ tipo: 'subtitulo', texto: primeiraCel });
        continue;
      }

      // Linha de dados (data | descrição | operação | valor)
      const dataStr = (row[0] || '').toString().trim();
      const dataObj = parseDataBR(dataStr);
      const valor = parseValor(row[3]);

      if (dataObj && !isNaN(valor)) {
        const linhaDado = {
          tipo: 'dado',
          data: dataStr,
          dataObj,
          descricao: (row[1] || '').toString().trim(),
          operacao: (row[2] || '').toString().trim(),
          valor,
          valor_formatado: formatarValorBR(valor),
        };
        linhasClassificadas.push(linhaDado);
        linhasDataParaCalcular.push(linhaDado);
      }
      // Se não é nenhum dos tipos reconhecidos, ignora silenciosamente
    }

    if (linhasDataParaCalcular.length === 0) {
      alert('Nenhuma linha de desconto válida encontrada. Confira se as datas estão como DD/MM/AAAA.');
      return;
    }

    // Extrai valor total e dobro (se não vieram como linhas, calcula)
    let valorTotal = null, valorDobro = null;
    for (const l of linhasClassificadas) {
      if (l.tipo === 'valor_total' && isFinite(l.valor)) valorTotal = l.valor;
      if (l.tipo === 'valor_dobro' && isFinite(l.valor)) valorDobro = l.valor;
    }
    if (valorTotal == null) {
      valorTotal = linhasDataParaCalcular.reduce((s, l) => s + l.valor, 0);
      // Adiciona linha de total virtual se não existia
      linhasClassificadas.push({ tipo: 'valor_total', valor: valorTotal });
    }
    if (valorDobro == null) {
      valorDobro = valorTotal * 2;
      linhasClassificadas.push({ tipo: 'valor_dobro', valor: valorDobro });
    }

    // Min/max de data (usa só linhas de dados reais)
    const ordenadas = [...linhasDataParaCalcular].sort((a, b) => a.dataObj - b.dataObj);

    state.anexos.tabelaXlsx = {
      nomeArquivo: file.name,
      linhasClassificadas,        // TODAS as linhas fiéis ao XLSX — usado pra montar tabela no .docx
      linhasDataApenas: linhasDataParaCalcular, // só as de dado — usado pra min/max e contagens
      valorTotal,
      valorDobro,
    };

    // Autopreencher os campos do Pacote 3 (datas e valor total)
    autopreencherValoresDaTabela();

    // Autodetectar rubricas presentes na planilha e sobrescrever state.rubricas
    // (planilha é fonte da verdade também pras rubricas aplicáveis)
    autodetectarRubricas();

    render();

    // Mix Bradesco: se a autodetecção produziu conflitos (linhas que batem
    // em 2+ rubricas), abre o modal interativo pra o advogado resolver.
    // Roda DEPOIS do render() pra o modal aparecer por cima do Pacote 3.
    const conflitos = (state.dadosPacote3 && state.dadosPacote3._conflitos_rubrica) || [];
    if (conflitos.length > 0) {
      abrirModalConflitosRubrica();
    }
  } catch (err) {
    console.error('Erro ao processar XLSX:', err);
    alert('Falha ao ler a planilha: ' + err.message);
  }
}

/**
 * Detecta quais rubricas estão presentes na planilha anexada, olhando a coluna
 * `Descrição` (e, como reforço, subtítulos mesclados). Normaliza descrições
 * comuns e marca as flags em state.rubricas conforme o produto selecionado.
 *
 * Estratégia conservadora: marca TRUE quando detecta, FALSE quando não detecta.
 * O usuário pode sempre ajustar manualmente depois via checkbox no Pacote 3.
 *
 * Produto 1 (Descontos Indevidos): { cartao, parcela, bx }
 * Produto 5 (Juros e Encargos): { mora_cred_pessoal, mora_cartao, encargos_limite, encargos_descobertos }
 */
function autodetectarRubricas() {
  const tab = state.anexos.tabelaXlsx;
  if (!tab || !Array.isArray(tab.linhasClassificadas)) return;

  const produto = state.produtoSelecionado;
  const isProdutoJuros = produto && produto.rubricas_keys &&
    produto.rubricas_keys.includes('mora_cred_pessoal');
  const isProdutoTarifas = produto && produto.rubricas_keys &&
    produto.rubricas_keys.includes('saque_terminal');
  const isProdutoPrestamista = produto && produto.rubricas_keys &&
    produto.rubricas_keys.includes('seguro_prestamista');
  const isProdutoVidaPrev = produto && produto.rubricas_keys &&
    produto.rubricas_keys.includes('vida_previdencia');
  const isProdutoCapitalizacao = produto && produto.rubricas_keys &&
    produto.rubricas_keys.includes('titulo_capitalizacao');
  const isProdutoCestaServicos = produto && produto.rubricas_keys &&
    produto.rubricas_keys.includes('cesta_servicos');
  const isProdutoAnuidade = produto && produto.rubricas_keys &&
    produto.rubricas_keys.includes('anuidade_cartao');
  const isProdutoSeguroCartao = produto && produto.rubricas_keys &&
    produto.rubricas_keys.includes('seguro_cartao_protegido');
  // Produto 14 (Mix Bradesco) — tem TODAS as 16 rubrica_keys; identificado
  // pela presença do 'anuidade_cartao' + 'seguro_cartao_protegido' juntos
  // (combinação que só o Mix tem, já que os outros são singleton).
  const isProdutoMixBradesco = produto && produto.rubricas_keys &&
    produto.rubricas_keys.includes('anuidade_cartao') &&
    produto.rubricas_keys.includes('seguro_cartao_protegido') &&
    produto.rubricas_keys.includes('cesta_servicos');

  // Classifica uma string (descrição ou subtítulo) na key correspondente
  function classificar(texto) {
    const t = String(texto || '').toUpperCase().trim();
    if (!t) return null;

    if (isProdutoPrestamista) {
      // Produto 6 — rubrica única: SEGURO PRESTAMISTA. Bancos abreviam de
      // formas variadas no extrato — capturamos qualquer combinação que
      // mencione "SEG…" e "PREST…" (cobre "SEGURO PRESTAMISTA",
      // "SEG PRESTAMISTA", "SEG.PRESTAMISTA", "SEGURO PREST.", etc).
      if (t.includes('SEG') && t.includes('PREST')) {
        return 'seguro_prestamista';
      }
      return null;
    }

    if (isProdutoVidaPrev) {
      // Produto 7 — rubrica única: BRADESCO VIDA E PREVIDÊNCIA. Variações
      // observadas no XLSX do AW Finder: "VIDA E PREVIDENCIA",
      // "BRADESCO VIDA E PREVIDENCIA", "BRADESCO VIDA E PREVIDENCIA S/A".
      // Captura qualquer combinação que mencione "VIDA" + "PREV".
      if (t.includes('VIDA') && t.includes('PREV')) {
        return 'vida_previdencia';
      }
      return null;
    }

    if (isProdutoCapitalizacao) {
      // Produto 8 — rubrica única: TÍTULO DE CAPITALIZAÇÃO. Variações
      // observadas no XLSX do AW Finder: "TITULO DE CAPITALIZACAO",
      // "TÍTULO DE CAPITALIZAÇÃO", "TIT. CAPITALIZACAO".
      // Captura qualquer combinação que mencione "TIT" + "CAPITALIZ".
      if (t.includes('TIT') && t.includes('CAPITALIZ')) {
        return 'titulo_capitalizacao';
      }
      return null;
    }

    if (isProdutoCestaServicos) {
      // Produto 9 — rubrica única: CESTA DE SERVIÇOS BANCÁRIOS.
      // Bradesco usa nomes variáveis: CESTA B. EXPRESSO, CESTA EXPRESSO,
      // CESTA SUPER, CESTA TOP, CESTA EXCLUSIVA, etc.
      // Captura qualquer descrição que comece com "CESTA".
      if (t.startsWith('CESTA ') || t === 'CESTA' || t.includes(' CESTA ')) {
        return 'cesta_servicos';
      }
      return null;
    }

    if (isProdutoAnuidade) {
      // Produto 12 — rubrica única: CARTÃO DE CRÉDITO ANUIDADE.
      // Variações observadas no XLSX do AW Finder e em extratos Bradesco:
      // "CARTÃO DE CRÉDITO ANUIDADE", "CARTAO DE CREDITO ANUIDADE",
      // "ANUIDADE CARTAO", "ANUIDADE DE CARTAO", "ANUIDADE DO CARTÃO".
      // Estratégia conservadora: qualquer descrição contendo "ANUIDADE"
      // bate, pois nenhuma outra rubrica Bradesco usa esse termo.
      if (t.includes('ANUIDADE')) {
        return 'anuidade_cartao';
      }
      return null;
    }

    if (isProdutoSeguroCartao) {
      // Produto 13 — rubrica única: SEGURO CARTÃO PROTEGIDO.
      // O próprio template alerta "(ou nomenclatura similar)". Variações
      // possíveis em extratos Bradesco: "SEGURO CARTÃO PROTEGIDO",
      // "SEG CARTÃO PROTEGIDO", "CARTÃO PROTEGIDO", "PROTEÇÃO CARTÃO".
      // Estratégia: PROTEGIDO + CART (cobre todas as variantes acima sem
      // colidir com Prestamista — que usa SEG + PREST).
      if (t.includes('PROTEGIDO') && (t.includes('CART') || t.includes('CRÉDIT') || t.includes('CREDIT'))) {
        return 'seguro_cartao_protegido';
      }
      return null;
    }

    if (isProdutoTarifas) {
      // Produto 3 — 3 rubricas das tarifas bancárias
      // Match em "SAQUE TERMINAL" — específico antes de fallbacks genéricos
      if (t.includes('SAQUE TERMINAL') || t.includes('SAQUE-TERMINAL') ||
          (t.includes('SAQUE') && t.includes('TERMINAL'))) {
        return 'saque_terminal';
      }
      // Match em "EMISSÃO DE EXTRATO" / "EMISSAO DE EXTRATO"
      if (t.includes('EMISSÃO DE EXTRATO') || t.includes('EMISSAO DE EXTRATO') ||
          (t.includes('EMISS') && t.includes('EXTRATO'))) {
        return 'emissao_extrato';
      }
      // Match em "EXTRATO MOVIMENTAÇÃO" / "EXTRATO MOVIMENTACAO" — DEPOIS do match de emissão
      // pra "EMISSAO DE EXTRATO" não cair aqui
      if (t.includes('EXTRATO MOVIMENT') || t.includes('MOVIMENTAÇÃO') ||
          t.includes('MOVIMENTACAO')) {
        return 'extrato_movimentacao';
      }
      return null;
    }

    if (isProdutoJuros) {
      // Produto 5 — 4 rubricas dos juros/encargos
      if (t.includes('MORA CRED PESSOAL') || (t.includes('MORA') && t.includes('CRED') && t.includes('PESSOAL'))) {
        return 'mora_cred_pessoal';
      }
      if (t.includes('MORA CARTÃO') || t.includes('MORA CARTAO') || (t.includes('MORA') && t.includes('CART'))) {
        return 'mora_cartao';
      }
      if (t.includes('ENCARGOS LIMITE') || t.includes('ENCARGO LIMITE') ||
          (t.includes('LIMITE') && t.includes('CRED'))) {
        return 'encargos_limite';
      }
      if (t.includes('ENCARGOS DESCOBERTOS') || t.includes('DESCOBERTO')) {
        return 'encargos_descobertos';
      }
      return null;
    }

    // Produto 1 — rubricas legadas
    if (t.includes('BX.ANT') || t.includes('BX ANT') ||
        t.includes('ANTECIPA') || t.includes('BAIXA ANT')) {
      return 'bx';
    }
    if (t.includes('PARCELA') && (t.includes('CRED') || t.includes('CRÉD'))) {
      return 'parcela';
    }
    if (t.includes('CRÉDITO PESSOAL') || t.includes('CREDITO PESSOAL')) {
      return 'parcela';
    }
    if (t.includes('GASTOS') && (t.includes('CART') || t.includes('CARTÃO'))) {
      return 'cartao';
    }
    if (t.includes('CARTÃO DE CRÉDITO') || t.includes('CARTAO DE CREDITO')) {
      return 'cartao';
    }
    return null;
  }

  // Inicializa todas as keys do produto atual como false
  const detectadas = {};
  if (produto && produto.rubricas_keys) {
    for (const k of produto.rubricas_keys) detectadas[k] = false;
  } else {
    // Fallback produto 1
    detectadas.cartao = false;
    detectadas.parcela = false;
    detectadas.bx = false;
  }

  // ============================================================
  // Mix Bradesco (produto 14): roda TODAS as 16 lógicas, captura
  // multi-matches e armazena conflitos pra o modal interativo
  // ============================================================
  // Lista pra rastrear conflitos (linha com 2+ matches) — usado pro modal
  const conflitos = [];

  function classificarMix(t) {
    const matches = [];
    // Ordem: mais específico → mais genérico (a primeira posição vira o
    // "default" em caso de conflito; o usuário pode revisar no modal)
    if (t.includes('ANUIDADE')) matches.push('anuidade_cartao');
    if (t.includes('PROTEGIDO') && (t.includes('CART') || t.includes('CRÉDIT') || t.includes('CREDIT'))) matches.push('seguro_cartao_protegido');
    if (t.includes('SEG') && t.includes('PREST')) matches.push('seguro_prestamista');
    if (t.includes('VIDA') && t.includes('PREV')) matches.push('vida_previdencia');
    if (t.includes('TIT') && t.includes('CAPITALIZ')) matches.push('titulo_capitalizacao');
    if (t.startsWith('CESTA ') || t === 'CESTA' || t.includes(' CESTA ')) matches.push('cesta_servicos');
    if (t.includes('SAQUE TERMINAL') || t.includes('SAQUE-TERMINAL') || (t.includes('SAQUE') && t.includes('TERMINAL'))) matches.push('saque_terminal');
    if (t.includes('EMISSÃO DE EXTRATO') || t.includes('EMISSAO DE EXTRATO') || (t.includes('EMISS') && t.includes('EXTRATO'))) matches.push('emissao_extrato');
    if (t.includes('EXTRATO MOVIMENT') || t.includes('MOVIMENTAÇÃO') || t.includes('MOVIMENTACAO')) matches.push('extrato_movimentacao');
    if (t.includes('MORA CRED PESSOAL') || (t.includes('MORA') && t.includes('CRED') && t.includes('PESSOAL'))) matches.push('mora_cred_pessoal');
    // mora_cartao só bate se NÃO tiver ANUIDADE (já capturado acima como anuidade_cartao)
    if (!matches.includes('anuidade_cartao') && (t.includes('MORA CARTÃO') || t.includes('MORA CARTAO') || (t.includes('MORA') && t.includes('CART')))) matches.push('mora_cartao');
    if (t.includes('ENCARGOS LIMITE') || t.includes('ENCARGO LIMITE') || (t.includes('LIMITE') && t.includes('CRED'))) matches.push('encargos_limite');
    if (t.includes('ENCARGOS DESCOBERTOS') || t.includes('DESCOBERTO')) matches.push('encargos_descobertos');
    if (t.includes('BX.ANT') || t.includes('BX ANT') || t.includes('ANTECIPA') || t.includes('BAIXA ANT')) matches.push('bx');
    if (t.includes('PARCELA') && (t.includes('CRED') || t.includes('CRÉD'))) matches.push('parcela');
    if ((t.includes('CRÉDITO PESSOAL') || t.includes('CREDITO PESSOAL')) && !matches.includes('parcela')) matches.push('parcela');
    // cartao é o mais genérico — só captura se não bateu em ANUIDADE/PROTEGIDO antes
    if (!matches.includes('anuidade_cartao') && !matches.includes('seguro_cartao_protegido') &&
        ((t.includes('GASTOS') && (t.includes('CART') || t.includes('CARTÃO'))) ||
         t.includes('CARTÃO DE CRÉDITO') || t.includes('CARTAO DE CREDITO'))) {
      matches.push('cartao');
    }
    return matches;
  }

  if (isProdutoMixBradesco) {
    for (let i = 0; i < tab.linhasClassificadas.length; i++) {
      const l = tab.linhasClassificadas[i];
      const texto = l.tipo === 'dado' ? l.descricao : (l.tipo === 'subtitulo' ? l.texto : null);
      if (!texto) continue;
      const t = String(texto).toUpperCase().trim();
      const matches = classificarMix(t);
      if (matches.length === 0) continue;
      // Aplica o PRIMEIRO match (mais específico) por default
      detectadas[matches[0]] = true;
      l.rubricaKey = matches[0]; // preview da planilha le esse campo
      // Se houve 2+ matches, registra conflito pro modal interativo
      if (matches.length > 1) {
        conflitos.push({
          linhaIdx: i,
          descricao: texto,
          candidatos: matches,
          escolha: matches[0],  // default = mais específico; user pode mudar no modal
        });
      }
    }
    // Guarda conflitos no state pra o modal acessar
    state.dadosPacote3._conflitos_rubrica = conflitos;
  } else {
    for (const l of tab.linhasClassificadas) {
      if (l.tipo === 'dado') {
        const r = classificar(l.descricao);
        if (r) {
          l.rubricaKey = r; // preview da planilha le esse campo
          if (r in detectadas) detectadas[r] = true;
        }
      } else if (l.tipo === 'subtitulo') {
        const r = classificar(l.texto);
        if (r && r in detectadas) detectadas[r] = true;
      }
    }
  }

  // Estratégia de merge seguro:
  // - Se a autodetecção encontrou AO MENOS UMA rubrica, sobrescreve state.rubricas
  //   (a planilha é fonte da verdade)
  // - Se NÃO encontrou nada (formato desconhecido, planilha vazia, etc), MANTÉM
  //   o state.rubricas atual (todos true por default após selecionar o produto,
  //   ou o que o usuário tenha marcado manualmente)
  const nDetectadas = Object.values(detectadas).filter(Boolean).length;
  // Flags pra UI sinalizar visualmente o resultado da autodetecção
  state.dadosPacote3._autodetect_rodou = true;
  state.dadosPacote3._autodetect_fez_match = nDetectadas > 0;
  if (nDetectadas > 0) {
    state.rubricas = detectadas;
    console.log('[autodetectarRubricas] ✓ Detectou', nDetectadas, 'rubricas:',
      Object.entries(detectadas).filter(([_,v]) => v).map(([k]) => k));
  } else {
    console.warn('[autodetectarRubricas] Nenhuma rubrica reconhecida na planilha anexada.',
      'Mantendo seleção manual/default. Descrições encontradas:',
      tab.linhasClassificadas
        .filter(l => l.tipo === 'dado')
        .map(l => l.descricao)
        .slice(0, 10));
  }
}

/**
 * Converte valor de célula de XLSX pra Number, aceitando múltiplos formatos:
 * - "1.470,62" (BR com milhar)
 * - "1,470.62" (EN com milhar) — caso comum quando o Excel reconhece a célula como number
 * - "1470,62" (BR sem milhar)
 * - "1470.62" (EN sem milhar)
 * - 1470.62 (número nativo)
 * - "R$ 1.470,62" e variantes
 */
function parseValor(v) {
  if (v == null || v === '') return NaN;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/R\$\s*/gi, '').trim();

  // BR com separador de milhar: "1.470,62"
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }
  // BR sem milhar: "1470,62"
  if (/^\d+,\d+$/.test(s)) {
    return parseFloat(s.replace(',', '.'));
  }
  // EN com milhar: "1,470.62"
  if (/^\d{1,3}(,\d{3})+\.\d+$/.test(s)) {
    return parseFloat(s.replace(/,/g, ''));
  }
  // EN sem milhar ou inteiro: "1470.62", "1470"
  if (/^\d+(\.\d+)?$/.test(s)) {
    return parseFloat(s);
  }
  // Fallback: tenta interpretar removendo vírgulas
  return parseFloat(s.replace(/,/g, ''));
}

/**
 * Formata Number em padrão brasileiro (1.470,62) com exatamente 2 casas decimais.
 */
function formatarValorBR(n) {
  if (!isFinite(n)) return '';
  return n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Converte string "DD/MM/AAAA" em Date. Retorna null se não bater o formato.
 */
function parseDataBR(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String(s || '').trim());
  if (!m) return null;
  let [, dd, mm, yy] = m;
  if (yy.length === 2) yy = '20' + yy;
  const d = new Date(parseInt(yy), parseInt(mm) - 1, parseInt(dd));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formata Date em string "mês/ano" em português (ex.: "janeiro/2025").
 */
function formatarMesAnoExtenso(d) {
  if (!d) return '';
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  return `${meses[d.getMonth()]}/${d.getFullYear()}`;
}

/* =========================================================================
   PRESCRIÇÃO DECENAL — detector automático (regra dos 5 anos)
   ========================================================================= */
/**
 * Reúne as datas dos descontos a partir da planilha XLSX anexada (fonte
 * primária) ou, na ausência dela, da "data de início dos descontos" digitada
 * manualmente. Retorna o desconto mais antigo e se ele ultrapassa 5 anos
 * contados de HOJE (dia em que a peça é confeccionada).
 */
function analisarDatasDescontos() {
  let datas = [];
  const tab = state.anexos && state.anexos.tabelaXlsx;
  if (tab && Array.isArray(tab.linhasDataApenas)) {
    datas = tab.linhasDataApenas.map(l => l.dataObj).filter(d => d instanceof Date && !isNaN(d));
  }
  // Fallback: data de início digitada à mão (sem planilha / "anexarei depois")
  if (!datas.length && state.dadosPacote3 && state.dadosPacote3.data_inicio_descontos) {
    const d = parseDataBR(state.dadosPacote3.data_inicio_descontos);
    if (d) datas = [d];
  }
  if (!datas.length) return { temDatas: false, dataMaisAntiga: null, anos: 0, ultrapassa5: false };

  const maisAntiga = new Date(Math.min(...datas.map(d => d.getTime())));
  const hoje = new Date();
  // limiar = hoje − 5 anos; "ultrapassa" = estritamente mais antigo que isso
  const limiar = new Date(hoje.getFullYear() - 5, hoje.getMonth(), hoje.getDate());
  const ultrapassa5 = maisAntiga < limiar;
  // anos completos decorridos, só pra exibição
  let anos = hoje.getFullYear() - maisAntiga.getFullYear();
  const mdiff = hoje.getMonth() - maisAntiga.getMonth();
  if (mdiff < 0 || (mdiff === 0 && hoje.getDate() < maisAntiga.getDate())) anos--;
  return { temDatas: true, dataMaisAntiga: maisAntiga, anos, ultrapassa5 };
}

/**
 * Decide se a peça leva o tópico DA PRESCRIÇÃO DECENAL.
 *   - override 'SIM'/'NAO': prioridade absoluta (igual ao toggle da vara).
 *   - automático: inclui se algum desconto for mais antigo que 5 anos.
 *   - sem datas pra avaliar: inclui por precaução (decisão do escritório).
 * Retorna { incluir, forcado, explicacao, dataMaisAntiga, anos, ultrapassa5, temDatas }.
 */
function calcularPrescricaoDecenal(override) {
  override = override || null;
  const info = analisarDatasDescontos();
  const fmt = d => d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : '';
  if (override === 'SIM') return { ...info, incluir: true,  forcado: true,  explicacao: 'Tópico forçado manualmente (sempre incluir).' };
  if (override === 'NAO') return { ...info, incluir: false, forcado: true,  explicacao: 'Tópico removido manualmente (sempre omitir).' };
  if (info.temDatas) {
    return info.ultrapassa5
      ? { ...info, incluir: true,  forcado: false, explicacao: `Desconto mais antigo em ${fmt(info.dataMaisAntiga)} (há ~${info.anos} ano(s)) ultrapassa 5 anos — tese decenal incluída.` }
      : { ...info, incluir: false, forcado: false, explicacao: `Desconto mais antigo em ${fmt(info.dataMaisAntiga)} (há ~${info.anos} ano(s)) — dentro de 5 anos, tese dispensável.` };
  }
  return { ...info, incluir: true, forcado: false, explicacao: 'Sem datas de desconto pra avaliar — tópico incluído por precaução.' };
}

/**
 * Preenche valor_total_descontos, data_inicio_descontos e data_fim_descontos
 * a partir da planilha anexada.
 *
 * Comportamento (opção A):
 *   - Primeiro preenchimento (sem flag _editado_manual): sobrescreve normal.
 *   - Após edição manual do advogado (flag setada): NÃO sobrescreve esse campo.
 *   - Quando o advogado troca de planilha (significa "novo caso"), a função
 *     resetarFlagsEdicaoManual() é chamada antes, fazendo a XLSX vencer de novo.
 *   - Botão "Aplicar valor da planilha" no alerta de divergência também reseta
 *     a flag específica daquele campo (advogado escolheu conscientemente a XLSX).
 *
 * Justificativa: o lastro IA e o cálculo do dano material precisam refletir
 * o que está visivelmente preenchido no formulário, que é a fonte oficial da peça.
 * Edições manuais (descartar linhas, ajustar arredondamento, etc) não podem
 * ser perdidas se o advogado subir uma XLSX nova ou re-processar.
 */
function autopreencherValoresDaTabela() {
  const tab = state.anexos.tabelaXlsx;
  if (!tab || typeof tab !== 'object') return;

  const linhasDado = tab.linhasDataApenas || tab.linhas || [];
  if (linhasDado.length === 0) return;

  // ═══════════════════════════════════════════════════════════════════════════
  // PROTEÇÃO ANTI-SOBRESCRITA: lê valor visível no DOM antes de qualquer coisa
  // ═══════════════════════════════════════════════════════════════════════════
  // Bug histórico: a XLSX podia ser processada quando o handler de input ainda
  // não tinha disparado (race condition), resultando em state vazio mesmo com
  // valor digitado visível na tela. Resultado: autopreencher sobrescrevia.
  // Solução definitiva: ANTES de qualquer lógica, ler o que está no DOM e
  // sincronizar pro state, marcando a flag de edição manual.
  const inputVisivel = document.querySelector('input[data-campo="valor_total_descontos"][data-pacote="pacote3"]');
  if (inputVisivel && inputVisivel.value && inputVisivel.value.trim() !== '') {
    const valorDOM = inputVisivel.value;
    if (state.dadosPacote3.valor_total_descontos !== valorDOM) {
      console.log('[AW Writer] autopreencher: SYNC DOM→state. State estava:', state.dadosPacote3.valor_total_descontos, '| DOM tem:', valorDOM);
      state.dadosPacote3.valor_total_descontos = valorDOM;
      state.dadosPacote3._valor_total_editado_manual = true;
    }
  }
  const inputDataInicio = document.querySelector('input[data-campo="data_inicio_descontos"][data-pacote="pacote3"]');
  if (inputDataInicio && inputDataInicio.value && inputDataInicio.value.trim() !== '') {
    const v = inputDataInicio.value;
    if (state.dadosPacote3.data_inicio_descontos !== v) {
      state.dadosPacote3.data_inicio_descontos = v;
      state.dadosPacote3._data_inicio_editado_manual = true;
    }
  }
  const inputDataFim = document.querySelector('input[data-campo="data_fim_descontos"][data-pacote="pacote3"]');
  if (inputDataFim && inputDataFim.value && inputDataFim.value.trim() !== '') {
    const v = inputDataFim.value;
    if (state.dadosPacote3.data_fim_descontos !== v) {
      state.dadosPacote3.data_fim_descontos = v;
      state.dadosPacote3._data_fim_editado_manual = true;
    }
  }

  // Ordena cronologicamente pra achar a data mais antiga e a mais recente
  const ordenadas = [...linhasDado].sort((a, b) => a.dataObj - b.dataObj);
  const dataInicioBR = ordenadas[0].data;                         // mais antiga
  const dataFimBR    = ordenadas[ordenadas.length - 1].data;      // mais recente

  // PROTEÇÃO ADICIONAL: se o STATE tem valor truthy (não-vazio, não-undefined,
  // não-null, não '0,00'), considere isso como "advogado já mexeu" e respeite.
  // Isso evita re-sobrescrever em cenários onde a flag não foi marcada por race
  // condition, mas o valor está visivelmente preenchido.
  const stateTemValorReal = (v) => {
    if (!v) return false;
    const num = parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0;
    return num > 0;
  };

  // Sobrescreve cada campo APENAS se o advogado ainda não editou manualmente.
  // Se editou (flag truthy) OU o state já tem valor real preenchido, respeita.
  console.log('[AW Writer] autopreencherValoresDaTabela rodando. Flags atuais:', {
    _valor_total_editado_manual: state.dadosPacote3._valor_total_editado_manual,
    _data_inicio_editado_manual: state.dadosPacote3._data_inicio_editado_manual,
    _data_fim_editado_manual:    state.dadosPacote3._data_fim_editado_manual,
    valor_atual_no_state:        state.dadosPacote3.valor_total_descontos,
    valor_da_planilha:           tab.valorTotal,
    DOM_input_visivel:           inputVisivel ? inputVisivel.value : 'sem input no DOM',
  });
  const valorTotalProtegido = state.dadosPacote3._valor_total_editado_manual ||
                               stateTemValorReal(state.dadosPacote3.valor_total_descontos);
  const dataInicioProtegida = state.dadosPacote3._data_inicio_editado_manual ||
                               (state.dadosPacote3.data_inicio_descontos && state.dadosPacote3.data_inicio_descontos.trim() !== '');
  const dataFimProtegida   = state.dadosPacote3._data_fim_editado_manual ||
                               (state.dadosPacote3.data_fim_descontos && state.dadosPacote3.data_fim_descontos.trim() !== '');

  if (!dataInicioProtegida) {
    state.dadosPacote3.data_inicio_descontos = dataInicioBR;
  }
  if (!dataFimProtegida) {
    state.dadosPacote3.data_fim_descontos = dataFimBR;
  }
  if (!valorTotalProtegido) {
    state.dadosPacote3.valor_total_descontos = formatarValorBR(tab.valorTotal);
    console.log('[AW Writer] autopreencherValoresDaTabela: SOBRESCREVEU valor_total_descontos =', state.dadosPacote3.valor_total_descontos);
  } else {
    console.log('[AW Writer] autopreencherValoresDaTabela: PRESERVOU edição manual =', state.dadosPacote3.valor_total_descontos);
  }

  // Metadados pra comparação de divergência (caso o usuário edite depois)
  state.dadosPacote3._valor_dobro_da_tabela = tab.valorDobro;
  state.dadosPacote3._valor_total_da_tabela = tab.valorTotal;
  state.dadosPacote3._data_inicio_da_tabela = dataInicioBR;
  state.dadosPacote3._data_fim_da_tabela = dataFimBR;
}

/**
 * Reseta as flags de edição manual dos campos que a XLSX preenche.
 * Chamada quando o advogado REMOVE/TROCA a planilha (significa "novo caso"),
 * fazendo a próxima planilha venha sobrescrever os campos novamente.
 */
function resetarFlagsEdicaoManual() {
  delete state.dadosPacote3._valor_total_editado_manual;
  delete state.dadosPacote3._data_inicio_editado_manual;
  delete state.dadosPacote3._data_fim_editado_manual;
}

function pularTabelaXlsx() {
  state.anexos.tabelaXlsx = 'pulado';
  render();
}

function desfazerPularTabelaXlsx() {
  state.anexos.tabelaXlsx = null;
  render();
}

function toggleAnexoDescontos() {
  state._anexoDescontosExpandido = !state._anexoDescontosExpandido;
  if (typeof render === 'function') render();
}

function removerTabelaXlsx() {
  state.anexos.tabelaXlsx = null;
  // Remover XLSX significa "novo caso" — próxima planilha pode preencher
  // os campos novamente sem ficar travada por edições anteriores.
  resetarFlagsEdicaoManual();
  // Resetar flags de autodetect e rubricas pra default (todas marcadas).
  // Sem isso, se a primeira planilha autodetectou só "saque_terminal",
  // o state.rubricas fica {saque:true, emissao:false, mov:false} mesmo sem planilha,
  // e a próxima planilha (que talvez tenha as 3) vai redetectar e sobrescrever ok,
  // mas ENQUANTO não anexa nova planilha o usuário vê o display errado.
  state.dadosPacote3._autodetect_rodou = false;
  state.dadosPacote3._autodetect_fez_match = false;
  state.rubricas = inicializarRubricasDoProduto(state.produtoSelecionado);
  render();
}

/**
 * Checa se há divergência entre o valor digitado manualmente pelo usuário
 * e o valor calculado pela tabela XLSX. Retorna objeto com detalhes ou null.
 */
function checarDivergenciaTabela() {
  const tab = state.anexos.tabelaXlsx;
  if (!tab || typeof tab !== 'object') return null;

  const alertas = [];

  // Compara valor_total_descontos
  const valManualTotal = parseValor(state.dadosPacote3.valor_total_descontos || '0');
  if (!isNaN(valManualTotal) && valManualTotal > 0) {
    const diff = Math.abs(valManualTotal - tab.valorTotal);
    if (diff > 0.01) {  // tolerância de 1 centavo pra evitar falso positivo de arredondamento
      alertas.push({
        campo: 'valor_total_descontos',
        rotulo: 'Valor total dos descontos',
        manual: valManualTotal,
        planilha: tab.valorTotal,
      });
    }
  }

  return alertas.length > 0 ? alertas : null;
}

function renderBlocoClientes() {
  const sel = state.clienteSelecionado;
  const labelAtual = sel
    ? `<strong>${sel.nome_completo}</strong> · ${sel.cpf}`
    : '— Novo cliente —';
  return `
    <div class="client-picker">
      <div class="client-picker-head">
        <div>
          <div class="client-picker-title">Puxar cliente existente</div>
          <div class="client-picker-sub">Auto-preenche os campos do Pacote 1 e 2. Você pode editar qualquer um depois.</div>
        </div>
        <div class="client-picker-badge">Opcional</div>
      </div>
      <div class="custom-dropdown" id="clientePickerDropdown">
        <button type="button" class="custom-dropdown-trigger" onclick="toggleClienteDropdown()">
          <span class="custom-dropdown-label">${labelAtual}</span>
          <svg class="custom-dropdown-arrow" viewBox="0 0 12 8" fill="none"><path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="custom-dropdown-menu">
          <button type="button" class="custom-dropdown-option ${!sel ? 'selected' : ''}" onclick="selecionarCliente('')">
            <span>— Novo cliente —</span>
          </button>
          ${(state.clientesAW || []).length === 0 ? `
            <div style="padding:14px 16px;font-size:12px;color:var(--text-mute);">
              ${state.clientesAW ? 'Nenhum cliente cadastrado ainda.' : 'Carregando clientes…'}
            </div>
          ` : (state.clientesAW || []).map(c => `
            <button type="button" class="custom-dropdown-option ${sel?.aw_id === c.aw_id ? 'selected' : ''}" onclick="selecionarCliente('${c.aw_id}')">
              <span><strong>${escapeHtml(c.nome_completo || '—')}</strong>${c.cpf ? ` · ${escapeHtml(c.cpf)}` : ''}</span>
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function toggleClienteDropdown() {
  const dd = document.getElementById('clientePickerDropdown');
  if (!dd) return;
  const wasOpen = dd.classList.contains('open');
  // fecha todos e toggle o atual
  document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
  if (!wasOpen) dd.classList.add('open');
}

// Fecha dropdown ao clicar fora
document.addEventListener('click', (e) => {
  if (!e.target.closest('.custom-dropdown')) {
    document.querySelectorAll('.custom-dropdown.open').forEach(el => el.classList.remove('open'));
  }
});

function selecionarCliente(id) {
  if (!id) {
    state.clienteSelecionado = null;
    state.dadosPacote1 = {};
    state.dadosPacote2 = {};
    render();
    return;
  }
  // Acha pela lista carregada (state.clientesAW vem do Supabase via clientes-supabase.js)
  const c = (state.clientesAW || []).find(x => x.aw_id === id);
  if (c && typeof aplicarClienteNoState === 'function') {
    aplicarClienteNoState(c);
    render();
    return;
  }
  // Fallback: busca direto se nao estiver no cache
  if (typeof fetchClienteAW === 'function') {
    fetchClienteAW(id).then(c2 => {
      if (c2 && typeof aplicarClienteNoState === 'function') {
        aplicarClienteNoState(c2);
        render();
      }
    });
  }
}

/* =========================================================================
   PACOTE 2
   ========================================================================= */
function renderPacote2(view) {
  const campos = [
    { key: 'idade', label: 'Idade', tipo: 'text', inputmode: 'numeric', placeholder: 'ex: 66 anos' },
    { key: 'escolaridade', label: 'Escolaridade', tipo: 'select', opcoes: [
      { value: '', label: '— selecione —' },
      { value: 'fundamental', label: 'Fundamental' },
      { value: 'médio', label: 'Médio' },
      { value: 'superior', label: 'Superior' },
      { value: 'pós-graduação', label: 'Pós-graduação' },
    ] },
    { key: 'numero_filhos', label: 'Número de filhos', tipo: 'text', inputmode: 'numeric', placeholder: 'ex: 3' },
    { key: 'idades_filhos', label: 'Idades dos filhos', tipo: 'text', placeholder: 'ex: 5, 9 e 14 anos' },
    { key: 'conjuge_trabalha', label: 'Cônjuge trabalha?', tipo: 'select', opcoes: [
      { value: '', label: '— selecione —' },
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
      { value: 'nao_se_aplica', label: 'Não se aplica (sem cônjuge)' },
    ] },
    { key: 'renda_mensal', label: 'Renda mensal (R$)', tipo: 'text', inputmode: 'decimal', placeholder: 'ex: 1800' },
    { key: 'unico_provedor', label: 'Único provedor?', tipo: 'select', opcoes: [
      { value: '', label: '— selecione —' },
      { value: 'sim', label: 'Sim' },
      { value: 'nao', label: 'Não' },
    ] },
    { key: 'tipo_moradia', label: 'Tipo de moradia', tipo: 'select', opcoes: [
      { value: '', label: '— selecione —' },
      { value: 'propria', label: 'Própria' },
      { value: 'alugada', label: 'Alugada' },
      { value: 'financiada', label: 'Financiada' },
      { value: 'cedida', label: 'Cedida' },
      { value: 'outros', label: 'Outros' },
    ] },
    { key: 'outros_dependentes', label: 'Outros dependentes', tipo: 'text', placeholder: 'descrever', wide: true },
    { key: 'condicao_saude', label: 'Condição de saúde relevante', tipo: 'text', placeholder: 'opcional', wide: true },
    { key: 'observacoes_livres', label: 'Observações adicionais', tipo: 'textarea', placeholder: 'Contexto livre que ajude a IA a personalizar a peça', wide: true },
  ];

  view.innerHTML = `
    <div class="form-page">
      <div class="form-header">
        <div class="form-eyebrow">Etapa 02 · ${state.produtoSelecionado.nome}</div>
        <div class="form-title">Perfil <span class="accent">socioeconômico</span></div>
        <div class="form-sub">Dados opcionais que enriquecem a personalização dos trechos gerados por IA. Se não tiver a informação, marque "não tenho" e siga.</div>
      </div>

      <div class="info-banner">
        <div class="info-banner-content">
          <span class="info-banner-label">Campos opcionais</span>
          Quanto mais você informa, mais específica fica a redação. Campos não informados são ignorados — a IA <strong>não inventa dados</strong>.
        </div>
      </div>

      <div class="field-grid">
        ${campos.map(c => renderCampo(c, state.dadosPacote2, 'pacote2', false)).join('')}
      </div>

      <div class="form-footer">
        <button class="btn-link" onclick="navegarPara('pacote1')">← Voltar</button>
        <button class="btn btn-primary" onclick="navegarPara('pacote3')">
          Avançar · Dados da ação →
        </button>
      </div>
    </div>
  `;

  bindFormInputs('pacote2');
}

/**
 * Renderiza o bloco de seleção de rubricas aplicáveis à peça.
 * Produto 1 (Descontos Indevidos): 3 checkboxes — cartão / parcela / BX
 * Produto 5 (Juros e Encargos): 4 checkboxes — MCP / MCC / ELC / ED
 * Autopreenchido ao anexar a planilha XLSX (se o produto suportar detecção).
 *
 * A seleção aqui controla:
 *  - O que aparece na enumeração "Trata-se de descontos realizados sob..."
 *  - Quais seções de fundamentação específica aparecem na peça
 *  - O texto do pedido "e) declaração de inexigibilidade"
 *  - O plural/singular da palavra "rubrica(s)"
 */
function renderBlocoRubricas() {
  const produto = state.produtoSelecionado;
  const r = state.rubricas || {};
  const marcadas = Object.values(r).filter(v => !!v).length;

  const temPlanilha = state.anexos.tabelaXlsx && typeof state.anexos.tabelaXlsx === 'object';
  const autodetectMatch = state.dadosPacote3._autodetect_fez_match === true;
  const autodetectRodou = state.dadosPacote3._autodetect_rodou === true;

  let dica;
  if (!temPlanilha) {
    dica = 'Marque quais rubricas estão presentes nesta ação. Ao anexar a planilha, a seleção é detectada automaticamente.';
  } else if (autodetectMatch) {
    // Detectou pelo menos uma rubrica — mostra quais
    const nomesDetectados = [];
    if (produto && produto.rubricas_keys && produto.rubricas_nomes_texto) {
      for (const k of produto.rubricas_keys) {
        if (r[k]) {
          const nome = (produto.rubricas_nomes_texto[k] || k).replace(/^['"]|['"]$/g, '');
          nomesDetectados.push(nome);
        }
      }
    }
    dica = nomesDetectados.length
      ? `✓ Detectamos ${nomesDetectados.length} rubrica${nomesDetectados.length > 1 ? 's' : ''} na planilha: ${nomesDetectados.join(', ')}. Ajuste se precisar.`
      : 'Detectamos rubricas na planilha. Ajuste se precisar.';
  } else if (autodetectRodou && !autodetectMatch) {
    // Planilha foi processada mas nenhuma descrição bateu com os padrões conhecidos
    dica = '⚠ Não conseguimos identificar as rubricas pelas descrições da planilha. Marque manualmente quais se aplicam a esta peça.';
  } else {
    // Fallback (planilha "pulada" ou estado inicial)
    dica = 'Marque quais rubricas estão presentes nesta ação.';
  }

  const avisoMin = marcadas === 0
    ? `<div class="rubricas-aviso-erro">⚠ Marque pelo menos 1 rubrica para continuar.</div>`
    : '';

  // Monta lista de checkboxes. Se o produto tiver rubricas_keys, itera
  // dinamicamente; senão, usa o mapeamento legado do produto 1.
  let checkboxesHtml = '';

  // Helper pra montar um checkbox individual
  function checkboxHtml(k) {
    const labelComAspas = (produto.rubricas_nomes_texto && produto.rubricas_nomes_texto[k]) || k;
    const labelLimpo = labelComAspas.replace(/^['"]|['"]$/g, '');
    return `
      <label class="rubrica-check ${r[k] ? 'marcada' : ''}">
        <input type="checkbox" ${r[k] ? 'checked' : ''} onchange="toggleRubrica('${k}')">
        <span class="rubrica-check-box"></span>
        <span class="rubrica-check-label">${labelLimpo}</span>
      </label>`;
  }

  if (produto && produto.rubricas_keys && Array.isArray(produto.rubricas_keys)) {
    // Se o produto definir rubricas_grupos, renderiza agrupado visualmente
    // (Mix Bradesco com 16 rubricas precisa disso pra ficar legível)
    if (produto.rubricas_grupos && typeof produto.rubricas_grupos === 'object') {
      for (const [nomeGrupo, keysDoGrupo] of Object.entries(produto.rubricas_grupos)) {
        const checkboxesDoGrupo = keysDoGrupo
          .filter(k => produto.rubricas_keys.includes(k))
          .map(checkboxHtml)
          .join('');
        if (!checkboxesDoGrupo) continue;
        checkboxesHtml += `
          <div class="rubrica-grupo">
            <div class="rubrica-grupo-titulo">${nomeGrupo}</div>
            <div class="rubrica-grupo-checkboxes">${checkboxesDoGrupo}</div>
          </div>`;
      }
    } else {
      // Flat list — produto sem agrupamento
      for (const k of produto.rubricas_keys) {
        checkboxesHtml += checkboxHtml(k);
      }
    }
  } else {
    // Fallback produto 1 (legado) — mantém exatamente como estava
    checkboxesHtml = `
        <label class="rubrica-check ${r.cartao ? 'marcada' : ''}">
          <input type="checkbox" ${r.cartao ? 'checked' : ''} onchange="toggleRubrica('cartao')">
          <span class="rubrica-check-box"></span>
          <span class="rubrica-check-label">GASTOS CARTÃO DE CRÉDITO</span>
        </label>
        <label class="rubrica-check ${r.parcela ? 'marcada' : ''}">
          <input type="checkbox" ${r.parcela ? 'checked' : ''} onchange="toggleRubrica('parcela')">
          <span class="rubrica-check-box"></span>
          <span class="rubrica-check-label">PARCELA CRÉDITO PESSOAL</span>
        </label>
        <label class="rubrica-check ${r.bx ? 'marcada' : ''}">
          <input type="checkbox" ${r.bx ? 'checked' : ''} onchange="toggleRubrica('bx')">
          <span class="rubrica-check-box"></span>
          <span class="rubrica-check-label">BAIXA ANTECIPADA DE FINANCIAMENTO</span>
        </label>`;
  }

  return `
    <div class="rubricas-block">
      <div class="rubricas-header">
        <div class="rubricas-titulo">Rubricas aplicáveis à peça</div>
        <div class="rubricas-subtitulo">${dica}</div>
      </div>
      <div class="rubricas-grid">${checkboxesHtml}
      </div>
      ${avisoMin}
    </div>
  `;
}

function toggleRubrica(chave) {
  if (!state.rubricas) state.rubricas = {};
  state.rubricas[chave] = !state.rubricas[chave];
  // Re-renderiza só pra atualizar o visual dos checkboxes e o aviso de mínimo
  render();
}

/* =========================================================================
   PACOTE 3
   ========================================================================= */
function renderPacote3(view) {
  // ═══════════════════════════════════════════════════════════════════════════
  // PROTEÇÃO ANTI-PERDA-DE-DIGITAÇÃO em re-renders
  // ═══════════════════════════════════════════════════════════════════════════
  // Qualquer ação que dispare render() global (toggle de rubrica, alerta de
  // divergência, etc) faz o pacote3 ser redesenhado. Se o usuário digitou
  // valor no campo MAS o handler oninput ainda não disparou (ou disparou e
  // alguma coisa zerou), o input é reconstruído com o value antigo do state.
  // Solução: ANTES de redesenhar, ler o que está no DOM e sincronizar.
  // Assim, mesmo num caso de race condition, o valor digitado é preservado.
  //
  // ⚠️  GUARD CRÍTICO: só roda essa proteção se o pacote 3 já foi montado
  // ANTES nesta sessão de caso. Sem o guard, ao trocar de produto/cliente,
  // os inputs do DOM podem ter VALORES FANTASMAS de uma sessão anterior
  // (ex.: "5.542,74" deixado por um caso já gerado), e essa proteção os
  // copia pro state ZERADO, fazendo o campo aparecer "auto-preenchido"
  // sem que o usuário tenha feito nada. Mais grave: marca o
  // _valor_total_editado_manual=true, bloqueando autopreenchimento futuro
  // pela planilha. selecionarProduto() e novaPecaMesmoProduto() não setam
  // _pacote3_montado, então na PRIMEIRA entrada da etapa 3 dum caso novo
  // o leitor do DOM é pulado e os valores ficam sempre vazios como devem.
  if (state.dadosPacote3._pacote3_montado === true) {
    const camposCriticos = ['valor_total_descontos', 'valor_dano_moral',
      'data_inicio_descontos', 'data_fim_descontos', 'comarca', 'numero_agencia', 'numero_conta'];
    camposCriticos.forEach(campo => {
      const input = document.querySelector(`[data-campo="${campo}"][data-pacote="pacote3"]`);
      if (input && 'value' in input) {
        const valorDOM = input.value || '';
        if (valorDOM && state.dadosPacote3[campo] !== valorDOM) {
          state.dadosPacote3[campo] = valorDOM;
          if (campo === 'valor_total_descontos') state.dadosPacote3._valor_total_editado_manual = true;
          if (campo === 'data_inicio_descontos') state.dadosPacote3._data_inicio_editado_manual = true;
          if (campo === 'data_fim_descontos')    state.dadosPacote3._data_fim_editado_manual    = true;
        }
      }
    });
  }
  // Marca que o pacote já foi montado pelo menos uma vez nesta sessão de caso.
  // Próximas chamadas (re-renders por toggle de rubrica etc) ativam a proteção.
  state.dadosPacote3._pacote3_montado = true;

  const campos = [
    { key: 'comarca', label: 'Comarca (cidade)', tipo: 'text', placeholder: 'ex: Manaus' },
    { key: 'uf', label: 'UF', tipo: 'select_uf' },
    { key: 'numero_agencia', label: 'Nº da agência', tipo: 'text', placeholder: 'ex: 1234' },
    { key: 'numero_conta', label: 'Nº da conta corrente', tipo: 'text', placeholder: 'ex: 56789-0' },
    { key: 'data_inicio_descontos', label: 'Data início dos descontos', tipo: 'date_br', placeholder: 'DD/MM/AAAA' },
    { key: 'data_fim_descontos', label: 'Data fim dos descontos', tipo: 'date_br', placeholder: 'DD/MM/AAAA' },
    { key: 'valor_total_descontos', label: 'Valor total dos descontos (R$)', tipo: 'text', placeholder: 'ex: 8.450,00' },
    { key: 'valor_dano_moral', label: 'Valor dano moral (R$)', tipo: 'text', placeholder: 'ex: 15.000,00' },
  ];

  view.innerHTML = `
    <div class="form-page">
      <div class="form-header">
        <div class="form-eyebrow">Etapa 03 · ${state.produtoSelecionado.nome}</div>
        <div class="form-title">Dados da <span class="accent">ação</span></div>
        <div class="form-sub">Específicos deste produto jurídico. Por segurança, esses dados vão apenas para o documento final, não para a IA.</div>
      </div>

      ${renderBlocoAnexoTabela()}

      ${renderBlocoRubricas()}

      <div class="field-grid">
        ${campos.map(c => renderCampoObrigatorio(c, state.dadosPacote3, 'pacote3')).join('')}
      </div>

      <div class="calc-panel" id="calcPanel">
        ${renderCalc()}
      </div>

      <div class="form-footer">
        <button class="btn-link" onclick="navegarPara('pacote2')">← Voltar</button>
        <button id="btnGerar" class="btn btn-primary" onclick="gerarTrechos()">
          Gerar trechos de IA →
        </button>
      </div>
    </div>
  `;

  bindFormInputs('pacote3');
}

function renderCalc() {
  // parseValor lida com formato BR ("20.505,26"), formato US ("20505.26") e
  // tolera prefixo "R$ " que usuário ou autopreencher possam ter incluído.
  // Antes usava parseFloat inline que retornava NaN com "R$ " e zerava o cálculo.
  const valDescontos = parseValor(state.dadosPacote3.valor_total_descontos) || 0;
  const valDanoMoral = parseValor(state.dadosPacote3.valor_dano_moral) || 0;
  const valDobro = valDescontos * 2;
  const valCausa = valDobro + valDanoMoral;

  // Determina tipo de vara — respeitando override manual se houver
  const override = state.dadosPacote3.tipo_vara_override || null;
  const vara = calcularTipoVara(valCausa, override);
  const comarca = state.dadosPacote3.comarca || '';
  const uf = state.dadosPacote3.uf || '';
  // Preview deve refletir EXATAMENTE o que vai sair no DOCX final.
  // Template DOCX: "AO JUÍZO DE DIREITO DA ____ª VARA {tipo_vara} DA COMARCA DE {comarca}/{uf}"
  // Onde tipo_vara é "CÍVEL" ou "DO JUIZADO ESPECIAL CÍVEL".
  const enderecamentoPreview = (comarca && uf)
    ? `___ª Vara ${vara.tipo_vara} da Comarca de ${comarca}/${uf}`
    : `___ª Vara ${vara.tipo_vara} (informe comarca e UF acima)`;

  // Badge mostra se está em modo automático ou forçado
  const badgeHtml = vara.forcado_manualmente
    ? `<span class="vara-badge forcado">FORÇADO MANUALMENTE</span>`
    : `<span class="vara-badge auto">AUTOMÁTICO</span>`;

  // Texto do botão toggle — descreve a próxima ação (não o estado atual)
  const labelProximo = override === null
    ? (vara.tipo_vara === 'CÍVEL' ? 'Forçar Juizado Especial' : 'Forçar Vara Cível Comum')
    : override === 'CIVEL'
      ? 'Forçar Juizado Especial'
      : 'Voltar ao automático';

  // Checa divergência com planilha anexada (cenário B: autopreenche + alerta visual)
  const divergencias = checarDivergenciaTabela();
  const bloqueDivergencia = divergencias ? renderBlocoDivergencia(divergencias) : '';

  // Aviso quando o valor for muito baixo pra gerar lastro consistente.
  // Critério: < R$ 20. O lastro econômico fica fraco e o sistema avisa
  // o advogado pra desligar a zona ou rever o valor com o cliente.
  // Só mostra se a zona de lastro estiver ATIVA (faz sentido o aviso).
  const lastroAtivo = state.dadosPacote3.gerar_lastro_dano_material !== false;
  const blocoAvisoLastro = (valDescontos > 0 && valDescontos < LASTRO_VALOR_MINIMO && lastroAtivo)
    ? `
    <div class="calc-card calc-card-aviso-lastro" style="border:1px solid #d4a017;background:rgba(212,160,23,0.08);padding:12px 14px;border-radius:8px;margin-top:8px;">
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <div style="font-size:18px;line-height:1;">⚠️</div>
        <div style="flex:1;font-size:13px;line-height:1.5;">
          <strong style="color:#d4a017;">Atenção · valor baixo para gerar lastro econômico</strong><br>
          O valor total dos descontos (R$ ${formatarMoeda(valDescontos)}) está abaixo de R$ ${LASTRO_VALOR_MINIMO},00 — patamar mínimo para o trecho "Lastro do dano material" gerar argumentação consistente. Considere desativar essa zona na próxima etapa, ou revisar o período/valor com o cliente.
        </div>
      </div>
    </div>`
    : '';

  // Card do lastro técnico foi removido daqui. O lastro é sempre incluído
  // na peça (gerado por IA na Revisão com os números calculados). Pacote 3
  // não precisa mencionar nem oferecer opt-out.

  // Prescrição decenal — detector automático + override manual (3 estados)
  const decOverride = state.dadosPacote3.prescricao_decenal_override || null;
  const dec = calcularPrescricaoDecenal(decOverride);
  const labelPresc = decOverride === null ? 'Forçar presença do tópico'
    : decOverride === 'SIM' ? 'Forçar ausência do tópico'
    : 'Voltar ao automático';
  const decBadge = dec.forcado
    ? `<span class="vara-badge forcado">FORÇADO MANUALMENTE</span>`
    : `<span class="vara-badge auto">AUTOMÁTICO</span>`;

  return `
    ${bloqueDivergencia}
    <div class="calc-card">
      <div class="calc-label">Calculado · Dobro (CDC)</div>
      <div class="calc-value"><span class="calc-value-prefix">R$</span>${formatarMoeda(valDobro)}</div>
    </div>
    <div class="calc-card">
      <div class="calc-label">Calculado · Valor da causa</div>
      <div class="calc-value"><span class="calc-value-prefix">R$</span>${formatarMoeda(valCausa)}</div>
    </div>
    ${blocoAvisoLastro}
    <div class="calc-card calc-card-vara ${vara.forcado_manualmente ? 'forcado' : ''}">
      <div class="calc-vara-header">
        <div class="calc-label">Endereçamento</div>
        ${badgeHtml}
      </div>
      <div class="calc-vara-text">${enderecamentoPreview}</div>
      <div class="calc-vara-exp">${vara.explicacao}</div>
      <button class="vara-override-btn" onclick="toggleVaraOverride()">
        ${labelProximo}
      </button>
    </div>
    <div class="calc-card calc-card-vara ${dec.forcado ? 'forcado' : ''}">
      <div class="calc-vara-header">
        <div class="calc-label">Prescrição decenal (10 anos)</div>
        ${decBadge}
      </div>
      <div class="calc-vara-text">${dec.incluir ? '✔ Tópico INCLUÍDO na peça' : '✖ Tópico OMITIDO da peça'}</div>
      <div class="calc-vara-exp">${dec.explicacao}</div>
      <button class="vara-override-btn" onclick="togglePrescricaoDecenalOverride()">
        ${labelPresc}
      </button>
    </div>
  `;
}

/**
 * Toggle ON/OFF do lastro técnico (gerado por código).
 * Re-renderiza só o painel de cálculo pra refletir mudança visual.
 */
function toggleLastroTecnicoPacote3(ativo) {
  state.dadosPacote3.gerar_lastro_dano_material = !!ativo;
  const calcPanel = document.getElementById('calcPanel');
  if (calcPanel) calcPanel.innerHTML = renderCalc();
}

/**
 * Sorteia outra variação do lastro técnico (incrementa _lastro_seed).
 * Re-renderiza só o painel de cálculo.
 */
function trocarVariacaoLastroTecnico() {
  if (typeof state.dadosPacote3._lastro_seed !== 'number') {
    state.dadosPacote3._lastro_seed = 0;
  }
  state.dadosPacote3._lastro_seed += 1;
  const calcPanel = document.getElementById('calcPanel');
  if (calcPanel) calcPanel.innerHTML = renderCalc();
}

/**
 * Cicla o override do tipo de vara: null (auto) → CIVEL → JUIZADO → null
 * Atualiza apenas o painel de cálculo (sem re-render geral).
 */
function toggleVaraOverride() {
  const atual = state.dadosPacote3.tipo_vara_override || null;
  let proximo;
  if (atual === null) {
    // Estava no automático: força o oposto do que o automático escolheria
    const valDescontos = parseValor(state.dadosPacote3.valor_total_descontos) || 0;
    const valDanoMoral = parseValor(state.dadosPacote3.valor_dano_moral) || 0;
    const valCausa = (valDescontos * 2) + valDanoMoral;
    proximo = valCausa < LIMITE_JUIZADO_ESPECIAL ? 'CIVEL' : 'JUIZADO';
  } else if (atual === 'CIVEL') {
    proximo = 'JUIZADO';
  } else {
    // Estava em JUIZADO → volta ao automático
    proximo = null;
  }
  state.dadosPacote3.tipo_vara_override = proximo;

  // Re-renderiza só o painel de cálculo
  const calcPanel = document.getElementById('calcPanel');
  if (calcPanel) calcPanel.innerHTML = renderCalc();
}

/**
 * Cicla o override da prescrição decenal: null (auto) → 'SIM' (forçar
 * presença) → 'NAO' (forçar ausência) → null. Atualiza só o painel de cálculo.
 */
function togglePrescricaoDecenalOverride() {
  const atual = state.dadosPacote3.prescricao_decenal_override || null;
  const proximo = atual === null ? 'SIM' : atual === 'SIM' ? 'NAO' : null;
  state.dadosPacote3.prescricao_decenal_override = proximo;
  const calcPanel = document.getElementById('calcPanel');
  if (calcPanel) calcPanel.innerHTML = renderCalc();
}

function renderBlocoDivergencia(divergencias) {
  const itens = divergencias.map(d => {
    const manual = d.manual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const planilha = d.planilha.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `
      <li class="diverg-item">
        <strong>${d.rotulo}:</strong>
        você digitou <span class="diverg-manual">R$ ${manual}</span>,
        mas a planilha indica <span class="diverg-planilha">R$ ${planilha}</span>
        <button class="diverg-aplicar" onclick="aplicarValorDaPlanilha('${d.campo}')">Usar valor da planilha</button>
      </li>
    `;
  }).join('');

  return `
    <div class="diverg-alert">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="diverg-icon">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <div class="diverg-body">
        <div class="diverg-title">Valor divergente da planilha</div>
        <ul class="diverg-lista">${itens}</ul>
      </div>
    </div>
  `;
}

function aplicarValorDaPlanilha(campo) {
  const tab = state.anexos.tabelaXlsx;
  if (!tab || typeof tab !== 'object') return;
  const fmt = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (campo === 'valor_total_descontos') {
    state.dadosPacote3.valor_total_descontos = fmt(tab.valorTotal);
    // Advogado escolheu conscientemente o valor da planilha — limpa a flag de
    // edição manual desse campo pra que XLSX volte a poder sobrescrever.
    delete state.dadosPacote3._valor_total_editado_manual;
  }
  render();
}

function formatarMoeda(v) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* =========================================================================
   RENDER HELPERS
   ========================================================================= */
function renderCampo(campo, dados, pacote, obrigatorio) {
  const notInformed = dados[campo.key] === null;
  return `
    <div class="field ${campo.wide ? 'wide' : ''} ${notInformed ? 'not-informed' : ''}" data-key="${campo.key}">
      <div class="field-label">
        <span class="field-label-text">${campo.label}${obrigatorio ? '<span class="req">*</span>' : ''}</span>
        <div class="field-controls">
          ${renderShieldBtn(campo.key)}
          ${!obrigatorio ? `
            <button class="no-info-btn ${notInformed ? 'active' : ''}" onclick="toggleNaoInformado('${campo.key}', '${pacote}')">
              ${notInformed ? '✓ Pulado' : 'Pular'}
            </button>
          ` : ''}
        </div>
      </div>
      ${renderInput(campo, dados, pacote)}
    </div>
  `;
}

function renderCampoObrigatorio(campo, dados, pacote) {
  return `
    <div class="field ${campo.wide ? 'wide' : ''}" data-key="${campo.key}">
      <div class="field-label">
        <span class="field-label-text">${campo.label}<span class="req">*</span></span>
        <div class="field-controls">${renderShieldBtn(campo.key)}</div>
      </div>
      ${renderInput(campo, dados, pacote)}
    </div>
  `;
}

function renderInput(campo, dados, pacote) {
  const val = dados[campo.key] ?? '';
  const disabled = val === null ? 'disabled' : '';
  if (campo.tipo === 'select') {
    // Normaliza: aceita string simples OU {value, label}
    const opcoes = campo.opcoes.map(o =>
      typeof o === 'string' ? { value: o, label: o || '— selecione —' } : o
    );
    // CRÍTICO: NUNCA mutar state durante render. Mutar aqui quebra o "Pular"
    // dos outros campos porque re-renderiza com mutação cruzada (campos pulados
    // que têm dados[key] === null teriam val === '' aqui e seriam sobrescritos).
    // Se o select precisa de valor default, isso deve ser feito ao inicializar
    // o pacote ou no onchange do próprio select — não no render.
    // (O bug do "avançar" que esse código tentava corrigir deve ser tratado
    // verificando se o valor visível bate com state na hora de avançar.)
    const valAtual = dados[campo.key];
    // Se o campo está pulado (null), mostra placeholder vazio
    if (valAtual === null) {
      return `
        <select data-campo="${campo.key}" data-pacote="${pacote}" disabled>
          <option value="">— pulado —</option>
        </select>
      `;
    }
    return `
      <select data-campo="${campo.key}" data-pacote="${pacote}">
        ${opcoes.map(o => `<option value="${o.value}" ${valAtual === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
      </select>
    `;
  }
  if (campo.tipo === 'textarea') {
    return `<textarea data-campo="${campo.key}" data-pacote="${pacote}" ${disabled} placeholder="${campo.placeholder || ''}">${val === null ? '' : val}</textarea>`;
  }
  if (campo.tipo === 'date_br') {
    return `<input type="text" inputmode="numeric" maxlength="10" data-campo="${campo.key}" data-pacote="${pacote}" data-mask="date" value="${val === null ? '' : val}" placeholder="${campo.placeholder || 'DD/MM/AAAA'}" ${disabled}>`;
  }
  if (campo.tipo === 'select_uf') {
    if (val === null) {
      return `
        <select data-campo="${campo.key}" data-pacote="${pacote}" disabled>
          <option value="">— pulado —</option>
        </select>
      `;
    }
    return `
      <select data-campo="${campo.key}" data-pacote="${pacote}">
        <option value="" ${val === '' ? 'selected' : ''}>— UF —</option>
        ${UFS_BR.map(uf => `<option value="${uf}" ${val === uf ? 'selected' : ''}>${uf}</option>`).join('')}
      </select>
    `;
  }
  const minAttr = campo.tipo === 'number' ? 'min="0"' : '';
  const stepAttr = campo.tipo === 'number' ? 'step="any"' : '';
  // inputmode permite teclado numérico no mobile sem usar type="number" — este
  // rejeita valores de texto livre (ex: "66 Anos") e zera o campo no load.
  const imAttr = campo.inputmode ? `inputmode="${campo.inputmode}"` : '';
  return `<input type="${campo.tipo}" ${minAttr} ${stepAttr} ${imAttr} data-campo="${campo.key}" data-pacote="${pacote}" value="${val === null ? '' : val}" placeholder="${campo.placeholder || ''}" ${disabled}>`;
}

function renderShieldBtn(campo) {
  const vai = state.seguranca[campo];
  const cls = vai ? 'open' : 'locked';
  const icon = vai
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2L3 7v6c0 5 3.5 9.5 9 10 5.5-.5 9-5 9-10V7l-9-5z"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2L3 7v6c0 5 3.5 9.5 9 10 5.5-.5 9-5 9-10V7l-9-5z"/><path d="M9 12l2 2 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const title = vai ? 'Liberado para IA — clique para bloquear' : 'Bloqueado — vai apenas para documento';
  return `<button class="shield-btn ${cls}" data-campo="${campo}" onclick="toggleSeguranca('${campo}')" title="${title}">${icon}${vai ? 'IA ON' : 'IA OFF'}</button>`;
}

function toggleSeguranca(campo) {
  state.seguranca[campo] = !state.seguranca[campo];
  // Atualiza APENAS o botão desse campo — sem re-renderizar a tela inteira
  const vai = state.seguranca[campo];
  document.querySelectorAll(`.shield-btn[data-campo="${campo}"]`).forEach(btn => {
    btn.classList.toggle('open', vai);
    btn.classList.toggle('locked', !vai);
    btn.setAttribute('title', vai
      ? 'Liberado para IA — clique para bloquear'
      : 'Bloqueado — vai apenas para documento');
    // Atualiza o rótulo textual (IA ON/OFF) sem mexer no SVG
    const textNode = btn.lastChild;
    if (textNode && textNode.nodeType === 3) {
      textNode.nodeValue = vai ? 'IA ON' : 'IA OFF';
    } else {
      // Fallback caso a estrutura do nó tenha mudado
      btn.innerHTML = btn.innerHTML.replace(/IA (ON|OFF)\s*$/, vai ? 'IA ON' : 'IA OFF');
    }
    // Pulso visual rapidinho, contido no próprio botão
    btn.classList.remove('flash');
    // força reflow pra reiniciar a animação
    void btn.offsetWidth;
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 500);
  });
}

function toggleNaoInformado(key, pacote) {
  const dados = pacote === 'pacote2' ? state.dadosPacote2 : state.dadosPacote3;
  const eraNull = dados[key] === null;
  if (eraNull) {
    // Estava pulado → reabilitar
    dados[key] = '';
  } else {
    // Estava preenchido (ou vazio) → marcar como pulado
    dados[key] = null;
  }

  // Atualiza APENAS o campo afetado, sem re-render geral.
  // Isso preserva foco, scroll, e estado visual de outros campos.
  const fieldEl = document.querySelector(`.field[data-key="${key}"]`);
  if (!fieldEl) {
    // Fallback: se não achou o elemento, faz render normal
    render();
    return;
  }

  const novoStatePulado = dados[key] === null;

  // Toggle visual da classe "pulado"
  fieldEl.classList.toggle('not-informed', novoStatePulado);

  // Atualiza o botão de pular
  const btn = fieldEl.querySelector('.no-info-btn');
  if (btn) {
    btn.classList.toggle('active', novoStatePulado);
    btn.textContent = novoStatePulado ? '✓ Pulado' : 'Pular';
  }

  // Atualiza o input/select/textarea: desabilita se pulado, habilita se voltou
  const input = fieldEl.querySelector('input, select, textarea');
  if (input) {
    if (novoStatePulado) {
      input.value = '';
      input.disabled = true;
    } else {
      input.disabled = false;
      input.focus();
    }
  }

  // Se estamos na Etapa 3, atualiza o painel de cálculos (vara depende de valores)
  if (pacote === 'pacote3') {
    const calcPanel = document.getElementById('calcPanel');
    if (calcPanel) calcPanel.innerHTML = renderCalc();
  }
}

function aplicarMascaraData(valor) {
  // Remove tudo que não é dígito
  const num = valor.replace(/\D/g, '').slice(0, 8);
  if (num.length <= 2) return num;
  if (num.length <= 4) return num.slice(0, 2) + '/' + num.slice(2);
  return num.slice(0, 2) + '/' + num.slice(2, 4) + '/' + num.slice(4);
}

function bindFormInputs(pacote) {
  const dados = pacote === 'pacote1' ? state.dadosPacote1 :
                pacote === 'pacote2' ? state.dadosPacote2 : state.dadosPacote3;

  // PÓS-RENDER: sincroniza state com selects que têm valor visual mas não no state.
  // Isso é seguro porque acontece DEPOIS do render terminar, não DURANTE.
  // Resolve o caso de selects de qualificação (estado civil, escolaridade, etc.)
  // que mostram a primeira opção mas o state ainda está vazio.
  document.querySelectorAll(`select[data-pacote="${pacote}"]`).forEach(sel => {
    const campo = sel.dataset.campo;
    if (dados[campo] === null) return; // pulado, respeita
    if (dados[campo] === undefined || dados[campo] === '') {
      // Se há um valor visualmente selecionado E ele não é a opção placeholder vazia
      const v = sel.value;
      if (v && v !== '') dados[campo] = v;
    }
  });

  document.querySelectorAll(`[data-pacote="${pacote}"]`).forEach(el => {
    const handler = e => {
      const campo = e.target.dataset.campo;
      // Aplica máscara se for campo de data
      if (e.target.dataset.mask === 'date') {
        const posCursor = e.target.selectionStart;
        const antes = e.target.value;
        const mascarado = aplicarMascaraData(antes);
        if (antes !== mascarado) {
          e.target.value = mascarado;
          // Mantém o cursor perto de onde estava (+1 se adicionou barra)
          const delta = mascarado.length - antes.length;
          const novoPos = Math.max(0, posCursor + delta);
          try { e.target.setSelectionRange(novoPos, novoPos); } catch {}
        }
        dados[campo] = mascarado;
      } else if (e.target.type === 'number') {
        let v = e.target.value;
        if (v !== '' && parseFloat(v) < 0) {
          v = '0';
          e.target.value = v;
        }
        dados[campo] = v;
      } else {
        dados[campo] = e.target.value;
      }
      // Marca flag de edição manual pros campos que a XLSX também preenche.
      // Isso garante que se o advogado editar depois de subir planilha,
      // a edição manual não será sobrescrita por uma futura processamento da XLSX
      // (ex: se ele subir uma planilha nova depois). Resetamos a flag em
      // cenários de "novo caso" (troca de XLSX, botão "Aplicar valor da planilha").
      if (pacote === 'pacote3') {
        if (campo === 'valor_total_descontos') state.dadosPacote3._valor_total_editado_manual = true;
        if (campo === 'data_inicio_descontos') state.dadosPacote3._data_inicio_editado_manual = true;
        if (campo === 'data_fim_descontos')    state.dadosPacote3._data_fim_editado_manual    = true;
      }
      if (pacote === 'pacote1') atualizarBtnAvancar1();
      if (pacote === 'pacote3') {
        const calcPanel = document.getElementById('calcPanel');
        if (calcPanel) calcPanel.innerHTML = renderCalc();
      }
    };
    el.addEventListener('input', handler);
    if (el.tagName === 'SELECT') el.addEventListener('change', handler);
  });
}

function atualizarBtnAvancar1() {
  const btn = document.getElementById('btnAvancar1');
  if (!btn) return;
  const obrigatorios = ['nome_completo','genero','nacionalidade','estado_civil','profissao','rg','orgao_expedidor','cpf','endereco_completo'];
  const preenchidos = obrigatorios.every(k => (state.dadosPacote1[k] || '').toString().trim().length > 0);
  // Selfie precisa estar decidida: anexada OU explicitamente pulada
  const selfieDecidida = state.anexos.selfie !== null;
  btn.disabled = !(preenchidos && selfieDecidida);
}

/* =========================================================================
   MIX BRADESCO — modal de resolução de conflitos de rubrica
   Quando o XLSX tem linhas que batem em 2+ rubricas (ex: "CARTÃO DE CRÉDITO
   ANUIDADE" bate tanto em anuidade_cartao quanto em cartao), abre um modal
   listando cada conflito com radio buttons pro advogado escolher.
   ========================================================================= */
function abrirModalConflitosRubrica() {
  const conflitos = (state.dadosPacote3 && state.dadosPacote3._conflitos_rubrica) || [];
  if (conflitos.length === 0) return;
  const produto = state.produtoSelecionado;
  if (!produto || !produto.rubricas_nomes_texto) return;

  function nomeRubrica(k) {
    const raw = produto.rubricas_nomes_texto[k] || k;
    return raw.replace(/^['"]|['"]$/g, '');
  }

  // Remove modal anterior se existir
  const anterior = document.getElementById('modalConflitosRubrica');
  if (anterior) anterior.remove();

  // Monta linhas de conflito (cada uma com radio buttons por candidato)
  let linhasHtml = '';
  conflitos.forEach((c, idx) => {
    const radiosHtml = c.candidatos.map((cand, ci) => `
      <label class="conflito-radio">
        <input type="radio" name="conflito_${idx}" value="${cand}" ${cand === c.escolha ? 'checked' : ''}>
        <span class="conflito-radio-label">${nomeRubrica(cand)}</span>
      </label>
    `).join('');
    linhasHtml += `
      <div class="conflito-linha">
        <div class="conflito-descricao">
          <span class="conflito-num">#${c.linhaIdx + 1}</span>
          <span class="conflito-texto">${escHtml(c.descricao)}</span>
        </div>
        <div class="conflito-opcoes">${radiosHtml}</div>
      </div>
    `;
  });

  // Injeta modal no DOM
  const modalHtml = `
    <div id="modalConflitosRubrica" class="modal-conflitos">
      <div class="modal-conflitos-box">
        <div class="modal-conflitos-title">⚠ Detecção ambígua de rubricas</div>
        <div class="modal-conflitos-sub">
          ${conflitos.length} ${conflitos.length === 1 ? 'linha pode ser de mais de uma rubrica' : 'linhas podem ser de mais de uma rubrica'}.
          Confirme qual rubrica deve marcar cada uma:
        </div>
        <div class="modal-conflitos-lista">
          ${linhasHtml}
        </div>
        <div class="modal-conflitos-actions">
          <button class="btn btn-ghost btn-small" onclick="fecharModalConflitosRubrica()">Cancelar</button>
          <button class="btn btn-primary btn-small" onclick="aplicarResolucaoConflitos()">Confirmar escolhas</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fecharModalConflitosRubrica() {
  const m = document.getElementById('modalConflitosRubrica');
  if (m) m.remove();
}

function aplicarResolucaoConflitos() {
  const conflitos = (state.dadosPacote3 && state.dadosPacote3._conflitos_rubrica) || [];
  // Reinicia detecção: todas em false, depois reaplica linha por linha
  // baseado no escolha do usuário pra cada conflito + matches únicos das
  // demais linhas (que não eram conflito — essas mantém o que está em state)
  if (conflitos.length === 0) {
    fecharModalConflitosRubrica();
    return;
  }
  // Pra cada conflito, lê o radio selecionado e atualiza a escolha + state
  for (let i = 0; i < conflitos.length; i++) {
    const c = conflitos[i];
    const radios = document.querySelectorAll(`input[name="conflito_${i}"]`);
    let escolhido = c.escolha;
    radios.forEach(r => { if (r.checked) escolhido = r.value; });
    // Se o usuário trocou: desmarca a rubrica antiga (caso essa linha era a
    // única motivadora dela) e marca a nova. Estratégia conservadora: marca
    // sempre a nova (mesmo se a antiga continuar true, não machuca — é só
    // mais uma rubrica aplicável).
    c.escolha = escolhido;
    state.rubricas[escolhido] = true;
  }
  // Reconta marcadas pra atualizar flag
  const nMarcadas = Object.values(state.rubricas).filter(Boolean).length;
  state.dadosPacote3._autodetect_fez_match = nMarcadas > 0;
  fecharModalConflitosRubrica();
  render();
}

// Exporta pra global pra ser chamado via onclick="..."
window.abrirModalConflitosRubrica = abrirModalConflitosRubrica;
window.fecharModalConflitosRubrica = fecharModalConflitosRubrica;
window.aplicarResolucaoConflitos = aplicarResolucaoConflitos;
