import { test, expect } from "bun:test";
import {
  achatar, inserirPasso, todosOsPassos, rotuloDaPosicao, posicaoDoPasso,
  atualizarPasso, removerPasso, listaDoRamo, ramosDoPasso, nomeDoRamo,
  type PassoComRamos,
} from "./fluxoDePassos";

/* A ESCOLHA DENTRO DO SE É O PONTO INTEIRO.
 *
 * A recepção tem dois eixos que não são o mesmo tipo de pergunta: "o lead já
 * nos escreveu?" decide a POSTURA (responder ou abordar) e é sim/não; "o que
 * ele respondeu no formulário?" decide o ASSUNTO e tem N respostas. Um dentro
 * do outro é o formato real do problema, e o `achatar` antigo, que não descia
 * nos ramos, largaria o lead no meio do caminho sem avisar. */

const msg = (id: string): PassoComRamos => ({ id, tipo: "mensagem" });

/** se(ja_escreveu) { entao: escolha(Situação){ c1, c2, senao } , senao: [z] } */
const arvore = (): PassoComRamos[] => [
  {
    id: "se1",
    tipo: "se",
    entao: [
      {
        id: "esc1",
        tipo: "escolha",
        casos: [
          { id: "c1", passos: [msg("m-processo")] },
          { id: "c2", passos: [msg("m-demitir")] },
        ],
        senao: [msg("m-generico")],
      },
    ],
    senao: [msg("z")],
  },
  msg("fim"),
];

test("sem decisão nenhuma, só os marcadores e a fila principal correm", () => {
  expect(achatar(arvore(), {}).map((p) => p.id)).toEqual(["se1", "fim"]);
});

test("decidir só o Se traz a Escolha, mas ainda não traz caso nenhum", () => {
  // A Escolha entra como marcador: o executor ainda vai decidi-la ao chegar
  // nela. Se ela trouxesse um caso aqui, seria um caso não escolhido.
  expect(achatar(arvore(), { se1: "entao" }).map((p) => p.id)).toEqual(["se1", "esc1", "fim"]);
});

test("as duas decisões descem até o passo do caso escolhido", () => {
  expect(achatar(arvore(), { se1: "entao", esc1: "c2" }).map((p) => p.id))
    .toEqual(["se1", "esc1", "m-demitir", "fim"]);
});

test("o lado de ninguém da Escolha é um ramo como outro qualquer", () => {
  expect(achatar(arvore(), { se1: "entao", esc1: "senao" }).map((p) => p.id))
    .toEqual(["se1", "esc1", "m-generico", "fim"]);
});

test("pelo lado não do Se, a Escolha nem aparece", () => {
  expect(achatar(arvore(), { se1: "senao", esc1: "c1" }).map((p) => p.id))
    .toEqual(["se1", "z", "fim"]);
});

test("caso apagado depois do disparo não trava a execução", () => {
  /* A pessoa editou o fluxo enquanto um lead estava esperando dois dias. O
     ramo gravado sumiu. Seguir em frente sem os passos daquele caso é o pior
     resultado aceitável; estourar deixaria a execução em "falhou" para sempre. */
  expect(achatar(arvore(), { se1: "entao", esc1: "c-que-nao-existe" }).map((p) => p.id))
    .toEqual(["se1", "esc1", "fim"]);
});

test("a ordem do achatado é a ordem em que o executor vai rodar", () => {
  // Índice anterior nunca muda quando uma decisão nova entra: é o que deixa
  // retomar pelo número do passo depois de uma espera.
  const so1 = achatar(arvore(), { se1: "entao" }).map((p) => p.id);
  const so2 = achatar(arvore(), { se1: "entao", esc1: "c1" }).map((p) => p.id);
  expect(so2.slice(0, 2)).toEqual(so1.slice(0, 2));
});

test("todosOsPassos enxerga o que está dentro dos casos", () => {
  expect(todosOsPassos(arvore()).map((p) => p.id))
    .toEqual(["se1", "esc1", "m-processo", "m-demitir", "m-generico", "z", "fim"]);
});

