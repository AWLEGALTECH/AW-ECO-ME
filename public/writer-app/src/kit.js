/* =========================================================================
   KIT REPRESENTAÇÃO — fluxo dedicado dos produtos kit (Matheus / Diego)
   - inicializarDadosKit: prepara state.dadosKit com defaults seguros
   - renderKitForm: tela única densa pra digitar dados do cliente/causa/honorários
   - gerarKitPecas: orquestra a geração do contrato + procuração no browser
   - renderKitDone: tela final com 2 cards de download
   ========================================================================= */

const MOTIVOS_AJUIZAMENTO = [
  'falha na prestação de serviço e violação de direitos',
  'cobrança indevida e violação de direitos',
  'descontos indevidos em benefício previdenciário',
  'negativação indevida e violação de direitos',
];

const MOTIVOS_DEFESA = [
  'execução fiscal',
  'ação de cobrança',
  'ação de execução de título extrajudicial',
  'ação monitória',
];

// Mapeia gênero → tokens flexionados usados nos placeholders.
// Resolve "indicado/indicada", "portador/portadora", "inscrito/inscrita".
const FLEXOES_GENERO = {
  masculino: {
    indicado_a: 'indicado',
    nacionalidade_default: 'brasileiro',
    portador_a: 'portador',
    inscrito_a: 'inscrito',
  },
  feminino: {
    indicado_a: 'indicada',
    nacionalidade_default: 'brasileira',
    portador_a: 'portadora',
    inscrito_a: 'inscrita',
  },
};

// Estado civil — keys batendo com as do pacote1 (regular) pra permitir
// bridge transparente de cliente entre fluxos. Em runtime escolhemos a
// forma flexionada certa com base em state.dadosKit.cliente_genero.
const ESTADOS_CIVIS = [
  { key: 'solteiro',       m: 'solteiro',         f: 'solteira',           label: 'Solteiro(a)' },
  { key: 'casado',         m: 'casado',           f: 'casada',             label: 'Casado(a)' },
  { key: 'divorciado',     m: 'divorciado',       f: 'divorciada',         label: 'Divorciado(a)' },
  { key: 'viúvo',          m: 'viúvo',            f: 'viúva',              label: 'Viúvo(a)' },
  { key: 'separado',       m: 'separado',         f: 'separada',           label: 'Separado(a)' },
  { key: 'união estável',  m: 'em união estável', f: 'em união estável',   label: 'União estável' },
];

function flexionarEstadoCivil(key, genero) {
  const ec = ESTADOS_CIVIS.find(e => e.key === key);
  if (!ec) return '';
  return genero === 'feminino' ? ec.f : ec.m;
}

// Mapa (advogado_branding × modalidade) → nome da variável global com
// template base64. Cada advogado tem seu próprio set de 4 contratos
// (signature CONTRATADO específica). A procuração é compartilhada
// porque ambos aparecem como OUTORGADOS independente do branding.
const TEMPLATES_CONTRATO_POR_BRANDING_MODALIDADE = {
  matheus: {
    exito: 'TEMPLATE_KIT_CONTRATO_EXITO_B64',
    exito_final: 'TEMPLATE_KIT_CONTRATO_EXITO_INICIAL_B64',
    final: 'TEMPLATE_KIT_CONTRATO_FINAL_B64',
    exito_parcelado: 'TEMPLATE_KIT_CONTRATO_PARCELADO_B64',
  },
  diego: {
    exito: 'TEMPLATE_KIT_CONTRATO_EXITO_DIEGO_B64',
    exito_final: 'TEMPLATE_KIT_CONTRATO_EXITO_INICIAL_DIEGO_B64',
    final: 'TEMPLATE_KIT_CONTRATO_FINAL_DIEGO_B64',
    exito_parcelado: 'TEMPLATE_KIT_CONTRATO_PARCELADO_DIEGO_B64',
  },
};

function resolverTemplateContratoPorModalidade(modalidadeId) {
  const branding = state.produtoSelecionado?.advogado_branding || 'matheus';
  const mapaBranding = TEMPLATES_CONTRATO_POR_BRANDING_MODALIDADE[branding]
    || TEMPLATES_CONTRATO_POR_BRANDING_MODALIDADE.matheus;
  return mapaBranding[modalidadeId];
}

// Procuração também tem variante por branding (logo no header difere).
// O texto do corpo é idêntico (ambos advogados aparecem como OUTORGADOS),
// muda só o cabeçalho com a marca do escritório.
const TEMPLATES_PROCURACAO_POR_BRANDING = {
  matheus: 'TEMPLATE_KIT_PROCURACAO_B64',
  diego:   'TEMPLATE_KIT_PROCURACAO_DIEGO_B64',
};

function resolverTemplateProcuracao() {
  const branding = state.produtoSelecionado?.advogado_branding || 'matheus';
  return TEMPLATES_PROCURACAO_POR_BRANDING[branding] || TEMPLATES_PROCURACAO_POR_BRANDING.matheus;
}

/* =========================================================================
   AUTO-PREENCHIMENTO DO CLIENTE — puxa da base aw-eco-me, igual outras peças
   ========================================================================= */
// Mapeia o shape de cliente (vindo de fetchClienteAW/_dbToWriterShape) pros
// campos cliente_* do dadosKit. So sobrescreve quando vem valor.
function aplicarClienteNoKit(c) {
  if (!c || !state.dadosKit) return;
  const setIf = (k, v) => { if (v !== undefined && v !== null && String(v).trim() !== '') state.dadosKit[k] = v; };
  setIf('cliente_nome_completo',    c.nome_completo);
  setIf('cliente_genero',           c.genero);
  setIf('cliente_nacionalidade',    c.nacionalidade);
  setIf('cliente_estado_civil',     c.estado_civil);
  setIf('cliente_profissao',        c.profissao);
  setIf('cliente_rg',               c.rg);
  setIf('cliente_orgao_expedidor',  c.orgao_expedidor);
  setIf('cliente_cpf',              c.cpf);
  setIf('cliente_endereco_completo', c.endereco_completo);
  setIf('cliente_whatsapp',         c.telefone ? formatarWhatsapp(c.telefone) : '');
  state.dadosKit.cliente_aw_id = c.aw_id || '';
}

