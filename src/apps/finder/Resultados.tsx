/* O RELATÓRIO DO FINDER: o que a análise achou e o que fazer com isso.
 *
 * NO MOLDE DO SAGUÃO, e não no do Finder antigo. Mesmo cabeçalho das outras
 * abas, cartões translúcidos da casa, fonte e cores do tema (sem a inversão
 * que os temas claros aplicavam à tela antiga), entrada animada.
 *
 * TUDO GIRA EM TORNO DA SELEÇÃO. A pessoa marca rubricas e decide o que fazer
 * com o grupo marcado. As decisões moravam em dois lugares (uns botões no
 * meio da página, acima da lista, e um botão solto no canto da tela) e agora
 * moram numa barra só, presa ao pé do relatório: vincular ao cliente, extrair
 * a planilha e gerar a análise comercial. A barra diz o que está marcado e
 * quanto soma, e os botões que dependem da seleção ficam apagados sem ela.
 * O "selecionar todos" saiu: marcar tudo sem olhar é justamente o que a lista
 * existe para evitar.
 *
 * O que continua na tela antiga (dentro de .aw-finder-legado, com a inversão
 * dos temas claros): a janela de lançamentos da rubrica, a de mover lançamento
 * e o relatório para o cliente. Chegam aqui prontos, por prop.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion, animate } from "framer-motion";
import {
  AlertCircle, AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, Download, Eye, EyeOff,
  FileText, Link2, Loader2, Lock, RotateCcw, Unlock, UserRound, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { CabecalhoDaPagina } from "@/components/CabecalhoDaPagina";
import { LogoBradesco } from "./marcas";

const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };
const CURVA = [0.22, 1, 0.36, 1] as const;
const CARTAO = "rounded-2xl border border-white/[0.07] bg-white/[0.03]";
const ROTULO = "text-[11px] uppercase tracking-[0.14em] font-medium text-muted-foreground";

const brl = (v: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = (v: number) => Math.round(v).toLocaleString("pt-BR");

/* ═══════════════════════ tipos ═══════════════════════ */

export interface CategoriaDoFinder {
  id: string;
  label: string;
  sublabel?: string;
  descricao?: string;
  naoReembolsavel?: boolean;
}
export interface GrupoDoFinder {
  cat: CategoriaDoFinder;
  items: { valor: number; data?: string; historico?: string }[];
}
export interface MotivoDeAnulacao { id: string; label: string; sub: string }
/** O que a revisão por código e o auditor deixaram (reviewer.js). */
export interface RevisaoDoFinder {
  autoRejected?: { tx: { data: string; valor: number; categoryId?: string }; reasons: string[]; score: number }[];
  autoRecovered?: { data: string; valor: number; historico?: string }[];
  suspicious?: { tx: { data: string; valor: number }; detail: string; score?: number | null }[];
  missing?: unknown[];
  needsHumanReview?: boolean;
  summary?: string;
}
/** O vincular em lote (useVincular, em vincular.jsx). */
export interface VinculoEmLote { clicar: () => void; ocupado: boolean; janela: ReactNode; dica: string }

