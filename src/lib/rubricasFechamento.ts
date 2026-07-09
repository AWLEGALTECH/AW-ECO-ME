// Catálogo das rubricas/ações da planilha de fechamentos da estagiária.
// As chaves batem com os cabeçalhos da planilha original e com o array
// `rubricas` da tabela `fechamentos`. Cada rubrica marcada = 1 ação.
export const RUBRICAS_FECHAMENTO: { key: string; label: string }[] = [
  { key: "RMC",                  label: "RMC - Reserva de Margem Consignável" },
  { key: "RCC",                  label: "RCC - Reserva de Cartão de Crédito" },
  { key: "CESTA",                label: "Cesta de tarifas" },
  { key: "MORA",                 label: "Mora" },
  { key: "JUROS_ABUSIVOS",       label: "Juros abusivos" },
  { key: "MORA_CEL",             label: "Mora - celular" },
  { key: "SVA",                  label: "SVA" },
  { key: "ANP",                  label: "ANP" },
  { key: "TIT_CAP",              label: "Título de capitalização" },
  { key: "INCORP_BANCOS",        label: "Incorporação de bancos" },
  { key: "GASTO_C_CRED",         label: "Gasto com cartão de crédito" },
  { key: "COBRANCA_IND",         label: "Cobrança indevida" },
  { key: "VIDA_PREV",            label: "Vida / Previdência" },
  { key: "SEGURO",               label: "Seguro" },
  { key: "ESPECIFICA",           label: "Específica" },
  { key: "ANUIDADE",             label: "Anuidade" },
  { key: "BX_ANT_FIN",           label: "Baixa antecipada de financiamento" },
  { key: "PARC_CRED_PESS",       label: "Parcela de crédito pessoal" },
  { key: "EMISSAO_EXTRATO",      label: "Emissão de extrato" },
  { key: "SAQUE_TERMINAL",       label: "Saque em terminal" },
  { key: "EXTRATO_MOVIMENTO",    label: "Extrato de movimento" },
  { key: "AD_DEPOSITANTE",       label: "Adicional do depositante" },
  { key: "REFINANCIAMENTO_IND",  label: "Refinanciamento indevido" },
  { key: "DIV_ATRASO",           label: "Dívida em atraso" },
  { key: "REORG_FINAN",          label: "Reorganização financeira" },
  { key: "OP_VENCIDAS",          label: "Operações vencidas" },
  { key: "REG_LANCAMENTO",       label: "Registro de lançamento" },
  { key: "MORA_OPERAÇÕES",       label: "Mora - operações" },
  { key: "ENCARGOS_DESCOBERTOS", label: "Encargos por descoberto" },
  { key: "ENCARGOS_EXCESSO",     label: "Encargos em excesso" },
  { key: "MORA_C_CREDITO",       label: "Mora - cartão de crédito" },
];

export const RUBRICA_LABEL: Record<string, string> = Object.fromEntries(
  RUBRICAS_FECHAMENTO.map((r) => [r.key, r.label]),
);

// Valor padrão por ação fechada (R$). Configurável por fechamento no banco
// (coluna valor_acao), mas a UI usa este default.
export const VALOR_ACAO_PADRAO = 5;
