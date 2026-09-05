// wa-conectar — ligar um número novo pela plataforma.
//
// Até aqui, conectar um WhatsApp era ir no painel da Evolution, criar a
// instância, ler o QR e depois configurar o webhook à mão — quatro passos em
// duas ferramentas, e o quarto é o que ninguém lembra. Instância conectada com
// webhook errado parece que funcionou: aparece "conectado" no painel e nenhuma
// mensagem chega no sistema.
//
// POR QUE O WEBHOOK É CONFIGURADO AQUI, E NÃO DEIXADO PRA DEPOIS. É a parte
// invisível e a única que quebra em silêncio. Fazendo daqui, a lista de eventos
// deixa de ser algo que alguém marcou uma vez numa tela e passa a ser o que
// este código diz que ela é — inclusive PRESENCE_UPDATE e MESSAGES_UPDATE, que
// são justamente os que estão faltando na instância que foi criada à mão.
//
// AÇÕES
//   criar        cria a instância, aponta o webhook e devolve o QR
//   registrar    traz pra lista daqui um número criado no painel da Evolution
//   qr           novo QR de uma instância que existe e está desconectada
//   estado       "conectado" / "conectando" / "desconectado"
//   webhook      reaplica a configuração de webhook numa instância existente
//   diagnostico  LÊ o webhook que está gravado lá e compara com o exigido aqui
//   importar     traz a lista de conversas do aparelho pra caixa
//   desconectar  derruba a sessão (a instância continua existindo)
//
// DUAS CHAVES, DOIS NÍVEIS. A Evolution tem a chave GLOBAL do servidor (a que
// abre o manager) e a chave de cada INSTÂNCIA. Mandar mensagem e baixar mídia
// funciona com a da instância; CRIAR instância, não — isso é operação do
// servidor, e com a chave errada volta 401 Unauthorized, que é o mesmo erro de
// "chave inválida". Foi o que aconteceu na primeira tentativa.
//
// Por isso a chave global é um secret PRÓPRIO (EVOLUTION_APIKEY_GLOBAL). Se ele
// não existir, cai na EVOLUTION_APIKEY — e o 401 que vier vai explicar isso em
// vez de repetir "Unauthorized", que não diz a ninguém o que fazer.
//
// Env (secrets): EVOLUTION_URL, EVOLUTION_APIKEY, EVOLUTION_APIKEY_GLOBAL,
//                WA_WEBHOOK_TOKEN.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

/* Os eventos que este sistema sabe usar. Pedir só o que se usa não é economia:
   evento que ninguém trata vira linha em wa_eventos e ruído no diagnóstico. */
const EVENTOS = [
  "MESSAGES_UPSERT",   // mensagem nova
  "MESSAGES_UPDATE",   // entregue / lida / áudio ouvido
  "PRESENCE_UPDATE",   // online / digitando / gravando
  "CONNECTION_UPDATE", // caiu, reconectou
];

/** Nome aceito pela Evolution AO CRIAR uma instância: sem espaço, sem acento.
 *
 *  SÓ VALE PRA CRIAR. Aplicar isto num nome que JÁ existe é o oposto de ajudar:
 *  a instância do escritório se chama `PORTAL DIREITO ABERTO 2`, com espaços, e
 *  normalizar transformava a pergunta em `PORTAL-DIREITO-ABERTO-2` — um nome
 *  que a Evolution não conhece. Toda ação daqui (diagnóstico, reconfigurar,
 *  importar) batia num 404 silencioso e parecia não fazer efeito nenhum.
 *
 *  Foi um estrago sem sintoma próprio: o "Reconfigurar eventos" dizia que tinha
 *  reconfigurado, e tinha reconfigurado o nada. */
