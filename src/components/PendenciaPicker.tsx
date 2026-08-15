import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { TIPOS_PENDENCIA, type TipoPendencia } from "@/lib/pendencias";

// Lista de tipos de pendência + campo da personalizada. Compartilhada pelo
// diálogo de Análise Primária e pelo de Peça Pronta pra Protocolar, pra que
// relatar pendência seja a mesma experiência nos dois lugares.
export function PendenciaPicker({
  tipos, onToggle, custom, onCustom,
}: {
  tipos: Set<TipoPendencia>;
  onToggle: (k: TipoPendencia) => void;
  custom: string;
  onCustom: (v: string) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <label className="text-xs font-medium text-foreground">
          Tipos de pendência <span className="text-muted-foreground">(marque todas)</span>
        </label>
        <div className="rounded-lg border border-border divide-y divide-border/60">
          {TIPOS_PENDENCIA.map((t) => {
            const checked = tipos.has(t.key);
            return (
              <label
                key={t.key}
                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                  checked ? "bg-primary/5" : "hover:bg-muted/30"
                }`}
              >
                <Checkbox checked={checked} onCheckedChange={() => onToggle(t.key)} />
                <span className="text-sm">{t.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {tipos.has("personalizada") && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground">Descreva a pendência personalizada</label>
          <Textarea
            value={custom}
            onChange={(e) => onCustom(e.target.value)}
            placeholder="Ex: falta termo de declaração assinado pelo cliente"
            className="resize-none min-h-[80px]"
          />
        </div>
      )}
    </>
  );
}
