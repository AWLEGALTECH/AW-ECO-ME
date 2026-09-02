// DADOS DE EXEMPLO DO PAINEL DE ATENDIMENTO — NADA AQUI É REAL.
//
// Esta é a maquete do módulo: a tela funciona como se o WhatsApp já estivesse
// plugado, mas o que ela mostra são pessoas inventadas. Nenhum nome, telefone
// ou conversa daqui saiu da base do escritório, e nada disto é gravado.
//
// POR QUE INVENTADO E NÃO REAL. Puxar cliente de verdade pra ilustrar deixaria
// a maquete convincente demais: alguém abriria a tela, veria a MARIA DE LOURDES
// com uma conversa que nunca aconteceu e trataria aquilo como registro. Nome
// falso é a única forma de a maquete não mentir.
//
// Quando o backend entrar, este arquivo sai inteiro e as mesmas interfaces
// passam a ser preenchidas pelo banco — é por isso que os tipos moram aqui e
// não dentro do componente.

import type { Missao } from "./missoes";

export type Estagio = "chegou" | "triagem" | "extrato" | "proposta" | "fechado";
export type Origem = "pda" | "escritorio" | "planilha" | "indicacao";

export const ESTAGIOS: { chave: Estagio; rotulo: string; descricao: string }[] = [
  { chave: "chegou",   rotulo: "Chegou",    descricao: "mandou mensagem, ainda não foi triado" },
  { chave: "triagem",  rotulo: "Triagem",   descricao: "descobrindo se há caso" },
  { chave: "extrato",  rotulo: "Extrato",   descricao: "esperando o documento — o gargalo" },
  { chave: "proposta", rotulo: "Proposta",  descricao: "sabe o que dá pra pedir, falta fechar" },
  { chave: "fechado",  rotulo: "Fechado",   descricao: "virou cliente" },
];

export const ORIGENS: Record<Origem, { rotulo: string; curto: string }> = {
  pda:        { rotulo: "Portal Direito Aberto", curto: "PDA" },
  escritorio: { rotulo: "Escritório",            curto: "Escritório" },
  planilha:   { rotulo: "Formulário da landing", curto: "Landing" },
  indicacao:  { rotulo: "Indicação",             curto: "Indicação" },
};

export interface Mensagem {
  de: "lead" | "nos";
  texto: string;
  hora: string;
  /** separador de dia; só na primeira mensagem daquele dia */
  dia?: string;
}

export interface Lead {
  id: string;
  nome: string;
  telefone: string;
  origem: Origem;
  estagio: Estagio;
  /** quem falou por último — é o que acende o alarme de "não respondemos" */
  ultimaFoi: "lead" | "nos";
  horasSemResposta: number;
  ultimaHora: string;
  naoLidas: number;
  temProximaAcao: boolean;
  dossie: {
    banco: string | null;
    descontos: string[];
    inss: boolean | null;
    consignado: string | null;
    obs: string | null;
  };
  conversa: Mensagem[];
}

