// Histórico das ações que entraram e saíram da análise comercial.
//
// O jsonb em clientes.analise_comercial guarda o ESTADO ATUAL: quem sai dele
// desaparece sem deixar rastro. Este painel lê a tabela de eventos, que é onde
// a história mora — quem tirou, quando e por quê, e a quem cada ação nova foi
// creditada no fechamento.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Minus, ChevronDown, History } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EventoAC {
  id: string;
  rubrica: string;
  requerido: string | null;
  acao: "adicionada" | "removida";
  motivo: string | null;
  created_at: string;
  por_nome: string | null;
  creditada_nome: string | null;
}

const fmtQuando = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
};

export function HistoricoAnaliseComercial({ clienteId }: { clienteId: string }) {
  const [eventos, setEventos] = useState<EventoAC[] | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await (supabase.from("analise_comercial_eventos" as never) as never as any)
        .select("id, rubrica, requerido, acao, motivo, created_at, por:profiles!analise_comercial_eventos_por_fkey(nome), creditada:profiles!analise_comercial_eventos_creditada_a_fkey(nome)")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false });
      if (cancel) return;
      setEventos(((data || []) as any[]).map((e) => ({
        id: String(e.id), rubrica: String(e.rubrica), requerido: e.requerido ?? null,
        acao: e.acao, motivo: e.motivo ?? null, created_at: e.created_at,
        por_nome: e.por?.nome ?? null, creditada_nome: e.creditada?.nome ?? null,
      })));
    })();
    return () => { cancel = true; };
  }, [clienteId]);

  if (!eventos || eventos.length === 0) return null;
  const nSaidas = eventos.filter((e) => e.acao === "removida").length;

  return (
    <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
      <button onClick={() => setAberto((o) => !o)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-white/[0.02] transition-colors">
        <History className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-[12.5px] font-medium">Histórico das ações</span>
        <span className="text-[11px] text-muted-foreground">
          {eventos.length} {eventos.length === 1 ? "registro" : "registros"}
          {nSaidas > 0 && ` · ${nSaidas} ${nSaidas === 1 ? "retirada" : "retiradas"}`}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground ml-auto shrink-0 transition-transform", aberto && "rotate-180")} />
      </button>

      {aberto && (
        <ul className="divide-y divide-border/50 border-t border-border">
          {eventos.map((e) => {
            const saiu = e.acao === "removida";
            return (
              <li key={e.id} className="flex items-start gap-2.5 px-4 py-2.5">
                <span className={cn("h-5 w-5 rounded-md grid place-items-center shrink-0 mt-0.5",
                  saiu ? "bg-rose-500/15 text-rose-400" : "bg-emerald-500/15 text-emerald-400")}>
                  {saiu ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[13px]", saiu ? "text-muted-foreground line-through decoration-rose-400/40" : "text-foreground")}>
                    {e.rubrica}
                    {e.requerido && <span className="text-muted-foreground font-normal no-underline"> · contra {e.requerido}</span>}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {saiu ? "retirada por" : "adicionada por"} <strong className="text-foreground/80 font-medium">{e.por_nome || "—"}</strong>
                    {!saiu && e.creditada_nome && e.creditada_nome !== e.por_nome && (
                      <> · creditada a <strong className="text-foreground/80 font-medium">{e.creditada_nome}</strong></>
                    )}
                    {" · "}{fmtQuando(e.created_at)}
                  </p>
                  {e.motivo && <p className="text-[11px] text-muted-foreground/70 italic mt-0.5">“{e.motivo}”</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
