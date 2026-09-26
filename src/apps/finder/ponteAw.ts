/* A PONTE DO FINDER COM O AW: tudo o que o Finder pede ao banco.
 *
 * O Finder de pacote falava com o Supabase com a chave pública escrita dentro
 * dele, e por isso o banco tinha portas abertas para `anon` (clientes,
 * demandas, o bucket das planilhas). Aqui tudo passa pelo cliente do AW, com o
 * login de quem está usando, e a RLS de sempre decide.
 *
 * O formato de cada gravação é o do pacote, campo por campo: é ele que a
 * esteira, a ficha do cliente e o Writer leem (docs/finder-contrato.md, 4.3).
 */
import { supabase } from "@/integrations/supabase/client";

export interface ClienteDaLista { id: string; nome: string; cpf_cnpj: string | null; drive_folder_url?: string | null }
export interface ArquivoDoDrive { id: string; name: string; mimeType?: string; size?: string }

export interface NovaVinculada {
  clienteId: string;
  /** o nome da rubrica, ou várias unidas por " + " */
  desconto: string;
  planilhaUrl: string;
  totalValor?: number | null;
  qtdItens?: number | null;
  banco?: string | null;
  agencia?: string | null;
  conta?: string | null;
  /** dd/mm/aaaa, o primeiro e o último lançamento */
  dataInicio?: string | null;
  dataFim?: string | null;
}

export interface PonteDoFinder {
  listarClientes(): Promise<ClienteDaLista[]>;
  listarVinculados(clienteId: string): Promise<Map<string, number>>;
  subirPlanilha(blob: Blob, nomeDoArquivo?: string | null): Promise<string>;
  criarVinculada(v: NovaVinculada): Promise<void>;
  listarDrive(pastaId: string, tipos?: string[] | null): Promise<ArquivoDoDrive[]>;
  baixarDrive(arquivoId: string, nome?: string): Promise<File>;
}

const BUCKET = "analises-vinculadas";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabela = (nome: string) => (supabase.from(nome as never) as any);

/** O separador da lista de rubricas em `demandas.desconto`. É contrato: a
 *  esteira e o selo de "vinculado" quebram a string por ele. */
export const SEPARADOR_DE_DESCONTOS = " + ";

/** "1.234,56" em reais, como o pacote escrevia na descrição. */
const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/** A descrição que a esteira mostra: "12 lançamento(s) · total R$ 345,67". */
export function descricaoDaVinculada(qtd: number | null | undefined, total: number | null | undefined): string | null {
  if (qtd == null) return null;
  return `${qtd} lançamento(s)${total == null ? "" : ` · total ${brl(total)}`}`;
}

/** O nome do arquivo no bucket: carimbo, sorteio e o nome limpo. */
export function caminhoDaPlanilha(nome: string | null | undefined, agora = Date.now(), sorteio = Math.random()): string {
  const limpo = (nome || "analise.xlsx").replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${agora}-${sorteio.toString(36).slice(2, 8)}-${limpo}`;
}

/** Quantas vezes cada rubrica já foi vinculada, a partir das `desconto` gravadas. */
export function contarVinculados(linhas: { desconto: string | null }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of linhas) {
    if (!l.desconto) continue;
    for (const r of String(l.desconto).split(SEPARADOR_DE_DESCONTOS).map((x) => x.trim()).filter(Boolean)) {
      m.set(r, (m.get(r) || 0) + 1);
    }
  }
  return m;
}

export const ponteAw: PonteDoFinder = {
  async listarClientes() {
    const { data, error } = await tabela("clientes").select("id, nome, cpf_cnpj, drive_folder_url").order("nome", { ascending: true });
    if (error) throw new Error(`Listar clientes falhou (${error.message})`);
    return (data ?? []) as ClienteDaLista[];
  },

  async listarVinculados(clienteId) {
    if (!clienteId) return new Map();
    try {
      const { data, error } = await tabela("demandas").select("desconto")
        .eq("cliente_id", clienteId).eq("etapa", "analise_vinculada");
      if (error) return new Map();
      return contarVinculados((data ?? []) as { desconto: string | null }[]);
    } catch (e) {
      console.warn("[listar-vinculados]", e);
      return new Map();
    }
  },

  async subirPlanilha(blob, nomeDoArquivo) {
    const caminho = caminhoDaPlanilha(nomeDoArquivo);
    const { error } = await supabase.storage.from(BUCKET).upload(caminho, blob, { contentType: XLSX, upsert: false });
    if (error) throw new Error(`Upload falhou (${error.message})`);
    return supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
  },

  async criarVinculada(v) {
    /* A análise documental MAIS RECENTE do cliente é a mãe: é ela que a ficha
       usa para agrupar as vinculadas de uma mesma sessão de Finder. */
    const { data: mae } = await tabela("demandas").select("id")
      .eq("cliente_id", v.clienteId).eq("etapa", "analise_documental")
      .order("created_at", { ascending: false, nullsFirst: false }).limit(1);
    const { error } = await tabela("demandas").insert({
      cliente_id: v.clienteId,
      tipo: "pre_protocolo",
      etapa: "analise_vinculada",
      titulo: `Análise vinculada — ${v.desconto}`,
      desconto: v.desconto,
      peca_drive_url: v.planilhaUrl,
      descricao: descricaoDaVinculada(v.qtdItens, v.totalValor),
      status: "pendente",
      analise_pai_id: (mae as { id: string }[] | null)?.[0]?.id ?? null,
      ordem: 1,
      banco: v.banco || null,
      agencia: v.agencia || null,
      conta: v.conta || null,
      data_inicio_desconto: v.dataInicio || null,
      data_fim_desconto: v.dataFim || null,
    });
    if (error) throw new Error(`Vincular falhou (${error.message})`);
  },

  async listarDrive(pastaId, tipos = null) {
    if (!pastaId) return [];
    const body: Record<string, unknown> = { folder_id: pastaId };
    if (tipos && tipos.length) body.mime_filter = tipos;
    const { data, error } = await supabase.functions.invoke("list-drive-files", { body });
    if (error) throw new Error(`list-drive-files: ${error.message}`);
    return ((data as { files?: ArquivoDoDrive[] })?.files ?? []) as ArquivoDoDrive[];
  },

  async baixarDrive(arquivoId, nome = "arquivo") {
    const { data, error } = await supabase.functions.invoke("fetch-drive-file", { body: { file_id: arquivoId } });
    if (error) throw new Error(`fetch-drive-file: ${error.message}`);
    const blob = data as Blob;
    return new File([blob], nome, { type: blob.type || "application/pdf" });
  },
};
