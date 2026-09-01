// QUANTO DO ALVARÁ É DO CLIENTE, SEGUNDO O CONTRATO.
//
// O contrato guarda `percentual_exito` — os honorários de êxito, que é a parte
// do ESCRITÓRIO. O cliente recebe o resto:
//
//     contrato de 30% de êxito  →  cliente recebe 70%
//     contrato de 40%           →  cliente recebe 60%
//     contrato de 50%           →  cliente recebe 50%
//
// A DIREÇÃO É O PONTO PERIGOSO DESTE ARQUIVO. Inverter significa repassar 30%
// onde eram 70% — o cliente recebe menos da metade do que tem direito, e o erro
// não aparece em lugar nenhum depois de pago. É por isso que a tela mostra a
// conta escrita ("contrato de 30% de êxito · cliente recebe 70%") em vez de só
// preencher o campo: um erro de direção fica visível antes de alguém confirmar.
//
// Conferido contra agosto: DARLENE recebeu 70%, MARIA DE LOURDES 60%, e os
// demais 50% — exatamente o espelho das faixas de 30/40/50 que o escritório
// pratica.
//
// É SUGESTÃO, NUNCA IMPOSIÇÃO. Ela preenche o campo e para aí; quem dá a baixa
// digita por cima quando o caso for diferente. Contrato que não bate com o que
// de fato se combinou existe, e a tela não pode ser mais teimosa que a pessoa.

export interface ContratoDoCliente {
  percentual_exito: number | null;
  modalidade?: string | null;
}

export interface SugestaoRepasse {
  /** quanto sugerir no campo "parte do cliente"; null quando não dá pra saber */
  valor: number | null;
  /** o que o contrato reserva ao escritório */
  percentualEscritorio: number | null;
  /** o que sobra pro cliente */
  percentualCliente: number | null;
  /** por que a sugestão é essa — vai escrito na tela */
  explicacao: string;
  /** contratos com percentuais diferentes: a tela precisa avisar */
  ambiguo: boolean;
}

const SEM_SUGESTAO = (explicacao: string): SugestaoRepasse => ({
  valor: null, percentualEscritorio: null, percentualCliente: null, explicacao, ambiguo: false,
});

/**
 * A sugestão de repasse pra um recebimento bruto, dados os contratos do cliente.
 *
 * Com mais de um contrato de percentuais diferentes não há como escolher: a
 * função devolve o mais recente marcado como ambíguo, e a tela avisa. Escolher
 * em silêncio seria decidir por conta própria de quanto é o repasse.
 */
export function sugerirRepasse(
  bruto: number,
  contratos: ContratoDoCliente[] | null | undefined,
): SugestaoRepasse {
  if (!(bruto > 0)) return SEM_SUGESTAO("");

  const validos = (contratos ?? []).filter(
    (c) => c.percentual_exito != null && c.percentual_exito > 0 && c.percentual_exito < 100,
  );
  if (validos.length === 0) {
    return SEM_SUGESTAO("Sem contrato com percentual registrado — preencha à mão.");
  }

  const percentuais = [...new Set(validos.map((c) => Number(c.percentual_exito)))];
  const escritorio = Number(validos[0].percentual_exito);
  const cliente = 100 - escritorio;
  const valor = Number(((bruto * cliente) / 100).toFixed(2));

  if (percentuais.length > 1) {
    return {
      valor,
      percentualEscritorio: escritorio,
      percentualCliente: cliente,
      ambiguo: true,
      explicacao:
        `Este cliente tem contratos com percentuais diferentes (${percentuais.map((p) => `${p}%`).join(", ")}). ` +
        `Sugeri pelo de ${escritorio}% — confira qual vale para este processo.`,
    };
  }

  return {
    valor,
    percentualEscritorio: escritorio,
    percentualCliente: cliente,
    ambiguo: false,
    explicacao: `Contrato de ${escritorio}% de êxito · o cliente fica com ${cliente}%.`,
  };
}
