/* =========================================================================
   UTILS — funções puras (exceto Math.random no lastro mock)
   capitalizarPrimeiraLetra, calcularTipoVara,
   calcularLastroFinanceiro, gerarLastroEconomicoTrecho
   ========================================================================= */
/**
 * Garante que uma string comece com letra maiúscula.
 * Preserva espaços/aspas iniciais (ex: '"teste"' vira '"Teste"' —
 * procura a primeira letra real e capitaliza ela).
 * Retorna string vazia se input for vazio/null/undefined.
 */
function capitalizarPrimeiraLetra(s) {
  if (!s || typeof s !== 'string') return '';
  const texto = s.trimStart();
  if (!texto) return '';
  // Acha o índice da primeira letra (pula aspas, parênteses, etc.)
  const match = texto.match(/[A-Za-zÀ-ÿ]/);
  if (!match) return texto;
  const idx = match.index;
  return texto.slice(0, idx) + texto[idx].toLocaleUpperCase('pt-BR') + texto.slice(idx + 1);
}

/**
 * Expande a PRIMEIRA ocorrência de uma sigla com sua descrição completa,
 * pra o leitor entender o que é antes de continuar o texto. Demais ocorrências
 * no mesmo bloco ficam como sigla (não fica repetitivo).
 *
 * Lida com 2 contextos:
 *   • Sigla em texto corrido ("pelo DIEESE em Manaus")
 *      → "pelo DIEESE (Departamento ...) em Manaus"
 *   • Sigla seguida de vírgula dentro de citação ("(DIEESE, Manaus-AM, fev/2026)")
 *      → "(DIEESE, Departamento ..., Manaus-AM, fev/2026)"
 *
 * Idempotente: se a expansão já estiver presente, não duplica.
 *
 * @param {string} texto    Texto onde aplicar a expansão
 * @param {string} sigla    Sigla a procurar (ex: "DIEESE")
 * @param {string} expansao Descrição completa (sem parênteses)
 * @returns {string} Texto com a primeira ocorrência expandida
 */
function expandirPrimeiraSigla(texto, sigla, expansao) {
  if (!texto || typeof texto !== 'string') return texto;
  // Idempotência: já tem a expansão? Não faz nada (evita re-expansão)
  if (texto.includes(expansao)) return texto;

  // Busca exata da sigla como palavra inteira (limites de palavra simples).
  // Não trata case-insensitivity porque siglas são sempre em maiúsculas.
  const idx = texto.indexOf(sigla);
  if (idx === -1) return texto;

  const fim = idx + sigla.length;
  const apos = texto.substring(fim);

  // Caso A: sigla seguida de vírgula+espaço (forma de citação dentro de
  // parênteses, ex: "DIEESE, Manaus-AM, fev/2026"). Insere a expansão
  // como item de lista entre vírgulas.
  if (/^,\s/.test(apos)) {
    return texto.slice(0, fim) + ', ' + expansao + texto.slice(fim);
  }

  // Caso B: sigla em texto corrido. Adiciona um parêntese explicativo
  // logo após a sigla.
  return texto.slice(0, fim) + ' (' + expansao + ')' + texto.slice(fim);
}

/**
 * Calcula qual tipo de vara se aplica com base no valor da causa.
 * Retorna objeto com o tipo (texto que entra no documento) + explicação
 * amigável pra mostrar ao advogado na tela de revisão.
 *
 * @param {number} valorCausa - Valor total da causa em reais
 * @param {string|null} override - 'CIVEL', 'JUIZADO' ou null (auto)
 */