export interface ResultadosProps {
  meta: { clientName?: string; banco?: string; agencia?: string; conta?: string; periodo?: string };
  arquivo: string;
  /** o cliente do contexto (modo cliente); nulo no Finder solto */
  clienteNome: string | null;
  grupos: GrupoDoFinder[];
  anuladas: Record<string, { motivo: string; doComercial?: boolean } | undefined>;
  motivos: MotivoDeAnulacao[];
  vinculados: Map<string, number>;
  baixadas: Set<string>;
  selecionadas: Set<string>;
  onAlternar: (catId: string) => void;
  onAbrir: (g: GrupoDoFinder) => void;
  onCadeado: (g: GrupoDoFinder) => void;
  totalValor: number;
  totalOcorrencias: number;
  revisao: RevisaoDoFinder | null;
  revisaoConferida: boolean;
  onConferir: () => void;
  titularesMisturados: string[] | null;
  // a barra de decisão
  vinculo: VinculoEmLote;
  onExtrair: () => void;
  extraindo: boolean;
  /** o botão da análise comercial, quando a página tem um (Finder solto) */
  acaoComercial?: ReactNode;
  // nova análise
  confirmandoNova: boolean;
  onPedirNova: () => void;
  onCancelarNova: () => void;
  onConfirmarNova: () => void;
  // o cadeado
  pedindoMotivo: CategoriaDoFinder | null;
  onMotivo: (catId: string, motivo: string) => void;
  onFecharMotivo: () => void;
  liberando: CategoriaDoFinder | null;
  onLiberar: (catId: string) => void;
  onFecharLiberar: () => void;
  // o relatório para o cliente (tela antiga)
  relatorioAberto: boolean;
  onAlternarRelatorio: () => void;
  relatorio: ReactNode;
}

/* ═══════════════════════ peças ═══════════════════════ */

/** O número que sobe até o valor, em vez de saltar (e desce quando uma rubrica sai da ação). */
function Numero({ valor, formatar, className }: { valor: number; formatar: (v: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduzir = useReducedMotion();
  const anterior = useRef(reduzir ? valor : 0);
  useEffect(() => {
    if (reduzir || !ref.current) {
      if (ref.current) ref.current.textContent = formatar(valor);
      anterior.current = valor;
      return;
    }
    const c = animate(anterior.current, valor, {
      duration: 0.8, ease: CURVA,
      onUpdate: (v) => { if (ref.current) ref.current.textContent = formatar(v); },
    });
    anterior.current = valor;
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, reduzir]);
  return <span ref={ref} className={cn("tabular-nums", className)}>{formatar(anterior.current)}</span>;
}

function Etiqueta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-white/[0.07]", className)}>
      {children}
    </span>
  );
}

/** Um aviso da casa: ícone, título e texto, na cor do caso. */
function Aviso({ cor, icone, titulo, children, acao }: {
  cor: "ambar" | "verde" | "laranja"; icone: ReactNode; titulo: ReactNode; children?: ReactNode; acao?: ReactNode;
}) {
  const tom = {
    ambar: "bg-amber-400/[0.06] ring-amber-400/25",
    verde: "bg-emerald-500/[0.06] ring-emerald-500/25",
    laranja: "bg-orange-400/[0.06] ring-orange-400/30",
  }[cor];
  const icTom = { ambar: "bg-amber-400/10 text-amber-400", verde: "bg-emerald-500/10 text-emerald-400", laranja: "bg-orange-400/10 text-orange-400" }[cor];
  return (
    <div className={cn("rounded-2xl px-4 py-3.5 ring-1 ring-inset", tom)}>
      <div className="flex items-start gap-3">
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-xl", icTom)}>{icone}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{titulo}</p>
          {children && <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{children}</div>}
        </div>
        {acao}
      </div>
    </div>
  );
}

/* ═══════════════════════ o relatório ═══════════════════════ */

