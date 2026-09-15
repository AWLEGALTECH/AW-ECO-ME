/* A PRÉVIA DE UM LINK, DO LADO DO NAVEGADOR.
 *
 * Primeiro olha o cache no banco (`wa_link_previa`); se não houver, pede à
 * função `link-previa` para buscar. A ordem importa: a esmagadora maioria dos
 * links de uma conversa já foi vista, e ir direto à função faria o sistema
 * bater num site de terceiro toda vez que alguém rolasse a conversa para cima.
 *
 * NADA DISSO SEGURA A BOLHA. O texto e o link clicável aparecem na hora; o
 * cartão entra depois, se vier. Prévia é enfeite, e enfeite não atrasa conversa.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const tabela = (nome: string) => (supabase.from(nome as never) as never as any);

export interface PreviaDeLink {
  titulo: string | null;
  descricao: string | null;
  imagem: string | null;
  site: string | null;
  erro: string | null;
}

export function usePreviaDeLink(href: string | null, ligado = true) {
  return useQuery({
    queryKey: ["wa", "link-previa", href],
    enabled: !!href && ligado,
    /* Uma vez por sessão basta: a prévia de um link não muda enquanto a pessoa
       está com a conversa aberta, e refazer a pergunta a cada foco de janela
       seria gastar chamada para ver a mesma coisa. */
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
    queryFn: async (): Promise<PreviaDeLink | null> => {
      const url = href!;

      const { data: guardada } = await tabela("wa_link_previa")
        .select("titulo, descricao, imagem, site, erro")
        .eq("url", url).maybeSingle();
      if (guardada) return guardada as PreviaDeLink;

      const { data, error } = await supabase.functions.invoke("link-previa", { body: { url } });
      /* Falhou a chamada? Devolve nulo, e nulo é "sem cartão". A conversa não
         pode ganhar um aviso de erro porque um enfeite não carregou. */
      if (error || !data || data.ok === false) return null;
      return (data.previa ?? null) as PreviaDeLink | null;
    },
  });
}
