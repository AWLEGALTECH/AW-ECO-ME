/* O QUE VOLTA DO MODELO DEPOIS DE LER OS DOCUMENTOS DO LEAD.
 *
 * O lead manda foto de RG, de CPF e de conta de luz. Nenhuma tem camada de
 * texto: são fotos dentro de um PDF, tiradas por aplicativo de scanner de
 * celular. Não há parser que resolva isso, então quem lê é um modelo de visão,
 * e modelo de visão erra: troca 8 por 3, lê o nome da mãe como se fosse o da
 * pessoa, inventa um campo que o documento não tem para não devolver vazio.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * A ACURÁCIA NÃO VEM DO MODELO, VEM DAQUI.
 *
 * Este módulo pega o que o modelo disse e pergunta, campo a campo: dá para
 * PROVAR isso sem um ser humano olhar?
 *
 *   CPF          prova sozinho      dígito verificador fecha ou não fecha
 *   CEP          quase              oito dígitos, e a tela confirma no ViaCEP
 *   Nascimento   quase              data que existe e gente que pode ter nascido nela
 *   Estado civil quase              ou é uma das seis opções, ou não é
 *   Nome         cruzando           bate com o nome que já sabemos do lead?
 *   RG / órgão   não prova          não há dígito verificador, cada estado faz o seu
 *   Endereço     não prova          nenhum documento diz se está certo
 *   Profissão    não prova          texto livre
 *
 * Quatro campos se defendem sozinhos. Os outros quatro vão para a tela
 * marcados, e ninguém os leva para o Writer sem olhar. A regra é a mesma do
 * módulo irmão (`dadosDoDocumento.ts`): PREENCHER ERRADO É PIOR QUE NÃO
 * PREENCHER. Um CPF trocado entra na procuração, no contrato e na inicial, e
 * só aparece no protocolo.
 *
 * DIVERGÊNCIA NÃO SE RESOLVE SOZINHA. Quando o RG diz um nome e a conta de luz
 * diz outro, este módulo não escolhe: marca para revisar e mostra os dois. O
 * único desempate automático é o CPF, porque ali existe prova.
 */

import { cpfValido, formatarCpf, formatarCep, soDigitos } from "./dadosDoDocumento";

export type CampoDoKit =
  | "nome" | "cpf" | "rg" | "orgao_expedidor" | "nascimento"
  | "cep" | "endereco" | "profissao" | "estado_civil";

/** A ordem em que a tela e o Writer pedem os campos. */
export const CAMPOS_DO_KIT: CampoDoKit[] = [
  "nome", "cpf", "rg", "orgao_expedidor", "nascimento",
  "cep", "endereco", "profissao", "estado_civil",
];

export const ROTULO_DO_KIT: Record<CampoDoKit, string> = {
  nome: "Nome completo",
  cpf: "CPF",
  rg: "RG",
  orgao_expedidor: "Órgão expedidor",
  nascimento: "Data de nascimento",
  cep: "CEP",
  endereco: "Endereço",
  profissao: "Profissão",
  estado_civil: "Estado civil",
};

/** O que o modelo devolveu sobre UM documento. */
export interface LeituraBruta {
  /** como o documento se chama na tela ("documento 10-09 13h38.pdf") */
  documento: string;
  /** o que o modelo achou que o documento é ("RG", "comprovante de residência") */
  tipo?: string | null;
  campos: Partial<Record<CampoDoKit, string | null>>;
}

export type EstadoDoCampo = "conferido" | "revisar" | "recusado";

export interface CampoLido {
  campo: CampoDoKit;
  /** já formatado como se escreve: CPF com pontos, data em dd/mm/aaaa */
  valor: string;
  /** de qual documento saiu */
  documento: string;
  estado: EstadoDoCampo;
  /** por que está nesse estado, em uma linha, para aparecer na tela */
  porque: string;
  /** o que os outros documentos disseram de diferente sobre o mesmo campo */
  divergentes: { valor: string; documento: string }[];
}

/* ── o que ler, e o que não ler de novo ───────────────────────────────────── */

