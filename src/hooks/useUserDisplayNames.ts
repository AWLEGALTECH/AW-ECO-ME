// Mapa de display name (nome + sobrenome) por email/id do usuario.
// Fonte: tabela profiles. Cache de 5min — eh raro mudar.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// "Luan Asaf Lima Fernandes" -> "Luan Fernandes". Primeiro + ultimo
// nome — formato "nome e sobrenome" que o user quer ver.
export function nomeCurto(full: string | null | undefined): string {
  if (!full) return "";
  const partes = full.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1]}`;
}

export interface ProfileLite {
  id: string;
  nome: string | null;
  email: string | null;
  display: string;
}

export interface UserDisplayMap {
  display: (input: { email?: string | null; id?: string | null }) => string;
  profiles: ProfileLite[];
  isLoading: boolean;
}

export function useUserDisplayNames(): UserDisplayMap {
  const q = useQuery({
    queryKey: ["profiles-display-names"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, email");
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  const byEmail = new Map<string, string>();
  const byId = new Map<string, string>();
  const profiles: ProfileLite[] = [];
  for (const p of (q.data || []) as Array<{ id: string; nome: string | null; email: string | null }>) {
    const short = nomeCurto(p.nome) || (p.email ? p.email.split("@")[0] : "—");
    if (p.email) byEmail.set(p.email.toLowerCase(), short);
    if (p.id) byId.set(p.id, short);
    profiles.push({ id: p.id, nome: p.nome, email: p.email, display: short });
  }
  profiles.sort((a, b) => a.display.localeCompare(b.display));

  const display: UserDisplayMap["display"] = ({ email, id }) => {
    if (id && byId.has(id)) return byId.get(id)!;
    if (email) {
      const e = email.toLowerCase();
      if (byEmail.has(e)) return byEmail.get(e)!;
      return email.split("@")[0];
    }
    return "Sistema";
  };

  return { display, profiles, isLoading: q.isLoading };
}
