import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileSignature, FolderOpen, ExternalLink, CheckCircle2, Loader2, FileText, Image as Icone,
  ArrowRight, AlertTriangle,
} from "lucide-react";
import {
  arquivosDaConversa, selecaoInicialDaPasta, nomesSemColisao,
  type AnexoCandidato, type ArquivoParaPasta,
} from "@/lib/anexosParaPasta";
import type { PreClienteDoLead } from "@/hooks/usePreClienteDoNumero";

/* A FICHA DO PRÉ-CLIENTE, DENTRO DA CONVERSA.
 *
 * O lead chegou em "Aguardando assinatura" porque o kit saiu do Writer. A
 * ficha dele existe, com CPF, endereço e pasta, e está em outra tela. Quem
 * está conversando não sabe se ela já foi aprovada, e para aprovar tinha que
 * sair daqui, achar o nome numa lista de 126 e voltar.
 *
 * O que amarra os dois é o NÚMERO: o Writer exige o WhatsApp para gerar o kit,
 * e é o mesmo número da conversa.
 *
 * ─── e por que aprovar aqui não é só um atalho ───────────────────────────────
 *
 * A tela de confirmar pede que alguém marque "já subi os documentos no Drive".
 * Subir era baixar cada anexo do WhatsApp, achar na pasta de downloads, abrir o
 * Drive, arrastar. E o documento está AQUI, na conversa, a dois cliques da
 * pasta que é o destino dele. Por isso aprovar daqui começa oferecendo mandar
 * os anexos, e só depois entrega o resto para o fluxo que já existe.
 */

const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };

const ROTULO_STATUS: Record<string, string> = {
  aguardando_assinatura: "aguardando aprovação",
  confirmado: "já virou cliente",
};

const fmtDia = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

