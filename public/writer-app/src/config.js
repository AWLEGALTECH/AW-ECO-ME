/* =========================================================================
   STATE + CONSTANTES GLOBAIS
   - state: estado da SPA (mutável)
   - SEGURANCA_DEFAULT: campos enviados para webhook IA por padrão
   - LIMITE_JUIZADO_ESPECIAL: teto pra encaminhar pra Juizado Especial vs Vara Cível
   - LASTROS_REFERENCIA: cidades de referência pro lastro econômico (mock)
   - UFS_BR: lista de unidades federativas
   ========================================================================= */
const state = {
  tela: 'lobby',
  produtoSelecionado: null,
  clienteSelecionado: null,
  // Fluxo do Kit (Representação): modalidade de honorários escolhida na tela
  // dedicada antes do preenchimento do contrato. null fora do fluxo de kit.
  modalidadeSelecionada: null,
  dadosKit: {},
  arquivoKitContrato: null,
  arquivoKitProcuracao: null,
  // Bridge de cliente entre fluxos: quando o adv clica "outra peça mesmo
  // cliente" numa tela done, guardamos aqui um snapshot dos campos comuns
  // (nome/genero/CPF/RG/endereco/etc) pra reaproveitar no próximo produto
  // escolhido no lobby (kit ou produto regular).
  clienteParaReaproveitar: null,
  dadosPacote1: {},
  dadosPacote2: {},
  dadosPacote3: { gerar_lastro_dano_material: true },
  trechosIA: {},
  trechosIAOriginais: {},
  trechosEditados: new Set(),
  // Contador de regenerações por zona — incrementa a cada clique em "Regenerar".
  // Vai no payload pra n8n forçar variação real no ChatGPT (caso contrário,
  // mesmo input + temperatura baixa = resposta quase idêntica).
  regeneracoesPorZona: {},
  seguranca: {},
  config: { webhookTrechos: '', webhookPeca: '' },
  configCarregada: false,
  arquivoFinalBlob: null,
  buscaLobby: '',
  // Anexos — cada um pode ser: null (não mexido), 'pulado' (usuário escolheu anexar depois),
  // ou um objeto com os dados
  anexos: {
    selfie: null,        // { base64, mimeType, nome, tamanho } ou 'pulado'
    tabelaXlsx: null,    // { linhas: [...], nomeArquivo } ou 'pulado'
  },
  // Rubricas aplicáveis à peça. Padrão: todas marcadas.
  // Ao anexar uma planilha XLSX, essas flags são AUTODETECTADAS com base nas
  // linhas de desconto (coluna Descrição). Usuário pode ajustar manualmente.
  rubricas: {
    cartao: true,   // "GASTOS CARTÃO DE CRÉDITO"
    parcela: true,  // "PARCELA CRÉDITO PESSOAL"
    bx: true,       // "BX.ANT.FINANC"
  },
};

const SEGURANCA_DEFAULT = {
  nome_completo: true, nacionalidade: true, estado_civil: true, profissao: true,
  rg: false, orgao_expedidor: false, cpf: false, endereco_completo: false,
  // Perfil socioeconomico (conjunto enxuto) — todos liberados pra IA
  renda_mensal: true, dependentes: true, conjuge_trabalha: true,
  unico_provedor: true, tipo_moradia: true, condicao_saude: true,
  observacoes_livres: true,
  numero_agencia: false, numero_conta: false, data_inicio_descontos: false,
  data_fim_descontos: false, valor_total_descontos: false, valor_dano_moral: false,
  comarca: false, uf: false,
};

// ============================================================
// LIMITE DE ALÇADA DO JUIZADO ESPECIAL CÍVEL
// Valor da causa ≥ este limite vai para Vara Cível comum.
// Valor < este limite vai para Juizado Especial Cível.
// Fonte: 40 salários-mínimos (Lei 9.099/95, art. 3º, I).
// Em 2026 o salário-mínimo é R$ 1.621,00 (Decreto 12.797/2025),
// então 40 × 1.621 = 64.840. Se o SM mudar, atualize este valor.
// ============================================================
const LIMITE_JUIZADO_ESPECIAL = 64840;

// ============================================================
// LASTROS_REFERENCIA — fonte única de constantes para o lastro
// econômico do dano material. Atualizar anualmente:
//   - salario_minimo: ver decreto presidencial de janeiro
//   - cesta_basica_*: pesquisar DIEESE mês mais recente
//   - passagem_*: ver decretos municipais/IMMU para Manaus
//   - minimo_existencial: enquanto Decreto 11.567/2023 vigorar = R$ 600
// ============================================================
const LASTROS_REFERENCIA = {
  ano_base: 2026,
  // Salário-mínimo nacional (Decreto 12.797/2025)
  salario_minimo: 1621,
  // Mínimo existencial — Decreto 11.567/2023 (não atualizou desde 2023)
  minimo_existencial: 600,
  decreto_minimo_existencial: 'Decreto nº 11.567/2023',
  // Cesta básica DIEESE — Manaus serve como proxy para todo o estado AM,
  // já que é a única capital amazonense pesquisada pelo levantamento
  // mensal Conab/DIEESE. Valor de fevereiro/2026.
  cesta_basica_am: 628.90,
  cesta_basica_am_referencia: 'DIEESE/Conab, Manaus-AM, fev/2026',
  // Passagem ônibus — Manaus R$ 5 (PassaFácil/dinheiro), Decreto Municipal 2025.
  // Para interior do AM (Itacoatiara, Parintins, Manacapuru), tarifas urbanas
  // ficam entre R$ 4 e R$ 5, então R$ 5 é proxy razoável para todo o estado.
  passagem_onibus_am: 5,
  // Conta de luz residência popular — média Amazonas Energia para faixa
  // social/baixa renda com consumo até 150 kWh/mês.
  conta_luz_popular_150kwh: 200,
  // Teto Juizado Especial Cível (40 SM, Lei 9.099/95)
  teto_juizado_especial: 64840,
  // TODO: Ao expandir para outras comarcas/UFs, transformar este objeto
  // num map por UF, ex: { AM: {...}, SP: {...}, MG: {...} }, e fazer
  // calcularLastroFinanceiro() escolher a chave certa baseado no
  // state.dadosPacote3.uf.
};

// Limite mínimo absoluto para gerar lastro. Abaixo disso, o lastro fica
// fraco demais (ex: "R$ 15 = 4 horas de transporte público") e o sistema
// avisa o advogado pra desativar a zona ou renegociar com o cliente.
const LASTRO_VALOR_MINIMO = 20;

// Lista oficial das 27 UFs do Brasil (26 estados + DF), em ordem alfabética
const UFS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
];
