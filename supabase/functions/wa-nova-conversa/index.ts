// wa-nova-conversa — abrir conversa com quem ainda não escreveu.
//
// A caixa de entrada só conhece quem mandou mensagem. Mas metade do atendimento
// é o contrário: o lead ligou, deixou o número num formulário, veio por
// indicação. Esta função é o "+" da lista.
//
// POR QUE ELA PERGUNTA PRA EVOLUTION SE O NÚMERO EXISTE. Telefone errado não dá
// erro, dá silêncio: a mensagem sai, a API aceita, e não tem ninguém do outro
// lado. Uma semana depois alguém pergunta por que aquele lead nunca respondeu.
// O `/chat/whatsappNumbers` resolve isso antes de a conversa existir — em
// particular o caso que a validação do navegador não consegue pegar sozinha: um
// fixo de 10 dígitos, que o canonicalizador transforma num celular inventado.
//
// MAS A CHECAGEM NÃO PODE SER UM PORTÃO. Se a Evolution não responder, ou
// responder num formato que eu não previ, a conversa é criada assim mesmo e o
// aviso volta pra tela. Bloquear o atendimento inteiro porque uma verificação
// opcional falhou seria trocar um problema raro por um problema garantido.
//
// Env (secrets): EVOLUTION_URL, EVOLUTION_APIKEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown) =>
  new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

/** 55 + DDD + 9 dígitos. Mesma regra do fn_wa_canonico e do src/lib/phone.ts. */
function canonico(raw: string): string {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10) d = d.slice(0, 2) + "9" + d.slice(2);
  return d.length === 11 ? "55" + d : "";
}

/**
 * A Evolution conhece esse número?
 *
 * Devolve `null` quando não deu pra saber — e null NÃO é "não existe". A
 * diferença importa: só o `false` explícito recusa a criação.
 */
async function existeNoWhatsapp(base: string, apikey: string, instancia: string, numero: string): Promise<boolean | null> {
  try {
    const r = await fetch(`${base}/chat/whatsappNumbers/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey },
      body: JSON.stringify({ numbers: [numero] }),
    });
    if (!r.ok) {
      console.error(`[wa-nova-conversa] whatsappNumbers ${r.status}: ${(await r.text()).slice(0, 300)}`);
      return null;
    }
    const dados = await r.json();
    const lista = Array.isArray(dados) ? dados : Array.isArray(dados?.data) ? dados.data : null;
    if (!lista || lista.length === 0) return null;
    const achado = lista[0];
    // `exists` é o campo da v2; se ele não vier, prefiro não opinar a chutar.
    return typeof achado?.exists === "boolean" ? achado.exists : null;
  } catch (e) {
    console.error("[wa-nova-conversa] whatsappNumbers:", e);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" });

  const URL_SB = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const base = (Deno.env.get("EVOLUTION_URL") || "").replace(/\/+$/, "");
  const apikey = Deno.env.get("EVOLUTION_APIKEY") || "";

  try {
    const auth = req.headers.get("Authorization") || "";
    const comoUsuario = createClient(URL_SB, ANON, { global: { headers: { Authorization: auth } } });
    const { data: eu } = await comoUsuario.auth.getUser();
    if (!eu?.user) return json({ ok: false, error: "Não autenticado" });

    const { data: admin } = await comoUsuario.rpc("fn_is_admin");
    const { data: temModulo } = await comoUsuario.rpc("tem_modulo", { p_key: "atendimento" });
    if (!admin && !temModulo) return json({ ok: false, error: "Sem acesso ao atendimento" });

    const body = await req.json().catch(() => ({}));
    const instancia = String(body.instancia || "").trim();
    const numero = canonico(String(body.telefone || ""));
    const nome = (String(body.nome || "").trim() || null);

    if (!instancia) return json({ ok: false, error: "instancia é obrigatória" });
    if (!numero) return json({ ok: false, error: "Telefone fora do formato brasileiro." });

    const sb = createClient(URL_SB, SERVICE);

    // Já falamos com essa pessoa? Então não é conversa nova — é abrir a que
    // existe. Recusar aqui faria a atendente achar que o número está errado.
    const { data: jaTem } = await sb
      .from("wa_conversas").select("id, arquivada")
      .ilike("instancia", instancia).eq("telefone", numero).maybeSingle();

    if (jaTem) {
      // Conversa arquivada volta pra caixa: quem procurou o número quer falar.
      if (jaTem.arquivada) {
        await sb.from("wa_conversas").update({ arquivada: false }).eq("id", jaTem.id);
      }
      return json({ ok: true, conversa_id: jaTem.id, ja_existia: true });
    }

    let aviso: string | null = null;
    if (base && apikey) {
      const existe = await existeNoWhatsapp(base, apikey, instancia, numero);
      if (existe === false) {
        return json({ ok: false, error: "Esse número não tem WhatsApp. Confira os dígitos." });
      }
      if (existe === null) aviso = "Não deu pra confirmar o número com o WhatsApp agora.";
    } else {
      aviso = "Evolution não configurada — o número não foi conferido.";
    }

    const { data: nova, error } = await sb.from("wa_conversas").insert({
      instancia,
      telefone: numero,
      jid: `${numero}@s.whatsapp.net`,
      nome_wa: nome,
      nao_lidas: 0,
      // Conversa que começa aqui é PROSPECÇÃO ATIVA por definição: fomos nós
      // que fomos até a pessoa. A origem é gravada agora e nunca mais muda —
      // ela continua sendo ativa depois que o lead responde.
      origem: "ativa",
      // `ultima_em` é "quando essa conversa se mexeu pela última vez" — e abrir
      // a conversa é ela se mexendo. Sem isso ela nasceria no fim da lista,
      // ordenada por nulo, e quem acabou de adicionar o contato teria que
      // procurá-lo lá embaixo.
      ultima_em: new Date().toISOString(),
      ultima_previa: null,
    }).select("id").single();

    if (error) return json({ ok: false, error: error.message });
    return json({ ok: true, conversa_id: nova.id, ja_existia: false, aviso });
  } catch (e) {
    console.error("[wa-nova-conversa]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