function calcularTipoVara(valorCausa, override = null) {
  // Se há override manual, ele tem prioridade absoluta sobre o cálculo automático
  if (override === 'CIVEL') {
    return {
      tipo_vara: 'CÍVEL',
      rotulo_curto: 'Vara Cível',
      explicacao: `Vara Cível forçada manualmente pelo advogado (cálculo automático seria ${valorCausa < LIMITE_JUIZADO_ESPECIAL ? 'Juizado Especial' : 'Vara Cível'}).`,
      valor_causa: valorCausa,
      limite_referencia: LIMITE_JUIZADO_ESPECIAL,
      forcado_manualmente: true,
    };
  }
  if (override === 'JUIZADO') {
    return {
      tipo_vara: 'DO JUIZADO ESPECIAL CÍVEL',
      rotulo_curto: 'Juizado Especial Cível',
      explicacao: `Juizado Especial forçado manualmente pelo advogado (cálculo automático seria ${valorCausa < LIMITE_JUIZADO_ESPECIAL ? 'Juizado Especial' : 'Vara Cível'}).`,
      valor_causa: valorCausa,
      limite_referencia: LIMITE_JUIZADO_ESPECIAL,
      forcado_manualmente: true,
    };
  }
  // Modo automático (default)
  const vai_juizado = valorCausa < LIMITE_JUIZADO_ESPECIAL;
  return {
    tipo_vara: vai_juizado ? 'DO JUIZADO ESPECIAL CÍVEL' : 'CÍVEL',
    rotulo_curto: vai_juizado ? 'Juizado Especial Cível' : 'Vara Cível',
    explicacao: vai_juizado
      ? `Juizado Especial porque valor da causa (R$ ${formatarMoeda(valorCausa)}) é menor que R$ ${formatarMoeda(LIMITE_JUIZADO_ESPECIAL)} (40 salários-mínimos).`
      : `Vara Cível comum porque valor da causa (R$ ${formatarMoeda(valorCausa)}) é igual ou maior que R$ ${formatarMoeda(LIMITE_JUIZADO_ESPECIAL)} (40 salários-mínimos, limite do Juizado).`,
    valor_causa: valorCausa,
    limite_referencia: LIMITE_JUIZADO_ESPECIAL,
    forcado_manualmente: false,
  };
}

/**
 * Calcula o lastro econômico do dano material para fins de
 * justificação na peça (zona ia_lastro_dano_material).
 *
 * Recebe o valor total dos descontos (em reais) e devolve um objeto
 * rico com múltiplos calculados, faixa qualitativa, correlações
 * relevantes para aquele patamar, e texto de fallback completo
 * caso a IA falhe e caia no mock.
 *
 * REGRA DE OURO: a IA NUNCA deve calcular esses números — sempre
 * usar os valores deste objeto, que é determinístico e auditável.
 *
 * @param {number} valor - Valor total dos descontos em reais (ex: 5000)
 * @param {string} uf - UF do caso (ex: 'AM'). Usado para escolher
 *                      cesta básica e passagem regionais. Default 'AM'.
 * @returns {object} Objeto com múltiplos, correlações e texto fallback
 */
