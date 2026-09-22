// wa-instancia — pergunta pra Evolution quais números estão conectados, e
// garante que cada um deles fala com este sistema.
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
// ─────────────────── E O WEBHOOK, QUE É O QUE FALTAVA ───────────────────
//
// 22/09: a PDA OUT passou o dia enviando e sem receber NADA. Envio e
// recebimento são caminhos opostos — enviar é esta plataforma chamando a
// Evolution, receber é a Evolution chamando esta plataforma — e só o segundo
// depende do webhook. A instância tinha sido apagada e recriada no painel na
// noite anterior, e instância nova NASCE SEM WEBHOOK. O painel dizia
// "conectado", a tela dizia "conectado", as mensagens saíam com dois
// risquinhos, e o que o cliente respondia não chegava a lugar nenhum.
//
// O conserto existia num botão ("Reconfigurar eventos"), e um conserto que
// depende de alguém lembrar de clicar não é conserto: é uma armadilha com
// instruções. Agora esta função, que já roda toda vez que a tela abre e já tem
// a chave global na mão, CONFERE o webhook de cada número registrado e
// REAPONTA quando ele está ausente, desligado, apontando pra outro lugar, com
// o token errado, com `webhookByEvents` ligado ou sem algum dos eventos.
//
// É barato (uma leitura por número, e escrita só quando há o que consertar),
// idempotente, e fecha o buraco para sempre: número recriado volta a receber
// sozinho na primeira vez que alguém abrir o Atendimento. O que aconteceu fica
// registrado em `wa_eventos` como `webhook.reapontado`, porque conserto que
// acontece calado é indistinguível de defeito que nunca existiu.
//
// Env: EVOLUTION_URL, EVOLUTION_APIKEY, EVOLUTION_APIKEY_GLOBAL,
//      WA_WEBHOOK_TOKEN.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

/* Os eventos que este sistema sabe usar. Espelho da lista da wa-conectar: se
   as duas discordarem, "Reconfigurar eventos" e a conferência automática vão
   ficar se desfazendo uma à outra a cada abertura da tela. */
const EVENTOS = [
  "MESSAGES_UPSERT",   // mensagem nova
  "MESSAGES_UPDATE",   // entregue / lida / áudio ouvido
  "PRESENCE_UPDATE",   // online / digitando / gravando
  "CONNECTION_UPDATE", // caiu, reconectou
];

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

type Conferencia = { nome: string; acao: "ok" | "reapontado" | "falhou"; motivo?: string; erro?: string };

/**
 * O webhook deste número aponta pra cá, com tudo que este sistema precisa?
 *
 * Devolve o MOTIVO quando não aponta, e `null` quando está tudo certo. O motivo
 * vai parar no log e no `wa_eventos`: "reapontei" sem dizer o que estava errado
 * esconde justamente o que se precisa saber quando isso virar rotina.
 */
