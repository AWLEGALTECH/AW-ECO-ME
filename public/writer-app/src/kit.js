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
  // Cliente da base guarda o endereço como texto único: separa (best-effort) nas
  // partes novas pra o formulário e a busca por CEP funcionarem.
  if (c.endereco_completo && String(c.endereco_completo).trim()) {
    const p = _parseEnderecoKit(c.endereco_completo);
    setIf('cliente_end_cep',         p.cep);
    setIf('cliente_end_logradouro',  p.logradouro);
    setIf('cliente_end_numero',      p.numero);
    setIf('cliente_end_bairro',      p.bairro);
    setIf('cliente_end_municipio',   p.municipio);
  }
  setIf('cliente_comarca',          c.comarca);
  setIf('cliente_uf',               c.uf);
  setIf('cliente_whatsapp',         c.telefone ? formatarWhatsapp(c.telefone) : '');
  state.dadosKit.cliente_aw_id = c.aw_id || '';
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

// Handler do dropdown de análise comercial (pré-análise do Finder).
// Preenche nome + CPF e guarda a análise escolhida (com as rubricas marcadas
// como não ajuizáveis) pra referência posterior na peça.
function onKitSelectAnaliseComercial(id) {
  if (!id || !state.dadosKit) return;
  const a = (state.analisesComerciais || []).find(x => String(x.id) === String(id));
  if (!a) return;
  const setIf = (k, v) => { if (v !== undefined && v !== null && String(v).trim() !== '') state.dadosKit[k] = v; };
  setIf('cliente_nome_completo', a.nome);
  if (a.cpf_cnpj && typeof formatarCPF === 'function') setIf('cliente_cpf', formatarCPF(a.cpf_cnpj));
  else setIf('cliente_cpf', a.cpf_cnpj);
  state.dadosKit.analise_comercial_id = a.id;
  state.dadosKit._analise_comercial = a; // rubricas {rubrica, valor, bloqueada, motivo}
  // Passou pela análise comercial => veio do Finder, que é exclusivo Bradesco.
  // Já preenche o réu (só se ainda não houver um réu digitado).
  const reusAtuais = (state.dadosKit.causa_reus || []).map(r => (r || '').trim()).filter(Boolean);
  if (reusAtuais.length === 0) state.dadosKit.causa_reus = ['BANCO BRADESCO S.A.'];
  if (typeof render === 'function') render();
}

/* ── Endereço estruturado + autopreenchimento por CEP ─────────────────────────
   Campos: CEP · Logradouro · Número · Complemento · Bairro · Município · UF.
   Ao completar o CEP, busca no ViaCEP (fallback BrasilAPI) e preenche logradouro,
   bairro, município e UF. O endereco_completo (usado nas peças/pré-cliente/ficha)
   é RECOMPOSTO das partes, então nada downstream muda. */

// Recompõe o endereço completo a partir das partes (omite as vazias).
function recomporEnderecoKit() {
  const d = state.dadosKit; if (!d) return;
  const log = (d.cliente_end_logradouro || '').trim();
  const num = (d.cliente_end_numero || '').trim();
  const comp = (d.cliente_end_complemento || '').trim();
  const bairro = (d.cliente_end_bairro || '').trim();
  const mun = (d.cliente_end_municipio || '').trim();
  const uf = (d.cliente_uf || '').trim();
  const cep = (d.cliente_end_cep || '').trim();
  const linha1 = [log, num ? 'nº ' + num : '', comp].filter(Boolean).join(', ');
  const cidade = [mun, uf].filter(Boolean).join('/');
  d.cliente_endereco_completo = [linha1, bairro, cidade, cep ? 'CEP ' + cep : '']
    .filter(Boolean).join(', ');
}

// onChange dos campos de endereço → grava a parte e recompõe.
function onKitEndChange(k, v) {
  if (!state.dadosKit) return;
  state.dadosKit[k] = v;
  recomporEnderecoKit();
}

