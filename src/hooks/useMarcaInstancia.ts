/* A ETIQUETA DE CADA NÚMERO — a sigla e a cor do selo.
 *
 * As duas nasceram derivadas: as iniciais do nome e uma cor tirada de um hash.
 * Isso resolve o arranque (número novo já tem etiqueta, sem ninguém configurar)
 * e não resolve a convivência: um hash distribui bem e não sabe o que aquele
 * número significa, e as iniciais não têm como saber que "Dr. Matheus Enes
 * Corporativo" é chamado de ECO por quem usa.
 *
 * O AUTOMÁTICO CONTINUA SENDO O PADRÃO. Esta tabela pode ficar vazia para
 * sempre: sem linha, a tela deriva do nome como sempre derivou. A linha só
 * existe onde alguém discordou — e é por isso que ela é uma tabela à parte, e
 * não colunas em `wa_instancias`: aquela é espelho da Evolution, reescrito a
 * cada sincronização, e escolha de gente não mora em espelho.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { NomeDeCor } from "@/lib/instancias";

const tabela = (nome: string) => (supabase.from(nome as never) as never as any);

export interface MarcaDeInstancia {
  instancia: string;
  apelido: string | null;
  cor: NomeDeCor | null;
  /* Como este número se chama NESTA TELA. O nome da Evolution continua sendo a
     chave de tudo — conversa, webhook, despacho —; isto é só rótulo, e nada no
     sistema procura por ele. */
  nome_exibido: string | null;
}

/** As marcas de todos os números, por nome em minúsculas. */
export type MarcasPorNumero = Record<string, MarcaDeInstancia>;

export function useMarcasDeInstancia() {
  return useQuery({
    queryKey: ["wa", "instancias", "marcas"],
    staleTime: 60_000,
    /* ⚠️ RECORD, E NUNCA MAP. O cache do React Query é gravado em localStorage
       como JSON, e `Map` não sobrevive: vira `{}` no rehydrate. O sintoma é a
       página caindo com "t.get is not a function" — e só DEPOIS de recarregar,
       o que faz o defeito passar batido em qualquer teste feito na mesma
       sessão em que o código foi escrito. */
    queryFn: async (): Promise<MarcasPorNumero> => {
      const { data, error } = await tabela("wa_instancia_marca")
        .select("instancia, apelido, cor, nome_exibido");
      if (error) throw error;
      const m: MarcasPorNumero = {};
      for (const r of (data || []) as MarcaDeInstancia[]) {
        m[String(r.instancia ?? "").trim().toLowerCase()] = r;
      }
      return m;
    },
  });
}

export function useInvalidarMarcas() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["wa", "instancias", "marcas"] });
}

export const marcaDe = (
  marcas: MarcasPorNumero | undefined, instancia: string | null | undefined,
): MarcaDeInstancia | undefined =>
  marcas && instancia ? marcas[instancia.trim().toLowerCase()] : undefined;

/**
 * Grava a etiqueta de um número.
 *
 * Sigla vazia volta ao automático em vez de gravar string vazia: "apagar o que
 * escrevi" e "quero um selo em branco" são pedidos diferentes, e só o primeiro
 * faz sentido num selo que existe pra identificar.
 */
export async function salvarMarcaDeInstancia(args: {
  instancia: string;
  apelido: string | null;
  cor: NomeDeCor | null;
  nomeExibido?: string | null;
  por?: string | null;
}) {
  const { error } = await tabela("wa_instancia_marca").upsert({
    instancia: args.instancia,
    apelido: args.apelido?.trim().slice(0, 6) || null,
    cor: args.cor,
    // Nome vazio também volta ao automático: apagar o rótulo é pedir o nome
    // técnico de volta, não pedir um número sem nome.
    nome_exibido: args.nomeExibido?.trim().slice(0, 60) || null,
    atualizado_por: args.por ?? null,
  }, { onConflict: "instancia" });
  if (error) throw new Error(error.message);
}

/**
 * O nome de um número na tela: o escolhido, ou o da Evolution.
 *
 * Só rótulo. Toda comparação, filtro e chamada continua usando o nome real —
 * misturar os dois faria uma conversa não achar o próprio número no dia em que
 * alguém renomeasse, e o sintoma seria uma caixa vazia sem explicação.
 */
export const nomeNaTela = (
  marcas: MarcasPorNumero | undefined, instancia: string | null | undefined,
): string => marcaDe(marcas, instancia)?.nome_exibido?.trim() || (instancia ?? "");
