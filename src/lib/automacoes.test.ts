import { test, expect } from "bun:test";
import {
  GATILHOS, GATILHOS_DEF, PASSOS_DEF, TIPOS_DE_PASSO, defDoGatilho, defDoPasso,
  gatilhoValido, tipoDePassoValido, passoNovo, novoIdDePasso,
  impedimentos, podeLigar, esperaBonita, resumoDoPasso, fraseDoGatilho,
  etapasOferecidas, resumoDoFluxo, contarExecucoes, CONDICOES_PADRAO, MAX_PASSOS,
  type Passo, type Execucao,
} from "./automacoes";

/* O fluxo de referência já responde a pergunta da base (`bases_todas`), porque
   quase todo teste aqui é sobre OUTRA coisa. A pergunta em si tem testes
   próprios logo abaixo. */
const fluxo = (passos: Passo[], extra: Partial<Parameters<typeof impedimentos>[0]> = {}) => ({
  nome: "Boas-vindas da base",
  gatilho: "lead_novo_na_base" as const,
  gatilho_config: { bases_todas: true },
  condicoes: CONDICOES_PADRAO,
  passos,
  ...extra,
});

const msg = (texto: string): Passo => ({ id: "a", tipo: "mensagem", texto, midias: [] });

test("todo gatilho e todo passo têm definição, e só os listados existem", () => {
  expect(GATILHOS_DEF.map((d) => d.chave)).toEqual([...GATILHOS]);
  expect(PASSOS_DEF.map((p) => p.chave)).toEqual([...TIPOS_DE_PASSO]);
  for (const g of GATILHOS) {
    const d = defDoGatilho(g);
    expect(d.chave).toBe(g);
    expect(d.rotulo.length).toBeGreaterThan(2);
    expect(d.descricao.length).toBeGreaterThan(8);
    expect(d.icone.length).toBeGreaterThan(2);
  }
  for (const t of TIPOS_DE_PASSO) {
    expect(defDoPasso(t).chave).toBe(t);
    expect(defDoPasso(t).rotulo.length).toBeGreaterThan(4);
  }
});

test("só o gatilho que abre conversa é o da base", () => {
  // é o único que dispara para quem ainda não tem conversa nenhuma; os outros
  // partem de uma conversa que já existe
  const abrem = GATILHOS_DEF.filter((g) => g.abreConversa).map((g) => g.chave);
  expect(abrem).toEqual(["lead_novo_na_base"]);
});

test("valor estranho vindo do banco não vira gatilho nem passo", () => {
  expect(gatilhoValido("lead_novo_na_base")).toBe(true);
  expect(gatilhoValido("quando_der_vontade")).toBe(false);
  expect(gatilhoValido(null)).toBe(false);
  expect(tipoDePassoValido("mensagem")).toBe(true);
  expect(tipoDePassoValido("ligar_para_o_lead")).toBe(false);
});

test("passo novo já nasce utilizável, e cada id é único", () => {
  expect(passoNovo("esperar").minutos).toBe(60);
  expect(passoNovo("tarefa").dias).toBe(1);
  expect(passoNovo("mensagem").midias).toEqual([]);
  const ids = new Set(Array.from({ length: 50 }, () => novoIdDePasso()));
  expect(ids.size).toBe(50);
});

/* ── o que impede de ligar ───────────────────────────────────────────────── */

test("fluxo completo liga", () => {
  expect(impedimentos(fluxo([msg("Olá {nome}, tudo bem?")]))).toEqual([]);
  expect(podeLigar(fluxo([msg("Oi")]))).toBe(true);
});

test("mensagem vazia não liga: sairia em branco para gente de verdade", () => {
  const e = impedimentos(fluxo([msg("   ")]));
  expect(e).toHaveLength(1);
  expect(e[0]).toContain("passo 1");
});

test("mensagem só com anexo é mensagem legítima", () => {
  const so: Passo = { id: "a", tipo: "mensagem", texto: "", midias: [{ path: "x", mime: "image/png", nome: "a.png", tipo: "imagem" }] };
  expect(impedimentos(fluxo([so]))).toEqual([]);
});

test("fluxo sem passo nenhum não liga", () => {
  expect(impedimentos(fluxo([]))[0]).toContain("não faz nada");
});

test("espera precisa ser de pelo menos um minuto e no máximo trinta dias", () => {
  expect(impedimentos(fluxo([msg("oi"), { id: "b", tipo: "esperar", minutos: 0 }]))[0]).toContain("passo 2");
  expect(impedimentos(fluxo([msg("oi"), { id: "b", tipo: "esperar", minutos: 60 * 24 * 31 }]))[0]).toContain("30 dias");
  expect(impedimentos(fluxo([msg("oi"), { id: "b", tipo: "esperar", minutos: 60 * 24 * 30 }]))).toEqual([]);
});

