// leads-sync — a planilha vira lead sozinha, de cinco em cinco minutos.
//
// ANTES ISTO ERA UM BOTÃO. E a razão de ser botão estava escrita e era boa: o
// interpretador da planilha (src/lib/planilhaLeads.ts) é testado e mora no
// navegador, e uma segunda cópia dele dentro do Deno seria o jeito conhecido de
// as duas discordarem seis meses depois, uma corrigida e a outra não.
//
// A saída não foi copiar: foi LIGAR. `planilhaLeads.ts`, `csv.ts` e `phone.ts`
// estão aqui por link simbólico para os mesmos arquivos de `src/lib`. É um
// arquivo só, com um teste só, lido de dois lugares — mesmo arranjo que o
// `sinalDoLancamento.ts` do Spy.
//
// E A SINCRONIZAÇÃO PASSOU A SER UMA SÓ. O botão da tela agora chama esta
// função em vez de fazer o trabalho por conta própria: se o robô e o botão
// fizessem o upsert cada um do seu jeito, a diferença apareceria justamente no
// campo que um dos dois esquecesse de gravar.
//
// POR QUE O ROBÔ IMPORTA AGORA. Sem ele, "toda vez que a base for preenchida,
// mande a mensagem" nunca acontece: a linha nova só existe no banco quando
// alguém clica, e o gatilho da automação depende do INSERT dessa linha.
//
// Env (secrets): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// A leitura do Google fica na `leads-planilha`, que já tem os três caminhos
// (API do Sheets, gviz por nome de aba, export do Drive) e a conta de serviço.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { lerPlanilha } from "./planilhaLeads.ts";
import { csvParaPlanilha } from "./csv.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

interface Fonte {
  id: string;
  nome: string;
  planilha_id: string;
  aba: string | null;
  instancia: string;
}

interface Resultado {
  fonte_id: string;
  nome: string;
  lidos: number;
  novos: number;
  aviso: string | null;
  erro: string | null;
}

