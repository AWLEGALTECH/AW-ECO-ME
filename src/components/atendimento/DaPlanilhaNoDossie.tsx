/* O QUE A PESSOA RESPONDEU NA PLANILHA, DENTRO DO DOSSIÊ DA CONVERSA.
 *
 * Pedido do chefe (23/09). O dossiê mostrava foto, nome, número e origem, e
 * nada do que a pessoa contou na landing. Para a base do Bradesco isso é o que
 * decide a conversa: quais DESCONTOS ela marcou, há quanto TEMPO DE CONTA, qual
 * SCORE. Essas respostas já estavam no banco, na linha da planilha para a qual
 * a conversa aponta, e só apareciam no cartão da fila, antes de a conversa
 * existir. Depois que a pessoa respondia, sumiam de vista.
 *
 * AS COLUNAS SE ESCOLHEM AQUI MESMO, no botão ao lado do título, e a escolha
 * vale para a BASE inteira e para a equipe inteira. É separada da escolha do
 * cartão da fila (ver a migration 20260923120000): o cartão tem espaço para
 * três linhas e serve para decidir se abre a conversa; o dossiê é consulta
 * durante ela, e costuma querer mais.
 *
 * Conversa que não veio de uma base não mostra nada: um bloco dizendo "sem
 * planilha" em cada conversa de indicação seria ruído permanente.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Table2, SlidersHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useDaPlanilha, lerCabecalho, salvarColunasDoDossie } from "@/hooks/useLeadsBrutos";
import { dossieExtra, opcoesDoDossie } from "@/lib/planilhaLeads";
import { SeletorDeColunas } from "@/components/atendimento/SeletorDeColunas";

const MOLA = { type: "spring", stiffness: 380, damping: 34 } as const;

export function DaPlanilhaNoDossie({ conversaId }: { conversaId: string | null }) {
  const { data } = useDaPlanilha(conversaId);
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  /* O cabeçalho da planilha chega pela rede e pode falhar. A lista abre NA
     HORA com as colunas da própria linha e das já escolhidas, e o cabeçalho,
     quando chega, completa e põe na ordem da planilha. Esperar a rede para
     abrir uma lista de marcar seria um giro de carregamento a cada clique. */
  const [cabecalho, setCabecalho] = useState<string[] | null>(null);
  const [lendo, setLendo] = useState(false);
  const [rascunho, setRascunho] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  const fonte = data?.fonte ?? null;
  const bruto = data?.bruto ?? null;
  if (!fonte || !bruto) return null;

  const escolhidas = fonte.colunas_dossie && fonte.colunas_dossie.length > 0 ? fonte.colunas_dossie : null;
  const campos = dossieExtra(bruto, escolhidas);

  const abrirOuFechar = (a: boolean) => {
    setAberto(a);
    if (!a) return;
    setRascunho(escolhidas ?? []);
    if (cabecalho || lendo) return;
    setLendo(true);
    lerCabecalho(fonte.planilha_id, fonte.aba)
      .then(setCabecalho)
      /* Sem a planilha, a lista fica com as colunas da linha: dá para escolher
         do mesmo jeito, só não vem na ordem da planilha. Não é erro que mereça
         interromper ninguém. */
      .catch(() => setCabecalho(null))
      .finally(() => setLendo(false));
  };

  const alternar = (c: string) =>
    setRascunho((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));

  const salvar = async () => {
    setSalvando(true);
    try {
      await salvarColunasDoDossie(fonte.id, rascunho);
      // Todas as conversas desta base mudam juntas: a escolha é da base.
      await qc.invalidateQueries({ queryKey: ["wa", "da-planilha"] });
      setAberto(false);
      toast.success(`Colunas do dossiê atualizadas para ${fonte.nome}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col gap-2 rounded-lg bg-white/[0.03] ring-1 ring-white/[0.06] px-2.5 py-2"
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Table2 className="h-3 w-3 shrink-0 text-muted-foreground/70" />
        <span className="text-[9.5px] text-muted-foreground/70 truncate">
          Da planilha · <span className="text-foreground/70">{fonte.nome}</span>
        </span>
        <Popover open={aberto} onOpenChange={abrirOuFechar}>
          <PopoverTrigger asChild>
            <button type="button"
              title="Escolher as colunas que aparecem no dossiê"
              className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px]
                         text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors">
              <SlidersHorizontal className="h-3 w-3" /> colunas
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-3 flex flex-col gap-3">
            <SeletorDeColunas
              disponiveis={opcoesDoDossie(cabecalho, bruto, rascunho)}
              escolhidas={rascunho}
              onAlternar={alternar}
              titulo={`Colunas no dossiê · ${fonte.nome}`}
              semEscolha="Sem nenhuma marcada, o dossiê mostra tudo que a planilha trouxe além do contato. A escolha vale para todas as conversas desta base."
              vazio="Esta linha da planilha não tem colunas para mostrar."
            />
            <AnimatePresence initial={false}>
              {lendo && (
                <motion.p key="lendo"
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="text-[10px] text-muted-foreground/60 flex items-center gap-1.5 overflow-hidden">
                  <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                  Conferindo as colunas na planilha
                </motion.p>
              )}
            </AnimatePresence>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-[11px]" disabled={salvando}
                onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button size="sm" className="h-7 text-[11px]" disabled={salvando} onClick={salvar}>
                {salvando ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* CADA COLUNA ENTRA E SAI COM A MOLA DA CASA: trocar a escolha reorganiza
          a lista na frente de quem está lendo, e uma lista que muda de forma
          num piscar faz o olho perder a linha em que estava. */}
      {campos.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {campos.map((c, i) => (
              <motion.div key={c.rotulo} layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { ...MOLA, delay: i * 0.05 } }}
                exit={{ opacity: 0, y: -4, transition: { duration: 0.15, ease: [0.22, 1, 0.36, 1] } }}
                transition={MOLA}
                className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[9.5px] uppercase tracking-wide text-muted-foreground/60 truncate" title={c.rotulo}>
                  {c.rotulo}
                </span>
                <span className="text-[11.5px] leading-snug break-words text-foreground/90">{c.valor}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground/60 leading-snug">
          {escolhidas
            ? "As colunas escolhidas estão vazias nesta linha da planilha."
            : "A planilha não trouxe nada além do contato."}
        </p>
      )}
    </motion.div>
  );
}