export const LEADS: Lead[] = [
  {
    id: "l1",
    nome: "Maria das Graças Bentes",
    telefone: "(92) 98812-4471",
    origem: "pda",
    estagio: "triagem",
    ultimaFoi: "lead",
    horasSemResposta: 2,
    ultimaHora: "09:14",
    naoLidas: 2,
    temProximaAcao: false,
    dossie: {
      banco: "Bradesco",
      descontos: ["RMC", "Seguro de vida"],
      inss: true,
      consignado: "3 contratos ativos",
      obs: "Aposentada por invalidez. Diz que nunca pediu cartão.",
    },
    conversa: [
      { de: "lead", dia: "Ontem", hora: "16:40", texto: "boa tarde, vi a matéria de vcs sobre desconto no INSS" },
      { de: "nos",  hora: "16:52", texto: "Boa tarde! Aqui é do Portal Direito Aberto. Conta pra gente o que apareceu no seu benefício?" },
      { de: "lead", hora: "17:05", texto: "tem um desconto de 92 reais todo mes que eu nao sei o que é, ta escrito RMC" },
      { de: "nos",  hora: "17:11", texto: "Esse RMC é reserva de margem de cartão de crédito. Muita gente tem sem nunca ter pedido cartão nenhum. A senhora chegou a pedir cartão em algum banco?" },
      { de: "lead", dia: "Hoje", hora: "09:12", texto: "nunca pedi não, só tenho a conta do bradesco onde cai o beneficio" },
      { de: "lead", hora: "09:14", texto: "e tem outro de 38 de seguro de vida tbm" },
    ],
  },
  {
    id: "l2",
    nome: "José Carlos Ferreira",
    telefone: "(92) 99143-2208",
    origem: "pda",
    estagio: "extrato",
    ultimaFoi: "lead",
    horasSemResposta: 4,
    ultimaHora: "07:30",
    naoLidas: 1,
    temProximaAcao: true,
    dossie: {
      banco: "Banco BMG",
      descontos: ["RCC", "Tarifa SMS"],
      inss: true,
      consignado: "1 contrato",
      obs: "Já mandou o contracheque. Falta o extrato bancário dos 12 meses.",
    },
    conversa: [
      { de: "lead", dia: "Segunda", hora: "11:20", texto: "vcs ajudam com desconto do bmg? tô vendo aqui uns valor que nunca autorizei" },
      { de: "nos",  hora: "11:35", texto: "Ajudamos sim. Pra saber o que dá pra reclamar a gente precisa ver o extrato dos últimos 12 meses. Consegue puxar pelo app do banco?" },
      { de: "lead", hora: "14:02", texto: "vou ver com meu filho como faz" },
      { de: "nos",  dia: "Quarta", hora: "10:00", texto: "Oi, Sr. José! Conseguiu puxar o extrato?" },
      { de: "lead", dia: "Hoje", hora: "07:30", texto: "consegui baixar mas nao sei mandar aqui, é muito arquivo" },
    ],
  },
  {
    id: "l3",
    nome: "Ana Lúcia Prado",
    telefone: "(92) 98455-9013",
    origem: "planilha",
    estagio: "extrato",
    ultimaFoi: "nos",
    horasSemResposta: 0,
    ultimaHora: "Ontem",
    naoLidas: 0,
    temProximaAcao: true,
    dossie: {
      banco: "Banco Pan",
      descontos: ["Empréstimo não contratado"],
      inss: false,
      consignado: "não sabe informar",
      obs: "Veio do formulário da campanha Bradesco, mas o desconto é do Pan.",
    },
    conversa: [
      { de: "nos",  dia: "Ontem", hora: "08:15", texto: "Oi, Ana! Você preencheu nosso formulário sobre descontos indevidos. Aqui é do Portal Direito Aberto — posso te fazer duas perguntas rápidas?" },
      { de: "lead", hora: "08:41", texto: "pode sim" },
      { de: "nos",  hora: "08:44", texto: "O desconto que você viu é em qual banco, e de quanto por mês?" },
      { de: "lead", hora: "09:30", texto: "banco pan, 219,90. dizem que é emprestimo mas eu nunca peguei emprestimo nenhum" },
      { de: "nos",  hora: "09:38", texto: "Entendi. Vou te mandar o link pra você enviar o extrato do último ano — é por ele que a gente confirma desde quando isso vem sendo cobrado." },
    ],
  },
  {
    id: "l4",
    nome: "Pedro Henrique Sousa",
    telefone: "(92) 99671-4480",
    origem: "indicacao",
    estagio: "proposta",
    ultimaFoi: "nos",
    horasSemResposta: 0,
    ultimaHora: "Ontem",
    naoLidas: 0,
    temProximaAcao: true,
    dossie: {
      banco: "Bradesco",
      descontos: ["RMC", "RCC", "Cesta de serviços"],
      inss: true,
      consignado: "2 contratos",
      obs: "Indicado pela Darlene. Extrato analisado, 3 rubricas encontradas.",
    },
    conversa: [
      { de: "lead", dia: "Terça", hora: "19:22", texto: "boa noite, a dona darlene passou o contato de vcs" },
      { de: "nos",  dia: "Quarta", hora: "08:05", texto: "Bom dia, Pedro! Que bom. A Darlene é nossa cliente. Me conta o que está acontecendo com você?" },
      { de: "lead", hora: "08:30", texto: "mesma coisa que ela, uns desconto no meu beneficio que eu nao reconheço" },
      { de: "nos",  dia: "Ontem", hora: "17:40", texto: "Pedro, terminamos de olhar seu extrato. Achamos três cobranças que dá pra questionar. Posso te ligar amanhã pra explicar como funciona?" },
    ],
  },
  {
    id: "l5",
    nome: "Rita de Cássia Alves",
    telefone: "(92) 98209-7734",
    origem: "pda",
    estagio: "chegou",
    ultimaFoi: "lead",
    horasSemResposta: 19,
    ultimaHora: "Ontem",
    naoLidas: 1,
    temProximaAcao: false,
    dossie: {
      banco: null,
      descontos: [],
      inss: null,
      consignado: null,
      obs: null,
    },
    conversa: [
      { de: "lead", dia: "Ontem", hora: "15:02", texto: "oi, é aqui que fala sobre os desconto do banco?" },
    ],
  },
  {
    id: "l6",
    nome: "Walmir Nogueira",
    telefone: "(92) 99320-1156",
    origem: "escritorio",
    estagio: "fechado",
    ultimaFoi: "nos",
    horasSemResposta: 0,
    ultimaHora: "Terça",
    naoLidas: 0,
    temProximaAcao: true,
    dossie: {
      banco: "Banco Mercantil",
      descontos: ["Refinanciamento indevido"],
      inss: true,
      consignado: "4 contratos",
      obs: "Contrato assinado. Passou pro número do escritório na terça.",
    },
    conversa: [
      { de: "nos",  dia: "Terça", hora: "10:12", texto: "Sr. Walmir, seu contrato foi assinado. A partir de agora o senhor fala direto com o escritório do Dr. Matheus por este número." },
      { de: "lead", hora: "10:30", texto: "perfeito, muito obrigado pela atenção de vcs" },
    ],
  },
  {
    id: "l7",
    nome: "Cleuza Martins de Lima",
    telefone: "(92) 98877-3391",
    origem: "planilha",
    estagio: "triagem",
    ultimaFoi: "nos",
    horasSemResposta: 0,
    ultimaHora: "Ontem",
    naoLidas: 0,
    temProximaAcao: false,
    dossie: {
      banco: "Banco Daycoval",
      descontos: ["Seguro prestamista"],
      inss: true,
      consignado: "1 contrato",
      obs: null,
    },
    conversa: [
      { de: "nos",  dia: "Ontem", hora: "14:20", texto: "Oi, Cleuza! Vi que você preencheu nosso formulário. O desconto do seguro aparece junto com a parcela do empréstimo?" },
      { de: "lead", hora: "14:55", texto: "aparece separado, um de 43 reais" },
      { de: "nos",  hora: "15:10", texto: "Certo. Vou conferir aqui e te retorno." },
    ],
  },
];

