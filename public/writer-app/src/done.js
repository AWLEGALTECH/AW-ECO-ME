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
          ${podeFinalizar ? `
            <button class="btn btn-primary done-btn-primary" onclick="salvarPecaNoDriveDoCliente()" id="btnSalvarDrive"
              title="Cria uma subpasta no Drive do cliente e sobe a peça automaticamente">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
              <span>Salvar na pasta do cliente</span>
            </button>
          ` : `
            <button class="btn btn-primary done-btn-primary" onclick="baixarPeca()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              <span>Baixar arquivo</span>
            </button>
          `}
          ${podeFinalizar ? `
            <button class="done-ghost-btn" onclick="baixarPeca()" title="Baixar uma cópia local também">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              <span>Baixar cópia</span>
            </button>
            <button class="done-ghost-btn done-finalize-btn" onclick="abrirModalFinalizarPeca()" title="Já subi manualmente — cole o link"
              style="opacity: 0.7;"
              onmouseover="this.style.opacity='1'"
              onmouseout="this.style.opacity='0.7'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              <span>Já subi pro Drive — colar link</span>
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
            border: 1px dashed hsla(var(--accent-h), 75%, 65%, 0.35);
            background: hsla(var(--accent-h), 75%, 65%, 0.06);
            border-radius: 12px; max-width: 560px;
            font-size: 12px; color: var(--text-ghost, #aaa);
            line-height: 1.5;
          ">
            <strong style="color: hsl(var(--accent-h), 75%, 75%); display: block; margin-bottom: 4px;">
              ${emCadeia ? 'Próximo passo' : 'Salvar no Drive'}
            </strong>
            Clique em <em>Salvar na pasta do cliente</em> — vamos criar uma subpasta
            <code style="background:hsla(0,0%,100%,0.05);padding:1px 5px;border-radius:4px;font-size:11px;">${p.nome} - ${nome}</code>
            dentro da pasta dele no Drive e subir o .docx automaticamente${emCadeia ? '. Depois seguimos pra próxima peça da fila.' : '.'}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// Cria a subpasta no Drive do cliente, abre ela em nova aba e baixa o
// .docx localmente. Service Accounts nao tem quota pra subir arquivos
// (limite hard do Google em Drives pessoais), entao o user arrasta
// manualmente o arquivo baixado pra pasta aberta. Depois aperta
// "Ja subi — finalizar" pra fechar o pipeline.
async function salvarPecaNoDriveDoCliente() {
  if (!state.arquivoFinalBlob) { alert('Arquivo não disponível.'); return; }

  const clienteId = new URLSearchParams(window.location.search).get('cliente');
  if (!clienteId) {
    alert('Sem cliente vinculado — abra o writer a partir do cliente pra usar essa função.');
    return;
  }

  const btn = document.getElementById('btnSalvarDrive');
  const labelOriginal = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 0.8s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg><span>Preparando…</span>';
  }

  try {
    const pecaNome = (state.produtoSelecionado && state.produtoSelecionado.nome) || 'Peça';
    const fileName = `${pecaNome.replace(/[\\/:*?"<>|]/g, '')} - ${(state.dadosPacote1.nome_completo || 'Cliente').replace(/\s+/g, '_')}.docx`;

    const sbUrl = (typeof AW_SB_URL !== 'undefined') ? AW_SB_URL : 'https://wvltdjspytysuoybcfgb.supabase.co';
    const sbKey = (typeof AW_SB_KEY !== 'undefined') ? AW_SB_KEY :
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2bHRkanNweXR5c3VveWJjZmdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjAxNjEsImV4cCI6MjA5NDgzNjE2MX0.aTFKemNruwj70C3inSxfmz8DQm38ux9JGlq5GXuGL34';

    // 1. Cria a subpasta via SA (so metadado, nao consome quota)
    const resp = await fetch(`${sbUrl}/functions/v1/create-peca-subfolder`, {
      method: 'POST',
      headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clienteId, peca_name: pecaNome }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) {
      throw new Error(data.error || `Falha (${resp.status})`);
    }

    // 2. Abre a subpasta no Drive em nova aba
    window.open(data.folder_url, '_blank', 'noopener,noreferrer');

    // 3. Baixa o .docx local pro user arrastar pra pasta aberta
    const url = URL.createObjectURL(state.arquivoFinalBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    // 4. Mostra modal explicando o proximo passo + botao de finalizar
    abrirModalArrasteParaDrive(data.folder_url, data.folder_name, fileName);
  } catch (e) {
    console.error('[salvar-drive]', e);
    alert('Erro ao criar pasta no Drive: ' + (e?.message || e));
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.innerHTML = labelOriginal;
    }
  }
}

// Modal com instrucao visual: pasta aberta + arquivo baixado, agora
// arrasta. Botao "Ja arrastei — finalizar peca" fecha o pipeline.
function abrirModalArrasteParaDrive(folderUrl, folderName, fileName) {
  const old = document.getElementById('modalArrastar');
  if (old) old.remove();
  const emCadeia = state.cadeia && state.cadeia.ativa;

  const overlay = document.createElement('div');
  overlay.id = 'modalArrastar';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 1000;
    background: hsla(0, 0%, 0%, 0.65); backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    padding: 20px; font-family: Inter, system-ui, sans-serif;
  `;
  overlay.innerHTML = `
    <div style="max-width:520px;width:100%;background:hsl(240,6%,10%);border:1px solid hsla(0,0%,100%,0.08);border-radius:16px;padding:24px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
        <div style="width:40px;height:40px;border-radius:10px;background:hsla(var(--accent-h),75%,65%,0.15);border:1px solid hsla(var(--accent-h),75%,65%,0.3);display:flex;align-items:center;justify-content:center;color:hsl(var(--accent-h),75%,70%);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </div>
        <div>
          <h2 style="font-size:17px;font-weight:600;color:#f5f5f5;margin:0;">Pasta criada no Drive</h2>
          <div style="font-size:12px;color:#999;margin-top:2px;font-family:monospace;">${folderName}</div>
        </div>
      </div>
      <ol style="font-size:13px;color:#cfcfcf;line-height:1.7;padding-left:18px;margin:14px 0 18px;">
        <li>Já abrimos a pasta em outra aba do navegador</li>
        <li>Já baixamos o arquivo <code style="background:hsla(0,0%,100%,0.06);padding:1px 5px;border-radius:4px;font-size:11px;">${fileName}</code></li>
        <li><strong style="color:hsl(var(--accent-h),75%,75%);">Arrasta o arquivo baixado pra dentro da pasta aberta</strong></li>
        <li>Volte aqui e clique em finalizar</li>
      </ol>
      <p style="font-size:11.5px;color:#777;margin:0 0 18px;line-height:1.5;">
        Tivemos que adotar esse fluxo manual porque o Google não permite que nossa Service Account suba arquivos em pastas do Drive pessoal (limitação técnica de quota).
      </p>
      <div style="display:flex;gap:10px;justify-content:flex-end;align-items:center;flex-wrap:wrap;">
        <a href="${folderUrl}" target="_blank" rel="noopener noreferrer" style="font-size:11.5px;color:hsl(var(--accent-h),75%,75%);text-decoration:underline;text-underline-offset:3px;">Abrir pasta de novo</a>
        <button id="btnFinalizarArraste" style="
          padding:9px 18px;font-size:12.5px;font-weight:500;border-radius:9px;
          background:hsl(160,75%,38%);color:#fff;border:1px solid hsl(160,75%,45%);
          cursor:pointer;font-family:inherit;
        ">
          ${emCadeia ? `Já arrastei — seguir (${state.cadeia.pos}/${state.cadeia.total})` : 'Já arrastei — finalizar'}
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  const btn = document.getElementById('btnFinalizarArraste');
  btn.onclick = async () => {
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btn.textContent = 'Registrando…';
    try {
      const res = await finalizarPecaPipeline(folderUrl);
      if (!res.ok) console.warn('[salvar-drive] finalize falhou:', res);
    } catch (e) { console.warn('[salvar-drive] excecao finalize', e); }
    overlay.remove();
    const emCad = state.cadeia && state.cadeia.ativa;
    if (emCad) {
      avancarCadeia();
    } else {
      const cliId = new URLSearchParams(window.location.search).get('cliente');
      if (cliId) {
        window.parent.postMessage({
          type: 'aw-eco-me:cadeiaCompleta',
          payload: { cliente: cliId },
        }, window.location.origin);
      }
    }
  };
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
          background: hsla(var(--accent-h), 75%, 65%, 0.15);
          border: 1px solid hsla(var(--accent-h), 75%, 65%, 0.3);
          display: flex; align-items: center; justify-content: center;
          color: hsl(var(--accent-h), 75%, 70%);
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </div>
        <h2 style="font-size: 17px; font-weight: 600; color: #f5f5f5; margin: 0;">
          Link da peça no Drive
        </h2>
      </div>
      <p style="font-size: 13px; color: #999; margin: 8px 0 18px; line-height: 1.5;">
        Cole o link do arquivo (ou da pasta do cliente) no Google Drive. A peça
        vai pros <strong style="color: hsl(var(--accent-h), 75%, 75%);">Espelhos de Protocolo</strong>
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
        onfocus="this.style.borderColor='hsla(var(--accent-h),75%,65%,0.5)'"
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
  // Preserva comarca/UF da peca atual — fluxo "outra do mesmo cliente"
  // deve herdar o foro, igual o modo cadeia.
  const cm = state.dadosPacote3 && state.dadosPacote3.comarca;
  const uf = state.dadosPacote3 && state.dadosPacote3.uf;
  state.dadosPacote3 = { gerar_lastro_dano_material: true };
  if (cm) state.dadosPacote3.comarca = cm;
  if (uf) state.dadosPacote3.uf = uf;
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
