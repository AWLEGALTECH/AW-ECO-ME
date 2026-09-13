import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Check, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { salvarBoasVindas } from "@/hooks/useWhatsapp";
import { BOAS_VINDAS_PADRAO, mensagemDeBoasVindas } from "@/lib/leadViraCliente";

/* A MENSAGEM QUE RECEBE QUEM ACABOU DE VIRAR CLIENTE.
 *
 * Por número e não uma só para o sistema inteiro: quem recebe cliente no
 * corporativo fala como o corporativo, e um dia haverá outro número. Vazio
 * significa "use o texto padrão", que é melhor default do que obrigar alguém a
 * escrever algo antes de o fluxo funcionar.
 *
 * A PRÉVIA USA UM NOME DE MENTIRA, e de propósito: é ali que se vê que a frase
 * quebra quando o nome é curto, ou que a vírgula fica órfã quando não há nome.
 * Escrever às cegas e descobrir no primeiro cliente é o que esta caixa existe
 * para evitar.
 */

const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };

export function BoasVindasPorNumero({ instancias, mensagens, aoSalvar }: {
  instancias: { id: string; nome: string }[];
  /** o que está gravado hoje, por nome de instância */
  mensagens: Record<string, string>;
  aoSalvar: () => void;
}) {
  const [qual, setQual] = useState(instancias[0]?.nome ?? "");
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  /* Trocar de número recarrega o texto daquele número. Sem isto, o rascunho de
     um vazaria para o outro e alguém salvaria a fala do corporativo no PDA. */
  useEffect(() => { setTexto(mensagens[qual] ?? ""); }, [qual, mensagens]);

  const gravado = mensagens[qual] ?? "";
  const mudou = texto.trim() !== gravado.trim();

  const salvar = () => {
    if (!qual) return;
    setSalvando(true);
    salvarBoasVindas(qual, texto)
      .then(() => { aoSalvar(); toast.success("Mensagem de boas-vindas salva."); })
      .catch((e) => toast.error("Não consegui salvar: " + (e as Error).message))
      .finally(() => setSalvando(false));
  };

  return (
    <div className="flex flex-col gap-2">
      {instancias.length > 1 && (
        <div className="flex flex-wrap gap-1">
          {instancias.map((i) => (
            <button key={i.id} onClick={() => setQual(i.nome)}
              className={cn("rounded-md px-2 py-1 text-[10.5px] ring-1 transition-colors",
                i.nome === qual
                  ? "bg-primary/12 ring-primary/30 text-primary"
                  : "ring-white/[0.08] text-muted-foreground hover:text-foreground hover:bg-white/[0.05]")}>
              {i.nome}
            </button>
          ))}
        </div>
      )}

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={4}
        placeholder={BOAS_VINDAS_PADRAO}
        className="w-full rounded-lg bg-black/20 ring-1 ring-white/[0.08] px-3 py-2 text-[12px]
                   leading-relaxed resize-none focus:outline-none focus:ring-primary/40 transition-colors"
      />

      <p className="text-[10.5px] text-muted-foreground/70">
        Escreva <code className="text-primary/80">{"{nome}"}</code> onde o primeiro nome da pessoa deve entrar.
        Em branco, vale o texto padrão.
      </p>

      {/* A PRÉVIA COM NOME DE MENTIRA: é aqui que se vê a frase quebrada antes
          de ela chegar num cliente de verdade. */}
      <motion.div layout transition={MOLA}
        className="rounded-lg border border-primary/20 bg-primary/[0.05] px-3 py-2">
        <p className="text-[10px] uppercase tracking-wide text-primary/70 mb-1 flex items-center gap-1">
          <Send className="h-3 w-3" /> como o cliente vai ler
        </p>
        <p className="text-[12px] text-foreground/85 leading-relaxed">
          {mensagemDeBoasVindas(texto, "Maria Aparecida dos Santos")}
        </p>
      </motion.div>

      <AnimatePresence>
        {mudou && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={MOLA}
            className="flex justify-end"
          >
            <Button size="sm" className="h-8 gap-1.5 text-[11px]" onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Salvar para {qual}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
