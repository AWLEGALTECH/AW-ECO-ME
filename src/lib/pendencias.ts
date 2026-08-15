import { supabase } from "@/integrations/supabase/client";

// Catálogo de tipos de pendência. A chave bate com demandas.pendencia_tipo.
export const TIPOS_PENDENCIA = [
  { key: "comprovante_residencia", label: "Comprovante de residência no nome" },
  { key: "extratos_bancarios",     label: "Extratos bancários" },
  { key: "contrato_drive",         label: "Contrato no drive" },
  { key: "rg",                     label: "RG" },
  { key: "cpf",                    label: "CPF" },
  { key: "procuracao",             label: "Procuração assinada" },
  { key: "personalizada",          label: "Outro (personalizada)" },
] as const;
export type TipoPendencia = typeof TIPOS_PENDENCIA[number]["key"];

export const rotuloPendencia = (k: string) =>
  TIPOS_PENDENCIA.find((x) => x.key === k)?.label ?? k;

// Cria uma demanda `pendencia_documental` por tipo selecionado.
//
// É esta demanda que trava o cliente na esteira: `clientesComPendencia`
// (Esteira.tsx) marca como bloqueada TODA demanda de um cliente que tenha
// pendência em aberto — vinculadas, artesanais e peças prontas ficam com
// cadeado e ação desabilitada. Resolver a pendência libera tudo sozinho.
export async function criarPendencias(opts: {
  clienteId: string;
  tipos: TipoPendencia[];
  custom?: string;
  userId: string | null;
}): Promise<{ error: string | null; qtd: number }> {
  const { clienteId, tipos, custom, userId } = opts;
  if (!tipos.length) return { error: "Selecione ao menos um tipo de pendência.", qtd: 0 };
  if (tipos.includes("personalizada") && !custom?.trim()) {
    return { error: "Descreva a pendência personalizada.", qtd: 0 };
  }
  const rows = tipos.map((t) => ({
    cliente_id: clienteId,
    tipo: "pre_protocolo",
    etapa: "pendencia_documental",
    status: "pendente",
    titulo: t === "personalizada"
      ? `Pendência: ${(custom || "").trim().slice(0, 80)}`
      : `Pendência: ${rotuloPendencia(t)}`,
    descricao: t === "personalizada" ? (custom || "").trim() : null,
    pendencia_tipo: t,
    created_by: userId,
  }));
  const { error } = await supabase.from("demandas" as never).insert(rows as never);
  return { error: error?.message ?? null, qtd: rows.length };
}
