/* =========================================================================
   DONE — tela final pós-geração
   renderDone: tela de sucesso com botão de download + bloco de finalização
                (cola URL do Drive -> registra peça no pipeline)
   baixarPeca: dispara o download do blob
   novaPecaMesmoProduto: reset parcial pra gerar outra peça do mesmo produto
   novaPecaMesmoCliente: reset preservando pacote1+pacote2 do cliente
   ========================================================================= */

function renderDone(view) {
  const nome = state.dadosPacote1.nome_completo || 'Cliente';
  const p = state.produtoSelecionado;

  // IMPORTANTE: este eh o renderDone do fluxo PETICAO (lobby -> pacote1..3 -> done),
  // NAO do kit de representacao. Pre-cliente eh criado APENAS no fluxo do kit
  // (kit.js gerarKitPecas), que produz contrato + procuracao. Nao chamamos
  // salvarPreCliente aqui — peticoes nao geram pre-cliente.

  const hasImage = p.capa && p.capa.length > 0;
  const coverStyle = hasImage ? `background-image: url('${p.capa}')` : '';
  const coverClass = hasImage ? 'has-image' : 'placeholder';
  const letraDoProduto = p.nome.charAt(0);
  const rubricas = p.rubricas || [];

  // Flag pra controlar o estado de finalização (mostra bloco do Drive apenas
  // depois que o user clica em Baixar — assim ele tem chance de subir pro Drive)
  const podeFinalizar = !!state.demandaConfeccaoId;
  const emCadeia = state.cadeia && state.cadeia.ativa;

  view.innerHTML = `
    <div class="done-page">
      <div class="done-hero">
        <div class="done-eyebrow">Peça jurídica entregue</div>

        <div class="done-product-card">
          <div class="done-seal-stamp">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 13l4 4L19 7"/>
            </svg>
          </div>
          <div class="product-card done-embedded-card">
            <div class="product-cover ${coverClass}" style="${coverStyle}">
              ${!hasImage ? `<div class="product-cover-mark">${letraDoProduto}</div>` : ''}
            </div>
            <div class="product-content">
              <div class="product-top"></div>
              <div class="product-bottom">
                ${p.reu ? `<div class="product-reu">${p.reu}</div>` : ''}
                <div class="product-title">${p.nome}</div>
                <div class="product-sub">${p.sublabel}</div>
                ${rubricas.length > 0 ? `
                  <div class="product-rubricas">
                    ${rubricas.map(r => `<span class="rubrica-chip">${r}</span>`).join('')}
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        </div>

        <div class="done-meta-line">
          <span class="done-requerente-name">${nome}</span>
          <span class="done-meta-sep">·</span>
          <span class="done-meta-item">${new Date().toLocaleDateString('pt-BR')}</span>
        </div>

        <div class="done-actions-row">
          <button class="btn btn-primary done-btn-primary" onclick="baixarPeca()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            <span>Baixar arquivo</span>
          </button>
          ${podeFinalizar ? `
            <button class="done-ghost-btn done-finalize-btn" onclick="abrirModalFinalizarPeca()" title="Cole o link da pasta/arquivo do Drive pra mover essa peça pros Espelhos de Protocolo"
              style="background: hsla(160, 75%, 38%, 0.12); border-color: hsla(160, 75%, 45%, 0.5); color: hsl(160, 65%, 70%);"
              onmouseover="this.style.background='hsla(160, 75%, 38%, 0.22)'"
              onmouseout="this.style.background='hsla(160, 75%, 38%, 0.12)'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span>${emCadeia ? 'Finalizar e ir pra próxima' : 'Já subi pro Drive — finalizar'}</span>
            </button>
          ` : ''}
          ${!emCadeia ? `
            <button class="done-ghost-btn" onclick="navegarPara('lobby')" title="Voltar ao lobby de produtos">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V20a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2V9.5z"/></svg>
              <span>Ir ao lobby</span>
            </button>
            <button class="done-ghost-btn" onclick="novaPecaMesmoProduto()" title="Gerar outra peça do mesmo produto">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>Outra do mesmo produto</span>
            </button>
            <!-- [TEMP-MESMO-CLIENTE] BEGIN — botão pra reaproveitar cliente em outro produto. Pra remover, deletar este bloco. -->
            <button class="done-ghost-btn" onclick="novaPecaMesmoCliente()" title="Gerar outra peça reaproveitando os dados deste cliente, escolhendo outro produto">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/><path d="M19 4l2 2-2 2M21 6h-6"/></svg>
              <span>Outra do mesmo cliente</span>
            </button>
            <!-- [TEMP-MESMO-CLIENTE] END -->
          ` : ''}
        </div>

        ${podeFinalizar ? `
          <div class="done-finalize-hint" style="
            margin-top: 24px; padding: 14px 18px;
            border: 1px dashed hsla(270, 75%, 65%, 0.35);
            background: hsla(270, 75%, 65%, 0.06);
            border-radius: 12px; max-width: 560px;
            font-size: 12px; color: var(--text-ghost, #aaa);
            line-height: 1.5;
          ">
            <strong style="color: hsl(270, 75%, 75%); display: block; margin-bottom: 4px;">
              Próximo passo
            </strong>
            Baixe o arquivo acima, faça upload na pasta do cliente no Google Drive
            e clique em <em>"${emCadeia ? 'Finalizar e ir pra próxima' : 'Já subi pro Drive — finalizar'}"</em>
            pra mover a peça pros Espelhos de Protocolo${emCadeia ? ' e seguir pra próxima da fila' : ''}.
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function baixarPeca() {
  if (!state.arquivoFinalBlob) { alert('Arquivo não disponível.'); return; }
  const url = URL.createObjectURL(state.arquivoFinalBlob);
  const a = document.createElement('a');
  a.href = url;
  // Sempre .docx agora (geração no frontend via docxtemplater)
  a.download = `peticao_${(state.dadosPacote1.nome_completo || 'cliente').replace(/\s+/g, '_')}_${Date.now()}.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

// Modal pedindo URL do Drive — abre depois que o user já teve oportunidade
// de baixar o arquivo e subir pra pasta do cliente.
function abrirModalFinalizarPeca() {
  // Remove modal antigo se existir
  const old = document.getElementById('modalFinalizarPeca');
  if (old) old.remove();

  const emCadeia = state.cadeia && state.cadeia.ativa;
  const labelBtn = emCadeia
    ? `Finalizar e seguir (${state.cadeia.pos}/${state.cadeia.total})`
    : 'Finalizar peça';

  const overlay = document.createElement('div');
  overlay.id = 'modalFinalizarPeca';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 1000;
    background: hsla(0, 0%, 0%, 0.65); backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px; font-family: Inter, system-ui, sans-serif;
  `;
  overlay.innerHTML = `
    <div style="
      max-width: 480px; width: 100%;
      background: hsl(240, 6%, 10%); border: 1px solid hsla(0, 0%, 100%, 0.08);
      border-radius: 16px; padding: 24px;
      box-shadow: 0 20px 60px hsla(0, 0%, 0%, 0.5);
    ">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 6px;">
        <div style="
          width: 36px; height: 36px; border-radius: 10px;
          background: hsla(270, 75%, 65%, 0.15);
          border: 1px solid hsla(270, 75%, 65%, 0.3);
          display: flex; align-items: center; justify-content: center;
          color: hsl(270, 75%, 70%);
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </div>
        <h2 style="font-size: 17px; font-weight: 600; color: #f5f5f5; margin: 0;">
          Link da peça no Drive
        </h2>
      </div>
      <p style="font-size: 13px; color: #999; margin: 8px 0 18px; line-height: 1.5;">
        Cole o link do arquivo (ou da pasta do cliente) no Google Drive. A peça
        vai pros <strong style="color: hsl(270, 75%, 75%);">Espelhos de Protocolo</strong>
        do cliente${emCadeia ? ' e o writer carrega a próxima da fila.' : '.'}
      </p>
      <input id="drivePecaInput" type="text"
        placeholder="https://drive.google.com/..."
        style="
          width: 100%; padding: 12px 14px; font-size: 13px;
          background: hsla(0, 0%, 100%, 0.04);
          border: 1px solid hsla(0, 0%, 100%, 0.12);
          border-radius: 10px; color: #f0f0f0;
          font-family: inherit; outline: none; box-sizing: border-box;
        "
        onfocus="this.style.borderColor='hsla(270,75%,65%,0.5)'"
        onblur="this.style.borderColor='hsla(0,0%,100%,0.12)'"
      >
      <div id="drivePecaErro" style="
        display: none; font-size: 11.5px; color: hsl(0, 75%, 65%);
        margin-top: 8px;
      "></div>
      <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 22px;">
        <button id="btnPularFinalizar" style="
          padding: 9px 16px; font-size: 12.5px; border-radius: 9px;
          background: transparent; color: #999;
          border: 1px solid hsla(0, 0%, 100%, 0.1); cursor: pointer;
          font-family: inherit;
        ">
          ${emCadeia ? 'Pular link e seguir' : 'Pular sem link'}
        </button>
        <button id="btnConfirmarFinalizar" style="
          padding: 9px 18px; font-size: 12.5px; font-weight: 500; border-radius: 9px;
          background: hsl(160, 75%, 38%); color: #fff;
          border: 1px solid hsl(160, 75%, 45%); cursor: pointer;
          font-family: inherit;
        ">
          ${labelBtn}
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById('drivePecaInput');
  const erro = document.getElementById('drivePecaErro');
  const btnPular = document.getElementById('btnPularFinalizar');
  const btnConf = document.getElementById('btnConfirmarFinalizar');

  setTimeout(() => input && input.focus(), 50);

  const fechar = () => overlay.remove();

  const validarUrl = (url) => {
    if (!url) return false;
    try {
      const u = new URL(url);
      return /^(drive|docs)\.google\.com$/.test(u.hostname);
    } catch { return false; }
  };

  const finalizar = async (driveUrl) => {
    btnConf.disabled = true; btnPular.disabled = true;
    btnConf.textContent = 'Registrando…';
    btnConf.style.opacity = '0.7';
    try {
      const res = await finalizarPecaPipeline(driveUrl);
      if (!res.ok) {
        erro.textContent = 'Não foi possível registrar (' + (res.reason || 'erro') + '). Você pode tentar novamente ou pular.';
        erro.style.display = 'block';
        btnConf.disabled = false; btnPular.disabled = false;
        btnConf.textContent = labelBtn;
        btnConf.style.opacity = '1';
        return;
      }
    } catch (e) {
      console.warn('[finalizar] excecao', e);
    }
    fechar();
    const emCad = state.cadeia && state.cadeia.ativa;
    if (emCad) {
      avancarCadeia();
    } else {
      // Fluxo single: avisa o parent pra navegar de volta ao cliente
      const clienteId = new URLSearchParams(window.location.search).get('cliente');
      if (clienteId) {
        window.parent.postMessage({
          type: 'aw-eco-me:cadeiaCompleta',
          payload: { cliente: clienteId },
        }, window.location.origin);
      }
    }
  };

  btnConf.onclick = () => {
    erro.style.display = 'none';
    const url = (input.value || '').trim();
    if (!url) { erro.textContent = 'Cole o link do Drive ou clique em "Pular sem link".'; erro.style.display = 'block'; return; }
    if (!validarUrl(url)) {
      erro.textContent = 'URL inválida — deve ser drive.google.com ou docs.google.com';
      erro.style.display = 'block';
      return;
    }
    finalizar(url);
  };
  btnPular.onclick = () => finalizar('');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); btnConf.click(); }
    if (e.key === 'Escape') fechar();
  });
}