// Handler do dropdown "Selecionar análise comercial". Puxa nome + CPF da
// análise feita no Finder e atrela as rubricas não ajuizáveis ao kit (que
// viram clientes.rubricas_bloqueadas na conversão do pré-cliente).
function onKitSelectAnaliseComercial(id) {
  if (!state.dadosKit) return;
  if (!id) {
    state.dadosKit.analise_comercial_id = '';
    state.dadosKit.rubricas_bloqueadas = [];
    if (typeof render === 'function') render();
    return;
  }
  const a = (state.analisesComerciais || []).find(x => x.id === id);
  if (!a) return;
  const setIf = (k, v) => { if (v !== undefined && v !== null && String(v).trim() !== '') state.dadosKit[k] = v; };
  setIf('cliente_nome_completo', a.nome);
  setIf('cliente_cpf', a.cpf);
  state.dadosKit.analise_comercial_id = a.id;
  state.dadosKit.rubricas_bloqueadas = a.rubricas_bloqueadas || [];
  if (typeof render === 'function') render();
}

// Handler do dropdown de seleção de cliente no kit form.
async function onKitSelectCliente(awId) {
  if (!awId) return;
  // Tenta do cache primeiro (state.clientesAW), senao busca individual
  let c = (state.clientesAW || []).find(x => x.aw_id === awId);
  if (!c && typeof fetchClienteAW === 'function') {
    c = await fetchClienteAW(awId);
  }
  if (c) {
    aplicarClienteNoKit(c);
    if (typeof render === 'function') render();
  }
}

function inicializarDadosKit() {
  return {
    // Cliente
    cliente_aw_id: '',
    // Análise comercial (Finder isolado) selecionada — carrega nome + rubricas
    // não ajuizáveis pro perfil do cliente.
    analise_comercial_id: '',
    rubricas_bloqueadas: [],
    cliente_nome_completo: '',
    cliente_genero: 'masculino',
    cliente_nacionalidade: 'brasileiro',
    cliente_estado_civil: '',
    cliente_profissao: '',
    cliente_rg: '',
    cliente_orgao_expedidor: '',
    cliente_cpf: '',
    cliente_endereco_completo: '',
    cliente_whatsapp: '',
    // Causa
    causa_tipo: 'ajuizamento',
    causa_reus: [''],
    causa_numero_processo: '',
    causa_motivo: '',
    causa_motivo_outro: '',
    // Honorários — campos dependem da modalidade
    honorarios_percentual_exito: '50',
    honorarios_valor_inicial: '',
    honorarios_valor_total: '',
    honorarios_parcelas_qtd: '3',
    honorarios_primeira_parcela_valor: '',
    honorarios_primeira_parcela_data: '',
    // Assinatura
    contrato_cidade_assinatura: 'Manaus',
    contrato_data_assinatura: '',
  };
}

/* =========================================================================
   RENDER — formulário (tela única densa)
   ========================================================================= */
