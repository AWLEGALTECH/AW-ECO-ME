// wa-presenca — pedir ao WhatsApp que nos conte quando o contato está digitando.
//
// POR QUE ISSO PRECISA EXISTIR. O evento `PRESENCE_UPDATE` está marcado no
// painel da Evolution e nunca chegou uma linha sequer, enquanto o
// `MESSAGES_UPSERT` chega normalmente. Não é webhook, não é token, não é a
// lista de eventos: é o protocolo.
//
// Presença no WhatsApp é ASSINADA POR CONTATO. O Baileys só recebe
// `presence.update` de um JID depois de chamar `presenceSubscribe` naquele JID.
// Sem a assinatura o servidor não manda nada, e a ausência se parece exatamente
// com "o evento está desmarcado" — que foi onde eu procurei primeiro, errado.
//
// O QUE JÁ SE SABE DESTE SERVIDOR: oito grafias de assinatura, todas 404. E a
// 2.3.7 é a última estável — "sobe de versão" deixou de ser saída, porque o que
// existe adiante é release candidate, e o WhatsApp inteiro do escritório não vai
// pra cima de versão de teste.
//
// E ELA PARA DE BATER NA PORTA. Depois de uma rodada em que tudo deu 404, a
// função não repete por 24h naquela instância — abrir conversa disparava oito
// requisições condenadas a cada clique. As 24h existem pra que uma mudança no
// servidor seja descoberta sozinha, sem ninguém lembrar de voltar aqui.
//
// Env: EVOLUTION_URL, EVOLUTION_APIKEY, EVOLUTION_APIKEY_GLOBAL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

/** Todas as grafias que as v2 já usaram. Só assinatura — nada que anuncie a
 *  nossa presença para o contato. */
const ROTAS = [
  "chat/presenceSubscribe",
  "chat/subscribePresence",
  "chat/presence",
  "chat/presence-subscribe",
  "chat/subscribe-presence",
  "chat/updatePresence",
  "chat/fetchPresence",
  "instance/presenceSubscribe",
];

/** INVENTÁRIO DE ROTAS, quando a assinatura não existe.
 *
 *  Dá pra descobrir o que a build tem sem efeito colateral nenhum: POST com
 *  corpo VAZIO. Rota que existe reclama do corpo (400/500); rota que não existe
 *  responde 404 "Cannot POST". Nenhuma mensagem sai, nenhuma presença é
 *  anunciada, nada muda no aparelho de ninguém.
 *
 *  As duas primeiras são controle: sei que existem, e servem pra confirmar que
 *  o método de sondagem está lendo certo antes de eu concluir qualquer coisa
 *  sobre as outras. Sondagem sem controle é como inferir de ausência — o erro
 *  que essa integração já me cobrou três vezes. */
const SONDAR = [
  "chat/whatsappNumbers",        // controle: existe
  "chat/findChats",              // controle: existe
  "chat/sendPresence",           // manda a NOSSA presença — o único gatilho que sobrou
  "chat/fetchProfile",
  "chat/fetchProfilePictureUrl",
  "chat/markMessageAsRead",
  "chat/findContacts",
  "chat/findStatusMessage",
];

