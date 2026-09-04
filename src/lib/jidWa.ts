// jidWa — o identificador que a Evolution manda NEM SEMPRE é um telefone.
//
// Isto existe por causa de um estrago concreto. Ao importar as conversas do
// aparelho novo, a Evolution devolveu `86930255515862@lid` e o sistema fez o
// que sempre fez: tirou o "@", apagou o que não era dígito e chamou aquilo de
// telefone. Nasceu uma conversa com o número `5523428626450` — um número que
// não existe, numa caixa de atendimento, com botão de mandar mensagem.
//
// O QUE É `@lid`. As versões novas do WhatsApp/Baileys passaram a identificar
// contatos por LinkedID: um número interno da conta, sem relação nenhuma com o
// telefone. Ele tem só dígitos, então TODA heurística baseada em "é numérico"
// aceita ele. Por isso a regra aqui não pergunta "parece telefone?" e sim "o
// domínio do JID diz que é telefone?" — `@s.whatsapp.net` e `@c.us` dizem;
// `@lid` diz o contrário, em voz alta.
//
// E POR QUE DEVOLVER O MOTIVO, e não só null. "Importei 0 de 14 conversas" sem
// dizer por quê é o mesmo silêncio que já custou dois diagnósticos errados
// nesta integração. Com o motivo, a tela consegue dizer "a Evolution mandou 14
// identificadores internos (@lid), que não são telefone" — que é uma frase
// sobre a qual dá pra agir.

/** 55 + DDD + 9 dígitos. Mesma regra do `fn_wa_canonico` e do `src/lib/phone.ts`. */
export function canonicoWa(bruto: string): string {
  let d = String(bruto || "").replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length === 10) d = d.slice(0, 2) + "9" + d.slice(2);
  return d.length === 11 ? "55" + d : "";
}

export type LeituraJid =
  | { tipo: "telefone"; telefone: string }
  /** LinkedID: identificador interno da conta, não é telefone. */
  | { tipo: "lid" }
  | { tipo: "grupo" }
  | { tipo: "status" }
  /** Domínio conhecido, mas os dígitos não formam um celular brasileiro. */
  | { tipo: "invalido" }
  | { tipo: "vazio" };

const DOMINIOS_DE_TELEFONE = ["@s.whatsapp.net", "@c.us"];

/**
 * Lê um `remoteJid` da Evolution e diz o que ele é.
 * Nunca inventa telefone: se o domínio não for de telefone, não é telefone.
 */
export function leituraDoJid(bruto: unknown): LeituraJid {
  const jid = String(bruto ?? "").trim().toLowerCase();
  if (!jid) return { tipo: "vazio" };
  if (jid.endsWith("@g.us")) return { tipo: "grupo" };
  if (jid.startsWith("status@") || jid.includes("@broadcast") || jid.endsWith("@newsletter")) {
    return { tipo: "status" };
  }
  if (jid.endsWith("@lid")) return { tipo: "lid" };

  const temDominio = jid.includes("@");
  if (temDominio && !DOMINIOS_DE_TELEFONE.some((d) => jid.endsWith(d))) {
    // Domínio novo que a gente não conhece. Tratar como telefone seria repetir
    // exatamente o erro do @lid com o próximo formato que a Meta inventar.
    return { tipo: "invalido" };
  }

  // `:12@s.whatsapp.net` — o sufixo depois dos dois-pontos é o dispositivo.
  const parte = jid.replace(/@.*$/, "").split(":")[0];
  const telefone = canonicoWa(parte);
  return telefone ? { tipo: "telefone", telefone } : { tipo: "invalido" };
}

/** Atalho para quem só quer o telefone. `null` quando o JID não é um. */
export function telefoneDoJid(bruto: unknown): string | null {
  const l = leituraDoJid(bruto);
  return l.tipo === "telefone" ? l.telefone : null;
}

/** Uma frase sobre o que foi descartado, para a tela mostrar em vez de "0". */
export function explicaDescarte(contagem: Partial<Record<LeituraJid["tipo"], number>>): string {
  const partes: string[] = [];
  const n = (k: LeituraJid["tipo"]) => contagem[k] ?? 0;
  if (n("lid") > 0) {
    partes.push(
      `${n("lid")} com identificador interno (@lid) — o WhatsApp novo esconde o telefone desses contatos, ` +
      `e eles só entram na caixa quando mandarem mensagem`,
    );
  }
  if (n("grupo") > 0) partes.push(`${n("grupo")} de grupo`);
  if (n("status") > 0) partes.push(`${n("status")} de status/transmissão`);
  if (n("invalido") > 0) partes.push(`${n("invalido")} sem telefone brasileiro válido`);
  return partes.length === 0 ? "" : `Ignoradas: ${partes.join("; ")}.`;
}
