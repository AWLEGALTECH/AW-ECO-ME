// Lista de processos: busca, filtro por coluna, fixar, abrir e excluir.
//
// Vive aqui, e não dentro da página de Processos, porque a mesma lista aparece
// em dois lugares — a visão geral e a ficha de um cliente — e "o mesmo design"
// só continua sendo o mesmo se for literalmente o mesmo componente. Duplicar
// significaria que a próxima coluna nova entra num lugar e some no outro.
//
// A diferença entre os dois usos é uma coluna: na ficha do cliente todos os
// processos são dele, então a coluna Cliente vira ruído e sai.

import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, Eye, Trash2, X, FileText, Gavel, ExternalLink } from "lucide-react";
import { ColunaFiltro } from "@/components/ColunaFiltro";
import { PinButton } from "@/components/PinButton";

const EASE = [0.22, 1, 0.36, 1] as const;
const MotionRow = motion(TableRow);

export interface ProcessoDaLista {
  id: string;
  numero_processo: string;
  materia: string | null;
  data_ultimo_andamento: string | null;
  fase_processual: string | null;
  valor_causa: number | null;
  comarca_uf: string | null;
  fixado_geral: boolean;
  clientes?: { nome: string } | null;
}

export const fmtBRL = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
export const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

// Ordem de acontecimento processual (1º grau → recursal → cumprimento → estados).
// Serve pra que o filtro da coluna Fase liste os status na ordem em que
// acontecem, e não em ordem alfabética, que embaralharia o caminho do processo.
const STATUS_ORDEM = [
  "AG. DISTRIBUIÇÃO", "AG. DECISÃO INICIAL", "AG. EMENDA À INICIAL",
  "AUDIÊNCIA DESIGNADA", "COMPARECR AO FÓRUM", "AG. CONTESTAÇÃO", "AG. RÉPLICA",
  "AG. DECISÃO PROVAS", "AG. MANIFESTAÇÃO", "AG. MOV CONCLUSO DECISÃO",
  "AG. MOV CONCLUSO SENTENÇA", "AG. SENTENÇA", "AG. RECURSO INOMINADO",
  "AG. CONTRARRAZOES", "AG. REMESSA AO 2º GRAU", "AG. DISTRIBUIÇÃO 2º GRAU",
  "AG. DESPACHO INICIAL 2º GRAU", "AG. MANDADO SEGURANÇA", "AG. TJ SENTENÇA",
  "AG. TJ ACÓRDÃO", "AG. ACÓRDÃO", "AG. PAGAMENTO VOLUNTÁRIO",
  "AG. EXPEDIÇÃO ALVARÁ", "AG. DECISÃO PENHORA",
  "EM TRATATIVA DE ACORDO", "AG. PAGAMENTO ACORDO", "ARQUIVADO ACORDO",
  "AG. REAJUIZAMENTO", "REAJUIZAR", "SUSPENSO", "ARQUIVADO", "Inicial",
];
export const ordemStatus = (s: string) => {
  const i = STATUS_ORDEM.indexOf(s);
  return i === -1 ? 999 : i;
};

const COLS = [
  { key: "numero", label: "Nº Processo" },
  { key: "cliente", label: "Cliente" },
  { key: "materia", label: "Matéria" },
  { key: "fase", label: "Fase" },
  { key: "comarca", label: "Comarca/UF" },
  { key: "andamento", label: "Últ. Andamento" },
  { key: "valor", label: "Valor" },
] as const;
export type ColKey = typeof COLS[number]["key"];