export function PreClienteNaJornada({ pre, anexos, aoVivo = true }: {
  pre: PreClienteDoLead;
  /** as mensagens da conversa, para achar o que pode ir à pasta */
  anexos: AnexoCandidato[];
  aoVivo?: boolean;
}) {
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [subindo, setSubindo] = useState(false);
  const arquivos = useMemo(() => arquivosDaConversa(anexos), [anexos]);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [nomes, setNomes] = useState<Record<string, string>>({});

  const jaCliente = pre.status === "confirmado";

  const abrir = () => {
    setMarcados(selecaoInicialDaPasta(arquivos));
    setNomes(Object.fromEntries(arquivos.map((a) => [a.id, a.nome])));
    setAberto(true);
  };

  const alternar = (id: string) =>
    setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  /* Entrega a bola para a tela de pré-clientes, que é onde o cadastro de fato
     acontece. Duplicar aquele fluxo aqui seria manter duas rotinas de criar
     cliente, e uma delas ficaria para trás na primeira mudança.

     EM OUTRA ABA, como o Writer. A conversa não pode fechar: quem aprova
     continua atendendo, e o cliente do outro lado não espera o cadastro
     terminar para receber resposta.

     `docs` diz quantos anexos acabaram de subir. É o que faz a tela de lá
     parar de perguntar "já subiu os documentos no Drive?" quando a resposta
     acabou de ser dada aqui. */
  const seguirParaAprovacao = (docsSubidos = 0) => {
    const qs = docsSubidos > 0 ? `?pre=${pre.id}&docs=${docsSubidos}` : `?pre=${pre.id}`;
    window.open(`/pre-clientes${qs}`, "_blank", "noopener");
  };

  const subirEseguir = async () => {
    const escolhidos = arquivos.filter((a) => marcados.includes(a.id));
    if (escolhidos.length === 0) { setAberto(false); seguirParaAprovacao(); return; }
    if (!pre.drive_folder_url) {
      toast.error("Esta ficha ainda não tem pasta no Drive. Dá pra criar na tela de pré-clientes.");
      setAberto(false);
      seguirParaAprovacao();
      return;
    }
    setSubindo(true);
    // Dois anexos com o mesmo nome se sobrescreveriam dentro da pasta.
    const finais = nomesSemColisao(escolhidos.map((a) => (nomes[a.id] ?? a.nome).trim() || a.nome));
    const { data, error } = await supabase.functions.invoke("subir-docs-pre-cliente", {
      body: {
        pre_cliente_id: pre.id,
        arquivos: escolhidos.map((a, i) => ({ path: a.path, nome: finais[i], mime: a.mime })),
      },
    });
    setSubindo(false);

    if (error) {
      toast.error("Não consegui subir: " + error.message);
      return;
    }
    const r = (data ?? {}) as {
      subidos?: unknown[]; falhas?: { nome: string }[]; recado?: string;
    };
    const n = r.subidos?.length ?? 0;
    const falhas = r.falhas ?? [];

    if (r.recado) {
      /* Falhou tudo pelo mesmo motivo: é configuração do Drive, não arquivo.
         Repetir a lista de nomes aqui não ajudaria ninguém a resolver. */
      toast.error(r.recado, { duration: 12000 });
      return;
    }
    if (falhas.length > 0) {
      // O lote não é desfeito: o que subiu subiu, e refazer os cinco por causa
      // de um seria pior que dizer qual foi.
      toast.warning(
        `${n} ${n === 1 ? "arquivo foi" : "arquivos foram"} pra pasta. ${falhas.length} não: ${falhas.map((f) => f.nome).join(", ")}.`,
        { duration: 7000 });
    } else {
      toast.success(`${n} ${n === 1 ? "arquivo foi" : "arquivos foram"} para a pasta de ${pre.nome}.`);
    }
    setAberto(false);
    seguirParaAprovacao(n);
  };

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOLA}
        className={`rounded-lg border px-2.5 py-2 ${
          jaCliente ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-primary/25 bg-primary/[0.06]"
        }`}>
        <div className="flex items-start gap-2">
          <span className={`h-6 w-6 shrink-0 grid place-items-center rounded-md ring-1 ${
            jaCliente ? "bg-emerald-500/15 ring-emerald-500/25 text-emerald-400"
                      : "bg-primary/15 ring-primary/25 text-primary"
          }`}>
            <FileSignature className="h-3 w-3" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold truncate">{pre.nome}</span>
            <span className="block text-[9.5px] text-muted-foreground truncate">
              {[pre.produto, pre.cpf_cnpj, ROTULO_STATUS[pre.status] ?? pre.status, fmtDia(pre.created_at)]
                .filter(Boolean).join(" · ")}
            </span>
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {pre.drive_folder_url && (
            <a href={pre.drive_folder_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-1.5 py-1 text-[9.5px]
                         text-muted-foreground hover:text-foreground transition-colors">
              <FolderOpen className="h-3 w-3" /> Pasta <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
          {jaCliente && pre.cliente_id ? (
            <button onClick={() => navigate(`/clientes/${pre.cliente_id}`)}
              className="ml-auto inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-1
                         text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-500/25
                         hover:bg-emerald-500/25 transition-colors">
              Abrir ficha <ArrowRight className="h-3 w-3" />
            </button>
          ) : (
            <button onClick={abrir} disabled={!aoVivo}
              className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary/20 px-2 py-1
                         text-[10px] font-medium text-primary ring-1 ring-primary/30
                         hover:bg-primary/30 transition-colors disabled:opacity-50">
              <CheckCircle2 className="h-3 w-3" /> Aprovar
            </button>
          )}
        </div>
      </motion.div>

      <Dialog open={aberto} onOpenChange={(o) => { if (!subindo) setAberto(o); }}>
        <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              Documentos desta conversa
            </DialogTitle>
            <DialogDescription>
              Escolha o que vai para a pasta de <strong>{pre.nome}</strong> antes de aprovar. Eles entram numa
              subpasta "Documentos do cliente", e depois disso a aprovação segue como sempre.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 py-1">
            {arquivos.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
                <p className="text-[12.5px] text-muted-foreground">
                  Nenhum documento ou foto nesta conversa. Dá pra aprovar assim mesmo.
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {arquivos.map((a: ArquivoParaPasta, i) => {
                  const marcado = marcados.includes(a.id);
                  const Ico = a.tipo === "imagem" ? Icone : FileText;
                  return (
                    <motion.div
                      key={a.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...MOLA, delay: Math.min(i, 8) * 0.03 }}
                      className={`rounded-lg border px-2.5 py-2 transition-colors ${
                        marcado ? "border-primary/40 bg-primary/[0.06]" : "border-border bg-white/[0.02]"
                      }`}>
                      <div className="flex items-center gap-2">
                        <button onClick={() => alternar(a.id)}
                          className={`h-4 w-4 shrink-0 rounded-[5px] grid place-items-center transition-colors ${
                            marcado ? "bg-primary text-primary-foreground" : "ring-1 ring-white/20"
                          }`}>
                          {marcado && <CheckCircle2 className="h-3 w-3" />}
                        </button>
                        <Ico className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {a.de === "lead" ? "recebido" : "enviado"}{a.quando ? ` · ${a.quando}` : ""}
                        </span>
                      </div>
                      {/* O nome é editável porque na pasta ele dura o processo
                          inteiro. "documento 10-09 13h38.pdf" abre a porta;
                          "RG" fecha a pergunta. */}
                      <Input
                        value={nomes[a.id] ?? a.nome}
                        onChange={(e) => setNomes((n) => ({ ...n, [a.id]: e.target.value }))}
                        onFocus={() => { if (!marcado) alternar(a.id); }}
                        className="mt-1.5 h-7 text-[12px]"
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {!pre.drive_folder_url && arquivos.length > 0 && (
            <p className="shrink-0 text-[11px] text-amber-300 flex items-start gap-1.5 pt-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
              Esta ficha ainda não tem pasta no Drive, então não há para onde subir. Dá pra criar a pasta
              na tela de pré-clientes e voltar aqui.
            </p>
          )}

          <DialogFooter className="shrink-0 gap-2 pt-2">
            <Button variant="ghost" onClick={() => { setAberto(false); seguirParaAprovacao(); }} disabled={subindo}>
              Aprovar sem subir nada
            </Button>
            <Button onClick={subirEseguir} disabled={subindo}>
              {subindo
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Subindo…</>
                : <><ArrowRight className="h-4 w-4 mr-1.5" /> Subir {marcados.length > 0 ? `${marcados.length} ` : ""}e aprovar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
