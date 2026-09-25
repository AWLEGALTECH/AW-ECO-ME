import { detectBank, BANK_PROFILES } from "./banks/index.js";

/* ─────────────────────────────────────────────
   CATEGORIAS / MATCHING
───────────────────────────────────────────── */
const THEME = {
  color: "hsl(var(--accent-h), var(--accent-s), var(--accent-l))",
  glow: "hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.3)",
  gradient: "linear-gradient(135deg, hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.10) 0%, hsla(var(--accent-h), var(--accent-s), calc(var(--accent-l) - 12%),0.04) 100%)",
  border: "hsla(var(--accent-h), var(--accent-s), var(--accent-l),0.28)",
};

function normalizeText(text) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const CATEGORIAS = [
  {
    id: "tarifas",
    label: "Cobranças Indevidas",
    sublabel: "Tarifas bancárias cobradas indevidamente",
    icon: "!",
    ...THEME,
    keywords: ["tarifa bancaria", "pend.tarifas bancaria", "lancamento a debito", "recebimento fornecedor", "tar bancaria", "tar receb fornecedor", "tar manut conta", "manutencao de conta", "tar renovacao cartao", "tar transferencia",
      // Itau
      "tar pacote itau", "tar pacote i mens", "tar pacote 3 mens", "tar pacote3.0", "tar maxconta exced", "tar cta exced", "tar lis", "tar comunicacao digital", "tar ordem pagamento", "tar transf. recurso", "tar ted in", "tarifa mensalidade pacote",
      // BB
      "tarifa pacote de servicos", "tarifa extrato mes anterior", "tarifa transferencia de recursos", "tarifa renovacao cadastro", "tar c/c", "cobranca referente", "tarifa msg", "tarifa sms",
      // Caixa
      "tar manut", "tar saque atm", "tar sq atm", "tar ex ect", "tar renov cadas",
      // Santander
      "tarifa mensalidade pacote servicos", "tarifa mensalidade", "tar mensalidade", "tarifa pagamentocontas", "tarifa aval.emerg.credito",
      // Agibank
      "tarifa comunicacao digital", "tarifa comunicacao", "reserva cobranza vista",
      // 2ª via cartão/senha (cobranças de reemissão, não são "emissão de extrato")
      "tar 2 via", "tarifa 2via"],
    fundamento: "Art. 3º, Res. CMN 3.919/10; Súmula 297 STJ",
    acao: "Pleitear restituição em dobro das tarifas cobradas sem prévia contratação expressa (Art. 42, CDC). Verificar se houve autorização expressa em contrato.",
    descricao: "Cobrança Indevida",
  },
  {
    id: "saque_terminal",
    label: "Saque Terminal",
    sublabel: "Tarifas cobradas por saque em terminal bancário",
    icon: "!",
    ...THEME,
    keywords: ["tarifa bancaria saqueterminal", "tarifa bancaria saquecorrespondente", "tarifa bancaria saquepessoal", "tarifa bancaria saque terminal", "tarifa bancaria saque bradesco", "tarifa bancaria saque compartilhado", "saqueterminal tarifa bancaria", "vr.parcial saqueterminal tarifa bancaria", "vr.parcial saqueterminal", "vr.parcial saquecorrespondente", "vr.parcial saquepessoal", "tar saqueterminal", "tar saquecorre", "saqueterminal", "saquecorrespondente", "saquepessoal", "saquetermi", "saquecorre", "saque terminal", "saque bradesco", "saque compartilhado",
      // Multi-banco
      "saque corre", "saque pv", "saque taa", "saque atm", "tarifa saque terminal"],
    fundamento: "Art. 3º, Res. CMN 3.919/10; Súmula 297 STJ",
    acao: "Tarifa cobrada por saque em terminal bancário. Verificar se houve contratação expressa do serviço. Pleitear restituição em dobro (Art. 42, CDC).",
    descricao: "Tarifa de Saque Terminal",
  },
  {
    id: "adiantamento",
    label: "Adiantamento ao Depositante",
    sublabel: "Cobranças por adiantamento ao depositante",
    icon: "!",
    ...THEME,
    keywords: ["vr.parcial adiant.depositant", "tar adiant.depositante", "adiant.depositante", "adiantamento depositante", "adiantamento ao depositante", "tar adiant deposito", "adiant deposito", "adiantamento dep",
      // Itau/Santander
      "aval. emerg credito", "aval emerg credito"],
    fundamento: "Art. 52 e 422, CC; Res. CMN 3.919/10",
    acao: "Verificar se houve efetiva utilização do adiantamento. Cobranças de adiantamento ao depositante sem solicitação expressa são passíveis de repetição de indébito.",
    descricao: "Adiantamento ao Depositante",
  },
  {
    id: "cesta",
    label: "Pacotes e Cestas",
    sublabel: "Mensalidades de pacotes de serviços",
    icon: "!",
    ...THEME,
    keywords: ["vr.parcial cesta b.expresso", "cesta b.expresso", "vr.parcial cesta facil", "vr.parcial cesta", "cesta facil economica", "cesta facil master", "cesta facil super", "cesta facil mais", "cesta facil", "cesta exclusive", "cesta exclus mais", "cesta exclus. max", "cesta classic mais", "cesta classic", "cesta prime classica", "cesta poupanca", "cesta universitaria", "cesta beneficiario", "cesta benefic", "cesta bradesco expre", "cesta celular", "cesta expresso", "cesta", "pacote de servicos", "pacote servico padro", "pacote servico", "pacote servicos", "pacote", "padronizado prioritarios ii", "padronizado prioritarios i", "padronizado prioritarios", "pserv", "binclub servicos", "binclub", "pagto eletron cobranca (pserv)", "cesta smart", "cesta digital", "cesta basica", "cesta plus", "cesta master plus", "cesta classic super", "cesta exclusive plus", "cesta especial", "cesta personalizada", "pacote de servicos essencial",
      // Itau
      "mensal combinaqui", "combinaqui", "mensal pacote itau",
      // BB
      "cesta bb", "cesta familia", "cesta estilo", "bompratodos",
      // Caixa
      "cesta caixa", "deb cesta", "cesta mais valor", "cesta padrao i", "cesta padrao ii"],
    fundamento: "Art. 3º e 4º, Res. CMN 3.919/10; Art. 39, CDC",
    acao: "Verificar se o cliente efetivamente contratou o pacote. Em caso negativo, pleitear restituição de todos os valores cobrados nos últimos 5 anos.",
    descricao: "Pacote/Cesta de Serviços",
  },
  {
    id: "encargos",
    label: "Encargos",
    sublabel: "Encargos sobre limite de crédito",
    icon: "!",
    ...THEME,
    keywords: ["encargos limite de cred", "encargos limite credito", "encargos descoberto cc", "encargos descoberto", "encargos saldo vinculado", "encargo saldo vinculado", "encargos excesso limite", "encargos", "encargos cheque especial", "encargos conta garantida", "encargos atraso", "encargos financeiros",
      // Multi-banco
      "sob med encargos", "juros saldo devedor", "enc lis", "enc ch esp", "juros saldo utiliz ate limite", "juros saldo utiliz", "juros cheque especial", "enc limite"],
    fundamento: "Art. 52 e 422, CC; Res. CMN 3.919/10",
    acao: "Verificar se houve efetiva utilização do limite. Encargos cobrados sem utilização ou em duplicidade são passíveis de repetição de indébito.",
    descricao: "Encargo sobre Limite de Crédito",
  },
  {
    id: "mora",
    label: "Mora de Crédito",
    sublabel: "Juros de mora em operações de crédito",
    icon: "!",
    ...THEME,
    keywords: ["mora credito pessoal", "mora credito pesso", "mora cred pess", "mora conta de telefone", "mora cta telef", "mora de operacao", "mora operacao de credito", "mora cartao de credito", "mora cartao", "mora encargos", "mora vida e previdencia", "mora enc descoberto", "mora enc descoberto c.c", "mora limite credito", "mora consignado", "mora financiamento", "mora cdc", "juros mora", "juros atraso", "juros de mora", "multa moratoria"],
    fundamento: "Art. 52, §1º, CDC; Súmula 379 STJ",
    acao: "Verificar legalidade da cobrança. Mora decorrente de cobranças indevidas é igualmente indevida. Pleitear cancelamento da mora sobre débitos contestados.",
    descricao: "Mora de Crédito",
  },
  {
    // Categoria unificada — agrupa Seguros (prestamista/morte/invalidez) +
    // Vida e Previdência. 2026-05-14 (Josiane): mantíamos `vida_prev` separado
    // mas para o M5 (Venda Casada Seguro Prestamista) os dois são o mesmo
    // "bolo" jurídico — produtos não solicitados de seguro/previdência do banco.
    // Merge atende pedido do user + simplifica seleção de rubricas no M5.
    id: "seguros",
    label: "Seguro / Vida e Previdência",
    sublabel: "Seguros prestamista, morte, invalidez, vida e previdência",
    icon: "!",
    ...THEME,
    keywords: ["bradesco seg-resid/outros", "bradesco seg-resid", "sabemi segurado", "sabemi", "seguro prestamista", "seguro protecao financeira", "seguro mais protegido", "seg protecao cheque esp", "seg protecao cheque", "seguro cart deb bradesco", "servico cartao protegido", "seguradora secon", "aspecir - uniao seguradora", "aspecir", "odontoprev s/a", "odontoprev", "aquisicao/devolucao-seg", "liberty seguros", "viza prev seguros", "sebraseg clube de beneficios", "sebraseg", "sudamerica clube de servicos", "sudamerica clube", "previsul", "pagto eletron cobranca (brades resi)", "pagto eletron cobranca (dental saude)", "pagto eletron cobranca (ace seguradora", "pagto eletron cobranca (centro de assistencia)", "pagto eletron cobranca cenasp", "bradesco auto", "bradesco saude", "bradesco dental", "seguro residencial", "seguro vida", "seguro acidentes pessoais", "seguro desemprego", "seguro perda involuntaria", "zurich seguros", "mapfre seguros", "porto seguro", "pagto eletron cobranca (mapfre)", "pagto eletron cobranca (zurich)",
      // Vida e Previdência (merge da antiga categoria vida_prev — 2026-05-14)
      "bradesco vida e previdencia s/a", "bradesco vida e previdencia", "bradesco vida e prev", "bradesco vida prev-seg", "bradesco vida prev", "prev-seg", "vida e previdencia", "mbm previdencia complementar", "mbm previdencia", "previplan clube", "previplan", "pagto eletron cobranca (vida pre)", "previdencia complementar", "previdencia privada",
      "bb previdencia", "bb prev", "brasilprev",
      "caixa previdencia", "caixa vida",
      // Itau
      "itau seg vida pf", "itau seg ap pf", "itau seg vida ap pf", "seguro residencia", "seguro cartao itau", "seguro cartao", "seguro lis", "seguro itau viva", "seguro bolsa protegida", "pagto itau seguros", "itau seguros",
      // BB
      "seguro bb credito", "seguro credito protegido", "protecao ouro", "bb seguros", "bb seg",
      // Caixa
      "caixa seg", "caixa seguradora",
      // Santander
      "mensalidade de seguro", "santander seguros", "santander seg", "zurich santander",
      // Agibank
      "debito de seguro"],
    fundamento: "Art. 39, III, CDC; Súmula 473 STJ; Art. 757, CC",
    acao: "Verificar se o seguro/previdência foi contratado voluntariamente. Produtos vinculados a financiamentos sem opção de recusa são abusivos (Súmula 473 STJ; Tema 972 STJ). Pleitear cancelamento e devolução.",
    descricao: "Seguro / Vida e Previdência",
  },
  {
    id: "tit_cap",
    label: "Título de Capitalização",
    sublabel: "Títulos de capitalização cobrados indevidamente",
    icon: "!",
    ...THEME,
    keywords: ["titulo de capitalizacao", "bradesco capitalizacao", "resg.tit.capitalizacao", "capitalizacao 1171", "tit capitalizacao", "titulo cap", "cap periodica", "bradesco cap",
      // Itau
      "itaucap", "pic 100", "pic itau", "cap itau", "capitalizacao",
      // BB
      "ourocap", "ourocap pm", "ourocap pu", "brasilcap", "bb capitalizacao", "capitalizacao estilo",
      // Caixa
      "ideal cap", "super x cap", "caixa cap",
      // Santander
      "super cap", "santander capitalizacao", "pic santander", "dindin"],
    fundamento: "Art. 39, I e V, CDC; Súmula 473 STJ",
    acao: "Verificar se houve contratação voluntária do título de capitalização. Títulos vinculados a abertura de conta ou crédito sem consentimento são abusivos. Pleitear cancelamento e restituição integral.",
    descricao: "Título de Capitalização",
  },
  {
    id: "credito",
    label: "Parcela de Crédito Pessoal",
    sublabel: "Parcelas de empréstimos e operações de crédito",
    icon: "!",
    ...THEME,
    keywords: ["emprestimo pessoal", "parcela oper de credito", "parcela credito pessoal", "parc cred pess", "parcela oper", "jbcred sociedade", "jbcred", "crefisa", "sudacred", "suda", "agiplan financeira", "agiplan", "easycob", "eagle", "pagto eletron cobranca (eagle)", "parcela emprestimo", "parcela financiamento", "amort emprestimo", "amortizacao emprestimo", "prestacao credito", "parcela consignado", "parcela cdc", "cdc credito",
      // Multi-banco
      "cred pessoal", "bb cred", "consignado bb", "parcela cred", "consignado caixa", "siemp", "consignado santander",
      // Agibank
      "debito de parcela", "pagamento emprestimo"],
    fundamento: "Art. 52, CDC; Lei 10.931/04; Res. CMN 4.559/17",
    acao: "Solicitar demonstrativo completo da operação. Verificar CET e taxa de juros. Contestar cobranças acima do contratado ou sem autorização expressa.",
    descricao: "Parcela de Crédito Pessoal",
  },
  {
    id: "anuidade",
    label: "Anuidade e Cartão",
    sublabel: "Anuidades e tarifas de cartão de crédito",
    icon: "!",
    ...THEME,
    keywords: ["anuidade", "cartao credito anuidade", "anuidade cartao visa", "anuidade cartao master", "anuidade cartao elo", "anuidade internacional", "anuidade platinum", "anuidade gold",
      // BB
      "ourocard", "ourocard anuidade", "ourocard facil",
      // Santander
      "anuidade visa", "anuidade master"],
    fundamento: "Res. CMN 3.919/10; Art. 39, CDC",
    acao: "Verificar se a anuidade foi informada no momento da contratação. Anuidades cobradas sem previsão contratual expressa são indevidas.",
    descricao: "Anuidade/Tarifa de Cartão",
  },
  {
    id: "extrato",
    label: "Emissão de Extrato",
    sublabel: "Tarifas por extratos e segunda via",
    icon: "!",
    ...THEME,
    keywords: ["emissao extrato", "tarifa emissao extrato", "emissao extratos unificado", "extratomes", "extrato mes", "2via de extrato", "extrato unificado", "tar demonst.consolidade", "tar demonstr consolidado", "segunda via", "tarifa emissao doc", "emissao comprovante", "emissao informe rendimentos",
      // Caixa
      "extmeselet"],
    fundamento: "Art. 6º, VIII, CDC; Res. CMN 3.919/10",
    acao: "Emissão de extratos é direito do consumidor (Art. 6º, VIII, CDC). Cobrança por acesso à informação bancária é abusiva. Pleitear devolução dos valores.",
    descricao: "Emissão de Extrato",
  },
  {
    id: "invest_facil",
    label: "Invest Fácil",
    sublabel: "Aplicações compulsórias sem rendimento real",
    icon: "⚠",
    ...THEME,
    keywords: ["aplic.invest facil", "invest facil", "aplicacao invest facil", "aplic invest facil", "aplic.invest", "investfacil", "invest.facil", "resgate invest facil", "aplicacao automatica", "invest facil auto",
      // Santander
      "remuneracao aplicacao automatica"],
    fundamento: "Art. 39, IV, CDC; Art. 422, CC; Art. 187, CC",
    acao: "ATENÇÃO: os valores de Invest Fácil NÃO são para reembolso direto. O dinheiro aplicado retorna ao cliente, porém sem rendimento real. A prática é abusiva por si só: o banco utiliza os recursos do cliente em benefício próprio, sem transparência sobre rentabilidade. Documentar a prática abusiva como fundamento adicional na ação principal.",
    descricao: "Invest Fácil (prática abusiva)",
    naoReembolsavel: true,
  },
  {
    id: "bx_ant_financ",
    label: "BX Antecipação Financeira",
    sublabel: "Baixa antecipada de financiamento/empréstimo",
    icon: "!",
    ...THEME,
    keywords: ["bx.ant.financ/emp", "bx.ant.fin/emp", "bx.ant.financ", "bx ant financ", "bx ant fin", "bx ant", "bx.antecipacao", "bx antecipacao", "baixa antecipada", "liq.ant.financ", "liq ant financ", "liquidacao antecipada"],
    fundamento: "Art. 52, §2º, CDC; Art. 3º, Res. CMN 3.516/07",
    acao: "Baixa antecipada de contrato sem abatimento proporcional dos juros. Pleitear restituição da diferença conforme Art. 52, §2º, CDC.",
    descricao: "BX Antecipação Financeira",
  },
  {
    id: "gastos_cartao",
    label: "Gastos com Cartão",
    sublabel: "Cobranças de gastos com cartão de crédito/débito",
    icon: "!",
    ...THEME,
    keywords: ["gasto c/cartao de credito", "gastos cartao de credito", "gastos cartao credito", "gasto c credito", "gasto cartao de credito", "gasto cartao credito", "provisao gasto cart cred", "gasto c/cartao", "gastos c/cartao", "gasto cart cred", "gasto cartao debito", "compra cartao debito", "gasto e credito",
      // Agibank
      "debito de cartao"],
    fundamento: "Art. 52, CDC; Res. CMN 3.919/10",
    acao: "Verificar se os gastos lançados foram efetivamente realizados pelo titular. Contestar cobranças não reconhecidas e pleitear estorno com correção monetária.",
    descricao: "Gasto com Cartão de Crédito",
  },
  // Categoria `vida_prev` removida 2026-05-14 (Josiane) — keywords mergeadas
  // em `seguros` acima. Mesmo "bolo" jurídico (Tema 972 STJ + Súmula 473 STJ).
  // Se algum código antigo referenciar `vida_prev`, agora cai no fallback.
  {
    id: "extrato_movimento",
    label: "Extrato Movimento",
    sublabel: "Cobranças de extrato de movimentação",
    icon: "!",
    ...THEME,
    keywords: ["extrato movimento", "extratomovimento", "extratomomovimento", "extrato mes anterior"],
    fundamento: "Art. 6º, VIII, CDC; Res. CMN 3.919/10",
    acao: "Cobrança por extrato de movimentação é abusiva. Emissão de extratos é direito do consumidor (Art. 6º, VIII, CDC). Pleitear devolução dos valores.",
    descricao: "Extrato Movimento",
  },
  {
    id: "mora_cel",
    label: "Mora CEL",
    sublabel: "Mora de conta Bradesco Celular",
    icon: "!",
    ...THEME,
    keywords: ["mora cel", "mora celular", "mora bradesco celular"],
    fundamento: "Art. 52, §1º, CDC; Súmula 379 STJ",
    acao: "Verificar se a mora é devida. Mora sobre cobranças indevidas é igualmente indevida. Pleitear cancelamento.",
    descricao: "Mora CEL",
  },
  {
    id: "div_atraso",
    label: "Dívida em Atraso",
    sublabel: "Cobranças de dívida em atraso",
    icon: "!",
    ...THEME,
    keywords: ["divida em atraso", "div. em atraso", "div.atraso", "div atraso", "dav.atraso", "divida atraso", "deb.valor atraso"],
    fundamento: "Art. 52, CDC; Art. 397, CC",
    acao: "Verificar se a dívida é legítima e se os encargos de atraso estão dentro dos limites legais. Contestar cobranças em duplicidade ou com juros abusivos.",
    descricao: "Dívida em Atraso",
  },
  {
    id: "reorg_finan",
    label: "Reorganização Financeira",
    sublabel: "Cobranças de reorganização financeira",
    icon: "!",
    ...THEME,
    keywords: ["reorganizacao financeira", "reorg.financeira", "reorg financeira", "reorganizacao fin", "reorg finan"],
    fundamento: "Art. 39, CDC; Res. CMN 3.919/10",
    acao: "Verificar se houve contratação expressa de reorganização financeira. Contestar cobranças sem autorização.",
    descricao: "Reorganização Financeira",
  },
  {
    id: "op_vencidas",
    label: "Operações Vencidas",
    sublabel: "Cobranças de operações vencidas",
    icon: "!",
    ...THEME,
    keywords: ["operacoes vencidas", "operacoes venvidas", "op.vencidas", "op vencidas", "operacao vencida"],
    fundamento: "Art. 52, CDC; Art. 397, CC",
    acao: "Verificar se as operações vencidas são legítimas. Contestar cobranças em duplicidade ou com cálculos incorretos.",
    descricao: "Operações Vencidas",
  },
  {
    id: "reg_lancamento",
    label: "Regularização de Lançamento",
    sublabel: "Cobranças de regularização de lançamento",
    icon: "!",
    ...THEME,
    keywords: ["regularizacao de lancamento", "regularizacao lancamento", "reg.lancamento", "reg lancamento", "regularizacao manual", "regulariz manual"],
    fundamento: "Art. 39, CDC; Res. CMN 3.919/10",
    acao: "Verificar se a regularização de lançamento é justificada. Contestar cobranças sem fundamento contratual.",
    descricao: "Regularização de Lançamento",
  },
  {
    id: "outros",
    label: "Outras Cobranças",
    sublabel: "Cobranças irregulares diversas",
    icon: "!",
    ...THEME,
    keywords: ["msg", "debito automatico", "doc/ted internet", "doc/ted - internet", "doc ted internet", "ted internet", "doc internet", "sms aviso", "notificacao sms", "tar notificacao", "debito automatico tarifa"],
    fundamento: "Art. 39, CDC; Res. CMN 3.919/10",
    acao: "Verificar natureza da cobrança e se houve autorização contratual expressa. Solicitar memória de cálculo e contestar cobranças sem fundamento contratual.",
    descricao: "Cobrança Diversa",
  },
];

