// Conversão de string de dinheiro (BR ou US) para número em reais.
//
// O bug que motivou isso: o formulário de protocolo pré-preenche o campo
// com `String(valor_causa)`, que usa PONTO como decimal (ex.: "15772.66").
// O parser antigo removia TODOS os pontos achando que eram separador de
// milhar, transformando 15772.66 em 1577266 (×100). Este parser detecta
// corretamente o separador decimal.
//
// Casos cobertos:
//   "15.772,66"  (BR)              -> 15772.66
//   "15772.66"   (ponto decimal)   -> 15772.66   ← pré-preenchido String(num)
//   "15772,66"   (vírgula decimal) -> 15772.66
//   "1.577.266"  (milhar BR)       -> 1577266
//   "1,577,266"  (milhar US)       -> 1577266
//   "1.234,56" / "1,234.56"        -> 1234.56
//   "3361.2" / "3361,2"            -> 3361.2
//   "R$ 1.234,56" / "1577266"      -> 1234.56 / 1577266
export function parseMoneyBR(input: string | number | null | undefined): number {
  if (input == null) return 0;
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;

  let s = String(input).trim().replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  const negativo = s.startsWith("-");
  s = s.replace(/-/g, "");
  if (!s) return 0;

  const pontos = (s.match(/\./g) || []).length;
  const virgulas = (s.match(/,/g) || []).length;

  let normalizado: string;
  if (pontos > 0 && virgulas > 0) {
    // Tem os dois: o separador que aparece por ÚLTIMO é o decimal.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      normalizado = s.replace(/\./g, "").replace(/,/g, "."); // vírgula decimal, ponto milhar
    } else {
      normalizado = s.replace(/,/g, "");                      // ponto decimal, vírgula milhar
    }
  } else if (virgulas > 0) {
    // Só vírgulas: 1 = decimal; 2+ = milhar.
    normalizado = virgulas > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (pontos > 0) {
    // Só pontos: pode ser decimal (1-2 casas) ou milhar (3 casas ou vários).
    const casas = s.length - s.lastIndexOf(".") - 1;
    normalizado = pontos > 1 || casas === 3 || casas === 0 ? s.replace(/\./g, "") : s;
  } else {
    normalizado = s;
  }

  const n = Number(normalizado);
  if (!Number.isFinite(n)) return 0;
  return negativo ? -n : n;
}
