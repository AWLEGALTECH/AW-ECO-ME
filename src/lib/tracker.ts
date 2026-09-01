// Derivação das vitórias do Tracker.
//
// Vive fora do componente porque é conta de dinheiro: decide quanto cada
// processo vale hoje, e é isso que aparece nos KPIs, nos gráficos e na lista.
// Componente não se testa sem navegador; essa função sim.

import { jaSaiuDoTracker, viaDeBaixa, STATUS_ACORDO_PAGO, type ViaBaixa } from "./baixaTracker";

export type ResultadoSentenca = "procedente" | "parcial" | "improcedente";

export interface Decisao { resultado?: ResultadoSentenca; valor?: number; data?: string; honorarios?: number; tipoDecisao?: string }
export interface Execucao { valor?: number; data?: string }
export interface Acordo { valor?: number; dataFechamento?: string; previsaoPagamento?: string }

export interface EtapaLT {
  titulo?: string; status?: string; statusProcessual?: string;
  sentenca?: Decisao; julgamento?: Decisao; execucao?: Execucao; acordo?: Acordo;
}

export interface ProcRow {
  id: string;
  numero_processo: string | null;
  materia: string | null;
  comarca_uf: string | null;
  fase_processual: string | null;
  linha_temporal: EtapaLT[] | null;
  cliente: { id: string; nome: string | null } | null;
}

/** Vitória: processo com sentença procedente/parcial OU com acordo fechado. */
export interface Vitoria {
  id: string;
  numero_processo: string | null;
  materia: string | null;
  comarca_uf: string | null;
  cliente_nome: string | null;
  /** pro diálogo de baixa buscar o contrato e sugerir o repasse */
  cliente_id: string | null;
  /** O que o processo vale HOJE. Havendo acordo, é o acordo. */
  valor: number;
  /** Condenação de 1º grau (0 quando a vitória veio só do acordo). */
  valorSentenca: number;
  origem: "sentenca" | "acordo";
  /** Data da sentença ou, sem ela, do fechamento do acordo. */
  data: string | null;
  faseAtual: string;
  emCumprimento: boolean;
  valorCumprimento: number;
  acordo: {
    valor: number;
    fechamento: string | null;
    previsao: string | null;
    /** Um dos status da milestone Acordo. */
    status: string;
    /** O dinheiro já entrou (acordo arquivado). */
    pago: boolean;
  } | null;
  /** ROTATIVIDADE: o dinheiro já entrou, então o processo saiu do Tracker e a
      vida dele continua no Wallet. */
  baixado: boolean;
  viaBaixa: ViaBaixa | null;
}

export const ACORDO_TRATATIVA = "EM TRATATIVA DE ACORDO";
export const ACORDO_AG_PAGAMENTO = "AG. PAGAMENTO ACORDO";
// O dinheiro do acordo entrou. É a porta de saída do Tracker por essa via, e o
// último status antes do arquivamento — que é ato de organização, não de caixa.
export const ACORDO_PAGO = STATUS_ACORDO_PAGO;
export const ACORDO_ARQUIVADO = "ARQUIVADO ACORDO";

export const ETAPA_SENTENCA = "Sentença";
export const ETAPA_JULGAMENTO = "Julgamento em 2º grau";
export const ETAPA_CUMPRIMENTO = "Cumprimento de sentença";
export const ETAPA_ACORDO = "Acordo";

const acharEtapa = (lt: EtapaLT[] | null, titulo: string) => (lt ?? []).find((e) => e.titulo === titulo);
const etapaAtual = (lt: EtapaLT[] | null) => (lt ?? []).find((e) => e.status === "atual")?.titulo ?? "";

/** O status processual em vigor: o da etapa atual e, sem ele, o da ficha. */
const statusEmVigor = (p: ProcRow) =>
  (p.linha_temporal ?? []).find((e) => e.status === "atual")?.statusProcessual
  || p.fase_processual
  || "";

export function derivarVitorias(processos: ProcRow[]): Vitoria[] {
  const out: Vitoria[] = [];
  for (const p of processos) {
    const lt = Array.isArray(p.linha_temporal) ? p.linha_temporal : null;

    const sent = acharEtapa(lt, ETAPA_SENTENCA)?.sentenca;
    const valorSentenca = sent && sent.resultado !== "improcedente" ? Number(sent.valor || 0) : 0;

    const etapaAcordo = acharEtapa(lt, ETAPA_ACORDO);
    const ac = etapaAcordo?.acordo;
    const valorAcordo = Number(ac?.valor || 0);

    // Sem condenação e sem acordo não há o que rastrear.
    if (valorSentenca <= 0 && valorAcordo <= 0) continue;

    // Fechado o acordo, é ele que será pago: vira o valor do processo. Uma
    // condenação de 10 mil que se acertou por 6 mil vale 6 mil — o Tracker
    // existe pra dizer quanto entra, não quanto poderia ter entrado.
    const origem: Vitoria["origem"] = valorAcordo > 0 ? "acordo" : "sentenca";
    const valor = valorAcordo > 0 ? valorAcordo : valorSentenca;

    const fase = etapaAtual(lt) || (origem === "acordo" ? ETAPA_ACORDO : ETAPA_SENTENCA);
    const status = statusEmVigor(p);
    const emCumprimento = fase === ETAPA_CUMPRIMENTO;
    const exec = acharEtapa(lt, ETAPA_CUMPRIMENTO)?.execucao;
    const julg = acharEtapa(lt, ETAPA_JULGAMENTO)?.julgamento;
    // valor quase certo em cumprimento: executado > 2º grau procedente > valor atual
    const valorCumprimento = Number(
      exec?.valor ||
      (julg && julg.resultado !== "improcedente" ? julg.valor : 0) ||
      valor
    );

    out.push({
      id: p.id,
      numero_processo: p.numero_processo,
      materia: p.materia,
      comarca_uf: p.comarca_uf,
      cliente_nome: p.cliente?.nome ?? null,
      cliente_id: p.cliente?.id ?? null,
      valor,
      valorSentenca,
      origem,
      // Sem data de fechamento (acordo ainda sendo cadastrado), cai na data da
      // sentença: melhor uma data conhecida do que sumir do gráfico por mês.
      data: (origem === "acordo" ? ac?.dataFechamento : sent?.data) ?? sent?.data ?? null,
      faseAtual: fase,
      emCumprimento,
      valorCumprimento,
      acordo: valorAcordo > 0
        ? {
            valor: valorAcordo,
            fechamento: ac?.dataFechamento ?? null,
            previsao: ac?.previsaoPagamento ?? null,
            // Sem status gravado, o acordo conta como não pago. Dinheiro só é
            // dado por recebido quando alguém disse que foi.
            status: etapaAcordo?.statusProcessual ?? ACORDO_TRATATIVA,
            // Pago em ACORDO PAGO e também no arquivado, que vem depois dele —
            // quem arquivou já tinha recebido.
            pago: etapaAcordo?.statusProcessual === ACORDO_PAGO
               || etapaAcordo?.statusProcessual === ACORDO_ARQUIVADO,
          }
        : null,
      baixado: jaSaiuDoTracker(status),
      viaBaixa: viaDeBaixa(status),
    });
  }
  return out.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""));
}
