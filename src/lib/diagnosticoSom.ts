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
     relógio andando, volume aberto: o navegador está tocando.

     ATENÇÃO AO QUE ESTE AVISO NÃO PODE DIZER. A primeira versão dele mandava
     direto para o mixer do Windows, e isso estava errado de raciocínio: o
     bling e o áudio do cliente saem do MESMO navegador para a MESMA saída, e
     um mixer que abafasse um abafaria o outro. Mixer explica "nenhum som", não
     "só este som". Mandar mexer lá gastou uma rodada inteira de tentativa.
     O que decide é o teste dos três sons, e é para lá que este aviso aponta. */
  if (!semNenhum && !semOpus && a.carregou && a.andou && !a.mudo && a.volume > 0) {
    out.push({
      gravidade: "aviso",
      titulo: "O navegador está tocando; falta saber se o som chega à caixa",
      detalhe: "O arquivo foi decodificado e o tempo está correndo, então o navegador fez a parte dele. Daqui em diante só o ouvido responde: use os três sons acima, que dizem em qual trecho ele some."
        + (a.saidas && a.saidas > 1 ? ` Esta máquina tem ${a.saidas} saídas de áudio, o que dá mais de um lugar para o som se perder.` : ""),
      passos: [
        "Tocar os três sons aqui de cima e responder o que ouviu em cada um",
        "Se o bipe do teste 2 não sair, é o Windows abafando mídia, e não o formato",
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

/* ══════════════════ OS TRÊS SONS ═══════════════════════════════════════════
 *
 * O teste de cima mede o que a máquina RESPONDE. Isto aqui é o que ela FAZ, e
 * foi o que faltou: os dois testes anteriores nunca pediram para a pessoa
 * OUVIR pelo caminho do áudio do cliente. O arquivo real era tocado no mudo
 * (para não gritar na sala), então "o navegador está tocando" nunca foi
 * confirmado por ouvido nenhum.
 *
 * O ERRO DE RACIOCÍNIO QUE ISTO CORRIGE. A conclusão anterior mandava mexer no
 * mixer do Windows quando tudo o mais dava certo. Mas o bling e o áudio do
 * cliente saem do MESMO navegador para a MESMA saída: se fosse o mixer, o
 * bling sumiria junto. O mixer explica "nenhum som", não "só este som".
 *
 * O que separa os dois é o CAMINHO, e ele tem dois trechos:
 *
 *   bling  →  sintetizado no Web Audio. Sem arquivo, sem decodificador.
 *   bipe   →  arquivo WAV num <audio>. Tem o trecho de mídia, mas o WAV é
 *             PCM cru: nenhum navegador do mundo precisa de decodificador
 *             especial para ele.
 *   voz    →  arquivo Opus num <audio>. Tem o trecho de mídia E o Opus.
 *
 * O bipe é a peça que faltava, e é ela que decide:
 *
 *   ouve bling, não ouve bipe  →  o caminho de MÍDIA do navegador está mudo.
 *                                 Não é codec: é volume por aplicativo, o
 *                                 abafamento de comunicação do Windows, ou
 *                                 efeito do fabricante.
 *   ouve bipe, não ouve voz    →  aí sim é o Opus, e só ele.
 */

/** Um bipe curto de 440 Hz em WAV, como data URI. PCM cru: toca em tudo. */
export function bipeWav(segundos = 0.6, hz = 440, taxa = 8000): string {
  const n = Math.max(1, Math.round(segundos * taxa));
  const bytes = new Uint8Array(44 + n);
  const dv = new DataView(bytes.buffer);
  const txt = (pos: number, s: string) => {
    for (let i = 0; i < s.length; i += 1) bytes[pos + i] = s.charCodeAt(i);
  };
  txt(0, "RIFF"); dv.setUint32(4, 36 + n, true); txt(8, "WAVE");
  txt(12, "fmt "); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);      // PCM
  dv.setUint16(22, 1, true);      // mono
  dv.setUint32(24, taxa, true);
  dv.setUint32(28, taxa, true);   // byte rate = taxa * canais * bytes por amostra
  dv.setUint16(32, 1, true);      // alinhamento do bloco
  dv.setUint16(34, 8, true);      // 8 bits
  txt(36, "data"); dv.setUint32(40, n, true);

  /* Com abertura e fechamento suaves: onda que começa e para seco estala, e um
     estalo é exatamente o que confunde quem está tentando ouvir se saiu som. */
  const rampa = Math.min(Math.floor(n / 8), Math.round(taxa * 0.02));
  for (let i = 0; i < n; i += 1) {
    const env = rampa > 0 ? Math.min(1, Math.min(i, n - 1 - i) / rampa) : 1;
    bytes[44 + i] = Math.round(128 + 110 * env * Math.sin((2 * Math.PI * hz * i) / taxa));
  }

  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === "function"
    ? btoa(bin)
    : Buffer.from(bytes).toString("base64");
  return `data:audio/wav;base64,${b64}`;
}

/** O que a pessoa ouviu em cada um dos caminhos. */
export type Ouviu = boolean | null;
export interface OQueOuviu {
  /** o bling sintetizado (Web Audio) */
  bling: Ouviu;
  /** o bipe em WAV, por um <audio> */
  bipe: Ouviu;
  /** um áudio de cliente de verdade, em Opus, por um <audio> */
  voz: Ouviu;
  /**
   * um vídeo de verdade, por um <video> com os controles do navegador.
   *
   * Entrou depois, quando o relato ficou mais preciso: o vídeo também está
   * mudo. Isso é informação grande, porque vídeo é MP4/AAC e áudio é
   * Ogg/Opus — duas famílias sem nada em comum. Máquina nenhuma perde os dois
   * decodificadores e continua tocando o resto do navegador. O que os dois
   * compartilham é serem elemento de mídia, e é isso que passou a ser testado.
   */
  video: Ouviu;
}

/**
 * Onde o som morre, dado o que ela ouviu.
 *
 * `null` é "ainda não respondeu", e é diferente de "não ouviu": enquanto falta
 * resposta, não há conclusão nenhuma a dar.
 */
export function ondeParou(o: OQueOuviu): Veredito | null {
  if (o.bling === null || o.bipe === null) return null;

  if (!o.bling && !o.bipe) {
    return {
      gravidade: "erro",
      titulo: "Nenhum som do navegador sai nesta máquina",
      detalhe: "Nem o sintetizado, nem o arquivo. Como outros programas tocam, o problema é do navegador para baixo, e não da placa.",
      passos: [
        "Clicar com o botão direito no ícone de som, ao lado do relógio, e abrir o Mixer de volume",
        "Achar o navegador na lista e conferir se ele não está em 0 ou no mudo",
        "Conferir se, na mesma linha, a saída dele não é outro aparelho",
      ],
    };
  }

  if (o.bling && !o.bipe) {
    /* O ACHADO QUE O TESTE ANTERIOR NÃO CONSEGUIA FAZER. Som sintetizado sai,
       arquivo não sai, e o arquivo é um WAV cru: não há decodificador nenhum
       para culpar. O que sobra é o Windows tratando mídia diferente de aviso. */
    return {
      gravidade: "erro",
      titulo: "O som de arquivo está abafado, e não é problema de formato",
      detalhe: "O bipe é um WAV cru, que toca em qualquer navegador sem decodificador nenhum. Se ele não sai e o bling sai, alguma coisa no Windows está abafando só a mídia. O abafamento de chamadas é a causa mais comum, e ele fica ligado sozinho.",
      passos: [
        "Abrir o Painel de Controle, Som, aba Comunicações",
        "Marcar “Não fazer nada” e aplicar (se estiver em “Silenciar” ou “Reduzir”, é isto)",
        "Fechar o que usa microfone (Teams, Meet, WhatsApp do computador) e tocar o bipe de novo",
        "Na aba Reprodução, abrir as propriedades do alto-falante e desligar os efeitos (Dolby, Samsung, Realtek)",
        "No Mixer de volume, conferir o volume do navegador separadamente",
      ],
    };
  }

  if (o.voz === null || o.video === null) return null;

  /* VOZ E VÍDEO MUDOS JUNTOS NÃO É FORMATO. Opus e AAC não têm nada em comum
     além de virem de arquivo pela rede; perder os dois e manter o bipe é
     assinatura de arquivo que não chega, e não de decodificador que falta. */
  if (o.bipe && !o.voz && !o.video) {
    return {
      gravidade: "erro",
      titulo: "O que é gerado aqui toca; o que vem do servidor, não",
      detalhe: "O bipe está dentro da própria página e sai. A voz e o vídeo vêm do servidor de arquivos, e nenhum dos dois sai. São formatos sem parentesco, então o que falha é a chegada do arquivo, não o formato.",
      passos: [
        "Repetir nesta máquina usando o 4G do celular, por ponto de acesso",
        "Conferir se o antivírus ou o firewall inspeciona HTTPS e bloqueia o domínio do Supabase",
        "Abrir o mesmo sistema numa janela anônima, com as extensões desligadas",
      ],
    };
  }

  if (o.bipe && !o.voz && o.video) {
    return {
      gravidade: "erro",
      titulo: "É o Opus: o navegador não decodifica o áudio do WhatsApp",
      detalhe: "O vídeo toca com som e o áudio do cliente não. A diferença entre os dois é o formato, então o que falta é o decodificador de Opus.",
      passos: [
        "Abrir o sistema no Google Chrome, que traz o Opus embutido",
        "Se já for o Chrome, atualizar em Menu, Ajuda, Sobre o Google Chrome, e reiniciar",
        "Se for Windows edição N, instalar o Media Feature Pack pela Microsoft",
      ],
    };
  }

  if (o.bipe && o.voz && !o.video) {
    return {
      gravidade: "aviso",
      titulo: "Só o vídeo está mudo",
      detalhe: "O áudio do cliente sai e o vídeo não. O tocador de vídeo é o do próprio navegador, e ele guarda o volume que a pessoa deixou da última vez.",
      passos: [
        "Passar o mouse sobre o vídeo, achar o ícone de som nos controles e subir a barrinha",
        "Se o ícone estiver com um risco, clicar nele uma vez",
      ],
    };
  }

  if (o.bling && o.bipe && o.voz && o.video) {
    return {
      gravidade: "ok",
      titulo: "Todos os sons saíram",
      detalhe: "O caminho inteiro está de pé nesta máquina, inclusive o do áudio do cliente e o do vídeo. Se uma bolha específica não toca, o problema é daquele arquivo, e não da máquina.",
      passos: ["Abrir a conversa que não tocava e tentar de novo",
               "Se continuar só nela, me mandar o nome da conversa e a hora do áudio"],
    };
  }

  return null;
}

/** O que dá para saber da máquina sem pedir permissão nenhuma. */
export interface Ambiente {
  navegador: string;
  plataforma: string | null;
  /** o AudioContext subiu, e em que taxa */
  webAudio: string;
  /** quantas saídas de áudio, e os nomes quando o navegador conta */
  saidas: string;
  /** o tocador da tela, do jeito que ele está agora */
  tocador: string;
}

/**
 * O resumo em texto, para colar numa mensagem sem precisar de print.
 *
 * É a única coisa que atravessa a distância: quem está do outro lado não vê a
 * tela dela e não pode perguntar de um em um. Por isso ele junta as três
 * camadas — o que ela OUVIU, o que o navegador RESPONDEU e como a máquina
 * ESTÁ — e não só a última, que era o que ele trazia antes e que sozinha não
 * decide nada.
 */
export function resumoParaColar(
  a: Achados | null,
  navegador: string,
  o?: OQueOuviu | null,
  amb?: Ambiente | null,
): string {
  const sn = (v: Ouviu) => (v === null ? "não respondeu" : v ? "OUVIU" : "NÃO ouviu");
  const partes: (string | null)[] = [];

  if (o) {
    partes.push(
      "O QUE ELA OUVIU",
      `  1 aviso do sistema (sintetizado aqui): ${sn(o.bling)}`,
      `  2 bipe em WAV (arquivo, sem rede):     ${sn(o.bipe)}`,
      `  3 áudio do cliente (Opus, do servidor): ${sn(o.voz)}`,
      `  4 vídeo (MP4, do servidor):            ${sn(o.video)}`,
      "",
    );
  }

  /* O NAVEGADOR SAI SEMPRE, com ou sem o resto do ambiente. Ele é o primeiro
     dado de qualquer diagnóstico à distância, e uma versão dele já muda a
     conclusão; deixá-lo cair junto com o bloco opcional foi um buraco que o
     teste antigo pegou. */
  if (amb) {
    partes.push(
      "A MÁQUINA",
      `  Navegador: ${amb.navegador}`,
      amb.plataforma ? `  Sistema: ${amb.plataforma}` : null,
      `  Web Audio: ${amb.webAudio}`,
      `  Saídas de áudio: ${amb.saidas}`,
      `  Tocador da tela: ${amb.tocador}`,
      "",
    );
  } else if (navegador) {
    partes.push("A MÁQUINA", `  Navegador: ${navegador}`, "");
  }

  if (a) {
    partes.push(
      "O QUE O NAVEGADOR RESPONDEU",
      ...FORMATOS.map((f) => `  ${f.rotulo} (${f.mime}): ${a.suporte[f.mime] ?? "?"}`),
      `  Baixou e decodificou um áudio real: ${a.carregou === null ? "não testado" : a.carregou ? "sim" : "não"}`,
      a.erroCodigo ? `  Erro de mídia: ${a.erroCodigo} (${NOME_ERRO[a.erroCodigo] ?? "desconhecido"})` : null,
      `  Tempo andou ao tocar: ${a.andou === null ? "não testado" : a.andou ? "sim" : "não"}`,
      `  Volume do tocador: ${Math.round(a.volume * 100)}%${a.mudo ? " (mudo)" : ""}`,
      a.saidas != null ? `  Saídas de áudio: ${a.saidas}` : null,
    );
  }

  if (partes.length === 0) partes.push(`Navegador: ${navegador}`);
  return partes.filter((l) => l !== null).join("\n").trimEnd();
}
