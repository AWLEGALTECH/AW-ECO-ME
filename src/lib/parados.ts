// Faixas de tempo sem movimentação (compartilhado entre a lista de Processos e
// a página "Processos parados"). Arquivados e suspensos ficam fora da métrica.

export const FAIXAS = [
  { key: "s1", label: "Até 1 semana", desc: "sem mexer há até 7 dias", titulo: "Parados há até 1 semana", min: 0, max: 7 },
  { key: "s2", label: "Até 2 semanas", desc: "sem mexer há 8 a 14 dias", titulo: "Parados de 1 a 2 semanas", min: 8, max: 14 },
  { key: "s3", label: "Até 3 semanas", desc: "sem mexer há 15 a 21 dias", titulo: "Parados de 2 a 3 semanas", min: 15, max: 21 },
  { key: "m1", label: "Até 1 mês", desc: "sem mexer há 22 a 30 dias", titulo: "Parados de 3 semanas a 1 mês", min: 22, max: 30 },
  { key: "m3", label: "Até 3 meses", desc: "sem mexer há 1 a 3 meses", titulo: "Parados de 1 a 3 meses", min: 31, max: 90 },
  { key: "mais", label: "Mais de 3 meses", desc: "sem mexer há mais de 3 meses", titulo: "Parados há mais de 3 meses", min: 91, max: Infinity },
] as const;

export type FaixaBase = typeof FAIXAS[number]["key"];
export type ParadoKey = FaixaBase | "sem" | "suspensos";

// Dias corridos desde a data (yyyy-mm-dd) até hoje. null se sem data.
export function diasSemMov(d: string | null): number | null {
  if (!d) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const t = new Date(`${d}T00:00:00`).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((hoje.getTime() - t) / 86400000));
}

export function faixaDe(dias: number | null): FaixaBase | "sem" {
  if (dias === null) return "sem";
  return (FAIXAS.find((f) => dias >= f.min && dias <= f.max)?.key ?? "mais");
}

// Título e subtítulo da página, por chave.
export function infoParados(key: ParadoKey): { titulo: string; subtitulo: string } {
  if (key === "sem") return { titulo: "Sem data de andamento", subtitulo: "Processos em movimento sem data de último andamento registrada" };
  if (key === "suspensos") return { titulo: "Processos suspensos", subtitulo: "Parados por decisão, fora da métrica de movimentação" };
  const f = FAIXAS.find((x) => x.key === key);
  return { titulo: f?.titulo ?? "Processos parados", subtitulo: f?.desc ?? "" };
}
