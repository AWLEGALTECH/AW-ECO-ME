import { Search, X } from "lucide-react";

// Busca das grades de rubricas/ações. O catálogo é global e cresce a cada
// ação padrão criada — a essa altura procurar no olho já não escala.
// Usado no editor de ações ajuizáveis e no dialog de fechamento.
export function BuscaRubrica({
  valor, onChange, total, filtrados, placeholder = "Buscar ação…",
}: {
  valor: string;
  onChange: (v: string) => void;
  total: number;
  filtrados: number;
  placeholder?: string;
}) {
  const filtrando = valor.trim().length > 0;
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-white/[0.03] pl-8 pr-16 py-2 text-[12.5px] outline-none focus:border-primary/50 transition-colors"
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
        {filtrando && (
          <>
            <span className="text-[10px] tabular-nums text-muted-foreground">{filtrados}/{total}</span>
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Normaliza pra busca: sem acento, minúsculo. "capitalizacao" acha
// "Título de capitalização".
export const normBusca = (s: string) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export const filtraPorBusca = <T,>(itens: T[], termo: string, texto: (i: T) => string): T[] => {
  const q = normBusca(termo);
  if (!q) return itens;
  const termos = q.split(/\s+/);
  return itens.filter((i) => {
    const alvo = normBusca(texto(i));
    return termos.every((t) => alvo.includes(t));
  });
};
