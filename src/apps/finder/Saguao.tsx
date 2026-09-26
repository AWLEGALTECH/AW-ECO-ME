/* O SAGUÃO DO FINDER: a tela de envio, a análise em andamento e o desfecho.
 *
 * O saguão antigo era o do Finder separado (o MVP que vivia fora do AW): selo
 * "AW LEGALTECH · AUDITORIA BANCÁRIA", título de landing page, emoji, estilo
 * escrito à mão em cada bloco e cores próprias que só acertavam o tema por
 * inversão. Este é uma tela do AW como as outras: título no padrão do
 * Dashboard, cartões e botões do sistema, ícones do lucide, cores dos tokens
 * (claro e escuro sem truque) e movimento do framer.
 *
 * A tela de resultados continua a do Finder, que ainda não foi refeita.
 *
 * A BARRA DE PROGRESSO É REAL. Ela anda com o que de fato aconteceu: cada
 * página lida de cada extrato, cada lote que o auditor de IA devolveu, cada
 * etapa concluída. Nada de tempo estimado nem de animação que finge andar.
 */
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ScanSearch, Upload, FileText, X, Play, FolderOpen, ExternalLink, Check, Loader2,
  AlertTriangle, SearchX, CheckCircle2, Users, UserRound, Circle, ScanText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };
const CURVA = [0.22, 1, 0.36, 1] as const;

const BANCOS_LIDOS = ["Bradesco", "Itaú", "Santander", "Agibank"];

const kb = (bytes?: number | string | null) => {
  const n = typeof bytes === "string" ? parseInt(bytes, 10) : bytes ?? 0;
  if (!n) return null;
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
};

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
}

/* Quanto cada etapa vale na barra. A leitura é quase tudo porque é quase todo
   o tempo: um extrato escaneado passa minutos no OCR, e o resto leva segundos. */
const PESO = { leitura: 0.8, revisao: 0.05, auditor: 0.12, agrupamento: 0.03 };
const ORDEM: EtapaDaAnalise[] = ["leitura", "revisao", "auditor", "agrupamento", "fim"];

export function percentualDaAnalise(p: ProgressoDaAnalise | null): number {
  if (!p) return 0;
  const n = p.arquivos.length || 1;
  const leitura = p.arquivos.reduce((s, a) => {
    if (a.estado === "lido" || a.estado === "falhou") return s + 1;
    if (a.estado === "lendo" && a.paginas > 0) return s + Math.min(1, a.pagina / a.paginas);
    return s;
  }, 0) / n;
  const passou = (e: EtapaDaAnalise) => ORDEM.indexOf(p.etapa) > ORDEM.indexOf(e);
  let v = PESO.leitura * (passou("leitura") ? 1 : leitura);
  if (passou("revisao")) v += PESO.revisao;
  if (passou("auditor")) v += PESO.auditor;
  else if (p.etapa === "auditor" && p.auditor.total > 0) v += PESO.auditor * (p.auditor.feitos / p.auditor.total);
  if (passou("agrupamento")) v += PESO.agrupamento;
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

/* ═══════════════════════ o saguão ═══════════════════════ */

export interface ArquivoDoDriveSaguao { id: string; name: string; mimeType?: string; size?: string }

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
  erro: string;
  onRecomecar: () => void;
  quantasRubricas: number;
  // Drive
  onAbrirDrive: () => void;
  drive: {
    aberto: boolean; carregando: boolean; arquivos: ArquivoDoDriveSaguao[]; selecionados: Set<string>;
    erro: string; baixando: boolean; progresso: { done: number; total: number };
  };
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
  const analisando = p.fase === "parsing" || p.fase === "analyzing" || p.fase === "success" || p.fase === "noDiscount";
  return (
    <div className="h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-8 py-8 sm:py-10">
        <Cabecalho clienteNome={p.clienteNome} />
        <AnimatePresence mode="wait" initial={false}>
          {p.fase === "upload" && (
            <motion.div key="envio"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: CURVA }}>
              <Envio {...p} />
            </motion.div>
          )}
          {analisando && (
            <motion.div key="analise"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: CURVA }}>
              <Andamento fase={p.fase} progresso={p.progresso} clienteNome={p.clienteNome} quantasRubricas={p.quantasRubricas} />
            </motion.div>
          )}
          {p.fase === "error" && (
            <motion.div key="erro"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: CURVA }}>
              <Falhou erro={p.erro} onRecomecar={p.onRecomecar} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <EscolherDoDrive {...p} />
      <TitularesDiferentes titulares={p.titulares} onAjustar={p.onAjustarArquivos} onMesmoAssim={p.onAnalisarMesmoAssim} />
    </div>
  );
}

