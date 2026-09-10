/* LER OS DADOS DO CLIENTE NO DOCUMENTO QUE ELE MANDOU.
 *
 * O último passo comercial é digitar no Writer o que já está escrito no RG, no
 * CPF e no comprovante de residência que o lead mandou no WhatsApp. Este módulo
 * é a parte que decide O QUE é cada coisa dentro de um texto: extrair o texto
 * (PDF com camada de texto, ou OCR numa foto) é trabalho de quem chama.
 *
 * A REGRA QUE GOVERNA TUDO: preencher errado é pior que não preencher. Uma
 * qualificação com o CPF trocado vai para a procuração, para o contrato e para
 * a inicial, e o erro só aparece no cartório ou no protocolo. Por isso:
 *
 *   1. O CPF só é aceito se os dígitos verificadores fecharem. OCR erra número,
 *      e o dígito verificador é exatamente o mecanismo que existe para pegar
 *      isso: um 8 lido como 3 não fecha a conta e o achado é descartado.
 *   2. Todo achado carrega a CONFIANÇA e o TRECHO que o sustenta. Quem preenche
 *      vê de onde saiu e confere em um segundo.
 *   3. Campo sem rótulo por perto quase sempre vale menos. Data solta num
 *      documento não é data de nascimento; número de oito dígitos não é CEP só
 *      por ter oito dígitos.
 *
 * Nada aqui preenche nada sozinho. A tela oferece; a pessoa aplica.
 */

export type CampoDoLead =
  | "nome" | "cpf" | "rg" | "orgao_expedidor" | "nascimento" | "cep" | "endereco";

export interface Achado {
  campo: CampoDoLead;
  /** já formatado como se escreve (CPF com pontos, CEP com hífen) */
  valor: string;
  /** 0 a 1. Acima de 0.8 é achado com rótulo explícito; abaixo, é palpite. */
  confianca: number;
  /** o pedaço do documento que sustenta o achado, para conferência */
  trecho: string;
  /** de qual documento veio, quando vieram vários */
  documento?: string;
}

/* ── texto ────────────────────────────────────────────────────────────────── */

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Uma linha do documento em duas versões: como está, e como se procura nela. */
interface Linha { crua: string; chave: string }

function linhasDe(texto: string): Linha[] {
  return (texto || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((crua) => ({ crua, chave: semAcento(crua).toUpperCase() }));
}

export const soDigitos = (s: string) => (s || "").replace(/\D/g, "");

/* ── CPF ──────────────────────────────────────────────────────────────────── */

/** Os dois dígitos verificadores fecham? É o que separa CPF de número qualquer. */
export function cpfValido(entrada: string): boolean {
  const d = soDigitos(entrada);
  if (d.length !== 11) return false;
  // 111.111.111-11 e companhia passam na conta dos dígitos e não existem.
  if (/^(\d)\1{10}$/.test(d)) return false;
  for (const ate of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    const dv = resto === 10 ? 0 : resto;
    if (dv !== Number(d[ate])) return false;
  }
  return true;
}

export const formatarCpf = (s: string) => {
  const d = soDigitos(s);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : s;
};

export const formatarCep = (s: string) => {
  const d = soDigitos(s);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : s;
};

/* O trecho que acompanha o achado: um pedaço curto em volta, para conferir sem
   abrir o documento. */
function trechoEmVolta(texto: string, posicao: number, tamanho = 60): string {
  const ini = Math.max(0, posicao - tamanho / 2);
  return texto.slice(ini, ini + tamanho).replace(/\s+/g, " ").trim();
}

const temPerto = (texto: string, posicao: number, palavras: string[], raio = 40): boolean => {
  const volta = semAcento(texto.slice(Math.max(0, posicao - raio), posicao + raio)).toUpperCase();
  return palavras.some((p) => volta.includes(p));
};

/**
 * CPFs do texto, só os que fecham os dígitos verificadores.
 *
 * Sem o rótulo por perto a confiança cai, mas o achado continua: em foto de
 * CPF antigo o número aparece sozinho, e um número de onze dígitos que fecha a
 * conta dificilmente é outra coisa.
 */
export function acharCpf(texto: string): Achado[] {
  const achados: Achado[] = [];
  const vistos = new Set<string>();
  const re = /\d{3}\D?\d{3}\D?\d{3}\D?\d{2}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const d = soDigitos(m[0]);
    if (d.length !== 11 || !cpfValido(d) || vistos.has(d)) continue;
    vistos.add(d);
    achados.push({
      campo: "cpf",
      valor: formatarCpf(d),
      confianca: temPerto(texto, m.index, ["CPF", "C.P.F"]) ? 0.95 : 0.75,
      trecho: trechoEmVolta(texto, m.index),
    });
  }
  return achados.sort((a, b) => b.confianca - a.confianca);
}

