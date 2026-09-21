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
// O MESMO DESENHO DA wa-enviar: a imagem já está no bucket quando esta função
// é chamada; aqui só se assina um link de uma hora e a Evolution baixa. Base64
// atravessando a função é o caminho que já estourou o AW-ECO.
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Método não permitido" });

  const URL_SB = Deno.env.get("SUPABASE_URL")!;
  const base = (Deno.env.get("EVOLUTION_URL") || "").replace(/\/+$/, "");
  const apikey = Deno.env.get("EVOLUTION_APIKEY_GLOBAL") || Deno.env.get("EVOLUTION_APIKEY") || "";
  if (!base || !apikey) return json({ ok: false, error: "EVOLUTION_URL/EVOLUTION_APIKEY não configurados nos secrets" });
  const cab = { "Content-Type": "application/json", apikey };

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

    const sb = createClient(URL_SB, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

    // Só número que está na lista daqui. A Evolution é compartilhada com
    // outros escritórios, e esta função não pode virar um jeito de mexer no
    // perfil de um número que não é nosso.
    const { data: inst } = await sb.from("wa_instancias").select("nome").eq("nome", nome).maybeSingle();
    if (!inst) return json({ ok: false, error: `O número "${nome}" não está cadastrado aqui.` });

    if (acao === "remover") {
      const r = await fetch(`${base}/chat/removeProfilePicture/${encodeURIComponent(nome)}`, { method: "DELETE", headers: cab });
      if (!r.ok) return json({ ok: false, error: `A Evolution não aceitou remover (${r.status}). ${(await r.text()).slice(0, 200)}` });
      await sb.from("wa_instancias").update({ foto_url: null, sincronizado_em: new Date().toISOString() }).eq("nome", nome);
      return json({ ok: true, instancia: nome, foto_url: null });
    }

    if (acao !== "foto") return json({ ok: false, error: `Ação desconhecida: "${acao}"` });

    const midiaPath = String(body.midia_path || "");
    if (!midiaPath.startsWith("perfil/")) return json({ ok: false, error: "midia_path precisa estar em perfil/" });

    const { data: assinada, error: eUrl } = await sb.storage.from("wa-midia").createSignedUrl(midiaPath, 3600);
    if (eUrl || !assinada?.signedUrl) return json({ ok: false, error: `Não consegui assinar a imagem: ${eUrl?.message ?? "sem URL"}` });

    /* Duas formas conhecidas entre versões da v2 (PUT e POST), mesmo cuidado
       da wa-conectar: custa um request e evita um "não deu nada" que ninguém
       liga ao verbo HTTP. */
    let ultimo = "";
    let aplicou = false;
    for (const metodo of ["PUT", "POST"]) {
      const r = await fetch(`${base}/chat/updateProfilePicture/${encodeURIComponent(nome)}`, {
        method: metodo, headers: cab, body: JSON.stringify({ picture: assinada.signedUrl }),
      });
      if (r.ok) { aplicou = true; break; }
      ultimo = `A Evolution não aceitou a foto (${r.status}). ${(await r.text()).slice(0, 200)}`;
    }
    if (!aplicou) return json({ ok: false, error: ultimo });

    /* Relê a foto nova de onde a wa-instancia já lê. Se a Evolution ainda não
       tiver a URL nova (o WhatsApp leva alguns segundos), a tela fica com a
       antiga até a próxima sincronização, e o aviso diz isso. */
    let fotoNova: string | null = null;
    try {
      const r = await fetch(`${base}/instance/fetchInstances?instanceName=${encodeURIComponent(nome)}`, { headers: cab });
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

    // A imagem no bucket já cumpriu o papel: a Evolution baixou. Tirar evita
    // acumular uma foto por tentativa.
    await sb.storage.from("wa-midia").remove([midiaPath]).catch(() => { /* fica, e tudo bem */ });

    return json({
      ok: true, instancia: nome, foto_url: fotoNova,
      aviso: fotoNova ? null : "Aplicada no WhatsApp. A foto nova aparece aqui em alguns segundos, na próxima atualização.",
    });
  } catch (e) {
    console.error("[wa-perfil]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
