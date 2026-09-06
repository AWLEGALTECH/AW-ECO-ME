// A RETENÇÃO DE MENSAGEM — as regras que decidem se um agendamento pode existir.
//
// Tudo aqui responde à mesma pergunta, feita antes de a mensagem sair da nossa
// mão: isso vai chegar no cliente na hora certa, e é isso mesmo que a pessoa
// quis? Depois que o despachante manda, não há como voltar atrás — não existe
// "cancelar" no WhatsApp de quem já recebeu.

/** Os formatos que a caixa de entrada sabe desenhar e a Evolution sabe mandar. */
export type TipoRetido = "texto" | "imagem" | "video" | "documento" | "audio";

export type Retencao = {
  tipo: TipoRetido;
  texto: string | null;
  /** o arquivo, quando há um */
  temArquivo: boolean;
  /** ISO completo com hora: quando ela deve sair */
  quandoISO: string;
};

/**
 * O tipo, a partir do mime do arquivo.
 *
 * Espelha o que a wa-enviar faz na saída e o que a wa-webhook faz na entrada:
 * os três precisam concordar, senão a mesma foto vira "imagem" de um lado e
 * "documento" do outro, e a bolha desenha errado.
 */
export function tipoDoMime(mime: string): TipoRetido {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "imagem";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "documento";
}

/** Junta dia e hora num instante local. Sem hora, meio-dia: ver abaixo. */
export function instanteDe(diaISO: string, hora: string | null): Date {
  const [a, m, d] = diaISO.split("-").map(Number);
  /* SEM HORA, MEIO-DIA — e não meia-noite. Um lembrete sem hora quer dizer "em
     algum momento desse dia"; disparar a mensagem à 00:00 mandaria um WhatsApp
     de madrugada para um cliente, que é o pior horário possível e ninguém
     escolheu. Meio-dia é o centro do horário comercial e o padrão menos
     surpreendente. */
  const [hh, mm] = (hora || "12:00").split(":").map(Number);
  return new Date(a, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

/**
 * Por que esta retenção NÃO pode ser agendada. Null quando pode.
 *
 * Devolve a frase pronta em vez de um booleano porque "não dá" sem motivo é o
 * tipo de recusa que faz a pessoa tentar de novo igual.
 */
export function motivoDeNaoAgendar(r: {
  tipo: TipoRetido;
  texto: string | null;
  temArquivo: boolean;
  quando: Date;
  agora?: Date;
}): string | null {
  const agora = r.agora ?? new Date();

  if (r.tipo === "texto" && !(r.texto ?? "").trim()) {
    return "Escreva a mensagem que vai ser enviada.";
  }
  if (r.tipo !== "texto" && !r.temArquivo) {
    return "Anexe o arquivo que vai ser enviado.";
  }
  /* PASSADO NÃO SE AGENDA — e o limite é um minuto à frente, não zero: entre
     escolher a hora e clicar em salvar passam segundos, e agendar para "agora"
     dispararia no minuto seguinte de qualquer forma. Um limite exato faria a
     mesma escolha ser aceita ou recusada dependendo da velocidade do clique. */
  if (r.quando.getTime() < agora.getTime() + 60_000) {
    return "Escolha um horário pelo menos um minuto à frente.";
  }
  /* Um ano é o limite do que dá pra chamar de agendamento. Além disso é quase
     sempre erro de digitação no ano, e um erro que só aparece em 2027. */
  if (r.quando.getTime() > agora.getTime() + 366 * 86400000) {
    return "Não dá pra agendar com mais de um ano de antecedência.";
  }
  return null;
}

/** Quanto falta, em português. É o que a bolha da conversa mostra. */
export function faltaPara(quandoISO: string, agora = new Date()): string {
  const t = new Date(quandoISO).getTime();
  const min = Math.round((t - agora.getTime()) / 60000);
  if (min <= 0) return "saindo agora";
  if (min < 60) return `em ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `em ${h} ${h === 1 ? "hora" : "horas"}`;
  const d = Math.round(h / 24);
  return `em ${d} ${d === 1 ? "dia" : "dias"}`;
}

/** "07/09 às 14:00" — o rótulo curto do horário agendado. */
export function quandoBonito(quandoISO: string): string {
  const d = new Date(quandoISO);
  const dia = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  const hora = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${dia} às ${hora}`;
}
