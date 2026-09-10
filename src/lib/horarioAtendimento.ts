/* A GRADE DE HORÁRIOS DO PRIMEIRO ATENDIMENTO.
 *
 * O dia do escritório tem três estados: fechado (ninguém vai ler isso agora),
 * direcionamento (já estamos de pé, o responsável começa às tantas) e
 * atendimento (tem gente aqui). A grade diz qual vale a cada hora de cada dia.
 *
 * FECHADO É A AUSÊNCIA DE FAIXA, e não uma faixa. Guardar as três obrigaria
 * toda mudança a acertar as vizinhas para não deixar buraco nem sobreposição, e
 * um buraco de dois minutos às 8h seria um lead sem resposta que ninguém
 * consegue explicar. Aqui só existem as faixas de trabalho; o resto do dia é
 * fechado por definição.
 *
 * ESTE MÓDULO NÃO MANDA. Quem decide de verdade é o banco (fn_wa_faixa_em), que
 * é onde a mensagem é enfileirada. Isto aqui é para a tela poder desenhar o dia
 * e dizer "agora: fechado" sem perguntar ao servidor. As duas regras têm que
 * dizer a mesma coisa, e é por isso que esta está testada.
 */

export type Faixa = "fechado" | "direcionamento" | "atendimento";
export type FaixaDeTrabalho = Exclude<Faixa, "fechado">;

export interface Horario {
  id?: string;
  /** 0 = domingo, como o `dow` do Postgres */
  dia: number;
  /** "HH:MM" */
  inicio: string;
  fim: string;
  faixa: FaixaDeTrabalho;
}

export const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** O tamanho da célula do pincel. Meia hora pinta o dia inteiro em poucos
 *  gestos; o minuto exato se digita na lista ao lado. */
export const PASSO = 30;
export const CELULAS = (24 * 60) / PASSO;

export const ROTULO_FAIXA: Record<Faixa, string> = {
  fechado: "Fora do horário",
  direcionamento: "Direcionamento",
  atendimento: "Atendimento",
};

export function minutosDe(hhmm: string): number {
  const [h, m] = String(hhmm ?? "").split(":").map(Number);
  if (!Number.isFinite(h)) return 0;
  return Math.max(0, Math.min(24 * 60, h * 60 + (Number.isFinite(m) ? m : 0)));
}