/* ── CEP ──────────────────────────────────────────────────────────────────── */

/**
 * CEP do texto.
 *
 * Com separador ("69083-000") ou com o rótulo por perto. Oito dígitos colados e
 * sem rótulo ficam de fora: dentro de um CPF cabe uma sequência dessas, e o
 * endereço errado é o tipo de erro que ninguém confere.
 */
export function acharCep(texto: string): Achado[] {
  const achados: Achado[] = [];
  const vistos = new Set<string>();
  const re = /\b(\d{5})[-.\s]?(\d{3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const d = m[1] + m[2];
    if (vistos.has(d)) continue;
    const comSeparador = /[-.\s]/.test(m[0]);
    const rotulado = temPerto(texto, m.index, ["CEP"]);
    if (!comSeparador && !rotulado) continue;
    // Dentro de um CPF válido cabe algo com cara de CEP; o CPF vence.
    const volta = texto.slice(Math.max(0, m.index - 6), m.index + 16);
    if (acharCpf(volta).length > 0 && !rotulado) continue;
    vistos.add(d);
    achados.push({
      campo: "cep",
      valor: formatarCep(d),
      confianca: rotulado ? 0.9 : 0.6,
      trecho: trechoEmVolta(texto, m.index),
    });
  }
  return achados.sort((a, b) => b.confianca - a.confianca);
}

/* ── campos com rótulo ────────────────────────────────────────────────────── */

/** O que vem depois do rótulo na mesma linha, ou a linha seguinte quando a do rótulo acaba nele. */
function valorDoRotulo(linhas: Linha[], i: number, rotulo: RegExp): string | null {
  const m = rotulo.exec(linhas[i].chave);
  if (!m) return null;
  const depois = linhas[i].crua.slice(m.index + m[0].length).replace(/^[\s:.\-]+/, "").trim();
  if (depois) return depois;
  const proxima = linhas[i + 1];
  return proxima ? proxima.crua : null;
}

const NAO_E_A_PESSOA = /\b(MAE|PAI|FILIACAO|GENITOR|GENITORA|CONJUGE|EMPRESA|RAZAO SOCIAL|FANTASIA)\b/;

/**
 * O nome do titular.
 *
 * Filiação é a armadilha clássica: no RG o nome da mãe vem logo abaixo do nome
 * e num rótulo parecido. Linha de filiação não vira nome, e nome que é uma
 * palavra só também não (é rótulo cortado, não gente).
 */
export function acharNome(texto: string): Achado[] {
  const linhas = linhasDe(texto);
  const achados: Achado[] = [];
  const rotulos: { re: RegExp; peso: number }[] = [
    { re: /\bNOME COMPLETO\b/, peso: 0.95 },
    { re: /\bNOME DO TITULAR\b/, peso: 0.9 },
    { re: /\bNOME\b/, peso: 0.85 },
    { re: /\bTITULAR\b/, peso: 0.7 },
    { re: /\bCLIENTE\b/, peso: 0.7 },
    { re: /\bCONSUMIDOR\b/, peso: 0.65 },
  ];
  for (let i = 0; i < linhas.length; i++) {
    if (NAO_E_A_PESSOA.test(linhas[i].chave)) continue;
    for (const { re, peso } of rotulos) {
      const bruto = valorDoRotulo(linhas, i, re);
      if (!bruto) continue;
      const nome = bruto.replace(/[^A-Za-zÀ-ÿ'\s]/g, " ").replace(/\s+/g, " ").trim();
      const palavras = nome.split(" ").filter((p) => p.length > 1);
      if (palavras.length < 2 || NAO_E_A_PESSOA.test(semAcento(nome).toUpperCase())) continue;
      achados.push({ campo: "nome", valor: nome, confianca: peso, trecho: linhas[i].crua });
      break;
    }
  }
  return achados.sort((a, b) => b.confianca - a.confianca);
}

/**
 * O RG.
 *
 * Só com rótulo, e nunca um CPF disfarçado. O RG não tem dígito verificador
 * padronizado (cada estado faz o seu), então não há como conferir: a confiança
 * fica em 0.7 mesmo com rótulo, e quem preenche olha.
 */
export function acharRg(texto: string): Achado[] {
  const linhas = linhasDe(texto);
  const achados: Achado[] = [];
  const rotulo = /\b(REGISTRO GERAL|RG|DOC(?:UMENTO)?\.? DE IDENTIDADE|IDENTIDADE|CARTEIRA DE IDENTIDADE)\b/;
  for (let i = 0; i < linhas.length; i++) {
    const bruto = valorDoRotulo(linhas, i, rotulo);
    if (!bruto) continue;
    const m = /\d[\d.\- ]{3,16}[\dXx]/.exec(bruto);
    if (!m) continue;
    const valor = m[0].trim().replace(/\s+/g, "");
    if (cpfValido(valor)) continue;
    const d = soDigitos(valor);
    if (d.length < 5 || d.length > 14) continue;
    achados.push({ campo: "rg", valor, confianca: 0.7, trecho: linhas[i].crua });
  }
  return achados.sort((a, b) => b.confianca - a.confianca);
}

/** O órgão emissor: SSP/AM, DETRAN/AM, PC/SP. */
export function acharOrgaoExpedidor(texto: string): Achado[] {
  const achados: Achado[] = [];
  const re = /\b(SSP|SESP|SDS|DETRAN|PC|PM|IFP|IIRGD|MTE|DIC|CRM|OAB)\s*[\/\-]?\s*([A-Z]{2})\b/g;
  const chave = semAcento(texto).toUpperCase();
  let m: RegExpExecArray | null;
  const vistos = new Set<string>();
  while ((m = re.exec(chave))) {
    const valor = `${m[1]}/${m[2]}`;
    if (vistos.has(valor)) continue;
    vistos.add(valor);
    achados.push({
      campo: "orgao_expedidor",
      valor,
      confianca: temPerto(chave, m.index, ["EXPEDIDOR", "EMISSOR", "ORGAO", "REGISTRO GERAL", "RG", "IDENTIDADE"]) ? 0.85 : 0.6,
      trecho: trechoEmVolta(texto, m.index),
    });
  }
  return achados.sort((a, b) => b.confianca - a.confianca);
}

/**
 * Data de nascimento.
 *
 * Só com rótulo. Documento é cheio de data (emissão, validade, vencimento da
 * conta de luz), e a data de nascimento errada estraga a qualificação inteira.
 */
export function acharNascimento(texto: string): Achado[] {
  const achados: Achado[] = [];
  const chave = semAcento(texto).toUpperCase();
  const re = /\b(\d{2})[\/.\- ](\d{2})[\/.\- ](\d{4})\b/g;
  let m: RegExpExecArray | null;
  const vistos = new Set<string>();
  while ((m = re.exec(chave))) {
    const dia = Number(m[1]), mes = Number(m[2]), ano = Number(m[3]);
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12 || ano < 1900 || ano > new Date().getFullYear()) continue;
    if (!temPerto(chave, m.index, ["NASCIMENTO", "NASC", "DT NASC"], 45)) continue;
    const valor = `${m[1]}/${m[2]}/${m[3]}`;
    if (vistos.has(valor)) continue;
    vistos.add(valor);
    achados.push({ campo: "nascimento", valor, confianca: 0.9, trecho: trechoEmVolta(texto, m.index) });
  }
  return achados;
}

const LOGRADOURO = /^(RUA|R\.|AV|AV\.|AVENIDA|TRAVESSA|TV|ALAMEDA|AL\.|ESTRADA|EST\.|ROD|RODOVIA|PRACA|BECO|CONJUNTO|CONJ|QUADRA|Q\.)\b/;

/**
 * O endereço.
 *
 * Com rótulo ou começando por logradouro. Vem como a linha inteira: o Writer
 * pede "endereço completo" num campo só, e recortar bairro e número aqui seria
 * inventar estrutura que o documento não tem.
 */
export function acharEndereco(texto: string): Achado[] {
  const linhas = linhasDe(texto);
  const achados: Achado[] = [];
  const rotulo = /\b(ENDERECO|LOGRADOURO|RESIDENTE (?:A|EM)|DOMICILIADO (?:A|EM))\b/;
  for (let i = 0; i < linhas.length; i++) {
    const doRotulo = valorDoRotulo(linhas, i, rotulo);
    if (doRotulo && doRotulo.length > 5) {
      achados.push({ campo: "endereco", valor: doRotulo, confianca: 0.8, trecho: linhas[i].crua });
      continue;
    }
    if (LOGRADOURO.test(linhas[i].chave) && linhas[i].crua.length > 8) {
      achados.push({ campo: "endereco", valor: linhas[i].crua, confianca: 0.6, trecho: linhas[i].crua });
    }
  }
  return achados.sort((a, b) => b.confianca - a.confianca);
}

/* ── o texto inteiro ──────────────────────────────────────────────────────── */

/** O melhor achado de cada campo neste documento. */
export function camposDoTexto(texto: string, documento?: string): Achado[] {
  const todos = [
    ...acharNome(texto), ...acharCpf(texto), ...acharRg(texto),
    ...acharOrgaoExpedidor(texto), ...acharNascimento(texto),
    ...acharCep(texto), ...acharEndereco(texto),
  ];
  const melhor = new Map<CampoDoLead, Achado>();
  for (const a of todos) {
    const atual = melhor.get(a.campo);
    if (!atual || a.confianca > atual.confianca) melhor.set(a.campo, documento ? { ...a, documento } : a);
  }
  return [...melhor.values()];
}

/**
 * Junta o que veio de vários documentos.
 *
 * Quando dois documentos dizem a mesma coisa, a confiança sobe: o CPF que
 * aparece no RG e no comprovante é o CPF. Quando discordam, vence o de maior
 * confiança e o outro não some da tela por conta deste módulo, que devolve
 * também as divergências.
 */
export function juntarAchados(listas: Achado[][]): { campos: Achado[]; divergencias: Achado[] } {
  const porCampo = new Map<CampoDoLead, Achado[]>();
  for (const lista of listas) {
    for (const a of lista) porCampo.set(a.campo, [...(porCampo.get(a.campo) ?? []), a]);
  }
  const campos: Achado[] = [];
  const divergencias: Achado[] = [];
  for (const [campo, achados] of porCampo) {
    const ordenados = [...achados].sort((a, b) => b.confianca - a.confianca);
    const vencedor = ordenados[0];
    const iguais = ordenados.filter((a) => a.valor.toUpperCase() === vencedor.valor.toUpperCase());
    campos.push({
      ...vencedor,
      campo,
      // Concordância entre documentos vale confiança, sem nunca chegar a 1:
      // dois documentos podem repetir o mesmo erro de digitação.
      confianca: iguais.length > 1 ? Math.min(0.98, vencedor.confianca + 0.1) : vencedor.confianca,
    });
    divergencias.push(...ordenados.filter((a) => a.valor.toUpperCase() !== vencedor.valor.toUpperCase()));
  }
  return { campos, divergencias };
}

/** O nome do campo como a pessoa o chama na tela do Writer. */
export const ROTULO_DO_CAMPO: Record<CampoDoLead, string> = {
  nome: "Nome completo",
  cpf: "CPF",
  rg: "RG",
  orgao_expedidor: "Órgão expedidor",
  nascimento: "Data de nascimento",
  cep: "CEP",
  endereco: "Endereço completo",
};
