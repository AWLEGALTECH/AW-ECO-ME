// wa-perfil — DESATIVADA em 21/09/2026, a pedido do chefe.
//
// Esta função trocava a foto de perfil do número pela plataforma. Ela fez o
// que devia (a foto entrava), mas o que a Evolution faz DEPOIS derruba o
// número: `updateProfilePicture` e `removeProfilePicture` chamam
// `reloadConnection`, que abre um socket novo do WhatsApp sem fechar o velho.
// Dois sockets com a mesma credencial, e o WhatsApp derruba um quando o outro
// entra (`close` com `statusReason 440`), em loop, por horas. Derrubou o
// PORTAL DIREITO ABERTO 2 às 17:00 e o PORTAL DIREITO ABERTO às 20:19, os
// dois no mesmo dia. Está documentado, com o patch para a Evolution, em
// docs/evolution-conflito-440.md.
//
// A função fica publicada só para responder com esta explicação a qualquer
// tela antiga ainda aberta em algum navegador. Nenhuma ação chega à Evolution.
// A foto do número se troca pelo celular dele.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  return new Response(JSON.stringify({
    ok: false,
    desativada: true,
    error: "A troca de foto pela plataforma foi desativada: a Evolution recria a conexão do número ao aplicar a foto e o derruba por horas. Troque a foto pelo celular do número.",
  }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
});
