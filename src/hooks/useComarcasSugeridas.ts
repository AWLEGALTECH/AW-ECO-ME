import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Sugestões de comarca pra autocomplete (datalist): junta todas as comarcas
// distintas já cadastradas em `clientes`. Assim, conforme alguém digita, o
// navegador oferece as comarcas que outros usuários já preencheram antes —
// mas o campo continua livre (pode-se digitar uma comarca nova e salvar).
export function useComarcasSugeridas(): string[] {
  const [comarcas, setComarcas] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    supabase
      .from("clientes")
      .select("comarca")
      .not("comarca", "is", null)
      .then(({ data }) => {
        if (!alive || !data) return;
        const set = new Set<string>();
        for (const r of data) {
          const c = (r as any).comarca?.toString().trim();
          if (c) set.add(c);
        }
        setComarcas([...set].sort((a, b) => a.localeCompare(b, "pt-BR")));
      });
    return () => { alive = false; };
  }, []);
  return comarcas;
}