/** Um anexo da conversa, do jeito que a tela de escolha precisa vê-lo. */
export interface AnexoLegivel {
  path: string;
  /** o nome do arquivo, quando o WhatsApp mandou um */
  nome?: string | null;
  tipo?: string | null;
  /** dd/mm e hora da mensagem, para a pessoa achar o papel na conversa */
  quando?: string | null;
  /** o que a leitura guardada disse que era ("RG"), quando já foi lido */
  lidoComo?: string | null;
  jaLido: boolean;
  /** já foi tentado e falhou: vale tentar de novo, e não conta como lido */
  falhou: boolean;
}

/**
 * Junta os anexos da conversa com o que já foi lido de cada um.
 *
 * É o que permite a tela PERGUNTAR antes de gastar. Cada leitura custa, e uma
 * conversa de doze anexos tem, quase sempre, três que interessam: o RG, o
 * comprovante e o CPF. Ler os doze para achar os três é jogar nove fora.
 *
 * Leitura que FALHOU não conta como lida. O documento continua lá, o erro foi
 * do caminho (cota, rede, arquivo grande), e a pessoa precisa poder tentar de
 * novo sem que a tela finja que aquilo já está resolvido.
 */
export function anexosLegiveis(
  anexos: { path: string; nome?: string | null; tipo?: string | null; quando?: string | null }[],
  guardadas: { midia_path: string; tipo?: string | null; erro?: string | null }[],
): AnexoLegivel[] {
  const porPath = new Map(guardadas.map((g) => [g.midia_path, g]));
  return anexos.map((a) => {
    const g = porPath.get(a.path);
    const falhou = !!g?.erro;
    return {
      ...a,
      lidoComo: g && !falhou ? (g.tipo || null) : null,
      jaLido: !!g && !falhou,
      falhou,
    };
  });
}

/**
 * O que já vem marcado quando a escolha abre: NADA.
 *
 * A tentação é marcar tudo que não foi lido, porque é um clique a menos. Mas o
 * pedido aqui era justamente não gastar à toa, e uma lista toda marcada devolve
 * exatamente o comportamento antigo com uma etapa a mais no meio. Vazio força a
 * escolha a ser uma escolha, e quem quiser tudo tem o "marcar todos" ao lado.
 */
export function selecaoInicialDaLeitura(): string[] {
  return [];
}

/** "3 documentos" / "1 documento", para o botão dizer o tamanho do gasto. */
export function rotuloDeQuantos(n: number): string {
  return n === 1 ? "1 documento" : `${n} documentos`;
}

/* ── o envelope ───────────────────────────────────────────────────────────── */

/**
 * O JSON que veio do modelo, tirando o embrulho.
 *
 * Modelo devolve JSON pedido em JSON, e mesmo assim às vezes vem dentro de
 * ```json, às vezes com uma frase antes ("Aqui está o resultado:"), às vezes
 * dentro de uma lista de um item. Tratar isso como erro seria jogar fora uma
 * leitura boa por causa de três crases, então a função procura o primeiro `{` e
 * o último `}` e tenta dali. Cada chamada lê UM documento, então a lista só
 * pode ser embrulho.
 */
