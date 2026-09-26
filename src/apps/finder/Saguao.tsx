/* O SAGUÃO DO FINDER: a fila, a análise em andamento e o desfecho.
 *
 * NO MOLDE DAS OUTRAS ABAS DO AW, e não no do Finder. Cabeçalho como o de
 * Chamados e Esteira (ícone, título, frase, ações à direita), página na largura
 * toda com o respiro de sempre, cartões translúcidos da casa, estado vazio
 * centralizado com o ícone apagado. O saguão antigo era o do MVP separado
 * (selo de marca, título de landing, emoji, estilo à mão), e a primeira
 * versão deste ainda copiava a divisão dele em dois painéis.
 *
 * A BARRA DE PROGRESSO É REAL, e toda etapa fala a mesma língua: uma barra de
 * 0 a 100%. A leitura anda por página (cada extrato com a sua barra), o
 * auditor de IA anda por lote, a revisão e o agrupamento vão de 0 a 100 quando
 * acontecem. A barra geral é a soma ponderada delas.
 *
 * O DESFECHO é um momento, e não um pulo: antes do relatório, a tela diz o que
 * aconteceu, com a animação de cada caso (achou, não achou, achou com pontos a
 * conferir, extratos de pessoas diferentes, não deu para ler).
 */
import { useEffect, useRef, useState, type DragEvent } from "react";
import { motion, AnimatePresence, useReducedMotion, animate } from "framer-motion";
import {
  FileText, X, Play, FolderOpen, ExternalLink, Check, Loader2,
  AlertTriangle, UserRound, Circle, ScanText, Plus, FastForward, Users, Clock, Upload, Search, ArrowLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { LogoBradesco, LogoDrive, Lupa, OrbitaDeAnalises } from "./marcas";
import { CabecalhoDaPagina } from "@/components/CabecalhoDaPagina";

const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };
const CURVA = [0.22, 1, 0.36, 1] as const;
const CARTAO = "rounded-2xl border border-white/[0.07] bg-white/[0.03]";

/* As análises que o Finder faz. Hoje uma só; o lobby já está desenhado para a
   lista crescer (ver OrbitaDeAnalises). */
const ANALISES = [{ chave: "bradesco", rotulo: "Extratos Bradesco" }] as const;

const chaveDoArquivo = (f: File) => `${f.name}-${f.size}-${f.lastModified}`;

