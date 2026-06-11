import { useEffect, useRef, useState, useMemo, type RefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Link2, Lock, Unlock, Loader2, Check, ChevronsUpDown, User, FileText, Sparkles,
} from "lucide-react";

// ───────────────────────────────────────────────────────────────────────────
// Ponte eco-side sobre o Finder (iframe mesma-origem): escuta o evento
// `aw-finder:analysis-ready` que o Finder dispara, captura as rubricas, deixa
// marcar as NÃO ajuizáveis e salva uma ANÁLISE COMERCIAL **vinculada ao
// cliente** (analises_comerciais.cliente_id) — que depois alimenta a peça no
// Writer e aparece na ficha do cliente.
// ───────────────────────────────────────────────────────────────────────────

type Motivo = "cliente_nao_quer" | "ja_ajuizada";
const MOTIVO_LABEL: Record<Motivo, string> = {
  cliente_nao_quer: "Cliente não quer",
  ja_ajuizada: "Já ajuizada",
};

interface RubricaCaptada { rubrica: string; valor: number | null; bloqueada: boolean; motivo: Motivo | null; }
interface AnaliseCaptada { nome: string; cpf: string | null; rubricas: RubricaCaptada[]; fileName: string | null; }
interface ClienteOpc { id: string; nome: string; }

const fmtBRL = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function extrairNome(meta: any, fileName: string | null): string {
  const cand = meta?.titular || meta?.nome || meta?.cliente || meta?.nomeCliente || meta?.holder;
  if (cand && String(cand).trim()) return String(cand).trim();
  if (fileName) return String(fileName).replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
  return "";
}

function extrairRubricas(detail: any): RubricaCaptada[] {
  const det = detail?.rubricasDetalhadas;
  const out: RubricaCaptada[] = [];
  if (Array.isArray(det)) {
    for (const g of det) {
      const label = g?.cat?.label || g?.label || g?.rubrica || g?.nome;
      if (!label) continue;
      let valor: number | null = null;
      if (Array.isArray(g?.items)) valor = g.items.reduce((s: number, it: any) => s + (Number(it?.valor) || 0), 0) || null;
      else if (g?.total != null) valor = Number(g.total) || null;
      else if (g?.valor != null) valor = Number(g.valor) || null;
      out.push({ rubrica: String(label), valor, bloqueada: false, motivo: null });
    }
  }
  if (out.length === 0 && Array.isArray(detail?.rubricas)) {
    for (const r of detail.rubricas) {
      const label = typeof r === "string" ? r : (r?.label || r?.rubrica || r?.nome);
      if (label) out.push({ rubrica: String(label), valor: Number(r?.valor) || null, bloqueada: false, motivo: null });
    }
  }
  return out;
}

interface Props {
  iframeRef: RefObject<HTMLIFrameElement>;
  // Modo vinculado (veio da esteira/perfil): já vincula a este cliente.
  clienteId?: string | null;
  clienteNome?: string | null;
  // Só mostra o botão flutuante quando o Finder está visível na tela.
  visible?: boolean;
}