export function ResultadosFinder(p: ResultadosProps) {
  const { meta, grupos, selecionadas } = p;
  const marcadas = grupos.filter((g) => selecionadas.has(g.cat.id));
  const somaMarcadas = marcadas.reduce((s, g) => s + g.items.reduce((t, i) => t + (Number(i.valor) || 0), 0), 0);
  const lancMarcados = marcadas.reduce((s, g) => s + g.items.length, 0);
  const nAnuladas = Object.keys(p.anuladas).filter((k) => p.anuladas[k]).length;
  const temInvest = grupos.some((g) => g.cat.naoReembolsavel);
  const misturados = p.titularesMisturados && p.titularesMisturados.length > 1 ? p.titularesMisturados : null;

  const etiquetas = [
    meta.agencia ? `Ag. ${meta.agencia}` : null,
    meta.conta ? `Cta. ${meta.conta}` : null,
    meta.periodo && meta.periodo !== "—" ? meta.periodo : null,
  ].filter(Boolean) as string[];

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex min-h-full w-full flex-col gap-6 px-3 pt-3 sm:px-6 sm:pt-6">
        <CabecalhoDaPagina
          titulo="Finder"
          subtitulo={p.clienteNome
            ? <>Relatório dos extratos de <strong className="text-foreground font-medium">{p.clienteNome}</strong>. O que for vinculado vai para o perfil dele.</>
            : "Relatório de descontos indevidos. Marque as rubricas e decida o que fazer com elas."}
          acoes={
            <Button variant="outline" onClick={p.onPedirNova} className="gap-1.5">
              <RotateCcw className="h-4 w-4" /> Nova análise
            </Button>
          }
        />

        {/* ── A FICHA: de quem é, de onde veio e quanto dá ── */}
        <motion.section className={cn(CARTAO, "overflow-hidden")}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: CURVA, delay: 0.05 }}>
          <div className="flex items-start gap-4 p-4 sm:p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
              {misturados ? <Users className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={ROTULO}>Relatório de análise · descontos indevidos</p>
              <h2 className="mt-1 break-words text-xl font-semibold tracking-tight sm:text-2xl">{meta.clientName}</h2>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <Etiqueta><LogoBradesco className="h-3 w-3 text-foreground" /> {meta.banco || "Bradesco"}</Etiqueta>
                {etiquetas.map((t) => <Etiqueta key={t}>{t}</Etiqueta>)}
                {p.arquivo && <Etiqueta className="max-w-full"><FileText className="h-3 w-3 shrink-0" /><span className="truncate">{p.arquivo}</span></Etiqueta>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 divide-y divide-white/[0.06] border-t border-white/[0.06] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="px-4 py-4 sm:px-5">
              <p className={ROTULO}>Valor total a restituir</p>
              <Numero valor={p.totalValor} formatar={brl} className="mt-1.5 block text-2xl font-semibold tracking-tight text-primary sm:text-3xl" />
              <p className="mt-1 text-xs text-muted-foreground">sujeito à devolução com correção legal</p>
            </div>
            <div className="px-4 py-4 sm:px-5">
              <p className={ROTULO}>Ocorrências detectadas</p>
              <Numero valor={p.totalOcorrencias} formatar={inteiro} className="mt-1.5 block text-2xl font-semibold tracking-tight sm:text-3xl" />
              <p className="mt-1 text-xs text-muted-foreground">descontos irregulares</p>
            </div>
            <div className="px-4 py-4 sm:px-5">
              <p className={ROTULO}>Categorias de irregularidade</p>
              <Numero valor={grupos.length} formatar={inteiro} className="mt-1.5 block text-2xl font-semibold tracking-tight sm:text-3xl" />
              <p className="mt-1 text-xs text-muted-foreground">tipologias distintas identificadas</p>
            </div>
          </div>
        </motion.section>

        {/* ── OS AVISOS DA ANÁLISE ── */}
        {(misturados || temCorrecoes(p.revisao) || (p.revisao?.needsHumanReview)) && (
          <motion.div className="space-y-3"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: CURVA, delay: 0.1 }}>
            {misturados && (
              <Aviso cor="ambar" icone={<Users className="h-4 w-4" />} titulo="Análise com titulares misturados">
                Este relatório consolida extratos de <strong className="text-foreground">{misturados.join(" e ")}</strong>.
                Os descontos NÃO estão separados por pessoa: confira a origem de cada lançamento antes de usar em petição.
              </Aviso>
            )}
            {temCorrecoes(p.revisao) && <AutoCorrecao revisao={p.revisao!} />}
            <AnimatePresence initial={false}>
              {p.revisao?.needsHumanReview && !p.revisaoConferida && (
                <motion.div key="conferir" exit={{ opacity: 0, height: 0, marginTop: 0 }} transition={MOLA} className="overflow-hidden">
                  <RevisaoManual revisao={p.revisao} onConferir={p.onConferir} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ── AS RUBRICAS ── */}
        {grupos.length === 0 ? (
          <motion.div className={cn(CARTAO, "px-6 py-12 text-center")}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: CURVA, delay: 0.1 }}>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-medium">Nenhum desconto irregular identificado</p>
            <p className="mt-1 text-xs text-muted-foreground">Não foram encontradas rubricas suspeitas no documento analisado.</p>
          </motion.div>
        ) : (
          <section className="space-y-3">
            <div>
              <p className={ROTULO}>Rubricas <span className="ml-1 tabular-nums text-foreground/70">{grupos.length}</span></p>
              <p className="mt-1 text-xs text-muted-foreground">
                Marque as que vão para o cliente ou para a planilha. Clique numa rubrica para ver os lançamentos, com data, valor e fundamentação jurídica.
              </p>
            </div>
            <div className={cn(CARTAO, "divide-y divide-white/[0.05] overflow-hidden")}>
              {grupos.map((g, i) => (
                <LinhaDaRubrica key={g.cat.id} grupo={g} ordem={i}
                  selecionada={selecionadas.has(g.cat.id)}
                  anulada={p.anuladas[g.cat.id]?.motivo || null}
                  rotuloDoMotivo={p.motivos.find((m) => m.id === p.anuladas[g.cat.id]?.motivo)?.label}
                  vinculadas={p.vinculados.get(g.cat.label) || 0}
                  baixada={p.baixadas.has(g.cat.id)}
                  onAlternar={p.onAlternar} onAbrir={p.onAbrir} onCadeado={p.onCadeado} />
              ))}
            </div>

            <div className="space-y-2 pt-1">
              <AnimatePresence initial={false}>
                {nAnuladas > 0 && (
                  <motion.div key="anuladas" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} transition={MOLA} className="overflow-hidden">
                    <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-400/90">
                      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        <strong className="font-medium">
                          {nAnuladas} rubrica{nAnuladas > 1 ? "s" : ""} marcada{nAnuladas > 1 ? "s" : ""} como não ajuizáve{nAnuladas > 1 ? "is" : "l"}.
                        </strong>{" "}
                        Ficam fora dos totais, da planilha e das filas do pré-protocolo. Clique no cadeado da rubrica pra cancelar a inviabilidade.
                      </span>
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
              {temInvest && (
                <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-400/90">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong className="font-medium">Invest Fácil: prática abusiva identificada.</strong>{" "}
                    Os valores destacados em amarelo NÃO são para reembolso direto (o dinheiro retorna ao cliente). A irregularidade está na
                    prática em si: o banco aplica os recursos do cliente sem rendimento real, em benefício próprio. Documentar como fundamento
                    adicional na ação.
                  </span>
                </p>
              )}
            </div>
          </section>
        )}

        {/* ── O RELATÓRIO PARA O CLIENTE ── */}
        {grupos.length > 0 && (
          <section>
            <div className="flex justify-center">
              <Button variant="outline" onClick={p.onAlternarRelatorio}
                className={cn("gap-2 rounded-xl", p.relatorioAberto && "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary")}>
                {p.relatorioAberto ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {p.relatorioAberto ? "Ocultar relatório" : "Ver relatório para o cliente"}
              </Button>
            </div>
            <AnimatePresence initial={false}>
              {p.relatorioAberto && (
                <motion.div key="relatorio" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.45, ease: CURVA }} className="overflow-hidden">
                  {p.relatorio}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}

        {/* ── A BARRA DE DECISÃO ──
            Presa ao pé da área que rola: fica sempre à mão, e quando o
            relatório é curto ela desce até o fim da tela (mt-auto). O degradê
            atrás dela é o que deixa a lista passar por baixo sem cortar seco. */}
        {grupos.length > 0 && (
          <div className="pointer-events-none sticky bottom-0 z-20 -mx-3 mt-auto bg-gradient-to-t from-background via-background/85 to-transparent px-3 pb-3 pt-8 sm:-mx-6 sm:px-6 sm:pb-5">
            <motion.div layout
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...MOLA, delay: 0.25 }}
              className="pointer-events-auto mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-2xl border border-white/[0.08] bg-card/95 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl">
              <div className="whitespace-nowrap px-2 py-0.5">
                <AnimatePresence mode="popLayout" initial={false}>
                  {marcadas.length > 0 ? (
                    <motion.div key="marcadas" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18, ease: CURVA }}>
                      <p className="text-sm font-medium">
                        <span className="tabular-nums">{marcadas.length}</span> {marcadas.length === 1 ? "rubrica marcada" : "rubricas marcadas"}
                      </p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {brl(somaMarcadas)} · {lancMarcados} {lancMarcados === 1 ? "lançamento" : "lançamentos"}
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div key="nada" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18, ease: CURVA }}>
                      <p className="text-sm text-foreground/80">Marque as rubricas</p>
                      <p className="text-xs text-muted-foreground">para vincular ao cliente ou extrair a planilha</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant={p.acaoComercial ? "outline" : "default"} className="gap-1.5"
                  disabled={marcadas.length === 0 || p.vinculo.ocupado} onClick={p.vinculo.clicar}
                  title={marcadas.length ? p.vinculo.dica : "Marque ao menos uma rubrica"}>
                  {p.vinculo.ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  {p.vinculo.ocupado ? "Vinculando…" : "Vincular análise"}
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5"
                  disabled={marcadas.length === 0 || p.extraindo} onClick={p.onExtrair}
                  title={marcadas.length ? "Baixa a planilha das rubricas marcadas" : "Marque ao menos uma rubrica"}>
                  {p.extraindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {p.extraindo ? "Gerando…" : "Extrair planilha"}
                </Button>
                {p.acaoComercial && (
                  <>
                    <span aria-hidden className="mx-0.5 hidden h-6 w-px bg-white/[0.08] sm:block" />
                    {p.acaoComercial}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
        {/* sem a barra, o fim da página precisa do respiro que ela daria */}
        {grupos.length === 0 && <div className="pb-3 sm:pb-6" />}
      </div>

      {p.vinculo.janela}
      <Janelas {...p} />
    </div>
  );
}

/* ─────────────── a linha da rubrica ─────────────── */

function LinhaDaRubrica({ grupo, ordem, selecionada, anulada, rotuloDoMotivo, vinculadas, baixada, onAlternar, onAbrir, onCadeado }: {
  grupo: GrupoDoFinder; ordem: number; selecionada: boolean; anulada: string | null; rotuloDoMotivo?: string;
  vinculadas: number; baixada: boolean;
  onAlternar: (id: string) => void; onAbrir: (g: GrupoDoFinder) => void; onCadeado: (g: GrupoDoFinder) => void;
}) {
  const { cat, items } = grupo;
  const total = items.reduce((s, i) => s + (Number(i.valor) || 0), 0);
  const aviso = !!cat.naoReembolsavel || !!anulada;
  /* Anulada não abre a janela de lançamentos nem entra na seleção, como antes. */
  const abrir = anulada ? undefined : () => onAbrir(grupo);
  const tecla = (e: KeyboardEvent) => {
    if (abrir && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrir(); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: CURVA, delay: 0.12 + Math.min(ordem, 12) * 0.05 }}
      role={abrir ? "button" : undefined} tabIndex={abrir ? 0 : undefined}
      aria-label={abrir ? `Ver os lançamentos de ${cat.label}` : undefined}
      onClick={abrir} onKeyDown={tecla}
      className={cn(
        "group relative flex items-center gap-3 px-3 py-3.5 outline-none transition-colors sm:gap-4 sm:px-5",
        abrir ? "cursor-pointer hover:bg-white/[0.03] focus-visible:bg-white/[0.04]" : "cursor-default",
        selecionada && "bg-primary/[0.06] hover:bg-primary/[0.08]",
      )}>
      {/* o fio da seleção, na borda esquerda */}
      <AnimatePresence initial={false}>
        {selecionada && (
          <motion.span key="fio" aria-hidden className="absolute inset-y-0 left-0 w-0.5 origin-center bg-primary"
            initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} exit={{ scaleY: 0 }} transition={MOLA} />
        )}
      </AnimatePresence>

      {/* a caixa de marcar, com área de toque maior que o desenho */}
      <button type="button" role="checkbox" aria-checked={selecionada} aria-label={`Marcar ${cat.label}`}
        disabled={!!anulada} title={anulada ? "Não ajuizável: fica fora da seleção" : undefined}
        onClick={(e) => { e.stopPropagation(); if (!anulada) onAlternar(cat.id); }}
        className="-m-2 shrink-0 p-2 disabled:cursor-not-allowed">
        <span className={cn(
          "grid h-5 w-5 place-items-center rounded-[6px] border transition-colors",
          selecionada ? "border-primary bg-primary text-primary-foreground" : "border-white/[0.18] bg-white/[0.03] group-hover:border-primary/50",
          anulada && "opacity-35",
        )}>
          <AnimatePresence initial={false}>
            {selecionada && (
              <motion.span key="v" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={MOLA}>
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </button>

      <span className={cn("hidden h-10 w-10 shrink-0 place-items-center rounded-xl sm:grid",
        aviso ? "bg-amber-400/10 text-amber-400" : "bg-primary/10 text-primary")}>
        {anulada ? <Lock className="h-4 w-4" /> : cat.naoReembolsavel ? <AlertTriangle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("truncate text-sm font-medium", anulada && "text-muted-foreground line-through decoration-amber-400/60 decoration-2")}>
            {cat.label}
          </span>
          {/* JÁ VINCULADA a este cliente, com a contagem quando foi mais de uma vez */}
          {vinculadas > 0 && (
            <span title={vinculadas > 1 ? `Vinculado ${vinculadas} vezes a este cliente` : "Vinculado ao cliente"}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/25">
              <Link2 className="h-3 w-3" />{vinculadas > 1 ? `${vinculadas}x` : "vinculada"}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{anulada ? (rotuloDoMotivo || anulada) : cat.sublabel}</p>
      </div>

      <div className="hidden shrink-0 items-center gap-1.5 md:flex">
        {anulada && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-400 ring-1 ring-inset ring-amber-400/30">
            <Lock className="h-3 w-3" /> Não ajuizável
          </span>
        )}
        {baixada && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/25">
            <Check className="h-3 w-3" strokeWidth={3} /> Baixada
          </span>
        )}
        <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground ring-1 ring-inset ring-white/[0.07]">
          {items.length} ocorr.
        </span>
      </div>

      <div className="shrink-0 text-right">
        <p className={cn("text-base font-semibold tabular-nums tracking-tight sm:text-lg",
          anulada ? "text-amber-400/80 line-through decoration-amber-400/60" : cat.naoReembolsavel && "text-amber-400")}>
          {brl(total)}
        </p>
        {cat.naoReembolsavel && !anulada && <p className="text-[10px] font-medium uppercase tracking-wide text-amber-400">Não reembolsável</p>}
        {anulada && <p className="text-[10px] font-medium uppercase tracking-wide text-amber-400">Fora da ação</p>}
        {!aviso && <p className="text-[11px] tabular-nums text-muted-foreground md:hidden">{items.length} ocorr.</p>}
      </div>

      {/* O CADEADO: marcar ou cancelar a inviabilidade */}
      <button type="button"
        onClick={(e) => { e.stopPropagation(); onCadeado(grupo); }}
        title={anulada ? "Cancelar inviabilidade" : "Marcar como não ajuizável (cliente já entrou com essa ação / não quer ajuizar)"}
        aria-label={anulada ? `Cancelar inviabilidade de ${cat.label}` : `Marcar ${cat.label} como não ajuizável`}
        className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors",
          anulada ? "bg-amber-400/10 text-amber-400 hover:bg-amber-400/20" : "text-muted-foreground/60 hover:bg-amber-400/10 hover:text-amber-400")}>
        {anulada ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
      </button>

      <ChevronRight aria-hidden className={cn("hidden h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground sm:block",
        anulada && "invisible")} />
    </motion.div>
  );
}

/* ─────────────── os avisos da revisão ─────────────── */

function temCorrecoes(r: RevisaoDoFinder | null): boolean {
  return !!r && ((r.autoRejected?.length || 0) > 0 || (r.autoRecovered?.length || 0) > 0);
}

/** O que a revisão corrigiu sozinha. O resumo fica à vista; a lista, a um clique. */
function AutoCorrecao({ revisao }: { revisao: RevisaoDoFinder }) {
  const [aberto, setAberto] = useState(false);
  const rej = revisao.autoRejected || [];
  const rec = revisao.autoRecovered || [];
  return (
    <div className="rounded-2xl bg-emerald-500/[0.06] ring-1 ring-inset ring-emerald-500/25">
      <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">O AW Finder ajustou inconsistências automaticamente</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{revisao.summary || "Revisão limpa."}</span>
        </span>
        <span className="mt-1 inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <span className="hidden sm:inline">{aberto ? "ocultar" : "ver detalhes"}</span>
          <motion.span animate={{ rotate: aberto ? 180 : 0 }} transition={MOLA} className="inline-flex"><ChevronDown className="h-4 w-4" /></motion.span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div key="lista" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={MOLA} className="overflow-hidden">
            <div className="space-y-3 px-4 pb-4 sm:pl-[3.75rem]">
              {rej.length > 0 && (
                <ListaDaRevisao titulo={`Falsos positivos removidos (${rej.length})`} resto={rej.length - 5} restoTexto="remoção(ões) adicional(is)">
                  {rej.slice(0, 5).map((r, i) => (
                    <li key={i}><strong className="font-medium text-emerald-400">{r.tx.data} · R$ {r.tx.valor.toFixed(2)} · {r.tx.categoryId}</strong>: {r.reasons.join("; ")} (score {r.score})</li>
                  ))}
                </ListaDaRevisao>
              )}
              {rec.length > 0 && (
                <ListaDaRevisao titulo={`Descontos recuperados (${rec.length})`} resto={rec.length - 5} restoTexto="recuperação(ões) adicional(is)">
                  {rec.slice(0, 5).map((m, i) => (
                    <li key={i}><strong className="font-medium text-emerald-400">{m.data} · R$ {m.valor.toFixed(2)}</strong>: recuperado da row "{(m.historico || "").slice(0, 80)}"</li>
                  ))}
                </ListaDaRevisao>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ListaDaRevisao({ titulo, children, resto, restoTexto, cor = "verde" }: {
  titulo: string; children: ReactNode; resto: number; restoTexto: string; cor?: "verde" | "vermelho";
}) {
  return (
    <div>
      <p className={cn("text-[11px] font-medium uppercase tracking-[0.12em]", cor === "verde" ? "text-emerald-400" : "text-red-400")}>{titulo}</p>
      <ul className={cn("mt-1.5 space-y-1 border-l-2 pl-3 text-xs leading-relaxed text-foreground/85", cor === "verde" ? "border-emerald-500/30" : "border-red-500/30")}>
        {children}
      </ul>
      {resto > 0 && <p className="mt-1 text-[11px] italic text-muted-foreground">+ {resto} {restoTexto}</p>}
    </div>
  );
}

/** O que a revisão não teve sinal para decidir: a pessoa confere. */
function RevisaoManual({ revisao, onConferir }: { revisao: RevisaoDoFinder; onConferir: () => void }) {
  const sus = revisao.suspicious || [];
  return (
    <div className="rounded-2xl bg-orange-400/[0.06] px-4 py-3.5 ring-1 ring-inset ring-orange-400/30">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-orange-400/10 text-orange-400">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Revisão manual recomendada</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Itens com baixa confiança não foram corrigidos automaticamente. O Finder detectou inconsistência mas não tem sinais
            suficientes pra decidir. Confira manualmente antes de gerar a peça.
          </p>
          {sus.length > 0 && (
            <div className="mt-3">
              <ListaDaRevisao cor="vermelho" titulo={`Possíveis falsos positivos (${sus.length})`} resto={sus.length - 5}
                restoTexto="suspeito(s) adicional(is). Verifique no extrato.">
                {sus.slice(0, 5).map((s, i) => (
                  <li key={i}><strong className="font-medium text-red-400">{s.tx.data} · R$ {s.tx.valor.toFixed(2)}</strong>: {s.detail}{s.score != null ? ` (score ${s.score})` : ""}</li>
                ))}
              </ListaDaRevisao>
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <Button size="sm" variant="outline" onClick={onConferir}
              className="border-orange-400/40 text-orange-400 hover:bg-orange-400/10 hover:text-orange-400">
              <Check className="mr-1.5 h-4 w-4" /> Conferi manualmente, continuar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── as janelas de confirmação ─────────────── */

function Janelas(p: ResultadosProps) {
  const anuladaLiberando = p.liberando ? p.anuladas[p.liberando.id] : undefined;
  const motivoLiberando = p.motivos.find((m) => m.id === anuladaLiberando?.motivo)?.label || "sem motivo";
  return (
    <>
      {/* nova análise */}
      <AlertDialog open={p.confirmandoNova} onOpenChange={(v) => { if (!v) p.onCancelarNova(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Começar uma nova análise?</AlertDialogTitle>
            <AlertDialogDescription>O relatório atual será descartado e você voltará à tela inicial.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={p.onConfirmarNova} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Sim, nova análise
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* o motivo da inviabilidade */}
      <Dialog open={!!p.pedindoMotivo} onOpenChange={(v) => { if (!v) p.onFecharMotivo(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-400/10 text-amber-400"><Lock className="h-4 w-4" /></span>
              Marcar como não ajuizável
            </DialogTitle>
            <DialogDescription>
              Por que <strong className="text-amber-400 font-medium">{p.pedindoMotivo?.label}</strong> não entra na ação? A rubrica sai dos
              totais, da planilha e das filas do pré-protocolo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {p.motivos.map((m, i) => (
              <motion.button key={m.id} type="button" onClick={() => p.pedindoMotivo && p.onMotivo(p.pedindoMotivo.id, m.id)}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: CURVA, delay: i * 0.05 }}
                className="w-full rounded-xl border border-amber-400/20 bg-amber-400/[0.04] px-4 py-3 text-left transition-colors hover:border-amber-400/60 hover:bg-amber-400/10">
                <span className="block text-sm font-medium">{m.label}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{m.sub}</span>
              </motion.button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={p.onFecharMotivo}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* liberar de volta */}
      <AlertDialog open={!!p.liberando} onOpenChange={(v) => { if (!v) p.onFecharLiberar(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar inviabilidade?</AlertDialogTitle>
            <AlertDialogDescription>
              Apesar do motivo sinalizado (<strong className="text-foreground font-medium">{motivoLiberando}</strong>), a rubrica{" "}
              <strong className="text-amber-400 font-medium">{p.liberando?.label}</strong> voltará a contar na ação, nos totais e na planilha.
              {anuladaLiberando?.doComercial && <> Ela veio bloqueada da análise comercial, então a liberação também fica gravada na ficha do cliente.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => p.liberando && p.onLiberar(p.liberando.id)}>Sim, liberar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