// Máscara do CEP (00000-000) + dispara a busca ao completar 8 dígitos.
function onKitCepInput(el) {
  const dig = el.value.replace(/\D/g, '').slice(0, 8);
  const masked = dig.length > 5 ? dig.slice(0, 5) + '-' + dig.slice(5) : dig;
  el.value = masked;
  if (state.dadosKit) state.dadosKit.cliente_end_cep = masked;
  recomporEnderecoKit();
  if (dig.length === 8) buscarCepKit();
}

// Busca o CEP (ViaCEP → BrasilAPI) e preenche os campos, sem re-render (atualiza
// o DOM direto pra não perder o foco).
async function buscarCepKit() {
  const d = state.dadosKit; if (!d) return;
  const cep = String(d.cliente_end_cep || '').replace(/\D/g, '');
  const status = document.getElementById('kitCepStatus');
  const setStatus = (txt, cor) => { if (status) { status.textContent = txt; status.style.color = cor; } };
  if (cep.length !== 8) return;
  setStatus('Buscando CEP…', 'var(--text-mute)');

  const aplicar = (info) => {
    const set = (id, key, val) => {
      if (val == null || String(val).trim() === '') return;
      d[key] = val;
      const el = document.getElementById(id);
      if (el) el.value = val;
    };
    set('kitEndLogradouro', 'cliente_end_logradouro', info.logradouro);
    set('kitEndBairro', 'cliente_end_bairro', info.bairro);
    set('kitEndMunicipio', 'cliente_end_municipio', info.municipio);
    set('kitClienteUf', 'cliente_uf', (info.uf || '').toUpperCase());
    recomporEnderecoKit();
    const numEl = document.getElementById('kitEndNumero');
    if (numEl) numEl.focus();
    setStatus('Endereço preenchido pelo CEP ✓', '#34d399');
  };

  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (r.ok) {
      const j = await r.json();
      if (j && !j.erro) {
        aplicar({ logradouro: j.logradouro, bairro: j.bairro, municipio: j.localidade, uf: j.uf });
        return;
      }
    }
    throw new Error('viacep-miss');
  } catch (_e) {
    try {
      const r2 = await fetch(`https://brasilapi.com.br/api/v1/cep/${cep}`);
      if (r2.ok) {
        const j2 = await r2.json();
        aplicar({ logradouro: j2.street, bairro: j2.neighborhood, municipio: j2.city, uf: j2.state });
        return;
      }
    } catch (_e2) { /* ignora, cai no aviso */ }
    setStatus('CEP não encontrado — preencha na mão.', '#f59e0b');
  }
}

