import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/* O PRÉ-CLIENTE DAQUELE NÚMERO.
 *
 * O Writer exige o WhatsApp do cliente para gerar o kit (11 dígitos, validado
 * na tela), e é isso que amarra a ficha do pré-cliente ao lead: o mesmo número
 * dos dois lados. Não é chave de banco, é reconhecimento, e é o suficiente
 * para a conversa saber que aquela ficha é dela.
 *
 * ÚLTIMOS OITO DÍGITOS, como todo o resto do módulo: o nono dígito aparece e
 * some conforme quem digitou, e o DDI às vezes vem e às vezes não. A conta é a
 * mesma do `fn_wa_tel8` no banco.
 *
 * CANCELADO FICA DE FORA. Ficha cancelada é decisão tomada; oferecer para
 * aprová-la de novo dentro da conversa seria convidar a desfazer sem querer.
 */

export interface PreClienteDoLead {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string | null;
  produto: string | null;
  status: "aguardando_assinatura" | "confirmado" | "cancelado";
  cliente_id: string | null;
  drive_folder_url: string | null;
  created_at: string;
  rubricas: string[] | null;
}

const tel8 = (t: string) => (t || "").replace(/\D/g, "").slice(-8);

export function usePreClienteDoNumero(telefone: string | null | undefined, ativo = true) {
  const chave = tel8(telefone ?? "");
  return useQuery({
    queryKey: ["wa", "pre-cliente-do-numero", chave],
    enabled: ativo && chave.length === 8,
    staleTime: 20_000,
    queryFn: async (): Promise<PreClienteDoLead | null> => {
      /* `like` nos oito dígitos em vez de igualdade: a coluna guarda o telefone
         como foi digitado no Writer, com máscara ("(92)99116-5782"), então
         comparar texto puro não casa com nada. Filtrar aqui e conferir abaixo é
         o que mantém a busca barata e o resultado exato. */
      const { data, error } = await (supabase.from("pre_clientes" as any) as any)
        .select("id, nome, cpf_cnpj, telefone, produto, status, cliente_id, drive_folder_url, created_at, rubricas")
        .neq("status", "cancelado")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const achado = ((data || []) as PreClienteDoLead[])
        .find((p) => tel8(p.telefone ?? "") === chave);
      return achado ?? null;
    },
  });
}
