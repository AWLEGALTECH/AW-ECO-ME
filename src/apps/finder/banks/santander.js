export const santanderProfile = {
  id: "santander",
  name: "Santander",
  detect: (text) => /santander|contamax|extrato\s+consolidado\s+inteligente/i.test(text),
  score: (combined) => {
    let s = 0;
    if (/santander/i.test(combined)) s += 2;
    if (/contamax/i.test(combined)) s += 2;
    // Markers estruturais exclusivos de PDFs Santander
    if (/extrato\s+consolidado\s+inteligente/i.test(combined)) s += 5;
    if (/Extrato_PF_A4_Inteligente/i.test(combined)) s += 5;
    if (/BALP_UY_/i.test(combined)) s += 5;
    if (/santander\s+van\s+gogh/i.test(combined)) s += 3;
    if (/saldo\s+de\s+contamax/i.test(combined)) s += 3;
    return s;
  },
  supported: true,
  dateFormat: /^\d{2}\/\d{2}$/,
  headerPattern: /^nome$|^ag[eê]ncia$|^conta\s+corrente$|^movimenta[cç][aã]o$|saldo\s+de\s+contamax|saldo\s+dispon[ií]vel|limite\s+santander|provis[aã]o\s+de\s+encargos|santander\s+van\s+gogh|extrato\s+consolidado|pagina\s*:|reclama[cç][oõ]es|cancelamentos|consultas.*informa|twitter|facebook|www\.santander/i,
  summaryPattern: /^saldo\s+em\s+\d{2}\/\d{2}$|saldo\s+de\s+contamax|saldo\s+dispon[ií]vel|^\(\=\)|^\(\+\)|^\(\-\)/i,
  columnHeaders: {
    valor: /valor|d[eé]bito|cr[eé]dito/i,
    saldo: /saldo/i,
  },
};
