// Configuração das landings de coleta socioeconômica (uma por advogado).
// Fonte única usada tanto na ficha do cliente (ClienteDetail) quanto no
// dashboard de completude (Clientes). Cada link carrega o id do cliente em
// ?c=, e a edge function landing-socioeconomico grava as respostas de volta.
export const LANDING_OPCOES = {
  matheus: {
    label: "Dr. Matheus Enes",
    base: "https://aw-eco-me.vercel.app/socio/matheus/",
  },
  diego: {
    label: "Dr. Diego Ismael",
    base: "https://aw-eco-me.vercel.app/socio/diego/",
  },
} as const;

export type AdvogadoKey = keyof typeof LANDING_OPCOES;

// Monta o link único do formulário pra um cliente.
export function linkSocio(advogado: AdvogadoKey, clienteId: string): string {
  return clienteId ? `${LANDING_OPCOES[advogado].base}?c=${clienteId}` : "";
}

// Monta a URL do WhatsApp já com a mensagem-convite e o link do formulário.
// Normaliza o telefone (só dígitos, prefixo 55 quando faltar).
export function whatsappSocioUrl(telefone: string | null, link: string): string {
  let fone = (telefone || "").replace(/\D/g, "");
  if (fone && !fone.startsWith("55") && fone.length <= 11) fone = "55" + fone;
  const msg = encodeURIComponent(
    `Olá! Para darmos andamento ao seu caso, preencha este formulário rápido (leva 1 minuto): ${link}`
  );
  const base = fone ? `https://wa.me/${fone}` : `https://wa.me/`;
  return `${base}?text=${msg}`;
}
