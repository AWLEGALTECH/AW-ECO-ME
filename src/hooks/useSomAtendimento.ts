// O TOCADOR DA CAIXA — e as três armadilhas que ele evita.
//
// 1. NÃO TOCA O PASSADO. Abrir o Atendimento carrega as mensagens que já
//    existiam; sem cuidado, a tela dispararia uma salva de bipes pelo histórico
//    inteiro. A primeira leitura de cada conversa é só memorizada, nunca soada.
//
// 2. NÃO TOCA EM RAJADA. A lista recarrega de cinco em cinco segundos e pode
//    trazer três mensagens de uma vez. Três bipes juntos viram um ruído único e
//    feio; um só, do evento mais importante, diz a mesma coisa melhor.
//
// 3. NÃO ESTOURA QUANDO O NAVEGADOR RECUSA. Áudio antes do primeiro clique da
//    pessoa na página é bloqueado — isso é a regra, não um erro. Tudo aqui
//    falha em silêncio: um bipe não pode derrubar a conversa.
//
// O BOTÃO DE MUDO MORA NO NAVEGADOR, não no banco: é preferência de quem está
// sentado naquela mesa naquele momento, não da conta. Quem atende com fone e
// quem atende numa sala com cliente na frente querem coisas opostas.

import { useCallback, useEffect, useRef, useState } from "react";
import { somDaMensagem, tocar, type SomAtendimento } from "@/lib/somAtendimento";

const CHAVE_MUDO = "aw:atendimento:mudo";

/** Uma conversa vista pelo tocador: o que ele precisa pra decidir. */
export type SinalDeMensagem = {
  conversaId: string;
  /** carimbo da última mensagem daquela conversa */
  em: string | null;
  /** de quem foi a última: "entrada" (o lead) ou "saida" (nós) */
  direcao: string | null;
};

export function useSomAtendimento(conversaAberta: string | null) {
  const [mudo, setMudo] = useState(() => {
    try { return localStorage.getItem(CHAVE_MUDO) === "1"; } catch { return false; }
  });

  const ctx = useRef<AudioContext | null>(null);
  /** o último carimbo já contabilizado de cada conversa */
  const visto = useRef<Map<string, string>>(new Map());
  /** a primeira leitura só memoriza — ver armadilha 1 */
  const primeiraLeitura = useRef(true);

  /* O NAVEGADOR SÓ LIBERA ÁUDIO DEPOIS DE UM CLIQUE, e isso derrubou a primeira
     versão inteira: o contexto nascia dentro de um efeito, longe de qualquer
     gesto, e ficava suspenso pra sempre. Não dava erro — só não saía som, que é
     o pior jeito de falhar.
     Aqui o primeiro clique EM QUALQUER LUGAR da página acorda o contexto, uma
     vez só. O ouvinte se remove sozinho depois disso. */
  useEffect(() => {
    const acordar = () => {
      try {
        ctx.current ??= new AudioContext();
        if (ctx.current.state === "suspended") void ctx.current.resume();
      } catch { /* sem áudio neste navegador */ }
    };
    window.addEventListener("pointerdown", acordar, { once: true });
    window.addEventListener("keydown", acordar, { once: true });
    return () => {
      window.removeEventListener("pointerdown", acordar);
      window.removeEventListener("keydown", acordar);
    };
  }, []);

  const soar = useCallback((som: SomAtendimento, ignorarMudo = false) => {
    if (mudo && !ignorarMudo) return;
    try {
      ctx.current ??= new AudioContext();
      if (ctx.current.state === "suspended") {
        // `resume` é assíncrono: tocar antes dele terminar não produz som
        // nenhum. Por isso o som espera a promessa, em vez de sair no vazio.
        void ctx.current.resume().then(() => { if (ctx.current) tocar(som, ctx.current); }).catch(() => {});
        return;
      }
      tocar(som, ctx.current);
    } catch { /* navegador recusou: seguir sem som */ }
  }, [mudo]);

  /* Ligar o som TOCA UMA AMOSTRA. É um clique de verdade, então serve de
     destravamento; e é a única forma de alguém saber que o som está funcionando
     sem depender de um cliente escrever naquele instante. */
  const alternarMudo = useCallback(() => {
    setMudo((m) => {
      const novo = !m;
      try { localStorage.setItem(CHAVE_MUDO, novo ? "1" : "0"); } catch { /* modo privado */ }
      if (!novo) soar("recebida-fechada", true);
      return novo;
    });
  }, [soar]);

  /**
   * Recebe o retrato atual das conversas e toca o que houver de novo.
   *
   * Devolve o som tocado (ou null), o que torna o comportamento observável de
   * fora — em teste e na depuração — em vez de um efeito colateral invisível.
   */
  const aoAtualizar = useCallback((sinais: SinalDeMensagem[]): SomAtendimento | null => {
    const novos: SomAtendimento[] = [];

    for (const s of sinais) {
      if (!s.em) continue;
      const anterior = visto.current.get(s.conversaId);
      visto.current.set(s.conversaId, s.em);
      if (primeiraLeitura.current) continue;              // armadilha 1

      // CONVERSA QUE NÃO EXISTIA É MENSAGEM NOVA, e essa é a mais importante de
      // todas: um lead escrevendo pela PRIMEIRA vez. A versão anterior exigia
      // um carimbo anterior pra comparar e, sem ele, ficava calada — perdia
      // justamente o caso que ninguém pode perder.
      const nova = anterior === undefined || anterior < s.em;
      if (!nova) continue;

      const som = somDaMensagem({
        direcao: s.direcao ?? "",
        conversaId: s.conversaId,
        conversaAberta,
      });
      if (som) novos.push(som);
    }

    if (primeiraLeitura.current) { primeiraLeitura.current = false; return null; }
    if (novos.length === 0) return null;

    // Armadilha 2: um som só, o de maior peso. Notícia ganha de confirmação.
    const ordem: SomAtendimento[] = ["recebida-fechada", "recebida-aberta", "enviada"];
    const escolhido = ordem.find((o) => novos.includes(o)) ?? novos[0];
    soar(escolhido);
    return escolhido;
  }, [conversaAberta, soar]);

  return { mudo, alternarMudo, aoAtualizar, soar };
}
