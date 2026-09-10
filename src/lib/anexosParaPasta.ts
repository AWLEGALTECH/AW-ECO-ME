/* OS ANEXOS DA CONVERSA INDO PARA A PASTA DO PRÉ-CLIENTE.
 *
 * Na hora de confirmar um pré-cliente, a tela pede que alguém marque "já subi
 * os documentos no Drive". Subir era um trabalho manual: baixar cada anexo do
 * WhatsApp, achar na pasta de downloads, abrir o Drive, arrastar. E o
 * documento estava aqui o tempo todo, na conversa, a dois cliques de distância
 * da pasta que é o destino dele.
 *
 * ─────────────────────────── o que mora aqui ───────────────────────────────
 *
 * QUAIS ANEXOS PODEM IR e COM QUE NOME CHEGAM. É diferente da lista que vai
 * para o Finder (`finderDaConversa.ts`), e a diferença é o ponto: o Finder só
 * lê PDF, porque é extrato que ele analisa. A pasta do cliente quer tudo que
 * seja documento dele, e RG quase sempre chega como FOTO. Filtrar por PDF aqui
 * deixaria de fora justamente o que o contrato precisa.
 *
 * O NOME IMPORTA MAIS AINDA AQUI. No Finder o nome dura uma sessão; na pasta
 * do cliente ele dura o processo inteiro. O WhatsApp batiza o anexo com um
 * uuid, e uma pasta com "1c1af6ec-d04b-47fe-a800-acfd77aa91c7.pdf" dentro é uma
 * pasta que ninguém vai conseguir usar daqui a seis meses.
 */

export interface AnexoCandidato {
  id?: string;
  tipo?: string | null;
  midiaPath?: string | null;
  midiaMime?: string | null;
  midiaNome?: string | null;
  de: "lead" | "nos";
  hora?: string;
  /** dd/mm, quando a bolha traz o divisor de dia */
  dia?: string | null;
}

export interface ArquivoParaPasta {
  /** id da mensagem, que é o que a tela usa para marcar e desmarcar */
  id: string;
  /** caminho no bucket wa-midia */
  path: string;
  /** nome sugerido, editável na tela antes de subir */
  nome: string;
  nomeOriginal: string | null;
  mime: string;
  de: "lead" | "nos";
  quando: string;
  /** áudio e vídeo ficam de fora: não são documento de ninguém */
  tipo: "documento" | "imagem";
}

const UUID_SOLTO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\s*\(\d+\))?$/i;

const EXT_DO_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** A extensão que o arquivo deve ter, pelo nome quando dá e pelo mime quando não. */
export function extensaoDe(nome: string | null | undefined, mime: string | null | undefined): string {
  const doNome = (nome ?? "").match(/\.([a-z0-9]{2,5})$/i)?.[1];
  if (doNome) return doNome.toLowerCase();
  return EXT_DO_MIME[(mime ?? "").toLowerCase()] ?? "bin";
}

/** Documento ou foto. Áudio, vídeo e figurinha não são documento de ninguém. */
export function podeIrParaPasta(a: AnexoCandidato): boolean {
  if (!a.id || !a.midiaPath) return false;
  const t = (a.tipo ?? "").toLowerCase();
  if (t === "documento" || t === "imagem") return true;
  // Linha antiga sem `tipo`: decide pelo mime.
  return /pdf|^image\//.test((a.midiaMime ?? "").toLowerCase());
}

/**
 * O nome com que o arquivo chega na pasta.
 *
 * Nome de verdade é preservado, porque quem mandou escolheu aquilo. Nome que é
 * só um uuid (o padrão do WhatsApp) vira algo que se lê: o que é, de quem veio
 * e quando. "documento 10-09 13h38.pdf" não diz tudo, mas diz mais que um uuid,
 * e quem for renomear na tela parte de algo em vez de partir do nada.
 */
export function nomeNaPasta(a: {
  midiaNome?: string | null; midiaMime?: string | null;
  tipo?: string | null; dia?: string | null; hora?: string; de: "lead" | "nos";
}, posicao: number): string {
  const cru = (a.midiaNome ?? "").trim();
  const semExt = cru.replace(/\.[a-z0-9]{2,5}$/i, "");
  if (semExt && !UUID_SOLTO.test(semExt)) {
    const ext = extensaoDe(cru, a.midiaMime);
    return /\.[a-z0-9]{2,5}$/i.test(cru) ? cru : `${cru}.${ext}`;
  }
  /* Jogando o nome fora, joga-se a extensão dele junto: um uuid batizado
     ".pdf" pelo WhatsApp pode ser a foto do RG, e o mime é quem sabe. Só se
     não houver mime é que a extensão do uuid vira a última pista. */
  const ext = extensaoDe(null, a.midiaMime) !== "bin"
    ? extensaoDe(null, a.midiaMime)
    : extensaoDe(cru, a.midiaMime);
  const rotulo = (a.tipo ?? "").toLowerCase() === "imagem" ? "foto" : "documento";
  const quando = [a.dia?.replace(/\//g, "-"), a.hora?.replace(":", "h")].filter(Boolean).join(" ");
  return `${rotulo}${quando ? " " + quando : ` ${posicao}`}.${ext}`;
}

/** Os anexos da conversa que podem ir para a pasta, na ordem em que chegaram. */
export function arquivosDaConversa(msgs: AnexoCandidato[]): ArquivoParaPasta[] {
  const out: ArquivoParaPasta[] = [];
  for (const m of msgs) {
    if (!podeIrParaPasta(m)) continue;
    const tipo: ArquivoParaPasta["tipo"] =
      (m.tipo ?? "").toLowerCase() === "imagem" || /^image\//i.test(m.midiaMime ?? "") ? "imagem" : "documento";
    out.push({
      id: m.id!,
      path: m.midiaPath!,
      nome: nomeNaPasta({ ...m, tipo }, out.length + 1),
      nomeOriginal: m.midiaNome ?? null,
      mime: m.midiaMime || (tipo === "imagem" ? "image/jpeg" : "application/octet-stream"),
      de: m.de,
      quando: [m.dia, m.hora].filter(Boolean).join(" "),
      tipo,
    });
  }
  return out;
}

/**
 * O que já vem marcado.
 *
 * O que o LEAD mandou, e só. O que nós mandamos para ele (o kit, a procuração,
 * o link de assinatura) já está na pasta por outro caminho, e subir de novo
 * duplicaria o contrato dentro da pasta do próprio contrato.
 */
export function selecaoInicialDaPasta(arqs: ArquivoParaPasta[]): string[] {
  return arqs.filter((a) => a.de === "lead").map((a) => a.id);
}

/** Dois arquivos com o mesmo nome na mesma pasta: o segundo ganha sufixo. */
export function nomesSemColisao(nomes: string[]): string[] {
  const vistos = new Map<string, number>();
  return nomes.map((n) => {
    const chave = n.toLowerCase();
    const n_ = vistos.get(chave) ?? 0;
    vistos.set(chave, n_ + 1);
    if (n_ === 0) return n;
    const m = n.match(/^(.*?)(\.[a-z0-9]{2,5})$/i);
    return m ? `${m[1]} (${n_ + 1})${m[2]}` : `${n} (${n_ + 1})`;
  });
}