function renderKitForm(view) {
  const produto = state.produtoSelecionado;
  const modalidade = state.modalidadeSelecionada;
  if (!produto || !modalidade) {
    // Estado inconsistente — devolve pro lobby.
    navegarPara('lobby');
    return;
  }
  if (!state.dadosKit || Object.keys(state.dadosKit).length === 0) {
    state.dadosKit = inicializarDadosKit();
  }
  // Auto-preenche do cliente ja carregado (vindo de ?cliente=ID no contexto)
  // na primeira vez que o form abre — so se o usuario ainda nao escolheu nada.
  if (!state.dadosKit.cliente_aw_id && state.clienteSelecionado) {
    aplicarClienteNoKit(state.clienteSelecionado);
  }
  const d = state.dadosKit;

  // Lista de clientes pro dropdown (carregada em background pelo app.js)
  const clientes = (state.clientesAW || []);
  const optionsClientes = clientes.map(c =>
    `<option value="${escapeAttr(c.aw_id)}" ${d.cliente_aw_id===c.aw_id?'selected':''}>${escapeHtml(c.nome_completo || '—')}</option>`
  ).join('');

  // Análises comerciais (Finder isolado) pro dropdown de prefill.
  const analises = (state.analisesComerciais || []);
  const optionsAnalises = analises.map(a =>
    `<option value="${escapeAttr(a.id)}" ${d.analise_comercial_id===a.id?'selected':''}>${escapeHtml(a.nome || '—')}${a.total_bloqueadas?` · ${a.total_bloqueadas} bloqueada(s)`:''}</option>`
  ).join('');
  const bloqueadas = Array.isArray(d.rubricas_bloqueadas) ? d.rubricas_bloqueadas : [];
  const MOTIVO_LBL = { cliente_nao_quer: 'cliente não quer', ja_ajuizada: 'já ajuizada' };
  const resumoBloqueadas = bloqueadas.length
    ? `<div class="kit-hint" style="margin-top:6px;color:#fbbf24">🔒 ${bloqueadas.length} rubrica(s) não ajuizável(is) atrelada(s): ${bloqueadas.map(b => escapeHtml(b.rubrica) + (b.motivo?` (${MOTIVO_LBL[b.motivo]||b.motivo})`:'')).join(', ')}</div>`
    : '';

  view.innerHTML = `
    <div class="kit-form-page">
      <div class="kit-form-header">
        <div class="kit-form-eyebrow">${escapeHtml(produto.nome)} · ${escapeHtml(modalidade.nome)}</div>
        <h1>Dados do contrato</h1>
        <div class="kit-form-sub">Preencha em uma tela só. Gera <strong>contrato + procuração</strong> ao final.</div>
      </div>

      <div class="kit-form-grid">
        <!-- ============== CLIENTE ============== -->
        <section class="kit-section">
          <div class="kit-section-title">Cliente</div>
          <div class="kit-fields kit-fields-cliente">
            <label class="kit-field span-3">
              <span>Puxar da base de clientes <em class="kit-hint">preenche os campos abaixo automaticamente</em></span>
              <select onchange="onKitSelectCliente(this.value)">
                <option value="">${clientes.length ? 'Selecione um cliente…' : 'Carregando clientes…'}</option>
                ${optionsClientes}
              </select>
            </label>
            <label class="kit-field span-3">
              <span>Ou selecionar análise comercial <em class="kit-hint">traz o nome e as rubricas não ajuizáveis do Finder</em></span>
              <select onchange="onKitSelectAnaliseComercial(this.value)">
                <option value="">${analises.length ? 'Selecione uma análise comercial…' : 'Nenhuma análise comercial aberta'}</option>
                ${optionsAnalises}
              </select>
              ${resumoBloqueadas}
            </label>
            <label class="kit-field span-2">
              <span>Nome completo</span>
              <input type="text" value="${escapeAttr(d.cliente_nome_completo)}"
                     onchange="onKitChange('cliente_nome_completo', this.value)"
                     placeholder="JOÃO DA SILVA SAUR0">
            </label>
            <label class="kit-field">
              <span>Gênero</span>
              <select onchange="onKitGeneroChange(this.value)">
                <option value="masculino" ${d.cliente_genero==='masculino'?'selected':''}>Masculino</option>
                <option value="feminino" ${d.cliente_genero==='feminino'?'selected':''}>Feminino</option>
              </select>
            </label>

            <label class="kit-field">
              <span>Nacionalidade</span>
              <input type="text" value="${escapeAttr(d.cliente_nacionalidade)}"
                     onchange="onKitChange('cliente_nacionalidade', this.value)">
            </label>
            <label class="kit-field">
              <span>Estado civil</span>
              <select onchange="onKitChange('cliente_estado_civil', this.value)">
                <option value="">Selecione…</option>
                ${ESTADOS_CIVIS.map(ec => `
                  <option value="${ec.key}" ${d.cliente_estado_civil===ec.key?'selected':''}>${ec.label}</option>
                `).join('')}
              </select>
            </label>
            <label class="kit-field">
              <span>Profissão</span>
              <input type="text" value="${escapeAttr(d.cliente_profissao)}"
                     onchange="onKitChange('cliente_profissao', this.value)"
                     placeholder="aposentado, autônomo…">
            </label>

            <label class="kit-field">
              <span>RG <em class="kit-hint">opcional</em></span>
              <input type="text" value="${escapeAttr(d.cliente_rg)}"
                     onchange="onKitChange('cliente_rg', this.value)"
                     placeholder="00.000.000-0">
            </label>
            <label class="kit-field">
              <span>Órgão expedidor <em class="kit-hint">opcional</em></span>
              <input type="text" value="${escapeAttr(d.cliente_orgao_expedidor)}"
                     onchange="onKitChange('cliente_orgao_expedidor', this.value)"
                     placeholder="SSP/AM">
            </label>
            <label class="kit-field">
              <span>CPF</span>
              <input type="text" value="${escapeAttr(d.cliente_cpf)}"
                     oninput="this.value = formatarCPF(this.value); onKitChange('cliente_cpf', this.value)"
                     onchange="this.value = formatarCPF(this.value); onKitChange('cliente_cpf', this.value)"
                     placeholder="000.000.000-00" inputmode="numeric">
            </label>

            <label class="kit-field span-3">
              <span>Endereço completo</span>
              <input type="text" value="${escapeAttr(d.cliente_endereco_completo)}"
                     onchange="onKitChange('cliente_endereco_completo', this.value)"
                     placeholder="Rua X, nº 123, Bairro Y, Cidade-UF, CEP 00000-000">
            </label>
            <label class="kit-field">
              <span>WhatsApp do cliente</span>
              <input type="text" value="${escapeAttr(d.cliente_whatsapp)}"
                     oninput="this.value = formatarWhatsapp(this.value); onKitChange('cliente_whatsapp', this.value)"
                     onchange="this.value = formatarWhatsapp(this.value); onKitChange('cliente_whatsapp', this.value)"
                     placeholder="(92)99999-9999" inputmode="numeric">
            </label>
          </div>
        </section>

        <!-- ============== CAUSA ============== -->
        <section class="kit-section">
          <div class="kit-section-title">Causa</div>
          <div class="kit-fields kit-fields-causa">
            <div class="kit-field span-3">
              <span>Tipo de atuação</span>
              <div class="kit-radio-row">
                <label class="kit-radio">
                  <input type="radio" name="causa_tipo" value="ajuizamento"
                         ${d.causa_tipo==='ajuizamento'?'checked':''}
                         onchange="onKitCausaTipoChange('ajuizamento')">
                  <span>Ajuizamento</span>
                </label>
                <label class="kit-radio">
                  <input type="radio" name="causa_tipo" value="defesa"
                         ${d.causa_tipo==='defesa'?'checked':''}
                         onchange="onKitCausaTipoChange('defesa')">
                  <span>Defesa</span>
                </label>
              </div>
            </div>

            ${d.causa_tipo === 'ajuizamento' ? renderKitReusList(d.causa_reus) : `
              <label class="kit-field span-3">
                <span>Número do processo</span>
                <input type="text" value="${escapeAttr(d.causa_numero_processo)}"
                       onchange="onKitChange('causa_numero_processo', this.value)"
                       placeholder="0000000-00.0000.0.00.0000">
              </label>
            `}

            <label class="kit-field span-2">
              <span>Motivo / fundamento</span>
              <select onchange="onKitMotivoChange(this.value)">
                <option value="">Selecione…</option>
                ${(d.causa_tipo === 'ajuizamento' ? MOTIVOS_AJUIZAMENTO : MOTIVOS_DEFESA).map(m => `
                  <option value="${escapeAttr(m)}" ${d.causa_motivo===m?'selected':''}>${escapeHtml(m)}</option>
                `).join('')}
                <option value="__outro" ${d.causa_motivo==='__outro'?'selected':''}>Outro (digitar)…</option>
              </select>
            </label>
            ${d.causa_motivo === '__outro' ? `
              <label class="kit-field">
                <span>Motivo customizado</span>
                <input type="text" value="${escapeAttr(d.causa_motivo_outro)}"
                       onchange="onKitChange('causa_motivo_outro', this.value)"
                       placeholder="texto livre">
              </label>
            ` : ''}
          </div>
        </section>

        <!-- ============== HONORÁRIOS ============== -->
        <section class="kit-section">
          <div class="kit-section-title">Honorários · ${escapeHtml(modalidade.nome)}</div>
          <div class="kit-fields kit-fields-honorarios">
            ${renderKitHonorariosFields(modalidade.id, d)}
          </div>
        </section>

        <!-- ============== ASSINATURA ============== -->
        <section class="kit-section">
          <div class="kit-section-title">Local & data</div>
          <div class="kit-fields kit-fields-assinatura">
            <label class="kit-field">
              <span>Cidade da assinatura</span>
              <input type="text" value="${escapeAttr(d.contrato_cidade_assinatura)}"
                     onchange="onKitChange('contrato_cidade_assinatura', this.value)">
            </label>
            <label class="kit-field">
              <span>Data da assinatura</span>
              <input type="date" value="${escapeAttr(d.contrato_data_assinatura)}"
                     onchange="onKitChange('contrato_data_assinatura', this.value)">
            </label>
          </div>
        </section>
      </div>

      <div class="kit-form-actions">
        <button class="btn btn-ghost" onclick="navegarPara('modalidade')">← Trocar modalidade</button>
        <button class="btn btn-primary" onclick="gerarKitPecas()">Gerar 2 peças →</button>
      </div>
    </div>
  `;
}

