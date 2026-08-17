import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarDays, X } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

// Data em ISO (yyyy-mm-dd) por dentro, dd/mm/aaaa por fora.
const paraBR = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};
const paraISO = (br: string) => {
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, a] = m;
  const dt = new Date(Number(a), Number(mo) - 1, Number(d));
  if (dt.getDate() !== Number(d) || dt.getMonth() !== Number(mo) - 1) return null;
  return `${a}-${mo}-${d}`;
};

// Campo de data que aceita as duas formas: digitar dd/mm/aaaa com máscara
// automática, ou abrir o calendário no ícone. O <input type="date"> nativo
// dependia do widget do navegador, que ignora o tema e muda de browser
// pra browser.
export function CampoData({
  valor, onChange, placeholder = "dd/mm/aaaa", className,
}: {
  valor: string;              // ISO ou ""
  onChange: (iso: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [texto, setTexto] = useState(paraBR(valor));
  const [aberto, setAberto] = useState(false);

  // Mantém o texto em dia quando o valor muda de fora (reset de formulário).
  const [ultimoValor, setUltimoValor] = useState(valor);
  if (valor !== ultimoValor) { setUltimoValor(valor); setTexto(paraBR(valor)); }

  const digitar = (v: string) => {
    // Máscara: só dígitos, barras entram sozinhas.
    const d = v.replace(/\D/g, "").slice(0, 8);
    const fmt = d.length <= 2 ? d
      : d.length <= 4 ? `${d.slice(0, 2)}/${d.slice(2)}`
      : `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
    setTexto(fmt);
    if (fmt === "") { onChange(""); return; }
    const iso = paraISO(fmt);
    if (iso) onChange(iso);
  };

  const selecionada = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T00:00:00`) : undefined;

  return (
    <div className={cn("relative", className)}>
      <input
        value={texto}
        onChange={(e) => digitar(e.target.value)}
        placeholder={placeholder}
        inputMode="numeric"
        className="w-full rounded-lg border border-border bg-white/[0.03] pl-3 pr-16 py-2 text-sm outline-none focus:border-primary/50 transition-colors tabular-nums"
      />
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
        {valor && (
          <button type="button" onClick={() => { setTexto(""); onChange(""); }}
            className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
            aria-label="Limpar data">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <Popover open={aberto} onOpenChange={setAberto}>
          <PopoverTrigger asChild>
            <button type="button"
              className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              aria-label="Abrir calendário">
              <CalendarDays className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              locale={ptBR}
              selected={selecionada}
              defaultMonth={selecionada}
              onSelect={(d) => {
                if (!d) { setTexto(""); onChange(""); setAberto(false); return; }
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                setTexto(paraBR(iso));
                onChange(iso);
                setAberto(false);
              }}
              initialFocus
              className="pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
