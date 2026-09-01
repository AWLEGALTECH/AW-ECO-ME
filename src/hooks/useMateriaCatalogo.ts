// O CATÁLOGO DE MATÉRIAS, DO BANCO PRA TELA.
//
// A leitura da matéria — quebrar o texto composto em rubricas — mora no banco,
// numa função só. Aqui a tela apenas pega o vocabulário pra saber COMO exibir o
// que já veio classificado: o rótulo de cada rubrica, a família e o grupo do
// Writer.
//
// Nenhuma regra de classificação passa por aqui de propósito. Uma cópia do
// leitor em TypeScript e outra em SQL divergiriam sem ninguém perceber, e a
// tela passaria a mostrar uma coisa enquanto a estatística conta outra.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MateriaChave {
  chave: string;
  rotulo: string;
  familia: "bancaria" | "fazenda" | "trabalhista" | "consumo" | "civel";
  grupo_writer: string | null;
  ordem: number;
}

const FAMILIA_ROTULO: Record<string, string> = {
  bancaria: "Bancário",
  fazenda: "Fazenda pública",
  trabalhista: "Trabalhista",
  consumo: "Consumo",
  civel: "Cível",
};

export function useMateriaCatalogo() {
  const { data = [] } = useQuery({
    queryKey: ["materias-catalogo"],
    // o catálogo quase não muda; não vale rebuscar a cada tela
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase.from("materias_catalogo" as never) as never as any)
        .select("chave, rotulo, familia, grupo_writer, ordem").order("ordem");
      if (error) throw error;
      return (data || []) as MateriaChave[];
    },
  });

  const porChave = new Map(data.map((m) => [m.chave, m]));

  /**
   * Como a ficha deve anunciar a matéria de um processo.
   *
   * O TÍTULO É O GRUPO DO WRITER quando todas as rubricas do processo cabem no
   * mesmo grupo — o caso de "BX ANT FINAN/PARC CRED/GASTOS CARTÃO", que é
   * inteiro Débitos Automáticos. Misturando grupos, o título vira a família
   * ("Bancário"), porque anunciar um dos grupos esconderia o outro.
   *
   * Sem nada reconhecido, devolve o texto original: melhor mostrar o que foi
   * digitado do que apagar a informação por não saber lê-la.
   */
  const lerMateria = (chaves: string[] | null | undefined, textoOriginal?: string | null) => {
    const rubricas = (chaves ?? [])
      .map((c) => porChave.get(c))
      .filter((m): m is MateriaChave => !!m)
      .sort((a, b) => a.ordem - b.ordem);

    if (rubricas.length === 0) {
      return { titulo: textoOriginal?.trim() || "Matéria não informada", rubricas: [], grupo: null as string | null };
    }

    const grupos = [...new Set(rubricas.map((r) => r.grupo_writer).filter(Boolean))] as string[];
    const familias = [...new Set(rubricas.map((r) => r.familia))];

    const titulo = grupos.length === 1 && rubricas.every((r) => r.grupo_writer === grupos[0])
      ? grupos[0]
      : familias.length === 1
        ? FAMILIA_ROTULO[familias[0]] ?? familias[0]
        : "Matérias diversas";

    // Com uma rubrica só e nome de grupo igual ao dela, a lista embaixo seria
    // eco do título. Nesse caso ela some.
    const listar = !(rubricas.length === 1 && titulo === rubricas[0].rotulo);

    return { titulo, rubricas: listar ? rubricas : [], grupo: grupos.length === 1 ? grupos[0] : null };
  };

  return { catalogo: data, porChave, lerMateria, FAMILIA_ROTULO };
}