function calcularLastroFinanceiro(valor, uf = 'AM', seed = 0) {
  const ref = LASTROS_REFERENCIA;

  // Sentinel: valor abaixo do mínimo absoluto não merece lastro
  if (!valor || valor < LASTRO_VALOR_MINIMO) {
    return {
      ok: false,
      motivo_fraqueza: `Valor (R$ ${valor || 0}) está abaixo do mínimo de R$ ${LASTRO_VALOR_MINIMO} para gerar lastro consistente. Considere desativar a zona "Lastro do dano material" ou revisar o valor com o cliente.`,
      valor: valor || 0,
    };
  }

  // ─── Múltiplos calculados (sempre matematicamente corretos) ───
  const valorEmSM         = valor / ref.salario_minimo;
  const mesesMinExist     = valor / ref.minimo_existencial;
  const cestasBasicas     = valor / ref.cesta_basica_am;
  const passagensOnibus   = Math.round(valor / ref.passagem_onibus_am);
  const fracaoMinExistPct = (valor / ref.minimo_existencial) * 100;
  const fracaoCestaPct    = (valor / ref.cesta_basica_am) * 100;

  // ─── Faixa qualitativa ───
  let faixa;
  if (valor < 100)        faixa = 'micro';
  else if (valor < 500)   faixa = 'baixo';
  else if (valor < 2000)  faixa = 'medio';
  else if (valor < 10000) faixa = 'alto';
  else if (valor < 30000) faixa = 'muito_alto';
  else                    faixa = 'extremo';

  // ─── Helpers de formatação BR ───
  // fmt: número genérico (≥100 sem decimais, <100 com 2 casas)
  // fmtPct: percentual com 1 casa decimal e vírgula BR
  // fmtBR: valor em reais com separador de milhares (ex: "5.542,74")
  const fmt = (n, casas = 2) => {
    if (n >= 100) return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
    return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  };
  const fmtPct = (n, casas = 1) => n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const fmtBR  = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Valor formatado pro texto
  const V = fmtBR(valor);

  // Citação canônica do Decreto + ME
  const DEC = 'Decreto nº 11.567/2023';
  const ME  = 'R$ 600,00';

  // ─── 3-4 variações por faixa, todas com:
  //   • valor literal {V} no início
  //   • números calculados específicos do caso (% ou múltiplos)
  //   • citação do Decreto 11.567/2023 + mínimo existencial
  //   • linguagem de potencial ("aptidão", "seria suficiente", etc)
  //   • sem profissões específicas
  //   • sem afirmação de dano efetivo concreto
  //   • sem travessões
  // ─────────────────────────────────────────────────────────────────────────
  const variacoes = {
    micro: [
      // R$ 20-99
      `Esse montante de R$ ${V} não representa cifra abstrata: equivale, em valores correntes no Amazonas, a aproximadamente ${passagensOnibus} passagens de transporte coletivo urbano, recursos com aptidão para custear o deslocamento essencial do consumidor médio ao trabalho durante diversos dias úteis. Embora pareça quantia modesta em termos absolutos, corresponde a ${fmtPct(fracaoMinExistPct)}% do mínimo existencial mensal definido pelo ${DEC} (${ME}), patamar que o Poder Executivo Federal reconhece como parâmetro de impenhorabilidade da renda mensal contra dívidas de consumo. Subtração reiterada nesse patamar tem aptidão para comprometer, ao longo do tempo, parcela do orçamento mensal do consumidor.`,

      `A quantia de R$ ${V} subtraída da parte autora, ainda que aparentemente diminuta, equivale a ${passagensOnibus} viagens de ônibus na rede de transporte público do Amazonas, suficientes para custear o deslocamento ida-e-volta de um trabalhador ao seu posto durante semanas. Tomando como referência o ${DEC}, que estabelece em ${ME} mensais o mínimo existencial fixado como parâmetro de impenhorabilidade contra dívidas de consumo, o valor corresponde a ${fmtPct(fracaoMinExistPct)}% dessa parcela protegida da renda mensal. Trata-se de subtração com potencial de comprometer a própria capacidade física do consumidor médio de chegar ao trabalho durante o período em que o desconto incide.`,

      `O valor de R$ ${V} retirado da conta corrente da parte autora não pode ser tratado como bagatela: representa, em termos práticos, o equivalente a ${passagensOnibus} passagens de transporte público urbano no Amazonas, recursos suficientes para custear o trajeto diário do consumidor médio ao trabalho por considerável período. À luz do mínimo existencial fixado pelo ${DEC} em ${ME} mensais, parcela da renda que o ordenamento federal reconhece como parâmetro de impenhorabilidade da renda, a subtração corresponde a ${fmtPct(fracaoMinExistPct)}% desse patamar protegido, sendo capaz de impactar diretamente despesas comezinhas de mobilidade e alimentação do consumidor médio.`,
    ],

    baixo: [
      // R$ 100-499
      `Esse montante de R$ ${V} não representa cifra abstrata: equivale, em valores correntes no Amazonas, a aproximadamente ${fmtPct(fracaoCestaPct, 0)}% do custo mensal da cesta básica de alimentos pesquisada pelo DIEESE em Manaus, ou ainda a ${fmtPct(fracaoMinExistPct, 0)}% do mínimo existencial mensal definido pelo ${DEC} (${ME}). Trata-se, portanto, de subtração com aptidão concreta para comprometer parcela significativa da renda que o Poder Executivo Federal fixa como parâmetro de impenhorabilidade da renda mensal contra dívidas de consumo.`,

      `A quantia de R$ ${V} subtraída da parte autora corresponde a ${fmtPct(fracaoMinExistPct, 0)}% do mínimo existencial mensal estabelecido pelo ${DEC}, que fixa em ${ME} a renda mensal fixada como parâmetro de impenhorabilidade contra dívidas de consumo. No mercado amazonense, o mesmo valor cobre aproximadamente ${fmtPct(fracaoCestaPct, 0)}% do custo de uma cesta básica completa apurada pelo DIEESE em Manaus, ou ainda o equivalente a ${passagensOnibus} passagens de transporte coletivo urbano. Subtração nesse patamar tem aptidão para comprometer despesas básicas de alimentação ou transporte do consumidor médio durante várias semanas.`,

      `O valor de R$ ${V} retirado da conta da parte autora alcança ${fmtPct(fracaoMinExistPct, 0)}% do patamar reconhecido pelo ordenamento federal como mínimo existencial, conforme fixado pelo ${DEC} em ${ME} mensais para preservação contra superendividamento. Em termos de poder de compra no Amazonas, equivale a aproximadamente ${fmtPct(fracaoCestaPct, 0)}% de uma cesta básica DIEESE em Manaus, ou ao custo aproximado de uma conta de energia elétrica de residência popular com consumo de até 150 kWh. Trata-se de quantia com potencial concreto de inviabilizar despesas essenciais do orçamento mensal do consumidor médio.`,

      `R$ ${V} é o que foi indevidamente subtraído da parte autora, valor que, embora aparentemente módico, corresponde a ${fmtPct(fracaoMinExistPct, 0)}% do mínimo existencial federal vigente (${ME} mensais, ${DEC}). Para dimensionar economicamente o impacto, o mesmo montante representa cerca de ${fmtPct(fracaoCestaPct, 0)}% do custo mensal da cesta básica de alimentos no Amazonas, conforme apurado pelo DIEESE em Manaus. Patamar com aptidão para suprimir parcela relevante da margem de renda que o Poder Executivo Federal reconhece como parâmetro de impenhorabilidade da renda mensal.`,
    ],

    medio: [
      // R$ 500-1999
      `Esse montante de R$ ${V} não representa cifra abstrata: equivale a ${fmt(valorEmSM)} salário-mínimo nacional vigente, ou ainda a aproximadamente ${fmt(cestasBasicas, 1)} cestas básicas mensais de alimentos no Amazonas (DIEESE, Manaus-AM, fev/2026). Em termos do mínimo existencial definido pelo ${DEC}, ${ME} de renda mensal que o Poder Executivo Federal reconhece como parâmetro de impenhorabilidade da renda, a subtração corresponde a ${fmt(mesesMinExist, 1)} meses inteiros desse patamar protegido. Trata-se de quantia com aptidão para comprometer significativamente o orçamento mensal familiar do consumidor médio, alcançando despesas básicas de moradia, alimentação ou utilidades essenciais.`,

      `A quantia de R$ ${V} subtraída da parte autora equivale a ${fmt(valorEmSM)} salário-mínimo nacional (R$ 1.621,00 em 2026), o que demonstra que o desconto representa uma parcela expressiva da renda básica de quem percebe o piso nacional. Tomando como referência o ${DEC}, que fixa em ${ME} mensais o mínimo existencial protegido contra superendividamento, o valor cobre o equivalente a ${fmt(mesesMinExist, 1)} meses dessa parcela impenhorável. No mercado amazonense, corresponde também a aproximadamente ${fmt(cestasBasicas, 1)} cestas básicas mensais DIEESE em Manaus, sendo capaz de inviabilizar despesas essenciais do consumidor médio durante mais de um mês.`,

      `O valor de R$ ${V} retirado da conta da parte autora supera, isoladamente, o mínimo existencial mensal fixado pelo ${DEC} (${ME}), equivalendo a ${fmt(mesesMinExist, 1)} meses desse patamar que o ordenamento federal fixa como parâmetro de impenhorabilidade da renda mensal contra dívidas de consumo. Em termos do salário-mínimo nacional vigente, corresponde a ${fmtPct(valorEmSM * 100, 0)}% do piso, ou ainda a aproximadamente ${fmt(cestasBasicas, 1)} cestas básicas mensais de alimentos no Amazonas (DIEESE, Manaus-AM). Subtração nesse patamar tem potencial de comprometer significativamente o orçamento mensal familiar do consumidor médio.`,

      `R$ ${V} é a quantia indevidamente subtraída, montante que representa ${fmt(valorEmSM)} salário-mínimo nacional vigente em 2026 e supera em ${fmtPct((mesesMinExist - 1) * 100, 0)}% o mínimo existencial mensal definido pelo ${DEC} (${ME}). A recomposição dessa quantia exigiria parcela substancial da renda mensal de quem percebe o piso nacional. À luz do parâmetro fixado pelo Poder Executivo Federal como parâmetro de impenhorabilidade da renda contra dívidas de consumo, o valor cobre ${fmt(mesesMinExist, 1)} meses inteiros desse patamar protegido, com aptidão para inviabilizar despesas básicas de moradia e alimentação.`,
    ],

    alto: [
      // R$ 2000-9999
      `Esse montante de R$ ${V} não representa cifra abstrata: corresponde a aproximadamente ${fmt(valorEmSM, 2)} salários-mínimos nacionais vigentes, ou ainda a ${fmt(cestasBasicas, 1)} cestas básicas mensais de alimentos no Amazonas (DIEESE, Manaus-AM), provisão alimentar equivalente a mais de meio ano de cestas básicas. À luz do mínimo existencial fixado pelo ${DEC} em ${ME} mensais, parâmetro fixado pelo Poder Executivo Federal como régua de impenhorabilidade da renda contra dívidas de consumo, a quantia subtraída equivale a ${fmt(mesesMinExist, 1)} meses inteiros desse patamar protegido. Patamar com aptidão para causar comprometimento patrimonial duradouro ao orçamento familiar do consumidor médio.`,

      `A quantia de R$ ${V} subtraída da parte autora supera em mais de ${fmtPct(((valor / ref.minimo_existencial) - 1) * 100, 0)}% o mínimo existencial mensal estabelecido pelo ${DEC} (${ME}), equivalendo a ${fmt(mesesMinExist, 1)} meses dessa renda mínima que o Poder Executivo Federal fixa como parâmetro de impenhorabilidade contra dívidas de consumo. Em paralelo, o valor representa ${fmt(valorEmSM, 2)} salários-mínimos nacionais vigentes (R$ 1.621,00 em 2026), ou ainda o custo de aproximadamente ${fmt(cestasBasicas, 1)} cestas básicas DIEESE em Manaus, provisão alimentar mensal equivalente a mais de um semestre de cestas básicas. Subtração patrimonial nesse montante tem aptidão para causar comprometimento duradouro ao orçamento do consumidor médio.`,

      `O valor de R$ ${V} retirado da conta da parte autora corresponde a ${fmt(valorEmSM, 2)} salários-mínimos nacionais vigentes, ou seja, mais do que a renda mensal integral de quem percebe o piso. Tomando como referência o mínimo existencial de ${ME} fixado pelo ${DEC}, parcela da renda que o ordenamento federal reconhece como parâmetro de impenhorabilidade da renda contra dívidas de consumo, a subtração cobre ${fmt(mesesMinExist, 1)} meses dessa margem protegida. No Amazonas, o mesmo valor permitiria custear aproximadamente ${fmt(cestasBasicas, 1)} cestas básicas mensais DIEESE em Manaus, sendo capaz de inviabilizar o equivalente a meses a fio de alimentação básica em cestas básicas.`,

      `R$ ${V} é a quantia indevidamente subtraída, montante que excede o teto de proteção do mínimo existencial federal em ${fmt(mesesMinExist, 1)} vezes (parâmetro de ${ME} mensais fixado pelo ${DEC}). A grandeza econômica do valor é dimensionada também por sua equivalência a ${fmt(valorEmSM, 2)} salários-mínimos nacionais vigentes, ou ainda a ${fmt(cestasBasicas, 1)} cestas básicas DIEESE em Manaus, alimentação base equivalente a mais de meio ano de cestas básicas. Subtração nesse patamar extrapola, com folga, qualquer discussão sobre relevância e tem aptidão para causar comprometimento patrimonial significativo ao consumidor médio.`,
    ],

    muito_alto: [
      // R$ 10.000-29.999
      `Esse montante de R$ ${V} não representa cifra abstrata: supera ${fmt(valorEmSM, 1)} salários-mínimos nacionais vigentes e equivale a aproximadamente ${fmt(cestasBasicas, 0)} cestas básicas mensais de alimentos no Amazonas (DIEESE, Manaus-AM), provisão alimentar equivalente a mais de um ano de cestas básicas. À luz do ${DEC}, que fixa em ${ME} mensais o mínimo existencial, parcela da renda que o Poder Executivo Federal reconhece como parâmetro de impenhorabilidade da renda, a quantia subtraída cobre o equivalente a ${fmt(mesesMinExist, 0)} meses inteiros desse patamar protegido. Subtração patrimonial nesse montante tem aptidão para impactar significativamente o orçamento familiar do consumidor médio, justificando função pedagógica relevante na fixação indenizatória.`,

      `A quantia de R$ ${V} subtraída da parte autora equivale a ${fmt(valorEmSM, 1)} salários-mínimos nacionais vigentes em 2026, montante que supera amplamente a renda anual integral de quem percebe o piso nacional em meses de trabalho contínuo. Em termos do mínimo existencial fixado pelo ${DEC} em ${ME} mensais, parâmetro reconhecido pelo Poder Executivo Federal como parâmetro de impenhorabilidade da renda contra dívidas de consumo, o valor subtraído corresponde a ${fmt(mesesMinExist, 0)} meses inteiros desse patamar protegido. No Amazonas, equivale a aproximadamente ${fmt(cestasBasicas, 0)} cestas básicas mensais DIEESE em Manaus, alimentação base equivalente a mais de um ano de cestas básicas. Subtração com aptidão para causar comprometimento patrimonial duradouro ao consumidor médio.`,

      `O valor de R$ ${V} retirado da conta da parte autora ultrapassa o equivalente a ${fmt(valorEmSM, 1)} salários-mínimos nacionais e cobre, sozinho, ${fmt(mesesMinExist, 0)} meses inteiros do mínimo existencial mensal fixado pelo ${DEC} (${ME}), patamar reconhecido pelo Poder Executivo Federal como parâmetro de impenhorabilidade da renda mensal contra dívidas de consumo. Em paralelo, a quantia equivale a aproximadamente ${fmt(cestasBasicas, 0)} cestas básicas DIEESE em Manaus-AM, provisão alimentar equivalente a mais de doze meses ininterruptos de cestas básicas. Patamar de comprometimento patrimonial com aptidão para impactar significativamente o orçamento familiar do consumidor médio.`,

      `R$ ${V} é a quantia indevidamente subtraída, montante que cobre, sozinho, mais de ${fmt(mesesMinExist, 0)} meses do mínimo existencial mensal definido pelo ${DEC} (${ME}). Em outras métricas oficiais, equivale a ${fmt(valorEmSM, 1)} salários-mínimos nacionais vigentes (R$ 1.621,00 em 2026) e a aproximadamente ${fmt(cestasBasicas, 0)} cestas básicas mensais de alimentos no Amazonas, conforme apurado pelo DIEESE em Manaus. Subtração ou condenação nesse patamar tem aptidão para impactar significativamente o orçamento familiar do consumidor médio, justificando função pedagógica relevante na fixação indenizatória.`,
    ],

    extremo: [
      // R$ 30.000+
      `Esse montante de R$ ${V} não representa cifra abstrata: equivale a ${fmt(valorEmSM, 1)} salários-mínimos nacionais vigentes, mais de um ano da renda integral de quem percebe o piso nacional, ou ainda a aproximadamente ${fmt(cestasBasicas, 0)} cestas básicas mensais de alimentos no Amazonas (DIEESE, Manaus-AM). À luz do ${DEC}, que fixa em ${ME} mensais o mínimo existencial, parcela da renda que o Poder Executivo Federal fixa como parâmetro de impenhorabilidade da renda mensal, a subtração corresponde a ${fmt(mesesMinExist, 0)} meses inteiros desse patamar protegido, ou seja, vários anos de renda mínima da subsistência humana. Patamar de comprometimento patrimonial com aptidão para inviabilizar o orçamento familiar do consumidor médio por anos a fio.`,

      `A quantia de R$ ${V} subtraída da parte autora supera em ${fmt(valorEmSM, 1)} vezes o salário-mínimo nacional vigente em 2026 (R$ 1.621,00), correspondendo, em termos de renda popular, a mais de um ano completo de trabalho de quem percebe o piso. Em paralelo, cobriria sozinha o equivalente a ${fmt(mesesMinExist, 0)} meses do mínimo existencial mensal fixado pelo ${DEC} (${ME}), parcela da renda que o ordenamento federal protege como parâmetro de impenhorabilidade contra dívidas de consumo. No Amazonas, equivale a aproximadamente ${fmt(cestasBasicas, 0)} cestas básicas mensais DIEESE em Manaus, alimentação base equivalente a anos consecutivos de cestas básicas. Subtração com aptidão para inviabilizar o orçamento familiar do consumidor médio por período prolongado.`,

      `O valor de R$ ${V} retirado da parte autora alcança patamar de comprometimento patrimonial extraordinário: corresponde a ${fmt(valorEmSM, 1)} salários-mínimos nacionais vigentes, ou ${fmt(mesesMinExist, 0)} meses inteiros do mínimo existencial federal estabelecido pelo ${DEC} (${ME}), parâmetro que o Poder Executivo Federal reconhece como parâmetro de impenhorabilidade da renda contra dívidas de consumo. No mercado amazonense, equivale a ${fmt(cestasBasicas, 0)} cestas básicas mensais DIEESE em Manaus, provisão alimentar equivalente a anos consecutivos de cestas básicas. Subtração nesse patamar tem aptidão para inviabilizar a subsistência do consumidor médio por período substancial, justificando reparação proporcional à gravidade do dano.`,

      `R$ ${V} é a quantia indevidamente subtraída, montante de comprometimento patrimonial extremo que excede em ${fmt(valorEmSM, 1)} vezes o salário-mínimo nacional e cobre, sozinho, ${fmt(mesesMinExist, 0)} meses do mínimo existencial mensal fixado pelo ${DEC} (${ME}). Para dimensionar a grandeza econômica em termos de poder de compra, o valor equivale a aproximadamente ${fmt(cestasBasicas, 0)} cestas básicas mensais de alimentos no Amazonas (DIEESE, Manaus-AM), alimentação base equivalente a vários anos consecutivos de cestas básicas. Patamar com aptidão para inviabilizar o orçamento familiar do consumidor médio por anos a fio, demandando reparação à altura da gravidade da subtração.`,
    ],
  };

  // Sorteio determinístico baseado em seed (0..N) — modular sobre len
  const opcoes = variacoes[faixa];
  const idx = Math.abs(seed | 0) % opcoes.length;
  // Aplica expansão da sigla DIEESE na primeira ocorrência do parágrafo,
  // pra o juiz que lê a peça saiba o que é (instituto não é universalmente
  // conhecido fora do meio sindical/socioeconômico). Demais menções no mesmo
  // parágrafo seguem como sigla pra não ficar repetitivo.
  const textoDefinitivo = expandirPrimeiraSigla(opcoes[idx], 'DIEESE',
    'Departamento Intersindical de Estatística e Estudos Socioeconômicos'
  );

  return {
    ok: true,
    valor,
    valor_formatado: fmtBR(valor),
    faixa,
    seed_usado: idx,
    total_variacoes_disponiveis: opcoes.length,
    multiplos: {
      salarios_minimos:         parseFloat(valorEmSM.toFixed(2)),
      meses_minimo_existencial: parseFloat(mesesMinExist.toFixed(1)),
      cestas_basicas:           parseFloat(cestasBasicas.toFixed(1)),
      passagens_onibus:         passagensOnibus,
      fracao_minimo_existencial_pct: parseFloat(fracaoMinExistPct.toFixed(1)),
      fracao_cesta_basica_pct:       parseFloat(fracaoCestaPct.toFixed(1)),
    },
    decreto_minimo_existencial: {
      nome: ref.decreto_minimo_existencial,
      valor: ref.minimo_existencial,
      valor_formatado: ME,
    },
    constantes_referencia: {
      salario_minimo:           ref.salario_minimo,
      minimo_existencial:       ref.minimo_existencial,
      cesta_basica_am:          ref.cesta_basica_am,
      cesta_basica_referencia:  ref.cesta_basica_am_referencia,
      ano_base:                 ref.ano_base,
      uf_base:                  'AM',
    },
    // Texto pronto pra injetar diretamente no state.trechosIA
    // Substitui completamente o que vinha da IA antes.
    texto_definitivo: textoDefinitivo,
    // Mantemos o campo legado pra compatibilidade com mock antigo
    texto_fallback: textoDefinitivo,
  };
}