function renderKitReusList(reus) {
  const safeReus = (reus && reus.length > 0) ? reus : [''];
  return `
    <div class="kit-field span-3">
      <span>Réu(s) <em class="kit-hint">— "empresa" / "empresas" é inferido automaticamente</em></span>
      <div class="kit-reus-list">
        ${safeReus.map((r, i) => `
          <div class="kit-reu-row">
            <input type="text" value="${escapeAttr(r)}"
                   onchange="onKitReuChange(${i}, this.value)"
                   placeholder="BANCO BRADESCO S.A.">
            ${safeReus.length > 1 ? `<button type="button" class="kit-reu-del" onclick="onKitReuRemove(${i})" title="Remover">✕</button>` : ''}
          </div>
        `).join('')}
        <button type="button" class="kit-reu-add" onclick="onKitReuAdd()">+ adicionar réu</button>
      </div>
    </div>
  `;
}

function renderKitHonorariosFields(modalidadeId, d) {
  switch (modalidadeId) {
    case 'exito':
      return `
        <label class="kit-field">
          <span>Percentual de êxito</span>
          <input type="text" value="${escapeAttr(d.honorarios_percentual_exito)}"
                 onchange="onKitChange('honorarios_percentual_exito', this.value)"
                 placeholder="30">
        </label>
      `;
    case 'exito_final':
      return `
        <label class="kit-field">
          <span>Valor inicial (R$)</span>
          <input type="number" min="0" step="0.01" value="${escapeAttr(d.honorarios_valor_inicial)}"
                 onchange="onKitChange('honorarios_valor_inicial', this.value)"
                 placeholder="600.00">
        </label>
        <label class="kit-field">
          <span>Percentual de êxito</span>
          <input type="text" value="${escapeAttr(d.honorarios_percentual_exito)}"
                 onchange="onKitChange('honorarios_percentual_exito', this.value)"
                 placeholder="30">
        </label>
      `;
    case 'final':
      return `
        <label class="kit-field">
          <span>Valor único (R$)</span>
          <input type="number" min="0" step="0.01" value="${escapeAttr(d.honorarios_valor_inicial)}"
                 onchange="onKitChange('honorarios_valor_inicial', this.value)"
                 placeholder="700.00">
        </label>
      `;
    case 'exito_parcelado':
      return `
        <label class="kit-field">
          <span>Valor total (R$)</span>
          <input type="number" min="0" step="0.01" value="${escapeAttr(d.honorarios_valor_total)}"
                 onchange="onKitChange('honorarios_valor_total', this.value)"
                 placeholder="1000.00">
        </label>
        <label class="kit-field">
          <span>Qtd parcelas</span>
          <input type="number" min="2" max="12" step="1" value="${escapeAttr(d.honorarios_parcelas_qtd)}"
                 onchange="onKitChange('honorarios_parcelas_qtd', this.value)">
        </label>
        <label class="kit-field">
          <span>1ª parcela: valor (R$)</span>
          <input type="number" min="0" step="0.01" value="${escapeAttr(d.honorarios_primeira_parcela_valor)}"
                 onchange="onKitChange('honorarios_primeira_parcela_valor', this.value)"
                 placeholder="500.00">
        </label>
        <label class="kit-field">
          <span>1ª parcela: data</span>
          <input type="date" value="${escapeAttr(d.honorarios_primeira_parcela_data)}"
                 onchange="onKitChange('honorarios_primeira_parcela_data', this.value)">
        </label>
      `;
    default:
      return '<div class="kit-hint">Modalidade desconhecida.</div>';
  }
}

