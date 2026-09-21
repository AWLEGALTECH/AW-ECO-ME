// wa-perfil — a foto de perfil do NÚMERO, trocada de dentro do Atendimento.
//
// Pedido do chefe (21/09). Até aqui, trocar a foto do WhatsApp de um número era
// pegar o celular pareado, ou entrar no painel da Evolution, que nem todo
// mundo que atende tem.
//
// AÇÕES
//   foto      aplica a imagem que a tela subiu para o bucket (perfil/…)
//   remover   tira a foto do perfil
//
// A IMAGEM VAI EM BASE64, e não por link. É a exceção à regra da wa-enviar (lá
// a mídia vai por URL assinada porque um áudio de três minutos não pode
// atravessar a função). Aqui a imagem já chega recortada em 640x640 JPEG, uns
// quarenta quilobytes, e passando os bytes direto o que a Evolution entrega
// ao WhatsApp é exatamente o que a tela gerou.
//
// A TROCA DE FOTO REINICIA A CONEXÃO DO NÚMERO, e isso é o que quebrou no dia
// em que a função nasceu. A Evolution, depois de aplicar a foto, recria o
// socket do WhatsApp por conta própria (`reloadConnection`). Na primeira troca
// do chefe (PORTAL DIREITO ABERTO 2, 17:00) o número entrou num loop de
// reconexão de vinte minutos, dois mil `connection.update` no webhook, e saiu
// dele num estado pior: o painel dizia "conectado", mas o socket que a
// Evolution usa para ENVIAR estava morto. Toda tentativa seguinte, de foto ou
// de mensagem, voltava "Connection Closed" (ou "1006", que é o código do
// WebSocket para fechamento anormal). A presença do número parou às 17:01 e
// nunca mais voltou. É o mesmo quadro que já pediu o botão "Reiniciar o
// número" da wa-conectar: painel verde, envio morto, e só o restart conserta.
//
// Então esta função não confia no "conectado" do painel. Antes de qualquer
// coisa ela SONDA o socket com uma consulta barata (`chat/whatsappNumbers` com
// o próprio telefone do número): se voltar "Connection Closed", o número está
// travado, e ela mesma o reinicia e pede para tentar de novo em meio minuto.
// Depois de aplicar a foto, sonda de novo, e reinicia se a troca
// deixou o socket morto. Reiniciar é o que o botão da wa-conectar faz, e o que
// resolveu das outras vezes.
//
// DEPOIS DE APLICAR, RELÊ A FOTO DA PRÓPRIA INSTÂNCIA na Evolution e grava em
// `wa_instancias.foto_url`. Sem isso a tela continuaria mostrando a foto antiga
// até a próxima sincronização, e quem acabou de trocar acharia que não
// funcionou. A leitura é pelo `fetchInstances`, que é de onde a wa-instancia
// já lê o `profilePicUrl`, para não existirem dois jeitos de saber a foto.
//
// Env (secrets): EVOLUTION_URL, EVOLUTION_APIKEY, EVOLUTION_APIKEY_GLOBAL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/* "Connection Closed" e "1006" são o mesmo sintoma visto de dois lugares: o
   socket do número fechado no instante do pedido. O que se diz à pessoa é o
   que ela pode fazer, e não o número. */
const socketFechado = (corpo: string) => /Connection Closed|1006/i.test(corpo);

function traduzirRecusa(status: number, corpo: string): string {
  if (socketFechado(corpo)) {
    return "A conexão desse número com o WhatsApp estava fechada no momento do envio (a Evolution respondeu Connection Closed).";
  }
  return `A Evolution não aceitou a foto (${status}). ${corpo.slice(0, 200)}`;
}

function paraBase64(bytes: Uint8Array): string {
  let s = "";
  const bloco = 0x8000;
  for (let i = 0; i < bytes.length; i += bloco) {
    s += String.fromCharCode(...bytes.subarray(i, i + bloco));
  }
  return btoa(s);
}

type Evolution = { base: string; cab: Record<string, string> };