test("mover de etapa sem etapa, e tarefa sem título, não ligam", () => {
  expect(impedimentos(fluxo([{ id: "a", tipo: "mover_etapa", etapa: "" }]))[0]).toContain("etapa");
  expect(impedimentos(fluxo([{ id: "a", tipo: "tarefa", titulo: " ", dias: 1 }]))[0]).toContain("título");
});

test("parar se respondeu no primeiro passo não para nada", () => {
  // ele compara com o início da execução; no passo 1 esse início é agora
  const e = impedimentos(fluxo([{ id: "a", tipo: "parar_se_respondeu" }]));
  expect(e.some((m) => m.includes("depois de uma espera"))).toBe(true);
  // depois de uma espera, é o uso certo
  expect(impedimentos(fluxo([
    msg("primeira"), { id: "b", tipo: "esperar", minutos: 2880 },
    { id: "c", tipo: "parar_se_respondeu" }, msg("segunda"),
  ]))).toEqual([]);
});

test("o gatilho da base não liga enquanto ninguém disser QUAL base", () => {
  /* "Lista vazia quer dizer todas" parecia prático e era uma armadilha: quem
     escolhia o gatilho e não mexia na lista ligava um fluxo escutando TODAS as
     planilhas do número sem nunca ter dito isso. */
  const semResposta = fluxo([msg("oi")], { gatilho_config: {} });
  expect(impedimentos(semResposta).some((e) => e.includes("qual base"))).toBe(true);
  expect(podeLigar(semResposta)).toBe(false);

  // as duas respostas explícitas valem
  expect(impedimentos(fluxo([msg("oi")], { gatilho_config: { bases_todas: true } }))).toEqual([]);
  expect(impedimentos(fluxo([msg("oi")], { gatilho_config: { fonte_ids: ["f1"] } }))).toEqual([]);

  // e a frase do cartão distingue "quero todas" de "ainda não respondi"
  expect(fraseDoGatilho("lead_novo_na_base", {})).toBe("falta escolher em qual base");
  expect(fraseDoGatilho("lead_novo_na_base", { bases_todas: true })).toContain("qualquer base");
});

test("os outros gatilhos não exigem base nenhuma", () => {
  for (const g of ["etapa_mudou", "mensagem_recebida", "virou_cliente"] as const) {
    expect(impedimentos(fluxo([msg("oi")], { gatilho: g, gatilho_config: {} }))).toEqual([]);
  }
});

test("o gatilho de silêncio exige um número de dias plausível", () => {
  const semDias = fluxo([msg("oi")], { gatilho: "sem_resposta" as const, gatilho_config: {} });
  expect(impedimentos(semDias)[0]).toContain("1 e 365");
  const ok = fluxo([msg("oi")], { gatilho: "sem_resposta" as const, gatilho_config: { dias: 3 } });
  expect(impedimentos(ok)).toEqual([]);
});

test("o teto por dia é a trava contra a planilha de 600 linhas", () => {
  expect(impedimentos(fluxo([msg("oi")], { condicoes: { so_horario_comercial: true, teto_dia: 0 } }))[0]).toContain("teto");
  expect(impedimentos(fluxo([msg("oi")], { condicoes: { so_horario_comercial: true, teto_dia: 5000 } }))[0]).toContain("teto");
});

test("passos demais não ligam", () => {
  const muitos = Array.from({ length: MAX_PASSOS + 1 }, (_, i) => msg(`m${i}`));
  expect(impedimentos(fluxo(muitos)).some((e) => e.includes(String(MAX_PASSOS)))).toBe(true);
});

test("um fluxo quebrado acusa TUDO que está quebrado, não só o primeiro", () => {
  // quem está montando quer a lista inteira, não descobrir um erro por vez
  const e = impedimentos(fluxo([msg(""), { id: "b", tipo: "tarefa", titulo: "", dias: 1 }], { nome: "  " }));
  expect(e.length).toBeGreaterThanOrEqual(3);
});

/* ── como o fluxo se lê ──────────────────────────────────────────────────── */

test("espera aparece na unidade de quem marcou, não em minutos", () => {
  expect(esperaBonita(30)).toBe("30 min");
  expect(esperaBonita(60)).toBe("1 hora");
  expect(esperaBonita(120)).toBe("2 horas");
  expect(esperaBonita(60 * 24)).toBe("1 dia");
  expect(esperaBonita(60 * 24 * 2)).toBe("2 dias");
  expect(esperaBonita(90)).toBe("1h30");
  expect(esperaBonita(0)).toBe("0 min");
});

