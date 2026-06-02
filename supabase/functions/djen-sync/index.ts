// djen-sync
//
// Consulta a API publica do DJEN/CNJ (Diario de Justica Eletronico Nacional)
// pra cada advogado ativo em advogados_djen e grava novas publicacoes em
// publicacoes. Deduplicado pelo djen_id (unique constraint).
//
// Body opcional: { advogado_id?: uuid, dias?: number (1..30, default 7) }
// Sem body: roda pra todos os advogados ativos, ultimos 7 dias.
//
// Endpoint usado: GET https://comunicaapi.pje.jus.br/api/v1/comunicacao
// Params: numeroOab, ufOab, dataDisponibilizacaoInicio/Fim, pagina, itensPorPagina.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const DJEN_URL = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
const PAGE_SIZE = 50;
const MAX_PAGES = 100; // hard cap pra evitar loop infinito

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface DjenItem {
  id: number;
  numero_processo?: string;
  numeroprocessocommascara?: string;
  data_disponibilizacao?: string;
  siglaTribunal?: string;
  tipoComunicacao?: string;
  nomeOrgao?: string;
  texto?: string;
  link?: string;
}

interface Advogado { id: string; nome: string; oab: string; uf: string; }

function ymd(d: Date): string { return d.toISOString().slice(0, 10); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    let body: { advogado_id?: string; dias?: number } = {};
    if (req.method === "POST") body = await req.json().catch(() => ({}));
    const filtroAdvogadoId = body.advogado_id || null;
    const dias = Math.max(1, Math.min(30, Number(body.dias) || 7));

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    let q = sb.from("advogados_djen").select("id, nome, oab, uf").eq("ativo", true);
    if (filtroAdvogadoId) q = q.eq("id", filtroAdvogadoId);
    const { data: advogados, error: e0 } = await q;
    if (e0) return json({ error: e0.message }, 500);
    if (!advogados || advogados.length === 0) return json({ ok: true, msg: "Nenhum advogado ativo", resultados: [] });

    const dataFim = new Date();
    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - dias);
    const intervalo = `${ymd(dataInicio)}..${ymd(dataFim)}`;

    const resultados = [];
    for (const adv of (advogados as Advogado[])) {
      const r = {
        advogado_id: adv.id, nome: adv.nome, oab: adv.oab, uf: adv.uf,
        paginas: 0, total_api: 0, novas: 0, ja_existentes: 0, erros: 0,
      };
      let pagina = 1, hasMore = true;
      while (hasMore && pagina <= MAX_PAGES) {
        const params = new URLSearchParams({
          numeroOab: adv.oab,
          ufOab: adv.uf,
          dataDisponibilizacaoInicio: ymd(dataInicio),
          dataDisponibilizacaoFim: ymd(dataFim),
          itensPorPagina: String(PAGE_SIZE),
          pagina: String(pagina),
        });
        let items: DjenItem[] = [];
        try {
          const resp = await fetch(`${DJEN_URL}?${params}`, { headers: { "Accept": "application/json" } });
          if (!resp.ok) { console.error("[djen] http", resp.status, adv.oab, adv.uf); r.erros++; break; }
          const data = await resp.json();
          items = (data.items || []) as DjenItem[];
          r.paginas++;
          r.total_api += items.length;
        } catch (e) {
          console.error("[djen] fetch err", adv.oab, e);
          r.erros++;
          break;
        }
        if (items.length === 0) break;

        const rows = items.map((it) => ({
          advogado_id: adv.id,
          djen_id: String(it.id),
          numero_processo: it.numeroprocessocommascara || it.numero_processo || null,
          tribunal: it.siglaTribunal || null,
          orgao: it.nomeOrgao || null,
          data_disponibilizacao: it.data_disponibilizacao || null,
          data_publicacao: it.data_disponibilizacao || null,
          tipo_documento: it.tipoComunicacao || null,
          conteudo: it.texto || null,
          link_origem: it.link || null,
        }));

        const djenIds = rows.map((row) => row.djen_id);
        const { data: existing } = await sb
          .from("publicacoes").select("djen_id").in("djen_id", djenIds);
        const existingSet = new Set((existing || []).map((e: any) => e.djen_id));
        const novas = rows.filter((row) => !existingSet.has(row.djen_id));
        r.novas += novas.length;
        r.ja_existentes += rows.length - novas.length;

        if (novas.length > 0) {
          const { error: ie } = await sb.from("publicacoes").upsert(novas, { onConflict: "djen_id" });
          if (ie) { console.error("[djen] insert err", ie); r.erros++; }
        }

        hasMore = items.length === PAGE_SIZE;
        pagina++;
      }
      resultados.push(r);
    }

    return json({ ok: true, intervalo, dias, resultados });
  } catch (e) {
    console.error("[djen-sync]", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