export function ProcessosLista({
  processos,
  meusPins,
  onTogglePin,
  onTogglePinGeral,
  onExcluido,
  mostrarCliente = true,
  colFiltros,
  setColFiltros,
  filtrosExtras,
  onLimparExtras,
  antesDaLista,
  vazio = "Nenhum processo encontrado.",
}: {
  processos: ProcessoDaLista[];
  meusPins: Set<string>;
  onTogglePin: (id: string) => void;
  onTogglePinGeral: (id: string, atual: boolean) => void;
  onExcluido: () => void;
  /** Some na ficha do cliente: lá todos os processos são da mesma pessoa. */
  mostrarCliente?: boolean;
  colFiltros: Record<string, string[]>;
  setColFiltros: (f: Record<string, string[]>) => void;
  /** Filtros vindos de fora (deep-link do dashboard) só para o botão de limpar. */
  filtrosExtras?: boolean;
  onLimparExtras?: () => void;
  /** Bloco que entra entre os chips e a lista (os Fixados, na visão geral). */
  antesDaLista?: ReactNode;
  vazio?: string;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const colunas = useMemo(
    () => COLS.filter((c) => mostrarCliente || c.key !== "cliente"),
    [mostrarCliente],
  );

  const colVal: Record<ColKey, (p: ProcessoDaLista) => string> = useMemo(() => ({
    numero: (p) => p.numero_processo,
    cliente: (p) => p.clientes?.nome ?? "—",
    materia: (p) => p.materia ?? "—",
    fase: (p) => p.fase_processual ?? "—",
    comarca: (p) => p.comarca_uf ?? "—",
    andamento: (p) => fmtDate(p.data_ultimo_andamento),
    valor: (p) => fmtBRL(p.valor_causa),
  }), []);

  const opcoesCol = useMemo(() => {
    const out = {} as Record<ColKey, string[]>;
    colunas.forEach((c) => {
      const set = new Set<string>();
      processos.forEach((p) => set.add(colVal[c.key](p)));
      const arr = Array.from(set);
      arr.sort((a, b) => c.key === "fase" ? ordemStatus(a) - ordemStatus(b) : a.localeCompare(b, "pt-BR"));
      out[c.key] = arr;
    });
    return out;
  }, [processos, colVal, colunas]);

  const setCol = (key: ColKey, vals: string[]) => {
    const n = { ...colFiltros };
    if (vals.length) n[key] = vals; else delete n[key];
    setColFiltros(n);
  };

  const filtered = useMemo(() => processos.filter((p) => {
    for (const c of colunas) {
      const sel = colFiltros[c.key];
      if (sel?.length && !sel.includes(colVal[c.key](p))) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      if (!p.numero_processo.toLowerCase().includes(s)
        && !(p.clientes?.nome ?? "").toLowerCase().includes(s)
        && !(p.materia ?? "").toLowerCase().includes(s)) return false;
    }
    return true;
  }), [processos, colFiltros, colVal, search, colunas]);

  const valorTotal = useMemo(() => filtered.reduce((s, p) => s + (Number(p.valor_causa) || 0), 0), [filtered]);

  const nColFiltros = Object.values(colFiltros).filter((v) => v.length).length;
  const hasFilters = !!(nColFiltros || search || filtrosExtras);
  const limparTudo = () => { setColFiltros({}); setSearch(""); onLimparExtras?.(); };

  const excluir = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("processos").delete().eq("id", deleteId);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Processo removido");
    setDeleteId(null);
    onExcluido();
  };

  // Cabeçalho de coluna com o filtro estilo planilha colado no rótulo.
  const Cabecalho = ({ chave, label, className }: { chave: ColKey; label: string; className?: string }) => (
    <TableHead className={className}>
      <span className="inline-flex items-center">{label}
        <ColunaFiltro label={label} options={opcoesCol[chave]} selected={colFiltros[chave] ?? []} onChange={(v) => setCol(chave, v)} />
      </span>
    </TableHead>
  );

  return (
    <>
      {/* ── Chips de contexto da lista ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE, delay: 0.15 }}
        className="flex items-center gap-3 flex-wrap"
      >
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5">
          <span className="text-sm font-medium">{filtered.length}</span>
          <span className="text-sm text-muted-foreground">de {processos.length}</span>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5">
          <Gavel className="h-3.5 w-3.5 text-primary/70" />
          <span className="text-sm text-muted-foreground">Total causa:</span>
          <span className="text-sm font-medium">{fmtBRL(valorTotal)}</span>
        </div>
        {hasFilters && (
          <Button variant="outline" size="sm" onClick={limparTudo} className="gap-2">
            <X className="h-3.5 w-3.5" />Limpar filtros{nColFiltros ? ` (${nColFiltros})` : ""}
          </Button>
        )}
      </motion.div>

      {antesDaLista}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE, delay: 0.2 }}>
        <Card>
          <CardHeader>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={mostrarCliente ? "Buscar por nº, cliente ou matéria..." : "Buscar por nº ou matéria..."}
                value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10"
              />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <Cabecalho chave="numero" label="Nº Processo" />
                  {mostrarCliente && <Cabecalho chave="cliente" label="Cliente" />}
                  <Cabecalho chave="materia" label="Matéria" className="hidden md:table-cell" />
                  <Cabecalho chave="fase" label="Fase" />
                  <Cabecalho chave="comarca" label="Comarca/UF" className="hidden lg:table-cell" />
                  <Cabecalho chave="andamento" label="Últ. Andamento" className="hidden lg:table-cell" />
                  <Cabecalho chave="valor" label="Valor" className="text-right" />
                  <TableHead className="w-16">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p, i) => (
                  <MotionRow
                    key={p.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 14) * 0.02 }}
                    className="cursor-pointer transition-colors hover:bg-primary/[0.05]"
                    onClick={() => navigate(`/processos/${p.id}`)}
                  >
                    <TableCell className="font-mono text-xs">
                      <span className="inline-flex items-center gap-3 group">
                        <span className="h-11 w-11 shrink-0 rounded-full bg-primary/15 ring-1 ring-primary/30 inline-flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                          <FileText className="h-5 w-5 text-primary" />
                        </span>
                        {p.numero_processo}
                        {/* Abrir em outra guia sem perder o filtro montado aqui.
                            É um <a> de verdade, e não um navigate: assim o
                            ctrl+clique, o clique do meio e o "abrir em nova
                            janela" do botão direito também funcionam. O
                            stopPropagation impede que a linha navegue junto na
                            guia atual, que era o que se queria evitar. */}
                        <a
                          href={`/processos/${p.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Abrir em outra guia"
                          aria-label={`Abrir o processo ${p.numero_processo} em outra guia`}
                          // Sempre visível, só discreto. Escondê-lo até o hover
                          // seria esconder justamente a saída que se pediu pra
                          // existir — e o group ficava no span, não na linha,
                          // então passar o mouse pela linha nem o revelava.
                          className="shrink-0 rounded-md p-1 text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </span>
                    </TableCell>
                    {mostrarCliente && <TableCell className="font-medium">{p.clientes?.nome ?? "—"}</TableCell>}
                    <TableCell className="hidden md:table-cell text-muted-foreground">{p.materia || "—"}</TableCell>
                    <TableCell>{p.fase_processual ? <Badge variant="secondary" className="text-[10px]">{p.fase_processual}</Badge> : "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">{p.comarca_uf || "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">{fmtDate(p.data_ultimo_andamento)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(p.valor_causa)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <PinButton
                          size="sm"
                          fixadoPessoal={meusPins.has(p.id)}
                          fixadoGeral={p.fixado_geral}
                          onTogglePessoal={() => onTogglePin(p.id)}
                          onToggleGeral={() => onTogglePinGeral(p.id, p.fixado_geral)}
                        />
                        <Button size="icon" variant="ghost" onClick={() => navigate(`/processos/${p.id}`)}><Eye className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(p.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </TableCell>
                  </MotionRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={mostrarCliente ? 8 : 7} className="text-center text-muted-foreground py-8">{vazio}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </motion.div>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluir} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Fixar processo (pin pessoal e pin geral). Mora aqui junto da lista porque as
// duas telas que a usam precisam exatamente do mesmo par de ações.
export function usePins(userId: string | null) {
  const [meusPins, setMeusPins] = useState<Set<string>>(new Set());

  const carregarPins = async () => {
    const { data } = await supabase.from("processo_fixados").select("processo_id");
    if (data) setMeusPins(new Set(data.map((d: { processo_id: string }) => d.processo_id)));
  };

  const togglePinPessoal = async (id: string) => {
    if (meusPins.has(id)) {
      setMeusPins((prev) => { const n = new Set(prev); n.delete(id); return n; });
      await supabase.from("processo_fixados").delete().eq("processo_id", id);
    } else {
      if (!userId) { toast.error("Faça login para fixar."); return; }
      setMeusPins((prev) => new Set(prev).add(id));
      await supabase.from("processo_fixados").insert({ user_id: userId, processo_id: id });
    }
  };

  return { meusPins, carregarPins, togglePinPessoal };
}