function matchCategoria(historico) {
  const h = normalizeText(historico);
  // REM: = remetente de PIX/TED, DES: = destinatário — nunca são tarifas bancárias
  // Usar ^ (inicio da string) em vez de \b para não bloquear textos prepended
  // Ex: "BRADESCO VIDA E PREVIDENCIA REM: CLAUDIO..." deve casar vida_prev
  if (/^rem\s*:/.test(h) || /^des\s*:/.test(h)) return null;
  // Busca o match com keyword MAIS LONGA (mais específica) entre todas as categorias.
  // Desempate: keyword que aparece MAIS TARDE no texto é mais específica.
  // Ex: "TARIFA BANCARIA CESTA B.EXPRESSO" → "cesta b.expresso" (pos 16) vence "tarifa bancaria" (pos 0)
  let bestCat = null;
  let bestLen = 0;
  let bestPos = -1;
  let bestKw = "";
  for (const cat of CATEGORIAS) {
    for (const kw of cat.keywords) {
      const nkw = normalizeText(kw);
      const pos = h.indexOf(nkw);
      if (pos === -1) continue;
      if (nkw.length > bestLen || (nkw.length === bestLen && pos > bestPos)) {
        bestLen = nkw.length;
        bestCat = cat;
        bestPos = pos;
        bestKw = nkw;
      }
    }
  }
  // Reclassificação: "TARIFA BANCARIA 0000001 SAQUEterminal" → saque_terminal
  // O docto entre "tarifa bancaria" e "saqueterminal" impede keyword composta de casar.
  if (bestCat && bestCat.id === "tarifas" && /saque\s*(terminal|termi|correspondente|corre|pessoal|compartilhado|bradesco)/i.test(h)) {
    const sq = CATEGORIAS.find(c => c.id === "saque_terminal");
    if (sq) return sq;
  }
  // Reclassificação: "TARIFA BANCARIA 0020125 CESTA BENEFIC 1" → cesta
  // "TARIFA BANCARIA" é prefixo genérico; a cobrança real é CESTA/PACOTE.
  if (bestCat && bestCat.id === "tarifas" && /cesta|pacote\s+de\s+servico|pserv|binclub/i.test(h)) {
    const cs = CATEGORIAS.find(c => c.id === "cesta");
    if (cs) return cs;
  }
  // Guard: "EMPRESTIMO PESSOAL 1234567" sem prefixo parcela/amort é desembolso (crédito), não cobrança
  if (bestCat && bestCat.id === "credito" && /^emprestimo\s+pessoal\b/i.test(h) && !/parcela|amort|prestacao|pagamento|parc\b/i.test(h)) {
    return null;
  }
  // Reclassificação: "EXTRATOmovimento(E) TARIFA EMISSAO EXTRATO" → extrato_movimento
  // O prefixo "extratomovimento"/"extrato movimento" indica extrato de movimentação
  if (bestCat && bestCat.id === "extrato" && /^extrato\s*m(ovimento|es\s+anterior)/i.test(h)) {
    const em = CATEGORIAS.find(c => c.id === "extrato_movimento");
    if (em) return em;
  }
  // Guard: "extratomovimento"/"extratomes" são prefixos que podem ser merged com texto
  // não-relacionado (ex: "EXTRATOmovimento(E) TV POR ASSINATURA"). Vetar quando o texto
  // após o keyword contém conteúdo alfabético significativo não-relacionado a extrato.
  if (bestCat && bestCat.id === "extrato" && bestKw.startsWith("extratom")) {
    const afterKw = h.slice(bestPos + bestLen).replace(/\([^)]*\)/g, "").trim();
    const alphaOnly = afterKw.replace(/[0-9\s./-]/g, "");
    if (alphaOnly.length > 3 && !/tarifa|emissao|extrato|2\s*via|via/.test(afterKw)) {
      return null;
    }
  }
  // Guard: contaminated merge detection for MORA — if text AFTER the MORA keyword
  // contains separate-transaction patterns (compra, saque, dep, etc.), this historico was
  // likely formed by groupByY merging two adjacent PDF rows into one.
  // MORA entries never have purchases/withdrawals/deposits as sub-descriptions.
  // Restrict to mora/mora_cel to avoid false negatives in other categories where
  // patterns like "SAQUEterminal" ARE legitimate sub-descriptions of TARIFA.
  if (bestCat && (bestCat.id === "mora" || bestCat.id === "mora_cel") && bestPos >= 0) {
    const afterKw = h.slice(bestPos + bestLen);
    if (/\b(compra\s*(elo|visa|master|debito|credito)|saque\s+dinheiro|dep\s+(dinheiro|corban|cheque)|deposito\s+(dinheiro|corban)|especie\b|rem[\s:\-]|transferencia\s*pix|pix\s+(enviado|recebido)|credito\s+de\s+salario)/i.test(afterKw)) {
      return null;
    }
  }
  return bestCat;
}

function analyzeAll(transactions) {
  const grouped = {};
  const moraKw = "mora credito pesso"; // Short keyword matches corrupted text (PESSOAi, PESSOAl, etc.)

  for (const t of transactions) {
    const cat = matchCategoria(t.historico);
    if (!cat) continue;
    if (!grouped[cat.id]) grouped[cat.id] = { cat, items: [] };
    grouped[cat.id].items.push(t);

    // Count hidden MORA occurrences in merged historicos
    // e.g. "MORA CREDITO PESSOAL.! ENCARGOS LIMITE DE CRED" → primary=encargos, but also count 1 MORA
    // e.g. "MORA CREDITO PESSOAL.: MORA CREDITO PESSOAL;" → primary=mora (1), count 1 extra MORA
    const h = normalizeText(t.historico);
    let moraCount = 0, searchFrom = 0;
    while (true) {
      const idx = h.indexOf(moraKw, searchFrom);
      if (idx === -1) break;
      moraCount++;
      searchFrom = idx + moraKw.length;
    }
    // Subtract 1 if primary is already MORA (already counted above)
    const MAX_EXTRA_MORA = 100;
    const extraMora = Math.min((cat.id === "mora" || cat.id === "mora_cel") ? moraCount - 1 : moraCount, MAX_EXTRA_MORA);
    if (extraMora > 0) {
      const moraCat = CATEGORIAS.find(c => c.id === "mora");
      if (moraCat) {
        if (!grouped["mora"]) grouped["mora"] = { cat: moraCat, items: [] };
        for (let k = 0; k < extraMora; k++) {
          grouped["mora"].items.push({ data: t.data, historico: t.historico, valor: null });
        }
      }
    }
  }
  return grouped;
}

/* ─────────────────────────────────────────────
   PDF PARSER
───────────────────────────────────────────── */
const PDFJS_VERSION = "3.11.174";

async function loadPdfJs() {
  if (window.__pdfjsLib) return window.__pdfjsLib;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
    s.integrity = "sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e";
    s.crossOrigin = "anonymous";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
  window.__pdfjsLib = window.pdfjsLib;
  return window.__pdfjsLib;
}

/* ── OCR Fallback (PDFs com texto renderizado como paths vetoriais) ── */
const OCR_SCALE = 2; // 2x = ~144 DPI — bom para texto impresso, 4x mais rápido que scale=4

// Promise.race com timeout — as promises do Tesseract podem NUNCA assentar
// (worker que morre depois do spawn não rejeita; createWorker/recognize ficam
// pendurados). Caso real 07/2026: UI de produção travada em "Página 2 de 2"
// pra sempre. Timeout -> reject -> o caller trata (skip do OCR com warn).
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(
      () => reject(new Error(`Timeout ${Math.round(ms / 1000)}s: ${label}`)), ms
    )),
  ]);
}

async function loadTesseract() {
  if (window.__tesseractWorker) return window.__tesseractWorker;
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por", 1, {
    langPath: "/tesseract",
    gzip: false,
    logger: m => console.log("[Tesseract]", m.status, Math.round((m.progress || 0) * 100) + "%"),
  });
  // PSM 3 = "Fully automatic page segmentation" — default, melhor para pagina completa
  // A separação de linhas é feita pelo strip detection, não pelo Tesseract
  await worker.setParameters({ tessedit_pageseg_mode: "3" });
  window.__tesseractWorker = worker;
  return worker;
}

