/* POR QUE O ÁUDIO DA CONVERSA NÃO SAI NESTA MÁQUINA.
 *
 * O relato: os avisos do sistema tocam, o áudio do cliente não. Isso não é
 * coincidência, é uma pista forte e mal aproveitada.
 *
 * OS DOIS SONS DA CASA NÃO PASSAM PELO MESMO CAMINHO. O "bling" da notificação
 * é SINTETIZADO na hora (`som.ts`, osciladores do Web Audio): não existe
 * arquivo, não existe formato, não existe decodificador envolvido. O áudio do
 * cliente é um arquivo `audio/ogg; codecs=opus` que precisa ser baixado,
 * decodificado por um decodificador de verdade e entregue a um `<audio>`.
 *
 * Então "o bling toca" NÃO quer dizer "o som da máquina está bom". Quer dizer
 * apenas que a placa de som responde. Tudo que está entre o arquivo e a placa
 * continua suspeito, e é isso que este módulo separa em perguntas que a
 * máquina dela responde sozinha:
 *
 *   1. o navegador SABE decodificar este formato?   (canPlayType)
 *   2. ele conseguiu decodificar ESTE arquivo?      (readyState / error)
 *   3. ele está tocando de verdade?                 (currentTime andando)
 *   4. o volume do elemento está aberto?            (volume / muted)
 *
 * A resposta que mais importa é a 3 com a 4: se o relógio anda e o volume está
 * aberto, o navegador ESTÁ tocando, e o som está saindo em outro lugar (outro
 * dispositivo de saída, o mixer do Windows, ou o som do site bloqueado). Sem
 * essa separação, a conversa vira "não sai som" contra "aqui sai", que é onde
 * ela estava.
 */

/** Os formatos que a nossa base realmente guarda hoje. */
export const FORMATOS = [
  { mime: "audio/ogg; codecs=opus", rotulo: "Áudio do cliente (WhatsApp)", exemplos: 73 },
  { mime: "audio/webm; codecs=opus", rotulo: "Áudio gravado aqui", exemplos: 5 },
  { mime: "video/mp4", rotulo: "Vídeo", exemplos: 18 },
] as const;

export type Suporte = "sim" | "talvez" | "nao";

/** `canPlayType` devolve "probably" | "maybe" | "". Traduz para algo legível. */
export function suporteDe(resposta: string): Suporte {
  if (resposta === "probably") return "sim";
  if (resposta === "maybe") return "talvez";
  return "nao";
}

export interface Achados {
  /** por formato, o que o navegador diz saber tocar */
  suporte: Record<string, Suporte>;
  /** o Web Audio (os avisos do sistema) está de pé? */
  webAudio: "ok" | "suspenso" | "falhou";
  /** conseguiu carregar um arquivo de verdade da conversa? */
  carregou: boolean | null;
  /** código do MediaError, quando houve */
  erroCodigo: number | null;
  /** o relógio andou depois do play? */
  andou: boolean | null;
  volume: number;
  mudo: boolean;
  /** quantas saídas de áudio o sistema oferece */
  saidas: number | null;
}

export interface Veredito {
  gravidade: "erro" | "aviso" | "ok";
  titulo: string;
  detalhe: string;
  /** o que fazer, na ordem em que vale a pena tentar */
  passos: string[];
}

const NOME_ERRO: Record<number, string> = {
  1: "o carregamento foi interrompido",
  2: "a rede cortou no meio do download",
  3: "o arquivo baixou mas não deu para decodificar",
  4: "o navegador recusou o formato",
};

/**
 * O que os achados querem dizer, em ordem de importância.
 *
 * Devolve lista porque mais de uma coisa pode estar errada ao mesmo tempo, e
 * mostrar só a primeira faria a pessoa consertar uma e achar que acabou.
 */
