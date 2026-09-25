export const caixaProfile = {
  id: "caixa",
  name: "Caixa Econômica Federal",
  detect: (text) => /caixa\s+econ[oô]mica|caixa\s+federal|cef\b/i.test(text),
  score: (combined) => {
    let s = 0;
    if (/caixa\s+econ[oô]mica/i.test(combined)) s += 4;
    if (/caixa\s+federal/i.test(combined)) s += 4;
    if (/cef\b/i.test(combined)) s += 2;
    return s;
  },
  supported: false,
};
