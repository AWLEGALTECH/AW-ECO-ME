// COMEÇAR UMA CONVERSA COM QUEM AINDA NÃO ESCREVEU.
//
// A caixa de entrada é reativa por natureza: ela só conhece quem mandou
// mensagem. Mas metade do atendimento é o contrário — o lead ligou, deixou o
// número num formulário, veio por indicação, e é a Adria que abre a conversa.
//
// O que mora aqui é o tratamento do número digitado à mão, que é onde esse
// caminho erra: telefone errado não dá erro, dá silêncio. A mensagem sai, o
// WhatsApp aceita, e ninguém do outro lado recebe nada. Por isso a validação é
// chata de propósito, e por isso a edge function ainda pergunta pra Evolution
// se o número existe antes de criar a conversa.

import { canonicalizarTelefone } from "./phone";

/**
 * A máscara enquanto a pessoa digita: 92988124471 → (92) 98812-4471.
 *
 * Vai se formando aos poucos em vez de só no fim — assim o "(" aparecendo
 * confirma que o DDD foi entendido como DDD, e quem colou um número torto vê
 * na hora que ficou torto.
 */
export function mascaraTelefone(bruto: string): string {
  let d = String(bruto || "").replace(/\D/g, "");
  // Colado com o 55 na frente: tira, senão a máscara come o DDD.
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export interface Aferido {
  ok: boolean;
  /** 13 dígitos (55 + DDD + 9 dígitos), pronto pro banco e pra Evolution */
  canonico: string;
  /** por que não serve — em português, pra aparecer embaixo do campo */
  erro?: string;
}

/**
 * O número digitado serve?
 *
 * Duas checagens que pegam quase todo erro de digitação real:
 *
 * DDD entre 11 e 99, porque não existe DDD começando com 0 ou 1 — e "011",
 * hábito antigo de quem escreve com a operadora na frente, entraria como DDD 01
 * e viraria um número inteiro deslocado.
 *
 * Celular começando em 9. Quem digita um fixo (3214-5678) tem 10 dígitos, e o
 * canonicalizador — que existe pra consertar celular ANTIGO de Manaus, sem o 9 —
 * enfia um 9 na frente e inventa um número que provavelmente não existe. Com 11
 * dígitos dá pra saber a diferença e recusar; com 10, não dá, e é por isso que
 * quem confirma de verdade é a Evolution.
 */
export function aferirTelefone(bruto: string): Aferido {
  const d = String(bruto || "").replace(/\D/g, "");
  if (d.length === 0) return { ok: false, canonico: "", erro: "Digite o número." };

  const semPais = d.startsWith("55") && (d.length === 12 || d.length === 13) ? d.slice(2) : d;
  if (semPais.length < 10) return { ok: false, canonico: "", erro: "Faltam dígitos — use DDD + número." };
  if (semPais.length > 11) return { ok: false, canonico: "", erro: "Dígitos demais." };

  const ddd = Number(semPais.slice(0, 2));
  if (!(ddd >= 11 && ddd <= 99)) return { ok: false, canonico: "", erro: `DDD ${semPais.slice(0, 2)} não existe.` };

  if (semPais.length === 11 && semPais[2] !== "9") {
    return { ok: false, canonico: "", erro: "Celular no Brasil começa com 9 depois do DDD." };
  }

  const canonico = canonicalizarTelefone(d);
  if (canonico.length !== 13) return { ok: false, canonico: "", erro: "Número fora do formato." };
  return { ok: true, canonico };
}

/**
 * O nome que a conversa nova ganha — ou null.
 *
 * Null de propósito quando ninguém digitou nada: a tela já mostra o telefone
 * formatado quando não há nome, e assim que a pessoa responder o WhatsApp manda
 * o nome do perfil e o webhook preenche. Gravar "Sem nome" aqui atrapalharia
 * esse preenchimento e ainda apareceria na lista como se fosse o nome dela.
 */
export function nomeDaConversaNova(nome: string | null | undefined): string | null {
  const n = String(nome || "").trim();
  return n.length > 0 ? n : null;
}