const tamanho = (bytes?: number | string | null) => {
  const n = typeof bytes === "string" ? parseInt(bytes, 10) : bytes ?? 0;
  if (!n) return null;
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ═══════════════════════ progresso ═══════════════════════ */

export type EtapaDaAnalise = "leitura" | "revisao" | "auditor" | "agrupamento" | "fim";

export interface ArquivoEmLeitura {
  nome: string;
  pagina: number;
  paginas: number;
  ocr: boolean;
  estado: "fila" | "lendo" | "lido" | "falhou";
}

export interface ProgressoDaAnalise {
  inicio: number;
  arquivos: ArquivoEmLeitura[];
  etapa: EtapaDaAnalise;
  auditor: { feitos: number; total: number };
  /** o auditor de IA foi pulado: o relatório saiu só da análise por código */
  iaPulada?: boolean;
}

/* Quanto cada etapa pesa na barra geral. A leitura é quase tudo porque é
   quase todo o tempo (um extrato escaneado passa minutos no OCR). */
const PESO: Record<Exclude<EtapaDaAnalise, "fim">, number> = { leitura: 0.8, revisao: 0.05, auditor: 0.12, agrupamento: 0.03 };
const ORDEM: EtapaDaAnalise[] = ["leitura", "revisao", "auditor", "agrupamento", "fim"];

const fracDoArquivo = (a: ArquivoEmLeitura) =>
  a.estado === "lido" || a.estado === "falhou" ? 1 : a.estado === "lendo" && a.paginas > 0 ? Math.min(1, a.pagina / a.paginas) : 0;

/** De 0 a 1, quanto desta etapa já foi feito. */
export function fracaoDaEtapa(p: ProgressoDaAnalise | null, e: Exclude<EtapaDaAnalise, "fim">): number {
  if (!p) return 0;
  const i = ORDEM.indexOf(p.etapa), j = ORDEM.indexOf(e);
  if (i > j) return 1;
  if (i < j) return 0;
  if (e === "leitura") return p.arquivos.length ? p.arquivos.reduce((s, a) => s + fracDoArquivo(a), 0) / p.arquivos.length : 0;
  if (e === "auditor") return p.auditor.total > 0 ? p.auditor.feitos / p.auditor.total : 0;
  return 0;
}

export function percentualDaAnalise(p: ProgressoDaAnalise | null): number {
  if (!p) return 0;
  const v = (Object.keys(PESO) as (keyof typeof PESO)[]).reduce((s, e) => s + PESO[e] * fracaoDaEtapa(p, e), 0);
  return Math.max(0, Math.min(1, v));
}

function useRelogio(inicio: number | null, parado: boolean) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!inicio || parado) return;
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [inicio, parado]);
  if (!inicio) return "00:00";
  const s = Math.max(0, Math.floor((agora - inicio) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** O número que sobe até o valor, em vez de saltar. */
function Porcento({ valor, className }: { valor: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const anterior = useRef(0);
  const reduzir = useReducedMotion();
  useEffect(() => {
    const alvo = Math.floor(valor * 100);
    if (reduzir || !ref.current) { if (ref.current) ref.current.textContent = `${alvo}%`; anterior.current = alvo; return; }
    const c = animate(anterior.current, alvo, {
      duration: 0.5, ease: CURVA,
      onUpdate: (v) => { if (ref.current) ref.current.textContent = `${Math.round(v)}%`; },
    });
    anterior.current = alvo;
    return () => c.stop();
  }, [valor, reduzir]);
  return <span ref={ref} className={cn("tabular-nums", className)}>0%</span>;
}

/** A barra da casa: trilho apagado, preenchimento que anda com mola. */
function Barra({ valor, grossa, cor = "bg-primary" }: { valor: number; grossa?: boolean; cor?: string }) {
  const reduzir = useReducedMotion();
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-white/[0.06]", grossa ? "h-2.5" : "h-1.5")}
      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(valor * 100)}>
      <motion.div className={cn("h-full rounded-full", cor)}
        initial={{ width: 0 }} animate={{ width: `${valor * 100}%` }}
        transition={reduzir ? { duration: 0 } : MOLA} />
    </div>
  );
}

/* ═══════════════════════ o saguão ═══════════════════════ */

export interface ArquivoDoDriveSaguao { id: string; name: string; mimeType?: string; size?: string }
export interface ClienteDoDrive { id: string; nome: string; cpf_cnpj: string | null; drive_folder_url?: string | null }

export interface ResumoDoDesfecho {
  rubricas: number;
  total: number;
  /** lançamentos que a revisão deixou para a pessoa conferir */
  conferir: number;
}

export interface SaguaoProps {
  fase: "upload" | "parsing" | "analyzing" | "success" | "noDiscount" | "error";
  clienteNome: string | null;
  driveFolderId: string | null;
  driveUrl: string | null;
  arquivos: File[];
  aviso: string;
  onAdicionar: (files: FileList | File[]) => void;
  onRemover: (idx: number) => void;
  onAnalisar: () => void;
  progresso: ProgressoDaAnalise | null;
  onPularIa: () => void;
  erro: string;
  onRecomecar: () => void;
  resumo: ResumoDoDesfecho;
  // Drive
  onAbrirDrive: () => void;
  drive: {
    aberto: boolean; carregando: boolean; arquivos: ArquivoDoDriveSaguao[]; selecionados: Set<string>;
    erro: string; baixando: boolean; progresso: { done: number; total: number };
    /** "cliente": escolhendo de quem é a pasta; "arquivos": dentro dela */
    etapa: "cliente" | "arquivos";
    /** o dono da pasta aberta; `fixo` quando é o cliente do contexto */
    dono: { id: string | null; nome: string | null; fixo: boolean } | null;
    clientes: ClienteDoDrive[];
    carregandoClientes: boolean;
  };
  onDriveCliente: (c: ClienteDoDrive) => void;
  onDriveTrocarCliente: () => void;
  onDriveAlternar: (id: string) => void;
  onDriveTodos: () => void;
  onDriveLimpar: () => void;
  onDriveFechar: () => void;
  onDriveAdicionar: () => void;
  // titulares diferentes
  titulares: string[] | null;
  onAjustarArquivos: () => void;
  onAnalisarMesmoAssim: () => void;
}

export function SaguaoFinder(p: SaguaoProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const escolher = () => inputRef.current?.click();
  const analisando = p.fase === "parsing" || p.fase === "analyzing";
  const desfecho: Desfecho | null =
    p.titulares ? "titulares"
      : p.fase === "success" ? (p.resumo.conferir > 0 ? "conferir" : "achou")
      : p.fase === "noDiscount" ? "nada"
      : p.fase === "error" ? "erro"
      : null;
  const naFila = p.fase === "upload" && !desfecho;

  /* DETECÇÃO DO BANCO. Por enquanto o Finder só lê Bradesco, então a
     detecção é de fachada: cada extrato que entra passa pela lupa e sai
     identificado. Quando entrar outro banco, este é o lugar da leitura de
     verdade (o cabeçalho da primeira página já diz o banco). */
  const [detectados, setDetectados] = useState<Record<string, "lendo" | "bradesco">>({});
  useEffect(() => {
    const novos = p.arquivos.map(chaveDoArquivo).filter((k) => !detectados[k]);
    if (!novos.length) return;
    setDetectados((d) => ({ ...d, ...Object.fromEntries(novos.map((k) => [k, "lendo" as const])) }));
    const timers = novos.map((k, i) => window.setTimeout(
      () => setDetectados((d) => ({ ...d, [k]: "bradesco" })), 1300 + i * 450));
    return () => timers.forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.arquivos]);
  const identificando = p.arquivos.some((f) => detectados[chaveDoArquivo(f)] !== "bradesco");

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full space-y-6 px-3 py-3 sm:px-6 sm:py-6">
        {/* `hidden` como ATRIBUTO, e não só classe: o `space-y-6` pula quem tem
            o atributo. Só com a classe, este input invisível era o "primeiro
            filho" e empurrava o título 24px para baixo das outras abas. */}
        <input ref={inputRef} type="file" accept=".pdf" multiple hidden className="hidden"
          onChange={(e) => { if (e.target.files?.length) p.onAdicionar(e.target.files); e.target.value = ""; }} />

        {/* O cabeçalho de toda aba: título sóbrio, sem ícone, na mesma altura */}
        <CabecalhoDaPagina
          titulo="Finder"
          subtitulo={p.clienteNome
            ? <>Extratos de <strong className="text-foreground font-medium">{p.clienteNome}</strong>. Lê, separa o que é cobrança indevida e agrupa por rubrica.</>
            : "Lê os extratos, separa o que é cobrança indevida e agrupa por rubrica, com a base legal de cada uma."}
        />

        {/* AS ANÁLISES DO FINDER. Uma aba por análise, com a marca que desliza
            (layoutId) quando houver mais de uma. As que vêm por aí aparecem
            como vaga, sem clique. */}
        <AnimatePresence initial={false}>
          {naFila && (
            <motion.div key="analises" className="flex flex-wrap items-center gap-2"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: CURVA, delay: 0.05 }}>
              <div className="inline-flex rounded-xl bg-white/[0.03] border border-white/[0.07] p-1">
                {ANALISES.map((a) => (
                  <span key={a.chave} className="relative inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium">
                    <motion.span layoutId="analise-ativa" transition={MOLA} className="absolute inset-0 rounded-lg bg-primary/15" />
                    <LogoBradesco className="relative h-4 w-4 text-foreground" desenhar atraso={0.2} />
                    <span className="relative text-primary">{a.rotulo}</span>
                  </span>
                ))}
              </div>
              <span className="inline-flex items-center rounded-xl border border-dashed border-white/[0.1] px-3 py-2 text-xs text-muted-foreground/60">
                Outras análises em breve
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* A PORTA DE ENTRADA, UMA SÓ: junto da lupa. Os dois jeitos de trazer
            extrato (do computador e do Drive de um cliente) e, quando já há
            fila, o Analisar. Antes havia botões no canto de cima e a lupa
            também recebia, cada um num lugar. A lupa segue aceitando arrastar
            e clicar. */}
        <AnimatePresence initial={false}>
          {naFila && (
            <motion.div key="entradas" className="flex flex-wrap items-center gap-2"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: CURVA, delay: 0.08 }}>
              <Button variant="outline" onClick={escolher} className="gap-1.5">
                <Upload className="h-4 w-4" /> Adicionar do dispositivo
              </Button>
              <Button variant="outline" onClick={p.onAbrirDrive} className="gap-1.5">
                <LogoDrive className="h-4 w-4" /> Adicionar do Drive
              </Button>
              <AnimatePresence initial={false}>
                {p.arquivos.length > 0 && (
                  <motion.div key="analisar" className="ml-auto"
                    initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }} transition={MOLA}>
                    <Button onClick={p.onAnalisar} disabled={identificando} className="gap-1.5 min-w-[9.5rem]">
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span key={identificando ? "id" : "ok"} className="inline-flex items-center gap-1.5"
                          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.16, ease: CURVA }}>
                          {identificando
                            ? <><Loader2 className="h-4 w-4 animate-spin" /> Identificando…</>
                            : <><Play className="h-4 w-4" /> Analisar{p.arquivos.length > 1 ? ` ${p.arquivos.length} extratos` : ""}</>}
                        </motion.span>
                      </AnimatePresence>
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait" initial={false}>
          {naFila && (
            <motion.div key="fila"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: CURVA }}>
              <Fila {...p} onEscolher={escolher} detectados={detectados} />
            </motion.div>
          )}
          {analisando && !desfecho && (
            <motion.div key="andamento"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: CURVA }}>
              <Andamento progresso={p.progresso} arquivosNaFila={p.arquivos.length} onPularIa={p.onPularIa} />
            </motion.div>
          )}
          {desfecho && (
            <motion.div key={`desfecho-${desfecho}`}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: CURVA }}>
              <TelaDeDesfecho tipo={desfecho} {...p} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <EscolherDoDrive {...p} />
    </div>
  );
}

