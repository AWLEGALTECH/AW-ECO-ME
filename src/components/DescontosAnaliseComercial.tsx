import { Lock, CheckCircle2, ClipboardList, FileSignature, HelpCircle } from "lucide-react";

// Painel read-only dos descontos vindos da análise comercial (Finder ou
// descontos manuais do Writer), guardado em clientes.analise_comercial.
// Os bloqueados aparecem TRAVADOS (cadeado, riscado, apagado, "não
// selecionável") pra impedir que a análise primária reconsidere um desconto
// já descartado no comercial. Os ajuizáveis aparecem em verde.

interface RubricaAC { rubrica: string; valor: number | null; bloqueada: boolean; motivo: string | null; detalhe: string | null; requerido: string | null; contrato_id: string | null }

// Contrato (só o que importa pra rotular o grupo).
export interface ContratoRef { id: string; modalidade?: string | null; data_assinatura?: string | null; reus?: string[] | null }

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
      requerido: (r?.requerido && String(r.requerido).trim()) || null,
      contrato_id: (r?.contrato_id && String(r.contrato_id)) || null,
    }))
    .filter((r: RubricaAC) => r.rubrica);
}

const fmtData = (d?: string | null) => {
  if (!d) return null;
  const dt = new Date(`${d}T00:00:00`);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("pt-BR");
};

function LinhaRubrica({ r }: { r: RubricaAC }) {
  return (
    <div
      aria-disabled={r.bloqueada || undefined}
      title={r.bloqueada ? "Bloqueado na análise comercial" : "Ajuizável"}
      className={`flex items-center gap-2 px-3 py-2 ${r.bloqueada ? "bg-muted/40 opacity-70 cursor-not-allowed select-none" : ""}`}
    >
      {r.bloqueada ? (
        <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
      ) : (
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
      )}
      <span className={`text-[13px] flex-1 min-w-0 truncate ${r.bloqueada ? "line-through text-muted-foreground" : "text-foreground"}`}>
        {r.rubrica}
        {r.requerido && <span className="text-muted-foreground font-normal"> · contra {r.requerido}</span>}
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
  );
}

export function DescontosAnaliseComercial({ analise, contratos, className }: { analise: any; contratos?: ContratoRef[]; className?: string }) {
  const rubricas = rubricasDaAnalise(analise);
  if (rubricas.length === 0) return null;
  const nBloq = rubricas.filter((r) => r.bloqueada).length;
  const nOk = rubricas.length - nBloq;

  // Agrupa por CONTRATO DE ORIGEM. O vínculo vem do kit que gerou o contrato;
  // o que não tiver origem identificada cai num grupo próprio, avisado.
  const porContrato = new Map<string, RubricaAC[]>();
  const semOrigem: RubricaAC[] = [];
  for (const r of rubricas) {
    const ct = r.contrato_id && (contratos || []).some((c) => c.id === r.contrato_id) ? r.contrato_id : null;
    if (!ct) { semOrigem.push(r); continue; }
    if (!porContrato.has(ct)) porContrato.set(ct, []);
    porContrato.get(ct)!.push(r);
  }
  const grupos = (contratos || [])
    .filter((c) => porContrato.has(c.id))
    .map((c) => ({ contrato: c, itens: porContrato.get(c.id)! }));

  const rotulo = (c: ContratoRef) => {
    const reu = (c.reus || []).filter(Boolean).join(", ");
    const data = fmtData(c.data_assinatura);
    return [reu || "réu não informado", data ? `assinado em ${data}` : null].filter(Boolean).join(" · ");
  };

  return (
    <div className={`rounded-xl border border-border bg-card/40 p-3 ${className || ""}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <ClipboardList className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider">Ações ajuizáveis · análise comercial</span>
        <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
          {nOk} ajuizável{nOk === 1 ? "" : "is"} · {nBloq} bloqueado{nBloq === 1 ? "" : "s"}
        </span>
      </div>
      {nBloq > 0 && (
        <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
          As ações <strong>bloqueadas</strong> foram descartadas na análise comercial e não podem ser reconsideradas aqui.
        </p>
      )}

      <div className="space-y-2.5">
        {grupos.map(({ contrato, itens }) => (
          <div key={contrato.id}>
            <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
              <FileSignature className="h-3 w-3 text-primary shrink-0" />
              <span className="truncate">
                Contrato {contrato.modalidade ? `de ${contrato.modalidade}` : ""} · {rotulo(contrato)}
              </span>
            </p>
            <div className="rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
              {itens.map((r, i) => <LinhaRubrica key={i} r={r} />)}
            </div>
          </div>
        ))}

        {semOrigem.length > 0 && (
          <div>
            <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
              <HelpCircle className="h-3 w-3 text-amber-400 shrink-0" />
              {grupos.length > 0 ? "Sem contrato de origem identificado" : "Origem não vinculada a contrato"}
            </p>
            <div className="rounded-lg border border-dashed border-amber-400/25 divide-y divide-border/60 overflow-hidden">
              {semOrigem.map((r, i) => <LinhaRubrica key={i} r={r} />)}
            </div>
            <p className="text-[10.5px] text-muted-foreground mt-1 leading-snug">
              {grupos.length > 0
                ? "Estas ações não vieram de nenhum contrato específico (foram adicionadas direto na análise)."
                : "A origem por contrato aparece quando a ação vem do kit que gerou o contrato."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