/** O estado que a Evolution declara: "open", "connecting", "close", ou null se não deu para ler. */
async function estadoDeclarado(ev: Evolution, nome: string): Promise<string | null> {
  try {
    const r = await fetch(`${ev.base}/instance/connectionState/${encodeURIComponent(nome)}`, {
      headers: ev.cab, signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return String(d?.instance?.state ?? d?.state ?? "") || null;
  } catch { return null; }
}

/**
 * A SONDA. Pergunta ao socket do número se o próprio telefone dele existe no
 * WhatsApp. A resposta não interessa; interessa se o socket RESPONDE. É a
 * consulta mais barata que passa pelo mesmo caminho do envio, e é justamente
 * a que voltou "428 Connection Closed" na wa-nova-conversa enquanto o painel
 * dizia "conectado".
 *
 *   "vivo"         respondeu
 *   "morto"        respondeu Connection Closed (ou 1006)
 *   "desconhecido" outra falha; não se conclui nada e não se bloqueia ninguém
 */
async function sondarSocket(ev: Evolution, nome: string, telefone: string | null): Promise<"vivo" | "morto" | "desconhecido"> {
  if (!telefone) return "desconhecido";
  try {
    const r = await fetch(`${ev.base}/chat/whatsappNumbers/${encodeURIComponent(nome)}`, {
      method: "POST", headers: ev.cab, body: JSON.stringify({ numbers: [telefone] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (r.ok) return "vivo";
    const corpo = await r.text();
    return socketFechado(corpo) ? "morto" : "desconhecido";
  } catch { return "desconhecido"; }
}

/** O mesmo restart do botão "Reiniciar o número" da wa-conectar: POST, e PUT se a versão pedir. */
async function reiniciar(ev: Evolution, nome: string): Promise<boolean> {
  for (const metodo of ["POST", "PUT"]) {
    try {
      const r = await fetch(`${ev.base}/instance/restart/${encodeURIComponent(nome)}`, {
        method: metodo, headers: ev.cab, signal: AbortSignal.timeout(10_000),
      });
      if (r.ok) return true;
    } catch { /* tenta o outro verbo */ }
  }
  return false;
}

const PEDE_PARA_TENTAR_DE_NOVO =
  "Reiniciei o número agora. Espere uns 30 segundos, confira que ele voltou a aparecer conectado e tente de novo.";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" });

  const URL_SB = Deno.env.get("SUPABASE_URL")!;
  const base = (Deno.env.get("EVOLUTION_URL") || "").replace(/\/+$/, "");
  const apikey = Deno.env.get("EVOLUTION_APIKEY_GLOBAL") || Deno.env.get("EVOLUTION_APIKEY") || "";
  if (!base || !apikey) return json({ ok: false, error: "EVOLUTION_URL/EVOLUTION_APIKEY não configurados nos secrets" });
  const ev: Evolution = { base, cab: { "Content-Type": "application/json", apikey } };

  try {
    const auth = req.headers.get("Authorization") || "";
    const comoUsuario = createClient(URL_SB, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: eu } = await comoUsuario.auth.getUser();
    if (!eu?.user) return json({ ok: false, error: "Não autenticado" });
    const { data: admin } = await comoUsuario.rpc("fn_is_admin");
    const { data: temModulo } = await comoUsuario.rpc("tem_modulo", { p_key: "atendimento" });
    if (!admin && !temModulo) return json({ ok: false, error: "Sem acesso ao atendimento" });

    const body = await req.json().catch(() => ({}));
    const acao = String(body.acao || "foto");
    const nome = String(body.instancia || "").trim();
    if (!nome) return json({ ok: false, error: "Nome da instância é obrigatório" });
    if (acao !== "foto" && acao !== "remover") return json({ ok: false, error: `Ação desconhecida: "${acao}"` });

    const sb = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    // Só número que está na lista daqui. A Evolution é compartilhada com
    // outros escritórios, e esta função não pode virar um jeito de mexer no
    // perfil de um número que não é nosso.
    const { data: inst } = await sb.from("wa_instancias").select("nome, telefone").eq("nome", nome).maybeSingle();
    if (!inst) return json({ ok: false, error: `O número "${nome}" não está cadastrado aqui.` });

    const midiaPath = acao === "foto" ? String(body.midia_path || "") : "";
    if (acao === "foto" && !midiaPath.startsWith("perfil/")) return json({ ok: false, error: "midia_path precisa estar em perfil/" });
    // A imagem no bucket já cumpriu o papel quando a função termina, dando
    // certo ou errado. Tirar evita acumular uma foto por tentativa.
    const limparBucket = async () => {
      if (midiaPath) await sb.storage.from("wa-midia").remove([midiaPath]).catch(() => { /* fica, e tudo bem */ });
    };

    /* PRIMEIRO, O NÚMERO ESTÁ DE PÉ? O estado declarado pega o caso simples
       (desconectado, ou ainda conectando). A sonda pega o caso traiçoeiro: o
       painel verde com o socket morto. Ver o cabeçalho. */
    const estado = await estadoDeclarado(ev, nome);
    if (estado && estado !== "open") {
      await limparBucket();
      const dica = estado === "connecting"
        ? "O número ainda está conectando na Evolution. Espere alguns segundos e tente de novo."
        : `O número não está conectado na Evolution (estado: ${estado}). Conecte-o pela engrenagem antes de mexer na foto.`;
      return json({ ok: false, error: dica });
    }
    const sondaAntes = await sondarSocket(ev, nome, inst.telefone);
    if (sondaAntes === "morto") {
      await limparBucket();
      const reiniciou = await reiniciar(ev, nome);
      return json({
        ok: false,
        error: reiniciou
          ? `A conexão desse número estava travada na Evolution (o painel dizia conectado, mas nada saía). ${PEDE_PARA_TENTAR_DE_NOVO}`
          : "A conexão desse número está travada na Evolution e não consegui reiniciá-la daqui. Use \"Reiniciar o número\" no diagnóstico da engrenagem e tente de novo.",
        reiniciada: reiniciou,
      });
    }

    if (acao === "remover") {
      const r = await fetch(`${base}/chat/removeProfilePicture/${encodeURIComponent(nome)}`, { method: "DELETE", headers: ev.cab });
      if (!r.ok) {
        const corpo = await r.text();
        if (socketFechado(corpo)) {
          const reiniciou = await reiniciar(ev, nome);
          return json({ ok: false, error: `${traduzirRecusa(r.status, corpo)} ${reiniciou ? PEDE_PARA_TENTAR_DE_NOVO : "Reinicie o número pelo diagnóstico e tente de novo."}` });
        }
        return json({ ok: false, error: `A Evolution não aceitou remover (${r.status}). ${corpo.slice(0, 200)}` });
      }
      await sb.from("wa_instancias").update({ foto_url: null, sincronizado_em: new Date().toISOString() }).eq("nome", nome);
      return json({ ok: true, instancia: nome, foto_url: null });
    }

    // Baixa do bucket e manda os bytes. Ver o cabeçalho: aqui base64 é a
    // escolha certa, e não a exceção que estourou o AW-ECO.
    const { data: arquivo, error: eDown } = await sb.storage.from("wa-midia").download(midiaPath);
    if (eDown || !arquivo) return json({ ok: false, error: `Não consegui ler a imagem: ${eDown?.message ?? "sem arquivo"}` });
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    if (bytes.length === 0) { await limparBucket(); return json({ ok: false, error: "A imagem veio vazia." }); }
    const picture = paraBase64(bytes);

    /* Duas formas conhecidas entre versões da v2 (PUT e POST), mesmo cuidado
       da wa-conectar: custa um request e evita um "não deu nada" que ninguém
       liga ao verbo HTTP. */
    let ultimo = "";
    let aplicou = false;
    for (const metodo of ["PUT", "POST"]) {
      const r = await fetch(`${base}/chat/updateProfilePicture/${encodeURIComponent(nome)}`, {
        method: metodo, headers: ev.cab, body: JSON.stringify({ picture }),
      });
      if (r.ok) { aplicou = true; break; }
      ultimo = await r.text();
      if (socketFechado(ultimo)) break; // o outro verbo vai bater no mesmo socket fechado
      ultimo = traduzirRecusa(r.status, ultimo);
    }
    await limparBucket();
    if (!aplicou) {
      if (socketFechado(ultimo)) {
        const reiniciou = await reiniciar(ev, nome);
        return json({
          ok: false,
          error: `${traduzirRecusa(500, ultimo)} ${reiniciou ? PEDE_PARA_TENTAR_DE_NOVO : "Reinicie o número pelo diagnóstico e tente de novo."}`,
          reiniciada: reiniciou,
        });
      }
      return json({ ok: false, error: ultimo });
    }

    /* A FOTO ENTROU. Agora a parte que quebrou da primeira vez: a Evolution
       recriou o socket por conta própria. Dá alguns segundos para ele assentar
       e sonda de novo; se ficou morto, reinicia, que é o conserto conhecido. */
    await espera(4_000);
    let reiniciada = false;
    const sondaDepois = await sondarSocket(ev, nome, inst.telefone);
    if (sondaDepois === "morto") reiniciada = await reiniciar(ev, nome);

    /* Relê a foto nova de onde a wa-instancia já lê. Se a Evolution ainda não
       tiver a URL nova (o WhatsApp leva alguns segundos, e o socket pode estar
       voltando), a tela fica com a antiga até a próxima sincronização, e o
       aviso diz isso. */
    let fotoNova: string | null = null;
    try {
      const r = await fetch(`${base}/instance/fetchInstances?instanceName=${encodeURIComponent(nome)}`, {
        headers: ev.cab, signal: AbortSignal.timeout(8_000),
      });
      if (r.ok) {
        const lista = await r.json();
        const item = (Array.isArray(lista) ? lista : [lista]).find((x: any) => (x?.instance?.instanceName ?? x?.name ?? x?.instanceName) === nome) ?? (Array.isArray(lista) ? lista[0] : lista);
        const i = item?.instance ?? item ?? {};
        fotoNova = i.profilePicUrl ?? i.profilePictureUrl ?? null;
      }
    } catch { /* fica sem a URL nova; a sincronização da tela pega depois */ }

    if (fotoNova) {
      await sb.from("wa_instancias").update({ foto_url: fotoNova, sincronizado_em: new Date().toISOString() }).eq("nome", nome);
    }

    const avisos: string[] = [];
    if (reiniciada) avisos.push("A troca deixou a conexão do número travada e eu o reiniciei; ele volta em alguns segundos.");
    else if (sondaDepois === "vivo") avisos.push("A troca reinicia a conexão do número por alguns segundos; ele já respondeu de novo.");
    if (!fotoNova) avisos.push("A foto nova aparece aqui na próxima atualização.");

    return json({ ok: true, instancia: nome, foto_url: fotoNova, reiniciada, aviso: avisos.join(" ") || null });
  } catch (e) {
    console.error("[wa-perfil]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
