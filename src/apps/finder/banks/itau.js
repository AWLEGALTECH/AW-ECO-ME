export const itauProfile = {
  id: "itau",
  name: "Itaú",
  detect: (text) => /ita[uú]|itau|combinaqui|extrato\s+anual\s+de\s+tarifas|periodo\s+de\s+visualiza|extrato\s+conta\s*\/\s*lan[cç]amentos|limite\s+da\s+conta\s+(utilizado|dispon)/i.test(text),
  score: (combined) => {
    let s = 0;
    if (/ita[uú]|itau/i.test(combined)) s += 3;
    if (/combinaqui/i.test(combined)) s += 5;
    if (/extrato\s+anual\s+de\s+tarifas/i.test(combined)) s += 5;
    if (/extrato\s+conta\s*\/\s*lan[cç]amentos/i.test(combined)) s += 4;
    // "extrato de conta corrente" removido — genérico demais, todas as banks usam
    if (/meu\s+extrato|minhas\s+finan[cç]as|tarpacoteitau/i.test(combined)) s += 4; // Itaú mobile app
    if (/periodo\s+de\s+visualiza/i.test(combined)) s += 3;
    if (/limite\s+da\s+conta\s+(utilizado|dispon)/i.test(combined)) s += 3;
    return s;
  },
  supported: true,
  dateFormat: /^\d{2}\/\d{2}\/\d{4}$/,
  headerPattern: /extrato\s+conta\s*\/|extrato\s+de\s+conta\s+corrente|extrato\s+anual\s+de\s+tarifas|^lancamentos$|^lan[cç]amentos$|periodo\s+de\s+visualizacao|per[ií]odo\s*:|^cliente$|saldo\s+em\s+conta|limite\s+da\s+conta|emitido\s+em|agencia:\s*\d|ag[eê]ncia:\s*\d|conta:\s*\d|^valor(\s*\(r\$\))?$|^saldo(\s*\(r\$\))?$|^dia$|^lote$|^documento$|^hist[oó]rico$|aviso!|itau\s+unibanco|total\s+aplica[cç]/i,
  summaryPattern: /saldo\s+do\s+dia|saldo\s+anterior|saldo\s+final|saldo\s+em\s+conta|^s\s+a\s+l\s+d\s+o$|aviso!/i,
  columnHeaders: {
    valor: /^valor\s*\(r\$\)/i,
    saldo: /^saldo\s*\(r\$\)/i,
  },
};