export function FinderAnaliseVinculada({ iframeRef, clienteId, clienteNome, visible = true }: Props) {
  const { user } = useAuth();
  const vinculado = !!clienteId;

  const [analise, setAnalise] = useState<AnaliseCaptada | null>(null);
  const [open, setOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [salvouId, setSalvouId] = useState<string | null>(null);
  const attachedWin = useRef<Window | null>(null);

  // Modo standalone: escolher a qual cliente vincular.
  const [clientes, setClientes] = useState<ClienteOpc[]>([]);
  const [clienteSel, setClienteSel] = useState<ClienteOpc | null>(null);
  const [comboAberto, setComboAberto] = useState(false);

  // ── captura do evento do Finder ───────────────────────────────────────────
  useEffect(() => {
    const onReady = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setAnalise({
        nome: clienteNome || extrairNome(detail?.meta, detail?.fileName || null),
        cpf: detail?.meta?.cpf || detail?.meta?.cnpj || detail?.meta?.cpfCnpj || null,
        rubricas: extrairRubricas(detail),
        fileName: detail?.fileName || null,
      });
      setSalvouId(null);
    };
    const onReset = () => { setAnalise(null); setSalvouId(null); };
    const attach = () => {
      const win = iframeRef.current?.contentWindow as Window | null;
      if (!win || win === attachedWin.current) return;
      if (attachedWin.current) {
        attachedWin.current.removeEventListener("aw-finder:analysis-ready", onReady as EventListener);
        attachedWin.current.removeEventListener("aw-finder:reset", onReset as EventListener);
      }
      win.addEventListener("aw-finder:analysis-ready", onReady as EventListener);
      win.addEventListener("aw-finder:reset", onReset as EventListener);
      attachedWin.current = win;
    };
    attach();
    const iv = setInterval(attach, 1500);
    return () => {
      clearInterval(iv);
      if (attachedWin.current) {
        attachedWin.current.removeEventListener("aw-finder:analysis-ready", onReady as EventListener);
        attachedWin.current.removeEventListener("aw-finder:reset", onReset as EventListener);
        attachedWin.current = null;
      }
    };
  }, [iframeRef, clienteNome]);

  // Carrega clientes só no modo standalone (pra poder vincular manualmente).
  useEffect(() => {
    if (vinculado || !open || clientes.length) return;
    (async () => {
      const { data } = await supabase.from("clientes").select("id, nome").order("nome", { ascending: true });
      setClientes((data || []) as ClienteOpc[]);
    })();
  }, [vinculado, open, clientes.length]);

  const toggleBloqueio = (i: number) =>
    setAnalise((a) => a && {
      ...a,
      rubricas: a.rubricas.map((r, idx) =>
        idx === i ? (r.bloqueada ? { ...r, bloqueada: false, motivo: null } : { ...r, bloqueada: true, motivo: r.motivo || "cliente_nao_quer" }) : r),
    });
  const setMotivo = (i: number, motivo: Motivo) =>
    setAnalise((a) => a && { ...a, rubricas: a.rubricas.map((r, idx) => idx === i ? { ...r, motivo } : r) });

  const nBloq = analise?.rubricas.filter((r) => r.bloqueada).length ?? 0;
  const totalGeral = useMemo(
    () => analise?.rubricas.reduce((s, r) => s + (r.valor || 0), 0) ?? 0,
    [analise],
  );

  const alvoClienteId = clienteId || clienteSel?.id || null;
  const alvoNome = clienteNome || clienteSel?.nome || analise?.nome || "";

  const salvar = async () => {
    if (!analise) return;
    if (!alvoNome.trim()) { toast.error("Defina o cliente da análise."); return; }
    setSalvando(true);
    const rubricas = analise.rubricas.map((r) => ({
      rubrica: r.rubrica, valor: r.valor, bloqueada: r.bloqueada, motivo: r.bloqueada ? r.motivo : null,
    }));
    const payload = {
      nome: alvoNome.trim(),
      cpf_cnpj: analise.cpf,
      cliente_id: alvoClienteId,
      origem: "finder",
      rubricas,
      created_by: user?.id || null,
      created_by_email: user?.email || null,
    };
    const { data, error } = await supabase
      .from("analises_comerciais" as any)
      .insert(payload as any)
      .select("id")
      .single();
    if (error) { setSalvando(false); toast.error("Erro ao salvar: " + error.message); return; }

    // Vinculada a um cliente → copia as rubricas bloqueadas pra ficha dele
    // (clientes.rubricas_bloqueadas), pra valer também na análise primária.
    if (alvoClienteId) {
      const bloqueadas = rubricas.filter((r) => r.bloqueada).map((r) => ({ rubrica: r.rubrica, motivo: r.motivo }));
      await supabase.from("clientes").update({ rubricas_bloqueadas: bloqueadas } as any).eq("id", alvoClienteId);
    }

    setSalvando(false);
    setSalvouId((data as any)?.id || "ok");
    toast.success(alvoClienteId ? "Análise vinculada ao cliente ✓" : "Análise comercial salva ✓");
  };

  if (!analise || !visible) return null;

  return (
    <>
      {/* Botão flutuante — aparece quando o Finder termina uma análise */}
      <button
        onClick={() => setOpen(true)}
        className={`fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold shadow-lg transition-all hover:brightness-110 animate-in fade-in slide-in-from-bottom-2 ${
          salvouId
            ? "bg-emerald-600 text-white shadow-emerald-600/25 hover:shadow-emerald-600/40"
            : "bg-primary text-primary-foreground shadow-primary/25 hover:shadow-primary/40"
        }`}
      >
        {salvouId ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
        {salvouId ? "Análise vinculada" : "Vincular análise"}
        {!salvouId && nBloq > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-black/15 px-1.5 text-[11px]">
            <Lock className="h-3 w-3" /> {nBloq}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Vincular análise comercial
            </DialogTitle>
            <DialogDescription>
              Marque as rubricas <strong className="text-foreground">não ajuizáveis</strong> e salve a análise
              vinculada ao cliente. Ela fica disponível pro Writer e pra análise primária.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Cliente alvo */}
            <div className="rounded-xl border border-border/70 bg-card/40 p-3">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                Cliente da análise
              </div>
              {vinculado ? (
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm font-semibold">{clienteNome}</span>
                  <Badge variant="secondary" className="ml-auto gap-1">
                    <Link2 className="h-3 w-3" /> Vinculada
                  </Badge>
                </div>
              ) : (
                <Popover open={comboAberto} onOpenChange={setComboAberto}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                      <span className={clienteSel ? "" : "text-muted-foreground"}>
                        {clienteSel ? clienteSel.nome : "Escolher cliente pra vincular…"}
                      </span>
                      <ChevronsUpDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar cliente…" />
                      <CommandList>
                        <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                        <CommandGroup>
                          {clientes.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={c.nome}
                              onSelect={() => { setClienteSel(c); setComboAberto(false); }}
                            >
                              <User className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                              {c.nome}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Rubricas */}
            <div>
              <div className="flex items-center justify-between mb-1.5 px-0.5">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Rubricas detectadas
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {analise.rubricas.length} · {nBloq} não ajuizável(is)
                </span>
              </div>
              <ScrollArea className="max-h-[42vh] rounded-xl border border-border/70">
                {analise.rubricas.length === 0 ? (
                  <p className="text-center text-[12px] text-muted-foreground py-8">Nenhuma rubrica capturada.</p>
                ) : (
                  <ul className="divide-y divide-border/50">
                    {analise.rubricas.map((r, i) => (
                      <li
                        key={i}
                        className={`flex items-center gap-2.5 px-3 py-2.5 transition-colors ${r.bloqueada ? "bg-amber-500/[0.06]" : ""}`}
                      >
                        <button
                          onClick={() => toggleBloqueio(i)}
                          className={`shrink-0 rounded-md p-1 transition-colors ${r.bloqueada ? "text-amber-500 hover:bg-amber-500/10" : "text-muted-foreground/50 hover:text-foreground hover:bg-muted"}`}
                          title={r.bloqueada ? "Liberar (volta a ser ajuizável)" : "Marcar como não ajuizável"}
                        >
                          {r.bloqueada ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                        </button>
                        <FileText className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                        <span className={`text-[13px] flex-1 min-w-0 truncate ${r.bloqueada ? "line-through decoration-amber-500/50 text-foreground/60" : ""}`}>
                          {r.rubrica}
                        </span>
                        <span className="text-[12px] tabular-nums text-muted-foreground shrink-0 w-24 text-right">
                          {fmtBRL(r.valor)}
                        </span>
                        {r.bloqueada ? (
                          <select
                            value={r.motivo || "cliente_nao_quer"}
                            onChange={(e) => setMotivo(i, e.target.value as Motivo)}
                            className="shrink-0 text-[11px] bg-background border border-amber-500/40 rounded-md px-1.5 py-1 text-amber-600 dark:text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
                          >
                            {(Object.keys(MOTIVO_LABEL) as Motivo[]).map((m) => (
                              <option key={m} value={m}>{MOTIVO_LABEL[m]}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="shrink-0 w-[104px]" />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="items-center sm:justify-between gap-3">
            <span className="text-[12px] text-muted-foreground">
              Total detectado: <strong className="text-foreground tabular-nums">{fmtBRL(totalGeral)}</strong>
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
              <Button onClick={salvar} disabled={salvando || !!salvouId || (!vinculado && !clienteSel)}>
                {salvando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  : salvouId ? <Check className="h-4 w-4 mr-1.5" />
                  : <Link2 className="h-4 w-4 mr-1.5" />}
                {salvouId ? "Vinculada" : "Vincular análise"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
