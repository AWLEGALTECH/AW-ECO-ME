import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ScanText, Loader2, Check, AlertTriangle, XCircle, PenSquare,
  FileText, Image as ImageIcon, ArrowLeft, Square, CheckSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  montarKit, resumoDaLeitura, faltaParaOWriter, conferirCampo, ROTULO_DO_KIT,
  anexosLegiveis, selecaoInicialDaLeitura, rotuloDeQuantos, sugestoesDoCampo,
  type LeituraBruta, type CampoLido, type CampoDoKit, type EstadoDoCampo,
  type AnexoLegivel,
} from "@/lib/leituraDeDocumentos";
import { qualificacaoParaOWriter, paramDaQualificacao } from "@/lib/kitParaOWriter";
import { linkDoWriter } from "@/lib/writerDaConversa";
import { podeIrParaPasta, type AnexoCandidato } from "@/lib/anexosParaPasta";

/* LER OS DOCUMENTOS DO LEAD E LEVAR AO WRITER.
 *
 * Na etapa "Aguardando documentação" o lead já mandou RG, CPF e comprovante. O
 * que falta é alguém copiar nove campos daquelas fotos para a Etapa 01 do
 * Writer, à mão, olhando para a outra guia. Um CPF tem onze dígitos e ninguém
 * confere duas vezes.
 *
 * ─────────────────────────────── são duas telas ─────────────────────────────
 *
 * 1. A ESCOLHA. Cada leitura custa, e uma conversa de doze anexos tem, quase
 *    sempre, três que interessam: o RG, o comprovante e o CPF. Ler os doze para
 *    achar os três é jogar nove fora. Então a tela pergunta antes de gastar, e
 *    abre com nada marcado: lista toda marcada seria o gasto antigo com uma
 *    etapa a mais no meio.
 *
 * 2. A CONFERÊNCIA. A leitura por si só não vale nada: um modelo de visão erra,
 *    e um CPF com um dígito trocado entra na procuração, no contrato e na
 *    inicial, e só aparece no protocolo. O que dá valor à leitura é O QUE VEM
 *    DEPOIS DELA:
 *
 *      verde     a máquina PROVOU (o dígito do CPF fecha, a data existe)
 *      âmbar     ninguém provou nada, olhe (RG, endereço, profissão)
 *      vermelho  a máquina provou que está ERRADO, não use
 *
 * E tudo é editável. Campo corrigido à mão passa pela MESMA conferência: quem
 * digita um CPF errado aqui vê o vermelho acender na hora. Profissão e estado
 * civil, que documento nenhum traz, vêm com sugestão de um clique.
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

/** Uma linha da tabela de leituras guardadas. */
interface LeituraGuardada {
  midia_path: string;
  documento: string | null;
  tipo: string | null;
  campos: Record<string, string> | null;
  erro: string | null;
}

const CARA: Record<EstadoDoCampo, { cor: string; Ico: typeof Check; rotulo: string }> = {
  conferido: { cor: "text-emerald-500", Ico: Check, rotulo: "conferido" },
  revisar: { cor: "text-amber-500", Ico: AlertTriangle, rotulo: "revisar" },
  recusado: { cor: "text-rose-500", Ico: XCircle, rotulo: "não use" },
};