function ocrCleanText(text) {
  if (!text) return "";
  text = text.trim();
  // Colapsar espacos dentro de sequencias numericas: "1. 234,56" → "1.234,56"
  text = text.replace(/(\d)\s*\.\s*(\d)/g, "$1.$2");
  text = text.replace(/(\d)\s*,\s*(\d)/g, "$1,$2");
  text = text.replace(/^-\s+(\d)/, "-$1");
  return text;
}

function otsuThreshold(histogram, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let sumB = 0, wB = 0, wF = 0;
  let maxVariance = 0, threshold = 0;
  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;
    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > maxVariance) { maxVariance = variance; threshold = t; }
  }
  return threshold;
}

function preprocessCanvas(ctx, width, height) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  // Grayscale conversion
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  // Build histogram
  const hist = new Uint32Array(256);
  const totalPixels = width * height;
  for (let i = 0; i < data.length; i += 4) hist[data[i]]++;
  // Otsu threshold
  const threshold = otsuThreshold(hist, totalPixels);
  // Binarize
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] < threshold ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  ctx.putImageData(imageData, 0, 0);
}

async function ocrPage(pdfPage, worker, scale = OCR_SCALE) {
  const MAX_OCR_PIXELS = 25_000_000;
  let viewport = pdfPage.getViewport({ scale });
  if (viewport.width * viewport.height > MAX_OCR_PIXELS) {
    const origViewport = pdfPage.getViewport({ scale: 1 });
    scale = Math.sqrt(MAX_OCR_PIXELS / (origViewport.width * origViewport.height));
    viewport = pdfPage.getViewport({ scale });
  }
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  await pdfPage.render({ canvasContext: ctx, viewport }).promise;
  preprocessCanvas(ctx, canvas.width, canvas.height);
  const { data } = await worker.recognize(canvas, {}, { blocks: true });
  canvas.width = 0; canvas.height = 0;

  // Word-level com Y central — groupByY com tolerance tight separa rows
  const words = (data.blocks || [])
    .flatMap(b => (b.paragraphs || []))
    .flatMap(p => (p.lines || []))
    .flatMap(l => (l.words || []));

  const items = [];
  const warnings = [];
  for (const word of words) {
    // Filter out low-confidence words (likely noise)
    if (word.confidence < 30) continue;
    const text = ocrCleanText(word.text);
    if (!text) continue;
    // Warn on low-confidence values
    if (word.confidence < 60 && IS_VALUE.test(text)) {
      warnings.push({ text, confidence: word.confidence, page: pdfPage.pageNumber || 0 });
    }
    const centerY = (word.bbox.y0 + word.bbox.y1) / 2;
    items.push({
      text,
      x: word.bbox.x0 / scale,
      y: (viewport.height - centerY) / scale,
    });
  }
  return { items, warnings };
}

function groupByY(items, tolerance = 4) {
  const rows = [];
  const used = new Set();
  const sorted = [...items].sort((a, b) => b.y - a.y);
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    const base = sorted[i];
    const row = [base];
    used.add(i);
    for (let j = i + 1; j < sorted.length; j++) {
      if (!used.has(j) && Math.abs(sorted[j].y - base.y) <= tolerance) {
        row.push(sorted[j]);
        used.add(j);
      }
    }
    row.sort((a, b) => a.x - b.x);
    rows.push({ y: base.y, items: row, text: row.map(r => r.text).join(" ") });
  }
  return rows.sort((a, b) => b.y - a.y);
}

function parseValor(s) {
  if (!s) return null;
  const clean = s.replace(/[DC]$/i, "").replace(/\./g, "").replace(",", ".");
  const v = parseFloat(clean);
  return isNaN(v) || v === 0 ? null : Math.abs(v);
}

const IS_DATE = /^\d{2}\/\d{2}\/\d{4}$/;
const IS_VALUE = /^-?\d{1,3}(?:\.\d{3})*,\d{2}[DC]?$/i;
// Detecta linhas de cabeçalho/rodapé de página que NÃO são transações
const IS_HEADER = /bradesco\s+celular|extrato\s+de\s*:|folha\s*:\s*\d+\/\d+|data\s+hist[oó]rico|cr[eé]dito\s*\(r\$\)|d[eé]bito\s*\(r\$\)|saldo\s*\(r\$\)|movimenta[cç][aã]o\s+entre|transf\s+saldo\s+c\/sal\s+p\/cc|[uú]ltimos\s+lan[cç]amentos|total\s+data\s*:|^data\s*:\s*\d{2}\/\d{2}\/\d{4}|^nome\s*:\s*[A-Z]/i;
// Detecta linhas de TOTAL / sumário do extrato — não são transações reais
const IS_SUMMARY = /^\s*total\b|\btotal\s*$|[uú]ltimos\s+lan[cç]amentos/i;
const IS_SEPARATE_TX = /\b(transfer[eê]ncia\s*pix|pix\s+(enviado|recebido|qrcode)|compra\s*(elo|visa|master|d[eé]bito|cr[eé]dito)|saque\s*(dinheiro|terminal|compartilhado|bradesco|pessoal|correspon|caixa|atm|taa|pv|c\/c)|ted\s|dep[oó]sito\s|pagamento\s+(de\s+)?titulo|pagto\s|cr[eé]dito\s+de\s+sal[aá]rio|credito\s+salario|pgto\s+fornecedor|bx[\s.]*ant|iof\s)/i;
// "SAQUEterminal", "SAQUEcorrespondente", etc. após "TARIFA BANCARIA" são DESCRITORES de tarifa,
// não transações de saque real. Permitir merge nesse contexto.
const IS_SAQUE_DESCRIPTOR = /\bsaque\s*(terminal|termi|correspondente|corre|pessoal|compartilhado|bradesco|dinheiro|caixa)/i;
const IS_TARIFA_PREFIX = /^(vr\.parcial\s+)?(tarifa bancaria|tar\s)/i;

// Categorias PRESENCE-ONLY (cobranças do banco, não transações do correntista).
// Duplicado de reviewer.js para evitar dependência circular.
const PRESENCE_ONLY_CATS_PARSER = new Set([
  "tit_cap", "seguros", "mora_cel", "extrato_movimento",
  "div_atraso", "reorg_finan", "op_vencidas", "reg_lancamento",
]);

// Killer-words = texto de transações REAIS do correntista (saque/transf/pix/
// compra/cartão/depósito). Quando aparecem no histórico de uma tx
// PRESENCE_ONLY, significa que o parser concatenou texto de row adjacente
// (groupByY collapse ou justEmitted append).
//
// Bug paradigma Janeila 2026-05-14: histórico do tit_cap saiu como
// "TITULO DE CAPITALIZACAO 1503743 SAQUE DIN CORBAN RECIBO" porque a row
// do PDF tinha tudo agrupado por Y. Fix cirúrgico: trim do killer-word.
const HISTORICO_KILLER_REGEX = /\b(?:saque\s*(?:din|dinheiro|corban|correspond|terminal|termi|caixa|atm|taa|pv|24h|c\/c|compartilhado|bradesco|pessoal)|saqueterminal|saqueteminal|corban\b|transferencia\b|transf\s+vr|pix\s+(?:enviado|recebido|qrcode|qr\s*code)|compra\s+(?:elo|visa|master|debito|credito)|cartao\s+\d{4,}|deposito\s+(?:dinheiro|corban|cheque)|dep\s+(?:dinheiro|corban|cheque))/i;

// Post-process anti-polluição em txs PRESENCE_ONLY (cobranças de produto
// isolado: tit_cap, seguros, mora_cel, etc).
//
// Quando o groupByY do PDF.js funde a linha de continuação de uma tx com a
// próxima row do extrato, surgem dois cenários distintos:
//
//   CENÁRIO A (Janeila 2026-05-14, tit_cap legítimo polluído):
//     Row real: "TITULO DE CAPITALIZACAO 1503743 100,00 2.408,44" (valor R$ 100)
//     Row N+1 (continuação misturada): "SAQUE DIN CORBAN RECIBO ESPECIE 90,00"
//     groupByY funde → histórico vira "TITULO DE CAPITALIZACAO 1503743 SAQUE
//     DIN CORBAN RECIBO". Valor 100 está CORRETO (era da linha do TIT_CAP).
//     Killer-word SAQUE veio do ruído da continuation.
//     Fix: trimar tudo a partir do killer → histórico fica "TITULO DE
//     CAPITALIZACAO 1503743", tx legítima preservada.
//
//   CENÁRIO B (Josiane 2026-05-14, vida_prev Frankenstein):
//     Row N (continuação polluindo): "BRADESCO VIDA E PREVIDENCIA SA"
//     Row real do extrato: "27/01/2021 SAQUE DIN CORBAN CARTAO 3743141 390,00 36,47"
//     groupByY funde N+real → histórico vira "BRADESCO V&P SA SAQUE DIN CORBAN
//     CARTAO 3743141". Valor 390 É DO SAQUE, não da V&P. A tx inteira é falsa.
//     Trim do CENÁRIO A aqui MASCARA o problema: histórico vira "BRADESCO V&P SA"
//     limpo mas o valor 390 continua errado, e burla o auto-reject downstream
//     do reviewer (que valida `KILLER_WORDS_REGEX` no histórico).
//
// Distinção A vs B: olhar a CATEGORIA do KILLER. Se o killer-word é também
// keyword de outra categoria reconhecida (saque_terminal, gastos_cartao,
// tarifas, credito, etc), é Cenário B → tx Frankenstein → DESCARTAR (return
// null, caller filtra). Se o killer é só ruído sem categoria própria (texto
// solto da continuation), é Cenário A → trim normal.
//
// Idempotente: se o trim quebrar a categoria, retorna tx original.
function trimHistoricoPolluido(tx) {
  if (!tx || !tx.historico || typeof tx.historico !== 'string') return tx;
  const cat = matchCategoria(tx.historico);
  if (!cat || !PRESENCE_ONLY_CATS_PARSER.has(cat.id)) return tx;
  const match = tx.historico.match(HISTORICO_KILLER_REGEX);
  if (!match) return tx;
  const cutIdx = match.index;
  if (cutIdx === 0) return tx; // killer no início — não é polluição, é a tx real

  // Cenário B (Frankenstein) vs A (legítimo): a distinção é a posição do
  // docto (≥6 dígitos) relativa ao nome PRESENCE_ONLY e ao killer-word.
  //
  // Janeila (legítimo): "TITULO DE CAPITALIZACAO 1503743 SAQUE DIN CORBAN RECIBO"
  //   → docto 1503743 ENTRE nome+killer (parte da row real do tit_cap).
  //   → Killer veio de continuação merged, valor está correto. Trim normal.
  //
  // Josiane (Frankenstein): "BRADESCO V&P SA SAQUE DIN CORBAN CARTAO 3743141"
  //   → SEM docto entre nome+killer. Docto 3743141 está DEPOIS do killer
  //     (pertence à row do saque que foi mergeada). Valor 390 também é do saque.
  //   → Tx inteira é falsa. DESCARTAR (return null).
  //
  // Heurística: se NÃO houver docto entre nome PRESENCE_ONLY e killer-word,
  // a row real do PRESENCE_ONLY nem chegou a aparecer no histórico — é só
  // continuation que se misturou com row real de outra transação.
  const beforeKiller = tx.historico.substring(0, cutIdx);
  const hasDoctoBetween = /\b\d{6,}\b/.test(beforeKiller);
  if (!hasDoctoBetween) {
    return null; // Frankenstein — descarta tx (caller filtra nulls)
  }

  // Cenário A: trim normal do killer-word (continuation ruído).
  const trimmed = tx.historico.substring(0, cutIdx).trim();
  if (!trimmed) return tx;
  const newCat = matchCategoria(trimmed);
  if (!newCat || newCat.id !== cat.id) return tx;
  return { ...tx, historico: trimmed };
}

function pickDebit(rowValues, cols) {
  if (!rowValues.length) return null;
  const { debitoX, creditoX, saldoX } = cols;

  if (debitoX !== null) {
    // Pegar o valor mais próximo da coluna Débito que NÃO esteja mais perto de Crédito ou Saldo
    let best = null, bestDist = Infinity;
    for (const rv of rowValues) {
      const distDeb = Math.abs(rv.x - debitoX);
      if (creditoX !== null && Math.abs(rv.x - creditoX) < distDeb) continue;
      if (saldoX !== null && Math.abs(rv.x - saldoX) < distDeb) continue;
      if (distDeb < bestDist) { bestDist = distDeb; best = rv; }
    }
    return best ? parseValor(best.text) : null;
  }

  // Fallback sem detecção de colunas: remove último (provável saldo), pega penúltimo
  const candidates = rowValues.length >= 2 ? rowValues.slice(0, -1) : rowValues;
  return candidates.length ? parseValor(candidates[candidates.length - 1].text) : null;
}

// Extrai valor do saldo (coluna saldoX) COM sinal preservado (para cálculo de delta)
function pickSaldo(rowValues, cols) {
  if (!rowValues.length || cols.saldoX === null) return null;
  let best = null, bestDist = Infinity;
  for (const rv of rowValues) {
    const dist = Math.abs(rv.x - cols.saldoX);
    if (dist < bestDist) { bestDist = dist; best = rv; }
  }
  if (!best || bestDist > 30) return null;
  const clean = best.text.replace(/[DC]$/i, "").replace(/\./g, "").replace(",", ".");
  const v = parseFloat(clean);
  return isNaN(v) ? null : v; // Preservar sinal (NÃO usar Math.abs)
}

function clusterColumns(allValueItems) {
  const xPositions = allValueItems.map(it => it.x);
  if (xPositions.length < 6) return null;
  // Histogram binning (bin width = 15pt)
  const bins = {};
  for (const x of xPositions) {
    const bin = Math.round(x / 15) * 15;
    bins[bin] = (bins[bin] || 0) + 1;
  }
  // Top 3 bins = credito, debito, saldo (sorted by X)
  const peaks = Object.entries(bins)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([x]) => parseFloat(x))
    .sort((a, b) => a - b);
  if (peaks.length === 3) return { creditoX: peaks[0], debitoX: peaks[1], saldoX: peaks[2] };
  if (peaks.length === 2) return { creditoX: null, debitoX: peaks[0], saldoX: peaks[1] };
  return null;
}

// Detecta layout: "superior" (data no topo do grupo) vs "inferior" (data no final do grupo)
function detectLayout(allRows) {
  let beforeCount = 0, afterCount = 0;
  const dateIndices = [];
  for (let i = 0; i < allRows.length; i++) {
    if (IS_DATE.test(allRows[i].items[0]?.text || "")) dateIndices.push(i);
  }
  if (dateIndices.length < 2) return "superior";
  for (const di of dateIndices) {
    // Linha imediatamente ANTES da data tem valores sem data?
    if (di > 0) {
      const prev = allRows[di - 1];
      const prevHasDate = IS_DATE.test(prev.items[0]?.text || "");
      const prevHasValues = prev.items.some(it => IS_VALUE.test(it.text));
      if (!prevHasDate && prevHasValues) beforeCount++;
    }
    // Linha imediatamente DEPOIS da data tem valores sem data?
    if (di < allRows.length - 1) {
      const next = allRows[di + 1];
      const nextHasDate = IS_DATE.test(next.items[0]?.text || "");
      const nextHasValues = next.items.some(it => IS_VALUE.test(it.text));
      if (!nextHasDate && nextHasValues) afterCount++;
    }
  }
  return beforeCount > afterCount ? "inferior" : "superior";
}

