/* =========================================================================
   IA — geração de trechos via webhook n8n + mock de fallback
   gerarTrechos: chama webhook (state.config.webhookTrechos) e popula trechosIA
   montarPayloadGeracao: monta o JSON enviado ao webhook
   enriquecerZonasConfigComContextos: injeta texto antes/depois de cada zona
   montarZonasConfigBradesco: regras + papel de cada zona IA
   gerarTrechosMock: fallback offline pra testes sem webhook
   sanitizarTextoIA: remove travessões/en-dash que delatam texto de IA
   ========================================================================= */
/* =========================================================================
   SANITIZAR TEXTO DE IA
   ─────────────────────────────────────────────────────────────────────────
   Aplica nos trechos que VOLTAM da IA antes de gravar em state.trechosIA.
   Remove caracteres característicos de texto-modelo (travessão "—" e
   en-dash "–"), substituindo-os por vírgula. Esses caracteres são uma
   das marcas mais reconhecíveis de texto gerado por LLM e o advogado
   pediu explicitamente que não apareçam na peça final.
   Defesa em profundidade: o prompt já é instruído a não usar (regra em
   regras_globais), mas como rede de segurança, todo trecho recebido
   passa por aqui antes de ir pra UI/peça.
   ========================================================================= */
function sanitizarTextoIA(s) {
  if (s == null || typeof s !== 'string') return s;
  return s
    // Travessão (—, U+2014) e en-dash (–, U+2013) → vírgula + espaço
    .replace(/\s*[—–]\s*/g, ', ')
    // Limpa duplo-vírgula e vírgula+ponto que podem aparecer após substituição
    .replace(/,\s*,+/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/,\s+([.;:])/g, '$1')
    // Normaliza espaços múltiplos virados por substituição
    .replace(/[ \t]{2,}/g, ' ');
}

function sanitizarTrechosIA(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === 'string' ? sanitizarTextoIA(v) : v;
  }
  return out;
}

/* =========================================================================
   GERAR TRECHOS
   ========================================================================= */
async function gerarTrechos() {
  // ═══════════════════════════════════════════════════════════════════════════
  // PROTEÇÃO DEFINITIVA: sync DOM → state ANTES de qualquer coisa
  // ═══════════════════════════════════════════════════════════════════════════
  // Lê os inputs visíveis na tela e sincroniza pro state, garantindo que
  // qualquer valor digitado pelo advogado prevaleça sobre valores antigos do
  // state (que podiam ter ficado desatualizados por race condition, perda de
  // foco no input, re-renders parciais, etc).
  // Também loga uma comparação completa pra debug.
  const sincronizarDOMComState = () => {
    const camposPacote3 = ['comarca', 'uf', 'numero_agencia', 'numero_conta',
      'data_inicio_descontos', 'data_fim_descontos', 'valor_total_descontos',
      'valor_dano_moral'];
    const divergencias = [];
    camposPacote3.forEach(campo => {
      const input = document.querySelector(`[data-campo="${campo}"][data-pacote="pacote3"]`);
      if (input && 'value' in input) {
        const valorDOM = input.value || '';
        const valorState = state.dadosPacote3[campo] || '';
        if (valorDOM !== valorState) {
          divergencias.push({ campo, state: valorState, DOM: valorDOM });
          state.dadosPacote3[campo] = valorDOM;
          // Marca flag de edição manual pros campos auto-preenchidos pela XLSX
          if (campo === 'valor_total_descontos') state.dadosPacote3._valor_total_editado_manual = true;
          if (campo === 'data_inicio_descontos') state.dadosPacote3._data_inicio_editado_manual = true;
          if (campo === 'data_fim_descontos')    state.dadosPacote3._data_fim_editado_manual    = true;
        }
      }
    });
    if (divergencias.length) {
      console.log('[AW Writer] gerarTrechos: SYNC DOM→state corrigiu', divergencias.length, 'campo(s):', divergencias);
    } else {
      console.log('[AW Writer] gerarTrechos: state já estava sincronizado com DOM');
    }
    console.log('[AW Writer] gerarTrechos: valor_total_descontos final =', state.dadosPacote3.valor_total_descontos);
  };
  sincronizarDOMComState();

  const obrigatorios = ['numero_agencia','numero_conta','data_inicio_descontos','data_fim_descontos','valor_total_descontos','valor_dano_moral'];
  const faltando = obrigatorios.filter(k => !(state.dadosPacote3[k] || '').toString().trim());
  if (faltando.length) {
    alert('Preencha todos os campos obrigatórios da ação.');
    return;
  }
  // Tabela XLSX precisa estar decidida: anexada OU pulada explicitamente
  if (state.anexos.tabelaXlsx === null) {
    alert('Anexe a tabela de descontos (.xlsx) ou marque "Anexarei depois".');
    return;
  }
  // Pelo menos 1 rubrica precisa estar marcada — sem isso a peça ficaria sem
  // fundamentação específica, o que é um defeito grave da petição.
  // Validação poliglota: conta qualquer rubrica truthy em state.rubricas,
  // não importa se for { cartao, parcela, bx } (produto 1) ou
  // { mora_cred_pessoal, mora_cartao, encargos_limite, encargos_descobertos } (produto 5).
  if (contarRubricasMarcadas() === 0) {
    // Mensagem contextualizada pelo produto selecionado
    const produto = state.produtoSelecionado;
    let exemplos = 'GASTOS CARTÃO, PARCELA CRÉDITO ou BX.ANT.FINANC';
    if (produto && produto.rubricas && Array.isArray(produto.rubricas) && produto.rubricas.length > 0) {
      exemplos = produto.rubricas.slice(0, 3).join(', ');
      if (produto.rubricas.length > 3) exemplos += ', etc.';
    }
    alert('Marque ao menos 1 rubrica aplicável à peça (' + exemplos + ').');
    return;
  }

  state.tela = 'gerando';
  document.getElementById('stepper').classList.remove('hidden');
  rodarAnimacaoGeracao('trechos');

  // Reseta contador de regenerações: a partir desta nova geração, qualquer
  // clique em "Regenerar" começa de "tentativa 1" novamente.
  state.regeneracoesPorZona = {};

  try {
    if (state.config.webhookTrechos) {
      const payload = montarPayloadGeracao();
      const json = await chamarWebhookTrechos(payload);
      // Sanitiza ANTES de gravar — strip de travessão/en-dash e normalização
      state.trechosIA = sanitizarTrechosIA(json.trechos || {});
      // FALLBACK lastro técnico: a IA agora redige o lastro pra escapar das
      // ~4 redações fixas, mas se ela falhar (não retornar a chave ou voltar
      // string vazia), caímos no gerador local pra não deixar o trecho em
      // branco no documento final.
      if (!state.trechosIA.ia_lastro_dano_material) {
        const lastroLocal = gerarLastroEconomicoTrecho();
        if (lastroLocal !== null) {
          state.trechosIA.ia_lastro_dano_material = lastroLocal;
        }
      }
      state.trechosIAOriginais = { ...state.trechosIA };
    } else {
      await new Promise(r => setTimeout(r, 3000));
      // Em modo offline (sem webhook), o mock já chama gerarLastroEconomicoTrecho()
      // internamente — mantém as 4 variantes antigas porque a IA real não está
      // disponível. A geração fresca via IA só acontece com webhook configurado.
      state.trechosIA = sanitizarTrechosIA(gerarTrechosMock());
      state.trechosIAOriginais = { ...state.trechosIA };
    }
    await new Promise(r => setTimeout(r, 500));
    navegarPara('preview');
  } catch (err) {
    alert('Erro ao gerar trechos: ' + err.message);
    navegarPara('pacote3');
  }
}

