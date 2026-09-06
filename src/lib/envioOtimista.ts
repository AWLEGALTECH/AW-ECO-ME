// envioOtimista — a mensagem sai da caixa de digitar no ENTER, não no OK.
//
// Antes, o texto ficava preso no campo até a Evolution responder. A intenção
// era honesta: só mostrar na conversa o que realmente saiu. Mas na prática quem
// digita aperta enter, vê o texto parado ali, e aperta de novo — e agora são
// duas mensagens iguais no WhatsApp do cliente. O cuidado com a verdade estava
// produzindo o erro que ele queria evitar.
//
// O WhatsApp resolveu isso há uma década e todo mundo já sabe ler: a bolha
// aparece na hora com um RELÓGIO, e o relógio vira risco quando o servidor
// confirma. A informação "ainda não saiu" continua lá, dita por um símbolo em
// vez de por um campo que não esvazia.
//
// O PROBLEMA DIFÍCIL É A RECONCILIAÇÃO, não o relógio. A lista de mensagens
// recarrega a cada 5 segundos. Quando a mensagem confirmada finalmente aparece
// vinda do banco, a bolha otimista precisa sumir no mesmo instante — senão o
// texto fica duplicado na tela, que é pior do que o problema original.
//
// E ela precisa sumir CERTO: se a atendente mandou "ok" duas vezes seguidas,
// duas bolhas pendentes existem e duas linhas vão chegar. Casar por texto sem
// consumir o par faria as duas pendentes casarem com a MESMA linha do banco, e
// uma delas ficaria pendurada pra sempre com um relógio que nunca vira risco.
// Por isso o casamento aqui consome: cada linha do servidor resolve no máximo
// uma pendência.

export type EstadoEnvio = "pendente" | "falhou";

export type Pendente = {
  /** id local, sempre com prefixo — nunca colide com uuid do banco */
  id: string;
  conversaId: string;
  texto: string;
  /** ISO do momento em que a pessoa apertou enter */
  criadaEm: string;
  estado: EstadoEnvio;
  erro?: string;
};

/** Linha do banco, no mínimo que interessa pra casar. */
export type LinhaEnviada = {
  /** o id do banco. Opcional porque o casamento não precisa dele; quem precisa
   *  é a herança de identidade (ver `casamentos`). */
  id?: string;
  direcao: string;
  texto: string | null;
  criada_em: string;
};

/** Folga pra trás no relógio: o `criada_em` é gerado no servidor, e o horário
 *  da máquina de quem digita pode estar adiantado. Sem isso, um relógio local
 *  30 segundos à frente faria a confirmação nunca casar. */
const FOLGA_MS = 120_000;

let sequencia = 0;

export function novaPendente(conversaId: string, texto: string, agora = new Date()): Pendente {
  sequencia += 1;
  return {
    id: `pend:${agora.getTime()}:${sequencia}`,
    conversaId,
    texto,
    criadaEm: agora.toISOString(),
    estado: "pendente",
  };
}

const limpo = (s: string | null | undefined) => String(s ?? "").trim();

/** Esta linha do banco pode ser a confirmação desta pendência? */
export function podeSerAConfirmacao(p: Pendente, m: LinhaEnviada): boolean {
  if (m.direcao !== "saida") return false;
  if (limpo(m.texto) !== limpo(p.texto)) return false;
  const t = Date.parse(m.criada_em);
  if (Number.isNaN(t)) return false;
  return t >= Date.parse(p.criadaEm) - FOLGA_MS;
}

/**
 * Quais pendências ainda não apareceram no banco.
 *
 * Casa a MAIS ANTIGA primeiro e consome a linha: duas mensagens iguais mandadas
 * em sequência resolvem uma de cada vez, em ordem, em vez de as duas apostarem
 * na mesma linha.
 *
 * Pendência que FALHOU não é reconciliada — ela fica na tela de propósito, com
 * a marca de erro, porque o texto morreria junto com a bolha e quem escreveu
 * teria que lembrar de cabeça o que tinha escrito.
 */
export function aindaPendentes(pendentes: Pendente[], msgs: LinhaEnviada[]): Pendente[] {
  const usadas = new Set<number>();
  const sobra: Pendente[] = [];

  for (const p of [...pendentes].sort((a, b) => a.criadaEm.localeCompare(b.criadaEm))) {
    if (p.estado === "falhou") { sobra.push(p); continue; }
    let casou = -1;
    for (let i = 0; i < msgs.length; i++) {
      if (usadas.has(i)) continue;
      if (podeSerAConfirmacao(p, msgs[i])) { casou = i; break; }
    }
    if (casou >= 0) usadas.add(casou);
    else sobra.push(p);
  }
  return sobra;
}

/**
 * QUEM VIROU QUEM: cada pendência e a linha do banco que a confirmou.
 *
 * Existe por um motivo de TELA, e é o conserto de um pulo que resistiu a três
 * tentativas. A bolha otimista e a linha do banco são dois elementos com
 * chaves diferentes, então o React desmonta uma e monta a outra — e a que monta
 * faz a animação de entrada, invisível no primeiro quadro, ocupando espaço sem
 * aparecer. Quem está olhando vê a mensagem sumir e voltar de outro lugar.
 *
 * Com o par em mãos, a linha do banco pode HERDAR a chave da pendência: o React
 * enxerga o mesmo elemento, nada monta, nada anima, e o relógio simplesmente
 * vira risco. Que é a verdade do que aconteceu — é a mesma mensagem.
 *
 * A regra de casamento é a mesma de `aindaPendentes`, e de propósito: as duas
 * precisam concordar sobre quem casou com quem, senão uma bolha sumiria e a
 * outra não herdaria nada.
 */
export function casamentos(
  pendentes: Pendente[], msgs: LinhaEnviada[],
): Array<{ pendenteId: string; msgId: string }> {
  const usadas = new Set<number>();
  const pares: Array<{ pendenteId: string; msgId: string }> = [];

  for (const p of [...pendentes].sort((a, b) => a.criadaEm.localeCompare(b.criadaEm))) {
    if (p.estado === "falhou") continue;
    for (let i = 0; i < msgs.length; i++) {
      if (usadas.has(i)) continue;
      if (podeSerAConfirmacao(p, msgs[i])) {
        usadas.add(i);
        const id = msgs[i].id;
        if (id) pares.push({ pendenteId: p.id, msgId: id });
        break;
      }
    }
  }
  return pares;
}

/** As pendências de UMA conversa, em ordem de chegada. */
export function daConversa(pendentes: Pendente[], conversaId: string | null): Pendente[] {
  if (!conversaId) return [];
  return pendentes
    .filter((p) => p.conversaId === conversaId)
    .sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
}

/** Marca uma pendência como falha, preservando o texto pra não se perder. */
export function marcarFalha(pendentes: Pendente[], id: string, erro: string): Pendente[] {
  return pendentes.map((p) => (p.id === id ? { ...p, estado: "falhou" as const, erro } : p));
}

export function remover(pendentes: Pendente[], id: string): Pendente[] {
  return pendentes.filter((p) => p.id !== id);
}

/**
 * Uma bolha pendente vira envelope de mensagem pra tela desenhar igual às
 * outras. `status` carrega o estado local — a tela lê "pendente" e desenha o
 * relógio, "falhou" e desenha o alerta.
 */
export function bolhaDaPendente(p: Pendente) {
  return {
    de: "nos" as const,
    texto: p.texto,
    hora: new Date(p.criadaEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    id: p.id,
    tipo: "texto",
    status: p.estado,
  };
}
