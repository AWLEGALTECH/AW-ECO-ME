import { useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ScanText, Loader2, Check, AlertTriangle, XCircle, PenSquare, RotateCw, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  montarKit, resumoDaLeitura, faltaParaOWriter, conferirCampo, ROTULO_DO_KIT,
  type LeituraBruta, type CampoLido, type CampoDoKit, type EstadoDoCampo,
} from "@/lib/leituraDeDocumentos";
import { qualificacaoParaOWriter, paramDaQualificacao } from "@/lib/kitParaOWriter";
import { linkDoWriter } from "@/lib/writerDaConversa";

/* LER OS DOCUMENTOS DO LEAD E LEVAR AO WRITER.
 *
 * Na etapa "Aguardando documentação" o lead já mandou RG, CPF e comprovante. O
 * que falta é alguém copiar nove campos daquelas fotos para a Etapa 01 do
 * Writer, à mão, olhando para a outra guia. Um CPF tem onze dígitos e ninguém
 * confere duas vezes.
 *
 * ────────────────────────── por que esta tela existe ────────────────────────
 *
 * A leitura por si só não vale nada: um modelo de visão erra, e um CPF com um
 * dígito trocado entra na procuração, no contrato e na inicial, e só aparece no
 * protocolo. O que dá valor à leitura é O QUE VEM DEPOIS DELA, que é o que esta
 * tela mostra:
 *
 *   verde     a máquina PROVOU (o dígito do CPF fecha, a data existe)
 *   âmbar     ninguém provou nada, olhe (RG, endereço, profissão)
 *   vermelho  a máquina provou que está ERRADO, não use
 *
 * E tudo é editável. Campo corrigido à mão passa pela MESMA conferência: quem
 * digita um CPF errado aqui vê o vermelho acender na hora.
 *
 * NADA ATRAVESSA SOZINHO. O botão do Writer abre a outra guia com a
 * qualificação preenchida, mas só depois que os olhos de alguém passaram por
 * esta lista. A tela oferece; a pessoa leva.
 */

const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };
const CURVA = [0.22, 1, 0.36, 1] as const;

/** Uma leitura do jeito que a função devolve. */
interface LeituraDaFuncao {
  path: string;
  documento: string;
  tipo?: string | null;
  campos?: Record<string, string> | null;
  erro?: string | null;
  de_antes?: boolean;
}

const CARA: Record<EstadoDoCampo, { cor: string; Ico: typeof Check; rotulo: string }> = {
  conferido: { cor: "text-emerald-500", Ico: Check, rotulo: "conferido" },
  revisar: { cor: "text-amber-500", Ico: AlertTriangle, rotulo: "revisar" },
  recusado: { cor: "text-rose-500", Ico: XCircle, rotulo: "não use" },
};

