// Canonicaliza telefone BR pra 13 digits: 55 + DD (2) + 9 + 8 digits.
//
// Motivo: Evolution API entrega o JID às vezes sem o "9" extra (números
// registrados no WhatsApp antes de 2012 em Manaus), enquanto nosso outbound
// envia com o 9. Isso criava 2 rows distintas em controle_bot/historico_mensagens
// pro mesmo cliente — duplicando conversas na aba Atendimento.
//
// Usar em TODO lugar que escreve whatsapp_id/whatsapp_numero: createMPContact,
// envio-kit, edge function clicksign, e n8n MP Captura (via copia do codigo).
export function canonicalizarTelefone(raw: string | null | undefined): string {
  if (!raw) return "";
  let d = String(raw).replace(/\D/g, "");
  // Remove pais "55" se presente com 12 ou 13 digitos
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    d = d.slice(2);
  }
  // Agora d deve ter 10 (DD + 8) ou 11 (DD + 9 + 8) digits
  if (d.length === 10) {
    // Celular/fixo antigo sem 9 — adiciona o 9 (padrao ANATEL pos-2012)
    d = d.slice(0, 2) + "9" + d.slice(2);
  }
  // Se nao ficou com 11, retorna como veio (melhor nao mascarar erro)
  if (d.length !== 11) return String(raw).replace(/\D/g, "");
  return "55" + d;
}

// Retorna os ultimos 8 digits — serve como chave de dedup independente
// de formato (com/sem 9, com/sem 55). Ja e usado em Atendimento.tsx.
export function phoneKey(num: string | null | undefined): string {
  if (!num) return "";
  return String(num).replace(/\D/g, "").slice(-8);
}
