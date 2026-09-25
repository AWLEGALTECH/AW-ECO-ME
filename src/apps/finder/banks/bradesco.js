// Bradesco Celular bank profile
// Keywords are in the main CATEGORIAS array (parser.js) for now

export const bradescoProfile = {
  id: "bradesco",
  name: "Bradesco",
  detect: (text) => /bradesco/i.test(text),
  score: (combined) => {
    let s = 0;
    if (/bradesco\s+celular/i.test(combined)) s += 5;
    else if (/bradesco/i.test(combined)) s += 1;
    // Penalizar se "bradesco" aparece só em contexto de pagamento (não é extrato Bradesco)
    if (/banco\s+bradesco\s+s\.?a/i.test(combined) && !/bradesco\s+celular/i.test(combined)) s -= 1;
    return s;
  },
  dateFormat: /^\d{2}\/\d{2}\/\d{4}$/,
  headerPattern: /bradesco\s+celular|extrato\s+de\s*:|folha\s*:\s*\d+\/\d+|data\s+hist[oó]rico|cr[eé]dito\s*\(r\$\)|d[eé]bito\s*\(r\$\)|saldo\s*\(r\$\)|movimenta[cç][aã]o\s+entre|transf\s+saldo\s+c\/sal\s+p\/cc|[uú]ltimos\s+lan[cç]amentos|total\s+data\s*:|^data\s*:\s*\d{2}\/\d{2}\/\d{4}|^nome\s*:\s*[A-Z]/i,
  summaryPattern: /^\s*total\b|\btotal\s*$|[uú]ltimos\s+lan[cç]amentos/i,
  columnHeaders: {
    credito: /^cr[eé]dito/i,
    debito: /^d[eé]bito/i,
    saldo: /^saldo/i,
  },
  supported: true,
};