export function LeituraDosDocumentos({
  conversaId, nomeConhecido, nomeDoLead, analiseId, quantosDocumentos = 0, aoVivo = true,
}: {
  conversaId: string;
  /** o nome que já sabemos do lead (da análise comercial), para cruzar */
  nomeConhecido?: string | null;
  /** o nome que a conversa mostra, que vai no link do Writer */
  nomeDoLead?: string | null;
  analiseId?: string | null;
  /** quantos anexos do lead existem na conversa, só para o número no botão */
  quantosDocumentos?: number;
  aoVivo?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const [leituras, setLeituras] = useState<LeituraDaFuncao[]>([]);
  const [edicoes, setEdicoes] = useState<Partial<Record<CampoDoKit, string>>>({});

  const ctx = useMemo(() => ({ nomeConhecido }), [nomeConhecido]);

  /* O kit vem da leitura; o que foi digitado à mão vence, mas passa pela mesma
     conferência. Corrigir um CPF e ver o verde acender é o retorno que faz a
     pessoa confiar no resto da tela. */
  const kit: CampoLido[] = useMemo(() => {
    const boas = leituras.filter((l) => !l.erro && l.campos);
    /* O NOME DO ARQUIVO NÃO DIZ NADA. O que chega do WhatsApp se chama
       "04f0faed-2afa-4245.pdf", e "do 04f0faed" não ajuda ninguém a conferir
       coisa alguma. O que o modelo reconheceu ("extrato bancário", "RG") é o que
       a pessoa usa para achar o papel. Quando dois são do mesmo tipo, entra o
       número: "extrato bancário 2" ainda é melhor que um uuid. */
    const vistos = new Map<string, number>();
    const cruas: LeituraBruta[] = boas.map((l) => {
      const base = (l.tipo || "").trim() || l.documento;
      const n = (vistos.get(base) ?? 0) + 1;
      vistos.set(base, n);
      const repetido = boas.filter((o) => ((o.tipo || "").trim() || o.documento) === base).length > 1;
      return {
        documento: repetido ? `${base} ${n}` : base,
        tipo: l.tipo,
        campos: l.campos as LeituraBruta["campos"],
      };
    });
    return montarKit(cruas, ctx).map((c) => {
      const mao = edicoes[c.campo];
      if (mao === undefined) return c;
      return { ...c, valor: mao, documento: "digitado à mão", ...conferirCampo(c.campo, mao, ctx) };
    });
  }, [leituras, edicoes, ctx]);

  const falta = faltaParaOWriter(kit);
  const erros = leituras.filter((l) => l.erro);

  /**
   * Lê, e continua lendo até acabar.
   *
   * A função lê quatro por chamada para não estourar a memória do worker, e
   * devolve quantos `restam`. O laço aqui é o que transforma isso em uma barra
   * de progresso em vez de um botão que a pessoa clica quatro vezes.
   */
  const ler = useCallback(async (refazer = false) => {
    if (lendo || !aoVivo) return;
    setLendo(true);
    setProgresso({ feitos: 0, total: quantosDocumentos || 0 });
    try {
      let voltas = 0;
      for (;;) {
        const { data, error } = await supabase.functions.invoke("ler-documentos", {
          body: { conversa_id: conversaId, lote: 4, refazer: refazer && voltas === 0 },
        });
        if (error) throw new Error(error.message);
        const r = (data ?? {}) as { leituras?: LeituraDaFuncao[]; restam?: number; recado?: string };
        if (r.recado) { toast.info(r.recado); setLeituras([]); break; }

        const lidas = r.leituras ?? [];
        setLeituras(lidas);
        const restam = r.restam ?? 0;
        setProgresso({ feitos: lidas.length, total: lidas.length + restam });
        if (restam <= 0) break;
        // Trava de segurança: sem ela, um `restam` que nunca zera vira laço eterno.
        if (++voltas > 12) break;
      }
    } catch (e) {
      toast.error("Não consegui ler os documentos: " + (e as Error).message);
    } finally {
      setLendo(false);
      setProgresso(null);
    }
  }, [conversaId, lendo, aoVivo, quantosDocumentos]);

  const abrir = () => {
    setAberto(true);
    if (leituras.length === 0) void ler(false);
  };

  /* A passagem para o Writer. O que a máquina recusou não atravessa: em branco
     a pessoa percebe e digita, preenchido errado ela confia e assina. */
  const levarAoWriter = () => {
    const qualificacao = paramDaQualificacao(qualificacaoParaOWriter(kit));
    window.open(linkDoWriter({ conversaId, nome: nomeDoLead, analiseId, qualificacao }), "_blank");
    setAberto(false);
  };

  return (
    <>
      <button
        onClick={abrir}
        disabled={!aoVivo}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-primary/25 bg-primary/[0.07] py-1.5 text-[11px] font-medium text-primary hover:bg-primary/[0.13] transition-colors disabled:opacity-60"
      >
        <ScanText className="h-3.5 w-3.5" />
        Ler os documentos
        {quantosDocumentos > 0 && (
          <span className="rounded-full bg-primary/15 px-1.5 text-[9.5px] tabular-nums">{quantosDocumentos}</span>
        )}
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-2xl max-h-[88dvh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ScanText className="h-4 w-4 text-primary" />
              O que os documentos dizem
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              {lendo
                ? "Lendo os anexos desta conversa."
                : leituras.length > 0
                  ? `${resumoDaLeitura(kit)}. Confira antes de levar ao Writer.`
                  : "Nenhum documento lido ainda."}
            </DialogDescription>
          </DialogHeader>

          {/* A BARRA. Quatro documentos levam uns vinte segundos, e vinte
              segundos sem sinal de vida é quando a pessoa clica de novo. */}
          <AnimatePresence>
            {lendo && progresso && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: CURVA }}
                className="px-5 overflow-hidden shrink-0"
              >
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground pb-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  {progresso.total > 0
                    ? `${progresso.feitos} de ${progresso.total}`
                    : "abrindo os arquivos"}
                </div>
                <div className="h-1 rounded-full bg-primary/10 overflow-hidden">
                  <motion.div
                    className="h-full bg-primary/60"
                    initial={{ width: 0 }}
                    animate={{
                      width: progresso.total > 0
                        ? `${Math.round((progresso.feitos / progresso.total) * 100)}%`
                        : "15%",
                    }}
                    transition={MOLA}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-1.5">
            <AnimatePresence initial={false}>
              {leituras.length > 0 && kit.map((c, i) => (
                <LinhaDoCampo
                  key={c.campo}
                  campo={c}
                  atraso={i * 0.04}
                  aoEditar={(v) => setEdicoes((e) => ({ ...e, [c.campo]: v }))}
                />
              ))}
            </AnimatePresence>

            {/* DE ONDE SAIU CADA COISA. Sem esta lista, "conferido" é uma
                palavra; com ela, dá para abrir o documento e olhar. */}
            {leituras.length > 0 && (
              <motion.div
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...MOLA, delay: 0.4 }}
                className="pt-3 mt-1 border-t border-border/60"
              >
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1.5">
                  Lidos
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {leituras.filter((l) => !l.erro).map((l) => (
                    <span key={l.path}
                      className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      <FileText className="h-3 w-3 shrink-0" />
                      {l.tipo || "documento"}
                    </span>
                  ))}
                </div>
                {erros.length > 0 && (
                  <p className="mt-2 text-[10.5px] text-amber-600 dark:text-amber-500">
                    {erros.length === 1
                      ? "1 anexo não deu para ler."
                      : `${erros.length} anexos não deram para ler.`}{" "}
                    O que foi lido continua valendo.
                  </p>
                )}
              </motion.div>
            )}
          </div>

          <DialogFooter className="px-5 py-3 border-t border-border/60 shrink-0 gap-2 sm:justify-between">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[11px]"
              onClick={() => { setEdicoes({}); void ler(true); }} disabled={lendo}>
              <RotateCw className={cn("h-3.5 w-3.5", lendo && "animate-spin")} />
              Ler de novo
            </Button>
            <div className="flex items-center gap-2">
              {falta.length > 0 && leituras.length > 0 && (
                <span className="text-[10.5px] text-muted-foreground">
                  falta {falta.map((f) => ROTULO_DO_KIT[f].toLowerCase()).join(" e ")}
                </span>
              )}
              <Button size="sm" className="h-8 gap-1.5 text-[11px]"
                onClick={levarAoWriter} disabled={lendo || falta.length > 0 || leituras.length === 0}>
                <PenSquare className="h-3.5 w-3.5" />
                Levar ao Writer
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── uma linha ────────────────────────────────────────────────────────────── */

function LinhaDoCampo({ campo, atraso, aoEditar }: {
  campo: CampoLido;
  atraso: number;
  aoEditar: (v: string) => void;
}) {
  const { cor, Ico, rotulo } = CARA[campo.estado];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ ...MOLA, delay: atraso }}
      className="rounded-lg border border-border/60 bg-card/40 px-3 py-2"
    >
      <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-2">
        <label className="text-[11px] font-medium text-muted-foreground truncate">
          {ROTULO_DO_KIT[campo.campo]}
        </label>
        <Input
          value={campo.valor}
          onChange={(e) => aoEditar(e.target.value)}
          placeholder="não veio nos documentos"
          className={cn("h-7 text-[12px] px-2", campo.estado === "recusado" && "border-rose-500/40")}
        />
        <span className={cn("flex items-center gap-1 text-[10px] shrink-0", cor)} title={campo.porque}>
          <Ico className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{rotulo}</span>
        </span>
      </div>

      {/* A EXPLICAÇÃO. "Conferido" sozinho não ensina nada; "dígito verificador
          confere, do rg.pdf" ensina onde olhar quando estiver errado. */}
      {(campo.porque || campo.documento) && (
        <p className="mt-1 pl-[8.2rem] text-[10px] text-muted-foreground/70 truncate">
          {campo.porque}
          {campo.valor && campo.documento ? ` · ${campo.documento}` : ""}
        </p>
      )}

      {/* O QUE OS OUTROS DOCUMENTOS DISSERAM. Escolher por semelhança seria
          inventar; mostrar os dois e deixar clicar é o que resolve de verdade. */}
      <AnimatePresence>
        {campo.divergentes.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: CURVA }}
            className="overflow-hidden"
          >
            <div className="mt-1.5 pl-[8.2rem] flex flex-wrap gap-1">
              {campo.divergentes.map((d) => (
                <button
                  key={d.valor}
                  onClick={() => aoEditar(d.valor)}
                  title={`${d.documento} diz isto. Clique para usar.`}
                  className="rounded-md border border-amber-500/30 bg-amber-500/[0.07] px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-500 hover:bg-amber-500/15 transition-colors max-w-full truncate"
                >
                  {d.valor}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