/* =========================================================================
   HANDLERS — todos atualizam state.dadosKit e re-renderizam o necessário
   ========================================================================= */
function onKitChange(field, value) {
  state.dadosKit[field] = value;
  // Sem re-render — input mantém foco e valor atualizado vai pro state.
}

function onKitGeneroChange(value) {
  state.dadosKit.cliente_genero = value;
  // Atualiza nacionalidade default se ainda estiver no valor anterior.
  const novaNac = FLEXOES_GENERO[value].nacionalidade_default;
  const nacAtual = state.dadosKit.cliente_nacionalidade;
  if (nacAtual === 'brasileiro' || nacAtual === 'brasileira' || nacAtual === '') {
    state.dadosKit.cliente_nacionalidade = novaNac;
  }
  render();
}

function onKitCausaTipoChange(value) {
  state.dadosKit.causa_tipo = value;
  // Reseta motivo (presets diferentes por tipo).
  state.dadosKit.causa_motivo = '';
  state.dadosKit.causa_motivo_outro = '';
  render();
}

function onKitMotivoChange(value) {
  state.dadosKit.causa_motivo = value;
  render();
}

function onKitReuChange(idx, value) {
  state.dadosKit.causa_reus[idx] = value;
}

function onKitReuAdd() {
  state.dadosKit.causa_reus.push('');
  render();
}

function onKitReuRemove(idx) {
  if (state.dadosKit.causa_reus.length <= 1) return;
  state.dadosKit.causa_reus.splice(idx, 1);
  render();
}

/* =========================================================================
   GERAÇÃO — monta contrato + procuração e vai pra tela final
   ========================================================================= */
async function gerarKitPecas() {
  const erro = validarDadosKit();
  if (erro) {
    alert(erro);
    return;
  }

  // Envia pre-cliente pro aw-eco-me IMEDIATAMENTE ao clicar em GERAR
  // (antes da geracao dos DOCX, que demora alguns segundos). Fire-and-forget.
  console.log('[pre-cliente/kit] GERAR clicado, disparando salvarPreCliente. tipo:', typeof salvarPreCliente);
  if (typeof salvarPreCliente === 'function') {
    salvarPreCliente()
      .then(r => console.log('[pre-cliente/kit] resultado:', r))
      .catch(e => console.error('[pre-cliente/kit] excecao:', e));
  } else {
    console.error('[pre-cliente/kit] funcao salvarPreCliente nao carregada!');
  }

  state.tela = 'gerando';
  const animacao = rodarAnimacaoGeracao('peca');
  try {
    const ctxContrato = montarContextoKit({ tipoPeca: 'contrato' });
    const ctxProcuracao = montarContextoKit({ tipoPeca: 'procuracao' });
    const contratoBlob = await montarKitDocxNoNavegador(
      resolverTemplateContratoPorModalidade(state.modalidadeSelecionada.id),
      ctxContrato
    );
    const procuracaoBlob = await montarKitDocxNoNavegador(
      resolverTemplateProcuracao(),
      ctxProcuracao
    );
    state.arquivoKitContrato = contratoBlob;
    state.arquivoKitProcuracao = procuracaoBlob;

    await animacao;
    navegarPara('kitDone');
  } catch (err) {
    console.error('Erro gerando peças do kit:', err);
    alert('Erro ao gerar peças: ' + err.message);
    navegarPara('pacoteKit');
  }
}

function validarDadosKit() {
  const d = state.dadosKit;
  // RG / orgão expedidor são opcionais — se vierem vazios, a qualificação do
  // contrato omite o bloco do RG inteiro (mantém só o CPF).
  const obrigatorios = [
    ['cliente_nome_completo', 'Nome do cliente'],
    ['cliente_estado_civil', 'Estado civil'],
    ['cliente_profissao', 'Profissão'],
    ['cliente_cpf', 'CPF'],
    ['cliente_endereco_completo', 'Endereço'],
    ['cliente_whatsapp', 'WhatsApp do cliente'],
    ['contrato_cidade_assinatura', 'Cidade'],
    ['contrato_data_assinatura', 'Data da assinatura'],
  ];
  for (const [key, label] of obrigatorios) {
    if (!d[key] || !String(d[key]).trim()) return `Preencha: ${label}.`;
  }
  // Validação leve de CPF: precisa ter 11 dígitos (com ou sem máscara).
  const cpfDigits = String(d.cliente_cpf).replace(/\D/g, '');
  if (cpfDigits.length !== 11) return 'CPF deve ter 11 dígitos.';
  // WhatsApp: precisa ter 11 dígitos (DDD + 9 + 8) no formato (XX)XXXXX-XXXX.
  const waDigits = String(d.cliente_whatsapp).replace(/\D/g, '');
  if (waDigits.length !== 11) return 'WhatsApp deve ter 11 dígitos: (XX)XXXXX-XXXX.';
  if (d.causa_tipo === 'ajuizamento') {
    const reusValidos = d.causa_reus.filter(r => r && r.trim());
    if (reusValidos.length === 0) return 'Adicione pelo menos um réu.';
  } else {
    if (!d.causa_numero_processo || !d.causa_numero_processo.trim()) {
      return 'Informe o número do processo (defesa).';
    }
  }
  const motivoFinal = (d.causa_motivo === '__outro') ? d.causa_motivo_outro : d.causa_motivo;
  if (!motivoFinal || !motivoFinal.trim()) return 'Selecione/digite o motivo da causa.';
  return null;
}

