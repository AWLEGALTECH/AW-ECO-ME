// wa-instancia — pergunta pra Evolution quais números estão conectados.
//
// O card do topo do Atendimento mostrava nome, telefone e foto escritos à mão
// na maquete. Quem manda nisso é a Evolution, e ela muda sem avisar: o QR cai, o
// perfil troca de foto, alguém conecta um terceiro número. Esta função lê de lá
// e grava em `wa_instancias`, que passa a ser espelho — ninguém edita à mão.
//
// A CHAVE É A GLOBAL, QUANDO EXISTE. Com a chave de uma INSTÂNCIA, o
// `fetchInstances` devolve só aquela instância — e foi exatamente por isso que o
// número recém-conectado apareceu sem telefone, sem foto e sem contagem: ele
// existia na Evolution, mas a chave usada pra perguntar não o enxergava.
// "Conectado mas vazio" parecia problema da conexão e era problema de escopo.
//
// MAS A CHAVE GLOBAL ENXERGA DEMAIS. O servidor da Evolution é compartilhado:
// nele moram os números do Martins Pontes, do Resolva Já, e os do escritório.
// Trocar pra ela encheu o seletor com treze instâncias, das quais duas são
// deste sistema — uma regressão que eu causei ao consertar a outra coisa.
//
// Por isso `wa_instancias` virou LISTA DE PERMISSÃO: esta função só ATUALIZA
// linhas que já existem, e nunca insere uma nova. Estar na tabela é uma decisão
// de quem cuida do atendimento, não uma consequência de existir no servidor.
//
// A FOTO DO WHATSAPP EXPIRA. A URL do pps.whatsapp.net tem validade; por isso a
// tabela guarda `sincronizado_em` junto, e a tela chama esta função ao abrir em
// vez de confiar numa URL de ontem.
//
// Env: EVOLUTION_URL, EVOLUTION_APIKEY, EVOLUTION_APIKEY_GLOBAL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function canonico(raw: string): string {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10) d = d.slice(0, 2) + "9" + d.slice(2);
  return d.length === 11 ? "55" + d : String(raw || "").replace(/\D/g, "");
}

/** A Evolution mudou o shape entre as 2.x: em algumas versões os campos vêm
 *  soltos, em outras dentro de `instance`. Lê os dois em vez de apostar num. */
function lerInstancia(x: any) {
  const i = x?.instance ?? x ?? {};
  const nome = i.name ?? i.instanceName ?? x?.name ?? null;
  const jid = i.ownerJid ?? i.owner ?? null;
  const status = i.connectionStatus ?? i.state ?? i.status ?? "desconhecido";
  const c = i._count ?? x?._count ?? {};
  return {
    nome,
    jid,
    telefone: jid ? canonico(String(jid).replace(/@.*$/, "")) : null,
    perfil_nome: i.profileName ?? i.profilename ?? null,
    foto_url: i.profilePicUrl ?? i.profilePictureUrl ?? null,
    // "open" é como a Evolution chama conectado; traduzo aqui pra a tela não
    // precisar saber o vocabulário dela
    status: status === "open" ? "conectado" : status === "close" ? "desconectado" : String(status),
    contatos: Number(c.Contact ?? c.contacts ?? 0) || null,
    conversas: Number(c.Chat ?? c.chats ?? 0) || null,
    mensagens: Number(c.Message ?? c.messages ?? 0) || null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;

  // quem chamou: usa o token da pessoa, pra RLS e helpers valerem pra ela
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: euAdmin } = await comoUsuario.rpc("fn_is_admin");
  const { data: temModulo } = await comoUsuario.rpc("tem_modulo", { p_key: "atendimento" });
  if (!euAdmin && !temModulo) return json({ ok: false, error: "sem acesso ao Atendimento" }, 403);

  const base = (Deno.env.get("EVOLUTION_URL") ?? "").replace(/\/$/, "");
  // A global primeiro: só ela enxerga TODAS as instâncias.
  const key = Deno.env.get("EVOLUTION_APIKEY_GLOBAL") || Deno.env.get("EVOLUTION_APIKEY");
  if (!base || !key) return json({ ok: false, error: "Evolution nao configurada" }, 503);

  let cru: unknown;
  try {
    const r = await fetch(`${base}/instance/fetchInstances`, { headers: { apikey: key } });
    const txt = await r.text();
    if (!r.ok) return json({ ok: false, error: `Evolution ${r.status}: ${txt.slice(0, 200)}` }, 502);
    cru = JSON.parse(txt);
  } catch (e) {
    return json({ ok: false, error: `Evolution inalcancavel: ${(e as Error).message}` }, 502);
  }

  const lista = (Array.isArray(cru) ? cru : [cru]).map(lerInstancia).filter((i) => i.nome);
  if (lista.length === 0) return json({ ok: true, instancias: [] });

  // grava com a service role: a tabela é espelho e só esta função escreve nela
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Só as que ALGUÉM já registrou aqui. A comparação é sem caixa e sem espaço
  // sobrando porque nome de instância é digitado à mão no painel da Evolution —
  // "Escritório Martins Pontes " com espaço no fim é uma instância diferente lá
  // e a mesma coisa pra qualquer humano.
  const { data: registradas, error: eLer } = await admin
    .from("wa_instancias").select("nome");
  if (eLer) return json({ ok: false, error: eLer.message }, 500);

  const chave = (s: string) => String(s || "").trim().toLowerCase();
  const permitidas = new Map(((registradas || []) as { nome: string }[]).map((r) => [chave(r.nome), r.nome]));

  const atualizar = lista
    .filter((i) => permitidas.has(chave(i.nome!)))
    .map((i) => ({ ...i, nome: permitidas.get(chave(i.nome!))!, sincronizado_em: new Date().toISOString() }));

  if (atualizar.length > 0) {
    const { error } = await admin.from("wa_instancias").upsert(atualizar, { onConflict: "nome" });
    if (error) return json({ ok: false, error: error.message }, 500);
  }

  return json({
    ok: true,
    instancias: atualizar,
    // Quantas o servidor tem e a gente ignorou. Útil pra quem for registrar uma
    // nova saber que ela existe do outro lado.
    ignoradas: lista.length - atualizar.length,
  });
});