// Extrai histórico e valor de débito de uma row
function extractFromRow(row, cols, skipDate) {
  const startIdx = skipDate ? 1 : 0;
  const afterStart = row.items.slice(startIdx);
  const firstValIdx = afterStart.findIndex(i => IS_VALUE.test(i.text));
  const histItems = firstValIdx >= 0 ? afterStart.slice(0, firstValIdx) : afterStart;
  let historico = histItems.map(i => i.text).join(" ").trim();
  // PDF.js às vezes funde tokens contíguos quando há pouco espaço entre eles (linhas compactas
  // Bradesco tipo "MORA CREDITO PESSOAL 7000278 187,52 0,48"). O resultado é IS_VALUE não casar
  // o token fundido, e os valores vazam pro histórico. Limpamos valores numéricos do FINAL
  // (saldo, depois débito) — em casos normais o histórico nunca termina em IS_VALUE.
  historico = historico.replace(/(?:\s+-?\d{1,3}(?:\.\d{3})*,\d{2}[DC]?){1,3}\s*$/, '').trim();
  const rowValues = row.items.filter(i => IS_VALUE.test(i.text));
  const debitVal = rowValues.length > 0 ? pickDebit(rowValues, cols) : null;
  const saldoVal = rowValues.length > 0 ? pickSaldo(rowValues, cols) : null;
  return { historico, debitVal, saldoVal };
}

/* ── Pass 1: Classificar cada row (date / values / text / header / summary / empty) ── */
function classifyRows(allRows, cols, needsOCR) {
  const classified = [];
  for (let ri = 0; ri < allRows.length; ri++) {
    const row = allRows[ri];
    const first = row.items[0]?.text || "";
    const isDateRow = IS_DATE.test(first);
    const rowValues = row.items.filter(i => IS_VALUE.test(i.text));
    const hasValues = rowValues.length > 0;
    const text = row.items.map(i => i.text).join(" ").trim();

    // Skip empty rows
    if (!text) { classified.push({ type: "empty", ri }); continue; }

    // Headers and summaries
    if (IS_HEADER.test(text) && !matchCategoria(text)) { classified.push({ type: "header", ri, row }); continue; }
    if (IS_SUMMARY.test(text)) { classified.push({ type: "summary", ri }); continue; }

    if (isDateRow) {
      const { historico, debitVal, saldoVal } = extractFromRow(row, cols, true);
      if (IS_SUMMARY.test(historico)) { classified.push({ type: "summary", ri }); continue; }
      classified.push({
        type: "date",
        ri,
        date: first,
        historico,
        debitVal,
        saldoVal,
        hasValues,
        rowValues,
        row,
      });
    } else if (hasValues) {
      // Row with values but no date
      const { historico, debitVal, saldoVal } = extractFromRow(row, cols, false);
      classified.push({
        type: "values",
        ri,
        historico,
        debitVal,
        saldoVal,
        hasValues: true,
        rowValues,
        row,
      });
    } else {
      // Text-only row
      const cat = matchCategoria(text);
      classified.push({
        type: "text",
        ri,
        text,
        categoria: cat,
        row,
      });
    }
  }
  return classified;
}

/* ── Pass 2: Montar transações com contexto bidirecional ── */
function assembleTransactions(classified, layout) {
  const allTransactions = [];
  const buffer = []; // para layout "inferior"
  let lastDate = null;

  function emit(t) {
    if (IS_SUMMARY.test(t.historico)) return;
    if (layout === "inferior" && !t.data) {
      buffer.push(t);
    } else {
      allTransactions.push(t);
    }
  }

  function flushBuffer(date) {
    for (const t of buffer) { if (!t.data) t.data = date; }
    allTransactions.push(...buffer);
    buffer.length = 0;
  }

  // Helper: look ahead from index i+1 for consecutive "text" rows, then a "values" or "date" row
  function lookAhead(i) {
    let j = i + 1;
    while (j < classified.length && classified[j].type === "text") j++;
    if (j < classified.length) return classified[j];
    return null;
  }

  // Track what the last emitted transaction was (for detail appending)
  let lastEmitted = null;
  // Track if we're in a "just emitted" state (previous row produced a transaction)
  let justEmitted = false;
  // Pending transaction being built
  let pending = null;
  // Saldo-delta tracking for transactions without explicit debit value (e.g. MORA)
  let lastSaldo = null;

  function updateSaldo(c) {
    if (c.saldoVal !== null && c.saldoVal !== undefined) lastSaldo = c.saldoVal;
  }

  // Emit a categorized pending that has no explicit valor, using saldo-delta if possible
  function emitNoValue(p) {
    if (!p || !matchCategoria(p.historico)) return;
    emit(p);
  }

  for (let i = 0; i < classified.length; i++) {
    const c = classified[i];



    if (c.type === "empty" || c.type === "header" || c.type === "summary") {
      if (c.type === "summary") { pending = null; justEmitted = false; }
      // Reset state at period boundaries (new section headers like "Data Histórico", "Extrato de:")
      if (c.type === "header" && c.row) {
        const hText = c.row.items.map(it => it.text).join(" ");
        if (/data\s+hist[oó]rico|extrato\s+de\s*:/i.test(hText)) {
          if (pending && !pending.valor) emitNoValue(pending);
          pending = null; justEmitted = false;
          lastSaldo = null; // Reset saldo at period boundary
        }
      }
      continue;
    }

    if (c.type === "date") {
      // Flush any pending with value
      if (pending?.valor) { emit(pending); lastEmitted = pending; pending = null; }
      justEmitted = false;

      // In inferior layout, date flushes buffer
      if (layout === "inferior") flushBuffer(c.date);
      lastDate = c.date;

      // Fix: pending without value + date-row with debit → close pending with date-row data
      // Only when: pending has recognized category AND date-row historico is docto-only (no text content)
      const dateHistIsDocto = !c.historico || /^\d[\d\s]*$/.test(c.historico.trim());
      if (pending && !pending.valor && c.hasValues && c.debitVal && matchCategoria(pending.historico) && dateHistIsDocto) {
        pending.data = c.date;
        if (c.historico) pending.historico = (pending.historico + " " + c.historico).trim();
        pending.valor = c.debitVal;
        pending.saldo = c.saldoVal ?? null;
        emit(pending);
        lastEmitted = pending;
        pending = null;
        justEmitted = true;
      } else if (c.hasValues && c.debitVal) {
        // Complete transaction on one line
        const t = { data: c.date, historico: c.historico, valor: c.debitVal, saldo: c.saldoVal ?? null };
        emit(t);
        lastEmitted = t;
        pending = null;
        justEmitted = true;
      } else if (c.hasValues) {
        // Has values but no debit (credit-only) — phantom absorber
        pending = null;
        lastEmitted = { data: c.date, historico: c.historico, valor: null };
        justEmitted = true;
      } else {
        // Date with text but no values — start pending
        pending = { data: c.date, historico: c.historico, valor: null };
      }
      updateSaldo(c);

    } else if (c.type === "text") {
      if (pending?.valor) { emit(pending); lastEmitted = pending; pending = null; justEmitted = "pending-close"; }

      if (pending) {
        // Continue building pending's historico
        if (IS_SUMMARY.test(pending.historico)) { pending = null; continue; }
        // Guard: if pending already has a value AND text is a separate transaction, close pending
        // Exception: SAQUEterminal etc. after TARIFA BANCARIA is a descriptor, not a separate tx
        if (IS_SEPARATE_TX.test(c.text) && !(IS_SAQUE_DESCRIPTOR.test(c.text) && IS_TARIFA_PREFIX.test(pending.historico)) && (pending.valor || matchCategoria(pending.historico))) {
          if (pending.valor) { emit(pending); lastEmitted = pending; }
          pending = { data: pending.data, historico: c.text, valor: null };
          continue;
        }
        // Guard: text has recognized category but pending has no value and no category → start new pending
        if (c.categoria && !pending.valor && !matchCategoria(pending.historico)) {
          pending = { data: pending.data, historico: c.text, valor: null };
          continue;
        }
        // Guard: pending already categorized + text has DIFFERENT category → separate transactions
        // Ex: pending="CAPITALIZACAO 1259..." (tit_cap) + text="TARIFA BANCARIA..." (tarifas) → split
        {
          const pendingCat = matchCategoria(pending.historico);
          if (pendingCat && c.categoria && c.categoria.id !== pendingCat.id) {
            if (pending.valor) { emit(pending); lastEmitted = pending; }
            pending = { data: pending.data, historico: c.text, valor: null };
            continue;
          }
        }
        pending.historico = (pending.historico + " " + c.text).trim();
      } else if (justEmitted && lastEmitted) {
        // BIDIRECTIONAL DECISION: Is this text a detail of lastEmitted, or title of a new transaction?

        // Look ahead: does the next non-text row have values?
        const nextNonText = lookAhead(i);
        const nextHasValues = nextNonText && (nextNonText.type === "values" || (nextNonText.type === "date" && nextNonText.hasValues));

        // Check categories (any justEmitted state, not just "standalone")
        const textCat = justEmitted && (nextHasValues || lastEmitted.valor == null) ? c.categoria : null;
        const lastCat = textCat ? matchCategoria(lastEmitted.historico) : null;

        // Case 1: standalone-emitted + next has values + different category → new transaction
        if (textCat && (!lastCat || textCat.id !== lastCat.id)) {
          // Exception: CESTA and SAQUE descriptors are sub-descriptions of TARIFA BANCARIA
          if (lastCat && lastCat.id === "tarifas" && (textCat.id === "cesta" || (textCat.id === "saque_terminal" && IS_SAQUE_DESCRIPTOR.test(c.text)))) {
            lastEmitted.historico = (lastEmitted.historico + " " + c.text).trim();
          } else if (!lastCat && lastEmitted.valor) {
            // lastEmitted has value but no category — text is keyword that categorizes it
            // Prepend so category keyword comes first (avoids REM:/DES: prefix blocking matchCategoria)
            // Ex: "PAGTO ELETRON COBRANCA 0000759" → "BRADESCO VIDA E PREVIDENCIA PAGTO ELETRON COBRANCA 0000759"
            // Guard: if text is a separate TX type OR has values coming (standalone or on date row),
            // it's a NEW transaction — don't recategorize the previous one
            if (IS_SEPARATE_TX.test(c.text) || nextHasValues) {
              const date = layout === "superior" ? lastDate : null;
              if (date || layout === "inferior") {
                pending = { data: date, historico: c.text, valor: null };
              }
              justEmitted = false;
            } else {
              lastEmitted.historico = (c.text + " " + lastEmitted.historico).trim();
            }
          } else {
            const date = layout === "superior" ? lastDate : null;
            if (date || layout === "inferior") {
              pending = { data: date, historico: c.text, valor: null };
            }
            justEmitted = false;
          }
        } else {
          // Guard: separate transaction patterns should never be merged as details
          // Exception: SAQUEterminal etc. after TARIFA BANCARIA is a descriptor
          if (IS_SEPARATE_TX.test(c.text) && !(IS_SAQUE_DESCRIPTOR.test(c.text) && IS_TARIFA_PREFIX.test(lastEmitted.historico))) {
            const date = layout === "superior" ? lastDate : null;
            if (date || layout === "inferior") {
              pending = { data: date, historico: c.text, valor: null };
            }
            justEmitted = false;
          } else if (c.categoria && lastEmitted.valor && !matchCategoria(lastEmitted.historico)) {
            // BIDIRECTIONAL CHECK: lastEmitted has value but no recognized category — prepend keyword text
            // Guard: separate TX types should never be prepended (they are independent transactions)
            if (IS_SEPARATE_TX.test(c.text)) {
              const date = layout === "superior" ? lastDate : null;
              if (date || layout === "inferior") {
                pending = { data: date, historico: c.text, valor: null };
              }
              justEmitted = false;
            } else {
              lastEmitted.historico = (c.text + " " + lastEmitted.historico).trim();
            }
          } else if (lastEmitted.valor && nextHasValues && c.categoria &&
                     lastEmitted.historico.includes(c.text)) {
            // Same-category text repeats keyword already in lastEmitted → new TX
            // Ex: 2nd "TARIFA EMISSAO EXTRATO" after "TARIFA EMISSAO EXTRATO 0280619 EXTRATOmes(E)"
            const date = layout === "superior" ? lastDate : null;
            if (date || layout === "inferior") {
              pending = { data: date, historico: c.text, valor: null };
            }
            justEmitted = false;
          } else {
            // Default: append as detail
            lastEmitted.historico = (lastEmitted.historico + " " + c.text).trim();
          }
        }
      } else {
        // No pending, not just emitted — check if this is sub-description of last
        if (lastEmitted && lastEmitted.valor) {
          const lCat = matchCategoria(lastEmitted.historico);
          const tCat = c.categoria;
          if (lCat?.id === "tarifas" && (tCat?.id === "cesta" || (tCat?.id === "saque_terminal" && IS_SAQUE_DESCRIPTOR.test(c.text)))) {
            lastEmitted.historico = (lastEmitted.historico + " " + c.text).trim();
            continue;
          }
        }
        // Start new pending
        const date = layout === "superior" ? lastDate : null;
        if (date || layout === "inferior" || c.categoria) {
          pending = { data: date, historico: c.text, valor: null };
        }
        justEmitted = false;
      }

    } else if (c.type === "values") {
      if (pending) {
        // Close pending with these values
        const firstValIdx = c.row.items.findIndex(it => IS_VALUE.test(it.text));
        if (firstValIdx > 0) {
          const extra = c.row.items.slice(0, firstValIdx).map(it => it.text).join(" ").trim();
          if (extra) {
            const extraCat = matchCategoria(extra);
            const pendingCat = matchCategoria(pending.historico);
            if (extraCat && (!pendingCat || extraCat.id !== pendingCat.id)) {
              // Extra has recognized category different from pending's — separate
              pending = { data: pending.data, historico: extra, valor: null };
            } else if (!extraCat && /\biof\s/i.test(extra)) {
              // IOF text on values row — don't absorb into pending (IOF is not contestable)
              pending = null;
            } else {
              pending.historico = (pending.historico + " " + extra).trim();
            }
          }
        }
        if (pending && c.debitVal) {
          pending.valor = c.debitVal;
          pending.saldo = c.saldoVal ?? null;
          emit(pending);
          lastEmitted = pending;
          // Allow continuation when pending has no category (next text may categorize it)
          // Ex: "PAGTO ELETRON COBRANCA 0000759" (no cat) + next text "BRADESCO VIDA E PREVIDENCIA" → append
          justEmitted = (firstValIdx === 0 || !matchCategoria(pending.historico)) ? "pending-close" : false;
          pending = null;
        } else if (pending && !c.debitVal && c.saldoVal != null && lastSaldo != null && matchCategoria(pending.historico)) {
          // Saldo-delta: no explicit debit but saldo changed → compute from delta
          // Guard: delta must be positive (debit reduces saldo) and saldo must have decreased
          const delta = lastSaldo - c.saldoVal;
          if (delta > 0.01) {
            pending.valor = Math.round(delta * 100) / 100;
            pending.saldo = c.saldoVal;
            emit(pending);
            lastEmitted = pending;
          }
          pending = null;
        } else {
          pending = null;
        }
      } else {
        // Standalone transaction
        if (c.debitVal) {
          const date = layout === "superior" ? lastDate : null;
          const t = { data: date, historico: c.historico, valor: c.debitVal, saldo: c.saldoVal ?? null };
          emit(t);
          lastEmitted = t;
          justEmitted = "standalone";
        } else if (c.saldoVal != null && lastSaldo != null && matchCategoria(c.historico)) {
          // Standalone values row with saldo-only + recognized category → saldo-delta
          // Guard: delta must be positive (debit reduces saldo)
          const delta = lastSaldo - c.saldoVal;
          if (delta > 0.01) {
            const date = layout === "superior" ? lastDate : null;
            const t = { data: date, historico: c.historico, valor: Math.round(delta * 100) / 100, saldo: c.saldoVal };
            emit(t);
            lastEmitted = t;
            justEmitted = "standalone";
          } else {
            lastEmitted = { data: layout === "superior" ? lastDate : null, historico: c.historico, valor: null };
            justEmitted = "standalone";
          }
        } else {
          // Credit-only standalone — phantom
          lastEmitted = { data: layout === "superior" ? lastDate : null, historico: c.historico, valor: null };
          justEmitted = "standalone";
        }
      }
      updateSaldo(c);
    }
  }

  // Final flush
  if (pending?.valor) { emit(pending); lastEmitted = pending; }
  else if (pending) { emitNoValue(pending); }
  if (buffer.length > 0) flushBuffer(lastDate || "—");

  // Post-process: limpar histórico polluído de PRESENCE_ONLY txs quando
  // o parser concatenou texto de row adjacente (groupByY collapse ou
  // justEmitted append). Caso paradigma Janeila 2026-05-14.
  // V2 (Josiane 2026-05-14): trimHistoricoPolluido pode retornar null
  // quando detecta Frankenstein (PRESENCE_ONLY + killer com outra categoria
  // reconhecida — valor não pertence à PRESENCE_ONLY). Filtrar nulls.
  return allTransactions.map(trimHistoricoPolluido).filter(Boolean);
}