/* ─────────────── a fila ─────────────── */

function Fila(p: SaguaoProps & { onEscolher: () => void; detectados: Record<string, "lendo" | "bradesco"> }) {
  const [sobre, setSobre] = useState(false);
  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setSobre(false);
    if (e.dataTransfer?.files?.length) p.onAdicionar(e.dataTransfer.files);
  };
  const vazia = p.arquivos.length === 0;

  return (
    <div className="space-y-4"
      onDragOver={(e) => { e.preventDefault(); setSobre(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setSobre(false); }}
      onDrop={soltar}>
      <AnimatePresence initial={false}>
        {p.aviso && (
          <motion.div key="aviso" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={MOLA} className="overflow-hidden">
            <div className="flex items-start gap-2 rounded-xl bg-amber-400/[0.07] px-3 py-2.5 text-[12.5px] text-amber-300 ring-1 ring-inset ring-amber-400/25">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {p.aviso}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        {vazia ? (
          /* ESTADO VAZIO: a órbita do Finder, que também é o lugar de soltar */
          <motion.button key="vazia" type="button" onClick={p.onEscolher}
            aria-label="Soltar extratos aqui ou escolher do dispositivo"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3, ease: CURVA }}
            className={cn("group w-full rounded-2xl border border-dashed px-6 py-10 sm:py-12 transition-colors",
              sobre ? "border-primary/60 bg-primary/[0.05]" : "border-border/60 bg-white/[0.01] hover:border-primary/40")}>
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-10">
              <OrbitaDeAnalises ativa={sobre} tamanho={228} />
              <div className="text-center sm:text-left max-w-sm">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-white/[0.06]">
                  <LogoBradesco className="h-3 w-3 text-foreground" /> Extratos Bradesco
                </p>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.p key={sobre ? "solta" : "arrasta"} className="mt-3 text-base font-semibold tracking-tight"
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16, ease: CURVA }}>
                    {sobre ? "Solte para a lupa ler" : "Arraste os extratos em PDF para cá"}
                  </motion.p>
                </AnimatePresence>
                <p className="mt-1 text-sm text-muted-foreground">
                  ou clique para escolher do dispositivo. Para puxar da pasta de um cliente, use Adicionar do Drive.
                  O Finder identifica o banco e separa o que é cobrança indevida. Até 100 MB por arquivo.
                </p>
              </div>
            </div>
          </motion.button>
        ) : (
          <motion.div key="cheia"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: CURVA }}
            className={cn(CARTAO, "overflow-hidden transition-colors", sobre && "border-primary/40")}>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/[0.06]">
              <p className="text-[11px] uppercase tracking-[0.14em] font-medium text-muted-foreground">
                Fila de análise <span className="ml-1 tabular-nums text-foreground/70">{p.arquivos.length}</span>
              </p>
              {/* mais extratos entram pelos botões de cima ou arrastando para cá */}
              <span className="text-xs text-muted-foreground/70">arraste mais PDFs para cá</span>
            </div>
            <ul className="divide-y divide-white/[0.05]">
              <AnimatePresence initial={false}>
                {p.arquivos.map((f, i) => {
                  const est = p.detectados[chaveDoArquivo(f)] ?? "lendo";
                  return (
                    <motion.li key={chaveDoArquivo(f)} layout
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 12 }}
                      transition={{ ...MOLA, delay: Math.min(i, 8) * 0.05 }}
                      className="relative flex items-center gap-3 px-4 py-3 overflow-hidden">
                      <Detector estado={est} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{f.name}</span>
                        <AnimatePresence mode="wait" initial={false}>
                          <motion.span key={est} className="block text-xs text-muted-foreground"
                            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.18, ease: CURVA }}>
                            {est === "lendo"
                              ? <>{tamanho(f.size) ?? "PDF"} · identificando o banco…</>
                              : <>{tamanho(f.size) ?? "PDF"} · extrato do Bradesco</>}
                          </motion.span>
                        </AnimatePresence>
                      </span>
                      <AnimatePresence initial={false}>
                        {est === "bradesco" && (
                          <motion.span key="selo"
                            initial={{ opacity: 0, scale: 0.8, x: 6 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0 }}
                            transition={{ ...MOLA, delay: 0.35 }}
                            className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/25">
                            <Check className="h-3 w-3" strokeWidth={3} /> Bradesco
                          </motion.span>
                        )}
                      </AnimatePresence>
                      <button type="button" onClick={() => p.onRemover(i)} aria-label={`Tirar ${f.name} da fila`}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                      {/* a varredura: uma faixa que passa pela linha enquanto a lupa lê */}
                      <AnimatePresence>
                        {est === "lendo" && (
                          <motion.span key="varre" aria-hidden
                            className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-primary/[0.07] to-transparent"
                            initial={{ left: "-35%" }} animate={{ left: "105%" }} exit={{ opacity: 0 }}
                            transition={{ duration: 1.1, ease: "easeInOut", repeat: Infinity }} />
                        )}
                      </AnimatePresence>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-xs text-muted-foreground">
        Por enquanto o Finder lê extratos do Bradesco. Extrato escaneado também entra, lido por OCR, e leva mais tempo.
        {p.driveUrl && (
          <> <a href={p.driveUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-foreground/80 hover:text-foreground transition-colors">
            Abrir a pasta no Drive <ExternalLink className="h-3 w-3" /></a></>
        )}
      </p>
    </div>
  );
}

