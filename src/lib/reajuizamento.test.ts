import { test, expect } from "bun:test";
import {
  pedeReajuizamento, separarComarcaUf, demandaDeReajuizamento, temReajuizamentoAberto,
  ETAPA_REAJUIZAMENTO, STATUS_PEDE_REAJUIZAMENTO,
} from "./reajuizamento";

/* DUAS PETIÇÕES DO MESMO PEDIDO NA FILA VIRAM LITISPENDÊNCIA NO FÓRUM.
 *
 * É o erro caro desta tela, e é silencioso: as duas demandas parecem normais
 * no quadro, e o estrago só aparece quando o juiz manda extinguir uma. */

const proc = (o: Partial<Parameters<typeof demandaDeReajuizamento>[0]> = {}) => ({
  id: "p1",
  numero_processo: "0066720-60.2026.8.04.1000",
  materia: "PARCELA CRÉDITO PESSOAL",
  comarca_uf: "Manaus / AM",
  vara_juizo_origem: "22ª JEC",
  valor_causa: 12500.5,
  observacoes: null,
  ...o,
});

test("os dois status da casa abrem o reajuizamento", () => {
  /* "AG. REAJUIZAMENTO" é o que a equipe escreve hoje; "REAJUIZAR" veio da
     planilha original e ainda marca processos de verdade. Aceitar só um
     deixaria parte da fila sem o botão, sem nada na tela explicando. */
  expect(pedeReajuizamento("AG. REAJUIZAMENTO")).toBe(true);
  expect(pedeReajuizamento("REAJUIZAR")).toBe(true);
  expect([...STATUS_PEDE_REAJUIZAMENTO]).toEqual(["AG. REAJUIZAMENTO", "REAJUIZAR"]);
});

test("a planilha não é uniforme, e a comparação aguenta", () => {
  expect(pedeReajuizamento("ag. reajuizamento")).toBe(true);
  expect(pedeReajuizamento("  AG.  REAJUIZAMENTO  ")).toBe(true);
  expect(pedeReajuizamento("reajuizar")).toBe(true);
});

test("quem não está esperando reajuizamento não ganha botão", () => {
  expect(pedeReajuizamento("AG. CONTESTAÇÃO")).toBe(false);
  expect(pedeReajuizamento("ARQUIVADO")).toBe(false);
  expect(pedeReajuizamento(null)).toBe(false);
  expect(pedeReajuizamento("")).toBe(false);
});

/* ── comarca e UF ── */

test("separa a UF quando ela está lá", () => {
  expect(separarComarcaUf("Manaus / AM")).toEqual({ comarca: "Manaus", uf: "AM" });
  expect(separarComarcaUf("Manaus/AM")).toEqual({ comarca: "Manaus", uf: "AM" });
  expect(separarComarcaUf("São Paulo - SP")).toEqual({ comarca: "São Paulo", uf: "SP" });
  expect(separarComarcaUf("Rio Branco, AC")).toEqual({ comarca: "Rio Branco", uf: "AC" });
});

test("sem UF reconhecível, tudo vira comarca", () => {
  /* Melhor a comarca com sujeira do que perder a cidade inteira porque o final
     não era uma sigla. */
  expect(separarComarcaUf("Manaus")).toEqual({ comarca: "Manaus", uf: null });
  expect(separarComarcaUf("")).toEqual({ comarca: null, uf: null });
  expect(separarComarcaUf(null)).toEqual({ comarca: null, uf: null });
});

test("cidade de duas letras não é confundida com UF", () => {
  // "AM" sozinho não tem comarca antes, então não vira {comarca:"", uf:"AM"}
  expect(separarComarcaUf("AM")).toEqual({ comarca: "AM", uf: null });
});

/* ── o que o protocolo recebe ── */

test("a demanda diz que é reprotocolo e de qual processo, na primeira linha", () => {
  const d = demandaDeReajuizamento(proc(), "JOSÉ ALMYR ARAÚJO LOPES");
  expect(d.titulo).toBe("Reajuizar: JOSÉ ALMYR ARAÚJO LOPES");
  expect(d.descricao.split("\n")[0]).toBe("Reajuizamento de 0066720-60.2026.8.04.1000, extinto sem mérito.");
});

test("a demanda leva o que a pessoa do protocolo precisa digitar de novo", () => {
  const d = demandaDeReajuizamento(proc(), "Fulano");
  expect(d.descricao).toContain("PARCELA CRÉDITO PESSOAL");
  expect(d.descricao).toContain("22ª JEC");
  expect(d.descricao).toContain("Manaus / AM");
  expect(d.descricao).toContain("R$");
  // e os campos estruturados, que a tela de protocolo pergunta um a um
  expect(d.comarca).toBe("Manaus");
  expect(d.uf).toBe("AM");
  expect(d.valor_causa).toBe(12500.5);
  expect(d.desconto).toBe("PARCELA CRÉDITO PESSOAL");
});

test("as observações do processo anterior vêm inteiras, e por último", () => {
  /* É onde costuma estar o motivo da extinção, que é justamente o que não pode
     se repetir no reprotocolo. */
  const motivo = "Extinto por falta de comprovante de residência atualizado.";
  const d = demandaDeReajuizamento(proc({ observacoes: motivo }), "Fulano");
  expect(d.descricao).toContain(motivo);
  expect(d.descricao.trim().endsWith(motivo)).toBe(true);
});

test("processo pelado não gera demanda quebrada", () => {
  const d = demandaDeReajuizamento(
    { id: "p", numero_processo: null, materia: null, comarca_uf: null, vara_juizo_origem: null, valor_causa: null, observacoes: null },
    null,
  );
  expect(d.titulo).toBe("Reajuizar: cliente");
  expect(d.descricao).toBe("Reajuizamento de processo sem número, extinto sem mérito.");
  expect(d.comarca).toBeNull();
  expect(d.valor_causa).toBeNull();
});

/* ── a trava contra a segunda petição ── */

test("com demanda de reajuizamento viva, não se gera outra", () => {
  const dem = [{ etapa: ETAPA_REAJUIZAMENTO, status: "pendente", processo_id: "p1" }];
  expect(temReajuizamentoAberto(dem, "p1")).toBe(true);
});

test("cancelada não trava: quem cancelou quis desfazer", () => {
  const dem = [{ etapa: ETAPA_REAJUIZAMENTO, status: "cancelada", processo_id: "p1" }];
  expect(temReajuizamentoAberto(dem, "p1")).toBe(false);
});

test("a trava é por processo, e não por cliente", () => {
  /* O mesmo cliente pode ter dois processos extintos ao mesmo tempo, e os dois
     precisam voltar. */
  const dem = [{ etapa: ETAPA_REAJUIZAMENTO, status: "pendente", processo_id: "p1" }];
  expect(temReajuizamentoAberto(dem, "p2")).toBe(false);
});

test("demanda de outra etapa não trava o reajuizamento", () => {
  const dem = [{ etapa: "pronta_para_protocolo", status: "pendente", processo_id: "p1" }];
  expect(temReajuizamentoAberto(dem, "p1")).toBe(false);
});

test("a concluída continua travando", () => {
  /* Concluída quer dizer protocolada: gerar outra seria a segunda ação do
     mesmo pedido, que é o caso que vira litispendência. */
  const dem = [{ etapa: ETAPA_REAJUIZAMENTO, status: "concluida", processo_id: "p1" }];
  expect(temReajuizamentoAberto(dem, "p1")).toBe(true);
});
