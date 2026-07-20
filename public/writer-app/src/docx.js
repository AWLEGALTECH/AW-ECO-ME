/* =========================================================================
   DOCX — geração da peça final no navegador via docxtemplater + image-module
   gerarPecaFinal: orquestra a animação + montagem do DOCX
   montarContextoDocx: prepara o objeto com todos os placeholders do template
   montarFlagsDasRubricas/montarLetrasRubricas: rubricas selecionadas
   escXml/montarTabelaXmlDescontos: monta a tabela de descontos como XML inline
   base64ParaArrayBuffer: converte os templates base64 do data/ em buffer
   aplicarBordaSelfie: aplica borda preta na imagem da procuração via canvas
   montarDocxNoNavegador: gera o blob do .docx pronto pra download
   ========================================================================= */
/* =========================================================================
   GERAR PEÇA FINAL
   ========================================================================= */
async function gerarPecaFinal() {
  // Blindagem: se chegou aqui sem nenhuma rubrica marcada, avisa e volta em vez
  // de gerar uma peça com a listagem do DOS FATOS vazia.
  if (contarRubricasMarcadas() === 0) {
    const produto = state.produtoSelecionado;
    let exemplos = 'rubricas aplicáveis';
    if (produto && produto.rubricas && Array.isArray(produto.rubricas) && produto.rubricas.length > 0) {
      exemplos = produto.rubricas.slice(0, 3).join(', ');
      if (produto.rubricas.length > 3) exemplos += ', etc.';
    }
    alert('Nenhuma rúbrica está marcada. Volte ao Pacote 3 e marque pelo menos uma (' + exemplos + ') antes de gerar a peça.');
    return;
  }

  state.tela = 'gerando';
  // Promise que resolve quando a animação visual terminar de verdade
  const animacaoTerminou = rodarAnimacaoGeracao('peca');

  // Geração do .docx — agora TOTALMENTE no navegador (docxtemplater + image module).
  // O workflow 2 do n8n não é mais usado. Apenas o workflow 1 (gerar trechos) continua.
  const geracaoPromise = (async () => {
    try {
      const blob = await montarDocxNoNavegador();
      state.arquivoFinalBlob = blob;
    } catch (err) {
      console.error('Erro na geração:', err);
      throw err;
    }
  })();

  try {
    // Espera AMBOS: a animação chegar a 100% E a geração terminar
    await Promise.all([animacaoTerminou, geracaoPromise]);
    navegarPara('done');
  } catch (err) {
    alert('Erro ao gerar peça: ' + err.message);
    navegarPara('preview');
  }
}

/* =========================================================================
   GERAÇÃO DO .DOCX NO NAVEGADOR
   ========================================================================= */

/**
 * Monta o contexto com todas as tags do template a partir do state atual.
 * Retorna objeto { key: valor } pronto pra passar pro docxtemplater.
 */
function montarContextoDocx() {
  // ═══════════════════════════════════════════════════════════════════════════
  // FORÇAR SINCRONIA com o DOM antes de montar contexto
  // ═══════════════════════════════════════════════════════════════════════════
  // Mesma proteção do montarPayloadGeracao: lê valor_total_descontos e
  // valor_dano_moral DIRETAMENTE do input visível, sobrescrevendo state se
  // estiver dessincronizado. Garante que docx e IA vejam EXATAMENTE o mesmo
  // valor — o que está no campo no momento do clique.
  // Pode ser que esta função seja chamada quando o DOM não tem mais o input
  // (após o usuário avançar de tela), nesse caso querySelector retorna null
  // e o state é preservado intacto — comportamento seguro.
  const inputValorTotal = document.querySelector('input[data-campo="valor_total_descontos"][data-pacote="pacote3"]');
  const inputValorDano  = document.querySelector('input[data-campo="valor_dano_moral"][data-pacote="pacote3"]');
  if (inputValorTotal) {
    const v = inputValorTotal.value || '';
    if (state.dadosPacote3.valor_total_descontos !== v) {
      state.dadosPacote3.valor_total_descontos = v;
      state.dadosPacote3._valor_total_editado_manual = true;
    }
  }
  if (inputValorDano) {
    const v = inputValorDano.value || '';
    if (state.dadosPacote3.valor_dano_moral !== v) {
      state.dadosPacote3.valor_dano_moral = v;
    }
  }

  const c = state.dadosPacote1;
  const p3 = state.dadosPacote3;

  // Helpers de formatação
  const parseMoney = (s) => {
    if (!s) return 0;
    return parseFloat(String(s).replace(/\./g, '').replace(',', '.')) || 0;
  };
  const fmtMoney = (v) => v.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const vDescontos = parseMoney(p3.valor_total_descontos);
  const vDanoMoral = parseMoney(p3.valor_dano_moral);
  const vDobro = vDescontos * 2;
  const vCausa = vDobro + vDanoMoral;

  // Endereçamento dinâmico — respeita override manual (toggle Cível/Juizado).
  // Alimenta os placeholders {tipo_vara}, {comarca} e {uf} no topo do template v10.
  const override = p3.tipo_vara_override || null;
  const vara = calcularTipoVara(vCausa, override);

  // Sistema de pronomes adaptativo por gênero
  // Se gênero não informado, default = masculino (compatibilidade retroativa)
  const generoFem = c.genero === 'feminino';

  // Estado civil concorda com gênero (no Pacote 1 salvamos o radical: 'casado'/'solteiro'/etc)
  const estadoCivilConjugado = (() => {
    const ec = c.estado_civil || '';
    if (ec === 'união estável') return 'em união estável';
    if (!ec) return '';
    // Trocar 'o' final por 'a' se feminino (casado→casada, solteiro→solteira, viúvo→viúva, divorciado→divorciada).
    // Bug histórico: usávamos `ec + 'a'` que gerava "divorciadoa", "casadoa", etc.
    return generoFem ? ec.replace(/o$/, 'a') : ec;
  })();

  // Pronomes e formas
  const placeholdersGenero = {
    cliente_pronome:           generoFem ? 'ela'           : 'ele',           // sujeito
    cliente_pronome_obj:       generoFem ? 'a'             : 'o',             // objeto direto
    cliente_artigo:            generoFem ? 'a'             : 'o',             // artigo definido
    cliente_artigo_maiusculo:  generoFem ? 'A'             : 'O',             // artigo no início de período
    // Contrações de PREP+ARTIGO — necessárias quando o template traz "da/do",
    // "ao/à", "pela/pelo" antes de termo que se refere ao cliente.
    // Sem isso, o template ficaria com "da(o)" ou similar, que é o exato
    // problema que estamos eliminando.
    cliente_de_artigo:         generoFem ? 'da'            : 'do',           // de + artigo
    cliente_a_artigo:          generoFem ? 'à'             : 'ao',           // a + artigo (crase)
    cliente_em_artigo:         generoFem ? 'na'            : 'no',           // em + artigo
    cliente_por_artigo:        generoFem ? 'pela'          : 'pelo',         // por + artigo
    cliente_estado_civil:      estadoCivilConjugado,                          // casado/casada/etc
    cliente_portador:          generoFem ? 'portadora'     : 'portador',
    cliente_correntista:       'correntista',                                 // invariável em PT
    cliente_requerente:        'Requerente',                                  // invariável (substantivo de 2 gêneros)
    cliente_autor_palavra:     generoFem ? 'autora'        : 'autor',
    cliente_autora_qualificada: generoFem ? 'a Autora'     : 'o Autor',
    cliente_inscrito:          generoFem ? 'inscrita'      : 'inscrito',
    cliente_residente:         'residente',                                   // invariável
    cliente_casado_genero:     generoFem ? 'casada'        : 'casado',
    cliente_trabalhador:       generoFem ? 'trabalhadora'  : 'trabalhador',
    cliente_brasileiro:        generoFem ? 'brasileira'    : 'brasileiro',
    cliente_pronome_possessivo: 'sua',                                        // invariável (refere-se a "conta/renda/etc")
    // Pronome possessivo flexionado quando refere-se ao cliente diretamente
    // (dele/dela). Use quando o template precisa de "dele/dela", não "seu/sua".
    cliente_dele_dela:         generoFem ? 'dela'          : 'dele',
  };

  return {
    // Endereçamento (template v10+)
    // Comarca e UF entram em CAIXA ALTA pra casar com o restante do endereçamento,
    // que já está todo em maiúsculas no template ("AO JUÍZO DE DIREITO DA ___ª VARA...").
    // Usa locale pt-BR pra tratar acentos corretamente (ex: "são paulo" → "SÃO PAULO").
    tipo_vara: vara.tipo_vara,        // "CÍVEL" ou "DO JUIZADO ESPECIAL CÍVEL"
    comarca:   (p3.comarca || '').toLocaleUpperCase('pt-BR'),
    uf:        (p3.uf      || '').toLocaleUpperCase('pt-BR'),

    // Cliente
    // Nome em MAIÚSCULAS sempre — padrão jurídico para qualificação na inicial.
    // Usa locale pt-BR pra preservar acentos corretamente.
    cliente_nome_completo:    (c.nome_completo    || '').toLocaleUpperCase('pt-BR'),
    cliente_nacionalidade:    c.nacionalidade    || '',
    cliente_profissao:        c.profissao        || '',
    cliente_rg:               c.rg               || '',
    cliente_orgao_expedidor:  c.orgao_expedidor  || '',
    cliente_cpf:              c.cpf              || '',
    cliente_endereco_completo: c.endereco_completo || '',

    // Pronomes adaptativos por gênero (sobrescreve cliente_estado_civil acima)
    ...placeholdersGenero,

    // Caso
    caso_numero_agencia:        p3.numero_agencia        || '',
    caso_numero_conta:          p3.numero_conta          || '',
    caso_data_inicio_descontos: p3.data_inicio_descontos || '',
    caso_data_fim_descontos:    p3.data_fim_descontos    || '',
    caso_valor_total_descontos: fmtMoney(vDescontos),
    caso_valor_dano_moral:      fmtMoney(vDanoMoral),
    caso_valor_dobro:           fmtMoney(vDobro),
    caso_valor_causa:           fmtMoney(vCausa),
    // caso_nome_cesta: usa o nome CANÔNICO da rubrica de produto.rubricas[0]
    // (exibido em "Rubricas aplicáveis à peça"), NÃO a descrição do XLSX.
    // Razão: a peça precisa referenciar o termo limpo definido no produto,
    // não a variação que o banco escreveu no extrato (ex: "CESTA B. EXPRESSO 4"
    // vira "CESTA B. EXPRESSO" no texto da petição).
    caso_nome_cesta:            ((state.produtoSelecionado && Array.isArray(state.produtoSelecionado.rubricas) && state.produtoSelecionado.rubricas[0]) || 'CESTA DE SERVIÇOS'),

    // Trechos IA
    // ia_contexto_conta_salarial agora é parágrafo ISOLADO no template V10
    // (depois do parágrafo fixo que apresenta cliente + conta). Por isso precisa
    // começar com letra maiúscula. Aplicamos capitalização aqui como rede de
    // segurança — o prompt da IA já foi instruído a começar com maiúscula,
    // mas se escapar algo em minúscula, isto garante consistência visual.
    //
    // PRESTAMISTA (produto id 6): TODOS os trechos IA são parágrafos isolados
    // no template (não inline como produto 1/5). Capitalizamos todos pra evitar
    // parágrafo começando com minúscula. Para os outros produtos, segue inline
    // (sem capitalização) preservando o comportamento original.
    ia_contexto_conta_salarial:  capitalizarPrimeiraLetra(state.trechosIA.ia_contexto_conta_salarial || ''),
    ia_expropriacao_silenciosa:  state.produtoSelecionado && (state.produtoSelecionado.id === 6 || state.produtoSelecionado.id === 14)
                                  ? capitalizarPrimeiraLetra(state.trechosIA.ia_expropriacao_silenciosa  || '')
                                  : (state.trechosIA.ia_expropriacao_silenciosa  || ''),
    ia_frase_minimo_existencial: state.produtoSelecionado && (state.produtoSelecionado.id === 6 || state.produtoSelecionado.id === 14)
                                  ? capitalizarPrimeiraLetra(state.trechosIA.ia_frase_minimo_existencial || '')
                                  : (state.trechosIA.ia_frase_minimo_existencial || ''),
    ia_dano_moral_angustia:      state.produtoSelecionado && (state.produtoSelecionado.id === 6 || state.produtoSelecionado.id === 14)
                                  ? capitalizarPrimeiraLetra(state.trechosIA.ia_dano_moral_angustia     || '')
                                  : (state.trechosIA.ia_dano_moral_angustia      || ''),
    ia_dano_moral_dignidade:     state.produtoSelecionado && (state.produtoSelecionado.id === 6 || state.produtoSelecionado.id === 14)
                                  ? capitalizarPrimeiraLetra(state.trechosIA.ia_dano_moral_dignidade    || '')
                                  : (state.trechosIA.ia_dano_moral_dignidade     || ''),
    ia_dano_moral_impotencia:    state.produtoSelecionado && (state.produtoSelecionado.id === 6 || state.produtoSelecionado.id === 14)
                                  ? capitalizarPrimeiraLetra(state.trechosIA.ia_dano_moral_impotencia   || '')
                                  : (state.trechosIA.ia_dano_moral_impotencia    || ''),

    // [7] LASTRO DO DANO MATERIAL — opcional (toggle no preview, igual ao
    // humanizado). Quando desligado, o bloco condicional do template
    // ({#gerar_lastro_dano_material}) é removido inteiro pelo docxtemplater.
    // Capitaliza por ser parágrafo isolado em todos os produtos.
    ia_lastro_dano_material:     capitalizarPrimeiraLetra(state.trechosIA.ia_lastro_dano_material || ''),
    gerar_lastro_dano_material:  state.dadosPacote3.gerar_lastro_dano_material !== false,

    // Lastro HUMANIZADO — gerado por IA, traduz valor em bens cotidianos do
    // cliente. Vem ANTES do lastro técnico na peça (humanizado dá impacto humano,
    // técnico dá peso jurídico). Toggle independente.
    ia_lastro_humanizado:        capitalizarPrimeiraLetra(state.trechosIA.ia_lastro_humanizado || ''),
    gerar_lastro_humanizado:     state.dadosPacote3.gerar_lastro_humanizado !== false,

    // Flags de rubricas aplicáveis — controlam quais blocos condicionais
    // aparecem no template. Para produto 1: rubrica_cartao/parcela/bx.
    // Para produto 5 (juros): rubrica_mora_cred_pessoal/mora_cartao/encargos_limite/encargos_descobertos
    ...montarFlagsDasRubricas(),
    multiplas_rubricas: contarRubricasMarcadas() > 1,
    // caso_rubricas_texto é usado pelo produto 1 no template V9
    caso_rubricas_texto: montarTextoRubricas(),
    // caso_rubricas_texto_juros é usado pelo produto 5 (listagens dinâmicas NUMOPEDE, intro DO DIREITO, PEDIDOS letra e)
    caso_rubricas_texto_juros: montarTextoRubricas(),
    // rubricas_nomes_texto é usado pelo produto 3 (Tarifas) em 6 placeholders do template:
    // NUMOPEDE intro, DOS FATOS, INVERSÃO ÔNUS, DOS DANOS, PEDIDO d.1, PEDIDO d.3
    rubricas_nomes_texto: montarTextoRubricas(),
    // Letras dinâmicas pra enumeração a)/b)/c) no DOS FATOS. Só as rubricas
    // marcadas recebem letra; ordem fixa: cartão → parcela → BX.
    ...montarLetrasRubricas(),

    // Tag de imagem — o docxtemplater-image-module usa identifier string,
    // e o getImage() abaixo resolve pra um ArrayBuffer da imagem real.
    // NOTA: a tabela de descontos não vai aqui — é injetada diretamente no
    // document.xml após a renderização, via montarTabelaXmlDescontos().
    selfie: 'SELFIE',
  };
}

