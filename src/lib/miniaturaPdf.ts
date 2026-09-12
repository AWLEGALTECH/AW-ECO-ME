/* A PRIMEIRA PÁGINA DO PDF, PEQUENA, PARA A PESSOA SABER O QUE ESTÁ ESCOLHENDO.
 *
 * Na hora de escolher quais documentos ler, a lista mostrava "Documento" e uma
 * hora. Isso não é escolha, é sorteio: o WhatsApp batiza tudo com uuid, e três
 * PDFs da mesma conversa são três retângulos iguais. Quem está do lado de cá
 * precisa BATER O OLHO e ver que aquele é o RG e aquele outro é a conta de luz.
 *
 * Foto resolve sozinha, é só a tag de imagem. PDF não: ele precisa ser
 * desenhado. O pdf.js já está no projeto (o Spy usa para extrair texto de
 * extrato) e com o worker empacotado pelo Vite, sem rede externa, então
 * desenhar a primeira página numa tela de cem pixels é barato e não acrescenta
 * dependência nenhuma.
 *
 * SÓ A PRIMEIRA PÁGINA. Documento de identificação tem uma; extrato tem trinta
 * e a primeira já diz que é extrato. Desenhar o resto seria gastar memória para
 * mostrar o que ninguém vai olhar num quadrado desse tamanho.
 */

/**
 * Quanto encolher a página para caber na largura pedida.
 *
 * O pdf.js mede a página em pontos na escala 1. Um A4 em retrato dá 595, então
 * uma miniatura de 120 pede escala perto de 0,2.
 *
 * NUNCA AUMENTA. Página estreita (um comprovante de meia folha) ficaria borrada
 * e ocuparia mais memória para mostrar menos: o teto de 1 é o que impede isso.
 * E há um piso, porque escala zero devolve uma tela de zero pixel e o navegador
 * reclama em vez de desenhar.
 */
export function escalaDaMiniatura(larguraDaPagina: number, larguraAlvo: number): number {
  if (!Number.isFinite(larguraDaPagina) || larguraDaPagina <= 0) return 1;
  const alvo = Number.isFinite(larguraAlvo) && larguraAlvo > 0 ? larguraAlvo : 120;
  return Math.min(1, Math.max(0.05, alvo / larguraDaPagina));
}

/* O PDF.JS E O WORKER DELE, carregados só quando alguém abre a escolha.
 *
 * O import é dinâmico para o pdf.js não entrar no pacote principal: ele é
 * pesado e a maioria das telas nunca desenha PDF nenhum.
 *
 * E O WORKER PRECISA SER LIGADO AQUI. O `pdfText.ts` também liga o dele, mas no
 * topo do módulo, e quem importa aquele arquivo é o Spy. A tela de atendimento
 * nunca passa por lá, então sem estas linhas o pdf.js subiria sem worker e as
 * miniaturas falhariam caladas, que é o pior jeito de falhar: a lista fica com
 * o ícone genérico e ninguém descobre por quê.
 *
 * Uma vez só, guardada na promessa: doze PDFs não carregam doze workers. */
let pdfjsPronto: Promise<typeof import("pdfjs-dist")> | null = null;

function carregarPdfjs() {
  if (!pdfjsPronto) {
    pdfjsPronto = (async () => {
      const pdfjs = await import("pdfjs-dist");
      if (!pdfjs.GlobalWorkerOptions.workerPort && !pdfjs.GlobalWorkerOptions.workerSrc) {
        // Empacotado pelo Vite, sem CDN e sem rede externa.
        const { default: PdfWorker } = await import("pdfjs-dist/build/pdf.worker.min.mjs?worker");
        pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
      }
      return pdfjs;
    })();
  }
  return pdfjsPronto;
}

/**
 * A primeira página do PDF como `data:image/...`, pronta para uma tag de imagem.
 *
 * Devolve vazio quando não dá (arquivo corrompido, senha, rede caída). Sem
 * exceção para cima: a lista mostra o ícone de sempre e a escolha continua
 * possível. Miniatura é conforto, não é requisito.
 */
export async function miniaturaDoPdf(url: string, larguraAlvo = 120): Promise<string> {
  try {
    const pdfjs = await carregarPdfjs();
    const doc = await pdfjs.getDocument({ url }).promise;
    try {
      const pagina = await doc.getPage(1);
      const escala = escalaDaMiniatura(pagina.getViewport({ scale: 1 }).width, larguraAlvo);
      const vista = pagina.getViewport({ scale: escala });

      const tela = document.createElement("canvas");
      tela.width = Math.max(1, Math.floor(vista.width));
      tela.height = Math.max(1, Math.floor(vista.height));
      const pincel = tela.getContext("2d");
      if (!pincel) return "";

      /* Fundo branco antes de desenhar: PDF de scanner costuma vir com fundo
         transparente, e sem isto a miniatura fica preta no tema escuro. */
      pincel.fillStyle = "#fff";
      pincel.fillRect(0, 0, tela.width, tela.height);

      await pagina.render({ canvasContext: pincel, viewport: vista }).promise;
      // JPEG e não PNG: é foto escaneada, e o PNG dela sai cinco vezes maior.
      return tela.toDataURL("image/jpeg", 0.72);
    } finally {
      // Sem isto o worker segura o arquivo inteiro na memória, e são doze.
      void doc.destroy();
    }
  } catch {
    return "";
  }
}