function oQueEstaErrado(bruto: unknown, urlEsperada: string, token: string): string | null {
  const w = (bruto as any)?.webhook ?? bruto ?? {};
  const url = String(w?.url ?? "");
  if (!url) return "sem webhook configurado";
  if (w?.enabled === false) return "webhook desligado";

  const base = urlEsperada.split("?")[0];
  if (!url.startsWith(base)) return `apontando para outro lugar (${url.split("?")[0]})`;

  // O token se compara DECODIFICADO: a URL é gravada com encodeURIComponent, e
  // comparar contra o valor cru acusaria erro numa configuração perfeita.
  const tokenLa = (() => {
    try { return new URL(url).searchParams.get("token"); } catch { return null; }
  })();
  if (tokenLa !== token) return "token diferente do deste sistema";

  if (w?.webhookByEvents ?? w?.webhook_by_events ?? w?.byEvents) {
    // Com isso ligado a Evolution posta em URL/messages-upsert, e o token, que
    // vai na URL, se quebra no caminho.
    return "webhookByEvents ligado";
  }

  const eventos: string[] = (Array.isArray(w?.events) ? w.events : [])
    .map((e: unknown) => String(e).toUpperCase().replace(/[.-]/g, "_"));
  const faltando = EVENTOS.filter((e) => !eventos.includes(e));
  if (faltando.length > 0) return `faltando ${faltando.join(", ")}`;

  return null;
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

  /* ── A CONFERÊNCIA DO WEBHOOK ──
     Ver o cabeçalho. Roda para os números que existem dos dois lados, em
     paralelo, com timeout curto: isto acontece enquanto alguém espera a tela
     abrir, e uma Evolution lenta não pode segurar o Atendimento. */
  const tokenWebhook = Deno.env.get("WA_WEBHOOK_TOKEN") ?? "";
  const urlWebhook = `${url}/functions/v1/wa-webhook?token=${encodeURIComponent(tokenWebhook)}`;
  const cab = { "Content-Type": "application/json", apikey: key };

  const conferir = async (nome: string): Promise<Conferencia> => {
    try {
      // `find` é o nome atual; algumas 2.x expõem `webhook/{instancia}`. Um 404
      // aqui não é erro: é instância sem webhook nenhum, que é o caso a
      // consertar.
      let bruto: unknown = null;
      let leu = false;
      for (const caminho of [`webhook/find/${encodeURIComponent(nome)}`, `webhook/${encodeURIComponent(nome)}`]) {
        const r = await fetch(`${base}/${caminho}`, { headers: cab, signal: AbortSignal.timeout(8_000) });
        if (r.status === 404) { leu = true; bruto = null; break; }
        if (!r.ok) continue;
        const txt = await r.text();
        try { bruto = JSON.parse(txt); leu = true; break; } catch { /* tenta o outro caminho */ }
      }
      // Não consegui ler: não mexo. Reapontar às cegas a cada abertura da tela
      // seria escrever na Evolution por não saber, e não por saber.
      if (!leu) return { nome, acao: "falhou", erro: "não consegui ler a configuração do webhook" };

      const motivo = oQueEstaErrado(bruto, urlWebhook, tokenWebhook);
      if (!motivo) return { nome, acao: "ok" };

      // Duas formas conhecidas do corpo entre versões da v2, como na
      // wa-conectar: a atual e a antiga.
      const formas = [
        { webhook: { enabled: true, url: urlWebhook, webhookByEvents: false, webhookBase64: false, events: EVENTOS } },
        { enabled: true, url: urlWebhook, webhook_by_events: false, webhook_base64: false, events: EVENTOS },
      ];
      let ultimo = "";
      for (const corpo of formas) {
        const r = await fetch(`${base}/webhook/set/${encodeURIComponent(nome)}`, {
          method: "POST", headers: cab, body: JSON.stringify(corpo), signal: AbortSignal.timeout(8_000),
        });
        if (r.ok) return { nome, acao: "reapontado", motivo };
        ultimo = `${r.status}: ${(await r.text()).slice(0, 150)}`;
      }
      return { nome, acao: "falhou", motivo, erro: ultimo };
    } catch (e) {
      return { nome, acao: "falhou", erro: (e as Error).message };
    }
  };

  const conferencias = tokenWebhook
    ? await Promise.all(atualizar.map((i) => conferir(i.nome)))
    : [];
  const reapontados = conferencias.filter((c) => c.acao === "reapontado");

  /* CONSERTO CALADO É INDISTINGUÍVEL DE DEFEITO QUE NUNCA EXISTIU. Cada
     reaponte vira linha em `wa_eventos`: é por ali que se descobre, depois,
     que um número passou horas sem receber e desde quando voltou. */
  for (const c of [...reapontados, ...conferencias.filter((x) => x.acao === "falhou")]) {
    console.log(`[wa-instancia] webhook ${c.acao} em "${c.nome}": ${c.motivo ?? c.erro ?? ""}`);
    await admin.from("wa_eventos").insert({
      instancia: c.nome,
      evento: c.acao === "reapontado" ? "webhook.reapontado" : "webhook.conferencia-falhou",
      corpo: c as unknown as Record<string, unknown>,
    });
  }

  return json({
    ok: true,
    instancias: atualizar,
    // Quantas o servidor tem e a gente ignorou. Útil pra quem for registrar uma
    // nova saber que ela existe do outro lado.
    ignoradas: lista.length - atualizar.length,
    webhooks: conferencias,
    reapontados: reapontados.map((c) => c.nome),
  });
});