// [TEMP-MESMO-CLIENTE] BEGIN — handler do botão "Outra do mesmo cliente".
// Mantém pacote 1 (qualificação) e pacote 2 (perfil socioeconômico) e a
// selfie (procuração eletrônica é do mesmo cliente). Reseta o resto e
// liga state.modoMesmoCliente — selecionarProduto() lê essa bandeira e
// pula direto pra pacote3 quando setada.
// Pra remover esta feature, deletar esta função inteira + os outros
// blocos marcados [TEMP-MESMO-CLIENTE] em done.js, render.js e ia.js.
function novaPecaMesmoCliente() {
  state.modoMesmoCliente = true;
  state.dadosPacote3 = { gerar_lastro_dano_material: true };
  state.trechosIA = {};
  state.trechosIAOriginais = {};
  state.trechosEditados = new Set();
  state.regeneracoesPorZona = {};
  state.anexos = { selfie: state.anexos.selfie, tabelaXlsx: null };
  state.arquivoFinalBlob = null;
  state.produtoSelecionado = null;
  state.rubricas = {};
  navegarPara('lobby');
}
// [TEMP-MESMO-CLIENTE] END

function novaPecaMesmoProduto() {
  // Reset TOTAL de tudo que é específico do caso/cliente, mantendo apenas
  // o produto selecionado. Comportamento equivalente ao "selecionarProduto"
  // (linha ~2901), mas sem trocar de produto.
  // Decisão de UX: caso totalmente novo = cliente potencialmente diferente.
  // O advogado começa do zero na Etapa 01 e preenche tudo.
  state.dadosPacote1 = {};
  state.dadosPacote2 = {};
  state.dadosPacote3 = { gerar_lastro_dano_material: true };
  state.trechosIA = {};
  state.trechosIAOriginais = {};
  state.trechosEditados = new Set();
  state.anexos = { selfie: null, tabelaXlsx: null };
  state.seguranca = { ...SEGURANCA_DEFAULT };
  state.arquivoFinalBlob = null;
  // state.rubricas agora é dinâmico baseado no produto selecionado.
  // Para o produto 1 (Descontos Indevidos): { cartao, parcela, bx }
  // Para o produto 5 (Juros e Encargos): { mora_cred_pessoal, mora_cartao, encargos_descobertos, encargos_limite }
  state.rubricas = inicializarRubricasDoProduto(state.produtoSelecionado);
  navegarPara('pacote1');
}
