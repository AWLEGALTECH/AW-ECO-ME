// Parser de CONTRACHEQUE MILITAR (Exército · CPEx) — 100% código, sem IA.
//
// Estrutura do comprovante mensal de rendimentos do CPEx:
//   MÊS MARÇO / 2024                     ← competência
//   NR0001  SOLDO                1.765,00   ← receita  (código NRxxxx)
//   ND0001  FUSEX  3%               68,84   ← desconto (código NDxxxx)
//   R$ 3.540,95  R$ 355,79  R$ 3.185,16    ← totais (receitas · despesas · líquido)
//
// O pdf.js quebra acentos em tokens separados ("MAR Ç O"), então a competência
// é procurada no texto COMPACTADO (sem espaços e sem diacríticos).

export interface RubricaCC {
  codigo: string;
  descricao: string;
  tipo: "receita" | "desconto";
  valor: number;
}

export interface Contracheque {
  name: string;
  competencia: string | null;      // "2024-03" (ordenável)
  competenciaLabel: string;        // "mar/2024"
  nome: string | null;
  cpf: string | null;
  rubricas: RubricaCC[];
  totalReceitas: number | null;
  totalDespesas: number | null;
  totalLiquido: number | null;
  ok: boolean;
  erro?: string;
}

const MESES: Record<string, string> = {
  JANEIRO: "01", FEVEREIRO: "02", MARCO: "03", ABRIL: "04", MAIO: "05", JUNHO: "06",
  JULHO: "07", AGOSTO: "08", SETEMBRO: "09", OUTUBRO: "10", NOVEMBRO: "11", DEZEMBRO: "12",
};
const MES_ABREV = ["", "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const valorBR = (s: string) => Number(String(s).replace(/\./g, "").replace(",", "."));

export function parseContracheque(name: string, texto: string): Contracheque {
  const linhas = String(texto || "").split(/\r?\n/);
  const compacto = semAcento(String(texto || "").toUpperCase()).replace(/\s+/g, "");

  // Competência: nome do mês seguido de /ANO no texto compactado.
  let competencia: string | null = null;
  let competenciaLabel = "";
  const mMes = compacto.match(/(JANEIRO|FEVEREIRO|MARCO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\/?(\d{4})/);
  if (mMes) {
    const mm = MESES[mMes[1]];
    competencia = `${mMes[2]}-${mm}`;
    competenciaLabel = `${MES_ABREV[parseInt(mm, 10)]}/${mMes[2]}`;
  }

  // CPF (primeiro que aparecer).
  const cpf = texto.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/)?.[0] || null;

  // Nome: na linha seguinte ao cabeçalho "PREC-CP ... NOME ...", depois dos
  // dígitos do PREC vem a sequência de palavras MAIÚSCULAS (para no primeiro
  // token com dígito, tipo "1º BIS").
  let nome: string | null = null;
  for (let i = 0; i < linhas.length - 1; i++) {
    if (/PREC-?CP/i.test(linhas[i]) && /NOME/i.test(linhas[i])) {
      const alvo = linhas[i + 1].replace(/^[\s\d]+/, "");
      const mN = alvo.match(/^([A-ZÀ-Ü][A-ZÀ-Ü ]+)/);
      if (mN && mN[1].trim().length >= 5) nome = mN[1].trim().replace(/\s{2,}/g, " ");
      break;
    }
  }

  // Rubricas: NRxxxx = receita, NDxxxx = desconto; o valor é o último decimal
  // da linha. Info complementar numérica ("3%", "1") sai da descrição.
  const rubricas: RubricaCC[] = [];
  for (const l of linhas) {
    const m = l.match(/(N[RD]\d{4})\s+(.*?)(\d{1,3}(?:\.\d{3})*,\d{2})\s*$/);
    if (!m) continue;
    let desc = m[2].trim();
    while (/\s[\d.,%]+$/.test(` ${desc}`)) desc = desc.replace(/\s*[\d.,%]+$/, "").trim();
    if (!desc) continue;
    rubricas.push({
      codigo: m[1].toUpperCase(),
      descricao: desc.replace(/\s{2,}/g, " "),
      tipo: m[1].toUpperCase().startsWith("ND") ? "desconto" : "receita",
      valor: valorBR(m[3]),
    });
  }

  // Totais: "R$ 3.540,95  R$ 355,79  R$ 3.185,16"
  let totalReceitas: number | null = null, totalDespesas: number | null = null, totalLiquido: number | null = null;
  const mTot = texto.match(/R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)\s+R\$\s*([\d.,]+)/);
  if (mTot) { totalReceitas = valorBR(mTot[1]); totalDespesas = valorBR(mTot[2]); totalLiquido = valorBR(mTot[3]); }

  const ok = !!competencia && rubricas.length > 0;
  return {
    name, competencia, competenciaLabel, nome, cpf, rubricas,
    totalReceitas, totalDespesas, totalLiquido, ok,
    erro: ok ? undefined : (!competencia ? "competência não encontrada" : "nenhuma rubrica encontrada"),
  };
}
