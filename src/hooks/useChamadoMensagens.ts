/* A CONVERSA DE UM CHAMADO.
 *
 * Mesmo desenho da conversa do Atendimento, e de propósito: quem escreve para
 * um lead e quem pede ajuda internamente estão fazendo o mesmo gesto, e não há
 * por que aprender dois.
 *
 * O ANEXO SOBE ANTES DA LINHA, ao contrário da mensagem do WhatsApp, que só
 * vira linha depois do OK da Evolution. Lá o risco é mostrar na tela algo que
 * o cliente nunca recebeu; aqui não há outro lado para confirmar nada: o
 * arquivo no bucket É a mensagem. Se a linha falhar depois do upload, sobra um
 * órfão de 200 KB no bucket, que é barato; o contrário (linha apontando para
 * um arquivo que não subiu) seria um anexo quebrado na tela de quem precisa
 * dele.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { comprimirImagem, caminhoDoAnexo, tipoDoAnexo } from "@/lib/comprimirAnexo";

export interface ChamadoMensagem {
  id: string;
  chamado_id: string;
  autor_id: string | null;
  autor_nome: string | null;
  texto: string | null;
  tipo: "texto" | "imagem" | "audio" | "documento";
  midia_path: string | null;
  midia_mime: string | null;
  midia_nome: string | null;
  midia_bytes: number | null;
  duracao: number | null;
  criada_em: string;
}

const tabela = () => supabase.from("chamado_mensagens" as never) as never as {
  select: (c: string) => never;
  insert: (v: unknown) => never;
  delete: () => never;
};

export function useChamadoMensagens(chamadoId: string | null) {
  return useQuery({
    queryKey: ["chamado-mensagens", chamadoId],
    enabled: !!chamadoId,
    // Chamado é conversa entre duas pessoas que estão no sistema ao mesmo
    // tempo: quem pediu está esperando resposta com a tela aberta.
    refetchInterval: 8_000,
    queryFn: async (): Promise<ChamadoMensagem[]> => {
      const { data, error } = await (tabela().select("*") as never as {
        eq: (c: string, v: string) => { order: (c: string, o: unknown) => Promise<{ data: unknown; error: unknown }> };
      })
        .eq("chamado_id", chamadoId!)
        .order("criada_em", { ascending: true });
      if (error) throw error;
      return (data || []) as ChamadoMensagem[];
    },
  });
}

export function useInvalidarChamadoMensagens() {
  const qc = useQueryClient();
  return (chamadoId?: string | null) =>
    qc.invalidateQueries({ queryKey: chamadoId ? ["chamado-mensagens", chamadoId] : ["chamado-mensagens"] });
}

/** Link assinado do anexo. Uma hora basta: ninguém deixa um print aberto por mais. */
export function useAnexoUrl(path: string | null) {
  return useQuery({
    queryKey: ["chamado-anexo", path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("chamados").createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

/** Só recado, sem anexo. */
export async function mandarRecado(args: {
  chamadoId: string; texto: string; autorId: string | null; autorNome: string | null;
}) {
  const texto = args.texto.trim();
  if (!texto) return;
  const { error } = await (tabela().insert({
    chamado_id: args.chamadoId,
    autor_id: args.autorId,
    autor_nome: args.autorNome,
    texto,
    tipo: "texto",
  }) as never as Promise<{ error: { message: string } | null }>);
  if (error) throw new Error(error.message);
}

/**
 * Anexo (print, áudio gravado, documento), com a legenda quando houver.
 *
 * Devolve quanto pesava e quanto foi parar no bucket, para a tela poder dizer
 * "2,4 MB → 240 KB": é a única forma de a pessoa perceber que a compressão
 * existe e não achar que o print foi para o servidor do jeito que saiu do Mac.
 */
export async function mandarAnexo(args: {
  chamadoId: string; arquivo: File | Blob; nome: string; legenda?: string;
  duracao?: number | null; autorId: string | null; autorNome: string | null;
}): Promise<{ antes: number; depois: number }> {
  const { arquivo, nome, original } = await comprimirImagem(args.arquivo, args.nome);
  const mime = arquivo.type || "application/octet-stream";
  const path = caminhoDoAnexo(args.chamadoId, nome);

  const { error: eUp } = await supabase.storage
    .from("chamados").upload(path, arquivo, { contentType: mime, upsert: false });
  if (eUp) throw new Error(`Não consegui subir o arquivo: ${eUp.message}`);

  const { error } = await (tabela().insert({
    chamado_id: args.chamadoId,
    autor_id: args.autorId,
    autor_nome: args.autorNome,
    texto: args.legenda?.trim() || null,
    tipo: tipoDoAnexo(mime),
    midia_path: path,
    midia_mime: mime,
    midia_nome: nome,
    midia_bytes: arquivo.size,
    duracao: args.duracao ?? null,
  }) as never as Promise<{ error: { message: string } | null }>);
  // A linha falhou depois do upload: o arquivo fica órfão no bucket. Tirar
  // aqui mesmo é mais barato que uma faxina que alguém teria que lembrar de
  // rodar.
  if (error) {
    await supabase.storage.from("chamados").remove([path]).catch(() => { /* já era */ });
    throw new Error(error.message);
  }
  return { antes: original, depois: arquivo.size };
}

/** Apagar o próprio recado. O anexo sai junto, senão fica pagando disco à toa. */
export async function apagarRecado(m: ChamadoMensagem) {
  const { error } = await ((tabela().delete() as never as {
    eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
  }).eq("id", m.id));
  if (error) throw new Error(error.message);
  if (m.midia_path) {
    await supabase.storage.from("chamados").remove([m.midia_path]).catch(() => { /* órfão, e tudo bem */ });
  }
}