export function lerAchados(a: Achados): Veredito[] {
  const out: Veredito[] = [];
  const semNenhum = Object.values(a.suporte).every((s) => s === "nao");
  const semOpus = a.suporte["audio/ogg; codecs=opus"] === "nao";

  if (semNenhum) {
    out.push({
      gravidade: "erro",
      titulo: "Este navegador não toca nenhum dos nossos formatos",
      detalhe: "Nem o áudio do WhatsApp, nem o vídeo. Isso é o navegador, não a máquina: alguma versão sem os decodificadores.",
      passos: ["Abrir o sistema no Google Chrome ou no Microsoft Edge",
               "Se já for um deles, atualizar para a versão mais nova e reiniciar"],
    });
  } else if (semOpus) {
    out.push({
      gravidade: "erro",
      titulo: "Falta o decodificador de Opus",
      detalhe: "É o formato em que o WhatsApp manda todo áudio gravado. Sem ele, a bolha aparece e não toca.",
      passos: ["Abrir no Google Chrome ou no Microsoft Edge, que trazem o Opus embutido",
               "No Windows N, instalar o Media Feature Pack"],
    });
  }

  if (a.carregou === false) {
    out.push({
      gravidade: "erro",
      titulo: "O arquivo não chegou inteiro",
      detalhe: a.erroCodigo
        ? `O navegador parou porque ${NOME_ERRO[a.erroCodigo] ?? "houve um erro de mídia"}.`
        : "O navegador não conseguiu carregar o arquivo de teste.",
      passos: ["Conferir se a rede não bloqueia o domínio do Supabase",
               "Testar em outra rede, como o 4G do celular"],
    });
  }

  if (a.mudo || a.volume === 0) {
    out.push({
      gravidade: "erro",
      titulo: "O tocador está no mudo",
      detalhe: `O elemento de áudio está com volume ${Math.round(a.volume * 100)}%${a.mudo ? " e mudo ligado" : ""}.`,
      passos: ["Recarregar a página com Ctrl+Shift+R"],
    });
  }

  /* O ACHADO QUE ENCERRA A DISCUSSÃO. Formato suportado, arquivo carregado,
     relógio andando, volume aberto: o navegador está tocando. O som existe e
     está saindo em outro lugar. */
  if (!semNenhum && !semOpus && a.carregou && a.andou && !a.mudo && a.volume > 0) {
    out.push({
      gravidade: "aviso",
      titulo: "O navegador está tocando, mas o som sai em outro lugar",
      detalhe: "O arquivo foi decodificado e o tempo está correndo. O problema está entre o navegador e a caixa de som, e não no sistema."
        + (a.saidas && a.saidas > 1 ? ` Esta máquina tem ${a.saidas} saídas de áudio, o que torna isso mais provável.` : ""),
      passos: [
        "No Windows: botão direito no ícone de som, Mixer de volume, conferir se o navegador não está mudo ou em 0",
        "No mesmo mixer, conferir se o navegador não está mandando o som para outro dispositivo",
        "No Chrome: clicar no cadeado ao lado do endereço e conferir se Som está como Permitir",
        "Clicar com o botão direito na aba: se aparecer Reativar som do site, é isso",
        "Desligar os efeitos de áudio do fabricante (Dolby, Samsung), que costumam tomar a placa para si",
      ],
    });
  }

  if (a.andou === false && a.carregou) {
    out.push({
      gravidade: "erro",
      titulo: "O navegador carregou mas não deixou tocar",
      detalhe: "O arquivo está pronto e o tempo não anda. Isso é bloqueio de reprodução automática ou som do site desligado.",
      passos: ["No Chrome: cadeado ao lado do endereço, Som, Permitir",
               "Clicar com o botão direito na aba e ver se há Reativar som do site"],
    });
  }

  if (a.webAudio === "falhou") {
    out.push({
      gravidade: "aviso",
      titulo: "Os avisos do sistema também não vão tocar",
      detalhe: "O Web Audio não subiu nesta máquina, então nem o bling de notificação sai.",
      passos: ["Reiniciar o navegador"],
    });
  }

  if (out.length === 0) {
    out.push({
      gravidade: "ok",
      titulo: "Está tudo certo por aqui",
      detalhe: "Formato suportado, arquivo carregado e volume aberto. Se ainda assim não sai som, é o volume do sistema ou o dispositivo de saída.",
      passos: [],
    });
  }
  return out;
}

/** O resumo em texto, para colar numa mensagem sem precisar de print. */
export function resumoParaColar(a: Achados, navegador: string): string {
  const linhas = [
    `Navegador: ${navegador}`,
    `Web Audio (avisos do sistema): ${a.webAudio}`,
    ...FORMATOS.map((f) => `${f.rotulo} (${f.mime}): ${a.suporte[f.mime] ?? "?"}`),
    `Carregou o arquivo de teste: ${a.carregou === null ? "não testado" : a.carregou ? "sim" : "não"}`,
    a.erroCodigo ? `Erro de mídia: ${a.erroCodigo} (${NOME_ERRO[a.erroCodigo] ?? "desconhecido"})` : null,
    `Tempo andou ao tocar: ${a.andou === null ? "não testado" : a.andou ? "sim" : "não"}`,
    `Volume do tocador: ${Math.round(a.volume * 100)}%${a.mudo ? " (mudo)" : ""}`,
    a.saidas != null ? `Saídas de áudio no sistema: ${a.saidas}` : null,
  ].filter(Boolean);
  return linhas.join("\n");
}