export function LeituraDosDocumentos({
  conversaId, nomeConhecido, nomeDoLead, analiseId, anexos = [], aoVivo = true,
}: {
  conversaId: string;
  /** o nome que já sabemos do lead (da análise comercial), para cruzar */
  nomeConhecido?: string | null;
  /** o nome que a conversa mostra, que vai no link do Writer */
  nomeDoLead?: string | null;
  analiseId?: string | null;
  /** os anexos da conversa, para a pessoa escolher quais ler */
  anexos?: AnexoCandidato[];
  aoVivo?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [tela, setTela] = useState<"escolha" | "conferencia">("escolha");
  const [lendo, setLendo] = useState(false);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null);
  const [guardadas, setGuardadas] = useState<LeituraGuardada[]>([]);
  const [leituras, setLeituras] = useState<LeituraDaFuncao[]>([]);
  const [marcados, setMarcados] = useState<string[]>(selecaoInicialDaLeitura());
  const [edicoes, setEdicoes] = useState<Partial<Record<CampoDoKit, string>>>({});

  const ctx = useMemo(() => ({ nomeConhecido }), [nomeConhecido]);

  /* Só o que o LEAD mandou e o modelo consegue abrir. Documento que nós
     enviamos (contrato, procuração) não traz dado dele que já não saibamos. */
  const doLead = useMemo(
    () => anexos.filter((a) => a.de === "lead" && podeIrParaPasta(a)),
    [anexos]);

  /* A LISTA DA ESCOLHA, já sabendo o que foi lido. A consulta é de graça e
     instantânea: a leitura fica guardada por arquivo, então reabrir a tela não
     custa nada nem lê nada de novo. */
  const lista: AnexoLegivel[] = useMemo(
    () => anexosLegiveis(
      doLead.map((a) => ({
        path: a.midiaPath!,
        nome: a.midiaNome ?? null,
        tipo: a.tipo ?? null,
        quando: [a.dia, a.hora].filter(Boolean).join(" ") || null,
      })),
      guardadas.map((g) => ({ midia_path: g.midia_path, tipo: g.tipo, erro: g.erro })),
    ),
    [doLead, guardadas]);

  const jaLidos = lista.filter((l) => l.jaLido);
  const porLer = lista.filter((l) => !l.jaLido);

  /* O que já foi lido chega na abertura, sem passar pela função e sem gastar. */
  useEffect(() => {
    if (!aberto) return;
    let cancel = false;
    (async () => {
      const { data } = await (supabase.from("wa_leitura_documentos" as never) as never as {
        select: (c: string) => { eq: (a: string, b: string) => Promise<{ data: LeituraGuardada[] | null }> };
      }).select("midia_path, documento, tipo, campos, erro").eq("conversa_id", conversaId);
      if (cancel) return;
      const linhas = data ?? [];
      setGuardadas(linhas);
      const boas = linhas.filter((l) => !l.erro && l.campos);
      setLeituras(boas.map((l) => ({
        path: l.midia_path, documento: l.documento ?? l.midia_path,
        tipo: l.tipo, campos: l.campos, de_antes: true,
      })));
      // Com leitura guardada, o caminho normal é conferir, não escolher de novo.
      setTela(boas.length > 0 ? "conferencia" : "escolha");
    })();
    return () => { cancel = true; };
  }, [aberto, conversaId]);

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
      return { ...c, valor: mao, documento: "escolhido à mão", ...conferirCampo(c.campo, mao, ctx) };
    });
  }, [leituras, edicoes, ctx]);

  const falta = faltaParaOWriter(kit);
  const comErro = leituras.filter((l) => l.erro);

  /**
   * Lê os escolhidos, e continua lendo até acabar.
   *
   * A função lê quatro por chamada para não estourar a memória do worker, e
   * devolve quantos `restam`. O laço aqui é o que transforma isso em uma barra
   * de progresso em vez de um botão que a pessoa clica quatro vezes.
   */
  const ler = useCallback(async (paths: string[], refazer = false) => {
    if (lendo || !aoVivo || paths.length === 0) return;
    setLendo(true);
    setTela("conferencia");
    setProgresso({ feitos: 0, total: paths.length });
    try {
      let voltas = 0;
      for (;;) {
        const { data, error } = await supabase.functions.invoke("ler-documentos", {
          body: { conversa_id: conversaId, paths, lote: 4, refazer: refazer && voltas === 0 },
        });
        if (error) throw new Error(error.message);
        const r = (data ?? {}) as { leituras?: LeituraDaFuncao[]; restam?: number; recado?: string };
        if (r.recado) { toast.info(r.recado); break; }

        const novas = r.leituras ?? [];
        /* Junta com o que já estava na tela: a chamada só devolve os `paths`
           pedidos, e as leituras antigas continuam valendo para o kit. */
        setLeituras((antes) => {
          const porPath = new Map(antes.map((l) => [l.path, l]));
          for (const n of novas) porPath.set(n.path, n);
          return [...porPath.values()];
        });
        const restam = r.restam ?? 0;
        setProgresso({ feitos: paths.length - restam, total: paths.length });
        if (restam <= 0) break;
        // Trava de segurança: sem ela, um `restam` que nunca zera vira laço eterno.
        if (++voltas > 12) break;
      }
      // A lista de escolha precisa saber o que virou lido.
      const { data } = await (supabase.from("wa_leitura_documentos" as never) as never as {
        select: (c: string) => { eq: (a: string, b: string) => Promise<{ data: LeituraGuardada[] | null }> };
      }).select("midia_path, documento, tipo, campos, erro").eq("conversa_id", conversaId);
      setGuardadas(data ?? []);
    } catch (e) {
      toast.error("Não consegui ler os documentos: " + (e as Error).message);
    } finally {
      setLendo(false);
      setProgresso(null);
      setMarcados([]);
    }
  }, [conversaId, lendo, aoVivo]);

  /* A passagem para o Writer. O que a máquina recusou não atravessa: em branco
     a pessoa percebe e digita, preenchido errado ela confia e assina. */
  const levarAoWriter = () => {
    const qualificacao = paramDaQualificacao(qualificacaoParaOWriter(kit));
    window.open(linkDoWriter({ conversaId, nome: nomeDoLead, analiseId, qualificacao }), "_blank");
    setAberto(false);
  };

  const alternar = (path: string) =>
    setMarcados((m) => (m.includes(path) ? m.filter((p) => p !== path) : [...m, path]));

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        disabled={!aoVivo || doLead.length === 0}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-primary/25 bg-primary/[0.07] py-1.5 text-[11px] font-medium text-primary hover:bg-primary/[0.13] transition-colors disabled:opacity-60"
      >
        <ScanText className="h-3.5 w-3.5" />
        Ler os documentos
        {doLead.length > 0 && (
          <span className="rounded-full bg-primary/15 px-1.5 text-[9.5px] tabular-nums">{doLead.length}</span>
        )}
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-2xl max-h-[88dvh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <ScanText className="h-4 w-4 text-primary" />
              {tela === "escolha" ? "Quais documentos ler?" : "O que os documentos dizem"}
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              {tela === "escolha"
                ? "Cada leitura custa, então só o que interessa. O RG, o CPF e o comprovante bastam para o kit."
                : lendo
                  ? "Lendo os escolhidos."
                  : leituras.length > 0
                    ? `${resumoDaLeitura(kit)}. Confira antes de levar ao Writer.`
                    : "Nenhum documento lido ainda."}
            </DialogDescription>
          </DialogHeader>

          {/* A BARRA. Cada documento leva alguns segundos, e tempo sem sinal de
              vida é quando a pessoa clica de novo. */}
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
                  {progresso.feitos} de {progresso.total}
                </div>
                <div className="h-1 rounded-full bg-primary/10 overflow-hidden">
                  <motion.div
                    className="h-full bg-primary/60"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round((progresso.feitos / Math.max(1, progresso.total)) * 100)}%` }}
                    transition={MOLA}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
            <AnimatePresence mode="wait" initial={false}>
              {tela === "escolha" ? (
                <motion.div
                  key="escolha"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.22, ease: CURVA }}
                  className="space-y-1.5"
                >
                  {lista.map((a, i) => (
                    <LinhaDoAnexo
                      key={a.path}
                      anexo={a}
                      marcado={marcados.includes(a.path)}
                      atraso={i * 0.03}
                      aoClicar={() => alternar(a.path)}
                    />
                  ))}
                  {lista.length === 0 && (
                    <p className="py-10 text-center text-[12px] text-muted-foreground">
                      O lead ainda não mandou documento nenhum nesta conversa.
                    </p>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="conferencia"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.22, ease: CURVA }}
                  className="space-y-1.5"
                >
                  {kit.map((c, i) => (
                    <LinhaDoCampo
                      key={c.campo}
                      campo={c}
                      atraso={i * 0.04}
                      aoEditar={(v) => setEdicoes((e) => ({ ...e, [c.campo]: v }))}
                    />
                  ))}

                  {comErro.length > 0 && (
                    <p className="pt-2 text-[10.5px] text-amber-600 dark:text-amber-500">
                      {rotuloDeQuantos(comErro.length)} não {comErro.length === 1 ? "deu" : "deram"} para ler.
                      O que foi lido continua valendo.
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <DialogFooter className="px-5 py-3 border-t border-border/60 shrink-0 gap-2 sm:justify-between">
            {tela === "escolha" ? (
              <>
                <div className="flex items-center gap-2">
                  {porLer.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-8 text-[11px]"
                      onClick={() => setMarcados(
                        marcados.length === porLer.length ? [] : porLer.map((a) => a.path))}>
                      {marcados.length === porLer.length ? "Desmarcar todos" : `Marcar os ${porLer.length} não lidos`}
                    </Button>
                  )}
                  {jaLidos.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-8 text-[11px]"
                      onClick={() => setTela("conferencia")}>
                      Ver o que já foi lido
                    </Button>
                  )}
                </div>
                <Button size="sm" className="h-8 gap-1.5 text-[11px]"
                  onClick={() => ler(marcados)} disabled={lendo || marcados.length === 0}>
                  <ScanText className="h-3.5 w-3.5" />
                  Ler {rotuloDeQuantos(marcados.length)}
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[11px]"
                  onClick={() => { setMarcados([]); setTela("escolha"); }} disabled={lendo}>
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Escolher documentos
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
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── uma linha da escolha ─────────────────────────────────────────────────── */

function LinhaDoAnexo({ anexo, marcado, atraso, aoClicar }: {
  anexo: AnexoLegivel;
  marcado: boolean;
  atraso: number;
  aoClicar: () => void;
}) {
  const Ico = (anexo.tipo ?? "").toLowerCase() === "imagem" ? ImageIcon : FileText;
  const Caixa = marcado ? CheckSquare : Square;

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...MOLA, delay: atraso }}
      onClick={aoClicar}
      disabled={anexo.jaLido}
      className={cn(
        "w-full text-left rounded-lg border px-3 py-2 transition-colors",
        "grid grid-cols-[1.1rem_1.1rem_minmax(0,1fr)_auto] items-center gap-2",
        anexo.jaLido
          ? "border-emerald-500/20 bg-emerald-500/[0.05] cursor-default"
          : marcado
            ? "border-primary/40 bg-primary/[0.08]"
            : "border-border/60 bg-card/40 hover:border-primary/30 hover:bg-primary/[0.03]",
      )}
    >
      {anexo.jaLido
        ? <Check className="h-4 w-4 text-emerald-500" />
        : <Caixa className={cn("h-4 w-4", marcado ? "text-primary" : "text-muted-foreground/40")} />}
      <Ico className="h-3.5 w-3.5 text-muted-foreground/70" />
      <span className="text-[12px] truncate">
        {/* O QUE ELE ERA vale mais que o nome do arquivo, que é um uuid. */}
        {anexo.lidoComo || anexo.nome || (anexo.tipo === "imagem" ? "Imagem" : "Documento")}
        {anexo.falhou && (
          <span className="ml-1.5 text-[10px] text-amber-500">tentado, não deu</span>
        )}
      </span>
      <span className="text-[10px] tabular-nums text-muted-foreground/60 shrink-0">
        {anexo.jaLido ? "já lido" : anexo.quando || ""}
      </span>
    </motion.button>
  );
}

/* ── uma linha da conferência ─────────────────────────────────────────────── */

function LinhaDoCampo({ campo, atraso, aoEditar }: {
  campo: CampoLido;
  atraso: number;
  aoEditar: (v: string) => void;
}) {
  const { cor, Ico, rotulo } = CARA[campo.estado];
  const sugestoes = sugestoesDoCampo(campo.campo);

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
          placeholder={sugestoes.length > 0 ? "escolha abaixo ou digite" : "não veio nos documentos"}
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

      {/* O QUE DOCUMENTO NENHUM TRAZ, A TELA OFERECE.
          Profissão e estado civil vieram vazios em todos os documentos lidos
          nesta base, e é assim mesmo: RG não diz profissão e conta de luz não
          diz estado civil. Um clique preenche, e o campo continua editável. */}
      {sugestoes.length > 0 && !campo.valor && (
        <div className="mt-1.5 pl-[8.2rem] flex flex-wrap gap-1">
          {sugestoes.map((s) => (
            <button
              key={s}
              onClick={() => aoEditar(s)}
              className="rounded-md border border-border/70 bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/[0.06] transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
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