/**
 * Monta as flags booleanas rubrica_X para cada rubrica do produto,
 * que o docxtemplater usa nos blocos condicionais {#rubrica_X}...{/rubrica_X}.
 * Funciona pra ambos produtos: retorna só as chaves relevantes do produto atual.
 */
function montarFlagsDasRubricas() {
  const produto = state.produtoSelecionado;
  const r = state.rubricas || {};
  const out = {};

  if (produto && produto.rubricas_keys && Array.isArray(produto.rubricas_keys)) {
    // Produto novo: usa rubricas_keys explícitas
    for (const k of produto.rubricas_keys) {
      out['rubrica_' + k] = !!r[k];
    }
  } else {
    // Fallback produto 1
    out.rubrica_cartao  = !!r.cartao;
    out.rubrica_parcela = !!r.parcela;
    out.rubrica_bx      = !!r.bx;
  }
  return out;
}

/**
 * Atribui letras (a, b, c) às rubricas marcadas, em ordem fixa:
 *   cartão → parcela → BX
 * Rubricas não marcadas recebem string vazia (mas como o bloco fica
 * escondido pela tag condicional, essa letra nem aparece).
 * Retorna objeto com as 3 chaves que o template espera.
 */
function montarLetrasRubricas() {
  const produto = state.produtoSelecionado;
  const r = state.rubricas || {};
  // Alfabeto completo a-z — suporta até 26 rubricas marcadas. O Mix Bradesco
  // (id 14) pode ter até 16; produtos legados têm 3-4. Antes era ['a'..'f']
  // que estourava no Mix gerando "undefined)" nos itens > 6.
  const letras = 'abcdefghijklmnopqrstuvwxyz'.split('');
  let idx = 0;
  const out = {};

  // Se o produto tem rubricas_keys explícitas (produto novo), itera por elas.
  // OBS: a ORDEM da iteração define a sequência de letras (a, b, c, ...) na
  // peça final. Por isso rubricas_keys deve estar em ORDEM DO DOCUMENTO, não
  // ordem de detecção. O Mix Bradesco usa essa ordem; a detecção tem cascata
  // própria em classificarMix() que não depende da ordem do array.
  if (produto && produto.rubricas_keys && Array.isArray(produto.rubricas_keys)) {
    for (const k of produto.rubricas_keys) {
      out['letra_rubrica_' + k] = r[k] ? letras[idx++] : '';
    }
    return out;
  }
  // Fallback produto 1 (Descontos Indevidos)
  out.letra_rubrica_cartao  = '';
  out.letra_rubrica_parcela = '';
  out.letra_rubrica_bx      = '';
  if (r.cartao)  out.letra_rubrica_cartao  = letras[idx++];
  if (r.parcela) out.letra_rubrica_parcela = letras[idx++];
  if (r.bx)      out.letra_rubrica_bx      = letras[idx++];
  return out;
}

/**
 * Conta quantas rubricas estão marcadas em state.rubricas.
 */
function contarRubricasMarcadas() {
  const r = state.rubricas || {};
  return Object.values(r).filter(v => !!v).length;
}

/**
 * Monta o texto das rubricas marcadas com vírgulas e "e" antes da última.
 * Ex.: só BX → '"BX.ANT.FINANC"'
 *      BX + Parcela → '"PARCELA CRÉDITO PESSOAL" e "BX.ANT.FINANC"'
 *      todas → '"GASTOS CARTÃO DE CRÉDITO", "PARCELA CRÉDITO PESSOAL" e "BX.ANT.FINANC"'
 * Usado no pedido "e) declaração de inexigibilidade" do template.
 */
