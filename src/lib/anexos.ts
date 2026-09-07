/* OS ANEXOS DE UMA MENSAGEM — no plural, agora.
 *
 * Antes cada mensagem tinha UM arquivo, e anexar o segundo trocava o primeiro
 * sem avisar. Não dava erro, não dava aviso: o arquivo simplesmente sumia do
 * campo e ia embora só o último. Quem estava mandando três documentos de um
 * caso descobria isso do outro lado, com o cliente perguntando pelos outros
 * dois.
 *
 * ─────────────────────────── o que mora aqui ───────────────────────────────
 *
 * A LISTA E O SEU RESUMO. A tabela guarda `midias` (a lista, em ordem de envio)
 * e continua guardando `midia_path`/`midia_mime`/`midia_nome`/`tipo` com o
 * PRIMEIRO item. A duplicação é deliberada e tem prazo: é ela que deixa o
 * despachante antigo, a bolha da conversa e qualquer consulta que já existia
 * continuarem funcionando enquanto o resto migra. Sem ela, esta mudança
 * precisaria acertar sete lugares no mesmo commit para não parar uma fila que
 * já tem mensagem marcada.
 *
 * A ORDEM IMPORTA e é a de quem escolheu: o texto vai como legenda do PRIMEIRO
 * anexo, como no WhatsApp, e os demais vão secos atrás. Repetir a legenda em
 * cada um faria o cliente receber o mesmo parágrafo quatro vezes.
 */
import { tipoDoMime, type TipoRetido } from "@/lib/retencao";

/** Um anexo já no bucket, do jeito que a linha do banco guarda. */
export interface Midia {
  path: string;
  mime: string;
  nome: string;
  tipo: TipoRetido;
  /** só faz sentido em áudio; os outros vêm sem */
  duracao?: number | null;
}

/** Nome de arquivo que sobrevive a um caminho de URL. */
export const nomeSeguro = (n: string) =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(-80);

/** O que a tela segura antes de subir: o arquivo e, se for voz, a duração. */
export interface AnexoLocal {
  arquivo: File;
  duracao?: number | null;
}

/**
 * As colunas antigas a partir da lista nova.
 *
 * `tipo` é o do PRIMEIRO anexo porque é ele que define a rota de envio da
 * mensagem principal. Sem anexo nenhum, é `texto` — e aí o texto é a mensagem,
 * não a legenda de coisa alguma.
 */
export function resumoDasMidias(midias: Midia[]): {
  tipo: TipoRetido;
  midia_path: string | null;
  midia_mime: string | null;
  midia_nome: string | null;
  duracao: number | null;
  midias: Midia[];
} {
  const primeira = midias[0];
  return {
    tipo: primeira ? primeira.tipo : "texto",
    midia_path: primeira?.path ?? null,
    midia_mime: primeira?.mime ?? null,
    midia_nome: primeira?.nome ?? null,
    duracao: primeira?.duracao ?? null,
    midias,
  };
}

/**
 * A lista de anexos de uma linha, aceitando as duas formas.
 *
 * Linhas antigas têm só `midia_path`; linhas novas têm `midias`. Quem desenha a
 * tela não deveria precisar saber de qual época é a linha que recebeu.
 */
export function midiasDaLinha(linha: {
  midias?: unknown;
  midia_path?: string | null;
  midia_mime?: string | null;
  midia_nome?: string | null;
  duracao?: number | null;
  tipo?: string | null;
}): Midia[] {
  const lista = Array.isArray(linha.midias) ? (linha.midias as Midia[]) : [];
  if (lista.length > 0) return lista.filter((m) => m && typeof m.path === "string");
  if (linha.midia_path) {
    return [{
      path: linha.midia_path,
      mime: linha.midia_mime || "application/octet-stream",
      nome: linha.midia_nome || "arquivo",
      tipo: (linha.tipo as TipoRetido) || tipoDoMime(linha.midia_mime || ""),
      duracao: linha.duracao ?? null,
    }];
  }
  return [];
}
