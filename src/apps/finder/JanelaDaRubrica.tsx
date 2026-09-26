/* A JANELA DA RUBRICA: os lançamentos de um desconto, um por um.
 *
 * NO MOLDE DO SAGUÃO E DO RELATÓRIO. Era a janela do Finder antigo (brilho em
 * volta, degradê no topo, letras espaçadas em tudo, cores escritas à mão e
 * invertidas nos temas claros). Agora é uma janela do AW: fundo e borda do
 * tema, uma cor de destaque só, entrada animada.
 *
 * TUDO O QUE ELA FAZIA, ELA FAZ: vincular esta rubrica ao cliente, extrair a
 * planilha dela, ver o fundamento jurídico, tirar um lançamento (falso
 * positivo), mover um lançamento para outra rubrica e adicionar à mão um
 * desconto que a leitura perdeu. Esc fecha.
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, AlertTriangle, ArrowLeftRight, Check, Download, Link2, Loader2, Plus, Scale, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useVincular } from "./vincular.jsx";

const MOLA = { type: "spring" as const, stiffness: 380, damping: 34 };
const CURVA = [0.22, 1, 0.36, 1] as const;
const ROTULO = "text-[11px] uppercase tracking-[0.14em] font-medium text-muted-foreground";

const brl = (v: number) => (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface LancamentoDoFinder {
  data: string;
  valor: number;
  historico: string;
  _manual?: boolean;
  _recovered?: boolean;
  _movedFrom?: string;
}
export interface CategoriaDaJanela {
  id: string;
  label: string;
  sublabel?: string;
  descricao?: string;
  fundamento?: string;
  acao?: string;
  naoReembolsavel?: boolean;
}
export interface GrupoDaJanela { cat: CategoriaDaJanela; items: LancamentoDoFinder[] }
/** O que a planilha de uma rubrica devolve para ser vinculada (vincular.jsx). */
export interface PlanilhaDaRubrica {
  blob: Blob; fileName: string; totalValor: number; qtdItens: number; dataInicio: string | null; dataFim: string | null;
}

export interface JanelaDaRubricaProps {
  /** a rubrica aberta; nulo, a janela fecha */
  grupo: GrupoDaJanela | null;
  onFechar: () => void;
  /** todas as rubricas que o Finder conhece, para mover um lançamento */
  categorias: CategoriaDaJanela[];
  // vincular e extrair
  ponte: unknown;
  bancoMeta: { banco?: string; agencia?: string; conta?: string };
  onVinculado: (rotulos: string[]) => void;
  planilha: (cat: CategoriaDaJanela, items: LancamentoDoFinder[]) => Promise<PlanilhaDaRubrica>;
  extrair: (cat: CategoriaDaJanela, items: LancamentoDoFinder[]) => Promise<void>;
  // os lançamentos
  onExcluir: (catId: string, item: LancamentoDoFinder) => void;
  onAdicionar: (catId: string, item: LancamentoDoFinder) => void;
  onMover: (deCatId: string, item: LancamentoDoFinder, paraCatId: string) => void;
}

export function JanelaDaRubrica(p: JanelaDaRubricaProps) {
  /* A última rubrica aberta fica guardada: a janela precisa dela para sair
     animada depois que a página já soltou a rubrica. */
  const [ultimo, setUltimo] = useState<GrupoDaJanela | null>(p.grupo);
  useEffect(() => { if (p.grupo) setUltimo(p.grupo); }, [p.grupo]);
  const aberta = !!p.grupo;
  const g = p.grupo || ultimo;

  return (
    <Dialog open={aberta} onOpenChange={(v) => { if (!v) p.onFechar(); }}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        {g && <Conteudo {...p} grupo={g} />}
      </DialogContent>
    </Dialog>
  );
}