test("a árvore só vai até dois níveis: Se dentro de ramo é recusado", () => {
  const base = arvore();
  const depois = inserirPasso(base, { id: "novo", tipo: "se" }, { indice: 0, dentroDe: { id: "se1", ramo: "entao" } });
  expect(depois).toEqual(base);
});

test("Escolha dentro do Se entra: é o caso que existe para funcionar", () => {
  const base: PassoComRamos[] = [{ id: "se1", tipo: "se", entao: [], senao: [] }];
  const depois = inserirPasso(base, { id: "e", tipo: "escolha" }, { indice: 0, dentroDe: { id: "se1", ramo: "entao" } });
  expect(listaDoRamo(depois[0], "entao")?.map((p) => p.id)).toEqual(["e"]);
});

test("Escolha dentro de Escolha é recusada, senão seria o terceiro nível", () => {
  const base: PassoComRamos[] = [
    { id: "e1", tipo: "escolha", casos: [{ id: "c1", passos: [] }], senao: [] },
  ];
  const depois = inserirPasso(base, { id: "e2", tipo: "escolha" }, { indice: 0, dentroDe: { id: "e1", ramo: "c1" } });
  expect(depois).toEqual(base);
});

test("um passo comum entra dentro de um caso", () => {
  const base: PassoComRamos[] = [
    { id: "e1", tipo: "escolha", casos: [{ id: "c1", passos: [] }], senao: [] },
  ];
  const depois = inserirPasso(base, msg("m"), { indice: 0, dentroDe: { id: "e1", ramo: "c1" } });
  expect(listaDoRamo(depois[0], "c1")?.map((p) => p.id)).toEqual(["m"]);
});

test("inserir num ramo que não existe devolve a lista intacta", () => {
  const base = arvore();
  expect(inserirPasso(base, msg("m"), { indice: 0, dentroDe: { id: "esc1", ramo: "c9" } })).toEqual(base);
});

test("editar e remover alcançam quem está dentro de um caso", () => {
  const editado = atualizarPasso(arvore(), "m-demitir", { tipo: "tarefa" });
  expect(todosOsPassos(editado).find((p) => p.id === "m-demitir")?.tipo).toBe("tarefa");

  const removido = removerPasso(arvore(), "m-processo");
  expect(todosOsPassos(removido).map((p) => p.id)).not.toContain("m-processo");
  // e não leva o irmão junto
  expect(todosOsPassos(removido).map((p) => p.id)).toContain("m-demitir");
});

test("a posição de quem mora num caso aponta para o caso, não para o Se", () => {
  const pos = posicaoDoPasso(arvore(), "m-demitir");
  expect(pos?.ramo).toBe("c2");
  expect(pos?.pai?.id).toBe("esc1");
});

test("o rótulo situa sem obrigar a contar caixinha", () => {
  expect(rotuloDaPosicao(arvore(), "fim")).toBe("Passo 2");
  expect(rotuloDaPosicao(arvore(), "z")).toBe("Passo 1 · não 1");
  // dentro do caso o pai é a Escolha, que na fila principal não está: o que
  // importa é o nome do ramo, e ele diz qual caso é.
  expect(rotuloDaPosicao(arvore(), "m-generico")).toContain("os demais");
});

test("o lado de ninguém vem depois dos casos, que é como se lê um funil", () => {
  const esc = todosOsPassos(arvore()).find((p) => p.id === "esc1")!;
  expect(ramosDoPasso(esc).map((r) => r.chave)).toEqual(["c1", "c2", "senao"]);
  expect(nomeDoRamo(esc, "c2")).toBe("caso 2");
  expect(nomeDoRamo(esc, "senao")).toBe("os demais");
});

test("execução antiga, gravada antes da Escolha existir, continua válida", () => {
  /* `decisoes` sempre foi um mapa de id para string, e "entao"/"senao"
     continuam sendo chaves de ramo. Nenhuma linha de wa_automacao_execucoes
     precisa ser convertida. */
  const so_se: PassoComRamos[] = [{ id: "s", tipo: "se", entao: [msg("a")], senao: [msg("b")] }];
  expect(achatar(so_se, { s: "entao" }).map((p) => p.id)).toEqual(["s", "a"]);
  expect(achatar(so_se, { s: "senao" }).map((p) => p.id)).toEqual(["s", "b"]);
});
