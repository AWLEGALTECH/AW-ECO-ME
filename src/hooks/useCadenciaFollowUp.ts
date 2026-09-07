/* A RÉGUA AJUSTÁVEL, do lado do navegador.
 *
 * De quantos em quantos dias cobrar quem sumiu não é uma constante do sistema:
 * é uma decisão do escritório, e ela muda com o mês. Estava escrita em `const`,
 * o que significava que mudá-la custava um deploy — e por custar um deploy,
 * nunca mudava.
 *
 * QUEM MANDA CONTINUA SENDO O BANCO. `fn_wa_cadencia()` lê da mesma tabela, e é
 * ela que agenda a próxima cobrança quando alguém conclui uma. Isto aqui é só a
 * leitura da tela: mudar o número na tela muda a fila de amanhã porque os dois
 * lados olham a mesma linha, não porque a tela avisou o banco.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CADENCIA, reguaValida, TOTAL_RODADAS, type Regua } from "@/lib/followUp";

const tabela = (nome: string) => (supabase.from(nome as never) as never as any);

export interface DegrauDaRegua {
  instancia: string;
  rodada: number;
  dias: number;
  updated_at: string;
  atualizado_por: string | null;
}

/**
 * A régua em uso, sempre com as cinco rodadas.
 *
 * O `select` devolve o array já completado pelo padrão: quem consome não pode
 * ter que decidir o que fazer com uma régua de três degraus, e a alternativa
 * (não mostrar nada) esconderia a fila do dia por causa de uma linha faltando.
 */
/**
 * TODAS as réguas de uma vez, num mapa por número.
 *
 * Uma consulta só, e não uma por número, porque a tela precisa de várias ao
 * mesmo tempo e não sabe de antemão quantas: a fila de follow-up mostra leads
 * de todos os números escolhidos, e cada cartão tem que dizer o degrau DA
 * RÉGUA DELE. Com um hook por número isso viraria hook dentro de laço, que o
 * React não permite; com o mapa, é uma leitura e um `get`.
 *
 * A tabela inteira cabe numa consulta: são cinco linhas por número.
 */
/** As réguas por número, em minúsculas. Objeto simples, e não Map — ver abaixo. */
export type ReguasPorNumero = Record<string, number[]>;

export function useCadencias() {
  return useQuery({
    queryKey: ["wa", "followup", "cadencias"],
    // Como as mensagens padrão: isto muda quando alguém decide mudar, não com
    // o tempo. Recarregar sozinho seria consulta ao banco pra não ver diferença.
    staleTime: 60_000,
    /* ⚠️ RECORD, E NUNCA MAP. O cache do React Query é gravado em localStorage
       como JSON (PersistQueryClientProvider), e `Map` não sobrevive à ida e
       volta: ele vira `{}` no rehydrate. O sintoma não é uma lista vazia, é a
       página inteira caindo com "t.get is not a function" no primeiro
       carregamento depois de um recarregar — e só depois de um recarregar, o
       que faz o defeito não aparecer em nenhum teste na primeira sessão.
       Já mordeu esta base duas vezes antes (Esteira, Publicações). */
    queryFn: async (): Promise<ReguasPorNumero> => {
      const { data, error } = await tabela("wa_followup_cadencia")
        .select("instancia, rodada, dias").order("instancia").order("rodada");
      if (error) throw error;

      const porNumero: Record<string, number[]> = {};
      for (const l of (data || []) as DegrauDaRegua[]) {
        if (l.rodada < 1 || l.rodada > TOTAL_RODADAS) continue;
        const chave = (l.instancia ?? "").trim().toLowerCase();
        const dias = porNumero[chave] ?? [];
        dias[l.rodada - 1] = l.dias;
        porNumero[chave] = dias;
      }

      const fora: ReguasPorNumero = {};
      for (const chave of Object.keys(porNumero)) fora[chave] = [...reguaValida(porNumero[chave])];
      return fora;
    },
  });
}

/**
 * A régua de um número.
 *
 * Número sem linha própria devolve o padrão de fábrica — número recém-ligado
 * já nasce cobrando, em vez de nascer sem régua nenhuma. A chave é minúscula
 * porque o nome vem digitado à mão da Evolution e ninguém garante a caixa.
 */
export function reguaDoNumero(
  reguas: ReguasPorNumero | undefined, instancia: string | null | undefined,
): Regua {
  if (!reguas || !instancia) return CADENCIA;
  return reguas[instancia.trim().toLowerCase()] ?? CADENCIA;
}

/** A régua gravada de um número, já completada pelo padrão. */
async function lerCadencia(instancia: string): Promise<number[]> {
  const { data, error } = await tabela("wa_followup_cadencia")
    .select("rodada, dias").ilike("instancia", instancia).order("rodada");
  if (error) throw new Error(error.message);
  const dias: number[] = [];
  for (const l of (data || []) as DegrauDaRegua[]) {
    if (l.rodada >= 1 && l.rodada <= TOTAL_RODADAS) dias[l.rodada - 1] = l.dias;
  }
  return [...reguaValida(dias)];
}

export function useInvalidarCadencia() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["wa", "followup", "cadencias"] });
}

/**
 * Muda o degrau de uma rodada.
 *
 * A ORDEM É COBRADA PELO BANCO, por um gatilho, e não aqui: a tela é um dos
 * lugares de onde essa linha pode ser escrita, e a regra que sustenta o
 * agendamento não pode morar só no lugar mais fácil de contornar. O que sobra
 * aqui é traduzir a recusa para uma frase que se entenda sem saber o que é
 * `check_violation`.
 */
export async function salvarDegrauDaRegua(
  instancia: string, rodada: number, dias: number, por?: string | null,
) {
  if (!Number.isFinite(dias) || dias < 1 || dias > 365) {
    throw new Error("O degrau precisa estar entre 1 e 365 dias.");
  }
  if (!instancia) throw new Error("Escolha o número antes de mexer na régua.");

  /* A RÉGUA DE UM NÚMERO PRECISA EXISTIR INTEIRA PRA MUDAR UM DEGRAU. Números
     sem linha própria funcionam com o padrão de fábrica, e mexer só no degrau 2
     criaria uma régua de UM degrau — que o banco leria como a régua toda, e a
     cobrança pararia na primeira rodada. Então o primeiro ajuste materializa os
     cinco, e o resto continua igual ao que já valia. */
  const atuais = await lerCadencia(instancia);
  const linhas = atuais.map((d, i) => ({
    instancia,
    rodada: i + 1,
    dias: i + 1 === rodada ? Math.round(dias) : d,
    atualizado_por: por ?? null,
  }));

  const { error } = await tabela("wa_followup_cadencia")
    .upsert(linhas, { onConflict: "instancia,rodada" });
  if (error) {
    throw new Error(/precisa subir|check/i.test(error.message)
      ? "Cada rodada tem que esperar mais dias que a anterior."
      : error.message);
  }
}
