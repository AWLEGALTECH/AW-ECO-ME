import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, FileSearch, Loader2, ChevronRight, Check } from "lucide-react";
import {
  ordenarAnalises, filtrarAnalises, resumoDaAnalise, type AnaliseSalva,
} from "@/lib/analiseParaAcoes";
import { nomeCurto } from "@/lib/nomeDoLead";

/* VINCULAR UMA ANÁLISE QUE JÁ EXISTE.
 *
 * A jornada anda sozinha quando a análise NASCE ligada à conversa, e isso só
 * acontece quando o Finder foi aberto pelo botão daqui. Aberto pelo menu, a
 * análise fica pronta e solta: o lead espera para sempre numa etapa que já
 * passou, e ninguém recebe erro nenhum. Já tem um caso na base desde julho.
 *
 * Este botão é o conserto pela mão de quem está olhando. Escolhida a análise, o
 * banco faz o resto sozinho: o gatilho move a etapa e batiza o lead com o nome
 * do titular, que é o que arranca a conversa do "😎".
 *
 * ELE NÃO ESCOLHE POR VOCÊ. O nome do extrato é o de cartório e o do WhatsApp é
 * apelido; casar por semelhança moveria o funil de outra pessoa. A lista ordena
 * e destaca o provável, e o clique é de gente.
 */

const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };

export function VincularAnalise({ conversaId, nomeDoLead, telefone, onVinculou }: {
  conversaId: string;
  /** o nome que a conversa mostra hoje, para ordenar os candidatos */
  nomeDoLead: string;
  telefone?: string | null;
  onVinculou: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [analises, setAnalises] = useState<AnaliseSalva[]>([]);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (!aberto) return;
    let cancel = false;
    setCarregando(true);
    (async () => {
      /* SÓ AS SOLTAS. Uma análise já ligada a outra conversa não pode ser
         puxada para cá: ela é de outra pessoa, e roubar o vínculo moveria a
         jornada de quem não pediu. */
      const { data } = await (supabase.from("analises_comerciais" as never) as never as {
        select: (c: string) => any;
      }).select("id, nome, cpf_cnpj, rubricas, cliente_id, conversa_id, created_at, created_by_email")
        .is("conversa_id", null)
        .order("created_at", { ascending: false })
        .limit(300);
      if (cancel) return;
      setAnalises(((data || []) as any[]).map((a) => ({
        ...a, rubricas: Array.isArray(a.rubricas) ? a.rubricas : [],
      })) as AnaliseSalva[]);
      setCarregando(false);
    })();
    return () => { cancel = true; };
  }, [aberto]);

  const lista = useMemo(
    () => filtrarAnalises(ordenarAnalises(analises, { nome: nomeDoLead }), busca).slice(0, 40),
    [analises, nomeDoLead, busca]);

  const vincular = async (a: AnaliseSalva) => {
    setSalvando(a.id);
    const { error } = await (supabase.from("analises_comerciais" as never) as never as {
      update: (v: unknown) => any;
    }).update({ conversa_id: conversaId }).eq("id", a.id).is("conversa_id", null);
    setSalvando(null);
    if (error) { toast.error("Não consegui vincular: " + error.message); return; }
    setAberto(false);
    toast.success(
      `Análise de ${nomeCurto(a.nome) || a.nome} vinculada. A jornada andou e o lead ganhou nome.`,
      { duration: 5000 });
    onVinculou();
  };

  return (
    <>
      <button onClick={() => setAberto(true)}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/30
                   bg-primary/[0.04] py-1.5 text-[11px] font-medium text-primary
                   hover:bg-primary/[0.10] hover:border-primary/50 transition-colors">
        <Link2 className="h-3.5 w-3.5" />
        Vincular a uma análise existente
      </button>

      <Dialog open={aberto} onOpenChange={(o) => { if (!salvando) setAberto(o); }}>
        <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-primary" />
              Análises comerciais sem dono
            </DialogTitle>
            <DialogDescription>
              As que foram feitas fora do atendimento e ficaram soltas. Escolhendo uma, a jornada anda
              sozinha e o lead passa a se chamar pelo nome do extrato.
            </DialogDescription>
          </DialogHeader>

          <div className="shrink-0 py-1">
            <Input value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Procurar por nome, CPF ou rubrica" autoFocus className="h-9 text-[13px]" />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 py-1">
            {carregando ? (
              <p className="text-[12.5px] text-muted-foreground text-center py-8 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Procurando…
              </p>
            ) : lista.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground text-center py-8">
                {analises.length === 0
                  ? "Nenhuma análise solta. Todas já estão ligadas a alguma conversa."
                  : `Nada com “${busca.trim()}”.`}
              </p>
            ) : (
              <AnimatePresence initial={false}>
                {lista.map((a, i) => (
                  <motion.button
                    key={a.id} layout
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ ...MOLA, delay: Math.min(i, 8) * 0.035 }}
                    onClick={() => vincular(a)} disabled={!!salvando}
                    className="w-full text-left rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5
                               flex items-center gap-3 transition-colors hover:border-primary/40
                               hover:bg-white/[0.04] disabled:opacity-50">
                    <span className="h-9 w-9 rounded-lg bg-white/[0.05] ring-1 ring-white/10 grid place-items-center shrink-0">
                      {salvando === a.id
                        ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        : <FileSearch className="h-4 w-4 text-muted-foreground" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium truncate">{a.nome || "sem nome"}</span>
                      <span className="block text-[11px] text-muted-foreground truncate">
                        {resumoDaAnalise(a)}
                        {a.created_at ? ` · ${new Date(a.created_at).toLocaleDateString("pt-BR")}` : ""}
                      </span>
                      {a.created_by_email && (
                        <span className="block text-[10.5px] text-muted-foreground/70 truncate mt-0.5">
                          por {a.created_by_email}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  </motion.button>
                ))}
              </AnimatePresence>
            )}
          </div>

          <DialogFooter className="shrink-0 pt-2">
            <p className="text-[11px] text-muted-foreground mr-auto flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 shrink-0" />
              {telefone ? `Vai para a conversa de ${telefone}.` : "Vai para esta conversa."}
            </p>
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={!!salvando}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