export function horaDe(minuto: number): string {
  const m = Math.max(0, Math.min(24 * 60, Math.round(minuto)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** As faixas de um dia, em ordem. */
export const doDia = (horarios: Horario[], dia: number): Horario[] =>
  horarios.filter((h) => h.dia === dia).sort((a, b) => minutosDe(a.inicio) - minutosDe(b.inicio));

/**
 * Qual faixa vale neste minuto deste dia.
 *
 * O fim é EXCLUSIVO: uma faixa 09:00 às 18:00 não vale às 18:00 em ponto, senão
 * duas faixas coladas valeriam as duas no mesmo minuto.
 */
export function faixaEm(horarios: Horario[], dia: number, minuto: number): Faixa {
  const achadas = doDia(horarios, dia)
    .filter((h) => minuto >= minutosDe(h.inicio) && minuto < minutosDe(h.fim));
  if (achadas.length === 0) return "fechado";
  // Sobreposição não deveria existir (pintar não deixa), e se existir o
  // atendimento ganha: errar para "tem gente aqui" é melhor que mandar um
  // "estamos fechados" com o escritório cheio. Mesma regra do banco.
  return achadas.some((h) => h.faixa === "atendimento") ? "atendimento" : "direcionamento";
}

/**
 * Arruma a lista: fora as vazias, em ordem, e funde as vizinhas do mesmo tipo.
 *
 * A fusão importa para a tela não virar dezenas de faixas de meia hora depois
 * de alguém pintar arrastando: o que a pessoa desenhou foi UMA faixa das 9 às
 * 18, e é isso que a lista tem que mostrar.
 */
export function normalizar(horarios: Horario[]): Horario[] {
  const fora: Horario[] = [];
  for (let dia = 0; dia <= 6; dia++) {
    let atual: Horario | null = null;
    for (const h of doDia(horarios, dia)) {
      if (minutosDe(h.fim) <= minutosDe(h.inicio)) continue;
      if (atual && atual.faixa === h.faixa && minutosDe(atual.fim) >= minutosDe(h.inicio)) {
        atual.fim = horaDe(Math.max(minutosDe(atual.fim), minutosDe(h.fim)));
        continue;
      }
      atual = { ...h };
      fora.push(atual);
    }
  }
  return fora;
}

/**
 * Pinta um trecho do dia com uma faixa (ou apaga, com "fechado").
 *
 * O que estava embaixo é recortado, e não arredondado: uma faixa que começa às
 * 08:15 porque alguém digitou 08:15 continua começando às 08:15 se o pincel
 * passou longe dela. Perder minuto digitado por causa de um arrasto do outro
 * lado do dia seria o tipo de coisa que faz a pessoa parar de confiar na tela.
 */
export function pintar(
  horarios: Horario[], dia: number, deMinuto: number, ateMinuto: number, faixa: Faixa,
): Horario[] {
  const de = Math.min(deMinuto, ateMinuto);
  const ate = Math.max(deMinuto, ateMinuto);
  if (ate <= de) return normalizar(horarios);

  const outrosDias = horarios.filter((h) => h.dia !== dia);
  const sobrou: Horario[] = [];
  for (const h of doDia(horarios, dia)) {
    const a = minutosDe(h.inicio);
    const b = minutosDe(h.fim);
    if (b <= de || a >= ate) { sobrou.push(h); continue; }   // não foi tocada
    if (a < de) sobrou.push({ ...h, id: undefined, fim: horaDe(de) });
    if (b > ate) sobrou.push({ ...h, id: undefined, inicio: horaDe(ate) });
  }
  if (faixa !== "fechado") sobrou.push({ dia, inicio: horaDe(de), fim: horaDe(ate), faixa });
  return normalizar([...outrosDias, ...sobrou]);
}

/** A grade de um dia copiada por cima de outros. */
export function copiarDia(horarios: Horario[], de: number, para: number[]): Horario[] {
  const modelo = doDia(horarios, de);
  const alvos = para.filter((d) => d !== de);
  const mantidos = horarios.filter((h) => !alvos.includes(h.dia));
  const novos = alvos.flatMap((d) => modelo.map((h) => ({ ...h, id: undefined, dia: d })));
  return normalizar([...mantidos, ...novos]);
}

/** O dia inteiro em blocos, inclusive os de fechado. É o que a barra desenha. */
export function blocosDoDia(horarios: Horario[], dia: number): { de: number; ate: number; faixa: Faixa }[] {
  const blocos: { de: number; ate: number; faixa: Faixa }[] = [];
  let cursor = 0;
  for (const h of doDia(horarios, dia)) {
    const a = minutosDe(h.inicio);
    const b = minutosDe(h.fim);
    if (a > cursor) blocos.push({ de: cursor, ate: a, faixa: "fechado" });
    blocos.push({ de: a, ate: b, faixa: h.faixa });
    cursor = Math.max(cursor, b);
  }
  if (cursor < 24 * 60) blocos.push({ de: cursor, ate: 24 * 60, faixa: "fechado" });
  return blocos;
}

/**
 * Quando abre a próxima faixa, a partir de um ponto da semana.
 *
 * Olha catorze dias: sete cobrem a semana e os outros sete cobrem uma semana
 * inteira bloqueada. Mesma janela do banco, pelo mesmo motivo.
 */
export function proximaAbertura(
  horarios: Horario[], dia: number, minuto: number, tipo?: FaixaDeTrabalho,
): { dia: number; minuto: number; faixa: FaixaDeTrabalho; emDias: number } | null {
  for (let d = 0; d <= 14; d++) {
    const oDia = (dia + d) % 7;
    for (const h of doDia(horarios, oDia)) {
      if (tipo && h.faixa !== tipo) continue;
      const inicio = minutosDe(h.inicio);
      if (d === 0 && inicio <= minuto) continue;
      return { dia: oDia, minuto: inicio, faixa: h.faixa, emDias: d };
    }
  }
  return null;
}

/** "8h às 18h" e afins, para a linha de resumo de cada dia. */
export function resumoDoDia(horarios: Horario[], dia: number): string {
  const faixas = doDia(horarios, dia);
  if (faixas.length === 0) return "fechado o dia todo";
  return faixas.map((h) => `${h.inicio} às ${h.fim}`).join(", ");
}

/** Quantas horas de cada tipo o dia tem. Serve para a tela conferir o desenho. */
export function horasPorFaixa(horarios: Horario[], dia: number): Record<FaixaDeTrabalho, number> {
  const conta = { direcionamento: 0, atendimento: 0 };
  for (const h of doDia(horarios, dia)) {
    conta[h.faixa] += (minutosDe(h.fim) - minutosDe(h.inicio)) / 60;
  }
  return conta;
}

/**
 * Que dia e que hora são no fuso do escritório.
 *
 * O navegador de quem configura pode estar em qualquer lugar, e o servidor está
 * em UTC. A grade é de Manaus, e "agora" tem que ser o de lá, senão a tela diz
 * "fechado" às três da tarde para quem abriu o painel de outro estado.
 */
export function momentoEm(fuso: string, quando: Date = new Date()): { dia: number; minuto: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(quando);
  const pega = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const semana: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hora = Number(pega("hour"));
  return {
    dia: semana[pega("weekday")] ?? 0,
    // "24" acontece à meia-noite em algumas combinações de fuso e locale.
    minuto: ((hora === 24 ? 0 : hora) * 60) + Number(pega("minute")),
  };
}

/* ── As variáveis que se arrastam para dentro do texto ────────────────────── */

export const VARIAVEIS: { marca: string; rotulo: string; exemplo: string }[] = [
  { marca: "{nome}", rotulo: "Nome do lead", exemplo: "Joana" },
  { marca: "{horario}", rotulo: "Hora que abre", exemplo: "09:00" },
];

/**
 * O texto como o lead vai receber, para a tela poder mostrar antes de salvar.
 *
 * Espelho de `fn_wa_texto_variaveis`, inclusive no detalhe que mais importa:
 * sem nome, a saudação some inteira em vez de virar "Olá, !", que é pior que
 * não cumprimentar.
 */
export function comVariaveis(texto: string, dados: { nome?: string | null; horario?: string | null }): string {
  let t = texto ?? "";
  if (!t) return t;
  t = t.replace(/\{horario\}/g, dados.horario || "em breve");
  const primeiro = (dados.nome ?? "").trim().split(/\s+/)[0] ?? "";
  t = primeiro ? t.replace(/\{nome\}/g, primeiro) : t.replace(/[,\s]*\{nome\}/g, "");
  return t.replace(/[ \t]{2,}/g, " ").trim();
}

/* ── QUANDO A RÉGUA ESTÁ CONFIGURADA E MESMO ASSIM NÃO SAI NADA ─────────────
 *
 * Uma lead escreveu 11:52, dentro do direcionamento, e não recebeu nada. A
 * grade estava pintada, as três mensagens escritas, e o interruptor desligado:
 * ele nasce assim de propósito, para a grade ser escrita antes de a primeira
 * mensagem sair. O único sinal disso na tela era a palavrinha "Desligado" num
 * canto, do lado de um cartão que parecia inteiro e pronto.
 *
 * Há três formas de a régua não fazer nada sem dar erro nenhum. Esta função é
 * o nome de cada uma, para a tela poder dizer em voz alta em vez de deixar
 * quem configurou descobrir por um lead que não respondeu.
 */
export type AvisoDaRegua =
  /** tem grade ou mensagem escrita, mas o interruptor está desligado */
  | "desligada"
  /** ligada e sem nenhuma faixa pintada: o dia inteiro conta como fechado */
  | "sem_grade"
  /** ligada e sem nenhuma mensagem escrita: não há o que mandar */
  | "sem_mensagens"
  | null;

export function avisoDaRegua(estado: {
  ativo: boolean;
  grade: Horario[];
  /** as faixas que têm mensagem de verdade (texto ou anexo), só os nomes */
  comMensagem: Faixa[];
}): AvisoDaRegua {
  const temGrade = normalizar(estado.grade).length > 0;
  const temMsg = estado.comMensagem.length > 0;

  // Nada começado ainda não é aviso: é uma tela em branco, e quem abriu sabe.
  if (!estado.ativo) return temGrade || temMsg ? "desligada" : null;

  if (!temMsg) return "sem_mensagens";
  if (!temGrade) return "sem_grade";
  return null;
}