function Conteudo(p: JanelaDaRubricaProps & { grupo: GrupoDaJanela }) {
  const { cat, items } = p.grupo;
  const total = items.reduce((s, i) => s + (Number(i.valor) || 0), 0);
  const [extraindo, setExtraindo] = useState(false);
  const [movendo, setMovendo] = useState<LancamentoDoFinder | null>(null);
  const vinculo = useVincular({
    ponte: p.ponte,
    desconto: cat.label,
    bancoMeta: p.bancoMeta,
    onVinculado: p.onVinculado,
    produceBlob: () => p.planilha(cat, items),
  });

  const extrair = async () => {
    setExtraindo(true);
    try { await p.extrair(cat, items); } finally { setExtraindo(false); }
  };

  /* Chave estável por lançamento: dois lançamentos iguais no mesmo dia
     existem (tarifa cobrada duas vezes), então o número da repetição entra. */
  const chaves = useMemo(() => {
    const vistos = new Map<string, number>();
    return items.map((it) => {
      const base = `${it.data}|${(Number(it.valor) || 0).toFixed(2)}|${(it.historico || "").slice(0, 40)}`;
      const n = (vistos.get(base) || 0) + 1;
      vistos.set(base, n);
      return `${base}#${n}`;
    });
  }, [items]);

  return (
    <>
      {/* ── CABEÇALHO ── */}
      {/* Um bloco só dentro do cabeçalho: o espaçamento próprio do
          DialogHeader passaria por cima da margem entre título e total. */}
      <DialogHeader className="border-b border-white/[0.06] px-5 pb-4 pt-5 text-left sm:px-6">
       <div className="space-y-4">
        <div className="flex items-start gap-3 pr-8">
          <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl",
            cat.naoReembolsavel ? "bg-amber-400/10 text-amber-400" : "bg-primary/10 text-primary")}>
            {cat.naoReembolsavel ? <AlertTriangle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-semibold tracking-tight">{cat.label}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs">
              {items.length} lançamento{items.length !== 1 ? "s" : ""}{cat.fundamento ? ` · ${cat.fundamento}` : ""}
            </DialogDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className={ROTULO}>Total identificado</p>
            <p className={cn("mt-1 text-2xl font-semibold tabular-nums tracking-tight", cat.naoReembolsavel && "text-amber-400")}>{brl(total)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={vinculo.clicar} disabled={vinculo.ocupado} title={vinculo.dica}>
              {vinculo.ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {vinculo.ocupado ? "Vinculando…" : "Vincular análise"}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={extrair} disabled={extraindo}>
              {extraindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {extraindo ? "Gerando…" : "Extrair planilha"}
            </Button>
          </div>
        </div>
       </div>
      </DialogHeader>

      {/* ── CORPO, que rola ── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
        {cat.acao && (
          <motion.div className="mb-4 rounded-xl border-l-2 border-primary/60 bg-white/[0.03] px-4 py-3"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: CURVA }}>
            <p className={cn(ROTULO, "flex items-center gap-1.5")}><Scale className="h-3.5 w-3.5" /> Fundamento jurídico</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{cat.acao}</p>
          </motion.div>
        )}

        {/* os lançamentos */}
        <div className="hidden grid-cols-[6.5rem_1fr_auto_4.5rem] gap-3 border-b border-white/[0.06] px-2 pb-2 sm:grid">
          <span className={ROTULO}>Data</span>
          <span className={ROTULO}>Rubrica detectada</span>
          <span className={cn(ROTULO, "text-right")}>Valor</span>
          <span />
        </div>
        <ul className="divide-y divide-white/[0.05]">
          <AnimatePresence initial={false}>
            {items.map((item, i) => (
              <motion.li key={chaves[i]} layout
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 16, transition: { duration: 0.18 } }}
                transition={{ ...MOLA, delay: Math.min(i, 10) * 0.03 }}
                className={cn("grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-lg px-2 py-2.5 transition-colors hover:bg-white/[0.03] sm:grid-cols-[6.5rem_1fr_auto_4.5rem]",
                  item._manual && "bg-emerald-500/[0.04]", item._recovered && !item._manual && "bg-orange-400/[0.04]")}>
                <span className="text-xs tabular-nums text-muted-foreground sm:text-[13px]">{item.data}</span>
                <span className="order-3 col-span-2 min-w-0 sm:order-none sm:col-span-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                    {cat.descricao}
                    {item._recovered && (
                      <span title="Detectado pela camada de revisão a partir do texto raw do PDF"
                        className="inline-flex items-center gap-1 rounded-full bg-orange-400/10 px-1.5 py-0.5 text-[10.5px] font-medium text-orange-400 ring-1 ring-inset ring-orange-400/25">
                        <Check className="h-3 w-3" strokeWidth={3} /> Auto-detectado
                      </span>
                    )}
                    {item._manual && (
                      <span title={item._movedFrom ? "Movido de outra rubrica" : "Adicionado manualmente pelo usuário"}
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-emerald-400 ring-1 ring-inset ring-emerald-500/25">
                        <Plus className="h-3 w-3" /> {item._movedFrom ? "Movido" : "Manual"}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={item.historico}>{item.historico}</span>
                </span>
                <span className="text-right text-sm font-semibold tabular-nums">{brl(item.valor)}</span>
                <span className="order-4 col-span-2 flex justify-end gap-1 sm:order-none sm:col-span-1">
                  <button type="button" onClick={() => setMovendo(item)} title="Mover para outra categoria"
                    aria-label={`Mover o lançamento de ${item.data} para outra rubrica`}
                    className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-primary/10 hover:text-primary">
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => p.onExcluir(cat.id, item)} title="Excluir este lançamento (falso positivo)"
                    aria-label={`Excluir o lançamento de ${item.data}`}
                    className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        {items.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">Nenhum lançamento nesta rubrica.</p>
        )}

        <AdicionarManual cat={cat} onAdicionar={p.onAdicionar} />
      </div>

      {vinculo.janela}
      <MoverLancamento item={movendo} deCat={cat} categorias={p.categorias}
        onFechar={() => setMovendo(null)}
        onEscolher={(paraId) => { if (movendo) p.onMover(cat.id, movendo, paraId); setMovendo(null); }} />
    </>
  );
}

/* ─────────────── adicionar à mão ─────────────── */

function AdicionarManual({ cat, onAdicionar }: { cat: CategoriaDaJanela; onAdicionar: JanelaDaRubricaProps["onAdicionar"] }) {
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState("");
  const [valor, setValor] = useState("");
  const [historico, setHistorico] = useState("");
  const [erro, setErro] = useState("");
  const limpar = () => { setAberto(false); setData(""); setValor(""); setHistorico(""); setErro(""); };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    // Aceita data DD/MM/AAAA e valor com vírgula ou ponto
    const dataOk = /^\d{2}\/\d{2}\/\d{4}$/.test(data.trim());
    const num = parseFloat(valor.replace(/\./g, "").replace(",", "."));
    if (!dataOk) { setErro("A data vai no formato DD/MM/AAAA."); return; }
    if (!num || num <= 0) { setErro("O valor precisa ser maior que zero."); return; }
    onAdicionar(cat.id, {
      data: data.trim(),
      valor: Math.round(num * 100) / 100,
      historico: historico.trim() || `[adicionado manualmente] ${cat.descricao}`,
      _manual: true,
    });
    limpar();
  };

  return (
    <div className="mt-4 border-t border-dashed border-white/[0.08] pt-4">
      <AnimatePresence mode="wait" initial={false}>
        {!aberto ? (
          <motion.div key="botao" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: CURVA }}>
            <Button type="button" size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => setAberto(true)}>
              <Plus className="h-4 w-4" /> Adicionar desconto manualmente
            </Button>
          </motion.div>
        ) : (
          <motion.form key="form" onSubmit={enviar}
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            transition={MOLA} className="overflow-hidden">
            <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.07]">
              <p className={ROTULO}>Adicionar desconto manualmente: {cat.descricao}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[8rem_8rem_1fr]">
                <Input autoFocus value={data} onChange={(e) => { setData(e.target.value); setErro(""); }} placeholder="DD/MM/AAAA" inputMode="numeric" aria-label="Data" />
                <Input value={valor} onChange={(e) => { setValor(e.target.value); setErro(""); }} placeholder="50,00" inputMode="decimal" aria-label="Valor" className="tabular-nums" />
                <Input value={historico} onChange={(e) => setHistorico(e.target.value)} placeholder="Histórico (ex: PAGTO BRADESCO VIDA E PREVIDÊNCIA)" aria-label="Histórico" className="col-span-2 sm:col-span-1" />
              </div>
              <AnimatePresence initial={false}>
                {erro && (
                  <motion.p key="erro" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    transition={MOLA} className="overflow-hidden pt-2 text-xs text-destructive">{erro}</motion.p>
                )}
              </AnimatePresence>
              <div className="mt-3 flex justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={limpar}>Cancelar</Button>
                <Button type="submit" size="sm">Adicionar</Button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────── mover para outra rubrica ─────────────── */

function MoverLancamento({ item, deCat, categorias, onFechar, onEscolher }: {
  item: LancamentoDoFinder | null; deCat: CategoriaDaJanela; categorias: CategoriaDaJanela[];
  onFechar: () => void; onEscolher: (catId: string) => void;
}) {
  const [ultimo, setUltimo] = useState(item);
  useEffect(() => { if (item) setUltimo(item); }, [item]);
  const it = item || ultimo;
  const historico = it?.historico || "";
  return (
    <Dialog open={!!item} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="flex max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="space-y-1 border-b border-white/[0.06] px-5 pb-4 pt-5 text-left">
          <p className={ROTULO}>Mover lançamento</p>
          <DialogTitle className="text-base">Para qual categoria?</DialogTitle>
          <DialogDescription className="text-xs">
            {it ? <>{it.data} · {brl(it.valor)} · {historico.slice(0, 80)}{historico.length > 80 ? "..." : ""}</> : null}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto p-4 sm:grid-cols-2">
          {categorias.filter((c) => c.id !== deCat.id).map((c, i) => (
            <motion.button key={c.id} type="button" onClick={() => onEscolher(c.id)}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: CURVA, delay: Math.min(i, 12) * 0.02 }}
              className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5 text-left transition-colors hover:border-primary/50 hover:bg-primary/[0.06]">
              <span className="block text-[13px] font-medium">{c.label}</span>
              <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">{c.sublabel || c.descricao}</span>
            </motion.button>
          ))}
        </div>
        <div className="flex justify-end border-t border-white/[0.06] px-5 py-3">
          <Button variant="outline" size="sm" onClick={onFechar}>Cancelar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