function montarTextoRubricas() {
  const produto = state.produtoSelecionado;
  const r = state.rubricas || {};
  const nomes = [];

  // Se o produto novo tem rubricas_nomes_texto mapeado, usa isso
  if (produto && produto.rubricas_nomes_texto && produto.rubricas_keys) {
    for (const k of produto.rubricas_keys) {
      if (r[k]) nomes.push(produto.rubricas_nomes_texto[k]);
    }
  } else {
    // Fallback produto 1 (Descontos Indevidos)
    if (r.cartao)  nomes.push('"GASTOS CARTÃO DE CRÉDITO"');
    if (r.parcela) nomes.push('"PARCELA CRÉDITO PESSOAL"');
    if (r.bx)      nomes.push('"BX.ANT.FINANC"');
  }
  if (nomes.length === 0) return '';
  if (nomes.length === 1) return nomes[0];
  if (nomes.length === 2) return `${nomes[0]} e ${nomes[1]}`;
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/**
 * Escapa texto pra XML (& < > " ').
 */
function escXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/* =========================================================================
   PRESCRIÇÃO DECENAL — insere/remove o tópico conforme a regra dos 5 anos
   (detector em render.js: calcularPrescricaoDecenal) + override manual.
   Universal a TODOS os produtos. Bloco verbatim extraído do template-padrao
   (heading + corpo único com a tese e o precedente STJ REsp 1.631.903/SP).
   ========================================================================= */
const HEADING_DECENAL = 'DA PRESCRIÇÃO DECENAL APLICÁVEL À REPETIÇÃO DO INDÉBITO';

const HEADING_DECENAL_XML = `<w:p><w:pPr><w:ind w:right="-430.8661417322827"/><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/><w:b w:val="1"/><w:bCs w:val="1"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:rtl w:val="0"/></w:rPr><w:t xml:space="preserve">DA PRESCRIÇÃO DECENAL APLICÁVEL À REPETIÇÃO DO INDÉBITO</w:t></w:r><w:r><w:rPr><w:rtl w:val="0"/></w:rPr></w:r></w:p>`;

const CORPO_DECENAL_XML = `<w:p><w:pPr><w:ind w:right="-430.8661417322827"/><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/><w:b w:val="1"/><w:bCs w:val="1"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:rtl w:val="0"/></w:rPr><w:t xml:space="preserve">Preliminarmente, cumpre afastar qualquer alegação de prescrição que venha a ser suscitada pela instituição financeira ré, especialmente no que tange ao prazo aplicável à repetição do indébito.</w:t><w:br w:type="textWrapping"/><w:br w:type="textWrapping"/><w:tab/><w:t xml:space="preserve">O Banco Réu poderá alegar, em sua defesa, a aplicação do prazo trienal previsto no art. 206, §3º, IV, do Código Civil, que estabelece prescrição de três anos para a pretensão de ressarcimento de enriquecimento sem causa. Ocorre que tal dispositivo não se aplica ao caso concreto.</w:t><w:br w:type="textWrapping"/><w:br w:type="textWrapping"/><w:tab/><w:t xml:space="preserve">Com efeito, a pretensão de repetição de indébito decorrente de cobrança indevida em relação contratual não se confunde com o enriquecimento sem causa, mas sim com o inadimplemento contratual ou com a responsabilidade civil por ato ilícito, hipóteses em que se aplica o prazo prescricional decenal previsto no art. 205 do Código Civil.</w:t><w:br w:type="textWrapping"/><w:br w:type="textWrapping"/><w:tab/><w:t xml:space="preserve">Nesse sentido, o </w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/><w:b w:val="1"/><w:bCs w:val="1"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:rtl w:val="0"/></w:rPr><w:t xml:space="preserve">Superior Tribunal de Justiça consolidou entendimento no sentido de que "a pretensão de restituição de quantias pagas indevidamente em decorrência de contrato eivado de nulidade ou anulabilidade sujeita-se ao prazo prescricional decenal previsto no art. 205 do Código Civil, e não ao prazo trienal do art. 206, §3º, IV, do mesmo diploma legal"</w:t></w:r><w:r><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:rtl w:val="0"/></w:rPr><w:t xml:space="preserve"> (STJ, REsp 1.631.903/SP, Rel. Ministra Nancy Andrighi, Terceira Turma, julgado em 27/02/2018).</w:t><w:br w:type="textWrapping"/><w:br w:type="textWrapping"/><w:tab/><w:t xml:space="preserve">Assim, considerando que os descontos impugnados decorrem de suposta relação contratual (cuja existência e validade o banco não comprovou), e não de enriquecimento sem causa, aplica-se o prazo prescricional de 10 (dez) anos, nos termos do art. 205 do Código Civil.</w:t><w:br w:type="textWrapping"/><w:br w:type="textWrapping"/><w:tab/><w:t xml:space="preserve">Portanto, todos os descontos realizados nos últimos 10 anos anteriores ao ajuizamento da presente ação devem ser objeto de repetição, afastando-se qualquer limitação temporal mais restritiva.</w:t></w:r><w:r><w:rPr><w:rtl w:val="0"/></w:rPr></w:r></w:p>`;

/**
 * Aplica a regra da prescrição decenal sobre o document.xml já renderizado:
 *   - tópico existe + não precisa  → remove (heading + parágrafo de corpo)
 *   - tópico ausente + precisa     → insere antes de "DO DIREITO"
 *                                    (heading clona o estilo local do "DO DIREITO";
 *                                     corpo é o bloco verbatim do padrão)
 *   - existe+precisa / ausente+não → não mexe
 * Decisão vem de calcularPrescricaoDecenal (detector + override). Defensivo:
 * qualquer falha mantém o template intacto.
 */
function aplicarPrescricaoDecenal(documentXml) {
  let dec;
  try {
    const ov = (state.dadosPacote3 && state.dadosPacote3.prescricao_decenal_override) || null;
    dec = calcularPrescricaoDecenal(ov);
  } catch (e) {
    console.warn('[decenal] erro ao calcular decisão — template mantido:', e);
    return documentXml;
  }

  const textOf = s => (s.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
    .map(t => t.replace(/<[^>]+>/g, '')).join('');
  const paras = [...documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)];
  const headIdx = paras.findIndex(m => textOf(m[0]).includes('PRESCRIÇÃO DECENAL APLICÁVEL'));
  const existe = headIdx !== -1;

  // existe e não precisa → remove heading + parágrafo de corpo seguinte
  if (existe && !dec.incluir) {
    const h = paras[headIdx];
    const b = paras[headIdx + 1];
    const fim = b ? (b.index + b[0].length) : (h.index + h[0].length);
    console.log('[decenal] tópico removido (descontos dentro de 5 anos / forçado).');
    return documentXml.slice(0, h.index) + documentXml.slice(fim);
  }

  // ausente e precisa → insere antes de "DO DIREITO"
  if (!existe && dec.incluir) {
    const anchorIdx = paras.findIndex(m => textOf(m[0]).trim().toUpperCase() === 'DO DIREITO');
    if (anchorIdx === -1) {
      console.warn('[decenal] tópico necessário, mas âncora "DO DIREITO" não encontrada — peça segue sem o tópico.');
      return documentXml;
    }
    const anchor = paras[anchorIdx];
    // Heading: clona o parágrafo "DO DIREITO" local (mantém estilo do template)
    // e troca o texto. Se o texto estiver fragmentado em runs, cai no verbatim.
    let headingXml = anchor[0].replace(/(<w:t[^>]*>)\s*DO DIREITO\s*(<\/w:t>)/, '$1' + escXml(HEADING_DECENAL) + '$2');
    if (headingXml === anchor[0]) headingXml = HEADING_DECENAL_XML;
    // Remove IDs de parágrafo do clone pra não colidir com o "DO DIREITO" original.
    headingXml = headingXml.replace(/\sw14:paraId="[^"]*"/g, '').replace(/\sw14:textId="[^"]*"/g, '');
    const bloco = headingXml + CORPO_DECENAL_XML;
    console.log('[decenal] tópico inserido antes de "DO DIREITO" (desconto > 5 anos / forçado).');
    return documentXml.slice(0, anchor.index) + bloco + documentXml.slice(anchor.index);
  }

  return documentXml;
}

/* =========================================================================
   QUADRO SOCIOECONÔMICO — tópico de ABERTURA das peças de Bradesco.
   Injetado programaticamente (mesma técnica da prescrição decenal) pra NÃO
   precisar editar os 10 templates .docx. Entra LOGO APÓS o título do tipo de
   ação ("AÇÃO ...") e antes de "DA REUNIÃO DE DEMANDAS...",
   com título próprio "DO QUADRO SOCIOECONÔMICO DE [NOME EM CAIXA ALTA]" e um
   parágrafo humanizado (IA, com fallback local garantido em gerarQuadro-
   SocioeconomicoLocal). Escopo: só produtos que têm a zona ia_quadro_-
   socioeconomico (os de Bradesco). Defensivo: qualquer falha mantém o
   template intacto.
   ========================================================================= */
function paragrafoSocioeconXml(txt, ehTitulo) {
  const rpr = ehTitulo
    ? '<w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/><w:b w:val="1"/><w:bCs w:val="1"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:rtl w:val="0"/>'
    : '<w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:rtl w:val="0"/>';
  const tab = ehTitulo ? '' : '<w:tab/>';
  return `<w:p><w:pPr><w:ind w:right="-430.8661417322827"/><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="Cambria" w:cs="Cambria" w:eastAsia="Cambria" w:hAnsi="Cambria"/></w:rPr></w:pPr><w:r><w:rPr>${rpr}</w:rPr>${tab}<w:t xml:space="preserve">${escXml(txt)}</w:t></w:r></w:p>`;
}

function aplicarQuadroSocioeconomico(documentXml) {
  try {
    const ehBradesco = state.produtoSelecionado && Array.isArray(state.produtoSelecionado.zonas_ia)
      && state.produtoSelecionado.zonas_ia.some(z => z.tag === 'ia_quadro_socioeconomico');
    if (!ehBradesco) return documentXml;

    const textOf = s => (s.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
      .map(t => t.replace(/<[^>]+>/g, '')).join('');
    const paras = [...documentXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)];

    // idempotência: se o tópico já existe (reprocessamento), não duplica
    if (paras.some(m => textOf(m[0]).toUpperCase().includes('QUADRO SOCIOECONÔMICO DE'))) {
      return documentXml;
    }

    const nome = ((state.dadosPacote1 && state.dadosPacote1.nome_completo) || '').trim();
    const nomeUpper = nome.toLocaleUpperCase('pt-BR');
    if (!nomeUpper) { console.warn('[socioecon] sem nome do cliente — tópico não inserido.'); return documentXml; }

    // Corpo: texto da IA (n8n) ou fallback local garantido.
    let corpo = ((state.trechosIA && state.trechosIA.ia_quadro_socioeconomico) || '').trim();
    if (!corpo && typeof gerarQuadroSocioeconomicoLocal === 'function') corpo = gerarQuadroSocioeconomicoLocal();
    if (!corpo) return documentXml;

    // O preâmbulo do TIPO DE AÇÃO são DOIS parágrafos: o título "AÇÃO ..." e o
    // "Em desfavor de {réu}..." que o completa (nomeia o banco e a base legal).
    // O quadro entra APÓS esse preâmbulo INTEIRO (depois do "Em desfavor de..."),
    // antes do primeiro tópico seguinte — no mix Bradesco, antes de "DA REUNIÃO
    // DE DEMANDAS...". Inserir entre os dois partiria a frase do preâmbulo.
    const acaoIdx = paras.findIndex(m => textOf(m[0]).trim().toUpperCase().startsWith('AÇÃO '));
    let anchorIdx = -1;
    if (acaoIdx !== -1) {
      for (let i = acaoIdx; i < paras.length; i++) {
        if (textOf(paras[i][0]).trim().toUpperCase().startsWith('EM DESFAVOR DE')) { anchorIdx = i; break; }
      }
    }
    if (anchorIdx === -1) anchorIdx = acaoIdx; // fallback: após o próprio "AÇÃO ..."
    if (anchorIdx === -1) { console.warn('[socioecon] preâmbulo do tipo de ação não encontrado — tópico não inserido.'); return documentXml; }
    const anchor = paras[anchorIdx];

    const heading = paragrafoSocioeconXml('DO QUADRO SOCIOECONÔMICO DE ' + nomeUpper, true);
    const corpoParas = corpo.split(/\n+/).map(s => s.trim()).filter(Boolean)
      .map(p => paragrafoSocioeconXml(p, false)).join('');
    const bloco = heading + corpoParas;
    // Insere APÓS o parágrafo âncora ("Em desfavor de...", fim do preâmbulo).
    const posDepois = anchor.index + anchor[0].length;
    console.log('[socioecon] tópico inserido após o preâmbulo do tipo de ação.');
    return documentXml.slice(0, posDepois) + bloco + documentXml.slice(posDepois);
  } catch (e) {
    console.warn('[socioecon] erro — template mantido:', e);
    return documentXml;
  }
}

/**
 * Monta o XML OOXML completo da tabela de descontos, fiel à planilha:
 * preserva subtítulos mesclados, cabeçalho, linhas de dados, e linhas de
 * VALOR TOTAL / VALOR EM DOBRO.
 *
 * Recebe o array `linhasClassificadas` produzido por processarTabelaXlsx.
 * Se for null/undefined, retorna um parágrafo único de aviso.
 */
/**
 * REVISOR-CORRETOR AUTOMÁTICO — toma o document.xml final e:
 * 1. UNIFORMIZA a margem direita (w:ind:right) de todos os parágrafos
 *    de BODY (fora de tabelas) usando o valor majoritário do template.
 *    Parágrafos sem ind:right ganham um; com valor diferente, são reescritos.
 *    Tabelas (parágrafos dentro de <w:tbl>...</w:tbl>) NÃO são tocadas.
 * 2. REPORTA o que não pôde corrigir automaticamente (placeholders pendentes,
 *    tabela de descontos não injetada — bugs de programação raros).
 *
 * Retorna { xml: novaXml, relatorio: { fixes:[], issuesIrrecuperaveis:[] } }.
 */
function revisarECorrigirPeca(xml) {
  const fixes = [];
  const issuesIrrecuperaveis = [];

  // === FASE 1: identifica intervalos de tabela pra excluí-los do fix de margem ===
  const intervalosTabela = [];
  const tblRe = /<w:tbl\b[\s\S]*?<\/w:tbl>/g;
  let tm;
  while ((tm = tblRe.exec(xml))) {
    intervalosTabela.push([tm.index, tm.index + tm[0].length]);
  }
  function dentroDeTabela(pos) {
    return intervalosTabela.some(([ini, fim]) => pos >= ini && pos < fim);
  }

  // === FASE 2: detecta o ind:right majoritário entre parágrafos do BODY ===
  const counts = {};
  const pReDetect = /<w:p\b[\s\S]*?<\/w:p>/g;
  let pmd;
  while ((pmd = pReDetect.exec(xml))) {
    if (dentroDeTabela(pmd.index)) continue;
    const im = pmd[0].match(/<w:ind[^/]*w:right="(-?[0-9]+)"/);
    if (im) counts[im[1]] = (counts[im[1]] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const indDominante = sorted.length ? sorted[0][0] : null;

  // === FASE 3: força todos parágrafos de body a usar o ind dominante ===
  if (indDominante !== null) {
    let totalCorrigidos = 0;
    let novaXml = '';
    let cursor = 0;
    const pReFix = /<w:p\b[\s\S]*?<\/w:p>/g;
    let pmf;
    while ((pmf = pReFix.exec(xml))) {
      const inicio = pmf.index;
      const fim = pmf.index + pmf[0].length;
      novaXml += xml.slice(cursor, inicio);
      let para = pmf[0];
      if (!dentroDeTabela(inicio)) {
        const indMatch = para.match(/<w:ind\b[^/]*w:right="(-?[0-9]+)"[^/]*\/>/);
        if (indMatch) {
          // Tem ind:right — substitui se diferente
          if (indMatch[1] !== indDominante) {
            const novoInd = indMatch[0].replace(/w:right="(-?[0-9]+)"/, 'w:right="' + indDominante + '"');
            para = para.replace(indMatch[0], novoInd);
            totalCorrigidos++;
          }
        } else {
          // Não tem ind:right — adiciona dentro do <w:pPr> (ou cria pPr)
          if (/<w:pPr\b[^>]*>/.test(para)) {
            // pPr existe, insere <w:ind w:right="X"/> logo após a abertura
            para = para.replace(/(<w:pPr\b[^>]*>)/, '$1<w:ind w:right="' + indDominante + '"/>');
          } else {
            // pPr não existe, cria entre <w:p> e o primeiro filho
            para = para.replace(/(<w:p\b[^>]*>)/, '$1<w:pPr><w:ind w:right="' + indDominante + '"/></w:pPr>');
          }
          totalCorrigidos++;
        }
      }
      novaXml += para;
      cursor = fim;
    }
    novaXml += xml.slice(cursor);
    if (totalCorrigidos > 0) {
      fixes.push('uniformizou margem direita em ' + totalCorrigidos + ' parágrafo(s) de body (ind:right=' + indDominante + ')');
    }
    xml = novaXml;
  }

  // === FASE 4: detecta issues que NÃO dá pra auto-corrigir (são bugs nossos) ===

  // 4a. Placeholders {nome_var} pendentes — variável ausente no contexto
  const phMatch = xml.match(/\{[a-z_][a-z0-9_]{2,}\}/g);
  if (phMatch && phMatch.length) {
    const reais = [...new Set(phMatch)].filter(p => !/^\{(end|else|if)\}$/i.test(p));
    if (reais.length) {
      issuesIrrecuperaveis.push('placeholder(s) sem valor: ' + reais.slice(0, 8).join(', ') + (reais.length > 8 ? ' …' : ''));
    }
  }
  // 4b. Placeholders [VALOR]/[NÚMERO] originais sobrando — bug do generator
  const colchete = xml.match(/\[(?:VALOR|NÚMERO|NOME[^\]]*|VALOR TOTAL)\]/g);
  if (colchete && colchete.length) {
    issuesIrrecuperaveis.push('placeholder(s) original(is) do docx pendente(s): ' + [...new Set(colchete)].join(', '));
  }
  // 4c. Tabela ZZTABELADESCONTOSZZ não injetada — bug de ordem de execução
  if (xml.includes('ZZTABELADESCONTOSZZ')) {
    issuesIrrecuperaveis.push('marker ZZTABELADESCONTOSZZ não foi substituído pela tabela');
  }

  // === FASE 5: corrige hanging indent em parágrafos CENTRALIZADOS ===
  // Bug histórico: em alguns templates (template-padrao tinha isso no parágrafo
  // do Matheus na assinatura), um <w:p> com <w:jc w:val="center"/> também tem
  // <w:ind ... w:hanging="N"/>. Hanging+center desloca o texto pra esquerda do
  // ponto centralizado real. Como hanging não faz sentido em texto centralizado,
  // removemos a propriedade w:hanging desses parágrafos. Aplicável a TODOS os
  // produtos (não só Mix Bradesco) — corrige uma classe inteira de bugs de
  // alinhamento de assinaturas, títulos, tabelas centradas, etc.
  {
    let totalHangingRemovido = 0;
    let novaXml2 = '';
    let cursor2 = 0;
    const pReHang = /<w:p\b[\s\S]*?<\/w:p>/g;
    let pmh;
    while ((pmh = pReHang.exec(xml))) {
      const inicio = pmh.index;
      const fim = pmh.index + pmh[0].length;
      novaXml2 += xml.slice(cursor2, inicio);
      let para = pmh[0];
      if (!dentroDeTabela(inicio)) {
        const ehCentro = /<w:jc\s+w:val="center"\s*\/>/.test(para);
        const temHanging = /<w:ind\b[^/]*w:hanging="(-?\d+(?:\.\d+)?)"/.test(para);
        if (ehCentro && temHanging) {
          // Remove apenas o atributo w:hanging="..." do <w:ind/>
          para = para.replace(/(<w:ind\b[^/]*)\s*w:hanging="(-?\d+(?:\.\d+)?)"/, '$1');
          totalHangingRemovido++;
        }
      }
      novaXml2 += para;
      cursor2 = fim;
    }
    novaXml2 += xml.slice(cursor2);
    if (totalHangingRemovido > 0) {
      fixes.push('removeu w:hanging em ' + totalHangingRemovido + ' parágrafo(s) centralizado(s) (corrige alinhamento de assinaturas/títulos)');
    }
    xml = novaXml2;
  }

  // === FASE 5b: concordância singular/plural quando há APENAS 1 desconto ===
  // Quando a planilha tem só 1 linha de dado, as peças (que foram escritas
  // assumindo plural — "os descontos", "as cobranças") ficam com concordância
  // errada. Detectamos o caso e aplicamos substituições conservadoras no body
  // (FORA de tabelas) trocando plural → singular em frases-chave da peça.
  // Aplicável a TODOS os produtos automaticamente.
  {
    const tab = state.anexos && state.anexos.tabelaXlsx;
    const numDescontos = (tab && typeof tab === 'object' && Array.isArray(tab.linhasClassificadas))
      ? tab.linhasClassificadas.filter(l => l.tipo === 'dado').length
      : 0;

    if (numDescontos === 1) {
      // Lista de substituições plural → singular. Cada item é [regex_busca, substituicao].
      // ESCOPO: aplicado APENAS no body fora de tabelas (intervalosTabela exclui).
      // Estratégia conservadora: foco em frases típicas de DOS FATOS/DOS DANOS/PEDIDOS
      // que se referem AOS descontos do caso concreto. Evita verbos/substantivos
      // que possam aparecer em citações de jurisprudência (onde plural é correto).
      const subs = [
        // Substantivo + artigo: "os descontos" / "as cobranças"
        [/\bOs descontos\b/g,                 'O desconto'],
        [/\bos descontos\b/g,                 'o desconto'],
        [/\bdos descontos\b/g,                'do desconto'],
        [/\baos descontos\b/g,                'ao desconto'],
        [/\bnos descontos\b/g,                'no desconto'],
        [/\bAs cobranças\b/g,                 'A cobrança'],
        [/\bas cobranças\b/g,                 'a cobrança'],
        [/\bdas cobranças\b/g,                'da cobrança'],
        [/\bàs cobranças\b/g,                 'à cobrança'],
        // Demonstrativos
        [/\besses descontos\b/g,              'esse desconto'],
        [/\bEsses descontos\b/g,              'Esse desconto'],
        [/\btais descontos\b/g,               'tal desconto'],
        [/\bTais descontos\b/g,               'Tal desconto'],
        [/\bessas cobranças\b/g,              'essa cobrança'],
        [/\bEssas cobranças\b/g,              'Essa cobrança'],
        // Adjetivos + descontos
        [/\bdescontos realizados\b/g,         'desconto realizado'],
        [/\bDescontos realizados\b/g,         'Desconto realizado'],
        [/\bdescontos impugnados\b/g,         'desconto impugnado'],
        [/\bdescontos indevidos\b/g,          'desconto indevido'],
        [/\bdescontos abusivos\b/g,           'desconto abusivo'],
        [/\bdescontos sistemáticos\b/g,       'desconto sistemático'],
        // Adjetivos + cobranças
        [/\bcobranças anuais\b/g,             'cobrança anual'],
        [/\bcobranças mensais\b/g,            'cobrança mensal'],
        [/\bcobranças indevidas\b/g,          'cobrança indevida'],
        [/\bcobranças reiteradas\b/g,         'cobrança reiterada'],
        [/\bcobranças totalizam\b/g,          'cobrança totaliza'],
        [/\bcobranças sob a rubrica\b/g,      'cobrança sob a rubrica'],
        // Verbos conjugados em 3ª plural → singular (usados em frases-chave)
        [/\bOs descontos totalizam\b/g,       'O desconto totaliza'],
        [/\bos descontos totalizam\b/g,       'o desconto totaliza'],
        [/\bperfazem o valor\b/g,             'perfaz o valor'],
        [/\bperfazem o montante\b/g,          'perfaz o montante'],
        [/\bpassaram a ser efetuados\b/g,     'passou a ser efetuado'],
        [/\bpassaram a ser efetuadas\b/g,     'passou a ser efetuada'],
        [/\bforam efetuadas cobranças\b/g,    'foi efetuada cobrança'],
        [/\bforam efetuados descontos\b/g,    'foi efetuado desconto'],
        // Frase específica do template-padrao DOS FATOS
        [/\bsubtrações patrimoniais reiteradas e abusivas\b/g,
                                              'subtração patrimonial abusiva'],
        [/\bsubtrações patrimoniais\b/g,      'subtração patrimonial'],
        [/\bdescontos automáticos\b/g,        'desconto automático'],
        [/\bvalores cobrados\b/g,             'valor cobrado'],
        [/\bValores cobrados\b/g,             'Valor cobrado'],
        [/\bvalores subtraídos\b/g,           'valor subtraído'],
        [/\bvalores indevidos\b/g,            'valor indevido'],
        [/\bvalores indevidamente cobrados\b/g, 'valor indevidamente cobrado'],
      ];

      // Aplica substituições percorrendo o XML chunk-a-chunk, pulando intervalos
      // de tabela. Cada chunk de body recebe TODAS as substituições; tabelas
      // são preservadas intactas.
      let novaXml3 = '';
      let cursor3 = 0;
      let totalConcord = 0;
      const intervalosOrdenados = intervalosTabela.slice().sort((a, b) => a[0] - b[0]);
      for (const [ini, fim] of intervalosOrdenados) {
        let chunk = xml.slice(cursor3, ini);
        for (const [re, repl] of subs) {
          chunk = chunk.replace(re, (m) => { totalConcord++; return repl; });
        }
        novaXml3 += chunk + xml.slice(ini, fim);
        cursor3 = fim;
      }
      // Resto após última tabela (ou doc inteiro se não tem tabela)
      let resto = xml.slice(cursor3);
      for (const [re, repl] of subs) {
        resto = resto.replace(re, (m) => { totalConcord++; return repl; });
      }
      novaXml3 += resto;

      if (totalConcord > 0) {
        fixes.push('aplicou ' + totalConcord + ' concordância(s) singular (caso com 1 desconto único)');
      }
      xml = novaXml3;
    }
  }

  // === FASE 5d: concordância de gênero — substitui parentéticos (a)/(o) ===
  // Templates antigos têm formas como "domiciliado(a)", "representado(a)",
  // "seu(sua) advogado(a)", "no(a)" — indefinidas. Aqui resolvemos cada uma
  // pra forma correta baseada em state.dadosPacote2.cliente.genero. Vale pra
  // TODOS os produtos automaticamente.
  {
    const c = (state.dadosPacote2 && state.dadosPacote2.cliente) || {};
    const generoFem = c.genero === 'feminino' || c.genero === 'F';

    // Tabelas de substituição (regex global + replacement por gênero).
    // Estratégia: as parentheticals SEMPRE têm uma forma base + variação no
    // parêntese. Para masculino, descartamos o parêntese e mantemos a base.
    // Para feminino, aplicamos a variação.
    const subsParenteticos = generoFem ? [
      // word terminating in 'o' followed by (a): troca 'o' final por 'a'
      [/\bdomiciliado\(a\)/g,       'domiciliada'],
      [/\bdomiciliada\(o\)/g,       'domiciliada'],
      [/\brepresentado\(a\)/g,      'representada'],
      [/\brepresentada\(o\)/g,      'representada'],
      [/\bassinado\(a\)/g,          'assinada'],
      [/\bassinada\(o\)/g,          'assinada'],
      [/\bcasado\(a\)/g,            'casada'],
      [/\binformado\(a\)/g,         'informada'],
      [/\bcobrado\(a\)/g,           'cobrada'],
      [/\bautorizado\(a\)/g,        'autorizada'],
      // substantivos com (a) — feminino:
      [/\badvogado\(a\)/g,          'advogada'],
      [/\badvogada\(o\)/g,          'advogada'],
      [/\bautor\(a\)/g,             'autora'],
      [/\bsenhor\(a\)/g,            'senhora'],
      [/\bdoutor\(a\)/g,            'doutora'],
      [/\binscrito\(a\)/g,          'inscrita'],
      [/\bportador\(a\)/g,          'portadora'],
      // pronomes/artigos com parênteses:
      [/\bseu\(sua\)/g,             'sua'],
      [/\bsua\(seu\)/g,             'sua'],
      [/\bseu\(s\)\/sua\(s\)/g,     'sua'],
      [/\bno\(a\)/g,                'na'],
      [/\bna\(o\)/g,                'na'],
      [/\bdo\(a\)/g,                'da'],
      [/\bda\(o\)/g,                'da'],
      [/\bo\(a\)\s/g,               'a '],
      [/\ba\(o\)\s/g,               'a '],
      [/\bos\(as\)\s/g,             'as '],
    ] : [
      // Masculino: remove o parêntese, mantém forma base
      [/\bdomiciliado\(a\)/g,       'domiciliado'],
      [/\bdomiciliada\(o\)/g,       'domiciliado'],
      [/\brepresentado\(a\)/g,      'representado'],
      [/\brepresentada\(o\)/g,      'representado'],
      [/\bassinado\(a\)/g,          'assinado'],
      [/\bassinada\(o\)/g,          'assinado'],
      [/\bcasado\(a\)/g,            'casado'],
      [/\binformado\(a\)/g,         'informado'],
      [/\bcobrado\(a\)/g,           'cobrado'],
      [/\bautorizado\(a\)/g,        'autorizado'],
      [/\badvogado\(a\)/g,          'advogado'],
      [/\badvogada\(o\)/g,          'advogado'],
      [/\bautor\(a\)/g,             'autor'],
      [/\bsenhor\(a\)/g,            'senhor'],
      [/\bdoutor\(a\)/g,            'doutor'],
      [/\binscrito\(a\)/g,          'inscrito'],
      [/\bportador\(a\)/g,          'portador'],
      [/\bseu\(sua\)/g,             'seu'],
      [/\bsua\(seu\)/g,             'seu'],
      [/\bseu\(s\)\/sua\(s\)/g,     'seu'],
      [/\bno\(a\)/g,                'no'],
      [/\bna\(o\)/g,                'no'],
      [/\bdo\(a\)/g,                'do'],
      [/\bda\(o\)/g,                'do'],
      [/\bo\(a\)\s/g,               'o '],
      [/\ba\(o\)\s/g,               'o '],
      [/\bos\(as\)\s/g,             'os '],
    ];

    // Aplica também em hardcoded "seu advogado" quando feminino (assume
    // que se a cliente é mulher, a peça vai com "sua advogada" — alinha com
    // o gênero do cliente que assina, não do(a) advogado(a) específico).
    // Só faz substituição se NÃO houver evidência contrária explícita.
    if (generoFem) {
      subsParenteticos.push(
        [/\bseu advogado\b/g,             'sua advogada'],
        [/\bSeu advogado\b/g,             'Sua advogada'],
        [/\badvogado abaixo-assinado\b/g, 'advogada abaixo-assinada'],
        [/\badvogado in fine\b/g,         'advogada in fine'],
        [/\bpelo seu advogado\b/g,        'pela sua advogada'],
        [/\bdo seu advogado\b/g,          'da sua advogada'],
      );
    }

    // Aplica em body fora de tabelas
    let novaXml4 = '';
    let cursor4 = 0;
    let totalGen = 0;
    const intervalosOrd = intervalosTabela.slice().sort((a, b) => a[0] - b[0]);
    for (const [ini, fim] of intervalosOrd) {
      let chunk = xml.slice(cursor4, ini);
      for (const [re, repl] of subsParenteticos) {
        chunk = chunk.replace(re, (m) => { totalGen++; return repl; });
      }
      novaXml4 += chunk + xml.slice(ini, fim);
      cursor4 = fim;
    }
    let resto2 = xml.slice(cursor4);
    for (const [re, repl] of subsParenteticos) {
      resto2 = resto2.replace(re, (m) => { totalGen++; return repl; });
    }
    novaXml4 += resto2;
    if (totalGen > 0) {
      fixes.push('aplicou ' + totalGen + ' concordância(s) de gênero (cliente ' + (generoFem ? 'feminino' : 'masculino') + ')');
    }
    xml = novaXml4;
  }

  // === FASE 5e: limpa artefatos de placeholders vazios ===
  // Quando cliente não tem RG/órgão expedidor, o template renderiza
  // "portadora do RG nº  , inscrita..." que vira "º inscrita" ou trecho
  // estranho após reduções. Detectamos e limpamos.
  {
    const limpezas = [
      // "do RG nº  " (vazio com dupla espaço) seguido de vírgula → remove segmento inteiro
      [/(\bportadora?\s+)do RG nº\s{2,},\s*/gi, '$1'],
      [/(\bportadora?\s+)do RG n\.?º\s{2,},\s*/gi, '$1'],
      // Variante sem portador prefixado (raro): "do RG nº  ,"
      [/\bdo RG nº\s{2,},\s*/gi, ''],
      // Caso o cliente_portador também esteja vazio: "Profissão,  º , inscrita"
      // sobrava só " º ," — limpa
      [/,\s+º\s+,/g, ','],
      [/,\s+º\s+(\w)/g, ', $1'],
      // Duplo espaço residual
      [/\s{3,}/g, '  '],
    ];

    let cleanCount = 0;
    let xmlClean = '';
    let cursor5 = 0;
    const intervalosOrd2 = intervalosTabela.slice().sort((a, b) => a[0] - b[0]);
    for (const [ini, fim] of intervalosOrd2) {
      let chunk = xml.slice(cursor5, ini);
      for (const [re, repl] of limpezas) {
        chunk = chunk.replace(re, (m) => { cleanCount++; return typeof repl === 'function' ? repl(m) : repl; });
      }
      xmlClean += chunk + xml.slice(ini, fim);
      cursor5 = fim;
    }
    let resto3 = xml.slice(cursor5);
    for (const [re, repl] of limpezas) {
      resto3 = resto3.replace(re, (m) => { cleanCount++; return repl; });
    }
    xmlClean += resto3;
    if (cleanCount > 0) {
      fixes.push('limpou ' + cleanCount + ' artefato(s) de placeholder vazio (RG/órgão expedidor sem valor)');
    }
    xml = xmlClean;
  }

  // === FASE 5f: divide parágrafos muito longos (typically IA-generated) ===
  // O webhook de IA às vezes retorna 5-6 sentenças num bloco único, que vira
  // um parágrafo gigante na peça. Aqui detectamos parágrafos de body com mais
  // de 700 chars de texto, e tentamos dividir em 2-3 partes em fronteiras de
  // sentença (". " antes de letra maiúscula). Pula ementas/citações pra não
  // bagunçar trechos jurisprudenciais.
  {
    let totalSplit = 0;
    let novaXml5 = '';
    let cursor6 = 0;
    const pReSplit = /<w:p\b[\s\S]*?<\/w:p>/g;
    let pms;
    // Marcadores que indicam citação/ementa — não dividimos esses parágrafos
    const citacaoMarkers = [
      'Ementa:', 'Apelação Cível', 'REsp ', 'AgInt', 'Súmula', '(TJ-AM',
      'Relator', 'Rel. Min', '(STJ', '(STF', 'Câmara Cível', 'Turma Recursal'
    ];
    while ((pms = pReSplit.exec(xml))) {
      const inicio = pms.index;
      const fim = pms.index + pms[0].length;
      novaXml5 += xml.slice(cursor6, inicio);
      let para = pms[0];

      if (!dentroDeTabela(inicio)) {
        // Extrai texto concatenando todos os <w:t>
        const textos = [];
        const tRe = /<w:t[^>]*>([^<]*)<\/w:t>/g;
        let tm2;
        while ((tm2 = tRe.exec(para))) textos.push(tm2[1]);
        const textoTotal = textos.join('');

        // Verifica se é candidato a split
        const ehCitacao = citacaoMarkers.some(m => textoTotal.includes(m));
        if (!ehCitacao && textoTotal.length > 700) {
          // Encontra todas as posições de ". " seguido por letra maiúscula
          // (fronteira clara de sentença). Procura splits perto de 50% e 75%.
          const splits = [];
          for (let i = 50; i < textoTotal.length - 50; i++) {
            const trecho = textoTotal.slice(i, i + 3);
            if (trecho.match(/^\.\s[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/)) {
              splits.push(i + 2); // posição APÓS o ". "
            }
          }
          if (splits.length > 0) {
            // Escolhe 1 ou 2 splits: o(s) mais próximo(s) de 1/2 e 2/3 do total
            const split1 = splits.reduce((a, b) =>
              Math.abs(b - textoTotal.length / 2) < Math.abs(a - textoTotal.length / 2) ? b : a
            );
            const splitPos = textoTotal.length > 1200
              ? [split1, splits.reduce((a, b) =>
                  Math.abs(b - textoTotal.length * 0.66) < Math.abs(a - textoTotal.length * 0.66) ? b : a
                )].filter((v, i, arr) => arr.indexOf(v) === i && v > split1).slice(0, 2)
              : [split1];

            // Extrai <w:pPr>...</w:pPr> e estrutura runs pra reconstruir
            const pPrMatch = para.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
            const pPr = pPrMatch ? pPrMatch[0] : '<w:pPr/>';
            const pOpenMatch = para.match(/^<w:p\b[^>]*>/);
            const pOpen = pOpenMatch ? pOpenMatch[0] : '<w:p>';

            // Detecta rPr básico do primeiro <w:r>
            const rPrMatch = para.match(/<w:r\b[^>]*><w:rPr>([\s\S]*?)<\/w:rPr>/);
            const rPrInner = rPrMatch ? rPrMatch[1] : '<w:rtl w:val="0"/>';

            // Quebra o texto em chunks
            const positions = [0, ...splitPos.sort((a,b)=>a-b), textoTotal.length];
            const chunks = [];
            for (let i = 0; i < positions.length - 1; i++) {
              chunks.push(textoTotal.slice(positions[i], positions[i+1]).trim());
            }

            function escXml(s) {
              return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            }
            // Constrói novos parágrafos com mesmo pPr/rPr
            const novosParas = chunks.filter(c => c.length > 0).map(c =>
              pOpen + pPr +
              '<w:r><w:rPr>' + rPrInner + '</w:rPr>' +
              '<w:t xml:space="preserve">' + escXml(c) + '</w:t>' +
              '</w:r></w:p>'
            ).join('');

            para = novosParas;
            totalSplit++;
          }
        }
      }
      novaXml5 += para;
      cursor6 = fim;
    }
    novaXml5 += xml.slice(cursor6);
    if (totalSplit > 0) {
      fixes.push('dividiu ' + totalSplit + ' parágrafo(s) muito longo(s) em sub-parágrafos (separação de sentenças)');
    }
    xml = novaXml5;
  }

  // === FASE 6: relatório consolidado da revisão final ===
  // Loga TODAS as correções aplicadas e issues remanescentes pro console,
  // facilitando diagnóstico de problemas de formatação. É o "fluxo de revisão
  // final" que verifica se a peça saiu corretamente formatada antes de devolver
  // o arquivo ao usuário.
  if (fixes.length > 0 || issuesIrrecuperaveis.length > 0) {
    console.group('[revisarECorrigirPeca] Revisão final da peça');
    if (fixes.length > 0) {
      console.log('✓ Correções aplicadas automaticamente:');
      fixes.forEach(f => console.log('  -', f));
    }
    if (issuesIrrecuperaveis.length > 0) {
      console.warn('⚠ Issues que precisam de atenção (não auto-corrigíveis):');
      issuesIrrecuperaveis.forEach(i => console.warn('  -', i));
    }
    console.groupEnd();
  } else {
    console.log('[revisarECorrigirPeca] ✓ Nenhum issue de formatação detectado.');
  }

  return { xml, relatorio: { fixes, issuesIrrecuperaveis } };
}

function montarTabelaXmlDescontos(linhasClassificadas) {
  if (!Array.isArray(linhasClassificadas) || linhasClassificadas.length === 0) {
    // Tabela pulada ou ausente — parágrafo de aviso no lugar
    return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>` +
      `<w:r><w:rPr><w:i/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr>` +
      `<w:t>Tabela de descontos a ser anexada posteriormente.</w:t></w:r></w:p>`;
  }

  // Larguras de coluna em DXA (1/20 pt). Total ~8800 DXA = ~15,5cm
  // Valor BUMPADO de 1700→2200 pra caber "R$ 9.999.999,99" sem cortar.
  // Antes a coluna era estreita demais e o Google Docs cortava o último
  // dígito (ex: "R$ 200,00" virava "R$ 200,0"). 200 dxa de cell margin
  // (top/bot/left/right=100 cada) + texto Arial 10pt: 2200 dxa = ~3.9cm,
  // confortável pra qualquer valor monetário usual.
  const colWidths = [1500, 2400, 2700, 2200];
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);

  const cellBorders = `<w:tcBorders>` +
    `<w:top w:val="single" w:sz="6" w:space="0" w:color="000000"/>` +
    `<w:left w:val="single" w:sz="6" w:space="0" w:color="000000"/>` +
    `<w:bottom w:val="single" w:sz="6" w:space="0" w:color="000000"/>` +
    `<w:right w:val="single" w:sz="6" w:space="0" w:color="000000"/>` +
    `</w:tcBorders>`;

  let linhasXml = '';
  for (const l of linhasClassificadas) {
    if (l.tipo === 'cabecalho') {
      linhasXml += `<w:tr>` + ['Data', 'Descrição', 'Operação', 'Valor'].map((txt, i) => `
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="${colWidths[i]}" w:type="dxa"/>
            ${cellBorders}
            <w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          <w:p>
            <w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr>
            <w:r><w:rPr><w:b/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr><w:t>${escXml(txt)}</w:t></w:r>
          </w:p>
        </w:tc>`).join('') + `</w:tr>`;
    } else if (l.tipo === 'subtitulo') {
      linhasXml += `<w:tr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="${totalWidth}" w:type="dxa"/>
            <w:gridSpan w:val="4"/>
            ${cellBorders}
            <w:shd w:val="clear" w:color="auto" w:fill="BFBFBF"/>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          <w:p>
            <w:pPr><w:jc w:val="center"/><w:spacing w:before="60" w:after="60"/></w:pPr>
            <w:r><w:rPr><w:b/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr><w:t>${escXml(l.texto)}</w:t></w:r>
          </w:p>
        </w:tc>
      </w:tr>`;
    } else if (l.tipo === 'dado') {
      const valorFmt = isFinite(l.valor) ? `R$ ${formatarValorBR(l.valor)}` : '';
      const celulas = [
        { texto: l.data, align: 'center' },
        { texto: l.descricao, align: 'left' },
        { texto: l.operacao, align: 'left' },
        { texto: valorFmt, align: 'right' },
      ];
      linhasXml += `<w:tr>` + celulas.map((c, i) => `
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="${colWidths[i]}" w:type="dxa"/>
            ${cellBorders}
            <w:vAlign w:val="center"/>
          </w:tcPr>
          <w:p>
            <w:pPr><w:jc w:val="${c.align}"/><w:spacing w:before="40" w:after="40"/></w:pPr>
            <w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr><w:t xml:space="preserve">${escXml(c.texto)}</w:t></w:r>
          </w:p>
        </w:tc>`).join('') + `</w:tr>`;
    } else if (l.tipo === 'valor_total' || l.tipo === 'valor_dobro') {
      const label = l.tipo === 'valor_total' ? 'VALOR TOTAL' : 'VALOR EM DOBRO';
      const valorFmt = isFinite(l.valor) ? `R$ ${formatarValorBR(l.valor)}` : '';
      linhasXml += `<w:tr>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="${colWidths[0] + colWidths[1] + colWidths[2]}" w:type="dxa"/>
            <w:gridSpan w:val="3"/>
            ${cellBorders}
            <w:shd w:val="clear" w:color="auto" w:fill="FFFF99"/>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          <w:p>
            <w:pPr><w:jc w:val="left"/><w:spacing w:before="40" w:after="40"/></w:pPr>
            <w:r><w:rPr><w:b/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr><w:t>${escXml(label)}</w:t></w:r>
          </w:p>
        </w:tc>
        <w:tc>
          <w:tcPr>
            <w:tcW w:w="${colWidths[3]}" w:type="dxa"/>
            ${cellBorders}
            <w:shd w:val="clear" w:color="auto" w:fill="FFFF99"/>
            <w:vAlign w:val="center"/>
          </w:tcPr>
          <w:p>
            <w:pPr><w:jc w:val="right"/><w:spacing w:before="40" w:after="40"/></w:pPr>
            <w:r><w:rPr><w:b/><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr><w:t>${escXml(valorFmt)}</w:t></w:r>
          </w:p>
        </w:tc>
      </w:tr>`;
    }
  }

  const gridCols = colWidths.map(w => `<w:gridCol w:w="${w}"/>`).join('');

  // NOTA: o título "TABELA DE VALORES" JÁ EXISTE no template acima do
  // marcador ZZTABELADESCONTOSZZ — não precisamos injetar aqui.

  const tabela = `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="${totalWidth}" w:type="dxa"/>
      <w:jc w:val="center"/>
      <w:tblLayout w:type="fixed"/>
      <w:tblLook w:val="04A0"/>
    </w:tblPr>
    <w:tblGrid>${gridCols}</w:tblGrid>
    ${linhasXml}
  </w:tbl>`;

  return tabela;
}

/**
 * Converte string base64 em ArrayBuffer. Usado pra decodificar tanto o
 * template embutido quanto a selfie.
 */
function base64ParaArrayBuffer(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Aplica uma borda sutil na imagem (passa base64 → retorna base64 processado).
 * A borda é um retângulo de 3px de espessura com cor neutra, deixando a
 * foto "emoldurada" no documento final.
 */
function aplicarBordaSelfie(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const borda = 3;             // 3px de borda
      const corBorda = '#4a4a4a';  // cinza escuro discreto
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      // Desenha a imagem original
      ctx.drawImage(img, 0, 0);
      // Desenha o retângulo de borda por cima (contorno)
      ctx.strokeStyle = corBorda;
      ctx.lineWidth = borda;
      // strokeRect desenha centrado na coordenada, então compensamos com borda/2
      ctx.strokeRect(borda / 2, borda / 2, canvas.width - borda, canvas.height - borda);
      // Retorna como JPEG com qualidade alta
      // (JPEG gera arquivo menor que PNG pra fotos; docxtemplater aceita qualquer um)
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = (e) => reject(new Error('Falha ao processar imagem pra borda'));
    img.src = dataURL;
  });
}

/**
 * Carrega o template V5 (em base64 embutido), monta o contexto, aplica o image
 * module pra embutir a selfie (se houver), renderiza e retorna o blob .docx.
 */
async function montarDocxNoNavegador() {
  // Verifica se as libs carregaram. Conforme docs oficiais:
  // - pizzip expõe window.PizZip
  // - docxtemplater expõe window.docxtemplater (minúsculo)
  // - image module pode expor global com vários nomes dependendo do fork/build.
  //   Tentamos múltiplas opções pra ser robusto.
  if (typeof PizZip === 'undefined') {
    throw new Error('PizZip não carregou — cheque a conexão ou o CDN.');
  }
  if (typeof window.docxtemplater === 'undefined') {
    throw new Error('Docxtemplater não carregou — cheque a conexão ou o CDN.');
  }

  // Detecta o ImageModule em qualquer nome possível que forks usam
  const ImageModuleClass =
    window.ImageModule ||
    window.DocxtemplaterImageModule ||
    window.docxtemplaterImageModule ||
    window.docxtemplaterImageHyperlinkModuleFree ||
    window.docxtemplaterImageModuleFree ||
    window['docxtemplater-image-module-free'] ||
    window['docxtemplater-image-hyperlink-module-free'];

  if (!ImageModuleClass) {
    // Lista todos os globals pra facilitar debug
    const globalsImage = Object.keys(window).filter(k =>
      /image|docxtempl/i.test(k) && typeof window[k] === 'function'
    );
    console.error('ImageModule não encontrado. Globals relacionados:', globalsImage);
    console.error('window.ImageModule:', window.ImageModule);
    console.error('Todos globais novos (exceto nativos):', Object.keys(window).filter(k =>
      !['window','document','location','navigator','history','console'].includes(k) &&
      typeof window[k] === 'function' && !k.startsWith('webkit') && !k.startsWith('on')
    ).slice(0, 50));
    throw new Error('ImageModule não carregou — cheque o console pra ver quais globals existem.');
  }

  const DocxtemplaterClass = window.docxtemplater;

  // 1. Decodifica o template embutido
  // Seleciona o template correto baseado no produto: o produto pode indicar
  // uma variável global específica via produto.template_base64_var
  const produto = state.produtoSelecionado;
  // Mapeamento de nomes pra variáveis (const em script global NÃO vira window.X,
  // então window[varName] retorna undefined. Resolvemos com lookup explícito.)
  const TEMPLATES_POR_NOME = {
    'TEMPLATE_DOCX_BASE64': TEMPLATE_DOCX_BASE64,
    'TEMPLATE_DOCX_BASE64_JUROS': TEMPLATE_DOCX_BASE64_JUROS,
    'TEMPLATE_DOCX_BASE64_TARIFAS': TEMPLATE_DOCX_BASE64_TARIFAS,
    'TEMPLATE_DOCX_BASE64_PRESTAMISTA': typeof TEMPLATE_DOCX_BASE64_PRESTAMISTA !== 'undefined' ? TEMPLATE_DOCX_BASE64_PRESTAMISTA : null,
    'TEMPLATE_DOCX_BASE64_VIDAPREV': typeof TEMPLATE_DOCX_BASE64_VIDAPREV !== 'undefined' ? TEMPLATE_DOCX_BASE64_VIDAPREV : null,
    'TEMPLATE_DOCX_BASE64_CAPITALIZACAO': typeof TEMPLATE_DOCX_BASE64_CAPITALIZACAO !== 'undefined' ? TEMPLATE_DOCX_BASE64_CAPITALIZACAO : null,
    'TEMPLATE_DOCX_BASE64_CESTA': typeof TEMPLATE_DOCX_BASE64_CESTA !== 'undefined' ? TEMPLATE_DOCX_BASE64_CESTA : null,
    'TEMPLATE_DOCX_BASE64_ANUIDADE': typeof TEMPLATE_DOCX_BASE64_ANUIDADE !== 'undefined' ? TEMPLATE_DOCX_BASE64_ANUIDADE : null,
    'TEMPLATE_DOCX_BASE64_SEGURO_CARTAO_PROTEGIDO': typeof TEMPLATE_DOCX_BASE64_SEGURO_CARTAO_PROTEGIDO !== 'undefined' ? TEMPLATE_DOCX_BASE64_SEGURO_CARTAO_PROTEGIDO : null,
    'TEMPLATE_DOCX_BASE64_MIX_BRADESCO': typeof TEMPLATE_DOCX_BASE64_MIX_BRADESCO !== 'undefined' ? TEMPLATE_DOCX_BASE64_MIX_BRADESCO : null,
  };
  const templateBase64 = (produto && produto.template_base64_var && TEMPLATES_POR_NOME[produto.template_base64_var])
    ? TEMPLATES_POR_NOME[produto.template_base64_var]
    : TEMPLATE_DOCX_BASE64; // fallback produto 1
  const templateBuffer = base64ParaArrayBuffer(templateBase64);

  // 2. Prepara a selfie (se houver) — aplica borda discreta antes de embutir
  let selfieBuffer = null;
  if (state.anexos.selfie && typeof state.anexos.selfie === 'object') {
    // Primeiro aplica borda via canvas, depois converte pra ArrayBuffer
    const dataURLComBorda = await aplicarBordaSelfie(state.anexos.selfie.base64);
    const selfieB64 = dataURLComBorda.replace(/^data:[^;]+;base64,/, '');
    selfieBuffer = base64ParaArrayBuffer(selfieB64);
  }

  // 3. Configura image module
  const imageModule = new ImageModuleClass({
    centered: false,
    fileType: 'docx',
    getImage: (tagValue, tagName) => {
      // Se chegou aqui mas não tem selfie, devolve um pixel transparente mínimo
      // pra o docxtemplater não quebrar. Na prática isso não acontece porque
      // o fluxo não renderiza a tag {%selfie} sem imagem.
      if (!selfieBuffer) {
        throw new Error('Selfie não anexada — peça não pode ser gerada com {%selfie}');
      }
      return selfieBuffer;
    },
    getSize: (img, tagValue, tagName) => {
      // 605 x 416 pixels — tamanho padrão do modelo oficial (16cm x 11cm)
      // Proporção ~3:2, fluxo natural na página sem forçar quebra
      return [605, 416];
    },
  });

  // 4. Carrega o template como ZIP
  const zip = new PizZip(templateBuffer);

  // 5. Cria instance do docxtemplater
  const doc = new DocxtemplaterClass(zip, {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
  });

  // 6. Monta o contexto com todos os dados
  const contexto = montarContextoDocx();

  // 7. Se usuário pulou a selfie, remove a tag {%selfie} do contexto ANTES de renderizar
  // (o template ainda tem {%selfie} — sem valor ele vai renderizar sem imagem)
  if (!selfieBuffer) {
    // Remove a chave pra o image module pular sem crashar
    delete contexto.selfie;
  }

  // 8. Renderiza
  doc.render(contexto);

  // 9. PÓS-PROCESSAMENTO: injeta o XML da tabela de descontos no lugar do
  // marcador `ZZTABELADESCONTOSZZ`. Essa abordagem dá controle total sobre
  // o layout (linhas mescladas pra subtítulos, cores de destaque no total,
  // fidelidade absoluta à estrutura do XLSX) — impossível de alcançar via
  // loop nativo do docxtemplater.
  const zipFinal = doc.getZip();
  let documentXml = zipFinal.file('word/document.xml').asText();

  const tab = state.anexos.tabelaXlsx;
  const linhasPraTabela = (tab && typeof tab === 'object' && Array.isArray(tab.linhasClassificadas))
    ? tab.linhasClassificadas
    : null; // null/undefined → montarTabelaXmlDescontos gera um parágrafo de aviso

  const tabelaXml = montarTabelaXmlDescontos(linhasPraTabela);
  // O marcador está dentro de um <w:p>...ZZTABELADESCONTOSZZ...</w:p> —
  // substituímos o parágrafo inteiro pelo XML da nova tabela (ou aviso).
  const padraoMarcador = /<w:p\b[^>]*>(?:(?!<\/w:p>).)*ZZTABELADESCONTOSZZ(?:(?!<\/w:p>).)*<\/w:p>/s;
  if (padraoMarcador.test(documentXml)) {
    documentXml = documentXml.replace(padraoMarcador, tabelaXml);
    zipFinal.file('word/document.xml', documentXml);
  } else {
    console.warn('Marcador ZZTABELADESCONTOSZZ não encontrado no template renderizado. Tabela não foi injetada.');
  }

  // 9a. PRESCRIÇÃO DECENAL — insere ou remove o tópico conforme a regra dos
  // 5 anos (data dos descontos vs. hoje) e o override manual do advogado.
  // Roda ANTES do revisor pra o parágrafo inserido também receber as
  // correções de margem/concordância. Universal a todos os produtos.
  {
    const xmlAntesDec = zipFinal.file('word/document.xml').asText();
    const xmlDepoisDec = aplicarPrescricaoDecenal(xmlAntesDec);
    if (xmlDepoisDec !== xmlAntesDec) zipFinal.file('word/document.xml', xmlDepoisDec);
  }

  // 9a-2. QUADRO SOCIOECONÔMICO — tópico de abertura (só produtos Bradesco).
  // Injeta título + parágrafo humanizado ANTES de "DOS FATOS". Roda ANTES do
  // revisor (9c) pra os parágrafos inseridos receberem a uniformização de
  // margem, e antes da sanitização de twips (9b) que trunca o ind fracionário.
  {
    const xmlAntesQS = zipFinal.file('word/document.xml').asText();
    const xmlDepoisQS = aplicarQuadroSocioeconomico(xmlAntesQS);
    if (xmlDepoisQS !== xmlAntesQS) zipFinal.file('word/document.xml', xmlDepoisQS);
  }

  // 9b. SANITIZAÇÃO DE TWIPS FRACIONÁRIOS — Word recusa o arquivo se algum
  // atributo de medida OOXML (w:right, w:left, w:hanging, w:firstLine, w:w,
  // w:before, w:after, etc) vier com valor fracionário. Templates exportados
  // do Google Docs trazem números como "334.1338582677173" no lugar de twips
  // inteiros, o que faz o Word abrir a janela de "Recuperação de Texto".
  // Truncamos pra inteiro em todos os arquivos .xml do pacote (document,
  // styles, header, footer, numbering, settings, footnotes, etc).
  const reFracao = /(\sw:[A-Za-z]+=")(-?\d+)\.\d+(")/g;
  Object.keys(zipFinal.files).forEach((nome) => {
    if (!/\.xml$/i.test(nome)) return;
    const arq = zipFinal.file(nome);
    if (!arq || arq.dir) return;
    const orig = arq.asText();
    const corrigido = orig.replace(reFracao, '$1$2$3');
    if (corrigido !== orig) zipFinal.file(nome, corrigido);
  });

  // 9c. REVISOR-CORRETOR AUTOMÁTICO — uniformiza margens dos parágrafos
  // de body e relata o que NÃO pôde ser auto-corrigido (placeholders pendentes).
  // SEM alert popup — só console. A peça final entregue ao usuário deve
  // ser perfeita; correção silenciosa é melhor que aviso interruptivo.
  const xmlEntrada = zipFinal.file('word/document.xml').asText();
  const { xml: xmlCorrigido, relatorio } = revisarECorrigirPeca(xmlEntrada);
  if (xmlCorrigido !== xmlEntrada) {
    zipFinal.file('word/document.xml', xmlCorrigido);
  }
  console.group('🔍 Revisor da peça');
  if (relatorio.fixes.length) {
    relatorio.fixes.forEach(f => console.log('  ✎ corrigido:', f));
  }
  if (relatorio.issuesIrrecuperaveis.length) {
    relatorio.issuesIrrecuperaveis.forEach(i => console.error('  ✗', i));
  }
  if (!relatorio.fixes.length && !relatorio.issuesIrrecuperaveis.length) {
    console.log('  ✓ peça gerada limpa, sem ajustes necessários');
  }
  console.groupEnd();

  // 10. Gera o blob do .docx final
  const outputBuffer = zipFinal.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });

  return outputBuffer;
}