test("o resumo do passo cabe no cartão e nunca sai vazio", () => {
  expect(resumoDoPasso(msg("Olá, tudo bem?"))).toBe("Olá, tudo bem?");
  expect(resumoDoPasso(msg("x".repeat(200))).endsWith("…")).toBe(true);
  expect(resumoDoPasso(msg("").valueOf() as Passo)).toBe("mensagem em branco");
  expect(resumoDoPasso({ id: "a", tipo: "esperar", minutos: 2880 })).toBe("2 dias");
  expect(resumoDoPasso({ id: "a", tipo: "tarefa", titulo: "Ligar", dias: 1 })).toBe("Ligar · amanhã");
  expect(resumoDoPasso({ id: "a", tipo: "tarefa", titulo: "Ligar", dias: 0 })).toBe("Ligar · hoje");
  expect(resumoDoPasso({ id: "a", tipo: "tarefa", titulo: "Ligar", dias: 3 })).toBe("Ligar · em 3 dias");
  expect(resumoDoPasso({ id: "a", tipo: "mover_etapa", etapa: "triagem" })).toBe("Triagem");
  expect(resumoDoPasso({ id: "a", tipo: "parar_se_respondeu" }).length).toBeGreaterThan(5);
});

test("a frase do gatilho diz o que foi configurado, e não o nome do campo", () => {
  const nome = (id: string) => ({ f1: "LP Bradesco", f2: "LP Empresarial" }[id] ?? "base");
  expect(fraseDoGatilho("lead_novo_na_base", { bases_todas: true }, nome)).toContain("qualquer base");
  expect(fraseDoGatilho("lead_novo_na_base", { fonte_ids: ["f1", "f2"] }, nome))
    .toBe("quando chega lead novo em LP Bradesco, LP Empresarial");
  expect(fraseDoGatilho("etapa_mudou", { etapas: ["triagem"] })).toContain("Triagem");
  expect(fraseDoGatilho("etapa_mudou", {})).toContain("qualquer que seja");
  expect(fraseDoGatilho("mensagem_recebida", { contendo: "extrato" })).toContain("extrato");
  expect(fraseDoGatilho("sem_resposta", { dias: 1 })).toContain("1 dia sem");
  expect(fraseDoGatilho("sem_resposta", { dias: 3 })).toContain("3 dias sem");
  expect(fraseDoGatilho("virou_cliente", {}).length).toBeGreaterThan(10);
});

test("as etapas oferecidas juntam as duas jornadas sem repetir", () => {
  // o mesmo número atende lead das duas réguas; oferecer só uma esconderia metade
  const todas = etapasOferecidas();
  const chaves = todas.map((e) => e.chave);
  expect(new Set(chaves).size).toBe(chaves.length);
  expect(chaves).toContain("na_base");
  expect(chaves).toContain("proposta");
  expect(chaves).toContain("triagem");
  // com jornada, só as dela
  expect(etapasOferecidas("bradesco").map((e) => e.chave)).toContain("aguardando_extrato");
  expect(etapasOferecidas("padrao").map((e) => e.chave)).not.toContain("aguardando_extrato");
});

test("o resumo do fluxo responde “o que isso vai fazer” antes de ligar", () => {
  const r = resumoDoFluxo([
    msg("primeira"), { id: "b", tipo: "esperar", minutos: 60 * 24 * 2 },
    { id: "c", tipo: "parar_se_respondeu" }, msg("segunda"),
    { id: "d", tipo: "esperar", minutos: 60 * 24 * 5 }, msg("terceira"),
  ]);
  expect(r.mensagens).toBe(3);
  expect(esperaBonita(r.duracaoMin)).toBe("7 dias");
});

test("as execuções se contam por situação, e situação sem nenhuma dá zero", () => {
  const e = (status: Execucao["status"]): Execucao => ({
    id: "x", automacao_id: "a", conversa_id: null, telefone: null, status, passo: 0,
    detalhe: null, erro: null, disparada_em: "2026-09-15T10:00:00Z", rodar_em: null, terminada_em: null,
  });
  const c = contarExecucoes([e("concluida"), e("concluida"), e("falhou")]);
  expect(c.concluida).toBe(2);
  expect(c.falhou).toBe(1);
  expect(c.pendente).toBe(0);
  expect(contarExecucoes([]).concluida).toBe(0);
});
