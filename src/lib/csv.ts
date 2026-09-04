// LER CSV DE VERDADE.
//
// Existe porque o caminho alternativo de leitura da planilha (exportar pelo
// Drive, quando a API do Sheets não está disponível) devolve CSV — e CSV
// "dividido por vírgula" quebra na primeira célula que tem vírgula dentro.
//
// E aqui elas TÊM: a coluna "Respostas" da landing é literalmente
//   Conta: Sim, tenho uma conta atualmente | Tempo de conta: Entre 1 e 3 anos
// Um `split(",")` transformaria essa linha em cinco colunas e jogaria o
// telefone pra fora do lugar — sem erro nenhum, só com a fila discando número
// errado. Por isso o campo entre aspas, a aspa dobrada dentro do campo e a
// quebra de linha dentro da célula são tratados de propósito.

/**
 * CSV → matriz de células.
 *
 * Segue o RFC 4180 no que importa: campo entre aspas pode conter vírgula,
 * quebra de linha e aspas dobradas. Aceita \n e \r\n, e ignora a linha vazia
 * do fim (arquivo exportado quase sempre termina em quebra de linha).
 */
export function lerCsv(texto: string, separador = ","): string[][] {
  const s = String(texto ?? "");
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let entreAspas = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (entreAspas) {
      if (c === '"') {
        // Aspa dobrada é uma aspa literal; sozinha, fecha o campo.
        if (s[i + 1] === '"') { campo += '"'; i++; }
        else entreAspas = false;
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') { entreAspas = true; continue; }
    if (c === separador) { linha.push(campo); campo = ""; continue; }
    if (c === "\r") continue;          // \r\n: o \n fecha a linha
    if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; continue; }
    campo += c;
  }

  // O que sobrou depois do último \n só vira linha se houver algo — senão toda
  // planilha ganharia uma linha vazia no fim.
  if (campo.length > 0 || linha.length > 0) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

/** CSV no formato que `lerPlanilha` espera: cabeçalho + linhas numeradas. */
export function csvParaPlanilha(texto: string): {
  cabecalho: string[];
  linhas: { linha: number; celulas: string[] }[];
} {
  const bruto = lerCsv(texto);
  if (bruto.length === 0) return { cabecalho: [], linhas: [] };
  return {
    cabecalho: bruto[0].map((c) => String(c ?? "").trim()),
    // A linha 1 é o cabeçalho: a primeira de dados é a 2 da planilha, e é esse
    // número que interessa a quem for conferir abrindo o arquivo.
    linhas: bruto.slice(1).map((celulas, i) => ({ linha: i + 2, celulas })),
  };
}
