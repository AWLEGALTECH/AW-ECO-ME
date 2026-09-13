import { test, expect } from "bun:test";
import {
  SITUACOES, SITUACOES_DEF, situacaoValida, situacaoOuPadrao, defDaSituacao,
  mostraSecao, situacaoSugerida, ehPendente, consequenciasDaTroca,
} from "./situacaoDoContato";

test("toda situação tem definição, e só as cinco existem", () => {
  expect(SITUACOES).toHaveLength(5);
  for (const s of SITUACOES) {
    const d = defDaSituacao(s);
    expect(d.chave).toBe(s);
    expect(d.rotulo.length).toBeGreaterThan(2);
    expect(d.descricao.length).toBeGreaterThan(8);
  }
  expect(SITUACOES_DEF.map((d) => d.chave)).toEqual([...SITUACOES]);
});

test("valor gravado errado não derruba a ficha: cai em lead", () => {
  expect(situacaoValida("cliente")).toBe(true);
  expect(situacaoValida("socio")).toBe(false);
  expect(situacaoValida(null)).toBe(false);
  expect(situacaoOuPadrao("holograma")).toBe("lead");
  expect(situacaoOuPadrao(undefined)).toBe("lead");
  expect(situacaoOuPadrao("interno")).toBe("interno");
});

test("lead vê funil e não vê coisa de cliente", () => {
  expect(mostraSecao("lead", "jornada")).toBe(true);
  expect(mostraSecao("lead", "followup")).toBe(true);
  expect(mostraSecao("lead", "programadas")).toBe(true);
  expect(mostraSecao("lead", "chegada")).toBe(true);
  expect(mostraSecao("lead", "processos")).toBe(false);
  expect(mostraSecao("lead", "pendencias")).toBe(false);
  expect(mostraSecao("lead", "ficha_cliente")).toBe(false);
});

test("cliente vê processos e pendências, e não vê funil nenhum", () => {
  // "no funil há 6 dias" para quem tem cinco processos ativos é ruído
  expect(mostraSecao("cliente", "processos")).toBe(true);
  expect(mostraSecao("cliente", "pendencias")).toBe(true);
  expect(mostraSecao("cliente", "ficha_cliente")).toBe(true);
  expect(mostraSecao("cliente", "jornada")).toBe(false);
  expect(mostraSecao("cliente", "followup")).toBe(false);
  expect(mostraSecao("cliente", "chegada")).toBe(false);
});

test("contraparte, interno e outro veem o mínimo: nem funil, nem processo", () => {
  // "Jornada Bradesco" para o advogado do banco é errado
  for (const s of ["contraparte", "interno", "outro"] as const) {
    expect(mostraSecao(s, "jornada")).toBe(false);
    expect(mostraSecao(s, "followup")).toBe(false);
    expect(mostraSecao(s, "processos")).toBe(false);
    expect(mostraSecao(s, "pendencias")).toBe(false);
  }
});

test("a sugestão vem dos dados, mas o que foi decidido à mão vence", () => {
  // sem nada: lead
  expect(situacaoSugerida({})).toBe("lead");
  // ficha de cliente ou virada: cliente
  expect(situacaoSugerida({ clienteId: "c1" })).toBe("cliente");
  expect(situacaoSugerida({ virouClienteEm: "2026-09-13" })).toBe("cliente");
  // decisão gravada diferente de lead sobrevive aos dados: o Luan é da equipe
  // mesmo tendo passado pela virada num teste
  expect(situacaoSugerida({ situacaoGravada: "interno", virouClienteEm: "2026-09-13" })).toBe("interno");
  expect(situacaoSugerida({ situacaoGravada: "contraparte", clienteId: "c1" })).toBe("contraparte");
  // gravado como lead ainda deixa os dados falarem
  expect(situacaoSugerida({ situacaoGravada: "lead", clienteId: "c1" })).toBe("cliente");
});

test("pendência é o que ainda está na mão de alguém", () => {
  expect(ehPendente("pendente")).toBe(true);
  expect(ehPendente("em_andamento")).toBe(true);
  // passado não é pendência: sem isto o cliente com 30 demandas encerradas
  // teria uma seção enorme dizendo nada
  expect(ehPendente("concluida")).toBe(false);
  expect(ehPendente("resolvida")).toBe(false);
  expect(ehPendente("cancelada")).toBe(false);
  expect(ehPendente(null)).toBe(false);
});

/* ── o "tem certeza?" diz o que vai acontecer de verdade ──────────────────── */

test("lead que vira cliente perde o funil, ganha processos e sai da régua", () => {
  const c = consequenciasDaTroca("lead", "cliente");
  expect(c.perde).toEqual(["Follow-up", "Jornada", "Programadas", "tempo no funil"]);
  expect(c.ganha).toEqual(["Processos", "Pendências", "atalho para a ficha do cliente"]);
  expect(c.saiDaRegua).toBe(true);
  expect(c.voltaARegua).toBe(false);
});

test("lead que vira contraparte perde o funil e não ganha nada: só sai da régua", () => {
  const c = consequenciasDaTroca("lead", "contraparte");
  expect(c.perde.length).toBe(4);
  expect(c.ganha).toEqual([]);
  expect(c.saiDaRegua).toBe(true);
});

test("cliente que volta a lead recupera o funil e volta a poder ser cobrado", () => {
  const c = consequenciasDaTroca("cliente", "lead");
  expect(c.ganha).toEqual(["Follow-up", "Jornada", "Programadas", "tempo no funil"]);
  expect(c.perde).toEqual(["Processos", "Pendências", "atalho para a ficha do cliente"]);
  expect(c.saiDaRegua).toBe(false);
  expect(c.voltaARegua).toBe(true);
});

test("trocar entre situações que não são lead não mexe na régua", () => {
  const c = consequenciasDaTroca("interno", "contraparte");
  expect(c.ganha).toEqual([]);
  expect(c.perde).toEqual([]);
  expect(c.saiDaRegua).toBe(false);
  expect(c.voltaARegua).toBe(false);
});

test("as consequências vêm da mesma regra que desenha a ficha", () => {
  // se um dia mostraSecao mudar, o aviso muda junto, sem texto para atualizar
  for (const de of SITUACOES) for (const para of SITUACOES) {
    const c = consequenciasDaTroca(de, para);
    for (const nome of c.ganha) expect(nome.length).toBeGreaterThan(3);
    if (de === para) { expect(c.ganha).toEqual([]); expect(c.perde).toEqual([]); }
  }
});
