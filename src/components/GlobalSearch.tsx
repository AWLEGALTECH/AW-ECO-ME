import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search, User, Briefcase } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SearchResult {
  type: "cliente" | "processo";
  id: string;
  label: string;
  detail: string;
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 2) { setResults([]); setOpen(false); return; }

    debounceRef.current = setTimeout(async () => {
      const [{ data: clientes }, { data: processos }] = await Promise.all([
        supabase.from("clientes").select("id, nome, cpf_cnpj").or(`nome.ilike.%${value}%,cpf_cnpj.ilike.%${value}%`).limit(5),
        supabase.from("processos").select("id, numero_processo, materia").or(`numero_processo.ilike.%${value}%,materia.ilike.%${value}%`).limit(5),
      ]);

      const all: SearchResult[] = [
        ...(clientes || []).map(c => ({ type: "cliente" as const, id: c.id, label: c.nome, detail: c.cpf_cnpj || "" })),
        ...(processos || []).map(p => ({ type: "processo" as const, id: p.id, label: p.numero_processo, detail: p.materia || "" })),
      ];
      setResults(all);
      setOpen(all.length > 0);
    }, 300);
  };

  const handleSelect = (r: SearchResult) => {
    setOpen(false);
    setQuery("");
    navigate(r.type === "cliente" ? `/clientes/${r.id}` : `/processos/${r.id}`);
  };

  return (
    <div ref={ref} className="relative hidden md:block">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary-foreground/50" />
        <Input
          type="search"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar cliente, processo, CPF..."
          readOnly
          onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          name="_awl_gsearch"
          data-form-type="other"
          data-lpignore="true"
          data-1p-ignore="true"
          className="w-64 pl-8 h-8 text-sm bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground placeholder:text-primary-foreground/50 focus-visible:ring-primary-foreground/30"
        />
      </div>
      {open && (
        <div className="absolute top-full left-0 w-80 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden">
          {results.map((r) => (
            <button key={`${r.type}-${r.id}`} className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-accent transition-colors" onClick={() => handleSelect(r)}>
              {r.type === "cliente" ? <User className="h-4 w-4 text-muted-foreground shrink-0" /> : <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{r.label}</p>
                <p className="text-xs text-muted-foreground truncate">{r.detail}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}