const DIA_MS = 24 * 60 * 60 * 1000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" });

  const URL_SB = Deno.env.get("SUPABASE_URL")!;
  const base = (Deno.env.get("EVOLUTION_URL") || "").replace(/\/+$/, "");
  const apikey = Deno.env.get("EVOLUTION_APIKEY_GLOBAL") || Deno.env.get("EVOLUTION_APIKEY") || "";
  if (!base || !apikey) return json({ ok: false, error: "Evolution não configurada" });

  try {
    const comoUsuario = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const { data: eu } = await comoUsuario.auth.getUser();
    if (!eu?.user) return json({ ok: false, error: "Não autenticado" });
    const { data: admin } = await comoUsuario.rpc("fn_is_admin");
    const { data: temModulo } = await comoUsuario.rpc("tem_modulo", { p_key: "atendimento" });
    if (!admin && !temModulo) return json({ ok: false, error: "Sem acesso ao atendimento" });

    const body = await req.json().catch(() => ({}));
    const conversaId = String(body.conversa_id || "");
    if (!conversaId) return json({ ok: false, error: "conversa_id é obrigatório" });

    const sb = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // O número sai da linha da conversa, nunca do navegador: aceitar número do
    // cliente HTTP seria aceitar assinar a presença de quem ele quisesse.
    const { data: conversa } = await sb
      .from("wa_conversas").select("instancia, telefone, jid").eq("id", conversaId).maybeSingle();
    if (!conversa) return json({ ok: false, error: "Conversa não encontrada" });

    const inst = encodeURIComponent(conversa.instancia);
    const numero = conversa.telefone;
    const jid = conversa.jid || `${numero}@s.whatsapp.net`;

    // O GATILHO É LIDO ANTES DO ATALHO DE 24H. Senão, ligar a chave no banco não
    // teria efeito nenhum até o dia seguinte, e eu passaria a testar uma coisa
    // que nem chegou a rodar — exatamente o tipo de ausência que já me enganou
    // três vezes nesta integração.
    const { data: cfg } = await sb
      .from("app_config").select("valor").eq("chave", "wa_presenca_gatilho").maybeSingle();
    const modo = String(cfg?.valor ?? "off").trim();
    const valeAqui = modo === "on" || (modo.startsWith("teste:") && modo.slice(6) === numero);

    // Já sabemos que esta instância não tem a rota? Então não gasta as
    // requisições de novo — a não ser que o gatilho valha aqui, porque aí a
    // chamada tem um propósito novo.
    const desde = new Date(Date.now() - DIA_MS).toISOString();
    const { data: jaSabido } = await sb
      .from("wa_eventos").select("criado_em")
      .eq("instancia", conversa.instancia)
      .eq("evento", "presenca.assinatura.sem-rota")
      .gte("criado_em", desde)
      .limit(1);

    const tentativas: { rota: string; status: number; corpo: string }[] = [];
    let aceita: string | null = null;
    const pular = !!(jaSabido && jaSabido.length > 0);

    if (!pular) {
      for (const rota of ROTAS) {
        // Duas formas de corpo entre versões: `number` puro e `jid` completo.
        // Mas só insiste na segunda quando a primeira NÃO foi 404 — 404 é a
        // rota que não existe, e o corpo não muda isso.
        for (const corpo of [{ number: numero }, { number: jid }]) {
          const r = await fetch(`${base}/${rota}/${inst}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey },
            body: JSON.stringify(corpo),
          });
          const txt = (await r.text()).slice(0, 200);
          tentativas.push({ rota, status: r.status, corpo: txt });
          if (r.ok) { aceita = rota; break; }
          if (r.status === 404) break;
        }
        if (aceita) break;
      }
    }

    // Sem assinatura, levanta o inventário: o que ESTA build tem. Corpo vazio
    // de propósito — quero saber se a rota existe, não usá-la.
    const inventario: { rota: string; status: number; existe: boolean; corpo: string }[] = [];
    if (!aceita && !pular) {
      for (const rota of SONDAR) {
        const r = await fetch(`${base}/${rota}/${inst}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey },
          body: "{}",
        });
        const txt = (await r.text()).slice(0, 160);
        inventario.push({ rota, status: r.status, existe: r.status !== 404, corpo: txt });
      }
    }

    // ─────────────────────── o último gatilho que resta ───────────────────────
    //
    // O inventário mostrou que `chat/sendPresence` EXISTE nesta build. Ele não
    // assina nada por contrato: ele anuncia a NOSSA presença. Mas em algumas
    // versões do Baileys esse anúncio abre a via de mão dupla e o servidor passa
    // a mandar a presença do contato de volta. É a única porta que sobrou, e a
    // única forma de saber se ela abre é bater nela.
    //
    // POR ISSO ELE É DESLIGADO POR PADRÃO, E MORA NUMA CHAVE DO BANCO. Isto tem
    // efeito FORA daqui: o escritório passa a aparecer "online" no celular do
    // lead toda vez que alguém abre a conversa dele. Não é mentira — o atendente
    // está mesmo ali — mas é informação nova saindo pra fora, e ligar isso é
    // decisão de quem responde pelo escritório, não minha nem do código.
    //
    //   off                    não faz nada  (padrão)
    //   teste:<telefone>       só naquele número, pra medir sem expor ninguém
    //   on                     em todas as conversas
    let gatilho: { tentou: boolean; status?: number; corpo?: string } = { tentou: false };
    if (!aceita && valeAqui) {
      const r = await fetch(`${base}/chat/sendPresence/${inst}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey },
        // "available" é o mínimo: diz que estamos com a conversa aberta, sem
        // fingir que alguém está digitando quando ninguém está.
        body: JSON.stringify({ number: numero, presence: "available", delay: 0 }),
      });
      gatilho = { tentou: true, status: r.status, corpo: (await r.text()).slice(0, 200) };
    }

    // ─────────────────────── a ponte @lid → telefone ───────────────────────
    //
    // A presença CHEGA, mas identificada por `@lid` — o identificador interno
    // da conta, que não é telefone e que o webhook descarta de propósito desde
    // que inventou um número que não existia. Sem saber de quem é aquele lid, o
    // evento chega e não tem onde pousar.
    //
    // A mensagem não ajuda: o `key` traz `remoteJid` e `remoteJidAlt` iguais,
    // os dois em `@s.whatsapp.net`, e `addressingMode: "lid"` sem o lid junto.
    // Então a ponte tem que vir de quem sabe: a própria Evolution.
    //
    // As duas rotas abaixo são as candidatas a devolver o lid de um número. O
    // corpo cru de cada uma fica gravado — inclusive o formato, que é o que eu
    // preciso ver pra escrever a leitura sem chutar campo.
    const ponte: { rota: string; status: number; corpo: string }[] = [];
    if (valeAqui) {
      for (const [rota, corpo] of [
        ["chat/whatsappNumbers", { numbers: [numero] }],
        ["chat/findContacts", { where: { remoteJid: jid } }],
      ] as [string, unknown][]) {
        const r = await fetch(`${base}/${rota}/${inst}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey },
          body: JSON.stringify(corpo),
        });
        ponte.push({ rota, status: r.status, corpo: (await r.text()).slice(0, 600) });
      }
    }

    // O resultado vira linha, sempre — inclusive o fracasso. É a diferença entre
    // "a presença não funciona" e "a presença não funciona PORQUE esta build não
    // tem a rota", e só a segunda dá pra agir em cima.
    await sb.from("wa_eventos").insert({
      instancia: conversa.instancia,
      evento: aceita ? "presenca.assinatura.ok" : "presenca.assinatura.sem-rota",
      corpo: { telefone: numero, aceita, pular, tentativas, inventario, gatilho, modo, ponte },
    });

    return json({
      ok: true,
      assinou: !!aceita,
      rota: aceita,
      diagnostico: aceita
        ? null
        : "Nenhuma das grafias conhecidas de assinatura de presença existe nesta Evolution (todas 404). "
          + "Sem `presenceSubscribe` o WhatsApp nunca envia 'digitando' nem 'online' por conta própria.",
      tentativas,
      inventario,
      gatilho,
      modo,
      ponte,
    });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