function montarContextoKit({ tipoPeca = 'contrato' } = {}) {
  const d = state.dadosKit;
  const flex = FLEXOES_GENERO[d.cliente_genero];
  const motivoFinal = (d.causa_motivo === '__outro') ? d.causa_motivo_outro : d.causa_motivo;
  const nomeUpper = d.cliente_nome_completo.trim().toUpperCase();
  const cpfFormatado = formatarCPF(d.cliente_cpf || '');
  const qualificacao = montarQualificacaoDocumentos(
    { rg: d.cliente_rg, orgaoExpedidor: d.cliente_orgao_expedidor, cpf: cpfFormatado, flexao: flex },
    { incluirRg: tipoPeca === 'contrato' } // procuração nunca inclui RG (segue padrão original)
  );

  const ctx = {
    // Cliente
    cliente_nome_completo: nomeUpper,
    cliente_nacionalidade: d.cliente_nacionalidade.trim(),
    cliente_estado_civil: flexionarEstadoCivil(d.cliente_estado_civil, d.cliente_genero),
    cliente_profissao: d.cliente_profissao.trim(),
    cliente_cpf: cpfFormatado, // usado na assinatura do contrato
    cliente_endereco_completo: d.cliente_endereco_completo.trim(),
    cliente_indicado_a: flex.indicado_a,
    cliente_qualificacao_documentos: qualificacao,
    // Causa — comum
    causa_motivo: motivoFinal.trim(),
    // Assinatura
    contrato_cidade_assinatura: d.contrato_cidade_assinatura.trim(),
    contrato_data_assinatura_extenso: dataExtenso(d.contrato_data_assinatura),
  };

  // Causa — variantes
  if (d.causa_tipo === 'ajuizamento') {
    const reus = d.causa_reus.map(r => r.trim()).filter(Boolean);
    const isPlural = reus.length > 1;
    ctx.causa_em_desfavor_prefixo = isPlural ? 'em desfavor das empresas' : 'em desfavor da empresa';
    ctx.causa_partes_reqs = reus.join(' E ');
  } else {
    ctx.causa_numero_processo = d.causa_numero_processo.trim();
  }

  // Honorários — varia por modalidade
  const modId = state.modalidadeSelecionada.id;
  if (modId === 'exito') {
    ctx.honorarios_percentual_exito = formatarPercentual(d.honorarios_percentual_exito);
  } else if (modId === 'exito_final') {
    ctx.honorarios_valor_inicial_formatado = formatarBRL(d.honorarios_valor_inicial);
    ctx.honorarios_percentual_exito = formatarPercentual(d.honorarios_percentual_exito);
  } else if (modId === 'final') {
    ctx.honorarios_valor_inicial_formatado = formatarBRL(d.honorarios_valor_inicial);
  } else if (modId === 'exito_parcelado') {
    const total = parseFloat(d.honorarios_valor_total) || 0;
    const qtd = parseInt(d.honorarios_parcelas_qtd, 10) || 2;
    const primeira = parseFloat(d.honorarios_primeira_parcela_valor) || 0;
    const demaisValor = qtd > 1 ? (total - primeira) / (qtd - 1) : 0;
    ctx.honorarios_valor_total_formatado = formatarBRL(d.honorarios_valor_total);
    ctx.honorarios_parcelas_qtd_extenso = numeroExtenso(qtd);
    ctx.honorarios_primeira_parcela_valor_formatado = formatarBRL(d.honorarios_primeira_parcela_valor);
    ctx.honorarios_primeira_parcela_data_extenso = dataExtensoCurta(d.honorarios_primeira_parcela_data);
    ctx.honorarios_demais_parcela_valor_formatado = formatarBRL(demaisValor.toFixed(2));
    ctx.honorarios_dia_vencimento_mensal = diaDoMes(d.honorarios_primeira_parcela_data);
  }

  return ctx;
}