/** O quadradinho do arquivo: a lupa varre o documento e, identificado, vira a
 *  marca do banco desenhada na hora. */
function Detector({ estado }: { estado: "lendo" | "bradesco" }) {
  return (
    <span className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-inset ring-white/[0.08]">
      <AnimatePresence mode="wait" initial={false}>
        {estado === "lendo" ? (
          /* SÓ A LUPA, andando num oito pequeno: o documento por baixo dela
             ficava encavalado com a lente e virava um borrão. */
          <motion.span key="lendo" className="relative grid h-full w-full place-items-center text-primary"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.18, ease: CURVA }}>
            {/* CSS, e não framer: a linha nasce dentro de um AnimatePresence
                com initial={false}, que prenderia um laço do framer parado. */}
            <span className="grid place-items-center lupa-varre">
              <Lupa className="h-5 w-5" />
            </span>
          </motion.span>
        ) : (
          <motion.span key="bradesco" className="grid h-full w-full place-items-center text-foreground"
            initial={{ opacity: 0, scale: 0.6, rotate: -12 }} animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}>
            <LogoBradesco className="h-6 w-6" desenhar />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/* ─────────────── a análise em andamento ─────────────── */

function Andamento({ progresso, arquivosNaFila, onPularIa }: {
  progresso: ProgressoDaAnalise | null; arquivosNaFila: number; onPularIa: () => void;
}) {
  const relogio = useRelogio(progresso?.inicio ?? null, false);
  const [confirmarPulo, setConfirmarPulo] = useState(false);
  const arquivos = progresso?.arquivos ?? [];
  const etapa = progresso?.etapa ?? "leitura";
  const lendo = arquivos.find((a) => a.estado === "lendo");
  const temOcr = arquivos.some((a) => a.ocr && a.estado !== "lido");
  const total = percentualDaAnalise(progresso);
  const noAuditor = etapa === "auditor" && !progresso?.iaPulada;

  const frase = (() => {
    if (etapa === "leitura") {
      if (!lendo) return "Preparando a leitura…";
      const i = arquivos.indexOf(lendo);
      const qual = arquivos.length > 1 ? `Extrato ${i + 1} de ${arquivos.length}` : "Lendo o extrato";
      return lendo.paginas ? `${qual}, página ${lendo.pagina} de ${lendo.paginas}${lendo.ocr ? " por OCR" : ""}` : `${qual}, abrindo o PDF…`;
    }
    if (etapa === "revisao") return "Revisando os lançamentos por código…";
    if (etapa === "auditor") return progresso?.iaPulada ? "Pulando o auditor de IA…" : "Auditor de IA conferindo os descontos…";
    return "Agrupando por rubrica…";
  })();

  const etapas: { chave: Exclude<EtapaDaAnalise, "fim">; rotulo: string; detalhe: string | null }[] = [
    { chave: "leitura", rotulo: arquivos.length > 1 ? `Leitura dos ${arquivos.length} extratos` : "Leitura do extrato",
      detalhe: lendo?.paginas ? `página ${lendo.pagina} de ${lendo.paginas}${lendo.ocr ? ", OCR" : ""}` : null },
    { chave: "revisao", rotulo: "Revisão por código", detalhe: "tira falso positivo e recupera o que a leitura perdeu" },
    { chave: "auditor", rotulo: "Auditor de IA",
      detalhe: progresso?.iaPulada ? "pulado" : progresso?.auditor.total ? `${progresso.auditor.total} ${progresso.auditor.total === 1 ? "lote" : "lotes"}` : null },
    { chave: "agrupamento", rotulo: "Agrupamento por rubrica", detalhe: null },
  ];
  const estadoDa = (e: EtapaDaAnalise) => {
    const a = ORDEM.indexOf(etapa), b = ORDEM.indexOf(e);
    return a > b ? "feito" : a === b ? "rodando" : "fila";
  };

  return (
    <div className="space-y-4">
      {/* A BARRA GERAL */}
      <section className={cn(CARTAO, "p-5")}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.14em] font-medium text-muted-foreground">Analisando</p>
            {/* Anima quando MUDA A ETAPA, não a cada página: a frase muda várias
                vezes por segundo na leitura, e um texto que sai e entra nesse
                ritmo engasga e fica preso no antigo. */}
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p key={etapa}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: CURVA }}
                className="mt-1 truncate text-sm text-foreground/90">
                {frase}
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="shrink-0 text-right">
            <Porcento valor={total} className="block text-3xl font-semibold tracking-tight" />
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
              <Clock className="h-3 w-3" /> {relogio}
            </span>
          </div>
        </div>
        <div className="mt-4"><Barra valor={total} grossa /></div>
      </section>

      {/* AS ETAPAS, cada uma de 0 a 100% */}
      <section className={cn(CARTAO, "divide-y divide-white/[0.05]")}>
        {etapas.map((e, i) => {
          const est = estadoDa(e.chave);
          const frac = fracaoDaEtapa(progresso, e.chave);
          return (
            <motion.div key={e.chave} layout
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ ...MOLA, delay: i * 0.05 }}
              className="px-5 py-4">
              <div className="flex items-center gap-3">
                <EstadoIcone estado={est} />
                <span className={cn("text-sm font-medium", est === "fila" && "text-muted-foreground font-normal")}>{e.rotulo}</span>
                <AnimatePresence initial={false}>
                  {e.detalhe && est !== "fila" && (
                    <motion.span key="detalhe" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="hidden sm:inline truncate text-xs text-muted-foreground">
                      · {e.detalhe}
                    </motion.span>
                  )}
                </AnimatePresence>
                <Porcento valor={frac} className={cn("ml-auto text-sm font-medium", est === "fila" && "text-muted-foreground/60")} />
              </div>
              <div className="mt-2.5 pl-8">
                <Barra valor={frac} cor={e.chave === "auditor" && progresso?.iaPulada ? "bg-amber-400" : est === "feito" ? "bg-emerald-500" : "bg-primary"} />
              </div>

              {/* os extratos, um por um */}
              {e.chave === "leitura" && arquivos.length > 1 && (
                <ul className="mt-3 pl-8 space-y-2.5">
                  {arquivos.map((a, j) => (
                    <motion.li key={`${a.nome}-${j}`}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ ...MOLA, delay: j * 0.05 }}>
                      <div className="flex items-center gap-2 text-xs">
                        <FileText className={cn("h-3.5 w-3.5 shrink-0", a.estado === "falhou" ? "text-destructive" : "text-muted-foreground")} />
                        <span className="min-w-0 flex-1 truncate text-foreground/85">{a.nome}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {a.estado === "falhou" ? "não abriu" : a.estado === "fila" ? "na fila" : a.ocr && a.estado === "lendo" ? "OCR" : ""}
                        </span>
                        <Porcento valor={fracDoArquivo(a)} className="w-10 shrink-0 text-right text-muted-foreground" />
                      </div>
                      <div className="mt-1.5 pl-5">
                        <Barra valor={fracDoArquivo(a)} cor={a.estado === "falhou" ? "bg-destructive" : a.estado === "lido" ? "bg-emerald-500/80" : "bg-primary/80"} />
                      </div>
                    </motion.li>
                  ))}
                </ul>
              )}

              {/* PULAR O AUDITOR: a saída para nunca ficar preso na IA */}
              {e.chave === "auditor" && (
                <AnimatePresence initial={false}>
                  {noAuditor && (
                    <motion.div key="pular"
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      transition={MOLA} className="overflow-hidden">
                      <div className="mt-3 pl-8 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">Demorando? Dá para seguir só com a análise por código.</p>
                        <Button size="sm" variant="outline" onClick={() => setConfirmarPulo(true)} className="h-8 gap-1.5">
                          <FastForward className="h-3.5 w-3.5" /> Pular auditor de IA
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </motion.div>
          );
        })}
      </section>

      <AnimatePresence initial={false}>
        {temOcr && (
          <motion.p key="ocr" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={MOLA} className="overflow-hidden">
            <span className="flex items-start gap-2 text-xs text-muted-foreground">
              <ScanText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Extrato escaneado: a leitura é por OCR, página por página, e em PDFs grandes passa de 10 minutos. Pode trocar de tela, a análise continua.
            </span>
          </motion.p>
        )}
      </AnimatePresence>

      <AlertDialog open={confirmarPulo} onOpenChange={setConfirmarPulo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FastForward className="h-5 w-5 text-amber-400" /> Pular o auditor de IA?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>O relatório sai agora, só com a análise por código.</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>A IA confere cada desconto e derruba o que não é cobrança indevida. Sem ela, algum lançamento que ela teria descartado pode ficar no relatório.</li>
                  <li>O que a IA já conferiu nesta análise é descartado, para o relatório não ficar metade conferido e metade não.</li>
                  <li>Revise as rubricas antes de vincular ou gerar a análise comercial.</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar esperando</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmarPulo(false); onPularIa(); }} className="bg-amber-500 text-black hover:bg-amber-400">
              Sim, pular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EstadoIcone({ estado }: { estado: "feito" | "rodando" | "fila" }) {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center">
      <AnimatePresence mode="wait" initial={false}>
        {estado === "feito" ? (
          <motion.span key="feito" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
            transition={MOLA} className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
            <Check className="h-3 w-3" strokeWidth={3} />
          </motion.span>
        ) : estado === "rodando" ? (
          <motion.span key="rodando" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            transition={MOLA} className="text-primary">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          </motion.span>
        ) : (
          <motion.span key="fila" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-muted-foreground/40">
            <Circle className="h-3.5 w-3.5" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/* ─────────────── o desfecho ─────────────── */

type Desfecho = "achou" | "conferir" | "nada" | "titulares" | "erro";

const TOM: Record<Desfecho, { anel: string; fundo: string; texto: string }> = {
  achou: { anel: "border-emerald-400/50", fundo: "bg-emerald-500/10", texto: "text-emerald-400" },
  conferir: { anel: "border-amber-400/50", fundo: "bg-amber-400/10", texto: "text-amber-400" },
  nada: { anel: "border-rose-400/50", fundo: "bg-rose-500/10", texto: "text-rose-400" },
  titulares: { anel: "border-amber-400/50", fundo: "bg-amber-400/10", texto: "text-amber-400" },
  erro: { anel: "border-rose-400/50", fundo: "bg-rose-500/10", texto: "text-rose-400" },
};

/** O selo animado: círculo que cresce, anéis que se abrem e o traço desenhado. */
function Selo({ tipo }: { tipo: Desfecho }) {
  const reduzir = useReducedMotion();
  const t = TOM[tipo];
  const desenho = { initial: { pathLength: reduzir ? 1 : 0 }, animate: { pathLength: 1 }, transition: { duration: 0.45, ease: CURVA, delay: 0.25 } };
  return (
    <div className="relative mx-auto h-28 w-28">
      {!reduzir && [0, 1].map((k) => (
        <motion.span key={k} className={cn("absolute inset-0 rounded-full border-2", t.anel)}
          initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1.55, opacity: [0, 0.9, 0] }}
          transition={{ duration: 1.4, ease: "easeOut", delay: 0.15 + k * 0.25 }} />
      ))}
      <motion.div className={cn("absolute inset-2 grid place-items-center rounded-full border-2", t.anel, t.fundo, t.texto)}
        initial={{ scale: reduzir ? 1 : 0, rotate: reduzir ? 0 : -20 }} animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}>
        {tipo === "titulares" ? (
          <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...MOLA, delay: 0.25 }}>
            <Users className="h-10 w-10" />
          </motion.span>
        ) : (
          <svg viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {tipo === "achou" && <motion.path d="M5 12.5l4.5 4.5L19 7.5" {...desenho} />}
            {tipo === "nada" && <><motion.path d="M7 7l10 10" {...desenho} /><motion.path d="M17 7L7 17" {...desenho} transition={{ ...desenho.transition, delay: 0.4 }} /></>}
            {(tipo === "conferir" || tipo === "erro") && <>
              <motion.path d="M12 4L2.5 20h19L12 4z" {...desenho} />
              <motion.path d="M12 10v4.5" {...desenho} transition={{ ...desenho.transition, delay: 0.55 }} />
              <motion.path d="M12 17.5h.01" {...desenho} transition={{ ...desenho.transition, delay: 0.7 }} />
            </>}
          </svg>
        )}
      </motion.div>
    </div>
  );
}