/**
 * Gera o trecho de Lastro Econômico do dano material direto no front,
 * sem chamar IA. Substitui completamente a antiga zona ia_lastro_dano_material
 * que era processada pelo n8n. Decisão tomada porque:
 *   - A IA estava produzindo resultados inconsistentes/ruins
 *   - O lastro é argumento técnico-numérico, não criativo
 *   - O cálculo precisa ser determinístico e auditável
 *   - Os textos são moldes oficiais (Decreto 11.567/2023, DIEESE)
 *
 * Usa o `seed` do state pra escolher uma das 3-4 variações por faixa.
 * O seed é incrementado a cada "Refazer trecho" — assim o advogado
 * vê uma redação diferente a cada clique.
 *
 * @returns {string|null} Texto pronto ou null se não aplicável
 */
function gerarLastroEconomicoTrecho() {
  // Lastro inativo (advogado desligou toggle): retorna null pra ser ignorado
  if (state.dadosPacote3.gerar_lastro_dano_material === false) {
    return null;
  }
  // Parse do valor
  const valorNum = parseFloat(
    String(state.dadosPacote3.valor_total_descontos || '0')
      .replace(/\./g, '').replace(',', '.')
  ) || 0;
  if (valorNum < LASTRO_VALOR_MINIMO) {
    return `[Lastro econômico não gerado: valor abaixo de R$ ${LASTRO_VALOR_MINIMO},00. Considere desligar a zona "Lastro do dano material" ou revisar valor com o cliente.]`;
  }
  const ufCaso = state.dadosPacote3.uf || 'AM';
  // Seed estável: começa em 0; "Refazer" incrementa.
  // Inicializa lazy se não existir.
  if (typeof state.dadosPacote3._lastro_seed !== 'number') {
    state.dadosPacote3._lastro_seed = 0;
  }
  const lastro = calcularLastroFinanceiro(valorNum, ufCaso, state.dadosPacote3._lastro_seed);
  return lastro.ok ? lastro.texto_definitivo : `[Erro: ${lastro.motivo_fraqueza}]`;
}

