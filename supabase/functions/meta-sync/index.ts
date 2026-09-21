// meta-sync — os números da Meta Ads descem para o banco, de hora em hora.
//
// Pedido do chefe (21/09): "dados das campanhas, para os números sempre
// estarem na ponta da língua e bem registrados". Esta função é o "bem
// registrados": ela lê a conta de anúncios e grava uma linha por campanha por
// dia em `meta_campanhas_diario`, e o catálogo das campanhas em
// `meta_campanhas`. A tela lê só do banco, nunca da Meta.
//
// DUAS CHAMADAS À GRAPH API POR RODADA, e só duas:
//   1. /act_{conta}/campaigns   o catálogo: nome, status, objetivo, orçamento
//   2. /act_{conta}/insights    o diário: gasto, impressões, cliques, ações,
//                               com time_increment=1 (um registro por dia)
//
// A JANELA É DE TRÊS DIAS por padrão, e não só "ontem": a Meta reatribui
// conversões por até 72 horas, então o lead que aconteceu terça pode só
// aparecer na conta de terça na quinta. Regravar três dias a cada hora custa
// nada e mantém o passado recente honesto. O corpo aceita `dias` maior para
// a primeira carga (ex.: 90).
//
// O QUE É "RESULTADO" É DECIDIDO EM src/lib/metaAds.ts, lido daqui por link
// simbólico, com teste. A Meta não tem uma coluna de resultado na API: tem
// uma lista de ações, e qual delas conta depende do objetivo da campanha.
// Escrever essa escolha duas vezes (aqui e na tela) é o jeito conhecido de
// as duas discordarem no primeiro objetivo novo.
//
// TODA RODADA DEIXA UMA LINHA EM meta_sync_log, inclusive a que falha. Token
// expirado é o defeito mais provável desta integração, e ele não pode se
// parecer com "a campanha parou": tem que aparecer como "a sincronização
// parou", com a mensagem da Meta.
//
// Env (secrets): META_ACCESS_TOKEN, META_AD_ACCOUNT_ID (só dígitos, sem act_).
// O token é de USUÁRIO DO SISTEMA do Business Manager, com ads_read, e sem
// expiração. Token de usuário comum morre em 60 dias e leva a integração
// junto, em silêncio.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { resultadosDe, numero, type AcaoMeta } from "./metaAds.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

const GRAPH = "https://graph.facebook.com/v21.0";

type Campanha = {
  id: string; name: string; status: string; objective?: string;
  daily_budget?: string; created_time?: string;
};
type Insight = {
  campaign_id: string; date_start: string;
  spend?: string; impressions?: string; reach?: string; clicks?: string;
  actions?: AcaoMeta[];
};

/** Todas as páginas de uma listagem da Graph API. */
async function paginar<T>(url: string): Promise<T[]> {
  const tudo: T[] = [];
  let proxima: string | null = url;
  for (let i = 0; i < 50 && proxima; i++) {
    const r = await fetch(proxima);
    const corpo = await r.json();
    if (!r.ok || corpo.error) {
      throw new Error(`Meta ${r.status}: ${corpo?.error?.message ?? JSON.stringify(corpo).slice(0, 200)}`);
    }
    tudo.push(...(corpo.data ?? []));
    proxima = corpo.paging?.next ?? null;
  }
  return tudo;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" });

  const inicio = Date.now();
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const registrar = async (ok: boolean, extra: Record<string, unknown>) => {
    await sb.from("meta_sync_log").insert({ ok, duracao_ms: Date.now() - inicio, ...extra });
  };

  const token = Deno.env.get("META_ACCESS_TOKEN") || "";
  const conta = (Deno.env.get("META_AD_ACCOUNT_ID") || "").replace(/^act_/, "");
  if (!token || !conta) {
    const erro = "META_ACCESS_TOKEN ou META_AD_ACCOUNT_ID não configurados nos secrets";
    await registrar(false, { erro });
    return json({ ok: false, error: erro });
  }

  try {
    const body = await req.json().catch(() => ({}));
    // 3 dias cobrem a reatribuição de 72 h; a primeira carga pede mais.
    const dias = Math.min(Math.max(Number(body?.dias) || 3, 1), 365);
    const hoje = new Date();
    const desde = new Date(hoje);
    desde.setDate(desde.getDate() - (dias - 1));

    // ── 1. o catálogo ──
    const campanhas = await paginar<Campanha>(
      `${GRAPH}/act_${conta}/campaigns?fields=id,name,status,objective,daily_budget,created_time&limit=200&access_token=${token}`,
    );
    const objetivoDe = new Map(campanhas.map((c) => [c.id, c.objective ?? null]));

    if (campanhas.length > 0) {
      const { error } = await sb.from("meta_campanhas").upsert(
        campanhas.map((c) => ({
          id: c.id,
          conta_id: conta,
          nome: c.name,
          status: c.status,
          objetivo: c.objective ?? null,
          // A Meta manda o orçamento em CENTAVOS, como texto.
          orcamento_diario: c.daily_budget ? numero(c.daily_budget) / 100 : null,
          criada_na_meta: c.created_time ?? null,
          atualizado_em: new Date().toISOString(),
        })),
        { onConflict: "id" },
      );
      if (error) throw new Error("gravar campanhas: " + error.message);
    }

    // ── 2. o diário ──
    const range = encodeURIComponent(JSON.stringify({ since: iso(desde), until: iso(hoje) }));
    const insights = await paginar<Insight>(
      `${GRAPH}/act_${conta}/insights?level=campaign&time_increment=1&time_range=${range}` +
      `&fields=campaign_id,spend,impressions,reach,clicks,actions&limit=500&access_token=${token}`,
    );

    if (insights.length > 0) {
      const { error } = await sb.from("meta_campanhas_diario").upsert(
        insights.map((i) => ({
          campanha_id: i.campaign_id,
          dia: i.date_start,
          gasto: numero(i.spend),
          impressoes: Math.round(numero(i.impressions)),
          alcance: Math.round(numero(i.reach)),
          cliques: Math.round(numero(i.clicks)),
          resultados: Math.round(resultadosDe(i.actions, objetivoDe.get(i.campaign_id))),
          acoes: i.actions ?? null,
          atualizado_em: new Date().toISOString(),
        })),
        { onConflict: "campanha_id,dia" },
      );
      if (error) throw new Error("gravar diário: " + error.message);
    }

    await registrar(true, { campanhas: campanhas.length, dias: insights.length });
    return json({ ok: true, campanhas: campanhas.length, dias: insights.length, janela: dias });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[meta-sync]", erro);
    await registrar(false, { erro });
    return json({ ok: false, error: erro });
  }
});
