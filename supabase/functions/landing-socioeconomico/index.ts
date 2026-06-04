// landing-socioeconomico
//
// Endpoint PUBLICO (verify_jwt=false) consumido por uma landing externa
// gerada para um cliente especifico. Dois modos via { action }:
//
//   action: 'fetch'  { cliente_id }          -> { ok, primeiro_nome, ja_respondido }
//   action: 'submit' { cliente_id, dados }   -> { ok }  (UPDATE merge no jsonb)
//
// Seguranca:
//   - Usa service_role internamente (nao expoe credencial na landing)
//   - 'fetch' retorna SO o primeiro nome (saudacao), nada sensivel
//   - 'submit' aceita SOMENTE as 7 chaves do whitelist socioeconomico
//   - cliente_id e UUID nao-enumeravel; valida existencia antes de gravar
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function j(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Apenas estes campos podem ser gravados a partir da landing publica.
const CAMPOS_PERMITIDOS = [
  "idade", "escolaridade", "numero_filhos", "idades_filhos",
  "conjuge_trabalha", "renda_mensal", "unico_provedor", "tipo_moradia",
  "outros_dependentes", "condicao_saude", "observacoes_livres",
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action as string | undefined;
    const clienteId = body.cliente_id as string | undefined;

    if (!clienteId || !UUID_RE.test(clienteId)) {
      return j({ error: "cliente_id invalido" }, 400);
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    if (action === "fetch") {
      const { data, error } = await sb
        .from("clientes")
        .select("nome, dados_socioeconomicos")
        .eq("id", clienteId)
        .single();
      if (error || !data) return j({ error: "cliente nao encontrado" }, 404);
      const primeiro = String(data.nome || "").trim().split(/\s+/)[0] || "";
      const ds = data.dados_socioeconomicos || {};
      const jaRespondido = CAMPOS_PERMITIDOS.some(k => {
        const v = (ds as any)[k];
        return v !== undefined && v !== null && String(v).trim() !== "";
      });
      return j({ ok: true, primeiro_nome: primeiro, ja_respondido: jaRespondido });
    }

    if (action === "submit") {
      const dados = (body.dados || {}) as Record<string, unknown>;
      // Carrega o jsonb atual pra fazer merge (nao apaga o que ja existe)
      const { data: cli, error: e1 } = await sb
        .from("clientes")
        .select("dados_socioeconomicos")
        .eq("id", clienteId)
        .single();
      if (e1 || !cli) return j({ error: "cliente nao encontrado" }, 404);

      const atual = (cli.dados_socioeconomicos || {}) as Record<string, unknown>;
      const merged = { ...atual };
      for (const k of CAMPOS_PERMITIDOS) {
        const v = dados[k];
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          merged[k] = String(v).trim();
        }
      }

      const { error: e2 } = await sb
        .from("clientes")
        .update({ dados_socioeconomicos: merged })
        .eq("id", clienteId);
      if (e2) return j({ error: e2.message }, 500);

      return j({ ok: true });
    }

    return j({ error: "action deve ser 'fetch' ou 'submit'" }, 400);
  } catch (e) {
    console.error("[landing-socioeconomico]", e);
    return j({ error: String((e as Error)?.message || e) }, 500);
  }
});
