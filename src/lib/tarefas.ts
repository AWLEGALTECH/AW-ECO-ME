// Edição de tarefa, nos dois lugares onde ela aparece.
//
// A tarefa mora dentro de `processos.linha_temporal` (jsonb: etapas → tasks),
// e não numa tabela própria. Isso significa que editar uma tarefa é reescrever
// o documento inteiro do processo, e que os dois lugares que editam precisam
// concordar sobre COMO reescrever. É o que este arquivo guarda.
//
// Endereço da tarefa: processo + etapa + POSIÇÃO na etapa. Não o id. O id é um
// contador que já duplicou no passado (ver a migration de ids duplicados), e
// mesmo corrigido continua sendo um dado que a tarefa carrega, não uma chave
// que o documento garante. A posição, dentro de um documento que se lê inteiro
// e se grava inteiro, é exata.
//
// Quem persiste é o chamador, porque os dois contextos são diferentes: na
// linha temporal do processo existe estado local que já tem autosave, e
// escrever direto no banco brigaria com ele; na tela de Tarefas não existe
// estado nenhum, então lá o caminho é `salvarTarefaNoBanco`.

import type { Etapa, Task } from "@/components/ProcessoTimeline";

export interface EnderecoTarefa {
  processoId: string;
  etapaId: string;
  indice: number;
}

export type PatchTarefa = Partial<Pick<Task,
  "titulo" | "conteudo" | "prazo" | "status" | "tipo" | "desfecho" | "desfechoObs">>;

/**
 * Tarefa fora do processo: carrega de onde veio.
 *
 * `chave` existe porque o id da tarefa não serve de chave de lista: é um
 * contador por processo, e em linhas gravadas antes da correção do contador o
 * mesmo "t1" aparece duas vezes. Chave repetida faz o React reaproveitar o nó
 * errado e a lista congela numa ordem. Processo + etapa + posição é único.
 */
export interface ItemTarefa extends Task {
  chave: string;
  etapaId: string;
  indice: number;
  etapaTitulo: string;
  processoId: string;
  processoNumero: string;
  clienteNome: string | null;
}

/** Processo do jeito mínimo que o achatamento precisa. */
export interface ProcessoComTarefas {
  id: string;
  numero_processo: string;
  linha_temporal: unknown;
  clientes?: { nome: string } | null;
}

/**
 * Achata as tarefas de vários processos numa lista só, cada uma sabendo de onde
 * saiu. É o que a tela de Tarefas e a ficha do cliente consomem — nas duas, a
 * tarefa aparece fora da linha temporal e precisa carregar seu contexto junto.
 */
export function achatarTarefas(procs: ProcessoComTarefas[]): ItemTarefa[] {
  const out: ItemTarefa[] = [];
  for (const p of procs) {
    const lt = Array.isArray(p.linha_temporal) ? (p.linha_temporal as Etapa[]) : [];
    for (const e of lt) {
      (e.tasks ?? []).forEach((t, i) => {
        out.push({
          ...t,
          chave: `${p.id}::${e.id}::${i}::${t.id}`,
          etapaId: e.id, indice: i,
          etapaTitulo: e.titulo, processoId: p.id, processoNumero: p.numero_processo,
          clienteNome: p.clientes?.nome ?? null,
        });
      });
    }
  }
  return out;
}

/**
 * Aplica um patch (ou remove, com `null`) na tarefa endereçada. Função pura:
 * devolve uma linha temporal nova e não toca na recebida.
 *
 * Devolve `achou` junto porque endereço que não bate precisa ser reportado, e
 * comparar a saída com a entrada não serviria: `map` cria array novo sempre,
 * então a identidade seria diferente mesmo sem nada ter mudado.
 */
export function aplicarNaLinha(
  linha: Etapa[],
  { etapaId, indice }: Pick<EnderecoTarefa, "etapaId" | "indice">,
  patch: PatchTarefa | null,
): { linha: Etapa[]; achou: boolean } {
  let achou = false;
  const nova = linha.map((e) => {
    if (e.id !== etapaId) return e;
    const tasks = e.tasks ?? [];
    if (indice < 0 || indice >= tasks.length) return e;
    achou = true;
    return {
      ...e,
      tasks: patch === null
        ? tasks.filter((_, i) => i !== indice)
        : tasks.map((t, i) => (i === indice ? { ...t, ...patch } : t)),
    };
  });
  return { linha: nova, achou };
}

/**
 * Lê a linha temporal, aplica e grava. Para quem não tem estado local.
 *
 * É leitura-modificação-escrita sobre um jsonb, então duas edições realmente
 * simultâneas no mesmo processo dariam vitória à última. Com a equipe do
 * tamanho que é, o custo de resolver isso (bloqueio ou merge por campo) não se
 * paga; o que não se pode é gravar sem ler, que apagaria as outras tarefas.
 */
// Duas coisas nesta função, e as duas são deliberadas.
//
// O import é tardio porque o cliente monta na carga do módulo e depende de
// `localStorage`. No topo, ele arrastaria o browser inteiro pra dentro deste
// arquivo, e `aplicarNaLinha` — a parte pura, a que vale testar isolada —
// deixaria de rodar fora do navegador.
//
// E a tipagem é convertida à mão porque src/integrations/supabase/types.ts está
// desatualizado e não conhece a coluna `linha_temporal` (ProcessoDetail convive
// com o mesmo erro). Regerar é troca grande demais pra vir de carona aqui: o
// gerado tem 74 KB contra os 20 KB do versionado, e apertaria os tipos de todas
// as tabelas de uma vez. Então a conversão fica cercada e nomeada aqui, em vez
// de espalhada em `as any` pelo caminho.
type ProcessoComLinha = { linha_temporal: unknown };
const clienteProcessos = async () => {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase.from("processos") as unknown as {
    select: (cols: string) => {
      eq: (col: string, v: string) => {
        single: () => Promise<{ data: ProcessoComLinha | null; error: unknown }>;
      };
    };
    update: (patch: { linha_temporal: Etapa[] }) => {
      eq: (col: string, v: string) => Promise<{ error: unknown }>;
    };
  };
};

export async function salvarTarefaNoBanco(
  end: EnderecoTarefa,
  patch: PatchTarefa | null,
): Promise<{ ok: boolean; erro?: string }> {
  const tabela = await clienteProcessos();
  const { data, error } = await tabela
    .select("linha_temporal").eq("id", end.processoId).single();
  if (error || !data) return { ok: false, erro: "Não consegui ler o processo" };

  const linha = Array.isArray(data.linha_temporal) ? (data.linha_temporal as Etapa[]) : [];
  const { linha: nova, achou } = aplicarNaLinha(linha, end, patch);
  if (!achou) return { ok: false, erro: "Tarefa não encontrada no processo" };

  const { error: erroUpd } = await tabela
    .update({ linha_temporal: nova }).eq("id", end.processoId);
  if (erroUpd) return { ok: false, erro: "Não consegui salvar a alteração" };
  return { ok: true };
}
