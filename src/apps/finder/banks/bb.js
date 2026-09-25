export const bbProfile = {
  id: "bb",
  name: "Banco do Brasil",
  detect: (text) => /banco\s+do\s+brasil|bb\s+celular/i.test(text),
  score: (combined) => {
    let s = 0;
    if (/banco\s+do\s+brasil/i.test(combined)) s += 3;
    if (/bb\s+celular/i.test(combined)) s += 5;
    return s;
  },
  supported: false,
};
