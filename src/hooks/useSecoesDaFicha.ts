/* QUAIS SEÇÕES DA FICHA FICAM ABERTAS.
 *
 * A ficha do cliente juntou muita coisa: origem, follow-up, dossiê, jornada,
 * lembretes, programadas, notas, a trava. Todas justificadas uma a uma, e
 * juntas viram uma coluna que se rola inteira pra achar a etapa. O remédio não é
 * tirar informação — é deixar cada um fechar o que não usa.
 *
 * ─────────────────── por que a escolha vale pra TODAS as conversas ──────────
 *
 * Guardar por conversa pareceria mais flexível e seria pior de duas formas.
 * Primeiro porque ninguém quer isso: quem fecha "Programadas" fechou porque não
 * usa Programadas, e não porque não usa Programadas DAQUELE cliente. Segundo
 * porque a ficha passaria a mudar de forma a cada conversa aberta — o olho
 * perde a referência de onde as coisas estão, que é justamente o que uma ficha
 * precisa ter.
 *
 * NO NAVEGADOR, E NÃO NA CONTA. É preferência de quem está sentado ali: quem
 * atende de monitor grande deixa tudo aberto, quem atende de notebook fecha
 * metade. Sincronizar isso entre máquinas seria impor a escolha de uma mesa na
 * outra.
 */
import { useCallback, useEffect, useState } from "react";

/** As seções que se pode fechar. A ordem aqui é a ordem na tela. */
export const SECOES_DA_FICHA = [
  "dossie", "followup", "jornada", "lembretes", "programadas", "notas",
] as const;

export type SecaoDaFicha = (typeof SECOES_DA_FICHA)[number];

const CHAVE = "aw:atendimento:ficha:fechadas";

/**
 * O conjunto de seções FECHADAS.
 *
 * Guardamos o que está fechado, e não o que está aberto, e isso não é detalhe:
 * seção nova nasce ABERTA para quem já usava o sistema. Com a lista de abertas,
 * qualquer seção que eu adicionar amanhã nasceria escondida para todo mundo que
 * já tem uma preferência gravada — e ninguém descobriria que ela existe.
 */
export function useSecoesDaFicha() {
  const [fechadas, setFechadas] = useState<Set<string>>(() => {
    try {
      const bruto = localStorage.getItem(CHAVE);
      return new Set<string>(bruto ? JSON.parse(bruto) : []);
    } catch { return new Set<string>(); }
  });

  /* Duas abas abertas no mesmo navegador continuam iguais. Sem isto, fechar
     uma seção numa aba e voltar pra outra mostraria duas fichas diferentes com
     a mesma preferência gravada — e a segunda sobrescreveria a primeira no
     próximo clique. */
  useEffect(() => {
    const ouvir = (e: StorageEvent) => {
      if (e.key !== CHAVE) return;
      try { setFechadas(new Set<string>(e.newValue ? JSON.parse(e.newValue) : [])); }
      catch { /* valor estranho: fica como está */ }
    };
    window.addEventListener("storage", ouvir);
    return () => window.removeEventListener("storage", ouvir);
  }, []);

  const alternar = useCallback((secao: SecaoDaFicha) => {
    setFechadas((antes) => {
      const nova = new Set(antes);
      if (nova.has(secao)) nova.delete(secao); else nova.add(secao);
      try { localStorage.setItem(CHAVE, JSON.stringify([...nova])); } catch { /* sem storage, vale nesta sessão */ }
      return nova;
    });
  }, []);

  const aberta = useCallback((secao: SecaoDaFicha) => !fechadas.has(secao), [fechadas]);

  return { aberta, alternar };
}