export const MISSOES: Missao[] = [
  { id: "m1", tipo: "sem_resposta",     leadId: "l5", lead: "Rita de Cássia Alves",  detalhe: "primeira mensagem, sem resposta há 19h", horas: 19, feita: false },
  { id: "m2", tipo: "sem_resposta",     leadId: "l2", lead: "José Carlos Ferreira",  detalhe: "não sabe mandar o extrato",             horas: 4,  feita: false },
  { id: "m3", tipo: "sem_resposta",     leadId: "l1", lead: "Maria das Graças",      detalhe: "respondeu sobre o RMC e o seguro",      horas: 2,  feita: false },
  { id: "m4", tipo: "sem_proxima_acao", leadId: "l7", lead: "Cleuza Martins",        detalhe: "\"te retorno\" desde ontem, sem combinado", horas: 20, feita: false },
  { id: "m5", tipo: "cobrar_extrato",   leadId: "l3", lead: "Ana Lúcia Prado",       detalhe: "link enviado ontem · 1ª cobrança",      horas: 24, feita: false },
  { id: "m6", tipo: "ligar",            leadId: "l4", lead: "Pedro Henrique",        detalhe: "ligação combinada pra hoje",            horas: 3,  feita: false },
  { id: "m7", tipo: "follow_up",        leadId: "l6", lead: "Walmir Nogueira",       detalhe: "confirmar que o escritório já falou",   horas: 30, feita: true  },
  { id: "m8", tipo: "cobrar_extrato",   leadId: "l2", lead: "José Carlos Ferreira",  detalhe: "ensinar a mandar pelo link",            horas: 4,  feita: true  },
];

/** Dias seguidos sem deixar ninguém sem resposta. Exemplo. */
export const SEQUENCIA_DIAS = 5;

/** Placar do mês, pra aba de gestão. Exemplo. */
export const PLACAR_MES = [
  { pessoa: "Adria",   pontos: 1840, leads: 96, fechados: 33 },
  { pessoa: "Kelvia",  pontos: 420,  leads: 22, fechados: 6 },
];

/** Como o funil do mês ficaria, se fosse medido. Exemplo. */
export const FUNIL_MES: { estagio: Estagio | "perdido"; rotulo: string; n: number }[] = [
  { estagio: "chegou",   rotulo: "Chegaram",         n: 214 },
  { estagio: "triagem",  rotulo: "Foram triados",    n: 168 },
  { estagio: "extrato",  rotulo: "Mandaram extrato", n: 74 },
  { estagio: "proposta", rotulo: "Receberam proposta", n: 58 },
  { estagio: "fechado",  rotulo: "Fecharam",         n: 42 },
];
