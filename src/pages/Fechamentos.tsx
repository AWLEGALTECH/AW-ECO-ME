import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { appConfig } from "@/config/app-config";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Coins, Plus, User, CalendarDays, AlertTriangle, FolderUp, Trash2, Hash, Loader2,
} from "lucide-react";
import { RUBRICAS_FECHAMENTO, RUBRICA_LABEL, VALOR_ACAO_PADRAO } from "@/lib/rubricasFechamento";

interface Fechamento {
  id: string;
  data: string;
  cliente_nome: string;
  cliente_id: string | null;
  rubricas: string[] | null;
  pendencia: boolean;
  pasta_drive: boolean;
  responsavel: string | null;
  valor_acao: number | null;
}

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const mesLabel = (mes: string | null | undefined) => {
  if (!mes) return "—";
  const [y, m] = mes.split("-").map(Number);
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[m - 1]}/${y}`;
};

export default function Fechamentos() {
  useEffect(() => { document.title = `Fechamentos — ${appConfig.name}`; }, []);
  const { user } = useAuth();
  const [mesSel, setMesSel] = useState<string | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);

  const fechRes = useQuery({
    queryKey: ["fechamentos"],
    queryFn: async (): Promise<Fechamento[]> => {
      const { data, error } = await supabase
        .from("fechamentos" as any)
        .select("id, data, cliente_nome, cliente_id, rubricas, pendencia, pasta_drive, responsavel, valor_acao")
        .order("data", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Fechamento[];
    },
    refetchInterval: 60_000,
  });

  const mesesRes = useQuery({
    queryKey: ["fechamentos_meses"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.from("fechamentos_meses" as any).select("mes, bonus");
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const r of (data || []) as any[]) out[r.mes] = Number(r.bonus) || 0;
      return out;
    },
  });

  // Clientes pra autocomplete (nome -> id)
  const clientesRes = useQuery({
    queryKey: ["fechamentos_clientes_lookup"],
    queryFn: async (): Promise<{ id: string; nome: string }[]> => {
      const { data, error } = await supabase.from("clientes").select("id, nome").order("nome");
      if (error) throw error;
      return (data || []) as any;
    },
  });

  const fechamentos = fechRes.data || [];

  // Meses disponíveis (dos dados), mais novos primeiro
  const meses = useMemo(() => {
    const s = new Set<string>();
    for (const f of fechamentos) if (f.data) s.add(f.data.slice(0, 7));
    return [...s].sort().reverse();
  }, [fechamentos]);

  // Mês efetivo: usa a seleção do usuário se válida, senão o mês mais recente.
  // Derivado (não estado) pra evitar o render-com-null no primeiro frame após
  // os dados chegarem — quando mesSel ainda não foi definido pelo effect abaixo.
  const mesAtivo = (mesSel && meses.includes(mesSel)) ? mesSel : (meses[0] ?? null);

  // Mantém o estado em sincronia (pro destaque do botão / cliques subsequentes)
  useEffect(() => {
    if (!mesSel && meses.length) setMesSel(meses[0]);
  }, [meses, mesSel]);

  const doMes = useMemo(
    () => fechamentos.filter((f) => (f.data || "").slice(0, 7) === mesAtivo),
    [fechamentos, mesAtivo],
  );

  const totalAcoes = useMemo(
    () => doMes.reduce((acc, f) => acc + (f.rubricas?.length || 0), 0),
    [doMes],
  );
  const base = totalAcoes * VALOR_ACAO_PADRAO;
  const bonus = (mesAtivo && mesesRes.data?.[mesAtivo]) || 0;
  const total = base + bonus;

  // Quebra por rubrica (só as com contagem > 0), desc
  const porRubrica = useMemo(() => {
    const cont: Record<string, number> = {};
    for (const f of doMes) for (const r of f.rubricas || []) cont[r] = (cont[r] || 0) + 1;
    return Object.entries(cont).sort((a, b) => b[1] - a[1]);
  }, [doMes]);

  const refetchAll = () => {
    fechRes.refetch();
    mesesRes.refetch();
  };

  const salvarBonus = async (valor: number) => {
    if (!mesAtivo) return;
    const { error } = await supabase
      .from("fechamentos_meses" as any)
      .upsert({ mes: mesAtivo, bonus: valor, updated_at: new Date().toISOString() }, { onConflict: "mes" });
    if (error) { toast.error("Erro ao salvar bônus: " + error.message); return; }
    toast.success("Bônus do mês atualizado");
    mesesRes.refetch();
  };

  const excluir = async (f: Fechamento) => {
    if (!window.confirm(`Excluir o fechamento de ${f.cliente_nome} (${fmtData(f.data)})?`)) return;
    const { error } = await supabase.from("fechamentos" as any).delete().eq("id", f.id);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    toast.success("Fechamento excluído");
    refetchAll();
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" /> Fechamentos &amp; Comissões
          </h1>
          <p className="text-sm text-muted-foreground">Leads fechados pela equipe e cálculo de comissão por mês.</p>
        </div>
        <Button onClick={() => setNovoOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo fechamento
        </Button>
      </div>

      {/* Seletor de mês */}
      {meses.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {meses.map((m) => (
            <button
              key={m}
              onClick={() => setMesSel(m)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                mesAtivo === m
                  ? "bg-primary/15 text-primary border-primary/30"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {mesLabel(m)}
            </button>
          ))}
        </div>
      )}

      {fechRes.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : meses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhum fechamento ainda. Clique em <strong>Novo fechamento</strong> pra começar.
        </div>
      ) : (
        <>
          {/* Cards resumo */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <ResumoCard label="Leads fechados" valor={String(doMes.length)} icon={User} />
            <ResumoCard label="Total de ações" valor={String(totalAcoes)} icon={Hash} />
            <ResumoCard label={`Base (R$ ${VALOR_ACAO_PADRAO}/ação)`} valor={brl(base)} icon={Coins} />
            <div className="rounded-xl border border-border bg-card/40 p-3">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Bônus do mês</p>
              <BonusInput key={mesAtivo || "x"} valor={bonus} onSave={salvarBonus} />
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-3 flex flex-col justify-center">
              <p className="text-[10px] uppercase tracking-[0.15em] text-primary/80 mb-1">Comissão total</p>
              <p className="text-lg font-bold text-primary tabular-nums">{brl(total)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Lista de fechamentos */}
            <div className="lg:col-span-2 space-y-2">
              <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground px-1">
                Fechamentos de {mesLabel(mesAtivo)} ({doMes.length})
              </h2>
              {doMes.map((f) => (
                <div key={f.id} className="rounded-xl border border-border bg-card/40 p-3 group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{f.cliente_nome}</span>
                        {f.cliente_id && (
                          <a href={`/clientes/${f.cliente_id}`} className="text-[10px] text-primary hover:underline">ver ficha</a>
                        )}
                        {f.pendencia && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-full px-1.5 py-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" /> pendência
                          </span>
                        )}
                        {f.pasta_drive && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 rounded-full px-1.5 py-0.5">
                            <FolderUp className="h-2.5 w-2.5" /> no Drive
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" /> {fmtData(f.data)}
                        <span className="text-muted-foreground/50">·</span>
                        {f.rubricas?.length || 0} {(f.rubricas?.length || 0) === 1 ? "ação" : "ações"}
                      </div>
                    </div>
                    <button
                      onClick={() => excluir(f)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/60 hover:text-red-400 shrink-0"
                      title="Excluir fechamento"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {(f.rubricas?.length || 0) > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {f.rubricas!.map((r) => (
                        <span key={r} className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted/30 text-foreground/80" title={RUBRICA_LABEL[r] || r}>
                          {r}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Quebra por rubrica */}
            <div className="space-y-2">
              <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground px-1">Ações por rubrica</h2>
              <div className="rounded-xl border border-border bg-card/40 divide-y divide-border/60">
                {porRubrica.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 italic p-3">Sem ações neste mês.</p>
                ) : porRubrica.map(([r, n]) => (
                  <div key={r} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="text-xs truncate" title={RUBRICA_LABEL[r] || r}>{RUBRICA_LABEL[r] || r}</span>
                    <span className="text-xs tabular-nums shrink-0">
                      <strong>{n}</strong> <span className="text-muted-foreground">· {brl(n * VALOR_ACAO_PADRAO)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <NovoFechamentoDialog
        open={novoOpen}
        onClose={() => setNovoOpen(false)}
        clientes={clientesRes.data || []}
        userId={user?.id || null}
        onSaved={() => { setNovoOpen(false); refetchAll(); }}
      />
    </div>
  );
}

function ResumoCard({ label, valor, icon: Icon }: { label: string; valor: string; icon: any }) {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-3">
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-1 flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </p>
      <p className="text-lg font-bold tabular-nums">{valor}</p>
    </div>
  );
}

function BonusInput({ valor, onSave }: { valor: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(valor ? String(valor) : "");
  return (
    <Input
      value={v}
      onChange={(e) => setV(e.target.value.replace(/[^\d.,]/g, ""))}
      onBlur={() => {
        const n = parseFloat(v.replace(/\./g, "").replace(",", ".")) || 0;
        if (n !== valor) onSave(n);
      }}
      placeholder="R$ 0,00"
      inputMode="decimal"
      className="h-8 text-base font-bold tabular-nums px-2"
    />
  );
}

function NovoFechamentoDialog({
  open, onClose, clientes, userId, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  clientes: { id: string; nome: string }[];
  userId: string | null;
  onSaved: () => void;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(hoje);
  const [clienteNome, setClienteNome] = useState("");
  const [rubricas, setRubricas] = useState<Set<string>>(new Set());
  const [pendencia, setPendencia] = useState(false);
  const [pastaDrive, setPastaDrive] = useState(true);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setData(hoje); setClienteNome(""); setRubricas(new Set());
    setPendencia(false); setPastaDrive(true);
  };

  const toggle = (k: string) => setRubricas((prev) => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  const salvar = async () => {
    if (!clienteNome.trim()) { toast.error("Informe o cliente."); return; }
    if (!data) { toast.error("Informe a data."); return; }
    setSaving(true);
    // Casa o nome digitado com um cliente existente (case-insensitive)
    const match = clientes.find((c) => c.nome.trim().toUpperCase() === clienteNome.trim().toUpperCase());
    const { error } = await supabase.from("fechamentos" as any).insert({
      data,
      cliente_nome: clienteNome.trim(),
      cliente_id: match?.id || null,
      rubricas: [...rubricas],
      pendencia,
      pasta_drive: pastaDrive,
      responsavel: "Adria",
      created_by: userId,
    });
    setSaving(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success("Fechamento registrado");
    reset();
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setTimeout(reset, 200); } }}>
      <DialogContent className="sm:max-w-2xl max-h-[88dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Coins className="h-5 w-5 text-primary" /> Novo fechamento</DialogTitle>
          <DialogDescription>Marque as rubricas/ações fechadas com este cliente. Cada uma vale R$ {VALOR_ACAO_PADRAO}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div>
              <Label>Cliente</Label>
              <Input
                list="fech-clientes"
                value={clienteNome}
                onChange={(e) => setClienteNome(e.target.value)}
                placeholder="Nome do cliente"
              />
              <datalist id="fech-clientes">
                {clientes.map((c) => <option key={c.id} value={c.nome} />)}
              </datalist>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={pastaDrive} onCheckedChange={() => setPastaDrive((v) => !v)} /> Pasta no Drive
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={pendencia} onCheckedChange={() => setPendencia((v) => !v)} /> Tem pendência
            </label>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>Rubricas / ações fechadas</Label>
              <span className="text-[11px] text-muted-foreground">{rubricas.size} selecionada(s)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[40vh] overflow-y-auto pr-1 rounded-lg border border-border p-2">
              {RUBRICAS_FECHAMENTO.map((r) => {
                const on = rubricas.has(r.key);
                return (
                  <label key={r.key} className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-sm transition-colors ${on ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                    <Checkbox checked={on} onCheckedChange={() => toggle(r.key)} />
                    <span className="truncate">{r.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { onClose(); setTimeout(reset, 200); }} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>
            {saving ? "Salvando…" : `Salvar (${rubricas.size} ${rubricas.size === 1 ? "ação" : "ações"})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