async function montarKitDocxNoNavegador(templateVarName, contexto) {
  if (typeof PizZip === 'undefined') throw new Error('PizZip não carregou.');
  if (typeof window.docxtemplater === 'undefined') throw new Error('Docxtemplater não carregou.');
  const DocxtemplaterClass = window.docxtemplater;

  // Lookup do template — const globais em scripts soltos NÃO viram window.X,
  // então usamos eval restrito ao nome conhecido (defesa contra injeção:
  // só aceita os 5 nomes que cadastramos no mapa acima).
  const TEMPLATES_PERMITIDOS = {
    TEMPLATE_KIT_CONTRATO_EXITO_B64: typeof TEMPLATE_KIT_CONTRATO_EXITO_B64 !== 'undefined' ? TEMPLATE_KIT_CONTRATO_EXITO_B64 : null,
    TEMPLATE_KIT_CONTRATO_EXITO_INICIAL_B64: typeof TEMPLATE_KIT_CONTRATO_EXITO_INICIAL_B64 !== 'undefined' ? TEMPLATE_KIT_CONTRATO_EXITO_INICIAL_B64 : null,
    TEMPLATE_KIT_CONTRATO_FINAL_B64: typeof TEMPLATE_KIT_CONTRATO_FINAL_B64 !== 'undefined' ? TEMPLATE_KIT_CONTRATO_FINAL_B64 : null,
    TEMPLATE_KIT_CONTRATO_PARCELADO_B64: typeof TEMPLATE_KIT_CONTRATO_PARCELADO_B64 !== 'undefined' ? TEMPLATE_KIT_CONTRATO_PARCELADO_B64 : null,
    TEMPLATE_KIT_PROCURACAO_B64: typeof TEMPLATE_KIT_PROCURACAO_B64 !== 'undefined' ? TEMPLATE_KIT_PROCURACAO_B64 : null,
    // Diego: 4 contratos com signature CONTRATADO trocada (procuração reusa Matheus)
    TEMPLATE_KIT_CONTRATO_EXITO_DIEGO_B64: typeof TEMPLATE_KIT_CONTRATO_EXITO_DIEGO_B64 !== 'undefined' ? TEMPLATE_KIT_CONTRATO_EXITO_DIEGO_B64 : null,
    TEMPLATE_KIT_CONTRATO_EXITO_INICIAL_DIEGO_B64: typeof TEMPLATE_KIT_CONTRATO_EXITO_INICIAL_DIEGO_B64 !== 'undefined' ? TEMPLATE_KIT_CONTRATO_EXITO_INICIAL_DIEGO_B64 : null,
    TEMPLATE_KIT_CONTRATO_FINAL_DIEGO_B64: typeof TEMPLATE_KIT_CONTRATO_FINAL_DIEGO_B64 !== 'undefined' ? TEMPLATE_KIT_CONTRATO_FINAL_DIEGO_B64 : null,
    TEMPLATE_KIT_CONTRATO_PARCELADO_DIEGO_B64: typeof TEMPLATE_KIT_CONTRATO_PARCELADO_DIEGO_B64 !== 'undefined' ? TEMPLATE_KIT_CONTRATO_PARCELADO_DIEGO_B64 : null,
    TEMPLATE_KIT_PROCURACAO_DIEGO_B64: typeof TEMPLATE_KIT_PROCURACAO_DIEGO_B64 !== 'undefined' ? TEMPLATE_KIT_PROCURACAO_DIEGO_B64 : null,
  };
  const b64 = TEMPLATES_PERMITIDOS[templateVarName];
  if (!b64) throw new Error('Template não encontrado: ' + templateVarName);

  const buffer = base64ParaArrayBuffer(b64);
  const zip = new PizZip(buffer);
  const doc = new DocxtemplaterClass(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(contexto);

  // Sanitização de twips fracionários (mesmo problema do docx.js do produto 1)
  const zipFinal = doc.getZip();
  const reFracao = /(\sw:[A-Za-z]+=")(-?\d+)\.\d+(")/g;
  Object.keys(zipFinal.files).forEach((nome) => {
    if (!/\.xml$/i.test(nome)) return;
    const arq = zipFinal.file(nome);
    if (!arq || arq.dir) return;
    const orig = arq.asText();
    const corrigido = orig.replace(reFracao, '$1$2$3');
    if (corrigido !== orig) zipFinal.file(nome, corrigido);
  });

  return zipFinal.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}

/* =========================================================================
   HELPERS — formatação BRL, data por extenso, número por extenso
   ========================================================================= */
function formatarWhatsapp(s) {
  // Devolve no formato (XX)XXXXX-XXXX (celular BR, 11 dígitos). Máscara
  // progressiva enquanto digita.
  const digits = String(s || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
  return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatarCPF(s) {
  // Aceita qualquer string e devolve no formato 000.000.000-00.
  // Aplica máscara progressivamente enquanto o usuário digita.
  const digits = String(s || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * Monta o trecho "[portador(a) do RG nº NNN ÓRGÃO, ]inscrito(a) no CPF
 * sob o nº NNN.NNN.NNN-NN". Se RG vazio, omite o bloco do RG inteiro,
 * mantendo a gramática limpa.
 *   incluirRg=false força a omissão (usado pela procuração).
 */
function montarQualificacaoDocumentos({ rg, orgaoExpedidor, cpf, flexao }, { incluirRg = true } = {}) {
  const rgTrim = (rg || '').trim();
  const orgaoTrim = (orgaoExpedidor || '').trim();
  const cpfFmt = formatarCPF(cpf || '');
  const blocoRg = (incluirRg && rgTrim)
    ? `${flexao.portador_a} do RG nº ${rgTrim}${orgaoTrim ? ' ' + orgaoTrim : ''}, `
    : '';
  return `${blocoRg}${flexao.inscrito_a} no CPF sob o nº ${cpfFmt}`;
}

function formatarBRL(valor) {
  if (valor === '' || valor === null || valor === undefined) return 'R$ 0,00';
  const num = typeof valor === 'number' ? valor : parseFloat(String(valor).replace(',', '.'));
  if (isNaN(num)) return 'R$ 0,00';
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarPercentual(valor) {
  if (!valor) return '0%';
  const s = String(valor).trim();
  return s.endsWith('%') ? s : `${s}%`;
}

const MESES_PT = [
  'janeiro','fevereiro','março','abril','maio','junho',
  'julho','agosto','setembro','outubro','novembro','dezembro'
];

function dataExtenso(yyyyMmDd) {
  if (!yyyyMmDd) return '';
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  if (!y || !m || !d) return yyyyMmDd;
  return `${d} de ${MESES_PT[m-1]} de ${y}`;
}

function dataExtensoCurta(yyyyMmDd) {
  // Para "dia 5 de abril de 2026" — formato amigável dentro de parênteses
  return dataExtenso(yyyyMmDd);
}

function diaDoMes(yyyyMmDd) {
  if (!yyyyMmDd) return '';
  const partes = yyyyMmDd.split('-');
  return partes[2] ? String(parseInt(partes[2], 10)) : '';
}

const NUMEROS_EXTENSO = [
  '', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete',
  'oito', 'nove', 'dez', 'onze', 'doze'
];

function numeroExtenso(n) {
  return NUMEROS_EXTENSO[n] || String(n);
}

/* =========================================================================
   DONE — tela final com 2 cards de download (contrato + procuração)
   ========================================================================= */
function renderKitDone(view) {
  const p = state.produtoSelecionado || {};
  const modalidade = state.modalidadeSelecionada || {};
  const nome = (state.dadosKit && state.dadosKit.cliente_nome_completo) || 'Cliente';
  const hasImage = p.capa && p.capa.length > 0;
  const coverStyle = hasImage ? `background-image: url('${p.capa}')` : '';
  const coverClass = hasImage ? 'has-image' : 'placeholder';
  const checkSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
  const downloadSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>`;

  const cardContrato = `
    <div class="done-peca-col">
      <div class="done-product-card">
        <div class="done-seal-stamp">${checkSvg}</div>
        <div class="product-card done-embedded-card">
          <div class="product-cover ${coverClass}" style="${coverStyle}">
            ${!hasImage ? `<div class="product-cover-mark">C</div>` : ''}
          </div>
          <div class="product-content">
            <div class="product-top"></div>
            <div class="product-bottom">
              <div class="product-reu">CONTRATO</div>
              <div class="product-title">${escapeHtml(modalidade.nome || 'Honorários')}</div>
              <div class="product-sub">${escapeHtml(modalidade.tagline || p.nome || 'Representação')}</div>
            </div>
          </div>
        </div>
      </div>
      <button class="btn btn-primary done-btn-primary done-peca-btn" onclick="baixarKitContrato()">
        ${downloadSvg}
        <span>Baixar contrato</span>
      </button>
    </div>
  `;

  const cardProcuracao = `
    <div class="done-peca-col">
      <div class="done-product-card">
        <div class="done-seal-stamp">${checkSvg}</div>
        <div class="product-card done-embedded-card">
          <div class="product-cover ${coverClass}" style="${coverStyle}">
            ${!hasImage ? `<div class="product-cover-mark">P</div>` : ''}
          </div>
          <div class="product-content">
            <div class="product-top"></div>
            <div class="product-bottom">
              <div class="product-reu">PROCURAÇÃO</div>
              <div class="product-title">Hipossuficiência</div>
              <div class="product-sub">Procuração unificada com declaração</div>
            </div>
          </div>
        </div>
      </div>
      <button class="btn btn-primary done-btn-primary done-peca-btn" onclick="baixarKitProcuracao()">
        ${downloadSvg}
        <span>Baixar procuração</span>
      </button>
    </div>
  `;

  view.innerHTML = `
    <div class="done-page">
      <div class="done-hero">
        <div class="done-eyebrow">Peças jurídicas entregues</div>

        <div class="done-pecas-grid">
          ${cardContrato}
          ${cardProcuracao}
        </div>

        <div class="done-meta-line">
          <span class="done-requerente-name">${escapeHtml(nome)}</span>
          <span class="done-meta-sep">·</span>
          <span class="done-meta-item">${new Date().toLocaleDateString('pt-BR')}</span>
        </div>

        <div class="done-actions-row">
          <button class="done-ghost-btn" onclick="navegarPara('lobby')" title="Voltar ao lobby de produtos">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5L12 3l9 6.5V20a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2V9.5z"/></svg>
            <span>Ir ao lobby</span>
          </button>
          <button class="done-ghost-btn" onclick="novoKitMesmaModalidade()" title="Outro cliente, mesma modalidade do kit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span>Outra do mesmo produto</span>
          </button>
          <button class="done-ghost-btn" onclick="novaPecaMesmoClienteKit()" title="Outra peça reaproveitando os dados deste cliente, escolhendo outro produto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/><path d="M19 4l2 2-2 2M21 6h-6"/></svg>
            <span>Outra do mesmo cliente</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Snapshota os dados do cliente do kit atual em state.clienteParaReaproveitar
 * e abre o lobby. Quando o adv escolher qualquer produto, selecionarProduto
 * consome o snapshot e leva pro fluxo certo com cliente já preenchido.
 */
function novaPecaMesmoClienteKit() {
  const d = state.dadosKit || {};
  state.clienteParaReaproveitar = {
    nome_completo: d.cliente_nome_completo || '',
    genero: d.cliente_genero || 'masculino',
    nacionalidade: d.cliente_nacionalidade || '',
    estado_civil: d.cliente_estado_civil || '',
    profissao: d.cliente_profissao || '',
    rg: d.cliente_rg || '',
    orgao_expedidor: d.cliente_orgao_expedidor || '',
    cpf: d.cliente_cpf || '',
    endereco_completo: d.cliente_endereco_completo || '',
  };
  state.arquivoKitContrato = null;
  state.arquivoKitProcuracao = null;
  navegarPara('lobby');
}

function nomeArquivoKit(sufixo) {
  const nome = (state.dadosKit && state.dadosKit.cliente_nome_completo || 'cliente')
    .replace(/\s+/g, '_').toLowerCase();
  return `kit_${nome}_${sufixo}_${Date.now()}.docx`;
}

function baixarKitContrato() {
  if (!state.arquivoKitContrato) { alert('Contrato não disponível.'); return; }
  baixarBlob(state.arquivoKitContrato, nomeArquivoKit('contrato'));
}

function baixarKitProcuracao() {
  if (!state.arquivoKitProcuracao) { alert('Procuração não disponível.'); return; }
  baixarBlob(state.arquivoKitProcuracao, nomeArquivoKit('procuracao'));
}

function baixarBlob(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

function novoKitMesmaModalidade() {
  // Mantém produto + modalidade, reseta os dados do cliente/causa/honorários.
  state.dadosKit = inicializarDadosKit();
  state.arquivoKitContrato = null;
  state.arquivoKitProcuracao = null;
  navegarPara('pacoteKit');
}

/* =========================================================================
   Helpers de escape (compartilhados com render.js)
   ========================================================================= */
function escapeAttr(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
