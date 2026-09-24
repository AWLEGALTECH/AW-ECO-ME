import { test, expect } from "bun:test";
import {
  pedeReajuizamento, separarComarcaUf, demandaDeReajuizamento, temReajuizamentoAberto,
  ETAPA_REAJUIZAMENTO, STATUS_PEDE_REAJUIZAMENTO, textoDaCausa, faltaNaCausa,
  partesDaDemanda, trocarMotivoNaDescricao,
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

/* ── por que a ação caiu ── */

const rotulo = (k: string) => ({
  comprovante_residencia: "Comprovante de residência no nome",
  extratos_bancarios: "Extratos bancários",
  personalizada: "Outro (personalizada)",
}[k] ?? k);

test("o motivo livre vai inteiro para a ficha", () => {
  expect(textoDaCausa({ tipo: "motivo", texto: "  Extinto por ausência na audiência.  " }))
    .toBe("Extinto por ausência na audiência.");
});

test("a pendência vira uma frase que diz o que buscar", () => {
  /* Quem lê o banner seis meses depois precisa entender a causa sem abrir a
     esteira, e "aguardando documentos" sozinho não diz quais. */
  expect(textoDaCausa({ tipo: "pendencia", pendencias: ["comprovante_residencia", "extratos_bancarios"] }, rotulo))
    .toBe("Aguardando documentos para reajuizar: Comprovante de residência no nome, Extratos bancários.");
});

test("o detalhe da pendência personalizada entra na frase", () => {
  const t = textoDaCausa(
    { tipo: "pendencia", pendencias: ["personalizada"], detalhe: "Declaração do INSS atualizada." },
    rotulo,
  );
  expect(t).toContain("Declaração do INSS atualizada.");
});

test("motivo vazio não passa", () => {
  expect(faltaNaCausa({ tipo: "motivo", texto: "   " })).toBe("Escreva o motivo do reajuizamento.");
  expect(faltaNaCausa({ tipo: "motivo", texto: "caiu por isso" })).toBeNull();
});

test("pendência sem tipo escolhido não passa", () => {
  expect(faltaNaCausa({ tipo: "pendencia", pendencias: [] })).toBe("Escolha ao menos uma pendência.");
});

test("personalizada sem descrição não passa: viraria uma pendência chamada 'Outro'", () => {
  expect(faltaNaCausa({ tipo: "pendencia", pendencias: ["personalizada"] }))
    .toBe("Descreva a pendência personalizada.");
  expect(faltaNaCausa({ tipo: "pendencia", pendencias: ["personalizada"], detalhe: "x" })).toBeNull();
});

test("a causa é a primeira coisa depois do número, na demanda", () => {
  const d = demandaDeReajuizamento(proc(), "Fulano", "Extinto por ausência na audiência.");
  const l = d.descricao.split("\n");
  expect(l[0]).toContain("Reajuizamento de");
  expect(l[1]).toBe("Motivo: Extinto por ausência na audiência.");
});

test("sem causa, a descrição continua válida", () => {
  const d = demandaDeReajuizamento(proc(), "Fulano", null);
  expect(d.descricao).not.toContain("Motivo:");
  expect(d.descricao.split("\n")[1]).toContain("Matéria:");
});

/* LER DE VOLTA O QUE A DEMANDA ESCREVEU.
 *
 * O defeito que isto conserta (chefe, 22/09): a demanda chegava na esteira com
 * o motivo escrito na descrição, e a tela que abre ao clicar no cartão não
 * mostrava nada disso. Quem ia reprotocolar não tinha como saber o que não
 * podia repetir, que é a única informação que essa demanda existe para
 * carregar. */

test("lê de volta o motivo e as observações que a própria demanda escreveu", () => {
  const d = demandaDeReajuizamento(
    proc({ observacoes: "Cliente mudou de endereço em 2025." }),
    "Fulano",
    "Extinto por ausência na audiência de conciliação.",
  );
  const p = partesDaDemanda(d.descricao);
  expect(p.numero).toBe("0066720-60.2026.8.04.1000");
  expect(p.motivo).toBe("Extinto por ausência na audiência de conciliação.");
  expect(p.observacoes).toBe("Cliente mudou de endereço em 2025.");
});

/* O motivo é textarea: quem escreve três linhas quer as três. Ler "a linha que
   começa com Motivo:" devolveria só a primeira, e a parte que importa costuma
   estar no fim. */
test("motivo com várias linhas volta inteiro, sem engolir o campo seguinte", () => {
  const d = demandaDeReajuizamento(proc(), "Fulano", "Não juntou o extrato.\nO juiz deu 15 dias e o prazo correu.");
  const p = partesDaDemanda(d.descricao);
  expect(p.motivo).toBe("Não juntou o extrato.\nO juiz deu 15 dias e o prazo correu.");
  expect(p.motivo).not.toContain("Matéria");
});

test("a causa por pendência também volta legível", () => {
  const causa = textoDaCausa({ tipo: "pendencia", pendencias: ["rg", "comprovante"] }, (k) => k.toUpperCase());
  const d = demandaDeReajuizamento(proc(), "Fulano", causa);
  expect(partesDaDemanda(d.descricao).motivo).toBe("Aguardando documentos para reajuizar: RG, COMPROVANTE.");
});

test("demanda antiga, sem motivo nenhum, não inventa texto", () => {
  const d = demandaDeReajuizamento(proc(), "Fulano", null);
  const p = partesDaDemanda(d.descricao);
  expect(p.motivo).toBeNull();
  expect(p.observacoes).toBeNull();
  expect(p.numero).toBe("0066720-60.2026.8.04.1000");
});

test("descrição vazia ou de outra etapa não quebra nem inventa", () => {
  expect(partesDaDemanda(null)).toEqual({ numero: null, motivo: null, observacoes: null });
  expect(partesDaDemanda("Confecção da peça a partir da análise vinculada."))
    .toEqual({ numero: null, motivo: null, observacoes: null });
});

test("processo sem número não vira um número chamado 'processo sem número'", () => {
  const d = demandaDeReajuizamento(proc({ numero_processo: null }), "Fulano", "Motivo qualquer.");
  expect(partesDaDemanda(d.descricao).numero).toBeNull();
});

/* O LÁPIS DO MOTIVO (chefe, 24/09).
 *
 * O motivo vivo mora no processo, mas a descrição da demanda também o carrega.
 * Trocar um e esquecer o outro faria a busca da esteira e o retrato da demanda
 * contarem a história antiga. */

test("troca o motivo e deixa o resto da descrição intacto", () => {
  const d = demandaDeReajuizamento(proc(), "Fulano", "REAJUIZAR NA VARA CÍVEL").descricao;
  const nova = trocarMotivoNaDescricao(d, "Faltou procuração a próprio punho.");
  expect(partesDaDemanda(nova).motivo).toBe("Faltou procuração a próprio punho.");
  expect(nova).toContain("Matéria: PARCELA CRÉDITO PESSOAL");
  expect(nova.split("\n")[0]).toBe("Reajuizamento de 0066720-60.2026.8.04.1000, extinto sem mérito.");
});

test("motivo antigo de várias linhas sai inteiro, e o novo pode ter várias", () => {
  const d = demandaDeReajuizamento(proc(), "Fulano", "linha um\nlinha dois").descricao;
  const nova = trocarMotivoNaDescricao(d, "outro\ncom duas linhas");
  expect(nova).not.toContain("linha dois");
  expect(partesDaDemanda(nova).motivo).toBe("outro\ncom duas linhas");
});

test("demanda antiga sem motivo ganha a linha logo depois da primeira", () => {
  const d = demandaDeReajuizamento(proc(), "Fulano", null).descricao;
  const nova = trocarMotivoNaDescricao(d, "Extinto por inépcia.");
  expect(nova.split("\n")[1]).toBe("Motivo: Extinto por inépcia.");
  expect(partesDaDemanda(nova).motivo).toBe("Extinto por inépcia.");
});

test("descrição vazia vira só o motivo", () => {
  expect(trocarMotivoNaDescricao(null, "  algo  ")).toBe("Motivo: algo");
});
