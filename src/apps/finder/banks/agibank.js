export const agibankProfile = {
  id: "agibank",
  name: "Agibank",
  detect: (text) => /agibank|banco\s*121/i.test(text),
  score: (combined) => {
    let s = 0;
    if (/agibank/i.test(combined)) s += 5;
    if (/banco\s*121/i.test(combined)) s += 3;
    if (/posi[cç][aã]o\s+da\s+conta/i.test(combined)) s += 2;
    if (/tarifa\s+comunica[cç][aã]o\s+digital/i.test(combined)) s += 3;
    return s;
  },
  supported: true,
  dateFormat: /^\d{2}\/\d{2}$/,
  headerPattern: /^data$|^detalhe\s+da\s+movimenta|^valor$|^saldo$|^lan[cç]amento$|posi[cç][aã]o\s+da\s+conta|seu\s+saldo|seu\s+limite|saldo\s+dispon|saldo\s+bloqueado|^endere[cç]o$|^sac$|^ouvidoria$|extrato\s+emitido\s+em|rua\s+sergio|campinas|cep:\s*\d|0800\s+\d/i,
  summaryPattern: /posi[cç][aã]o\s+da\s+conta|seu\s+saldo|seu\s+limite|saldo\s+bloqueado|saldo\s+dispon[ií]vel/i,
  columnHeaders: {
    valor: /^valor$/i,
    saldo: /^saldo$/i,
  },
};