/* =========================================================================
   SUGESTÃO DE PRODUTO — heurística por keywords no nome do desconto
   Recebe o "desconto" salvo na demanda (ex: "Título de Capitalização")
   e tenta achar o produto correspondente em PRODUTOS.
   Quando não bate em nenhum (ou bate em múltiplos), sugere Mix Bradesco.
   ========================================================================= */
function sugerirProdutoPorDesconto(desconto) {
  if (!desconto || !Array.isArray(PRODUTOS)) return null;
  const txt = String(desconto).toLowerCase();
  const MAPA = [
    { id: 3,  keywords: ['tarifa', 'saque terminal', 'emissao', 'extrato'] },
    { id: 5,  keywords: ['juros', 'encargo', 'mora', 'mcp', 'mcc', 'elc'] },
    { id: 1,  keywords: ['debito automatico', 'débito automático', 'débito autom'] },
    { id: 6,  keywords: ['prestamista'] },
    { id: 7,  keywords: ['vida e prev', 'vidaprev', 'vida & prev'] },
    { id: 8,  keywords: ['capitaliza', 'título de cap', 'titulo de cap'] },
    { id: 11, keywords: ['cesta'] },
    { id: 12, keywords: ['anuidade'] },
    { id: 13, keywords: ['cartao protegido', 'cartão protegido', 'cartão seg'] },
  ];
  for (const m of MAPA) {
    if (m.keywords.some(k => txt.includes(k))) {
      const p = PRODUTOS.find(p => p.id === m.id);
      if (p) return { id: p.id, motivo: `Sugerido por bater com "${desconto}"` };
    }
  }
  // Default: Mix Bradesco (id 14) — sempre disponivel pra cobrir misturas
  const mix = PRODUTOS.find(p => p.id === 14);
  return mix ? { id: mix.id, motivo: 'Nenhum produto específico identificado · use Mix Bradesco' } : null;
}
