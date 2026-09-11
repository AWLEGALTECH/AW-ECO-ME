/* DO QUE FOI LIDO NOS DOCUMENTOS PARA O FORMULÁRIO DO WRITER.
 *
 * A leitura acaba com nove campos conferidos na tela. O Writer começa com a
 * Etapa 01 em branco, e alguém digita os mesmos nove de novo, olhando para a
 * outra guia. É o retrabalho que este módulo existe para apagar: o botão
 * "Levar ao Writer" abre a guia com a qualificação já preenchida.
 *
 * ─────────────────────────── por que não é cópia direta ─────────────────────
 *
 * Os dois lados não falam a mesma língua, e traduzir na hora do clique é como
 * se erra:
 *
 *   NOSSO CAMPO        O WRITER                     o que muda
 *   nome               nome_completo                só o nome da chave
 *   endereco + cep     endereco_completo            vira UMA linha, com "CEP"
 *   estado_civil       estado_civil (select)        valor fixo, minúsculo
 *   nascimento         (não existe na Etapa 01)     vira IDADE, na Etapa 02
 *
 * DUAS REGRAS GOVERNAM A TRADUÇÃO:
 *
 * 1. NADA RECUSADO ATRAVESSA. O que a máquina provou estar errado (CPF cujo
 *    dígito não fecha) fica de fora do que é enviado: em branco a pessoa
 *    percebe e digita, preenchido errado ela confia e assina.
 *
 * 2. O QUE NÃO CABE, NÃO SE FORÇA. "Separado(a)" não é uma das opções do select
 *    do Writer, e mandar "separado" deixaria o campo vazio com cara de
 *    preenchido. Volta em branco, para a pessoa escolher lá.
 */

import type { CampoLido, CampoDoKit } from "./leituraDeDocumentos";

/** O formulário do Writer, do jeito que ele guarda: Etapa 01 e Etapa 02. */
export interface QualificacaoDoWriter {
  pacote1: {
    nome_completo?: string;
    nacionalidade?: string;
    estado_civil?: string;
    profissao?: string;
    rg?: string;
    orgao_expedidor?: string;
    cpf?: string;
    endereco_completo?: string;
  };
  pacote2: { idade?: string };
}

/**
 * Quantos anos a pessoa tem hoje.
 *
 * A Etapa 01 do Writer não tem campo de nascimento; a Etapa 02 tem IDADE, e é
 * ela que entra na qualificação e no perfil socioeconômico. Data inválida não
 * vira idade nenhuma: melhor o campo vazio que uma idade inventada.
 */
export function idadeEm(nascimento: string, hoje = new Date()): number | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((nascimento || "").trim());
  if (!m) return null;
  const [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(ano, mes - 1, dia);
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  let idade = hoje.getFullYear() - ano;
  const passou = hoje.getMonth() > mes - 1 || (hoje.getMonth() === mes - 1 && hoje.getDate() >= dia);
  if (!passou) idade -= 1;
  return idade >= 0 && idade <= 130 ? idade : null;
}

/**
 * O endereço numa linha só, como o Writer guarda.
 *
 * O CEP entra no fim, com o rótulo, porque é assim que o Writer desmonta a
 * linha depois (ele procura "CEP" e cinco dígitos para preencher o endereço
 * estruturado). Sem a palavra, o CEP vira parte do nome da rua.
 */
export function enderecoCompleto(endereco: string, cep: string): string {
  const e = (endereco || "").trim().replace(/[,\s]+$/, "");
  const c = (cep || "").trim();
  if (!e) return c ? `CEP ${c}` : "";
  // O endereço às vezes já vem com o CEP dentro; repetir seria pior que omitir.
  if (!c || e.replace(/\D/g, "").includes(c.replace(/\D/g, ""))) return e;
  return `${e}, CEP ${c}`;
}

/* As cinco opções do select da Etapa 01, escritas como o Writer as guarda.
   "Separado(a)" não está entre elas de propósito: não existe lá. */
const CIVIL_DO_WRITER: Record<string, string> = {
  "Solteiro(a)": "solteiro",
  "Casado(a)": "casado",
  "Divorciado(a)": "divorciado",
  "Viúvo(a)": "viúvo",
  "União estável": "união estável",
};

/** O estado civil como o select do Writer espera, ou vazio se não couber lá. */
export function civilDoWriter(estadoCivil: string): string {
  return CIVIL_DO_WRITER[(estadoCivil || "").trim()] ?? "";
}

/**
 * A qualificação pronta para o Writer.
 *
 * Só entra o que sobreviveu à conferência. Campo recusado e campo vazio dão no
 * mesmo aqui: não atravessam.
 */
export function qualificacaoParaOWriter(campos: CampoLido[]): QualificacaoDoWriter {
  const valor = (c: CampoDoKit): string => {
    const achado = campos.find((x) => x.campo === c);
    return achado && achado.estado !== "recusado" ? achado.valor : "";
  };

  const p1: QualificacaoDoWriter["pacote1"] = {};
  const guardar = (chave: keyof QualificacaoDoWriter["pacote1"], v: string) => {
    if (v) p1[chave] = v;
  };

  guardar("nome_completo", valor("nome"));
  guardar("cpf", valor("cpf"));
  guardar("rg", valor("rg"));
  guardar("orgao_expedidor", valor("orgao_expedidor"));
  guardar("profissao", valor("profissao"));
  guardar("estado_civil", civilDoWriter(valor("estado_civil")));
  guardar("endereco_completo", enderecoCompleto(valor("endereco"), valor("cep")));
  /* Nacionalidade não se lê em documento nenhum, e o Writer já assume
     "brasileiro" quando abre por aqui. Repetir a suposição é honesto: ela
     aparece no campo, visível, e quem vê muda se for o caso. */
  if (p1.nome_completo) p1.nacionalidade = "brasileiro";

  const pacote2: QualificacaoDoWriter["pacote2"] = {};
  const idade = idadeEm(valor("nascimento"));
  if (idade !== null) pacote2.idade = String(idade);

  return { pacote1: p1, pacote2 };
}

/**
 * A qualificação embrulhada para caber na URL do Writer.
 *
 * base64 do JSON, pelo mesmo par que o Writer já usa na fila de cadeia
 * (`btoa(unescape(encodeURIComponent(x)))` de um lado,
 * `decodeURIComponent(escape(atob(x)))` do outro). O `unescape` é o que faz
 * acento sobreviver: `btoa` recusa qualquer caractere acima de 255, e "José"
 * sozinho derrubaria a passagem.
 *
 * Devolve vazio quando não há nada a levar, para o link não carregar parâmetro
 * de um objeto sem campo nenhum.
 */
export function paramDaQualificacao(q: QualificacaoDoWriter): string {
  const vazio = Object.keys(q.pacote1).length === 0 && Object.keys(q.pacote2).length === 0;
  if (vazio) return "";
  return btoa(unescape(encodeURIComponent(JSON.stringify(q))));
}