export function lerRespostaDoModelo(texto: string): Record<string, unknown> | null {
  const t = (texto || "").trim();
  if (!t) return null;
  const tentar = (s: string) => {
    try {
      const v = JSON.parse(s);
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch { return null; }
  };
  const direto = tentar(t);
  if (direto) return direto;
  const ini = t.indexOf("{");
  const fim = t.lastIndexOf("}");
  if (ini < 0 || fim <= ini) return null;
  return tentar(t.slice(ini, fim + 1));
}

/* ── normalização ─────────────────────────────────────────────────────────── */

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/* O modelo devolve o que não achou de umas cinco maneiras diferentes, e todas
   significam a mesma coisa: não estava no documento. */
const VAZIO = /^(|-+|n\/?a|nao informado|não informado|nao consta|não consta|nulo|null|undefined|desconhecido|nao identificado|não identificado)$/i;

/** As seis que existem no papel. Tudo que o modelo escrever cai numa delas ou em nenhuma. */
export const ESTADOS_CIVIS = [
  "Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "Separado(a)", "União estável",
] as const;

/* As profissões que ESTA base realmente tem, em ordem de frequência, e não uma
   lista inventada: aposentado aparece dezesseis vezes, professor sete, militar
   cinco. Faz sentido para a carteira: o desconto indevido em conta salarial e
   em benefício pega justamente aposentado, servidor e quem recebe por conta
   fixa. Os dois primeiros vêm nos dois gêneros porque são a maioria dos casos;
   nos outros, a pessoa ajusta digitando, que é mais rápido que procurar num
   menu de trinta itens. */
const PROFISSOES_COMUNS = [
  "Aposentado", "Aposentada", "Pensionista", "Professor", "Militar",
  "Motorista", "Agricultor", "Autônomo", "Do lar", "Funcionário público",
] as const;

/**
 * O que a tela oferece com um clique, para o campo que o documento não traz.
 *
 * Profissão e estado civil quase nunca estão escritos em RG, CPF ou conta de
 * luz: medido nesta base, vieram vazios em TODOS os documentos lidos até aqui.
 * Deixá-los em branco esperando o modelo é esperar por algo que não vem, e
 * digitar "Aposentado" à mão toda vez é o trabalho que este projeto existe para
 * tirar. O clique preenche; o campo continua editável.
 *
 * Os outros campos não têm sugestão de propósito: CPF e RG são daquela pessoa e
 * não existe lista de onde escolher.
 */
export function sugestoesDoCampo(campo: CampoDoKit): readonly string[] {
  if (campo === "estado_civil") return ESTADOS_CIVIS;
  if (campo === "profissao") return PROFISSOES_COMUNS;
  return [];
}

function civilCanonico(bruto: string): string | null {
  const c = semAcento(bruto).toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
  if (/\bSOLTEIR/.test(c)) return "Solteiro(a)";
  if (/\bDIVORCIAD/.test(c)) return "Divorciado(a)";
  if (/\bVIUV/.test(c)) return "Viúvo(a)";
  if (/\bSEPARAD/.test(c)) return "Separado(a)";
  if (/\bUNIAO ESTAVEL\b|\bCONVIVENTE\b|\bAMASIAD/.test(c)) return "União estável";
  // CASADO por último: "união estável" às vezes vem escrito "casado em união estável".
  if (/\bCASAD/.test(c)) return "Casado(a)";
  return null;
}

/** dd/mm/aaaa, venha como vier. Modelo devolve tanto 1985-03-12 quanto 12/03/1985. */
function dataCanonica(bruto: string): string | null {
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(bruto.trim());
  if (iso) return `${iso[3].padStart(2, "0")}/${iso[2].padStart(2, "0")}/${iso[1]}`;
  const br = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(bruto.trim());
  if (!br) return null;
  const ano = br[3].length === 2 ? (Number(br[3]) > 30 ? `19${br[3]}` : `20${br[3]}`) : br[3];
  return `${br[1].padStart(2, "0")}/${br[2].padStart(2, "0")}/${ano}`;
}

/** Capitaliza sem estragar as partículas: "JOSE DA SILVA" vira "Jose da Silva". */
function capitalizarNome(s: string): string {
  const particulas = new Set(["da", "de", "do", "das", "dos", "e", "di", "du"]);
  return s.toLowerCase().split(/\s+/).filter(Boolean)
    .map((p, i) => (i > 0 && particulas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/**
 * O valor do jeito que se escreve.
 *
 * Devolve vazio quando o modelo disse que não achou, de qualquer uma das
 * maneiras que ele usa para dizer isso.
 */
export function normalizarCampo(campo: CampoDoKit, bruto: unknown): string {
  const s = String(bruto ?? "").replace(/\s+/g, " ").trim();
  if (!s || VAZIO.test(s)) return "";
  switch (campo) {
    case "cpf": {
      const d = soDigitos(s);
      return d.length === 11 ? formatarCpf(d) : s;
    }
    case "cep": {
      const d = soDigitos(s);
      return d.length === 8 ? formatarCep(d) : s;
    }
    case "nascimento":
      return dataCanonica(s) ?? s;
    case "estado_civil":
      return civilCanonico(s) ?? s;
    case "orgao_expedidor": {
      const m = /([A-Za-z]{2,8})\s*[\/\-]?\s*([A-Za-z]{2})\b/.exec(semAcento(s));
      return m ? `${m[1].toUpperCase()}/${m[2].toUpperCase()}` : s.toUpperCase();
    }
    case "rg":
      // Ponto e hífen o cartório aceita; espaço no meio do número é lixo de OCR.
      return s.replace(/\s+/g, "");
    case "nome":
      return capitalizarNome(s.replace(/[^A-Za-zÀ-ÿ'\s]/g, " ").replace(/\s+/g, " ").trim());
    default:
      return s;
  }
}

/* ── a prova ──────────────────────────────────────────────────────────────── */

/** O que a tela já sabe do lead e serve para cruzar com o que o modelo leu. */
export interface ContextoDaConferencia {
  /** o nome que veio da análise comercial ou do contrato, quando existe */
  nomeConhecido?: string | null;
}

/** Só o primeiro e o último nome, sem partículas: é o que dois documentos sempre repetem. */
function pontasDoNome(nome: string): string {
  const particulas = new Set(["DA", "DE", "DO", "DAS", "DOS", "E", "DI", "DU"]);
  const partes = semAcento(nome).toUpperCase().split(/\s+/).filter((p) => p.length > 1 && !particulas.has(p));
  if (partes.length === 0) return "";
  return `${partes[0]} ${partes[partes.length - 1]}`.trim();
}

function anosDesde(dataBr: string): number | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dataBr);
  if (!m) return null;
  const [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(ano, mes - 1, dia);
  // Rejeita 31/02: o Date rola para março e a volta não bate.
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - ano;
  const passouAniversario = hoje.getMonth() > mes - 1 || (hoje.getMonth() === mes - 1 && hoje.getDate() >= dia);
  if (!passouAniversario) idade -= 1;
  return idade;
}

/**
 * Dá para provar este valor sem um ser humano olhar?
 *
 * "recusado" é diferente de "revisar": recusado é o que a máquina PROVOU que
 * está errado (CPF cujo dígito não fecha, data que não existe). Esse não vai
 * para a tela como sugestão, vai como aviso, porque aceitar seria pior que o
 * campo em branco.
 */
export function conferirCampo(
  campo: CampoDoKit,
  valor: string,
  ctx: ContextoDaConferencia = {},
): { estado: EstadoDoCampo; porque: string } {
  if (!valor) return { estado: "revisar", porque: "não veio no documento" };

  switch (campo) {
    case "cpf":
      return cpfValido(valor)
        ? { estado: "conferido", porque: "dígito verificador confere" }
        : { estado: "recusado", porque: "dígito verificador não fecha, leitura errada" };

    case "cep": {
      const d = soDigitos(valor);
      if (d.length !== 8) return { estado: "recusado", porque: "não tem oito dígitos" };
      return { estado: "conferido", porque: "oito dígitos, confira o logradouro" };
    }

    case "nascimento": {
      const idade = anosDesde(valor);
      if (idade === null) return { estado: "recusado", porque: "data que não existe no calendário" };
      if (idade < 0) return { estado: "recusado", porque: "data no futuro" };
      if (idade < 16 || idade > 110) return { estado: "revisar", porque: `daria ${idade} anos hoje` };
      return { estado: "conferido", porque: `${idade} anos hoje` };
    }

    case "estado_civil":
      return (ESTADOS_CIVIS as readonly string[]).includes(valor)
        ? { estado: "conferido", porque: "uma das opções do formulário" }
        : { estado: "revisar", porque: "não caiu em nenhuma das opções" };

    case "nome": {
      if (valor.split(/\s+/).filter((p) => p.length > 1).length < 2) {
        return { estado: "revisar", porque: "veio um nome só, pode ser rótulo cortado" };
      }
      const conhecido = (ctx.nomeConhecido || "").trim();
      if (!conhecido) return { estado: "revisar", porque: "não há outro nome para cruzar" };
      const a = pontasDoNome(valor), b = pontasDoNome(conhecido);
      if (a && a === b) return { estado: "conferido", porque: "bate com o nome que já tínhamos" };
      return { estado: "revisar", porque: `não bate com "${conhecido}"` };
    }

    case "rg":
      return soDigitos(valor).length < 5
        ? { estado: "recusado", porque: "curto demais para ser um RG" }
        : { estado: "revisar", porque: "RG não tem como conferir sozinho" };

    case "orgao_expedidor":
      return { estado: "revisar", porque: "confira contra o RG" };

    case "endereco":
      return valor.length < 8
        ? { estado: "recusado", porque: "curto demais para ser um endereço" }
        : { estado: "revisar", porque: "nenhum documento diz se está atual" };

    default:
      return { estado: "revisar", porque: "texto livre" };
  }
}

/* ── juntar os documentos ─────────────────────────────────────────────────── */

const mesmo = (a: string, b: string) => semAcento(a).toUpperCase().replace(/\s+/g, " ").trim()
                                     === semAcento(b).toUpperCase().replace(/\s+/g, " ").trim();

/**
 * O kit inteiro, montado a partir de tudo que foi lido.
 *
 * Para cada campo escolhe um valor e guarda o que os outros documentos disseram
 * de diferente. A escolha segue uma ordem simples e defensável:
 *
 *   1. o que a máquina conseguiu provar ganha do que ela não conseguiu
 *   2. empatado, ganha o valor que MAIS documentos repetiram
 *   3. empatado ainda, ganha o primeiro (a ordem dos documentos é a da conversa)
 *
 * Quando sobra divergência, o campo vai para "revisar" mesmo que o vencedor
 * tenha se provado: dois documentos discordando é exatamente a hora de alguém
 * olhar. O CPF é a exceção, porque ali a prova é aritmética e não opinião.
 */
export function montarKit(leituras: LeituraBruta[], ctx: ContextoDaConferencia = {}): CampoLido[] {
  return CAMPOS_DO_KIT.map((campo) => {
    const ditos = leituras
      .map((l) => ({ valor: normalizarCampo(campo, l.campos?.[campo]), documento: l.documento }))
      .filter((d) => d.valor !== "");

    const avaliados = ditos.map((d) => ({ ...d, ...conferirCampo(campo, d.valor, ctx) }));
    const aceitaveis = avaliados.filter((a) => a.estado !== "recusado");
    const candidatos = aceitaveis.length > 0 ? aceitaveis : avaliados;

    if (candidatos.length === 0) {
      return {
        campo, valor: "", documento: "", estado: "revisar" as const,
        porque: "nenhum documento trouxe", divergentes: [],
      };
    }

    const repeticoes = (v: string) => candidatos.filter((c) => mesmo(c.valor, v)).length;
    const peso = (e: EstadoDoCampo) => (e === "conferido" ? 2 : e === "revisar" ? 1 : 0);
    const vencedor = [...candidatos].sort((a, b) =>
      peso(b.estado) - peso(a.estado) || repeticoes(b.valor) - repeticoes(a.valor))[0];

    const divergentes: { valor: string; documento: string }[] = [];
    for (const c of avaliados) {
      if (mesmo(c.valor, vencedor.valor)) continue;
      if (divergentes.some((d) => mesmo(d.valor, c.valor))) continue;
      divergentes.push({ valor: c.valor, documento: c.documento });
    }

    // Discordância derruba o "conferido", menos no CPF: lá a conta fecha ou não
    // fecha, e o que não fechou já foi recusado antes de chegar aqui.
    const estado: EstadoDoCampo =
      divergentes.length > 0 && vencedor.estado === "conferido" && campo !== "cpf"
        ? "revisar" : vencedor.estado;
    const porque = estado === "revisar" && divergentes.length > 0 && vencedor.estado === "conferido"
      ? "outro documento diz coisa diferente" : vencedor.porque;

    return { campo, valor: vencedor.valor, documento: vencedor.documento, estado, porque, divergentes };
  });
}

/* ── o que a tela diz ─────────────────────────────────────────────────────── */

/** "4 conferidos, 3 para revisar, 2 em branco". Sem contar o que não existe. */
export function resumoDaLeitura(campos: CampoLido[]): string {
  const conferidos = campos.filter((c) => c.estado === "conferido" && c.valor).length;
  const revisar = campos.filter((c) => c.estado !== "conferido" && c.valor).length;
  const brancos = campos.filter((c) => !c.valor).length;
  const partes: string[] = [];
  if (conferidos) partes.push(`${conferidos} conferido${conferidos > 1 ? "s" : ""}`);
  if (revisar) partes.push(`${revisar} para revisar`);
  if (brancos) partes.push(`${brancos} em branco`);
  return partes.join(", ") || "nada encontrado";
}

/**
 * O que ainda impede de levar ao Writer.
 *
 * Só nome e CPF são obrigatórios: sem eles a qualificação não existe e a peça
 * não sai. O resto o Writer aceita em branco, e em branco é honesto.
 */
export function faltaParaOWriter(campos: CampoLido[]): CampoDoKit[] {
  const obrigatorios: CampoDoKit[] = ["nome", "cpf"];
  return obrigatorios.filter((o) => {
    const c = campos.find((x) => x.campo === o);
    return !c?.valor || c.estado === "recusado";
  });
}