/**
 * Chama o webhook de trechos (n8n) de forma resiliente e devolve o JSON.
 * Trata os modos de falha que apareciam como erro críptico pro usuário:
 *   - timeout (IA lenta demais)            → mensagem clara + sugestão de retry
 *   - corpo vazio com status 200 (n8n caiu  → "resposta vazia, tente de novo"
 *     ou nó de IA estourou antes do Respond)
 *   - resposta não-JSON                    → "resposta inválida"
 * Antes, qualquer um desses caía em `resp.json()` e estourava
 * "Failed to execute 'json' on 'Response': Unexpected end of JSON input".
 */
async function chamarWebhookTrechos(payload, { timeoutMs = 180000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let resp;
  try {
    resp = await fetch(state.config.webhookTrechos, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      throw new Error('O assistente de IA demorou demais para responder (timeout). Aguarde alguns instantes e tente gerar novamente.');
    }
    throw new Error('Não foi possível contatar o assistente de IA (falha de rede). Verifique a conexão e tente novamente.');
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    throw new Error('O assistente de IA respondeu com erro ' + resp.status + '. Aguarde alguns instantes e tente novamente.');
  }

  const texto = await resp.text();
  if (!texto || !texto.trim()) {
    throw new Error('O assistente de IA retornou uma resposta vazia (instabilidade momentânea do n8n). Aguarde alguns segundos e clique em gerar novamente.');
  }

  let json;
  try {
    json = JSON.parse(texto);
  } catch (e) {
    throw new Error('O assistente de IA retornou uma resposta em formato inválido. Tente novamente; se persistir, avise o suporte.');
  }
  return json;
}

function montarPayloadGeracao() {
  // ═══════════════════════════════════════════════════════════════════════════
  // FORÇAR SINCRONIA com o que está VISÍVEL no input no momento do clique
  // ═══════════════════════════════════════════════════════════════════════════
  // O usuário relatou múltiplas vezes que a IA usa o valor da PLANILHA em vez
  // do valor que está no campo manual quando ele clica em "Gerar".
  // Como rede de segurança definitiva, lemos os campos críticos DIRETAMENTE
  // do DOM agora, sobrescrevendo o state caso ele esteja dessincronizado por
  // qualquer motivo (ex: handler de input não disparou, race condition, etc).
  // O valor que SEMPRE vai pra IA é o que está VISIVELMENTE preenchido na
  // tela no momento exato em que o advogado clicou em "Gerar".
  const inputValorTotal = document.querySelector('input[data-campo="valor_total_descontos"][data-pacote="pacote3"]');
  const inputValorDano  = document.querySelector('input[data-campo="valor_dano_moral"][data-pacote="pacote3"]');
  if (inputValorTotal) {
    const valorVisivel = inputValorTotal.value || '';
    if (state.dadosPacote3.valor_total_descontos !== valorVisivel) {
      console.log('[AW Writer] SYNC: state estava desatualizado em valor_total_descontos. Antes:', state.dadosPacote3.valor_total_descontos, '→ DOM tem:', valorVisivel);
      state.dadosPacote3.valor_total_descontos = valorVisivel;
      state.dadosPacote3._valor_total_editado_manual = true;  // garante que XLSX nunca mais sobrescreva
    }
  }
  if (inputValorDano) {
    const valorVisivel = inputValorDano.value || '';
    if (state.dadosPacote3.valor_dano_moral !== valorVisivel) {
      console.log('[AW Writer] SYNC: state estava desatualizado em valor_dano_moral. Antes:', state.dadosPacote3.valor_dano_moral, '→ DOM tem:', valorVisivel);
      state.dadosPacote3.valor_dano_moral = valorVisivel;
    }
  }

  const dadosParaIA = {};
  const camposBloqueados = []; // só pra rastreabilidade/log, não vai pra IA
  const camposPulados   = []; // só pra rastreabilidade/log, não vai pra IA
  const camposInternos  = []; // chaves auxiliares (_*) e flags de controle — nunca vão pra IA
  const todos = { ...state.dadosPacote1, ...state.dadosPacote2, ...state.dadosPacote3 };

  // Lista explícita de chaves de CONTROLE (sem prefixo _) que NÃO devem ir pra IA.
  // São flags de UI ou metadados de fluxo, não dados do caso.
  const CHAVES_CONTROLE_INTERNO = new Set([
    'tipo_vara_override',              // override manual do tipo de vara (Cível/Juizado)
    'prescricao_decenal_override',    // override manual do tópico de prescrição decenal
    'gerar_lastro_dano_material',      // toggle do parágrafo opcional de lastro
  ]);

  Object.entries(todos).forEach(([k, v]) => {
    // 0. Chaves internas (prefixo _ ou na lista de controle) — NUNCA vão pra IA.
    //    Inclui auxiliares como _valor_total_da_tabela (valor cru da planilha
    //    pra comparar divergência), _valor_total_editado_manual (flag de edição),
    //    _data_inicio_da_tabela, etc. A IA recebe apenas os campos do caso,
    //    não o aparato interno do app.
    //    BUG HISTÓRICO: antes desse filtro, _valor_total_da_tabela ia pro
    //    payload e a IA usava ele em vez de valor_total_descontos quando o
    //    advogado editava o campo manual pra um valor "estranho" (ex: "32").
    if (k.startsWith('_') || CHAVES_CONTROLE_INTERNO.has(k)) {
      camposInternos.push(k);
      return;
    }
    // 1. Pulado (null) — NUNCA vai pra IA
    if (v === null) {
      camposPulados.push(k);
      return;
    }
    // 2. Vazio — não vai pra IA (não tem o que enviar)
    if (v === '' || v === undefined) {
      return;
    }
    // 3. IA OFF (state.seguranca[k] === false) — NUNCA vai pra IA
    //    EXCEÇÃO: valor_total_descontos é necessário SEMPRE que a zona
    //    ia_lastro_humanizado estiver ativa (é o núcleo do trecho:
    //    "Esse montante de R$ X..."). Sem esse campo, a IA aluciná um
    //    valor (geralmente copia o exemplo do prompt). Por isso, abrimos
    //    bypass quando o toggle do humanizado está ON.
    //    Nota histórica: anteriormente havia bypass igual pro lastro
    //    técnico via IA, mas esse foi removido quando migramos pra geração
    //    100% local. Agora o bypass volta, mas agora pra zona humanizada.
    if (state.seguranca[k] === false) {
      const humanizadoAtivo = state.dadosPacote3.gerar_lastro_humanizado !== false;
      const ehValorParaLastro = (k === 'valor_total_descontos' && humanizadoAtivo);
      if (!ehValorParaLastro) {
        camposBloqueados.push(k);
        return;
      }
      // segue pro bloco de normalização abaixo
    }
    // 4. Liberado pra IA — normaliza valores monetários pra formato BR consistente
    //    ("32" → "32,00", "5542.74" → "5.542,74", "5.542,74" → "5.542,74",
    //    "R$ 5.542,74" → "5.542,74"). parseValor (render.js) tolera prefixo
    //    "R$ " e ambos formatos BR/US, evitando NaN→0 quando o usuário (ou
    //    autopreencher) deixa o "R$ " no campo.
    if (k === 'valor_total_descontos' || k === 'valor_dano_moral') {
      const num = parseValor(v) || 0;
      dadosParaIA[k] = num.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } else {
      dadosParaIA[k] = v;
    }
  });

  // NOTA: o bloco antigo de campos LASTRO_VALOR_LITERAL_PARA_COPIAR,
  // LASTRO_INSTRUCAO_LITERAL e LASTRO_DADOS_CALCULADOS foi removido daqui.
  // Esses campos eram passados pra IA do n8n redigir o trecho de lastro,
  // mas o lastro agora é gerado 100% no front via gerarLastroEconomicoTrecho().
  // A zona ia_lastro_dano_material nem vai mais pro n8n (ver filtro de zonas
  // logo abaixo). Outras zonas IA não precisam desses campos.

  // Log claro pra debug — abre o console no Vercel pra confirmar
  console.log('[AW Writer] Payload IA:', {
    enviados_para_ia: Object.keys(dadosParaIA),
    bloqueados_ia_off: camposBloqueados,
    pulados: camposPulados,
    internos_filtrados: camposInternos,
  });

  // Calcula endereçamento (tipo de vara) com base no valor da causa,
  // respeitando override manual se o advogado tiver forçado um tipo
  // parseValor (utils.js) tolera "R$ " e ambos formatos BR/US — evita NaN
  // quando o campo tem "R$ 20.505,26" em vez de "20.505,26".
  const valDescontos = parseValor(state.dadosPacote3.valor_total_descontos) || 0;
  const valDanoMoral = parseValor(state.dadosPacote3.valor_dano_moral) || 0;
  const valCausa = (valDescontos * 2) + valDanoMoral;
  const override = state.dadosPacote3.tipo_vara_override || null;
  const vara = calcularTipoVara(valCausa, override);

  return {
    produto_id: state.produtoSelecionado.id,
    produto_nome: state.produtoSelecionado.nome,
    dados_para_ia: dadosParaIA,
    // Endereçamento automático — n8n usa isto pra preencher os placeholders
    // {tipo_vara}, {comarca} e {uf} no template .docx
    enderecamento: {
      tipo_vara: vara.tipo_vara,          // "CÍVEL" ou "DO JUIZADO ESPECIAL CÍVEL"
      rotulo_curto: vara.rotulo_curto,     // pra UI/logs
      comarca: state.dadosPacote3.comarca || '',
      uf: state.dadosPacote3.uf || '',
      valor_causa: valCausa,
      limite_referencia: vara.limite_referencia,
      explicacao: vara.explicacao,
      forcado_manualmente: vara.forcado_manualmente,  // true se advogado usou override
    },
    zonas: state.produtoSelecionado.zonas_ia
      .filter(z => {
        // ia_lastro_humanizado é a única zona opcional restante.
        // ia_lastro_dano_material agora é sempre incluído (gerado por IA
        // com números calculados injetados via zonas_config) — sem opt-out.
        if (z.tag === 'ia_lastro_humanizado') {
          return state.dadosPacote3.gerar_lastro_humanizado !== false;
        }
        return true;
      })
      .map(z => z.tag),
    // Configuração de coexistência entre as zonas: cada zona tem um papel
    // exclusivo, regras do que evitar, e o que veio antes/depois na peça.
    // Serve pra IA entender o contexto global e evitar redundância.
    // Se a zona contém uma instrução "papel_exclusivo", a IA deve seguir ela
    // estritamente e NÃO incluir informações que não sejam daquele papel.
    zonas_config: enriquecerZonasConfigComContextos(montarZonasConfigBradesco()),
    regras_globais: [
      'NUNCA reapresente o cliente por nome completo + biografia em mais de UM trecho. Isso já foi feito no início da peça.',
      'A PARTIR DO SEGUNDO TRECHO, use preferencialmente "a parte autora", "a requerente", "ela/ele" em vez de repetir nome completo.',
      'NÃO repita renda, profissão, estado civil e composição familiar em mais de DOIS trechos diferentes.',
      'Cada trecho tem um PAPEL ÚNICO e EXCLUSIVO. Foque só nesse papel, deixando os outros aspectos pros outros trechos.',
      'Não faça introdução biográfica em cada trecho. Ataque diretamente o papel do trecho.',
      'Mantenha tom jurídico formal, sem rebuscamento desnecessário.',
      'CRÍTICO: o campo "texto_antes" de cada zona mostra EXATAMENTE o que vem no parágrafo imediatamente anterior do template. NÃO REPITA essas informações. Dê CONTINUIDADE. Se texto_antes já disse "A parte autora X, brasileiro, pedreiro, residente em Y", NÃO comece o trecho reapresentando X, profissão ou endereço.',
      // ────────────────────────────────────────────────────────────────────
      // PROIBIÇÃO ABSOLUTA DE TRAVESSÃO (—) E EN-DASH (–)
      // ────────────────────────────────────────────────────────────────────
      // Esses caracteres são marca registrada de texto gerado por IA. O
      // advogado pediu explicitamente que NUNCA apareçam na peça final.
      // Use vírgula, ponto-e-vírgula, parênteses ou ponto final em substituição.
      // Hífen normal (-) só em palavras compostas (ex: "ex-marido"). Nunca
      // use hífen para separar orações ou aposto.
      // Há sanitização defensiva no front que substitui "—"/"–" por vírgula
      // de qualquer forma, mas a IA NÃO pode produzir esses caracteres.
      'PROIBIDO: NUNCA use travessão (—, U+2014) nem en-dash (–, U+2013) em nenhuma circunstância. Esses caracteres delatam texto de IA e estão TERMINANTEMENTE banidos. Em vez de "X — Y" ou "X – Y", use vírgula ("X, Y"), ponto-e-vírgula ("X; Y"), parênteses ("X (Y)") ou ponto final ("X. Y."). Reescreva qualquer construção que naturalmente pediria travessão usando uma das alternativas. Hífen comum (-) só é permitido em palavras compostas (ex: "ex-marido", "boa-fé").',
    ],
  };
}

/**
 * Pega o objeto de zonas_config (papel/incluir/evitar/posicao) e adiciona
 * os campos texto_antes e texto_depois lendo do produto selecionado.
 * Isso faz a IA saber exatamente o que o template está dizendo ao redor
 * do trecho que ela vai escrever — evita redundância com o texto fixo.
 */
function enriquecerZonasConfigComContextos(configBase) {
  const zonas = state.produtoSelecionado?.zonas_ia || [];
  const enriquecido = {};
  // Interpola placeholders {caso_nome_cesta} (e outros conhecidos) nas strings
  // de contexto ANTES de mandar pra IA — senão a IA recebe a chave literal e
  // pode ecoá-la no output. Fonte: produto.rubricas[0] (nome canônico).
  const produto = state.produtoSelecionado;
  const nomeRubricaCanonica = (produto && Array.isArray(produto.rubricas) && produto.rubricas[0]) || '';
  function interp(s) {
    if (!s) return '';
    return String(s).replace(/\{caso_nome_cesta\}/g, nomeRubricaCanonica || 'CESTA DE SERVIÇOS');
  }
  Object.entries(configBase).forEach(([tag, cfg]) => {
    const zona = zonas.find(z => z.tag === tag);
    enriquecido[tag] = {
      ...cfg,
      texto_antes: interp(zona?.contexto_antes || ''),
      texto_depois: interp(zona?.contexto_depois || ''),
    };
  });
  return enriquecido;
}

/**
 * Retorna a config de cada zona IA pro produto Bradesco Descontos Indevidos,
 * definindo papel exclusivo + o que NÃO fazer + sinalizações de coexistência.
 */
function montarZonasConfigBradesco() {
  const config = {
    ia_contexto_conta_salarial: {
      papel: 'Contextualização socioeconômica do cliente e vinculação da conta bancária ao sustento familiar.',
      incluir: 'Apresentação completa do cliente (nome, profissão, renda, composição familiar) e da natureza salarial da conta como instrumento essencial de subsistência.',
      evitar: 'NADA sobre dano moral, impotência, dignidade ou sofrimento psíquico — esses virão em trechos separados.',
      posicao: 'É o PRIMEIRO trecho da peça — único momento em que o cliente é apresentado com biografia completa.',
    },
    ia_expropriacao_silenciosa: {
      papel: 'Denúncia da MECÂNICA do desconto — a ausência de aviso, de contrato, de discriminação nos extratos.',
      incluir: 'Foco na dinâmica abusiva: como o banco retirava valores sem informar, sem autorização, sem possibilitar contestação.',
      evitar: 'NÃO reapresente o cliente (biografia completa) — use apenas "a parte autora" ou "a requerente". NÃO fale de dano moral ou impotência emocional aqui.',
      posicao: 'Vem após o contexto — já se sabe quem é o cliente.',
    },
    ia_frase_minimo_existencial: {
      papel: 'UMA frase ou parágrafo curto sobre comprometimento do mínimo existencial.',
      incluir: 'Afirmação objetiva de que os descontos comprometem alimentação, moradia, saúde — direito mínimo à subsistência.',
      evitar: 'NÃO repita dados biográficos. NÃO divague. Máximo 3 linhas. Seja direto.',
      posicao: 'Fecha a narrativa dos fatos. Breve e impactante.',
    },
    ia_dano_moral_angustia: {
      papel: 'Descrição do SOFRIMENTO PSÍQUICO específico causado pelos descontos.',
      incluir: 'Angústia ao ver a conta minguando, apreensão constante, perda do sossego. FOCO no aspecto emocional/psicológico.',
      evitar: 'NÃO reapresente o cliente com nome + biografia. NÃO fale de dignidade financeira, nem de desproporção de forças — esses são outros trechos.',
      posicao: 'Primeiro dos 3 trechos de dano moral. Foca só em angústia.',
    },
    ia_dano_moral_dignidade: {
      papel: 'Violação da DIGNIDADE FINANCEIRA como princípio — o ato de subtrair do trabalhador sua subsistência.',
      incluir: 'Argumentação sobre dignidade humana e financeira, desconsideração do ser humano por trás da conta. Tom mais abstrato e jurídico.',
      evitar: 'NÃO reapresente cliente nem repita angústia — esse é o trecho do PRINCÍPIO, não da emoção.',
      posicao: 'Segundo dos 3 trechos de dano moral. Foca só em dignidade como princípio.',
    },
    ia_dano_moral_impotencia: {
      papel: 'Desproporção de FORÇA entre consumidor individual e estrutura bancária gigantesca.',
      incluir: 'Sensação de impotência diante de instituição que ignora reclamações; o cliente como espectador passivo do próprio empobrecimento.',
      evitar: 'NÃO reapresente cliente. NÃO fale de angústia (já foi) nem de dignidade como princípio (já foi).',
      posicao: 'Terceiro e último trecho de dano moral. Foca só em impotência/desproporção.',
    },
    ia_lastro_humanizado: {
      papel: 'TRADUZIR o valor monetário subtraído em BENS COTIDIANOS IDENTIFICÁVEIS que o juiz consegue VISUALIZAR como impacto concreto no orçamento do cliente desta ação. Aborrecer a tese do "mero aborrecimento" mostrando que o número não é abstração contábil, mas tem aptidão para custear feijão, gás, transporte, conta de luz, despesas familiares específicas. Trecho COMPLEMENTAR ao lastro técnico (que vem logo depois, gerado por código, ancorado no Decreto 11.567/2023). Aqui o foco é o IMPACTO HUMANO concreto.',
      incluir: 'Tradução do valor em bens cotidianos brasileiros identificáveis (arroz, feijão, óleo, gás de cozinha, conta de luz, passagens de ônibus, remédios, uniforme escolar, mensalidade de internet) calibrada AO PERFIL FAMILIAR concreto do cliente desta ação. Sempre em quantidades QUALITATIVAS (sem inventar preços absolutos). Use linguagem de potencial ("teria aptidão para custear", "seria suficiente para arcar com", "permitiria custear").',
      evitar: 'NUNCA cite Decreto 11.567/2023, mínimo existencial, salário-mínimo ou cesta básica DIEESE — esses parâmetros oficiais são do trecho técnico que vem DEPOIS (gerado por código). Aqui o foco é IMPACTO HUMANO concreto, não régua jurídica abstrata. NUNCA invente NÚMEROS ABSOLUTOS de referência (preço do quilo do arroz, valor do botijão de gás). Use só quantidades qualitativas. NÃO repita argumentação de dano moral. NÃO discuta a CONDUTA do banco (foco é o IMPACTO do valor).',
      posicao: 'Aparece logo APÓS o cálculo do dano material (R$ X em dobro), na seção DOS DANOS MATERIAIS. É o PRIMEIRO de dois parágrafos de lastro: este (humanizado, IA) vem antes, e o lastro técnico (código, ancorado no Decreto 11.567/2023) vem logo depois. Os dois lastros se complementam: humanizado dá impacto humano + técnico dá peso jurídico.',
    },
  };
  // ia_lastro_dano_material — voltou a ser gerado por IA pra escapar das
  // ~4 redações fixas do gerador local. Os números (SM, cestas, meses ME)
  // são calculados aqui e passados pra IA via campo `dados_calculados` —
  // a IA NUNCA calcula, só redige uma nova forma de escrever os MESMOS
  // números. Conteúdo deve focar SÓ em parâmetros oficiais (Decreto/DIEESE/
  // SM), nada de cliente. Sempre incluído (sem opt-out).
  const lastroCfg = montarConfigLastroDanoMaterial();
  if (lastroCfg) config.ia_lastro_dano_material = lastroCfg;
  return config;
}

/**
 * Monta a config da zona ia_lastro_dano_material com os números calculados
 * já resolvidos (SM, cestas básicas, meses ME) e instruções RIGOROSAS de
 * que a IA não pode citar dado nenhum do cliente. A ideia é que cada
 * geração produza redação fresca da MESMA argumentação técnica, sem ficar
 * preso nas 4 variações do gerador local.
 *
 * Retorna null se não tiver valor calculável (ex: valor_total_descontos
 * vazio ou abaixo do mínimo) — nesse caso o fallback local assume.
 */
function montarConfigLastroDanoMaterial() {
  const valorNum = parseFloat(
    String(state.dadosPacote3.valor_total_descontos || '0').replace(/\./g, '').replace(',', '.')
  ) || 0;
  const calc = calcularLastroFinanceiro(valorNum, state.dadosPacote3.uf || 'AM', 0);
  if (!calc.ok) return null;
  const m = calc.multiplos;
  const ref = LASTROS_REFERENCIA;
  return {
    papel: 'Redigir UM parágrafo de LASTRO TÉCNICO-JURÍDICO do dano material, ancorado em parâmetros oficiais (Decreto 11.567/2023, DIEESE, salário-mínimo). Cada chamada deve produzir REDAÇÃO COMPLETAMENTE FRESCA — varie estrutura sintática, ordem dos argumentos, escolhas lexicais e construções gramaticais. Não reproduza moldes conhecidos.',
    incluir: [
      'OBRIGATÓRIO usar com EXATIDÃO estes números calculados (NUNCA recalcule, NUNCA arredonde diferente):',
      `  • valor subtraído: R$ ${calc.valor_formatado}`,
      `  • equivalência em salários-mínimos nacionais (R$ ${ref.salario_minimo} em ${ref.ano_base}): ${m.salarios_minimos}`,
      `  • equivalência em cestas básicas DIEESE Manaus-AM (${ref.cesta_basica_am_referencia}): ${m.cestas_basicas}`,
      `  • equivalência em meses do mínimo existencial (${ref.decreto_minimo_existencial} fixa em R$ ${ref.minimo_existencial}/mês): ${m.meses_minimo_existencial}`,
      `  • fração do mínimo existencial mensal (%): ${m.fracao_minimo_existencial_pct}`,
      `  • passagens de ônibus equivalentes no AM: ${m.passagens_onibus}`,
      'CITAR explicitamente: Decreto nº 11.567/2023 (mínimo existencial), DIEESE (Departamento Intersindical de Estatística e Estudos Socioeconômicos — expanda a sigla na primeira ocorrência), salário-mínimo nacional vigente.',
      'Tom: jurídico técnico, ancorado em fontes oficiais. Linguagem de potencial ("aptidão para", "equivale a", "supera em").',
      'Tamanho: UM parágrafo, 5 a 10 linhas.',
    ].join('\n'),
    evitar: 'PROIBIDO ABSOLUTAMENTE mencionar nome, profissão, idade, estado civil, renda, número de filhos, endereço ou QUALQUER dado pessoal/biográfico do cliente. Não use "a parte autora", "a requerente" como sujeito da frase — fale do "valor subtraído" ou "a quantia" como sujeito. PROIBIDO inventar preços absolutos (R$ X o quilo do arroz, R$ Y o botijão de gás). PROIBIDO repetir argumentação de dano moral, angústia, dignidade ou impotência. PROIBIDO travessão (—) e en-dash (–). PROIBIDO recalcular os números — use os valores calculados acima literalmente.',
    posicao: 'Vem logo APÓS o lastro humanizado (que traduziu o valor em bens cotidianos do cliente concreto). Este é o lastro TÉCNICO/JURÍDICO — ancorado em parâmetros oficiais (Decreto/DIEESE/SM), SEM nenhum dado do cliente. Os dois lastros se complementam: humanizado dá impacto humano + técnico dá peso jurídico abstrato.',
    dados_calculados: {
      valor: calc.valor,
      valor_formatado: calc.valor_formatado,
      faixa: calc.faixa,
      multiplos: m,
      decreto_minimo_existencial: calc.decreto_minimo_existencial,
      constantes_referencia: calc.constantes_referencia,
    },
  };
}

// `tentativa` controla qual variante de cada zona é retornada — usado pelo
// regenerarZona pra que o mock offline mostre VARIAÇÃO REAL a cada clique
// (sem isso, o usuário clica regenerar e vê o mesmo texto, dando impressão
// de que o botão não funciona). Em produção, com webhook configurado, o
// mock só serve pra primeira renderização — a IA real assume daí pra frente.
function gerarTrechosMock(tentativa = 0) {
  const d = { ...state.dadosPacote1, ...state.dadosPacote2 };
  const prof = d.profissao || 'trabalhador';
  const filhos = parseInt(d.numero_filhos) || 0;
  // renda_mensal pode vir como texto livre ("R$ 1.800", "1800", "um salário").
  // Tenta extrair número; se não der, usa o texto cru — nunca "R$ NaN".
  let renda = 'renda modesta';
  if (d.renda_mensal != null && String(d.renda_mensal).trim() !== '') {
    const raw = String(d.renda_mensal).trim();
    const n = parseFloat(raw.replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
    renda = isNaN(n) ? raw : `R$ ${n.toLocaleString('pt-BR')}`;
  }
  const nome = d.nome_completo || 'a parte autora';
  const ecCasado = d.estado_civil?.includes('cas');
  const ecMasc = ecCasado ? 'casado' : '';
  const ecFem  = ecCasado ? 'casada' : '';
  // Sinais de vulnerabilidade do nucleo familiar (filhos, conjuge,
  // provedor unico, moradia, outros dependentes).
  const filhosFrag = filhos > 0 ? `, com ${filhos} filho${filhos > 1 ? 's' : ''} sob seus cuidados` : '';
  const outrosDep = (d.outros_dependentes || '').trim();
  const outrosFrag = outrosDep ? `, ${filhosFrag ? 'e ainda ' : 'responsável por '}${outrosDep}` : '';
  const conjugeFrag = d.conjuge_trabalha === 'nao' ? ', cujo cônjuge não exerce atividade remunerada' : '';
  const provedorFrag = d.unico_provedor === 'sim' ? ', único provedor do lar' : '';
  const moradiaMap = { alugada: 'residindo em imóvel alugado', cedida: 'residindo em imóvel cedido', financiada: 'com imóvel ainda financiado' };
  const moradiaFrag = moradiaMap[d.tipo_moradia] ? `, ${moradiaMap[d.tipo_moradia]}` : '';
  const sufFilhos = `${filhosFrag}${outrosFrag}${provedorFrag}${conjugeFrag}${moradiaFrag}`;

  // 3 variantes por zona: rotacionam por tentativa (mod 3). Cada variante muda
  // ABERTURA, ORDEM dos argumentos e ÊNFASE — bate com as exigências do
  // blocoRegeneracao do n8n. Cliente vê texto genuinamente diferente a cada
  // clique de "Regenerar", mesmo offline.
  const idx = ((tentativa % 3) + 3) % 3;
  const pickVariante = (variantes) => variantes[idx];

  // O nome completo aparece APENAS na zona de contexto. Demais zonas usam
  // "a parte autora", "a requerente", "ela/ele" pra evitar repetição.
  return {
    // [1] CONTEXTO — apresenta cliente com biografia completa
    ia_contexto_conta_salarial: pickVariante([
      `Trata-se de conta bancária de natureza salarial, destinada ao sustento de ${nome}, ${prof}${ecCasado ? ', ' + ecFem : ''}${sufFilhos}, que percebe rendimentos de aproximadamente ${renda} mensais. Referida conta é o instrumento concreto pelo qual a autora garante alimentação, moradia e demais despesas essenciais da família.`,
      `${nome}, ${prof}${ecCasado ? ', ' + ecFem : ''}${sufFilhos}, mantém junto ao Banco Requerido conta-corrente de natureza salarial — ali transitam os ${renda ? renda + ' mensais' : 'rendimentos modestos'} que sustentam toda a economia doméstica do núcleo familiar. É na movimentação desse instrumento bancário que se inscreve a presente lide.`,
      `O presente caso tem por origem a relação bancária mantida entre a parte autora — ${nome}, ${prof}${ecCasado ? ', ' + ecFem : ''}${sufFilhos} — e o Banco Requerido, em conta-corrente cuja natureza salarial é incontroversa: nela são depositados os ${renda ? renda : 'parcos rendimentos'} mensais que viabilizam a subsistência familiar.`,
    ]),

    // [2] EXPROPRIAÇÃO — mecânica do desconto abusivo
    ia_expropriacao_silenciosa: pickVariante([
      `Os descontos eram realizados de forma silenciosa e automática, sem aviso prévio, sem autorização expressa e sem discriminação adequada nos extratos. Não havia qualquer canal efetivo para que a parte autora compreendesse a origem das cobranças ou as contestasse — configurando verdadeira expropriação unilateral do patrimônio do consumidor.`,
      `A operação aqui impugnada se dava em três camadas de opacidade: ausência de aviso prévio, ausência de autorização expressa e ausência de discriminação contratual nos extratos. Soma-se a isso a inexistência de canal efetivo de contestação, configurando expropriação unilateral do patrimônio da consumidora pelo Banco Réu.`,
      `O que se viu nos extratos foi cobrança operando à margem de qualquer transparência: nenhuma comunicação prévia, nenhum contrato discriminado, nenhum canal de contestação que efetivamente respondesse. Essa tríade de silêncios institucionais não apenas inverte o ônus da prova — caracteriza apropriação patrimonial não autorizada.`,
    ]),

    // [3] MÍNIMO EXISTENCIAL — frase curta e impactante
    ia_frase_minimo_existencial: pickVariante([
      `Tais descontos atingem diretamente o mínimo existencial da parte autora, comprometendo recursos destinados a alimentação, moradia e necessidades básicas de subsistência — cuja tutela é constitucionalmente garantida.`,
      `O mínimo existencial — núcleo essencial de tutela constitucional sobre alimentação, moradia e despesas básicas de subsistência — restou diretamente atingido pelas cobranças impugnadas, que subtraíram da parte autora recursos sem os quais sua dignidade econômica não se sustenta.`,
      `Não se trata de mero desfalque patrimonial: a subtração impugnada incide sobre o mínimo existencial da parte autora — recursos destinados a alimentação, moradia e despesas essenciais cuja preservação a Constituição erige como núcleo intangível.`,
    ]),

    // [4] DANO MORAL · ANGÚSTIA
    ia_dano_moral_angustia: pickVariante([
      `Os descontos indevidos geraram angústia significativa à parte autora, que via sua remuneração minguar mês a mês sem compreender a origem das perdas. A apreensão constante diante do saldo decrescente, somada à ausência de canais eficazes de contestação, produziu sofrimento psíquico relevante que ultrapassa o mero aborrecimento.`,
      `Mês após mês, a parte autora viu sua remuneração ser reduzida sem explicação, sem aviso, sem caminho aberto para contestar. A insegurança financeira recorrente — somada à impotência diante de uma instituição que não respondia — produziu o tipo de sofrimento psíquico continuado que o Direito reconhece como dano moral, não como inconveniente trivial.`,
      `A repetição mensal da subtração, conjugada à ausência de qualquer resposta efetiva da instituição, configurou para a parte autora um quadro de angústia financeira sustentada: cada novo extrato ressuscitava a apreensão diante do saldo, e cada tentativa de contestação esbarrava em silêncio institucional. Esse sofrimento prolongado transcende em muito o mero aborrecimento.`,
    ]),

    // [5] DANO MORAL · DIGNIDADE
    ia_dano_moral_dignidade: pickVariante([
      `A subtração de valores diretamente da conta salarial, sem justificativa contratual válida, viola a dignidade financeira do consumidor — princípio que se desdobra da dignidade humana (art. 1º, III, CF). Trata-se da desconsideração do trabalhador por trás do número de conta, transformando o cidadão em mero dado patrimonial passível de apropriação unilateral pela instituição financeira.`,
      `Há um princípio constitucional em jogo: a dignidade humana (art. 1º, III, CF), que se desdobra na dignidade econômica do consumidor. Quando o banco subtrai valor da conta salarial sem amparo contratual válido, despe o titular de sua condição de sujeito de direitos e o reduz a mero dado patrimonial — violação que não se mede só em reais, mas em afronta à pessoalidade do trabalhador.`,
      `O ilícito aqui denunciado não se limita ao patrimônio: atinge a dignidade econômica do consumidor — extensão direta da dignidade humana consagrada no art. 1º, III, da Constituição. Tratar a conta salarial como reservatório passível de apropriação unilateral é desconsiderar a pessoa por trás do número, e essa desconsideração é a essência do dano moral aqui pleiteado.`,
    ]),

    // [6] DANO MORAL · IMPOTÊNCIA
    ia_dano_moral_impotencia: pickVariante([
      `Soma-se a essa violação a sensação de impotência do consumidor individual diante da gigantesca estrutura bancária ré — que, ignorando reclamações e mantendo os descontos, reduz a parte autora à condição de espectadora passiva do próprio empobrecimento. Essa desproporção de forças, associada à omissão reiterada da instituição, agrava o dano imaterial causado.`,
      `Há ainda o componente da impotência: do lado do consumidor, esforços individuais para contestar; do lado do banco, uma estrutura institucional que ignora reclamações e mantém as cobranças. Essa desproporção transforma o titular da conta em espectador passivo do próprio empobrecimento — dimensão do dano moral que a jurisprudência consolidada reconhece como autônoma.`,
      `A impotência do consumidor individual frente à máquina bancária é, no caso concreto, agravante decisivo do dano moral: cada tentativa de reclamar esbarra em estruturas que processam queixas sem efetivamente respondê-las, enquanto os descontos seguem mensais. Reduzir a parte autora a essa condição de espectadora do próprio empobrecimento é, em si, lesão à esfera extrapatrimonial.`,
    ]),

    // [7] LASTRO DO DANO MATERIAL — gerado 100% local via gerarLastroEconomicoTrecho()
    // Não há mais fallback de IA: este é o texto definitivo. Helper já trata
    // toggle off, valor < R$ 20 e seed determinístico.
    ia_lastro_dano_material: gerarLastroEconomicoTrecho() || '[Lastro do dano material desativado pelo advogado.]',

    // [8] LASTRO HUMANIZADO — IA traduz valor em bens cotidianos do cliente
    // (gerado pelo n8n; mock simula um exemplo coerente com o perfil).
    ia_lastro_humanizado: state.dadosPacote3.gerar_lastro_humanizado === false
      ? '[Lastro humanizado desativado pelo advogado.]'
      : (() => {
          const valorTexto = state.dadosPacote3.valor_total_descontos || '0';
          const filhosNum = parseInt(d.numero_filhos) || 0;
          const dependentes = filhosNum > 0
            ? `, com ${filhosNum} filho${filhosNum > 1 ? 's' : ''} dependente${filhosNum > 1 ? 's' : ''}`
            : '';
          return `Esse montante de R$ ${valorTexto}, embora possa parecer modesto na contabilidade do banco, representa, em termos práticos para a parte autora${dependentes}, recursos com aptidão para custear despesas cotidianas como o gás de cozinha, parte do mercado do mês, conta de luz e transporte público de várias semanas. São compras e contas que entram ou deixam de entrar no orçamento doméstico, e cada subtração desse porte tem potencial concreto de adiar uma despesa essencial e forçar o consumidor a escolher o que pagar antes do quê.`;
        })(),
  };
}