function TelaDeDesfecho({ tipo, ...p }: SaguaoProps & { tipo: Desfecho }) {
  const r = p.resumo;
  const titulo = {
    achou: "Descontos indevidos encontrados",
    conferir: "Descontos encontrados, com pontos a conferir",
    nada: "Nenhum desconto indevido",
    titulares: "Extratos de pessoas diferentes",
    erro: "Não deu para analisar",
  }[tipo];
  const frase = {
    achou: `${r.rubricas} ${r.rubricas === 1 ? "rubrica" : "rubricas"}, ${brl(r.total)} a restituir. Abrindo o relatório…`,
    conferir: `${r.rubricas} ${r.rubricas === 1 ? "rubrica" : "rubricas"}, ${brl(r.total)}. ${r.conferir} ${r.conferir === 1 ? "lançamento ficou" : "lançamentos ficaram"} com baixa confiança e ${r.conferir === 1 ? "está marcado" : "estão marcados"} no relatório para você conferir.`,
    nada: "A leitura terminou e nenhum lançamento destes extratos é cobrança indevida. Abrindo o relatório…",
    titulares: "A fila tem extratos de mais de um titular. O certo é analisar um por vez; juntar só faz sentido de propósito, como um casal com contas separadas.",
    erro: p.erro,
  }[tipo];

  return (
    <section className={cn(CARTAO, "mx-auto max-w-xl px-6 py-10 text-center")}>
      <Selo tipo={tipo} />
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: CURVA, delay: 0.45 }}>
        <h2 className="mt-6 text-xl font-semibold tracking-tight">{titulo}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{frase}</p>

        {p.progresso?.iaPulada && (tipo === "achou" || tipo === "conferir" || tipo === "nada") && (
          <p className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2.5 py-1 text-xs text-amber-300 ring-1 ring-inset ring-amber-400/25">
            <FastForward className="h-3 w-3" /> Só análise por código: o auditor de IA foi pulado
          </p>
        )}

        {tipo === "titulares" && (
          <>
            <ul className="mx-auto mt-5 max-w-sm space-y-1.5 text-left">
              {(p.titulares ?? []).map((n, i) => (
                <motion.li key={n} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ ...MOLA, delay: 0.55 + i * 0.05 }}
                  className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-sm ring-1 ring-inset ring-white/[0.06]">
                  <UserRound className="h-3.5 w-3.5 text-muted-foreground" /> {n}
                </motion.li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">Juntos, os descontos de todos saem num relatório só, sem separar por pessoa.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={p.onAnalisarMesmoAssim}>Analisar juntos</Button>
              <Button onClick={p.onAjustarArquivos}>Ajustar a fila</Button>
            </div>
          </>
        )}
        {tipo === "erro" && (
          <div className="mt-6"><Button variant="outline" onClick={p.onRecomecar}>Voltar para a fila</Button></div>
        )}
        {(tipo === "achou" || tipo === "conferir" || tipo === "nada") && (
          <div className="mx-auto mt-6 max-w-xs">
            <BarraDeEspera duracao={tipo === "conferir" ? 3.6 : tipo === "nada" ? 3 : 2.6} />
          </div>
        )}
      </motion.div>
    </section>
  );
}

