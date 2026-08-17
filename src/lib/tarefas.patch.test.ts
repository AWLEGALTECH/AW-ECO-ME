import { expect, test } from "bun:test";
import { aplicarNaLinha } from "./tarefas";

const linha = () => ([
  { id: "e1", titulo: "Citação", status: "concluida", tasks: [
    { id: "t1", tipo: "acao", titulo: "A", conteudo: "", prazo: "2026-01-01", status: "X", ordem: 1 },
    { id: "t2", tipo: "acao", titulo: "B", conteudo: "", prazo: "", status: "X", ordem: 2 },
  ]},
  { id: "e2", titulo: "Sentença", status: "atual", tasks: [
    { id: "t3", tipo: "pendencia", titulo: "C", conteudo: "", prazo: "", status: "Pendente", ordem: 3 },
  ]},
  { id: "e3", titulo: "Recurso", status: "pendente", tasks: [] },
] as any);

test("edita só a tarefa endereçada", () => {
  const { linha: r, achou } = aplicarNaLinha(linha(), { etapaId: "e1", indice: 1 }, { titulo: "B editado", prazo: "2026-03-05" });
  expect(achou).toBe(true);
  expect(r[0].tasks![1].titulo).toBe("B editado");
  expect(r[0].tasks![1].prazo).toBe("2026-03-05");
  expect(r[0].tasks![0].titulo).toBe("A");          // vizinha intacta
  expect(r[1].tasks![0].titulo).toBe("C");          // outra etapa intacta
  expect(r[0].tasks![1].ordem).toBe(2);             // campo não tocado sobrevive
});

test("exclui só a tarefa endereçada", () => {
  const { linha: r, achou } = aplicarNaLinha(linha(), { etapaId: "e1", indice: 0 }, null);
  expect(achou).toBe(true);
  expect(r[0].tasks!.length).toBe(1);
  expect(r[0].tasks![0].id).toBe("t2");
  expect(r[1].tasks!.length).toBe(1);
});

test("não muda nada quando o endereço não existe", () => {
  for (const end of [{ etapaId: "e9", indice: 0 }, { etapaId: "e1", indice: 5 }, { etapaId: "e3", indice: 0 }, { etapaId: "e1", indice: -1 }]) {
    const orig = linha();
    const { linha: r, achou } = aplicarNaLinha(orig, end, { titulo: "não" });
    expect(achou).toBe(false);
    expect(JSON.stringify(r)).toBe(JSON.stringify(orig));
  }
});

test("não muta a entrada", () => {
  const orig = linha();
  const copia = JSON.stringify(orig);
  aplicarNaLinha(orig, { etapaId: "e1", indice: 0 }, { titulo: "mexido" });
  aplicarNaLinha(orig, { etapaId: "e2", indice: 0 }, null);
  expect(JSON.stringify(orig)).toBe(copia);
});

test("reabrir limpa o desfecho", () => {
  const base = aplicarNaLinha(linha(), { etapaId: "e1", indice: 0 }, { desfecho: "concluido", desfechoObs: "ok" }).linha;
  expect(base[0].tasks![0].desfecho).toBe("concluido");
  const r = aplicarNaLinha(base, { etapaId: "e1", indice: 0 }, { desfecho: undefined, desfechoObs: undefined }).linha;
  expect(r[0].tasks![0].desfecho).toBeUndefined();
  expect(r[0].tasks![0].titulo).toBe("A");
});
