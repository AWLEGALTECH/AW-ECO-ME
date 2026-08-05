import { Lock, CheckCircle2, ClipboardList } from "lucide-react";

// Painel read-only dos descontos vindos da análise comercial (Finder ou
// descontos manuais do Writer), guardado em clientes.analise_comercial.
// Os bloqueados aparecem TRAVADOS (cadeado, riscado, apagado, "não
// selecionável") pra impedir que a análise primária reconsidere um desconto
// já descartado no comercial. Os ajuizáveis aparecem em verde.

interface RubricaAC { rubrica: string; valor: number | null; bloqueada: boolean; motivo: string | null; detalhe: string | null }

const MOTIVO_LABEL: Record<string, string> = {
  ja_ajuizada: "Já ajuizada",
  cliente_nao_quer: "Cliente não quer",
  rubrica_invalida: "Rúbrica inválida",
};

const fmtBRL = (v: number | null) =>
  v == null ? null : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

// Aceita { rubricas: [...] } (formato salvo) ou o array direto.
export function rubricasDaAnalise(ac: any): RubricaAC[] {
  const arr = Array.isArray(ac) ? ac : ac?.rubricas;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((r: any) => ({
      rubrica: String(r?.rubrica || "").trim(),
      valor: r?.valor ?? null,
      bloqueada: !!r?.bloqueada,
      motivo: r?.motivo ?? null,
      detalhe: (r?.detalhe && String(r.detalhe).trim()) || null,
    }))
    .filter((r: RubricaAC) => r.rubrica);
}

export function DescontosAnaliseComercial({ analise, className }: { analise: any; className?: string }) {
  const rubricas = rubricasDaAnalise(analise);
  if (rubricas.length === 0) return null;
  const nBloq = rubricas.filter((r) => r.bloqueada).length;
  const nOk = rubricas.length - nBloq;

  return (
    <div className={`rounded-xl border border-border bg-card/40 p-3 ${className || ""}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <ClipboardList className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider">Descontos · análise comercial</span>
        <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
          {nOk} ajuizável{nOk === 1 ? "" : "is"} · {nBloq} bloqueado{nBloq === 1 ? "" : "s"}
        </span>
      </div>
      {nBloq > 0 && (
        <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
          Os descontos <strong>bloqueados</strong> foram descartados na análise comercial e não podem ser reconsiderados aqui.
        </p>
      )}
      <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
        {rubricas.map((r, i) => (
          <div
            key={i}
            aria-disabled={r.bloqueada || undefined}
            title={r.bloqueada ? "Bloqueado na análise comercial" : "Ajuizável"}
            className={`flex items-center gap-2 px-3 py-2 ${
              r.bloqueada ? "bg-muted/40 opacity-70 cursor-not-allowed select-none" : ""
            }`}
          >
            {r.bloqueada ? (
              <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            )}
            <span
              className={`text-[13px] flex-1 min-w-0 truncate ${
                r.bloqueada ? "line-through text-muted-foreground" : "text-foreground"
              }`}
            >
              {r.rubrica}
              {r.detalhe && <span className="text-muted-foreground font-normal"> · {r.detalhe}</span>}
            </span>
            {fmtBRL(r.valor) && (
              <span className="text-[12px] tabular-nums text-muted-foreground shrink-0">{fmtBRL(r.valor)}</span>
            )}
            {r.bloqueada && (
              <span className="shrink-0 text-[10px] uppercase tracking-wide bg-muted text-muted-foreground border border-border rounded-full px-2 py-0.5">
                {MOTIVO_LABEL[r.motivo || ""] || "bloqueado"}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