/** A contagem até o relatório abrir, para o desfecho não parecer travado. */
function BarraDeEspera({ duracao }: { duracao: number }) {
  const reduzir = useReducedMotion();
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <motion.div className="h-full rounded-full bg-foreground/30"
        initial={{ width: "0%" }} animate={{ width: "100%" }}
        transition={reduzir ? { duration: 0 } : { duration: duracao - 0.5, ease: "linear", delay: 0.5 }} />
    </div>
  );
}

/* ─────────────── drive ─────────────── */

function EscolherDoDrive(p: SaguaoProps) {
  const d = p.drive;
  const [busca, setBusca] = useState("");
  useEffect(() => { if (d.aberto) setBusca(""); }, [d.aberto, d.etapa]);
  const noCliente = d.etapa === "cliente";
  const q = busca.trim().toLowerCase();
  /* Quem tem pasta vem primeiro; quem não tem aparece apagado, para ficar
     claro por que não abre (e não parecer que sumiu). */
  const clientes = [...d.clientes]
    .filter((c) => !q || c.nome?.toLowerCase().includes(q) || c.cpf_cnpj?.toLowerCase().includes(q))
    .sort((a, b) => Number(!!b.drive_folder_url) - Number(!!a.drive_folder_url));

  return (
    <Dialog open={d.aberto} onOpenChange={(a) => { if (!a && !d.baixando) p.onDriveFechar(); }}>
      <DialogContent className="sm:max-w-xl gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <LogoDrive className="h-4 w-4" />
            {noCliente ? "Extratos do Drive" : <>Pasta de {d.dono?.nome || "cliente"} no Drive</>}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            {noCliente
              ? "Escolha o cliente. Os extratos vêm da pasta do Drive cadastrada na ficha dele."
              : "Escolha os extratos. Eles ficam só nesta aba, nada é salvo no seu computador."}
          </DialogDescription>
          {!noCliente && d.dono && !d.dono.fixo && !d.baixando && (
            <button type="button" onClick={p.onDriveTrocarCliente}
              className="mt-2 inline-flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> Trocar de cliente
            </button>
          )}
        </DialogHeader>

        <AnimatePresence mode="wait" initial={false}>
          {noCliente ? (
            <motion.div key="clientes" className="px-6 py-4"
              initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2, ease: CURVA }}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente por nome ou CPF…" className="pl-9" />
              </div>
              <div className="mt-3 max-h-[46vh] min-h-[180px] overflow-y-auto -mx-1 px-1">
                {d.carregandoClientes ? (
                  <div className="flex h-40 flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" /> Carregando clientes…
                  </div>
                ) : d.erro ? (
                  <div className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-[12.5px] text-destructive">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {d.erro}
                  </div>
                ) : clientes.length === 0 ? (
                  <p className="py-10 text-center text-[13px] text-muted-foreground">
                    {q ? "Nenhum cliente com esse nome ou CPF." : "Nenhum cliente cadastrado."}
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {clientes.slice(0, 80).map((c, i) => {
                      const temPasta = !!c.drive_folder_url;
                      return (
                        <motion.li key={c.id}
                          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.22, ease: CURVA, delay: Math.min(i, 10) * 0.03 }}>
                          <button type="button" disabled={!temPasta} onClick={() => p.onDriveCliente(c)}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent">
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                              <UserRound className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{c.nome}</span>
                              <span className="block text-xs text-muted-foreground">
                                {[c.cpf_cnpj, temPasta ? null : "sem pasta no Drive"].filter(Boolean).join(" · ") || "\u00a0"}
                              </span>
                            </span>
                            {temPasta && <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />}
                          </button>
                        </motion.li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div key="arquivos" className="max-h-[50vh] min-h-[180px] overflow-y-auto px-6 py-4"
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2, ease: CURVA }}>
              {d.carregando ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" /> Lendo a pasta…
                </div>
              ) : d.erro ? (
                <div className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2.5 text-[12.5px] text-destructive">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {d.erro}
                </div>
              ) : d.arquivos.length === 0 ? (
                <p className="py-10 text-center text-[13px] text-muted-foreground">Nenhum arquivo nesta pasta. Suba os extratos no Drive primeiro.</p>
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between text-[12px]">
                    <span className="text-muted-foreground">{d.arquivos.length} {d.arquivos.length === 1 ? "arquivo" : "arquivos"}</span>
                    <span className="flex gap-3">
                      <button onClick={p.onDriveTodos} className="font-medium text-primary hover:underline">Marcar todos</button>
                      <button onClick={p.onDriveLimpar} className="text-muted-foreground hover:text-foreground transition-colors">Limpar</button>
                    </span>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {d.arquivos.map((f, i) => {
                      const marcado = d.selecionados.has(f.id);
                      const tipo = f.mimeType === "application/pdf" ? "PDF" : f.mimeType?.startsWith("image/") ? (f.mimeType.split("/")[1] || "imagem").toUpperCase() : "outro";
                      return (
                        <motion.li key={f.id}
                          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, ease: CURVA, delay: Math.min(i, 10) * 0.05 }}>
                          <button type="button" role="checkbox" aria-checked={marcado} onClick={() => p.onDriveAlternar(f.id)}
                            className={cn("flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                              marcado ? "border-primary/40 bg-primary/[0.06]" : "border-border hover:bg-white/[0.03]")}>
                            <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors",
                              marcado ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                              {marcado && <Check className="h-3 w-3" strokeWidth={3} />}
                            </span>
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium">{f.name}</span>
                              <span className="block text-[11px] text-muted-foreground">{[tamanho(f.size), tipo].filter(Boolean).join(" · ")}</span>
                            </span>
                          </button>
                        </motion.li>
                      );
                    })}
                  </ul>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <DialogFooter className="flex-row items-center justify-between gap-3 border-t border-border px-6 py-4 sm:justify-between">
          <span className="text-[12.5px] text-muted-foreground tabular-nums">
            {noCliente
              ? `${d.clientes.filter((c) => c.drive_folder_url).length} com pasta no Drive`
              : d.baixando ? `Baixando ${d.progresso.done} de ${d.progresso.total}…` : d.selecionados.size ? `${d.selecionados.size} marcado${d.selecionados.size > 1 ? "s" : ""}` : "Nenhum marcado"}
          </span>
          <span className="flex gap-2">
            {!d.baixando && <Button variant="outline" onClick={p.onDriveFechar}>Cancelar</Button>}
            {!noCliente && (
              <Button onClick={p.onDriveAdicionar} disabled={d.baixando || d.selecionados.size === 0} className="gap-2">
                {d.baixando && <Loader2 className="h-4 w-4 animate-spin" />}
                Pôr na fila
              </Button>
            )}
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
