// QUANTO VALE A RUBRICA DE UMA PESSOA NUM MÊS.
//
// Três instrumentos podem mexer nesse valor, e eles não se somam — um vence o
// outro. A ordem existe porque cada um é uma decisão de natureza diferente:
//
//   1. EXCEPCIONAL (individual, manual). A direção decidiu que, neste mês, a
//      rubrica desta pessoa vale outro valor, do início ao fim, pelo motivo
//      registrado junto. É decisão explícita: ganha de qualquer regra
//      automática, e não tem degrau.
//
//   2. FAIXA ESPECIAL PRÓPRIA (individual, por volume). A rubrica vale o base
//      até certo número e passa a valer mais depois. É mérito por quantidade.
//
//   3. FAIXA ESPECIAL GERAL (do mês, por volume). O mesmo degrau, valendo pra
//      todo mundo que não tenha o próprio.
//
// Sem nenhum dos três, vale o base do mês.
//
// A ORDEM É O PONTO DELICADO. Se o excepcional perdesse pro degrau, alguém que
// produzisse muito receberia por uma regra que a direção tinha decidido
// substituir — e a decisão manual viraria letra morta justamente no caso em que
// ela mais aparece. Por isso ele vem primeiro, e por isso este arquivo tem
// teste: é dinheiro de gente.

export interface FaixaMes {
  valorBase: number;
  especialAtivo: boolean;
  valorEspecial: number;
  especialLimite: number | null;
}

export interface FaixaPessoa {
  especialAtivo?: boolean;
  valorEspecial?: number;
  especialLimite?: number | null;
  excepcionalAtivo?: boolean;
  excepcionalValor?: number | null;
  excepcionalObs?: string | null;
}

export type OrigemValor = "base" | "especial-geral" | "especial-propria" | "excepcional";

export interface ValorVigente {
  /** R$ por rubrica válida, já resolvida a precedência. */
  valor: number;
  origem: OrigemValor;
  /** true quando o valor veio de uma decisão individual, não da regra do mês. */
  individual: boolean;
  /** o recado de quem atribuiu o excepcional; só existe nessa origem */
  observacao?: string | null;
  /** a partir de quantas rubricas o degrau vale; null quando não há degrau */
  limite: number | null;
}

/**
 * O valor da rubrica pra uma pessoa que fechou `rubricas` no mês.
 *
 * `rubricas` importa só pras faixas em degrau: o excepcional e o base valem
 * igual na primeira e na centésima.
 */
export function valorDaRubrica(
  rubricas: number,
  mes: FaixaMes,
  pessoa?: FaixaPessoa,
): ValorVigente {
  // 1. excepcional — decisão manual, sem degrau
  if (pessoa?.excepcionalAtivo && Number(pessoa.excepcionalValor) > 0) {
    return {
      valor: Number(pessoa.excepcionalValor),
      origem: "excepcional",
      individual: true,
      observacao: pessoa.excepcionalObs ?? null,
      limite: null,
    };
  }

  // 2. faixa especial própria
  if (pessoa?.especialAtivo && Number(pessoa.valorEspecial) > 0) {
    const lim = pessoa.especialLimite ?? 0;
    return {
      valor: rubricas > lim ? Number(pessoa.valorEspecial) : mes.valorBase,
      origem: "especial-propria",
      individual: true,
      limite: lim,
    };
  }

  // 3. faixa especial geral do mês
  if (mes.especialAtivo && mes.valorEspecial > 0) {
    const lim = mes.especialLimite ?? 0;
    return {
      valor: rubricas > lim ? mes.valorEspecial : mes.valorBase,
      origem: "especial-geral",
      individual: false,
      limite: lim,
    };
  }

  return { valor: mes.valorBase, origem: "base", individual: false, limite: null };
}

/** Comissão do mês: rubricas × valor vigente + o bônus individual. */
export function comissaoDoMes(
  rubricas: number,
  mes: FaixaMes,
  pessoa?: FaixaPessoa,
  bonus = 0,
): { total: number; vigente: ValorVigente } {
  const vigente = valorDaRubrica(rubricas, mes, pessoa);
  return { total: rubricas * vigente.valor + bonus, vigente };
}

/** Como a tela explica de onde saiu o valor, em uma linha. */
export function explicarValor(v: ValorVigente, base: number): string {
  switch (v.origem) {
    case "excepcional":
      return "Valor excepcional definido para esta pessoa neste mês.";
    case "especial-propria":
      return v.limite != null
        ? `Faixa especial própria: base até ${v.limite} rubricas, depois o especial.`
        : "Faixa especial própria.";
    case "especial-geral":
      return v.limite != null
        ? `Faixa especial do mês: base até ${v.limite} rubricas, depois o especial.`
        : "Faixa especial do mês.";
    default:
      return base > 0 ? "Valor base do mês, do início ao fim." : "Valor base ainda não definido.";
  }
}