// Parse best-effort do endereço antigo (cliente da base) pras partes novas.
function _parseEnderecoKit(str) {
  const out = { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', municipio: '' };
  if (!str) return out;
  let s = String(str);
  const cepM = s.match(/(\d{5}-?\d{3})/);
  if (cepM) { out.cep = cepM[1].replace(/^(\d{5})-?(\d{3})$/, '$1-$2'); s = s.replace(/,?\s*CEP\s*/i, ' ').replace(cepM[1], ' '); }
  const numM = s.match(/n[ºo°\.]?\s*(\d+)/i);
  if (numM) { out.numero = numM[1]; s = s.replace(numM[0], ' '); }
  out.logradouro = s.replace(/\s{2,}/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '').replace(/,\s*,/g, ', ');
  return out;
}

function inicializarDadosKit() {
  return {
    // Cliente
    origem_cliente: '',
    cliente_aw_id: '',
    analise_comercial_id: '',
    cliente_nome_completo: '',
    cliente_genero: '',
    cliente_nacionalidade: 'brasileiro',
    cliente_estado_civil: '',
    cliente_profissao: '',
    cliente_rg: '',
    cliente_orgao_expedidor: '',
    cliente_cpf: '',
    cliente_endereco_completo: '',
    // Endereço estruturado (o CEP autopreenche logradouro/bairro/município/UF).
    cliente_end_cep: '',
    cliente_end_logradouro: '',
    cliente_end_numero: '',
    cliente_end_complemento: '',
    cliente_end_bairro: '',
    cliente_end_municipio: '',
    cliente_comarca: '',
    cliente_uf: '',
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
    // Data da assinatura já vem com HOJE (data local, formato YYYY-MM-DD do
    // input type=date). O advogado pode trocar se assinar em outro dia.
    contrato_data_assinatura: kitHojeISO(),
  };
}

// Data de hoje em YYYY-MM-DD pela hora LOCAL (não usa toISOString pra não
// pular um dia perto da meia-noite no fuso do Brasil).
function kitHojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Bloco de origem do cliente no formulário — resumo da escolha feita nas telas
// anteriores (cards de origem + lista de seleção). A seleção em si acontece na
// página 'selecaoCliente'; aqui só confirmamos e oferecemos 'trocar origem'.
function renderKitBlocoOrigem(d) {
  const origem = d.origem_cliente || '';
  const trocar = `<button type="button" class="btn-link kit-fonte-trocar" onclick="navegarPara('origemCliente')">trocar origem</button>`;
  const nome = (d.cliente_nome_completo || '').trim();

  let titulo = 'Origem do cliente';
  let hint = '';
  if (origem === 'analise') {
    titulo = 'Análise comercial (Finder)';
    hint = nome ? `Selecionada: <strong>${escapeHtml(nome)}</strong>` : 'Nenhuma análise selecionada. Use “trocar origem”.';
  } else if (origem === 'base') {
    titulo = 'Cliente da base';
    hint = nome ? `Selecionado: <strong>${escapeHtml(nome)}</strong>` : 'Nenhum cliente selecionado. Use “trocar origem”.';
  } else if (origem === 'zero') {
    titulo = 'Cadastro do zero';
    hint = 'Preencha os dados do cliente abaixo.';
  } else {
    hint = 'Escolha de onde vem o cliente.';
  }

  return `
    <div class="kit-fonte-cliente">
      <div class="kit-fonte-title"><span>${titulo}</span>${trocar}</div>
      <div class="kit-fonte-hint">${hint}</div>
    </div>`;
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

  // Opções de análise comercial (pré-análise do Finder)
  const analises = (state.analisesComerciais || []);
  const optionsAnalises = analises.map(a => {
    const n = Array.isArray(a.rubricas) ? a.rubricas.length : 0;
    const bloq = Array.isArray(a.rubricas) ? a.rubricas.filter(r => r && r.bloqueada).length : 0;
    const label = `${a.nome || 'sem nome'} · ${n} rubrica(s)${bloq ? ` · ${bloq} não ajuizável(is)` : ''}`;
    return `<option value="${escapeAttr(a.id)}" ${d.analise_comercial_id===a.id?'selected':''}>${escapeHtml(label)}</option>`;
  }).join('');

  // Comarcas já cadastradas (datalist) — autocomplete: o advogado digita e,
  // se outra ficha já tem aquela comarca, aparece pra clicar. Campo livre.
  const optionsComarcas = [...new Set(
    clientes.map(c => (c.comarca || '').toString().trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'pt-BR'))
   .map(c => `<option value="${escapeAttr(c)}"></option>`).join('');

  view.innerHTML = `
    <div class="kit-form-page">
      <div class="kit-form-header">
        <div class="kit-form-eyebrow">${escapeHtml(produto.nome)} · ${escapeHtml(modalidade.nome)}</div>
        <h1>Dados do contrato</h1>
        <div class="kit-form-sub">Preencha em uma tela só. Gera <strong>contrato + procuração</strong> ao final.</div>
      </div>

      <!-- ===== BLOCO: resumo da origem do cliente (escolhida nas telas anteriores) ===== -->
      ${renderKitBlocoOrigem(d)}

      <div class="kit-form-grid">
        <!-- ============== CLIENTE ============== -->
        <section class="kit-section">
          <div class="kit-section-title">Cliente</div>
          <div class="kit-fields kit-fields-cliente">
            <label class="kit-field span-3">
              <span>Nome completo</span>
              <input type="text" value="${escapeAttr(d.cliente_nome_completo)}"
                     onchange="onKitChange('cliente_nome_completo', this.value)"
                     placeholder="JOÃO DA SILVA SAUR0">
            </label>
            <label class="kit-field">
              <span>Gênero</span>
              <select onchange="onKitGeneroChange(this.value)">
                <option value="">Selecione…</option>
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

            <!-- ENDEREÇO — CEP isolado no topo (preencha primeiro: autocompleta o resto) -->
            <div class="kit-endereco-titulo span-3">Endereço</div>
            <label class="kit-field span-3">
              <span>CEP <em class="kit-hint">preencha primeiro — completa o endereço sozinho</em></span>
              <input type="text" id="kitEndCep" value="${escapeAttr(d.cliente_end_cep)}"
                     oninput="onKitCepInput(this)"
                     placeholder="00000-000" inputmode="numeric" maxlength="9" autocomplete="off">
              <span id="kitCepStatus" class="kit-hint" style="display:block;min-height:13px"></span>
            </label>
            <label class="kit-field span-2">
              <span>Logradouro</span>
              <input type="text" id="kitEndLogradouro" value="${escapeAttr(d.cliente_end_logradouro)}"
                     onchange="onKitEndChange('cliente_end_logradouro', this.value)"
                     placeholder="Rua / Avenida ...">
            </label>
            <label class="kit-field">
              <span>Número</span>
              <input type="text" id="kitEndNumero" value="${escapeAttr(d.cliente_end_numero)}"
                     onchange="onKitEndChange('cliente_end_numero', this.value)"
                     placeholder="123">
            </label>
            <label class="kit-field">
              <span>Bairro</span>
              <input type="text" id="kitEndBairro" value="${escapeAttr(d.cliente_end_bairro)}"
                     onchange="onKitEndChange('cliente_end_bairro', this.value)"
                     placeholder="Centro">
            </label>
            <label class="kit-field">
              <span>Município</span>
              <input type="text" id="kitEndMunicipio" value="${escapeAttr(d.cliente_end_municipio)}"
                     onchange="onKitEndChange('cliente_end_municipio', this.value)"
                     placeholder="Manaus">
            </label>
            <label class="kit-field">
              <span>Estado (UF) <em class="kit-hint">do endereço</em></span>
              <input type="text" id="kitClienteUf" maxlength="2" value="${escapeAttr(d.cliente_uf)}"
                     oninput="this.value = this.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,2); onKitEndChange('cliente_uf', this.value)"
                     onchange="onKitEndChange('cliente_uf', this.value)"
                     placeholder="AM">
            </label>
            <label class="kit-field">
              <span>Complemento <em class="kit-hint">opcional</em></span>
              <input type="text" id="kitEndComplemento" value="${escapeAttr(d.cliente_end_complemento)}"
                     onchange="onKitEndChange('cliente_end_complemento', this.value)"
                     placeholder="Apto, bloco, casa...">
            </label>

            <!-- Foro + contato (não fazem parte do endereço do cliente) -->
            <label class="kit-field span-2">
              <span>Comarca / foro <em class="kit-hint">cidade do juízo — usada no protocolo</em></span>
              <input type="text" list="kit-comarcas" value="${escapeAttr(d.cliente_comarca)}"
                     onchange="onKitChange('cliente_comarca', this.value)"
                     placeholder="Ex.: Manaus">
              <datalist id="kit-comarcas">${optionsComarcas}</datalist>
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
        <button class="btn btn-primary" onclick="prosseguirDoKitForm()">Continuar →</button>
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
  // Se voltar pra "Selecione…" (vazio), não mexe na nacionalidade.
  const flex = FLEXOES_GENERO[value];
  if (flex) {
    const nacAtual = state.dadosKit.cliente_nacionalidade;
    if (nacAtual === 'brasileiro' || nacAtual === 'brasileira' || nacAtual === '') {
      state.dadosKit.cliente_nacionalidade = flex.nacionalidade_default;
    }
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
/* =========================================================================
   SINALIZAÇÃO DE DESCONTOS AJUIZÁVEIS — tela após o formulário, nos caminhos
   "cadastro do zero" e "cliente da base" (que não vêm de análise comercial do
   Finder). O usuário marca quais descontos aquele instrumento procuratório
   contesta. Assim TODO pré-cliente tem seus descontos apontados, mesmo sem
   pré-análise Bradesco. Grava em state.dadosKit._analise_comercial no MESMO
   formato do Finder ({rubrica, valor, bloqueada}), de modo que o eco (card do
   pré-cliente + lançamento automático em Fechamentos) já entende sem mudanças.
   ========================================================================= */
const DESCONTOS_KIT = [
  'RMC - Reserva de Margem Consignável',
  'RCC - Reserva de Cartão de Crédito',
  'Cesta de tarifas',
  'Mora',
  'Juros abusivos',
  'SVA',
  'Título de capitalização',
  'Gasto com cartão de crédito',
  'Cobrança indevida',
  'Vida / Previdência',
  'Seguro',
  'Anuidade',
  'Baixa antecipada de financiamento',
  'Parcela de crédito pessoal',
  'Emissão de extrato',
  'Saque em terminal',
  'Adicional do depositante',
  'Refinanciamento indevido',
  'Reorganização financeira',
  'Encargos por descoberto',
  'Encargos em excesso',
];

// Rota do botão "Continuar" do formulário do kit. Valida e decide o caminho:
// quem veio de análise comercial do Finder já tem rubricas → gera direto;
// os demais (zero/base) passam pela sinalização de descontos.
function prosseguirDoKitForm() {
  const erro = validarDadosKit();
  if (erro) { alert(erro); return; }
  const d = state.dadosKit || {};
  const ac = d._analise_comercial;
  const temFinder = ac && ac.origem !== 'writer_manual'
    && Array.isArray(ac.rubricas) && ac.rubricas.length > 0;
  if (temFinder) { gerarKitPecas(); return; }
  navegarPara('kitDescontos');
}

// Lista das rubricas atreladas ao pré-cliente. Cada item = { rubrica, detalhe }.
// Permite a MESMA rubrica mais de uma vez (ex.: um seguro por banco). Migra do
// formato antigo (_descontos_sel objeto + _descontos_outros array), se existir.
function _kitLista() {
  const d = state.dadosKit;
  if (!d) return [];
  if (!Array.isArray(d._descontos_lista)) {
    const legado = []
      .concat(Object.keys(d._descontos_sel || {}))
      .concat(d._descontos_outros || []);
    d._descontos_lista = legado.map((l) => ({ rubrica: l, detalhe: '' }));
  }
  return d._descontos_lista;
}
function _kitContagem() {
  const cont = {};
  for (const it of _kitLista()) cont[it.rubrica] = (cont[it.rubrica] || 0) + 1;
  return cont;
}

function renderKitDescontos(view) {
  const produto = state.produtoSelecionado;
  const modalidade = state.modalidadeSelecionada;
  if (!produto || !modalidade || !state.dadosKit) { navegarPara('pacoteKit'); return; }
  _kitLista();

  view.innerHTML = `
    <div class="kit-form-page kit-desc-page">
      <div class="kit-form-header">
        <div class="kit-form-eyebrow">${escapeHtml(produto.nome)} · ${escapeHtml(modalidade.nome)}</div>
        <h1>Descontos <span class="accent">ajuizáveis</span></h1>
        <div class="kit-form-sub">Clique nos descontos que este instrumento contesta — pode adicionar o mesmo <strong>mais de uma vez</strong> (ex.: um seguro por banco). Some os que faltarem em <strong>Outros</strong>.</div>
      </div>

      <section class="kit-section">
        <div class="kit-section-title">Selecione os descontos <span class="kit-desc-counter">(<span id="kitDescCount">0</span>)</span></div>
        <div class="kit-desc-grid" id="kitDescGrid"></div>
      </section>

      <section class="kit-section">
        <div class="kit-section-title">Outros</div>
        <div class="kit-desc-outro-row">
          <input type="text" id="kitDescOutroInput" class="kit-desc-outro-input"
                 placeholder="Digite um desconto que não está na lista e tecle Enter"
                 onkeydown="if(event.key==='Enter'){event.preventDefault();adicionarDescontoOutro();}">
          <button type="button" class="btn btn-ghost" onclick="adicionarDescontoOutro()">Adicionar</button>
        </div>
      </section>

      <section class="kit-section" id="kitDescAtreladasSection">
        <div class="kit-section-title">Rubricas atreladas <span class="kit-desc-counter">(<span id="kitDescAtreladasCount">0</span>)</span></div>
        <div class="kit-desc-atreladas" id="kitDescAtreladas"></div>
      </section>

      <div class="kit-form-actions">
        <button class="btn btn-ghost" onclick="navegarPara('pacoteKit')">← Voltar aos dados</button>
        <button class="btn btn-primary" id="kitDescGerarBtn" onclick="confirmarDescontosEGerar()">Gerar 2 peças →</button>
      </div>
    </div>
  `;
  renderKitDescChips();
  renderKitDescAtreladas();
}

// Grade de descontos do catálogo. Clicar ATRELA uma instância (pode repetir);
// o chip mostra um badge com a quantidade já atrelada daquele desconto.
function renderKitDescChips() {
  const box = document.getElementById('kitDescGrid');
  if (!box) return;
  const cont = _kitContagem();
  box.innerHTML = DESCONTOS_KIT.map((label) => {
    const n = cont[label] || 0;
    return `
      <button type="button" class="kit-desc-chip ${n > 0 ? 'sel' : ''}"
              data-label="${escapeAttr(label)}" onclick="addKitDesconto(this)" title="Clique para atrelar (pode repetir)">
        <span class="kit-desc-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
               stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
        </span>
        <span class="kit-desc-label">${escapeHtml(label)}</span>
        ${n > 0 ? `<span class="kit-desc-badge">${n}</span>` : ''}
      </button>`;
  }).join('');
}

function addKitDesconto(el) {
  const label = el && el.getAttribute('data-label');
  if (!label) return;
  _kitLista().push({ rubrica: label, detalhe: '' });
  renderKitDescChips();
  renderKitDescAtreladas();
}

function adicionarDescontoOutro() {
  const inp = document.getElementById('kitDescOutroInput');
  if (!inp) return;
  const v = (inp.value || '').trim();
  if (!v) return;
  _kitLista().push({ rubrica: v, detalhe: '' });
  inp.value = '';
  inp.focus();
  renderKitDescChips();      // se o "outro" bater com um do catálogo, atualiza o badge
  renderKitDescAtreladas();
}

function removerKitDesconto(idx) {
  const lista = _kitLista();
  if (idx < 0 || idx >= lista.length) return;
  lista.splice(idx, 1);
  renderKitDescChips();
  renderKitDescAtreladas();
}

// Sem re-render: preserva o foco do input enquanto o user digita o detalhe.
function setKitDescDetalhe(idx, valor) {
  const lista = _kitLista();
  if (lista[idx]) lista[idx].detalhe = valor;
}

// Lista EMPILHADA das rubricas atreladas, no mesmo visual verde do card do
// pré-cliente, cada uma com um campo de detalhamento (litigante/banco/etc.).
function renderKitDescAtreladas() {
  const lista = _kitLista();
  const elCount = document.getElementById('kitDescCount');
  if (elCount) elCount.textContent = lista.length;
  const elAtr = document.getElementById('kitDescAtreladasCount');
  if (elAtr) elAtr.textContent = lista.length;
  const box = document.getElementById('kitDescAtreladas');
  if (!box) return;
  if (lista.length === 0) {
    box.innerHTML = `<div class="kit-desc-atreladas-vazio">Clique nos descontos acima para atrelá-los. Eles aparecem aqui empilhados.</div>`;
    return;
  }
  box.innerHTML = lista.map((it, i) => `
    <div class="kit-desc-atrelada">
      <span class="kit-desc-pill">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="kit-desc-pill-ic"><path d="M20 6L9 17l-5-5"/></svg>
        ${escapeHtml(it.rubrica)}
      </span>
      <input type="text" class="kit-desc-detalhe" placeholder="detalhe (ex.: litigante / banco)"
             value="${escapeAttr(it.detalhe || '')}" oninput="setKitDescDetalhe(${i}, this.value)">
      <button type="button" class="kit-desc-atrelada-x" onclick="removerKitDesconto(${i})" aria-label="remover">×</button>
    </div>`).join('');
}

function atualizarContadorDescontos() {
  const n = _kitLista().length;
  const el = document.getElementById('kitDescCount');
  if (el) el.textContent = n;
  const cnt = document.getElementById('kitDescAtreladasCount');
  if (cnt) cnt.textContent = n;
}

function confirmarDescontosEGerar() {
  if (!state.dadosKit) { navegarPara('pacoteKit'); return; }
  const lista = _kitLista();
  if (lista.length === 0) {
    if (!confirm('Nenhum desconto ajuizável atrelado. Continuar mesmo assim?')) return;
  }
  state.dadosKit._analise_comercial = {
    origem: 'writer_manual',
    rubricas: lista.map((it) => ({
      rubrica: it.rubrica,
      detalhe: (it.detalhe || '').trim() || null,
      valor: null, bloqueada: false, motivo: null,
    })),
  };
  gerarKitPecas();
}

async function gerarKitPecas() {
  recomporEnderecoKit();   // garante o endereço composto atualizado das partes
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
    // Antes das peças, mostra a confirmação do que foi criado no sistema
    // (pré-cliente na esteira + pasta no Drive). Dali o user segue pro kitDone.
    navegarPara('kitPreCliente');
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
    ['cliente_genero', 'Gênero'],
    ['cliente_estado_civil', 'Estado civil'],
    ['cliente_profissao', 'Profissão'],
    ['cliente_cpf', 'CPF'],
    ['cliente_end_logradouro', 'Logradouro do endereço'],
    ['cliente_end_numero', 'Número do endereço'],
    ['cliente_end_bairro', 'Bairro'],
    ['cliente_end_municipio', 'Município'],
    ['cliente_comarca', 'Comarca / foro'],
    ['cliente_uf', 'Estado (UF)'],
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
  recomporEnderecoKit();   // endereço composto sempre coerente com as partes
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
/* Tela intermediária pós-geração: confirma que o pré-cliente foi adicionado à
   esteira e lista tudo que foi criado junto (pasta no Drive, contrato,
   procuração). Só depois o user segue pra tela de peças (kitDone). Os dados
   vêm de state.preClienteInfo, alimentado por salvarPreCliente(). */
function renderKitPreCliente(view) {
  const info = state.preClienteInfo || {};
  const nome = info.nome || (state.dadosKit && state.dadosKit.cliente_nome_completo) || 'Cliente';
  const existente = info.status === 'cliente_existente';

  const checkSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>`;
  const folderSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h5l2 3h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>`;
  const spinSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" style="animation:kitspin 0.8s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

  // Estado da pasta no Drive.
  let driveLinha;
  if (existente) {
    driveLinha = `<div class="kitpc-item"><span class="kitpc-ic ok">${checkSvg}</span><div><div class="kitpc-t">Cliente já existente na base</div><div class="kitpc-s">Usa a pasta do Drive que o cliente já possui — dados atualizados.</div></div></div>`;
  } else if (info.driveStatus === 'ok' && info.driveUrl) {
    driveLinha = `<div class="kitpc-item"><span class="kitpc-ic ok">${folderSvg}</span><div><div class="kitpc-t">Pasta criada no Drive <span class="kitpc-badge">Pré-clientes</span></div><div class="kitpc-s"><a href="${escapeHtml(info.driveUrl)}" target="_blank" rel="noopener" class="kitpc-link">Abrir pasta no Drive</a></div></div></div>`;
  } else if (info.driveStatus === 'fail') {
    driveLinha = `<div class="kitpc-item"><span class="kitpc-ic warn">${folderSvg}</span><div><div class="kitpc-t">Pasta no Drive</div><div class="kitpc-s">Será criada quando o cadastro for confirmado na esteira.</div></div></div>`;
  } else {
    driveLinha = `<div class="kitpc-item"><span class="kitpc-ic pend">${spinSvg}</span><div><div class="kitpc-t">Criando pasta no Drive <span class="kitpc-badge">Pré-clientes</span></div><div class="kitpc-s">Um instante…</div></div></div>`;
  }

  let linhaPreCliente;
  if (existente) {
    linhaPreCliente = `<div class="kitpc-item"><span class="kitpc-ic ok">${checkSvg}</span><div><div class="kitpc-t">Dados sincronizados na base</div><div class="kitpc-s">O cadastro do cliente foi atualizado com os dados do kit.</div></div></div>`;
  } else if (info.status === 'error') {
    linhaPreCliente = `<div class="kitpc-item"><span class="kitpc-ic warn">${checkSvg}</span><div><div class="kitpc-t">Pré-cliente não registrado automaticamente</div><div class="kitpc-s">As peças foram geradas. Cadastre o cliente manualmente na esteira, se necessário.</div></div></div>`;
  } else {
    linhaPreCliente = `<div class="kitpc-item"><span class="kitpc-ic ok">${checkSvg}</span><div><div class="kitpc-t">Pré-cliente adicionado à esteira</div><div class="kitpc-s">Aguardando assinatura do contrato pra ser confirmado.</div></div></div>`;
  }

  const eyebrow = existente ? 'Cliente atualizado' : 'Pré-cliente adicionado';
  const titulo = existente ? 'Cadastro atualizado' : 'Pré-cliente adicionado';

  view.innerHTML = `
    <style>
      @keyframes kitspin { to { transform: rotate(360deg); } }
      .kitpc-wrap { max-width: 560px; margin: 0 auto; text-align: center; }
      .kitpc-seal { width: 72px; height: 72px; margin: 0 auto 1.1rem; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        background: var(--violet-bg); border: 1.5px solid var(--violet-border);
        color: var(--violet); box-shadow: 0 0 32px var(--violet-glow); }
      .kitpc-seal svg { width: 34px; height: 34px; }
      .kitpc-nome { font-size: 1.35rem; font-weight: 800; margin-top: .2rem; }
      .kitpc-sub { color: var(--text-ghost, var(--text-dim)); font-size: .9rem; margin-top: .3rem; }
      .kitpc-list { text-align: left; margin: 1.6rem 0 1.4rem; display: flex; flex-direction: column; gap: .55rem; }
      .kitpc-item { display: flex; align-items: flex-start; gap: .7rem; padding: .8rem .9rem;
        border: 1px solid var(--violet-border-soft); border-radius: 12px; background: var(--bg-glass, rgba(255,255,255,0.02)); }
      .kitpc-ic { flex-shrink: 0; width: 26px; height: 26px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
      .kitpc-ic svg { width: 16px; height: 16px; }
      .kitpc-ic.ok { background: rgba(34,197,94,0.14); color: #4ade80; }
      .kitpc-ic.pend { background: var(--violet-bg); color: var(--violet); }
      .kitpc-ic.warn { background: rgba(251,191,36,0.14); color: #fbbf24; }
      .kitpc-t { font-weight: 700; font-size: .9rem; }
      .kitpc-s { font-size: .8rem; color: var(--text-ghost, var(--text-dim)); margin-top: .12rem; }
      .kitpc-badge { font-size: .64rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
        vertical-align: middle; margin-left: .35rem; padding: .12rem .4rem; border-radius: 6px;
        background: var(--violet-bg); color: var(--violet); border: 1px solid var(--violet-border-soft); }
      .kitpc-link { color: var(--violet); font-weight: 600; text-decoration: none; }
      .kitpc-link:hover { text-decoration: underline; }
    </style>
    <div class="done-page">
      <div class="done-hero kitpc-wrap">
        <div class="done-eyebrow">${eyebrow}</div>
        <div class="kitpc-seal">${checkSvg}</div>
        <div class="kitpc-nome">${escapeHtml(nome)}</div>
        <div class="kitpc-sub">${escapeHtml(titulo)} no AW ECO. Confira o que foi criado:</div>

        <div class="kitpc-list">
          ${linhaPreCliente}
          ${driveLinha}
          <div class="kitpc-item"><span class="kitpc-ic ok">${checkSvg}</span><div><div class="kitpc-t">Contrato gerado</div><div class="kitpc-s">Pronto pra download na próxima tela.</div></div></div>
          <div class="kitpc-item"><span class="kitpc-ic ok">${checkSvg}</span><div><div class="kitpc-t">Procuração gerada</div><div class="kitpc-s">Procuração unificada com declaração de hipossuficiência.</div></div></div>
        </div>

        <button class="btn btn-primary done-btn-primary" onclick="navegarPara('kitDone')">
          Ver peças jurídicas
        </button>
      </div>
    </div>
  `;
}

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
