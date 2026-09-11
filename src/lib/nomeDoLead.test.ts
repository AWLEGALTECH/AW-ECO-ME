import { test, expect } from "bun:test";
import {
  capitalizar, nomeCurto, nomeParaMostrar, melhorQue, telefoneNaTela, telefoneParaCopiar,
} from "./nomeDoLead";

test("o nome do extrato vira nome de gente", () => {
  expect(capitalizar("JOSÉ ALMYR ARAÚJO LOPES")).toBe("José Almyr Araújo Lopes");
  // partícula não vira nome próprio
  expect(capitalizar("MARIA DA SILVA DOS SANTOS")).toBe("Maria da Silva dos Santos");
  expect(capitalizar("")).toBe("");
});

test("primeiro e segundo nome é como se chama alguém", () => {
  expect(nomeCurto("JOSÉ ALMYR ARAÚJO LOPES")).toBe("José Almyr");
  expect(nomeCurto("LUAN ÁSAF LIMA FERNANDES")).toBe("Luan Ásaf");
});

test("a partícula é pulada, porque 'Maria da' não é nome de ninguém", () => {
  expect(nomeCurto("MARIA DA SILVA")).toBe("Maria Silva");
  expect(nomeCurto("PEDRO DOS SANTOS BARROS")).toBe("Pedro Santos");
  expect(nomeCurto("ANA E JOANA COSTA")).toBe("Ana Joana");
});

test("nome de uma palavra só continua sendo ele", () => {
  expect(nomeCurto("MADONNA")).toBe("Madonna");
  expect(nomeCurto("  ")).toBe("");
  expect(nomeCurto(null)).toBe("");
});

/* O CASO QUE MOTIVOU TUDO: o lead se chama "😎" no WhatsApp e tem 27 mensagens
   na conversa. Sem o nome do extrato, quem atende fala com um emoji. */
test("com nome real, é ele que aparece, e dá para ver o do WhatsApp", () => {
  const r = nomeParaMostrar({ nomeReal: "JOSÉ ALMYR ARAÚJO LOPES", nomeWa: "😎" });
  expect(r.texto).toBe("José Almyr");
  expect(r.podeTrocar).toBe(true);
  expect(r.oOutro).toBe("😎");

  const trocado = nomeParaMostrar({ nomeReal: "JOSÉ ALMYR ARAÚJO LOPES", nomeWa: "😎" }, true);
  expect(trocado.texto).toBe("😎");
  expect(trocado.oOutro).toBe("José Almyr");
});

test("sem nome real, sobra o do WhatsApp e não há o que trocar", () => {
  const r = nomeParaMostrar({ nomeWa: "😎", telefone: "5592988199101" });
  expect(r.texto).toBe("😎");
  expect(r.podeTrocar).toBe(false);
});

test("sem nome nenhum, o telefone é o nome", () => {
  const r = nomeParaMostrar({ telefone: "5592988199101" });
  expect(r.texto).toBe("(92) 98819-9101");
  expect(r.podeTrocar).toBe(false);
  expect(nomeParaMostrar({}).texto).toBe("sem nome");
});

test("nomes iguais dos dois lados não ganham botão de troca", () => {
  // um botão que mostra a mesma coisa ensina a não clicar nos botões
  const r = nomeParaMostrar({ nomeReal: "LUAN ÁSAF LIMA FERNANDES", nomeWa: "Luan Ásaf" });
  expect(r.texto).toBe("Luan Ásaf");
  expect(r.podeTrocar).toBe(false);
});

test("a ordem é a da procedência, não a do relógio", () => {
  // o contrato vale mais que o extrato, que vale mais que o apelido
  expect(melhorQue("contrato", "pre_cliente")).toBe(true);
  expect(melhorQue("analise", "whatsapp")).toBe(true);
  expect(melhorQue("whatsapp", "analise")).toBe(false);
  // empate mantém o que já estava: reescrever à toa é ruído no histórico
  expect(melhorQue("analise", "analise")).toBe(false);
  // sem nada antes, qualquer fonte serve
  expect(melhorQue("whatsapp", null)).toBe(true);
});

test("o telefone se lê e se copia de jeitos diferentes", () => {
  expect(telefoneNaTela("5592988199101")).toBe("(92) 98819-9101");
  expect(telefoneNaTela("559298819910")).toBe("(92) 9881-9910");
  expect(telefoneNaTela(null)).toBe("");
  // copiar é para colar em outro sistema, e aí o formato internacional serve
  expect(telefoneParaCopiar("5592988199101")).toBe("+5592988199101");
  expect(telefoneParaCopiar("(92) 98819-9101")).toBe("92988199101");
});
