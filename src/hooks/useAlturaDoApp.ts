/* A TELA DO CELULAR TEM QUE FICAR PARADA.
 *
 * No navegador do telefone, uma tela de altura `100dvh` com `overflow: hidden`
 * parece travada e não é. Duas coisas a movem, e as duas fazem o sistema deixar
 * de parecer aplicativo:
 *
 * 1. O TECLADO. Quando um campo recebe foco, o iOS NÃO encolhe a janela: ele
 *    empurra a página inteira pra cima para caber o teclado, e o cabeçalho, a
 *    caixa e a conversa sobem junto — some tudo pro alto e sobra um pedaço de
 *    tela cinza embaixo. É o "todo o aplicativo está subindo".
 *
 *    Quem sabe a altura REAL do que dá pra ver é a `visualViewport`, e não a
 *    janela: ela encolhe com o teclado nos dois sistemas. Amarrando a altura do
 *    app nela, o teclado passa a comer a altura do MIOLO — a barra de digitar
 *    encosta nele, o cabeçalho fica onde está, e o histórico só fica mais curto.
 *    Que é o comportamento de aplicativo.
 *
 * 2. A ROLAGEM ELÁSTICA. Puxar a lista além do fim faz o documento inteiro
 *    balançar. `overscroll-behavior` resolve isso no CSS; o que sobra aqui é o
 *    caso do iOS, que ainda rola a janela por conta própria ao focar um campo —
 *    e a única defesa é devolver ela pro zero quando isso acontece.
 *
 * O QUE ISTO NÃO FAZ é mexer no monitor. Lá `visualViewport.height` é igual à
 * altura da janela e nada muda: é a mesma conta, com o mesmo resultado.
 */
import { useEffect } from "react";

/** A altura visível de verdade, publicada como variável CSS. */
export function useAlturaDoApp() {
  useEffect(() => {
    const vv = window.visualViewport;
    const raiz = document.documentElement;

    const medir = () => {
      const altura = vv?.height ?? window.innerHeight;
      raiz.style.setProperty("--app-altura", `${Math.round(altura)}px`);

      /* O IOS ROLA A JANELA SOZINHO ao focar um campo, mesmo com o documento
         em `overflow: hidden` — e aí o topo do app fica acima da área visível.
         Devolver pro zero é o que segura o cabeçalho no lugar. Só quando
         precisa: um `scrollTo` a cada evento brigaria com a rolagem legítima
         de quem estiver com o dedo na tela. */
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };

    medir();

    /* `resize` cobre o teclado abrindo e fechando; `scroll` cobre o empurrão do
       iOS, que não redimensiona nada — só desloca. Sem o segundo, o cabeçalho
       ainda sobe no primeiro toque no campo de digitar. */
    vv?.addEventListener("resize", medir);
    vv?.addEventListener("scroll", medir);
    window.addEventListener("orientationchange", medir);

    return () => {
      vv?.removeEventListener("resize", medir);
      vv?.removeEventListener("scroll", medir);
      window.removeEventListener("orientationchange", medir);
    };
  }, []);
}