function validateWithBalance(transactions, allRows, cols) {
  // Extract saldo values from rows that have 3 values (credito, debito, saldo)
  const warnings = [];
  let prevSaldo = null;
  for (const row of allRows) {
    const values = row.items.filter(i => IS_VALUE.test(i.text));
    if (values.length < 2 || !cols.saldoX) continue;
    // Find the saldo value (closest to saldoX)
    let saldoItem = null, minDist = Infinity;
    for (const v of values) {
      const dist = Math.abs(v.x - cols.saldoX);
      if (dist < minDist) { minDist = dist; saldoItem = v; }
    }
    if (!saldoItem) continue;
    const saldo = parseValor(saldoItem.text);
    if (saldo === null) continue;
    if (prevSaldo !== null) {
      const diff = Math.abs(saldo - prevSaldo);
      // Find the debit value for this row
      const debitItem = values.find(v => v !== saldoItem && cols.debitoX && Math.abs(v.x - cols.debitoX) < 50);
      if (debitItem) {
        const debit = parseValor(debitItem.text);
        if (debit && Math.abs(diff - debit) > debit * 0.1) {
          warnings.push({
            type: "balance_mismatch",
            expectedDiff: debit,
            actualDiff: diff,
            saldo,
            prevSaldo,
          });
        }
      }
    }
    prevSaldo = saldo;
  }
  return warnings;
}

/* ── Parser Itaú Mobile (OCR de screenshots do app) ──
   Formato: lista flat, sem tabela. Cada transação é ~2 rows:
     Row 1: descrição (e.g., "anuidade e pacote de serviço")
     Row 2: data + valor (e.g., "9 de fevereiro > dez/22 -R$ 14,70")
   Valores com prefixo -R$ (débito) ou +R$ (crédito). OCR pode garble $ → 5.
   Datas em formato mês/AA (set/22, dez/22) — convertidas para 01/MM/YYYY.
*/
const IS_ITAU_MOBILE_VALUE = /[-]R[\$5]\s*([\d.,]+)/;
const MONTH_ABBR_MAP = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06",
  jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
};

function parseItauMobile(pageData, bankProfile) {
  const transactions = [];
  const dedup = new Set();

  // Scan all rows, collecting description text and pairing with values
  let pendingDesc = "";
  for (const pd of pageData) {
    for (const row of pd.rows) {
      const text = row.items.map(i => i.text).join(" ").trim();
      if (!text) continue;
      // Skip header/nav elements
      if (/^meu\s+extrato|^minhas\s+finan|^saldo\s+sempre|^filtros|^lan[cç]amentos\s+futuros|^para\s+movimenta|^transa[cç][oõ]es|^produtas|^ajuda$/i.test(text)) continue;
      if (/^conta\s+t|^n\$\s|^D,\s*DO$/i.test(text)) continue; // garbled header

      // Check for value in this row
      const valMatch = IS_ITAU_MOBILE_VALUE.exec(text);
      if (valMatch) {
        const valor = parseValor(valMatch[1]);
        if (!valor) { pendingDesc = ""; continue; }

        // Extract description: everything before the value pattern
        const beforeVal = text.substring(0, valMatch.index).trim();
        const fullDesc = pendingDesc ? `${pendingDesc} ${beforeVal}`.trim() : beforeVal;
        pendingDesc = "";

        // Try to extract date (mês/AA pattern)
        let date = "—";
        const dateMatch = text.match(/\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\/(\d{2})\b/i);
        if (dateMatch) {
          const mm = MONTH_ABBR_MAP[dateMatch[1].toLowerCase()];
          const yy = dateMatch[2];
          const yyyy = parseInt(yy) > 50 ? `19${yy}` : `20${yy}`;
          date = `01/${mm}/${yyyy}`;
        }

        // Only emit if description matches a category
        const cat = matchCategoria(fullDesc);
        if (cat) {
          const key = `${date}|${normalizeText(fullDesc)}|${valor}`;
          if (!dedup.has(key)) {
            dedup.add(key);
            transactions.push({ data: date, historico: fullDesc, valor, categoria: cat.id });
          }
        }
      } else {
        // No value — accumulate as description for next row
        pendingDesc = pendingDesc ? `${pendingDesc} ${text}`.trim() : text;
      }
    }
  }

  return {
    clientName: "—",
    agencia: "",
    conta: "",
    banco: bankProfile.name,
    periodo: "—",
    transactions,
    bankName: bankProfile.name,
  };
}

/* ── Parser Agibank ──
   Formato: 1-2 linhas por transação, coluna única Valor com prefixo +/- R$
   Datas DD/MM (sem ano — derivar do header), Data apenas na 1ª linha de cada dia
   Colunas: Data (x~40), Detalhe (x~90), Valor (x~427), Saldo (x~504)
*/
const IS_AGIBANK_VALUE = /^([+-])\s*R\$\s*([\d.,]+)$/;
const IS_SHORT_DATE_AGIBANK = /^\d{2}\/\d{2}$/;

