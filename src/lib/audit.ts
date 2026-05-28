import { supabase } from "@/integrations/supabase/client";

// Helper pra registrar eventos manuais (login, navegacao, abrir Drive, exportacoes, etc).
// Mutations em tabelas criticas (clientes, processos, demandas, profiles, user_module_access)
// ja sao capturadas por triggers no banco — nao precisa logar essas aqui.
//
// Falha silenciosa: log nao deve quebrar fluxo do user.

export async function logEvent(
  action: string,
  resourceType: string,
  resourceId?: string | null,
  details?: Record<string, unknown> | null,
): Promise<void> {
  try {
    await supabase.rpc("app_log" as any, {
      p_action: action,
      p_resource_type: resourceType,
      p_resource_id: resourceId ?? null,
      p_details: details ?? null,
    });
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[audit] log falhou:", e);
  }
}

// "Primeiro Último" a partir do nome completo. Fallback pra parte antes do @ do email.
export function nomeSobrenome(p: { nome?: string | null; email?: string | null } | null | undefined): string {
  if (!p) return "—";
  const full = (p.nome || "").trim();
  if (full) {
    const parts = full.split(/\s+/);
    return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1]}`;
  }
  if (p.email) return p.email.split("@")[0];
  return "—";
}
