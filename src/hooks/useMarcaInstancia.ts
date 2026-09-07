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
}

/** As marcas de todos os números, por nome em minúsculas. */
export function useMarcasDeInstancia() {
  return useQuery({
    queryKey: ["wa", "instancias", "marcas"],
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, MarcaDeInstancia>> => {
      const { data, error } = await tabela("wa_instancia_marca")
        .select("instancia, apelido, cor");
      if (error) throw error;
      const m = new Map<string, MarcaDeInstancia>();
      for (const r of (data || []) as MarcaDeInstancia[]) {
        m.set(String(r.instancia ?? "").trim().toLowerCase(), r);
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
  mapa: Map<string, MarcaDeInstancia> | undefined, instancia: string | null | undefined,
): MarcaDeInstancia | undefined =>
  mapa && instancia ? mapa.get(instancia.trim().toLowerCase()) : undefined;

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
  por?: string | null;
}) {
  const apelido = args.apelido?.trim().slice(0, 6) || null;
  const { error } = await tabela("wa_instancia_marca").upsert({
    instancia: args.instancia,
    apelido,
    cor: args.cor,
    atualizado_por: args.por ?? null,
  }, { onConflict: "instancia" });
  if (error) throw new Error(error.message);
}