function parseAgibankTransactions(pageData, bankProfile) {
  const transactions = [];
  let clientName = "", agencia = "", conta = "", periodo = "";

  // Extrair header info
  for (let i = 0; i < Math.min(3, pageData.length); i++) {
    const { flat, rows } = pageData[i];
    if (!clientName) {
      // First row is usually the client name
      for (const row of rows) {
        const text = row.items.map(it => it.text).join(" ").trim();
        if (/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-záàâãéêíóôõúç]+(\s+[A-Za-záàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]+){1,8}$/.test(text) && text.length > 5) {
          clientName = text;
          break;
        }
      }
    }
    if (!agencia) {
      const m = flat.match(/ag[eê]ncia\s*(\d{3,6})/i);
      if (m) agencia = m[1];
    }
    if (!conta) {
      const m = flat.match(/conta\s*(\d{6,12})/i);
      if (m) conta = m[1];
    }
    if (!periodo) {
      const m = flat.match(/extrato\s+de\s+(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i);
      if (m) periodo = `${m[1]} a ${m[2]}`;
    }
  }

  // Derive year from periodo
  let defaultYear = new Date().getFullYear().toString();
  if (periodo) {
    const ym = periodo.match(/(\d{4})/);
    if (ym) defaultYear = ym[1];
  }

  const IS_HEADER = bankProfile.headerPattern;
  const IS_SUMMARY = bankProfile.summaryPattern;

  let lastDate = "";
  let pendingDesc = null; // For 2-line transactions: description on first row, value on second

  for (const pd of pageData) {
    for (let ri = 0; ri < pd.rows.length; ri++) {
      const row = pd.rows[ri];
      const text = row.items.map(i => i.text).join(" ").trim();
      if (!text) continue;
      if (IS_HEADER.test(text)) continue;
      if (IS_SUMMARY.test(text)) continue;

      const first = row.items[0]?.text?.trim() || "";
      const hasDate = IS_SHORT_DATE_AGIBANK.test(first);
      if (hasDate) lastDate = first;

      // Try to find value in this row
      let valor = null;
      let isDebit = false;
      let descItems = [];

      for (const item of row.items) {
        const trimmed = item.text.trim();
        if (IS_SHORT_DATE_AGIBANK.test(trimmed) && item.x < 60) continue; // skip date
        const valMatch = IS_AGIBANK_VALUE.exec(trimmed);
        if (valMatch) {
          isDebit = valMatch[1] === "-";
          valor = parseValor(valMatch[2]);
          continue;
        }
        // Skip saldo values (R$ without +/- prefix, at saldo position x~504+)
        if (/^R\$\s*[\d.,]+$/.test(trimmed) && item.x > 480) continue;
        descItems.push(trimmed);
      }

      const desc = descItems.join(" ").trim();

      if (valor !== null) {
        // Row has value — complete transaction
        const fullDesc = pendingDesc ? `${pendingDesc} ${desc}`.trim() : desc;
        pendingDesc = null;

        if (!isDebit) continue; // Only debits are charges
        if (!fullDesc || !lastDate) continue;

        const cat = matchCategoria(fullDesc);
        if (!cat) continue;

        const fullDate = `${lastDate}/${defaultYear}`;
        transactions.push({ data: fullDate, historico: fullDesc, valor, categoria: cat.id });
      } else if (desc && !hasDate) {
        // Row has description but no value — continuation of previous desc or start of 2-line txn
        if (pendingDesc) {
          pendingDesc = `${pendingDesc} ${desc}`;
        } else {
          pendingDesc = desc;
        }
      } else if (desc && hasDate) {
        // Date row with description but no value — start of 2-line txn
        pendingDesc = desc;
      }
    }
  }

  // Dedup
  const seen = new Set();
  const deduped = transactions.filter(t => {
    const key = `${t.data}|${t.historico}|${t.valor}|${t.saldo == null ? '' : Number(t.saldo).toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { clientName: clientName || "Titular não identificado", agencia, conta, banco: bankProfile.name, periodo: periodo || "—", transactions: deduped };
}

/* ── Parser Itaú — Extrato Anual de Tarifas ──
   Formato especial: DIA (DD/MMM) | TARIFA | VALOR (positivo, tudo é débito)
   Colunas: x=113 DIA, x=161 TARIFA, x=421-427 VALOR
*/
const MONTH_MAP = { JAN: "01", FEV: "02", MAR: "03", ABR: "04", MAI: "05", JUN: "06", JUL: "07", AGO: "08", SET: "09", OUT: "10", NOV: "11", DEZ: "12" };
const IS_DATE_MMM = /^\d{2}\/(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)$/i;

function parseItauTarifasAnuais(pageData, bankProfile) {
  const transactions = [];
  let clientName = "", agencia = "", conta = "", periodo = "";

  // Extrair header info e anos cobertos
  const years = [];
  for (const pd of pageData) {
    const m = pd.flat.match(/PERIODO\s+DE\s+\d{2}\/\d{2}\/(\d{4})\s+A\s+\d{2}\/\d{2}\/(\d{4})/i);
    if (m) {
      const y = m[2];
      if (!years.includes(y)) years.push(y);
      if (!periodo) periodo = `01/01/${m[1]} a 31/12/${m[2]}`;
    }
    if (!clientName) {
      // Client name is on its own line after "PERIODO DE..."
      const nm = pd.flat.match(/PERIODO\s+DE[^A-Z]+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{3,60}?)(?=\s+COM\s+BASE)/i);
      if (nm) clientName = nm[1].trim();
    }
    if (!agencia) {
      const am = pd.flat.match(/AGENCIA\s+(\d{3,6})\s+CONTA\s+([\d-]+)/i);
      if (am) { agencia = am[1]; conta = am[2]; }
    }
  }
  const defaultYear = years[0] || new Date().getFullYear().toString();

  // Track current year per section (each section starts with "TARIFAS DEBITADAS EM YYYY")
  let currentYear = defaultYear;

  for (const pd of pageData) {
    // Check for year section header
    const ym = pd.flat.match(/TARIFAS\s+DEBITADAS\s+EM\s+(\d{4})/i);
    if (ym) currentYear = ym[1];
    // Also check PERIODO on this page
    const pm = pd.flat.match(/PERIODO\s+DE\s+\d{2}\/\d{2}\/(\d{4})\s+A\s+\d{2}\/\d{2}\/(\d{4})/i);
    if (pm) currentYear = pm[2];

    for (const row of pd.rows) {
      // Dedup items within row (some PDFs have 5x duplicated text at same position)
      const seenItems = new Set();
      const items = row.items.filter(it => {
        const key = `${Math.round(it.x)}|${it.text}`;
        if (seenItems.has(key)) return false;
        seenItems.add(key);
        return true;
      });
      const first = items[0]?.text?.trim() || "";

      // Skip headers, summaries, totals
      if (/^DIA$/i.test(first)) continue;
      if (/VALOR\s+TOTAL\s+EM/i.test(items.map(i => i.text).join(" "))) continue;
      if (/RESUMO\s+DAS\s+TARIFAS/i.test(items.map(i => i.text).join(" "))) continue;
      if (/VALOR\s+TOTAL\s+DEBITADO/i.test(items.map(i => i.text).join(" "))) continue;
      if (/VALOR\s+MEDIO/i.test(items.map(i => i.text).join(" "))) continue;
      if (/^-+$/.test(first)) continue;

      // Match DD/MMM date
      if (!IS_DATE_MMM.test(first)) continue;

      const [dd, mmm] = first.split("/");
      const mm = MONTH_MAP[mmm.toUpperCase()];
      if (!mm) continue;
      const fullDate = `${dd}/${mm}/${currentYear}`;

      // Collect description (items between date and value)
      const descItems = [];
      let valor = null;
      for (let idx = 1; idx < items.length; idx++) {
        const item = items[idx];
        if (IS_VALUE.test(item.text)) {
          valor = parseValor(item.text);
        } else {
          descItems.push(item.text);
        }
      }

      const historico = descItems.join(" ").trim();
      if (!historico || !valor) continue;

      // ALL values in "Extrato Anual de Tarifas" are debits (tariff charges)
      const cat = matchCategoria(historico);
      if (!cat) continue;

      transactions.push({ data: fullDate, historico, valor, categoria: cat.id });
    }
  }

  // Dedup (same PDF may have repeated sections)
  const seen = new Set();
  const deduped = transactions.filter(t => {
    const key = `${t.data}|${t.historico}|${t.valor}|${t.saldo == null ? '' : Number(t.saldo).toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { clientName: clientName || "Titular não identificado", agencia, conta, banco: bankProfile.name, periodo: periodo || "—", transactions: deduped };
}

/* ── Parser Itaú ──
   Formato: 1 linha por transação, coluna "valor (R$)" com sinal (- = débito)
   Sem multi-line, sem Docto, sem layout duplo
*/
function parseItauTransactions(pageData, bankProfile) {
  const transactions = [];
  let clientName = "", agencia = "", conta = "", periodo = "";

  // Detectar posição X da coluna "valor" e "saldo"
  let valorX = null, saldoX = null;
  for (const pd of pageData) {
    for (const item of pd.items) {
      if (/^valor(\s*\(r\$\))?$/i.test(item.text) && valorX === null) valorX = item.x;
      if (/^saldo(\s*\(r\$\))?$/i.test(item.text) && saldoX === null) saldoX = item.x;
    }
    if (valorX !== null) break;
  }

  // Extrair header info
  for (let i = 0; i < Math.min(3, pageData.length); i++) {
    const { flat } = pageData[i];
    if (!clientName) {
      const m = flat.match(/([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{3,60}?)\s+\d{3}\.\d{3}\.\d{3}[-.]?\d{2}/);
      if (m) clientName = m[1].replace(/\s+/g, " ").trim();
    }
    if (!clientName) {
      // Format B: "Cliente NOME Agência: ..."
      const mc = flat.match(/Cliente\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{3,60}?)\s+Ag[eê]ncia/i);
      if (mc) clientName = mc[1].replace(/\s+/g, " ").trim();
    }
    if (!agencia) {
      const m = flat.match(/ag[eê]ncia\s*[:\-]?\s*([\d]{3,6}[-]?\d?)/i);
      if (m) agencia = m[1];
    }
    if (!conta) {
      const m = flat.match(/conta\s*[:\-]?\s*([\d]{4,8}[-][\d])/i);
      if (m) conta = m[1];
    }
    if (!periodo) {
      const m = flat.match(/per[ií]odo\s+de\s+visualiza[cç][aã]o\s*:\s*([\d\/]+)\s+at[eé]\s+([\d\/]+)/i);
      if (m) periodo = `${m[1]} a ${m[2]}`;
    }
    if (!periodo) {
      // Format B: "Período: 01 a 31/01/2025"
      const mp = flat.match(/per[ií]odo\s*:\s*(\d{2}\s+a\s+\d{2}\/\d{2}\/\d{4})/i);
      if (mp) periodo = mp[1];
    }
  }

  const IS_ITAU_HEADER = bankProfile.headerPattern;
  const IS_ITAU_SUMMARY = bankProfile.summaryPattern;
  // Format B: value with suffix sign as single text item e.g. "97,00 (-)" or "1.000,00 (+)"
  const IS_SUFFIX_VALUE = /^(\d{1,3}(?:\.\d{3})*,\d{2})\s*\(([+-])\)$/;

  for (const pd of pageData) {
    for (let ri = 0; ri < pd.rows.length; ri++) {
      const row = pd.rows[ri];
      const text = row.items.map(i => i.text).join(" ").trim();
      if (!text) continue;
      if (IS_ITAU_HEADER.test(text)) continue;
      if (IS_ITAU_SUMMARY.test(text)) continue;
      // Format B: skip summary rows
      if (/saldo\s+(do\s+dia|anterior)|^s\s+a\s+l\s+d\s+o$/i.test(text)) continue;

      const first = row.items[0]?.text || "";
      if (!IS_DATE.test(first)) continue;

      // Extrair descrição e valor
      // Format B (Jeferson): items include lote (x~99) and documento (x~148) — skip these as metadata
      // Only items at x >= 200 are description text; items near valorX are values
      const descItems = [];
      let valor = null;
      let isDebit = false;
      for (let idx = 1; idx < row.items.length; idx++) {
        const item = row.items[idx];
        const trimmed = item.text.trim();
        // Format B: "97,00 (-)" or "1.000,00 (+)" as single text item
        const suffixMatch = IS_SUFFIX_VALUE.exec(trimmed);
        if (suffixMatch) {
          if (valorX !== null && Math.abs(item.x - valorX) > 80) continue;
          valor = parseValor(suffixMatch[1]);
          isDebit = suffixMatch[2] === "-";
          continue;
        }
        const isValue = IS_VALUE.test(trimmed);
        if (isValue) {
          if (saldoX !== null && Math.abs(item.x - saldoX) < 30) continue;
          if (valorX !== null && Math.abs(item.x - valorX) > 80) continue;
          if (trimmed.startsWith("-")) isDebit = true;
          valor = parseValor(trimmed);
        } else {
          // Skip numeric-only metadata (lote, documento) — they're between date and desc columns
          if (/^\d+$/.test(trimmed) && item.x < 200) continue;
          descItems.push(item.text);
        }
      }

      let historico = descItems.join(" ").trim();

      // Format B: description is on the ROW ABOVE the date row
      // Try prev row if: no description found OR historico is just numbers (lote/doc leaked through)
      if ((!historico || !matchCategoria(historico)) && ri > 0) {
        const prevRow = pd.rows[ri - 1];
        const prevFirst = prevRow.items[0]?.text?.trim() || "";
        const prevText = prevRow.items.map(i => i.text).join(" ").trim();
        if (!IS_DATE.test(prevFirst) && !IS_ITAU_HEADER.test(prevText) && !IS_ITAU_SUMMARY.test(prevText)
            && !/saldo\s+(do\s+dia|anterior)|^s\s+a\s+l\s+d\s+o$/i.test(prevText)
            && !/^lan[cç]amentos$/i.test(prevText)) {
          // Use prev row description, possibly combined with current
          const prevDesc = prevText;
          if (matchCategoria(prevDesc)) {
            historico = historico ? `${prevDesc} ${historico}` : prevDesc;
          }
        }
      }

      if (!historico || !valor) continue;
      if (!isDebit) continue;
      const cat = matchCategoria(historico);
      if (!cat) continue;

      transactions.push({
        data: first,
        historico,
        valor,
        categoria: cat.id,
      });
    }
  }

  // Dedup: Itaú PDFs may repeat sections across pages
  const seen = new Set();
  const deduped = transactions.filter(t => {
    const key = `${t.data}|${t.historico}|${t.valor}|${t.saldo == null ? '' : Number(t.saldo).toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { clientName: clientName || "Titular não identificado", agencia, conta, banco: bankProfile.name, periodo: periodo || "—", transactions: deduped };
}

/* ── Parser Santander ──
   Formato: multi-line (desc + detalhe), datas DD/MM (curtas), "-" no final = débito
   Colunas: date x~34, desc x~65, valores x~428-441, saldo x~513-526
*/
function parseSantanderTransactions(pageData, bankProfile) {
  const transactions = [];
  let clientName = "", agencia = "", conta = "", periodo = "";
  const IS_SHORT_DATE = /^\d{2}\/\d{2}$/;
  const IS_SANT_VALUE = /^[\d.,]+-?$/;

  // Detectar posições X das colunas por análise de dados
  let saldoX = null;
  for (const pd of pageData) {
    for (const item of pd.items) {
      // Saldo column: rightmost value column (~x>500)
      if (IS_SANT_VALUE.test(item.text) && item.x > 500 && saldoX === null) saldoX = item.x;
    }
    if (saldoX !== null) break;
  }

  // Extrair header info
  for (let i = 0; i < Math.min(3, pageData.length); i++) {
    const { flat, rows } = pageData[i];
    if (!clientName) {
      // Santander format: "Nome" on one row, name on next
      for (let r = 0; r < rows.length - 1; r++) {
        const rowText = rows[r].items.map(it => it.text).join(" ").trim();
        if (/^nome$/i.test(rowText)) {
          const nextText = rows[r + 1].items.map(it => it.text).join(" ").trim();
          if (/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{3,60}$/.test(nextText)) {
            clientName = nextText.replace(/\s+/g, " ").trim();
          }
        }
      }
    }
    if (!agencia) {
      const m = flat.match(/ag[eê]ncia\s*[:\-]?\s*(\d{3,6})/i);
      if (m) agencia = m[1];
    }
    if (!conta) {
      const m = flat.match(/conta\s+corrente\s*([\d.]+[-]\d)/i);
      if (m) conta = m[1];
    }
    if (!periodo) {
      // Try extracting from "EXTRATO CONSOLIDADO" + month/year
      const m = flat.match(/extrato\s+consolidado\s+(\w+\/\d{4})/i);
      if (m) periodo = m[1];
    }
  }

  // Determine year from "EXTRATO CONSOLIDADO mês/ano" or "SALDO EM" sections
  // We'll derive year per page from context
  let currentYear = null;
  for (const pd of pageData) {
    const yearMatch = pd.flat.match(/(\w+)\/(\d{4})/);
    if (yearMatch) { currentYear = yearMatch[2]; break; }
  }
  if (!currentYear) currentYear = new Date().getFullYear().toString();

  // Collect all periods from page headers to map months to years
  const monthYearMap = {};
  for (const pd of pageData) {
    const matches = pd.flat.matchAll(/(?:saldo\s+(?:de\s+contamax\s+)?em|extrato\s+consolidado)\s+(?:(\d{2})\/(\d{2})|\w+\/(\d{4}))/gi);
    for (const m of matches) {
      if (m[1] && m[2]) {
        // "SALDO EM DD/MM" pattern — extract month
      }
      if (m[3]) currentYear = m[3];
    }
    // Also: "PERIODO: DD/MM A DD/MM/YY" or "dezembro/2021"
    const periodMatch = pd.flat.match(/(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/(\d{4})/i);
    if (periodMatch) {
      const months = { janeiro: '01', fevereiro: '02', 'março': '03', marco: '03', abril: '04', maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12' };
      const m = months[periodMatch[1].toLowerCase()] || '01';
      monthYearMap[m] = periodMatch[2];
    }
  }

  // Parse transactions
  // Helper: extract value + debit flag from a row's items
  function extractSantValue(items, startIdx) {
    let valor = null, isDebit = false;
    const descItems = [];
    for (let idx = startIdx; idx < items.length; idx++) {
      const item = items[idx];
      const valText = item.text.trim();
      if (IS_SANT_VALUE.test(valText) && item.x > 300) {
        if (saldoX !== null && Math.abs(item.x - saldoX) < 30) continue;
        if (valor === null) {
          isDebit = valText.endsWith('-');
          valor = parseValor(valText.replace(/-$/, ''));
        }
      } else if (!/^\d{6}$/.test(valText) && valText !== '-') {
        descItems.push(valText);
      }
    }
    return { valor, isDebit, descItems };
  }

  for (const pd of pageData) {
    // Detect year for this page from EXTRATO CONSOLIDADO header
    const pageYearMatch = pd.flat.match(/(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/(\d{4})/i);
    let pageYear = pageYearMatch ? pageYearMatch[2] : currentYear;

    // Also try "PERIODO: DD/MM A DD/MM/YY" format for more precise year
    const periodoMatch = pd.flat.match(/PERIODO:\s*\d{2}\/\d{2}\s+A\s+\d{2}\/\d{2}\/(\d{2})/);
    if (periodoMatch) {
      const yy = periodoMatch[1];
      pageYear = (parseInt(yy) > 50 ? '19' : '20') + yy;
    }

    let lastDate = null; // Track last seen date for rows without one

    for (let ri = 0; ri < pd.rows.length; ri++) {
      const row = pd.rows[ri];
      const text = row.items.map(i => i.text).join(" ").trim();
      if (!text) continue;

      // Skip headers and summaries
      if (bankProfile.headerPattern.test(text)) continue;
      if (bankProfile.summaryPattern.test(text)) continue;

      const first = row.items[0]?.text?.trim() || "";
      let fullDate = null;

      if (IS_SHORT_DATE.test(first)) {
        const dateParts = first.split('/');
        fullDate = `${dateParts[0]}/${dateParts[1]}/${pageYear}`;
        lastDate = fullDate;
      } else if (lastDate && first && row.items[0]?.x < 100) {
        // Non-date row at description position — could be a charge without its own date
        fullDate = lastDate;
      } else {
        continue;
      }

      // Extract description + value from this row
      const startIdx = IS_SHORT_DATE.test(first) ? 1 : 0;
      let { valor, isDebit, descItems } = extractSantValue(row.items, startIdx);

      // Check next row for continuation (no date, no header/summary)
      if (ri + 1 < pd.rows.length) {
        const nextRow = pd.rows[ri + 1];
        const nextFirst = nextRow.items[0]?.text?.trim() || "";
        const nextText = nextRow.items.map(i => i.text).join(" ").trim();
        if (!IS_SHORT_DATE.test(nextFirst) && !/^saldo/i.test(nextFirst)
            && !bankProfile.headerPattern.test(nextText) && !bankProfile.summaryPattern.test(nextText)
            && nextRow.items[0]?.x >= 50) {
          const cont = extractSantValue(nextRow.items, 0);
          if (valor === null && cont.valor !== null) {
            valor = cont.valor;
            isDebit = cont.isDebit;
          }
          descItems.push(...cont.descItems);
          ri++;
        }
      }

      // Deduplicate adjacent identical description fragments
      const uniqueDesc = descItems.filter((d, i) => i === 0 || d !== descItems[i - 1]);
      const historico = uniqueDesc.join(" ").trim();
      if (!historico || !valor) continue;
      if (!isDebit) continue;

      // Refine year from PERIODO (e.g., "30/09/22") or month name (e.g., "OUTUBRO / 2022")
      const yearRefine = historico.match(/(\d{2})\/(\d{2})\/(\d{2})\b/);
      if (yearRefine) {
        const yy = yearRefine[3];
        const refinedYear = (parseInt(yy) > 50 ? '19' : '20') + yy;
        const parts = fullDate.split('/');
        fullDate = `${parts[0]}/${parts[1]}/${refinedYear}`;
      } else {
        const monthYearRef = historico.match(/(?:janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*\/?\s*(\d{4})/i);
        if (monthYearRef) {
          const parts = fullDate.split('/');
          fullDate = `${parts[0]}/${parts[1]}/${monthYearRef[1]}`;
        }
      }

      const cat = matchCategoria(historico);
      if (!cat) continue;

      transactions.push({
        data: fullDate,
        historico,
        valor,
        categoria: cat.id,
      });
    }
  }

  // Dedup
  const seen = new Set();
  const deduped = transactions.filter(t => {
    const key = `${t.data}|${t.historico}|${t.valor}|${t.saldo == null ? '' : Number(t.saldo).toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Build periodo from first and last transaction dates
  if (!periodo && deduped.length > 0) {
    const first = deduped[0].data;
    const last = deduped[deduped.length - 1].data;
    periodo = `${last} a ${first}`;
  }

  return { clientName: clientName || "Titular não identificado", agencia, conta, banco: bankProfile.name, periodo: periodo || "—", transactions: deduped };
}


async function parseDocumentoPDFFromDoc(pdf, onProgress, opts = {}) {
  const loadOcrWorker = opts.loadTesseract || null;

  // ── Fase 1: Extrair todas as páginas (com fallback OCR) ──
  const pageData = [];
  const ultimosPages = []; // páginas de "Últimos Lançamentos" separadas para fallback
  const cols = { debitoX: null, creditoX: null, saldoX: null };
  let needsOCR = false;
  let ocrWorker = null;

  // Tentar extração de texto na página 1 para decidir o path
  const firstPage = await pdf.getPage(1);
  const firstTc = await firstPage.getTextContent();
  const firstItems = firstTc.items.filter(it => it.str.trim());
  if (firstItems.length < 10) {
    // PDF sem texto extraível — ativar OCR (apenas browser; servidor sinaliza unsupported)
    if (loadOcrWorker) {
      needsOCR = true;
      ocrWorker = await loadOcrWorker();
    } else {
      return { clientName: "—", agencia: "", conta: "", banco: "—", periodo: "—", transactions: [], unsupported: true, requiresOcr: true };
    }
  } else {
    // PDFs com CIDFont/encoding quebrado: items existem mas texto é garbage (control chars)
    const sampleText = firstItems.slice(0, 200).map(it => it.str).join("");
    if (!/[a-zA-ZÀ-ÿ]{2,}/.test(sampleText)) {
      if (loadOcrWorker) {
        try {
          needsOCR = true;
          ocrWorker = await loadOcrWorker();
        } catch (e) {
          needsOCR = false;
          console.warn("Tesseract load failed, falling back to text extraction:", e);
        }
      } else {
        return { clientName: "—", agencia: "", conta: "", banco: "—", periodo: "—", transactions: [], unsupported: true, requiresOcr: true };
      }
    }
  }

  // ── Detectar banco (multi-page: pages 1-3 para score-based detection) ──
  const detectionTexts = [];
  const firstPageText = firstItems.length > 0
    ? firstItems.map(it => it.str || it.text || "").join(" ")
    : (needsOCR ? "bradesco" : "");
  detectionTexts.push(firstPageText);
  // Pre-scan pages 2-3 for bank detection (lightweight, text-only)
  if (!needsOCR) {
    for (let pn = 2; pn <= Math.min(3, pdf.numPages); pn++) {
      const pg = await pdf.getPage(pn);
      const tc = await pg.getTextContent();
      const pageItems = tc.items.filter(it => it.str.trim());
      detectionTexts.push(pageItems.map(it => it.str).join(" "));
    }
  }
  let bankProfile = detectBank(detectionTexts);
  if (!bankProfile.supported) {
    return {
      clientName: "—",
      agencia: "",
      conta: "",
      banco: bankProfile.name,
      periodo: "—",
      transactions: [],
      unsupported: true,
      bankName: bankProfile.name,
    };
  }

  const MAX_PAGES = 500;
  const totalPages = Math.min(pdf.numPages, MAX_PAGES);
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress && onProgress(pageNum, pdf.numPages, needsOCR);
    const page = pageNum === 1 ? firstPage : await pdf.getPage(pageNum);

    let items;
    if (needsOCR) {
      const ocrResult = await ocrPage(page, ocrWorker, OCR_SCALE);
      items = ocrResult.items;
    } else {
      const tc = pageNum === 1 ? firstTc : await page.getTextContent();
      items = tc.items.filter(it => it.str.trim())
        .map(it => ({ text: it.str.trim(), x: it.transform[4], y: it.transform[5] }));
    }

    const rows = groupByY(items, needsOCR ? 3 : 4); // OCR: tight tolerance (line-level Y já normaliza same-line words)
    const flat = items.map(i => i.text).join(" ");
    // Detectar posições X das 3 colunas de valores no cabeçalho da tabela
    // Re-detectar em cada página que tem cabeçalho (suporta PDFs multi-período)
    const pageCols = { creditoX: null, debitoX: null, saldoX: null };
    for (const item of items) {
      if (/^cr[eé]dito/i.test(item.text)) pageCols.creditoX = item.x;
      if (/^d[eé]bito/i.test(item.text)) pageCols.debitoX = item.x;
      if (/^saldo/i.test(item.text)) pageCols.saldoX = item.x;
    }
    if (pageCols.debitoX !== null) {
      Object.assign(cols, pageCols);
    }

    // Separar páginas de "Últimos Lançamentos" (resumo que repete última transação)
    // Só descartar se a página é DEDICADA a "Últimos Lançamentos" (poucas transações)
    const ultimosMarker = /[uú]ltimos\s+lan[cç]amentos/i;
    if (ultimosMarker.test(flat)) {
      const valueRowCount = rows.filter(r => r.items.some(i => IS_VALUE.test(i.text))).length;
      if (valueRowCount <= 5) {
        ultimosPages.push({ rows, flat, items });
        continue;
      }
      // Página com muitas transações + "Últimos Lançamentos" no texto → processar normalmente
    }
    pageData.push({ rows, flat, items });
  }

  // Fallback: se TODAS as páginas são "Últimos Lançamentos", usar como fonte (não há duplicata)
  if (pageData.length === 0 && ultimosPages.length > 0) {
    pageData.push(...ultimosPages);
  }

  // Re-detect bank from OCR text if initial detection defaulted to Bradesco on image PDFs
  // Minimum score threshold: OCR text often contains bank names in transaction descriptions
  // (e.g., "PIX para ITAU UNIBANCO") which cause false positives with low scores (2-3).
  // Only override Bradesco when strong structural markers are found (score >= 5).
  const OCR_REDETECT_MIN_SCORE = 5;
  if (needsOCR && bankProfile.id === "bradesco" && pageData.length > 0) {
    const ocrText = pageData.slice(0, 3).map(p => p.flat).join(" ");
    const redetected = detectBank(ocrText);
    if (redetected.id !== "bradesco" && redetected._lastScore >= OCR_REDETECT_MIN_SCORE) {
      bankProfile = redetected;
      if (!bankProfile.supported) {
        return { clientName: "—", agencia: "", conta: "", banco: bankProfile.name, periodo: "—", transactions: [], unsupported: true };
      }
    }
  }
  // Column clustering fallback if header detection failed
  if (cols.debitoX === null) {
    const allValues = pageData.flatMap(p => p.items.filter(i => IS_VALUE.test(i.text)));
    const clustered = clusterColumns(allValues);
    if (clustered) Object.assign(cols, clustered);
  }

  // ── Roteamento por banco ──
  if (bankProfile.id === "itau") {
    // Sub-format: "Extrato Anual de Tarifas" (DD/MMM dates, all-debit tariff summary)
    if (pageData.some(p => /extrato\s+anual\s+(de\s+tarifas|com\s+as\s+tarifas)/i.test(p.flat))) {
      return parseItauTarifasAnuais(pageData, bankProfile);
    }
    // Sub-format: Itaú mobile app screenshot (OCR) — "meu extrato" header, -R$ prefix values
    if (needsOCR && pageData.some(p => /meu\s+extrato|minhas\s+finan[cç]as/i.test(p.flat))) {
      return parseItauMobile(pageData, bankProfile);
    }
    return parseItauTransactions(pageData, bankProfile);
  }
  if (bankProfile.id === "santander") {
    return parseSantanderTransactions(pageData, bankProfile);
  }
  if (bankProfile.id === "agibank") {
    return parseAgibankTransactions(pageData, bankProfile);
  }

  // ── Fase 2 (Bradesco): Extrair cabeçalho (primeiras 3 páginas) ──
  let clientName = "", agencia = "", conta = "", periodo = "", cpf = "";
  for (let i = 0; i < Math.min(3, pageData.length); i++) {
    const { flat, rows } = pageData[i];
    if (!cpf) {
      const m = flat.match(/cpf\s*[:\-]?\s*(\d{3}\.\d{3}\.\d{3}-?\d{2})/i)
        || flat.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{2})\b/);
      if (m) cpf = m[1].includes("-") ? m[1] : m[1].slice(0, -2) + "-" + m[1].slice(-2);
    }
    if (!clientName) {
      const m = flat.match(/nome\s*:?\s*([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{3,60}?)(?=\s+extrato|\s+ag[eê]|\s+cpf|\s+conta|\s+cta\b|\d{3}\.)/i)
        || flat.match(/titular\s*:?\s*([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{3,60}?)(?=\s+extrato|\s+ag[eê]|\s+cpf|\s+conta|\d{3}\.)/i);
      if (m) clientName = m[1].replace(/\s+/g, " ").trim();
      if (!clientName) {
        const m2 = flat.match(/([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{5,60}?)\s+\d{3}\.\d{3}\.\d{3}[-.]?\d{2}/);
        if (m2) clientName = m2[1].replace(/\s+/g, " ").trim();
      }
      if (!clientName) {
        const SKIP_NAME = /extrato|conta\s*corrente|bradesco|dados|lan[cç]amento|saldo|data|hist[oó]rico|d[eé]bito|cr[eé]dito|per[ií]odo|ag[eê]ncia|cpf|documento|c[oó]digo|cliente|favorecido|banco|celular|internet|saque|recibo|transf|deposito|pagamento|pix|ted|doc\b|boleto|parcela|tarifa|cesta|opera[cç]|encargo|mora\b|seguro|capitalizacao|adiant|emissao/i;
        for (const row of rows) {
          const text = row.text.trim();
          if (text.length < 8 || text.length > 60) continue;
          if (SKIP_NAME.test(text)) continue;
          if (/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]{3,}\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]{2,}(\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]{2,})*$/.test(text)) {
            clientName = text;
            break;
          }
        }
      }
    }
    if (!agencia) {
      const m = flat.match(/ag[eê]ncia\s*[:\-]?\s*(\d{3,6}(?:[-]\d)?)/i)
        || flat.match(/\bag\.?\s+(\d{3,6})\b/i);
      if (m) agencia = m[1];
    }
    if (!conta) {
      const m = flat.match(/conta\s*[:\-]?\s*([\d]{4,8}[-][\d])/i)
        || flat.match(/cta\.?\s*[:\-]?\s*([\d]{4,8}[-][\d])/i)
        || flat.match(/c\/c\s*[:\-]?\s*([\d]{4,8}[-][\d])/i);
      if (m) conta = m[1];
    }
    if (!periodo) {
      const m = flat.match(/entre\s+([\d\/]+)\s+e\s+([\d\/]+)/i)
        || flat.match(/per[ií]odo\s*[:\-]?\s*([\d\/]+)\s+a\s+([\d\/]+)/i);
      if (m) periodo = `${m[1]} a ${m[2]}`;
    }
  }

  // ── Fase 3: Detectar layout ──
  const allRows = pageData.flatMap(p => p.rows);
  const layout = detectLayout(allRows);

  // ── Fase 4: Parsear transações (2-pass) ──
  const classified = classifyRows(allRows, cols, needsOCR);
  const allTransactions = assembleTransactions(classified, layout);

  // Dedup: Bradesco PDFs podem repetir seções (Últimos Lançamentos, períodos sobrepostos)
  // A chave PRECISA incluir saldo: lançamentos legítimos distintos com mesma
  // data+historico+valor (ex.: PARC de reorganização financeira) têm saldos
  // diferentes — sem saldo eles colapsam num só (pitfall documentado 06/2026).
  const seen = new Set();
  const deduped = allTransactions.filter(t => {
    const key = `${t.data}|${t.historico}|${t.valor}|${t.saldo == null ? '' : Number(t.saldo).toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── Caso explícito: PDF Bradesco com aviso "Extrato inexistente" ──
  // Cliente sem conta/movimento no período. NÃO é problema de OCR — retornar
  // zero transações imediatamente (sem cair no fallback de OCR).
  const hasInexistenteMarker = pageData.some(p => /extrato\s+inexistente/i.test(p.flat));
  if (deduped.length === 0 && hasInexistenteMarker) {
    return {
      clientName: clientName || "Titular não identificado",
      cpf, agencia, conta,
      banco: bankProfile.name,
      periodo: periodo || "—",
      transactions: [],
      emptyExtract: true,
    };
  }

  // ── Fallback OCR: texto extraído não produziu transações → tentar OCR (apenas browser) ──
  // withTimeout no boot E em cada página: evita trava indefinida do Tesseract
  // (regressão 07/2026 — a proteção foi perdida num realinhamento de branches).
  if (deduped.length === 0 && !needsOCR && bankProfile.id === "bradesco" && loadOcrWorker) {
    try {
      const ocrFallbackWorker = await withTimeout(loadOcrWorker(), 120_000, "boot do Tesseract (fallback)");
      if (!ocrFallbackWorker) throw new Error("OCR worker indisponível");
      const ocrPageData = [];
      const ocrCols = { creditoX: null, debitoX: null, saldoX: null };
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        onProgress && onProgress(pageNum, totalPages, true);
        const page = pageNum === 1 ? firstPage : await pdf.getPage(pageNum);
        const ocrResult = await withTimeout(ocrPage(page, ocrFallbackWorker, OCR_SCALE), 180_000, `OCR fallback página ${pageNum}`);
        const rows = groupByY(ocrResult.items, 3);
        const flat = ocrResult.items.map(i => i.text).join(" ");
        for (const item of ocrResult.items) {
          if (/^cr[eé]dito/i.test(item.text)) ocrCols.creditoX = item.x;
          if (/^d[eé]bito/i.test(item.text)) ocrCols.debitoX = item.x;
          if (/^saldo/i.test(item.text)) ocrCols.saldoX = item.x;
        }
        ocrPageData.push({ rows, flat, items: ocrResult.items });
      }
      if (ocrCols.debitoX === null) {
        const allOcrValues = ocrPageData.flatMap(p => p.items.filter(i => IS_VALUE.test(i.text)));
        const clustered = clusterColumns(allOcrValues);
        if (clustered) Object.assign(ocrCols, clustered);
      }
      const ocrRows = ocrPageData.flatMap(p => p.rows);
      const ocrLayout = detectLayout(ocrRows);
      const ocrClassified = classifyRows(ocrRows, ocrCols, true);
      const ocrTransactions = assembleTransactions(ocrClassified, ocrLayout);
      if (ocrTransactions.length > 0) {
        const ocrSeen = new Set();
        const ocrDeduped = ocrTransactions.filter(t => {
          const key = `${t.data}|${t.historico}|${t.valor}|${t.saldo == null ? '' : Number(t.saldo).toFixed(2)}`;
          if (ocrSeen.has(key)) return false;
          ocrSeen.add(key);
          return true;
        });
        // Re-extrair header do OCR text
        if (!clientName || clientName === "Titular não identificado") {
          for (let i = 0; i < Math.min(3, ocrPageData.length); i++) {
            const ocrFlat = ocrPageData[i].flat;
            const m = ocrFlat.match(/nome\s*:?\s*([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{3,60}?)(?=\s+extrato|\s+ag[eê]|\s+cpf|\s+conta|\d{3}\.)/i);
            if (m) { clientName = m[1].replace(/\s+/g, " ").trim(); break; }
          }
        }
        return { clientName: clientName || "Titular não identificado", agencia, conta, banco: bankProfile.name, periodo: periodo || "—", transactions: ocrDeduped };
      }
    } catch (e) {
      console.warn("OCR fallback failed:", e);
    }
  }

  return {
    clientName: clientName || "Titular não identificado",
    cpf,
    agencia,
    conta,
    banco: bankProfile.name,
    periodo: periodo || "—",
    transactions: deduped,
  };
}

async function parseDocumentoPDF(file, onProgress) {
  const pdfjsLib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  // ── Fase 1: Extrair todas as páginas (com fallback OCR) ──
  const pageData = [];
  const ultimosPages = []; // páginas de "Últimos Lançamentos" separadas para fallback
  const cols = { debitoX: null, creditoX: null, saldoX: null };
  let needsOCR = false;
  let ocrWorker = null;

  // Tentar extração de texto na página 1 para decidir o path
  const firstPage = await pdf.getPage(1);
  const firstTc = await firstPage.getTextContent();
  const firstItems = firstTc.items.filter(it => it.str.trim());
  if (firstItems.length < 10) {
    // PDF sem texto extraível — ativar OCR
    needsOCR = true;
    ocrWorker = await loadTesseract();
  } else {
    // PDFs com CIDFont/encoding quebrado: items existem mas texto é garbage (control chars)
    const sampleText = firstItems.slice(0, 200).map(it => it.str).join("");
    if (!/[a-zA-ZÀ-ÿ]{2,}/.test(sampleText)) {
      try {
        needsOCR = true;
        ocrWorker = await loadTesseract();
      } catch (e) {
        needsOCR = false;
        console.warn("Tesseract load failed, falling back to text extraction:", e);
      }
    }
  }

  // ── Detectar banco (multi-page: pages 1-3 para score-based detection) ──
  const detectionTexts = [];
  const firstPageText = firstItems.length > 0
    ? firstItems.map(it => it.str || it.text || "").join(" ")
    : (needsOCR ? "bradesco" : "");
  detectionTexts.push(firstPageText);
  // Pre-scan pages 2-3 for bank detection (lightweight, text-only)
  if (!needsOCR) {
    for (let pn = 2; pn <= Math.min(3, pdf.numPages); pn++) {
      const pg = await pdf.getPage(pn);
      const tc = await pg.getTextContent();
      const pageItems = tc.items.filter(it => it.str.trim());
      detectionTexts.push(pageItems.map(it => it.str).join(" "));
    }
  }
  let bankProfile = detectBank(detectionTexts);
  if (!bankProfile.supported) {
    return {
      clientName: "—",
      agencia: "",
      conta: "",
      banco: bankProfile.name,
      periodo: "—",
      transactions: [],
      unsupported: true,
      bankName: bankProfile.name,
    };
  }

  const MAX_PAGES = 500;
  const totalPages = Math.min(pdf.numPages, MAX_PAGES);
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress && onProgress(pageNum, pdf.numPages, needsOCR);
    const page = pageNum === 1 ? firstPage : await pdf.getPage(pageNum);

    let items;
    if (needsOCR) {
      const ocrResult = await ocrPage(page, ocrWorker, OCR_SCALE);
      items = ocrResult.items;
    } else {
      const tc = pageNum === 1 ? firstTc : await page.getTextContent();
      items = tc.items.filter(it => it.str.trim())
        .map(it => ({ text: it.str.trim(), x: it.transform[4], y: it.transform[5] }));
    }

    const rows = groupByY(items, needsOCR ? 3 : 4); // OCR: tight tolerance (line-level Y já normaliza same-line words)
    const flat = items.map(i => i.text).join(" ");
    // Detectar posições X das 3 colunas de valores no cabeçalho da tabela
    // Re-detectar em cada página que tem cabeçalho (suporta PDFs multi-período)
    const pageCols = { creditoX: null, debitoX: null, saldoX: null };
    for (const item of items) {
      if (/^cr[eé]dito/i.test(item.text)) pageCols.creditoX = item.x;
      if (/^d[eé]bito/i.test(item.text)) pageCols.debitoX = item.x;
      if (/^saldo/i.test(item.text)) pageCols.saldoX = item.x;
    }
    if (pageCols.debitoX !== null) {
      Object.assign(cols, pageCols);
    }

    // Separar páginas de "Últimos Lançamentos" (resumo que repete última transação)
    // Só descartar se a página é DEDICADA a "Últimos Lançamentos" (poucas transações)
    const ultimosMarker = /[uú]ltimos\s+lan[cç]amentos/i;
    if (ultimosMarker.test(flat)) {
      const valueRowCount = rows.filter(r => r.items.some(i => IS_VALUE.test(i.text))).length;
      if (valueRowCount <= 5) {
        ultimosPages.push({ rows, flat, items });
        continue;
      }
      // Página com muitas transações + "Últimos Lançamentos" no texto → processar normalmente
    }
    pageData.push({ rows, flat, items });
  }

  // Fallback: se TODAS as páginas são "Últimos Lançamentos", usar como fonte (não há duplicata)
  if (pageData.length === 0 && ultimosPages.length > 0) {
    pageData.push(...ultimosPages);
  }

  // Re-detect bank from OCR text if initial detection defaulted to Bradesco on image PDFs
  // Minimum score threshold: OCR text often contains bank names in transaction descriptions
  // (e.g., "PIX para ITAU UNIBANCO") which cause false positives with low scores (2-3).
  // Only override Bradesco when strong structural markers are found (score >= 5).
  const OCR_REDETECT_MIN_SCORE = 5;
  if (needsOCR && bankProfile.id === "bradesco" && pageData.length > 0) {
    const ocrText = pageData.slice(0, 3).map(p => p.flat).join(" ");
    const redetected = detectBank(ocrText);
    if (redetected.id !== "bradesco" && redetected._lastScore >= OCR_REDETECT_MIN_SCORE) {
      bankProfile = redetected;
      if (!bankProfile.supported) {
        return { clientName: "—", agencia: "", conta: "", banco: bankProfile.name, periodo: "—", transactions: [], unsupported: true };
      }
    }
  }
  // Column clustering fallback if header detection failed
  if (cols.debitoX === null) {
    const allValues = pageData.flatMap(p => p.items.filter(i => IS_VALUE.test(i.text)));
    const clustered = clusterColumns(allValues);
    if (clustered) Object.assign(cols, clustered);
  }

  // ── Roteamento por banco ──
  if (bankProfile.id === "itau") {
    // Sub-format: "Extrato Anual de Tarifas" (DD/MMM dates, all-debit tariff summary)
    if (pageData.some(p => /extrato\s+anual\s+(de\s+tarifas|com\s+as\s+tarifas)/i.test(p.flat))) {
      return parseItauTarifasAnuais(pageData, bankProfile);
    }
    // Sub-format: Itaú mobile app screenshot (OCR) — "meu extrato" header, -R$ prefix values
    if (needsOCR && pageData.some(p => /meu\s+extrato|minhas\s+finan[cç]as/i.test(p.flat))) {
      return parseItauMobile(pageData, bankProfile);
    }
    return parseItauTransactions(pageData, bankProfile);
  }
  if (bankProfile.id === "santander") {
    return parseSantanderTransactions(pageData, bankProfile);
  }
  if (bankProfile.id === "agibank") {
    return parseAgibankTransactions(pageData, bankProfile);
  }

  // ── Fase 2 (Bradesco): Extrair cabeçalho (primeiras 3 páginas) ──
  let clientName = "", agencia = "", conta = "", periodo = "";
  for (let i = 0; i < Math.min(3, pageData.length); i++) {
    const { flat, rows } = pageData[i];
    if (!clientName) {
      const m = flat.match(/nome\s*:?\s*([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{3,60}?)(?=\s+extrato|\s+ag[eê]|\s+cpf|\s+conta|\s+cta\b|\d{3}\.)/i)
        || flat.match(/titular\s*:?\s*([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{3,60}?)(?=\s+extrato|\s+ag[eê]|\s+cpf|\s+conta|\d{3}\.)/i);
      if (m) clientName = m[1].replace(/\s+/g, " ").trim();
      if (!clientName) {
        const m2 = flat.match(/([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{5,60}?)\s+\d{3}\.\d{3}\.\d{3}[-.]?\d{2}/);
        if (m2) clientName = m2[1].replace(/\s+/g, " ").trim();
      }
      if (!clientName) {
        const SKIP_NAME = /extrato|conta\s*corrente|bradesco|dados|lan[cç]amento|saldo|data|hist[oó]rico|d[eé]bito|cr[eé]dito|per[ií]odo|ag[eê]ncia|cpf|documento|c[oó]digo|cliente|favorecido|banco|celular|internet|saque|recibo|transf|deposito|pagamento|pix|ted|doc\b|boleto|parcela|tarifa|cesta|opera[cç]|encargo|mora\b|seguro|capitalizacao|adiant|emissao/i;
        for (const row of rows) {
          const text = row.text.trim();
          if (text.length < 8 || text.length > 60) continue;
          if (SKIP_NAME.test(text)) continue;
          if (/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]{3,}\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]{2,}(\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]{2,})*$/.test(text)) {
            clientName = text;
            break;
          }
        }
      }
    }
    if (!agencia) {
      const m = flat.match(/ag[eê]ncia\s*[:\-]?\s*(\d{3,6}(?:[-]\d)?)/i)
        || flat.match(/\bag\.?\s+(\d{3,6})\b/i);
      if (m) agencia = m[1];
    }
    if (!conta) {
      const m = flat.match(/conta\s*[:\-]?\s*([\d]{4,8}[-][\d])/i)
        || flat.match(/cta\.?\s*[:\-]?\s*([\d]{4,8}[-][\d])/i)
        || flat.match(/c\/c\s*[:\-]?\s*([\d]{4,8}[-][\d])/i);
      if (m) conta = m[1];
    }
    if (!periodo) {
      const m = flat.match(/entre\s+([\d\/]+)\s+e\s+([\d\/]+)/i)
        || flat.match(/per[ií]odo\s*[:\-]?\s*([\d\/]+)\s+a\s+([\d\/]+)/i);
      if (m) periodo = `${m[1]} a ${m[2]}`;
    }
  }

  // ── Fase 3: Detectar layout ──
  const allRows = pageData.flatMap(p => p.rows);
  const layout = detectLayout(allRows);

  // ── Fase 4: Parsear transações (2-pass) ──
  const classified = classifyRows(allRows, cols, needsOCR);
  const allTransactions = assembleTransactions(classified, layout);

  // Dedup: Bradesco PDFs podem repetir seções (Últimos Lançamentos, períodos sobrepostos)
  const seen = new Set();
  const deduped = allTransactions.filter(t => {
    const key = `${t.data}|${t.historico}|${t.valor}|${t.saldo == null ? '' : Number(t.saldo).toFixed(2)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── Caso explícito: PDF Bradesco com aviso "Extrato inexistente" ──
  // Cliente sem conta/movimento no período. NÃO é problema de OCR — retornar
  // zero transações imediatamente (sem cair no fallback de OCR).
  const hasInexistenteMarker = pageData.some(p => /extrato\s+inexistente/i.test(p.flat));
  if (deduped.length === 0 && hasInexistenteMarker) {
    return {
      clientName: clientName || "Titular não identificado",
      agencia, conta,
      banco: bankProfile.name,
      periodo: periodo || "—",
      transactions: [],
      emptyExtract: true,
    };
  }

  // ── Fallback OCR: texto extraído não produziu transações → tentar OCR ──
  // withTimeout no boot E em cada página: evita trava indefinida do Tesseract
  // (regressão 07/2026 — a UI ficava em "Página 2 de 2" pra sempre quando o
  // worker morria sem rejeitar a promise).
  if (deduped.length === 0 && !needsOCR && bankProfile.id === "bradesco") {
    try {
      const ocrFallbackWorker = await withTimeout(loadTesseract(), 120_000, "boot do Tesseract (fallback)");
      if (!ocrFallbackWorker) throw new Error("OCR worker indisponível");
      const ocrPageData = [];
      const ocrCols = { creditoX: null, debitoX: null, saldoX: null };
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        onProgress && onProgress(pageNum, totalPages, true);
        const page = pageNum === 1 ? firstPage : await pdf.getPage(pageNum);
        const ocrResult = await withTimeout(ocrPage(page, ocrFallbackWorker, OCR_SCALE), 180_000, `OCR fallback página ${pageNum}`);
        const rows = groupByY(ocrResult.items, 3);
        const flat = ocrResult.items.map(i => i.text).join(" ");
        for (const item of ocrResult.items) {
          if (/^cr[eé]dito/i.test(item.text)) ocrCols.creditoX = item.x;
          if (/^d[eé]bito/i.test(item.text)) ocrCols.debitoX = item.x;
          if (/^saldo/i.test(item.text)) ocrCols.saldoX = item.x;
        }
        ocrPageData.push({ rows, flat, items: ocrResult.items });
      }
      if (ocrCols.debitoX === null) {
        const allOcrValues = ocrPageData.flatMap(p => p.items.filter(i => IS_VALUE.test(i.text)));
        const clustered = clusterColumns(allOcrValues);
        if (clustered) Object.assign(ocrCols, clustered);
      }
      const ocrRows = ocrPageData.flatMap(p => p.rows);
      const ocrLayout = detectLayout(ocrRows);
      const ocrClassified = classifyRows(ocrRows, ocrCols, true);
      const ocrTransactions = assembleTransactions(ocrClassified, ocrLayout);
      if (ocrTransactions.length > 0) {
        const ocrSeen = new Set();
        const ocrDeduped = ocrTransactions.filter(t => {
          const key = `${t.data}|${t.historico}|${t.valor}|${t.saldo == null ? '' : Number(t.saldo).toFixed(2)}`;
          if (ocrSeen.has(key)) return false;
          ocrSeen.add(key);
          return true;
        });
        // Re-extrair header do OCR text
        if (!clientName || clientName === "Titular não identificado") {
          for (let i = 0; i < Math.min(3, ocrPageData.length); i++) {
            const ocrFlat = ocrPageData[i].flat;
            const m = ocrFlat.match(/nome\s*:?\s*([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]{3,60}?)(?=\s+extrato|\s+ag[eê]|\s+cpf|\s+conta|\d{3}\.)/i);
            if (m) { clientName = m[1].replace(/\s+/g, " ").trim(); break; }
          }
        }
        return { clientName: clientName || "Titular não identificado", agencia, conta, banco: bankProfile.name, periodo: periodo || "—", transactions: ocrDeduped };
      }
    } catch (e) {
      console.warn("OCR fallback failed:", e);
    }
  }

  // Monta rawLines + reviewerData pra camada de revisão (reviewer.js).
  // rawLines: string por row (legado, mantido pra compat).
  // reviewerData: rows estruturadas com x dos itens + cols X (débito/crédito/saldo).
  // O reviewer usa cols pra distinguir valor-débito (que é desconto) de
  // valor-crédito (recebimento, NÃO é desconto) e valor-saldo (não é desconto).
  // Sem essa info, o reviewer cai em armadilhas como classificar RECEBIMENTO
  // FORNECEDOR (crédito) como desconto.
  const rawLines = [];
  const reviewerRows = [];
  for (const pd of pageData) {
    for (const row of pd.rows) {
      const text = row.items.map(it => it.text).join(" ").trim();
      if (!text) continue;
      rawLines.push(text);
      reviewerRows.push({
        text,
        items: row.items.map(it => ({ text: it.text, x: it.x })),
      });
    }
  }

  return {
    clientName: clientName || "Titular não identificado",
    agencia,
    conta,
    banco: bankProfile.name,
    periodo: periodo || "—",
    transactions: deduped,
    rawLines,
    reviewerData: { rows: reviewerRows, cols },
  };
}

export { detectBank, BANK_PROFILES, CATEGORIAS, THEME, normalizeText, matchCategoria, analyzeAll, parseDocumentoPDF, parseDocumentoPDFFromDoc, parseValor, groupByY, pickDebit, pickSaldo, detectLayout, extractFromRow, loadPdfJs, loadTesseract, ocrCleanText, ocrPage, OCR_SCALE, IS_DATE, IS_VALUE, IS_HEADER, IS_SUMMARY, preprocessCanvas, otsuThreshold, clusterColumns, validateWithBalance };