function nomeDeInstancia(bruto: string): string {
  return String(bruto || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim().replace(/\s+/g, "-")
    .slice(0, 40);
}

/** O QR pode voltar em três formatos diferentes conforme a versão. */
function acharQr(o: any): string | null {
  const bruto = o?.qrcode?.base64 ?? o?.base64 ?? o?.qrcode?.code ?? o?.code ?? null;
  if (!bruto) return null;
  const s = String(bruto);
  // `base64` já vem como data URI; `code` é o texto do QR, que não serve de
  // imagem — devolver ele como se fosse imagem daria um retângulo quebrado.
  return s.startsWith("data:image") ? s : (s.startsWith("iVBOR") ? `data:image/png;base64,${s}` : null);
}

function traduzEstado(bruto: unknown): string {
  const s = String(bruto ?? "").toLowerCase();
  if (s === "open") return "conectado";
  if (s === "connecting") return "conectando";
  return "desconectado";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" });

  const URL_SB = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const base = (Deno.env.get("EVOLUTION_URL") || "").replace(/\/+$/, "");
  const apikey = Deno.env.get("EVOLUTION_APIKEY") || "";
  // Gerenciar instância é operação de SERVIDOR: pede a chave global.
  const chaveGlobal = Deno.env.get("EVOLUTION_APIKEY_GLOBAL") || apikey;
  const temGlobal = !!Deno.env.get("EVOLUTION_APIKEY_GLOBAL");
  const tokenWebhook = Deno.env.get("WA_WEBHOOK_TOKEN") || "";

  if (!base || !apikey) return json({ ok: false, error: "EVOLUTION_URL/EVOLUTION_APIKEY não configurados" });
  if (!tokenWebhook) return json({ ok: false, error: "WA_WEBHOOK_TOKEN não configurado" });

  const urlWebhook = `${URL_SB}/functions/v1/wa-webhook?token=${encodeURIComponent(tokenWebhook)}`;
  const cab = { "Content-Type": "application/json", apikey: chaveGlobal };

  /** 401 aqui quase sempre é chave do nível errado, não chave inválida. */
  const explica401 = (status: number, corpo: string) =>
    status !== 401
      ? `Evolution ${status}: ${corpo.slice(0, 250)}`
      : temGlobal
        ? "A Evolution recusou a chave global (401). Confira o valor de EVOLUTION_APIKEY_GLOBAL — é a chave do SERVIDOR, a mesma que abre o manager."
        : "A Evolution recusou a chave (401). Criar e configurar instância exige a chave GLOBAL do servidor, e o sistema está usando a da instância. "
          + "Cadastre o secret EVOLUTION_APIKEY_GLOBAL no Supabase com a chave que abre o manager da Evolution.";

  try {
    // ── só quem cuida do atendimento liga número ──
    const auth = req.headers.get("Authorization") || "";
    const comoUsuario = createClient(URL_SB, ANON, { global: { headers: { Authorization: auth } } });
    const { data: eu } = await comoUsuario.auth.getUser();
    if (!eu?.user) return json({ ok: false, error: "Não autenticado" });
    const { data: admin } = await comoUsuario.rpc("fn_is_admin");
    const { data: temModulo } = await comoUsuario.rpc("tem_modulo", { p_key: "atendimento" });
    if (!admin && !temModulo) return json({ ok: false, error: "Sem acesso ao atendimento" });

    const body = await req.json().catch(() => ({}));
    const acao = String(body.acao || "").trim();
    // O nome vai COMO ESTÁ pra Evolution. Só a criação normaliza, porque aí o
    // nome ainda não existe do outro lado e quem escolhe o formato somos nós.
    const nomeCru = String(body.instancia || "").trim();
    const nome = acao === "criar" ? nomeDeInstancia(nomeCru) : nomeCru;
    if (!nome) return json({ ok: false, error: "Nome da instância é obrigatório" });

    const sb = createClient(URL_SB, SERVICE);

    /** Aponta o webhook desta instância pra cá, com a lista de eventos daqui. */
    const apontarWebhook = async (): Promise<string | null> => {
      // Duas formas conhecidas do corpo entre versões da v2. A primeira é a
      // atual; a segunda é a antiga. Tentar as duas custa um request e evita um
      // "conectado mas nada chega" que ninguém liga ao formato do JSON.
      const formas = [
        { webhook: { enabled: true, url: urlWebhook, webhookByEvents: false, webhookBase64: false, events: EVENTOS } },
        { enabled: true, url: urlWebhook, webhook_by_events: false, webhook_base64: false, events: EVENTOS },
      ];
      let ultimo = "";
      for (const corpo of formas) {
        const r = await fetch(`${base}/webhook/set/${encodeURIComponent(nome)}`, {
          method: "POST", headers: cab, body: JSON.stringify(corpo),
        });
        if (r.ok) return null;
        ultimo = explica401(r.status, await r.text());
      }
      return ultimo;
    };

    // ─────────────────────────── criar ───────────────────────────
    if (acao === "criar") {
      const r = await fetch(`${base}/instance/create`, {
        method: "POST", headers: cab,
        body: JSON.stringify({
          instanceName: nome,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        }),
      });
      const bruto = await r.text();
      if (!r.ok) return json({ ok: false, error: explica401(r.status, bruto) });
      const dados = (() => { try { return JSON.parse(bruto); } catch { return {}; } })();

      const erroWebhook = await apontarWebhook();

      // A instância entra no espelho já como desconectada: ela só fica de pé
      // quando alguém apontar a câmera. Gravar como conectada faria a tela
      // mentir no minuto em que o QR aparece.
      await sb.from("wa_instancias").upsert(
        { nome, status: "desconectado", ativa: true, sincronizado_em: new Date().toISOString() },
        { onConflict: "nome" },
      );

      return json({
        ok: true, instancia: nome, qr: acharQr(dados),
        aviso: erroWebhook ? `Instância criada, mas o webhook não foi aceito (${erroWebhook}). Sem ele, nenhuma mensagem chega.` : null,
      });
    }

    // ─────────────────────────── registrar ───────────────────────────
    //
    // O número já foi criado no painel da Evolution — este passo só o traz pra
    // lista deste sistema. Existe porque `wa_instancias` é lista de permissão:
    // o servidor da Evolution é compartilhado com outros projetos, e aparecer
    // lá não pode significar aparecer aqui.
    //
    // Aproveita e aponta o webhook, que é o passo que costuma faltar quando a
    // instância nasce pelo painel.
    if (acao === "registrar") {
      const r = await fetch(`${base}/instance/connectionState/${encodeURIComponent(nome)}`, { headers: cab });
      const bruto = await r.text();
      if (r.status === 404) {
        return json({ ok: false, error: `A Evolution não tem instância chamada "${nome}". Confira o nome exato no painel — ele diferencia espaço e acento.` });
      }
      if (!r.ok) return json({ ok: false, error: explica401(r.status, bruto) });
      const dados = (() => { try { return JSON.parse(bruto); } catch { return {}; } })();
      const estado = traduzEstado(dados?.instance?.state ?? dados?.state);

      const erroWebhook = await apontarWebhook();

      const { error } = await sb.from("wa_instancias").upsert(
        { nome, status: estado, ativa: true, sincronizado_em: new Date().toISOString() },
        { onConflict: "nome" },
      );
      if (error) return json({ ok: false, error: error.message });

      return json({
        ok: true, instancia: nome, estado,
        aviso: erroWebhook ? `Número registrado, mas o webhook não foi aceito (${erroWebhook}). Sem ele, nenhuma mensagem chega.` : null,
      });
    }

    // ─────────────────────────── qr ───────────────────────────
    if (acao === "qr") {
      const r = await fetch(`${base}/instance/connect/${encodeURIComponent(nome)}`, { headers: cab });
      const bruto = await r.text();
      if (!r.ok) return json({ ok: false, error: explica401(r.status, bruto) });
      const dados = (() => { try { return JSON.parse(bruto); } catch { return {}; } })();
      return json({ ok: true, instancia: nome, qr: acharQr(dados) });
    }

    // ─────────────────────────── estado ───────────────────────────
    if (acao === "estado") {
      const r = await fetch(`${base}/instance/connectionState/${encodeURIComponent(nome)}`, { headers: cab });
      const bruto = await r.text();
      if (!r.ok) return json({ ok: false, error: explica401(r.status, bruto) });
      const dados = (() => { try { return JSON.parse(bruto); } catch { return {}; } })();
      const estado = traduzEstado(dados?.instance?.state ?? dados?.state);
      await sb.from("wa_instancias")
        .update({ status: estado, sincronizado_em: new Date().toISOString() })
        .eq("nome", nome);
      return json({ ok: true, instancia: nome, estado });
    }

    // ─────────────────────────── webhook ───────────────────────────
    if (acao === "webhook") {
      const erro = await apontarWebhook();
      return json(erro
        ? { ok: false, error: `A Evolution recusou a configuração do webhook (${erro}).` }
        : { ok: true, instancia: nome, eventos: EVENTOS });
    }

    // ─────────────────────────── diagnostico ───────────────────────────
    //
    // "Conectou mas não chega mensagem" tem quatro causas que se parecem na
    // tela: URL errada, token errado, evento desmarcado, ou `webhookByEvents`
    // ligado (que faz a Evolution postar em URL/messages-upsert). Nenhuma delas
    // aparece de fora — e eu já perdi tempo inferindo de ausência de log, que é
    // o pior instrumento possível.
    //
    // Então em vez de adivinhar, PERGUNTA. Esta ação lê o webhook que está
    // gravado na Evolution para esta instância e compara com o que este código
    // exige. O que ela devolve é a configuração real, não a que deveria estar
    // lá — inclusive a URL, pra dar pra ver se aponta pra este Supabase.
    if (acao === "diagnostico") {
      const esconde = (u: string) => u.replace(/token=[^&]*/, "token=•••");

      let webhook: any = null;
      let erroWebhook: string | null = null;
      // `find` é o nome atual; algumas 2.x expõem `webhook/{instancia}`.
      for (const caminho of [`webhook/find/${encodeURIComponent(nome)}`, `webhook/${encodeURIComponent(nome)}`]) {
        const r = await fetch(`${base}/${caminho}`, { headers: cab });
        const bruto = await r.text();
        if (!r.ok) { erroWebhook = explica401(r.status, bruto); continue; }
        try { webhook = JSON.parse(bruto); erroWebhook = null; break; }
        catch { erroWebhook = `resposta ilegível: ${bruto.slice(0, 150)}`; }
      }

      const w = webhook?.webhook ?? webhook ?? {};
      const eventos: string[] = (Array.isArray(w.events) ? w.events : [])
        .map((e: unknown) => String(e).toUpperCase().replace(/[.-]/g, "_"));
      const faltando = EVENTOS.filter((e) => !eventos.includes(e));
      const urlLa = String(w.url ?? "");
      const porEvento = !!(w.webhookByEvents ?? w.webhook_by_events ?? w.byEvents);

      // O TOKEN SE COMPARA DEPOIS DE DECODIFICAR, e isso é a correção de um
      // erro que a própria tela cometeu: a comparação era `url.includes(
      // "token=" + token)`, contra o token CRU. Como nós gravamos a URL com
      // `encodeURIComponent`, qualquer caractere especial no segredo fazia a
      // tela acusar "o token não é o deste sistema" numa configuração perfeita.
      // Um diagnóstico que inventa problema é pior que nenhum: manda consertar
      // o que não está quebrado. `searchParams` decodifica, então aqui a
      // comparação é entre os dois valores de verdade.
      const tokenNaUrl = (() => {
        try { return new URL(urlLa).searchParams.get("token"); } catch { return null; }
      })();

      // Estado da conexão junto: webhook perfeito em instância caída também
      // resulta em caixa parada, e são consertos diferentes.
      let estado = "desconhecido";
      const rEst = await fetch(`${base}/instance/connectionState/${encodeURIComponent(nome)}`, { headers: cab });
      if (rEst.ok) {
        const t = await rEst.text();
        const d = (() => { try { return JSON.parse(t); } catch { return {}; } })();
        estado = traduzEstado(d?.instance?.state ?? d?.state);
      }

      // Últimos eventos que ESTA instância mandou pra cá. É a prova de entrega:
      // se `connection.update` chegou e `messages.upsert` nunca, a URL e o token
      // estão certos e o que falta é o evento — conclusão que não dá pra tirar
      // olhando só a configuração.
      const { data: recebidos } = await sb
        .from("wa_eventos").select("evento, criado_em")
        .eq("instancia", nome).order("criado_em", { ascending: false }).limit(10);
      const { count: mensagens } = await sb
        .from("wa_conversas").select("id", { count: "exact", head: true }).eq("instancia", nome);

      return json({
        ok: true,
        instancia: nome,
        estado,
        webhook: erroWebhook ? null : {
          configurado: !!urlLa,
          ativo: w.enabled !== false,
          url: esconde(urlLa),
          apontaPraCa: urlLa.startsWith(`${URL_SB}/functions/v1/wa-webhook`),
          tokenConfere: tokenNaUrl === tokenWebhook,
          porEvento,
          eventos,
          faltando,
        },
        erroWebhook,
        recebidos: recebidos ?? [],
        conversas: mensagens ?? 0,
        exigidos: EVENTOS,
        urlEsperada: esconde(urlWebhook),
      });
    }

    // ─────────────────────────── importar ───────────────────────────
    //
    // Número novo conecta e a caixa nasce vazia: o sistema só conhece quem
    // manda mensagem daqui pra frente. Mas o aparelho já tem conversas, e ver
    // caixa vazia num WhatsApp cheio parece que a conexão não funcionou.
    //
    // O que se importa é a LISTA de conversas, não o histórico: o WhatsApp não
    // entrega mensagem antiga por API, e fingir que entregou seria pior que a
    // caixa vazia. Cada linha vira uma conversa que já se pode abrir e
    // responder — as mensagens começam a existir na primeira que chegar.
    if (acao === "importar") {
      // Duas formas entre versões: POST com corpo (atual) e GET (antiga).
      let lista: any[] | null = null;
      let ultimoErro = "";
      for (const tentativa of [
        () => fetch(`${base}/chat/findChats/${encodeURIComponent(nome)}`, { method: "POST", headers: cab, body: "{}" }),
        () => fetch(`${base}/chat/findChats/${encodeURIComponent(nome)}`, { headers: cab }),
      ]) {
        const r = await tentativa();
        const bruto = await r.text();
        if (!r.ok) { ultimoErro = explica401(r.status, bruto); continue; }
        try {
          const d = JSON.parse(bruto);
          lista = Array.isArray(d) ? d : Array.isArray(d?.chats) ? d.chats : Array.isArray(d?.data) ? d.data : null;
          if (lista) break;
        } catch { ultimoErro = `resposta ilegível: ${bruto.slice(0, 150)}`; }
      }
      if (!lista) return json({ ok: false, error: `Não consegui ler as conversas. ${ultimoErro}` });

      // A LEITURA DO JID É A REGRA INTEIRA, e ela já custou caro: a versão
      // anterior tirava o "@", apagava o que não era dígito e chamava aquilo de
      // telefone. A Evolution devolveu `86930255515862@lid` — LinkedID, um
      // identificador interno da conta, não um número — e nasceu na caixa uma
      // conversa com o telefone 5523428626450, que não existe, com botão de
      // mandar mensagem. Espelho de `src/lib/jidWa.ts`, que tem os testes.
      const leituraJid = (bruto: unknown): { tipo: string; telefone?: string } => {
        const jid = String(bruto ?? "").trim().toLowerCase();
        if (!jid) return { tipo: "vazio" };
        if (jid.endsWith("@g.us")) return { tipo: "grupo" };
        if (jid.startsWith("status@") || jid.includes("@broadcast") || jid.endsWith("@newsletter")) {
          return { tipo: "status" };
        }
        if (jid.endsWith("@lid")) return { tipo: "lid" };
        const temDominio = jid.includes("@");
        if (temDominio && !(jid.endsWith("@s.whatsapp.net") || jid.endsWith("@c.us"))) {
          return { tipo: "invalido" };
        }
        let d = jid.replace(/@.*$/, "").split(":")[0].replace(/\D/g, "");
        if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
        if (d.length === 10) d = d.slice(0, 2) + "9" + d.slice(2);
        return d.length === 11 ? { tipo: "telefone", telefone: "55" + d } : { tipo: "invalido" };
      };

      const linhas: Record<string, unknown>[] = [];
      const vistos = new Set<string>();
      const descarte: Record<string, number> = {};
      for (const c of lista) {
        const jid = String(c?.remoteJid ?? c?.id ?? c?.jid ?? "");
        const leitura = leituraJid(jid);
        if (leitura.tipo !== "telefone") {
          descarte[leitura.tipo] = (descarte[leitura.tipo] ?? 0) + 1;
          continue;
        }
        const tel = leitura.telefone!;
        if (vistos.has(tel)) continue;
        vistos.add(tel);

        const quando = c?.updatedAt ?? c?.lastMessageTimestamp ?? c?.conversationTimestamp ?? null;
        const emIso = quando
          ? (typeof quando === "number"
              ? new Date(quando > 1e12 ? quando : quando * 1000).toISOString()
              : new Date(quando).toISOString())
          : null;

        linhas.push({
          instancia: nome,
          telefone: tel,
          jid,
          nome_wa: (c?.pushName ?? c?.name ?? null) || null,
          importada: true,
          ultima_em: emIso && !Number.isNaN(Date.parse(emIso)) ? emIso : null,
        });
      }

      // "Importei 0 de 14" sem dizer por quê é o mesmo silêncio que já custou
      // dois diagnósticos errados nesta integração. A frase vai junto SEMPRE,
      // inclusive quando a importação deu certo em parte.
      const motivos: string[] = [];
      if ((descarte.lid ?? 0) > 0) {
        motivos.push(
          `${descarte.lid} com identificador interno (@lid) — o WhatsApp novo esconde o telefone desses contatos, `
          + `e eles só entram na caixa quando mandarem mensagem`,
        );
      }
      if ((descarte.grupo ?? 0) > 0) motivos.push(`${descarte.grupo} de grupo`);
      if ((descarte.status ?? 0) > 0) motivos.push(`${descarte.status} de status/transmissão`);
      if ((descarte.invalido ?? 0) > 0) motivos.push(`${descarte.invalido} sem telefone brasileiro válido`);
      if ((descarte.vazio ?? 0) > 0) motivos.push(`${descarte.vazio} sem identificador`);
      const ignoradas = motivos.length === 0 ? null : `Ignoradas: ${motivos.join("; ")}.`;

      if (linhas.length === 0) {
        return json({ ok: true, instancia: nome, importadas: 0, total: lista.length, ignoradas });
      }

      // Mais recentes primeiro, e um teto: trazer dois mil chats de um celular
      // antigo transformaria a fila de atendimento numa agenda telefônica.
      linhas.sort((a, b) => String(b.ultima_em ?? "").localeCompare(String(a.ultima_em ?? "")));
      const recorte = linhas.slice(0, 300);

      // `ignoreDuplicates` porque conversa que JÁ existe não pode ser
      // sobrescrita: ela tem etapa, anotações e histórico de verdade, e a
      // lista do aparelho não sabe nada disso.
      const { error } = await sb.from("wa_conversas")
        .upsert(recorte, { onConflict: "instancia,telefone", ignoreDuplicates: true });
      if (error) return json({ ok: false, error: error.message });

      return json({ ok: true, instancia: nome, importadas: recorte.length, total: lista.length, ignoradas });
    }

    // ─────────────────────────── desconectar ───────────────────────────
    if (acao === "desconectar") {
      const r = await fetch(`${base}/instance/logout/${encodeURIComponent(nome)}`, {
        method: "DELETE", headers: cab,
      });
      if (!r.ok) return json({ ok: false, error: explica401(r.status, await r.text()) });
      await sb.from("wa_instancias").update({ status: "desconectado" }).eq("nome", nome);
      return json({ ok: true, instancia: nome, estado: "desconectado" });
    }

    return json({ ok: false, error: `Ação desconhecida: "${acao}"` });
  } catch (e) {
    console.error("[wa-conectar]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