function Cabecalho({ clienteNome }: { clienteNome: string | null }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <ScanSearch className="h-3.5 w-3.5" /> Auditoria de extratos
        </p>
        <h1 className="font-display mt-2 text-[2.125rem] sm:text-[2.625rem] font-semibold tracking-[-0.03em] leading-[1.05]">
          Finder
        </h1>
        <p className="mt-2 max-w-xl text-[0.9375rem] text-muted-foreground/80 tracking-[-0.011em]">
          Lê os extratos, separa o que é cobrança indevida e agrupa por rubrica, com a base legal de cada uma.
        </p>
      </div>
      {clienteNome && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: CURVA, delay: 0.05 }}
          className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <UserRound className="h-4 w-4" />
          </span>
          <span className="leading-tight">
            <span className="block text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">Extratos de</span>
            <span className="block text-sm font-medium">{clienteNome}</span>
          </span>
        </motion.div>
      )}
    </header>
  );
}

/* ─────────────── envio ─────────────── */

function Envio(p: SaguaoProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);
  const temDrive = !!(p.driveFolderId || p.driveUrl);

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setSobre(false);
    if (e.dataTransfer?.files?.length) p.onAdicionar(e.dataTransfer.files);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* ── ADICIONAR ── */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Adicionar extratos</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {temDrive ? "Da pasta do cliente no Drive ou do seu computador." : "Do seu computador. Pode mandar vários de uma vez."}
          </p>
        </div>

        {temDrive && (
          <div className="flex flex-col gap-2">
            {p.driveFolderId && (
              <Button onClick={p.onAbrirDrive} className="w-full justify-center gap-2">
                <FolderOpen className="h-4 w-4" /> Buscar na pasta do cliente
              </Button>
            )}
            {p.driveUrl && (
              <a href={p.driveUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors">
                <ExternalLink className="h-3.5 w-3.5" /> Abrir a pasta no Drive
              </a>
            )}
            <div className="flex items-center gap-3 py-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">
              <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}

        <label
          onDragOver={(e) => { e.preventDefault(); setSobre(true); }}
          onDragLeave={() => setSobre(false)}
          onDrop={soltar}
          className={cn(
            "group flex flex-1 min-h-[190px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-8 text-center transition-colors",
            sobre ? "border-primary bg-primary/[0.06]" : "border-border hover:border-primary/40 hover:bg-foreground/[0.02]",
          )}>
          <input ref={inputRef} type="file" accept=".pdf" multiple className="hidden"
            onChange={(e) => { if (e.target.files?.length) p.onAdicionar(e.target.files); e.target.value = ""; }} />
          <motion.span
            animate={{ scale: sobre ? 1.08 : 1 }} transition={MOLA}
            className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
            <Upload className="h-5 w-5" />
          </motion.span>
          <span>
            <span className="block text-sm font-medium">Arraste os PDFs aqui</span>
            <span className="mt-1 block text-[12.5px] text-muted-foreground">ou clique para escolher. Até 100 MB por arquivo.</span>
          </span>
        </label>

        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          Lê extratos do {BANCOS_LIDOS.slice(0, -1).join(", ")} e {BANCOS_LIDOS[BANCOS_LIDOS.length - 1]}. Extrato
          escaneado também entra: ele é lido por OCR, que leva mais tempo.
        </p>
      </section>

      {/* ── FILA ── */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 flex flex-col min-h-[320px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Fila de análise</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {p.arquivos.length === 0
                ? "Os extratos entram aqui antes de rodar."
                : `${p.arquivos.length} ${p.arquivos.length === 1 ? "extrato pronto" : "extratos prontos"} para analisar.`}
            </p>
          </div>
          <AnimatePresence initial={false}>
            {p.arquivos.length > 0 && (
              <motion.div key="analisar"
                initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.94 }}
                transition={MOLA}>
                <Button onClick={p.onAnalisar} className="gap-2">
                  <Play className="h-4 w-4" /> Analisar{p.arquivos.length > 1 ? ` (${p.arquivos.length})` : ""}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence initial={false}>
          {p.aviso && (
            <motion.div key="aviso"
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              transition={MOLA} className="overflow-hidden">
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 text-[12.5px] text-amber-300 ring-1 ring-inset ring-amber-500/25">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {p.aviso}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-4 flex-1">
          {p.arquivos.length === 0 ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl text-center">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-muted text-muted-foreground">
                <FileText className="h-5 w-5" />
              </span>
              <p className="text-sm font-medium text-muted-foreground">Nenhum extrato na fila</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {p.arquivos.map((f, i) => (
                  <motion.li key={`${f.name}-${f.size}`} layout
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 12 }}
                    transition={{ ...MOLA, delay: Math.min(i, 8) * 0.05 }}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background/60 px-3 py-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{f.name}</span>
                      <span className="block text-[11.5px] text-muted-foreground">{kb(f.size) ?? "PDF"} · PDF</span>
                    </span>
                    <button type="button" onClick={() => p.onRemover(i)} aria-label={`Tirar ${f.name} da fila`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

/* ─────────────── análise em andamento ─────────────── */

function Andamento({ fase, progresso, clienteNome, quantasRubricas }: {
  fase: SaguaoProps["fase"]; progresso: ProgressoDaAnalise | null; clienteNome: string | null; quantasRubricas: number;
}) {
  const acabou = fase === "success" || fase === "noDiscount";
  const pct = acabou ? 1 : percentualDaAnalise(progresso);
  const relogio = useRelogio(progresso?.inicio ?? null, acabou);
  const reduzir = useReducedMotion();
  const arquivos = progresso?.arquivos ?? [];
  const lendo = arquivos.find((a) => a.estado === "lendo");
  const indiceLendo = lendo ? arquivos.indexOf(lendo) : -1;
  const temOcr = arquivos.some((a) => a.ocr);
  const etapa = progresso?.etapa ?? "leitura";

  const frase = useMemo(() => {
    if (fase === "success") return `Pronto. Descontos em ${quantasRubricas} ${quantasRubricas === 1 ? "rubrica" : "rubricas"}. Abrindo o relatório…`;
    if (fase === "noDiscount") return "Pronto. Nenhum desconto indevido nestes extratos. Abrindo o relatório…";
    if (etapa === "leitura") {
      if (!lendo) return "Preparando a leitura…";
      const qual = arquivos.length > 1 ? `Extrato ${indiceLendo + 1} de ${arquivos.length}` : "Lendo o extrato";
      if (lendo.paginas === 0) return `${qual}: abrindo o PDF…`;
      return `${qual}: página ${lendo.pagina} de ${lendo.paginas}${lendo.ocr ? " (OCR)" : ""}`;
    }
    if (etapa === "revisao") return "Revisando os lançamentos encontrados…";
    if (etapa === "auditor") {
      const a = progresso?.auditor;
      return a && a.total > 0 ? `Auditor de IA conferindo: lote ${Math.min(a.feitos + 1, a.total)} de ${a.total}` : "Auditor de IA conferindo…";
    }
    return "Agrupando por rubrica…";
  }, [fase, etapa, lendo, indiceLendo, arquivos.length, progresso?.auditor, quantasRubricas]);

  const etapas: { chave: EtapaDaAnalise; rotulo: string; detalhe?: string }[] = [
    { chave: "leitura", rotulo: arquivos.length > 1 ? `Leitura dos ${arquivos.length} extratos` : "Leitura do extrato" },
    { chave: "revisao", rotulo: "Revisão automática", detalhe: "tira falso positivo e recupera o que o leitor perdeu" },
    { chave: "auditor", rotulo: "Auditor de IA", detalhe: progresso?.auditor.total ? `${progresso.auditor.feitos} de ${progresso.auditor.total} lotes` : undefined },
    { chave: "agrupamento", rotulo: "Agrupamento por rubrica" },
  ];
  const estadoDa = (e: EtapaDaAnalise) => {
    if (acabou) return "feito";
    const a = ORDEM.indexOf(etapa), b = ORDEM.indexOf(e);
    return a > b ? "feito" : a === b ? "rodando" : "fila";
  };

  return (
    <div className="mx-auto max-w-2xl">
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">
              {acabou ? "Análise concluída" : "Analisando os extratos"}
            </h2>
            <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
              {clienteNome ? `Extratos de ${clienteNome}` : arquivos.length === 1 ? arquivos[0].nome : `${arquivos.length} extratos`}
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-muted px-2 py-1 font-mono text-[12px] tabular-nums text-muted-foreground">{relogio}</span>
        </div>

        {/* A BARRA */}
        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-3">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p key={frase}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: CURVA }}
                className="min-w-0 truncate text-[13.5px] text-foreground/90">
                {frase}
              </motion.p>
            </AnimatePresence>
            <span className="shrink-0 text-2xl font-semibold tabular-nums tracking-tight">{Math.floor(pct * 100)}%</span>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(pct * 100)}>
            <motion.div
              className={cn("h-full rounded-full", acabou && fase === "success" ? "bg-emerald-500" : "bg-primary")}
              initial={false}
              animate={{ width: `${Math.max(pct * 100, 2)}%` }}
              transition={reduzir ? { duration: 0 } : MOLA}
            />
          </div>
        </div>

        {/* AS ETAPAS */}
        <ol className="mt-6 flex flex-col gap-1">
          {etapas.map((e, i) => {
            const est = estadoDa(e.chave);
            return (
              <motion.li key={e.chave}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: CURVA, delay: i * 0.05 }}
                className="rounded-xl px-2 py-2">
                <div className="flex items-center gap-3">
                  <EstadoIcone estado={est} />
                  <span className={cn("text-[13.5px]", est === "fila" ? "text-muted-foreground" : "text-foreground")}>{e.rotulo}</span>
                  {e.detalhe && est !== "fila" && (
                    <span className="ml-auto truncate text-[11.5px] text-muted-foreground">{e.detalhe}</span>
                  )}
                </div>

                {/* os extratos, um por um, dentro da leitura */}
                {e.chave === "leitura" && arquivos.length > 0 && (
                  <ul className="mt-2 ml-8 flex flex-col gap-2">
                    {arquivos.map((a, j) => {
                      const frac = a.estado === "lido" ? 1 : a.estado === "lendo" && a.paginas ? a.pagina / a.paginas : 0;
                      return (
                        <li key={`${a.nome}-${j}`} className="flex items-center gap-3">
                          <FileText className={cn("h-3.5 w-3.5 shrink-0", a.estado === "falhou" ? "text-destructive" : "text-muted-foreground")} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2 text-[12px]">
                              <span className="truncate text-foreground/85">{a.nome}</span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {a.estado === "falhou" ? "não abriu"
                                  : a.estado === "lido" ? (a.paginas ? `${a.paginas} pág.` : "lido")
                                  : a.estado === "lendo" && a.paginas ? `${a.pagina}/${a.paginas}${a.ocr ? " OCR" : ""}`
                                  : a.estado === "lendo" ? "abrindo" : "na fila"}
                              </span>
                            </span>
                            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                              <motion.span className={cn("block h-full rounded-full", a.estado === "falhou" ? "bg-destructive" : "bg-primary/70")}
                                initial={false} animate={{ width: `${a.estado === "falhou" ? 100 : frac * 100}%` }}
                                transition={reduzir ? { duration: 0 } : MOLA} />
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </motion.li>
            );
          })}
        </ol>

        <AnimatePresence initial={false}>
          {temOcr && !acabou && (
            <motion.p key="ocr"
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              transition={MOLA}
              className="overflow-hidden">
              <span className="mt-4 flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5 text-[12px] text-muted-foreground">
                <ScanText className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Este extrato é escaneado e está sendo lido por OCR, página por página. Em PDFs grandes isso passa de 10 minutos. Pode trocar de tela: a análise continua.
              </span>
            </motion.p>
          )}
        </AnimatePresence>
      </section>

      <AnimatePresence>
        {acabou && (
          <motion.div key="fim"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: CURVA }}
            className="mt-4 flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
            {fase === "success"
              ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              : <SearchX className="h-4 w-4" />}
            Abrindo o relatório
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EstadoIcone({ estado }: { estado: "feito" | "rodando" | "fila" }) {
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center">
      <AnimatePresence mode="wait" initial={false}>
        {estado === "feito" ? (
          <motion.span key="feito" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
            transition={MOLA} className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
            <Check className="h-3 w-3" strokeWidth={3} />
          </motion.span>
        ) : estado === "rodando" ? (
          <motion.span key="rodando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-primary">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          </motion.span>
        ) : (
          <motion.span key="fila" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-muted-foreground/50">
            <Circle className="h-3.5 w-3.5" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/* ─────────────── falhou ─────────────── */

function Falhou({ erro, onRecomecar }: { erro: string; onRecomecar: () => void }) {
  return (
    <div className="mx-auto max-w-lg">
      <section className="rounded-2xl border border-border bg-card p-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-lg font-semibold tracking-tight">Não deu para analisar</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">{erro}</p>
        <Button onClick={onRecomecar} variant="outline" className="mt-5">Voltar para a fila</Button>
      </section>
    </div>
  );
}

/* ─────────────── drive ─────────────── */

function EscolherDoDrive(p: SaguaoProps) {
  const d = p.drive;
  return (
    <Dialog open={d.aberto} onOpenChange={(a) => { if (!a && !d.baixando) p.onDriveFechar(); }}>
      <DialogContent className="sm:max-w-xl gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FolderOpen className="h-4 w-4 text-primary" /> Pasta de {p.clienteNome || "cliente"} no Drive
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Escolha os extratos. Eles ficam só nesta aba, nada é salvo no seu computador.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] min-h-[180px] overflow-y-auto px-6 py-4">
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
                          marcado ? "border-primary/40 bg-primary/[0.06]" : "border-border hover:bg-foreground/[0.03]")}>
                        <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors",
                          marcado ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                          {marcado && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{f.name}</span>
                          <span className="block text-[11px] text-muted-foreground">{[kb(f.size), tipo].filter(Boolean).join(" · ")}</span>
                        </span>
                      </button>
                    </motion.li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-3 border-t border-border px-6 py-4 sm:justify-between">
          <span className="text-[12.5px] text-muted-foreground tabular-nums">
            {d.baixando ? `Baixando ${d.progresso.done} de ${d.progresso.total}…` : d.selecionados.size ? `${d.selecionados.size} marcado${d.selecionados.size > 1 ? "s" : ""}` : "Nenhum marcado"}
          </span>
          <span className="flex gap-2">
            {!d.baixando && <Button variant="outline" onClick={p.onDriveFechar}>Cancelar</Button>}
            <Button onClick={p.onDriveAdicionar} disabled={d.baixando || d.selecionados.size === 0} className="gap-2">
              {d.baixando && <Loader2 className="h-4 w-4 animate-spin" />}
              Pôr na fila
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── titulares diferentes ─────────────── */

function TitularesDiferentes({ titulares, onAjustar, onMesmoAssim }: {
  titulares: string[] | null; onAjustar: () => void; onMesmoAssim: () => void;
}) {
  return (
    <Dialog open={!!titulares} onOpenChange={(a) => { if (!a) onAjustar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-amber-500" /> Extratos de pessoas diferentes
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            A fila tem extratos de mais de um titular. O certo é analisar um titular por vez; juntar só faz sentido
            quando é de propósito, como um casal com contas separadas.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/40 p-2">
          {(titulares ?? []).map((n, i) => (
            <motion.li key={n}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: CURVA, delay: i * 0.05 }}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px]">
              <UserRound className="h-3.5 w-3.5 text-muted-foreground" /> {n}
            </motion.li>
          ))}
        </ul>
        <p className="text-[12px] text-muted-foreground">
          Juntos, os descontos de todos saem num relatório só, sem separar por pessoa.
        </p>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onMesmoAssim}>Analisar juntos</Button>
          <Button onClick={onAjustar}>Ajustar a fila</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