/** Uma fonte: lê a planilha, espelha as linhas, devolve o que mudou. */
async function sincronizar(sb: any, urlBase: string, servico: string, f: Fonte): Promise<Resultado> {
  const saida: Resultado = { fonte_id: f.id, nome: f.nome, lidos: 0, novos: 0, aviso: null, erro: null };

  const r = await fetch(`${urlBase}/functions/v1/leads-planilha`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${servico}` },
    body: JSON.stringify({ planilha_id: f.planilha_id, aba: f.aba }),
  });
  const data = await r.json().catch(() => null);

  if (!data || data.ok === false) {
    saida.erro = String(data?.error || `leitura falhou (${r.status})`);
    await sb.from("leads_fontes").update({ ultimo_erro: saida.erro }).eq("id", f.id);
    return saida;
  }

  const planilha = data.csv
    ? csvParaPlanilha(String(data.csv))
    : {
        cabecalho: (data.cabecalho ?? []) as string[],
        linhas: (data.linhas ?? []) as { linha: number; celulas: string[] }[],
      };

  const { leads, ignoradas } = lerPlanilha(planilha.cabecalho, planilha.linhas);
  saida.lidos = leads.length;

  /* O QUE ATRAPALHOU FICA GRAVADO, NÃO SÓ NO TOAST. Fila vazia é
     indistinguível de "não tem ninguém aqui" — foi exatamente isso que
     aconteceu com a planilha do Bradesco. Agora que ninguém está olhando a
     tela na hora da leitura, a frase é a ÚNICA pista que sobra. */
  const avisos: string[] = [];
  if (data.aviso) avisos.push(String(data.aviso));
  if (planilha.linhas.length === 0) {
    avisos.push(
      planilha.cabecalho.length > 0
        ? `A aba lida ("${data.aba ?? "primeira"}") só tem o cabeçalho e nenhuma linha de dados.`
        : `A aba lida ("${data.aba ?? "primeira"}") está vazia.`,
    );
  } else if (leads.length === 0) {
    avisos.push(
      `Li ${planilha.linhas.length} linha(s) da aba "${data.aba ?? "primeira"}", mas nenhuma tinha telefone`
      + ` reconhecível. Colunas: ${planilha.cabecalho.join(", ") || "(nenhuma)"}.`,
    );
  } else if (ignoradas > 0) {
    avisos.push(`${ignoradas} linha(s) sem telefone válido ficaram de fora.`);
  }
  saida.aviso = avisos.length > 0 ? avisos.join(" ") : null;

  if (leads.length > 0) {
    /* Quem já está no espelho não é novo. A conta é feita ANTES do upsert
       porque depois dele todo mundo existe. */
    const { data: jaTem } = await sb.from("leads_brutos").select("telefone").eq("fonte_id", f.id);
    const conhecidos = new Set(((jaTem || []) as { telefone: string }[]).map((l) => l.telefone));
    saida.novos = leads.filter((l) => !conhecidos.has(l.telefone)).length;

    /* O upsert NÃO toca em `situacao` nem em `conversa_id`: a planilha não sabe
       quem já foi abordado, e deixá-la sobrescrever isso faria a fila
       ressuscitar todo mundo a cada leitura — que é justamente o problema que a
       aba Base existe para resolver. */
    const { error } = await sb.from("leads_brutos").upsert(
      leads.map((l) => ({
        fonte_id: f.id,
        telefone: l.telefone,
        nome: l.nome,
        cidade: l.cidade,
        respostas: l.respostas,
        origem_texto: l.origemTexto,
        chegou_em: l.chegouEm,
        linha: l.linha,
        bruto: l.bruto,
      })),
      { onConflict: "fonte_id,telefone" },
    );
    if (error) {
      saida.erro = error.message;
      await sb.from("leads_fontes").update({ ultimo_erro: error.message }).eq("id", f.id);
      return saida;
    }
  }

  await sb.from("leads_fontes").update({
    ultimo_sync: new Date().toISOString(),
    ultimo_erro: saida.aviso,
    // A aba lida DE VERDADE volta para a fonte: se o nome digitado não existia,
    // a próxima leitura já vai direto na certa.
    ...(data.aba ? { aba: data.aba } : {}),
  }).eq("id", f.id);

  return saida;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" });

  const URL_SB = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const umaSo = body.fonte_id ? String(body.fonte_id) : null;

    const sb = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });

    let q = sb.from("leads_fontes").select("id, nome, planilha_id, aba, instancia").eq("ativa", true);
    if (umaSo) q = q.eq("id", umaSo);
    const { data: fontes, error } = await q;
    if (error) return json({ ok: false, error: error.message });

    const lista = (fontes || []) as Fonte[];
    if (lista.length === 0) return json({ ok: true, fontes: 0, resultados: [] });

    /* UMA DE CADA VEZ. Em paralelo seria mais rápido e seria pior: a mesma
       conta de serviço bate no Google por todas as planilhas ao mesmo tempo e
       ganha 429, que aqui apareceria como "a base parou de atualizar" sem mais
       explicação. São poucas planilhas e cinco minutos de folga até a próxima
       rodada. */
    const resultados: Resultado[] = [];
    for (const f of lista) {
      try {
        resultados.push(await sincronizar(sb, URL_SB, SERVICE, f));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[leads-sync] ${f.nome}:`, msg);
        resultados.push({ fonte_id: f.id, nome: f.nome, lidos: 0, novos: 0, aviso: null, erro: msg });
        await sb.from("leads_fontes").update({ ultimo_erro: msg }).eq("id", f.id);
      }
    }

    const novos = resultados.reduce((s, r) => s + r.novos, 0);
    if (novos > 0) console.log(`[leads-sync] ${novos} lead(s) novo(s) em ${lista.length} base(s)`);

    return json({ ok: true, fontes: lista.length, novos, resultados });
  } catch (e) {
    console.error("[leads-sync]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
