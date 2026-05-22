/* =========================================================================
   DONE — tela final pós-geração
   renderDone: tela de sucesso com botão de download
   baixarPeca: dispara o download do blob
   novaPecaMesmoProduto: reset parcial pra gerar outra peça do mesmo produto
   ========================================================================= */
/* =========================================================================
   DONE
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
        </div>
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
  // Para o produto 5 (Juros e Encargos): { mora_cred_pessoal, mora_cartao, encargos_limite, encargos_descobertos }
  state.rubricas = inicializarRubricasDoProduto(state.produtoSelecionado);
  navegarPara('pacote1');
}
