import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bell, Zap, Users, PenLine, ShieldCheck, Check, Plus, RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

interface ConfigRow {
  tipo: string;
  label: string;
  ativo: boolean;
  titulo_template: string | null;
  corpo_template: string | null;
  variaveis: Record<string, string> | null;
}
interface ProfileRow { id: string; nome: string | null; email: string | null; role: "admin" | "user"; approved: boolean; }
interface PrefRow { user_id: string; tipo: string; permitido: boolean; }

export default function AdminNotificacoes() {
  const qc = useQueryClient();

  const cfgQ = useQuery({
    queryKey: ["notificacao_config"],
    queryFn: async (): Promise<ConfigRow[]> => {
      const { data, error } = await (supabase.from("notificacao_config" as any) as any)
        .select("tipo,label,ativo,titulo_template,corpo_template,variaveis")
        .order("label");
      if (error) throw error;
      return data || [];
    },
  });

  const profQ = useQuery({
    queryKey: ["notif-profiles"],
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase
        .from("profiles").select("id,nome,email,role,approved")
        .eq("approved", true).order("nome");
      if (error) throw error;
      return (data || []) as ProfileRow[];
    },
  });

  const prefsQ = useQuery({
    queryKey: ["notif-prefs-all"],
    queryFn: async (): Promise<PrefRow[]> => {
      const { data, error } = await (supabase.from("notificacao_user_prefs" as any) as any)
        .select("user_id,tipo,permitido");
      if (error) throw error;
      return (data || []) as PrefRow[];
    },
  });

  const admins = useMemo(() => (profQ.data || []).filter(p => p.role === "admin"), [profQ.data]);
  const membros = useMemo(() => (profQ.data || []).filter(p => p.role !== "admin"), [profQ.data]);
  const permitidoSet = useMemo(() => {
    const s = new Set<string>();
    for (const r of prefsQ.data || []) if (r.permitido) s.add(`${r.tipo}::${r.user_id}`);
    return s;
  }, [prefsQ.data]);

  const patchAtivo = async (tipo: string, valor: boolean) => {
    qc.setQueryData<ConfigRow[]>(["notificacao_config"], (old) =>
      (old || []).map((r) => (r.tipo === tipo ? { ...r, ativo: valor } : r)));
    const { error } = await (supabase.from("notificacao_config" as any) as any)
      .update({ ativo: valor }).eq("tipo", tipo);
    if (error) { toast.error("Erro ao salvar: " + error.message); qc.invalidateQueries({ queryKey: ["notificacao_config"] }); }
    else toast.success(valor ? "Notificação ligada" : "Notificação desligada", { duration: 1200 });
  };

  const toggleRecebe = async (tipo: string, userId: string, on: boolean) => {
    const key = `${tipo}::${userId}`;
    qc.setQueryData<PrefRow[]>(["notif-prefs-all"], (old) => {
      const rest = (old || []).filter(r => !(r.tipo === tipo && r.user_id === userId));
      return on ? [...rest, { user_id: userId, tipo, permitido: true }] : rest;
    });
    if (on) {
      const { error } = await (supabase.from("notificacao_user_prefs" as any) as any)
        .upsert({ user_id: userId, tipo, permitido: true }, { onConflict: "user_id,tipo" });
      if (error) toast.error(error.message);
    } else {
      const { error } = await (supabase.from("notificacao_user_prefs" as any) as any)
        .delete().eq("user_id", userId).eq("tipo", tipo);
      if (error) toast.error(error.message);
    }
    void key;
  };

  const salvarCopy = async (tipo: string, titulo: string, corpo: string) => {
    qc.setQueryData<ConfigRow[]>(["notificacao_config"], (old) =>
      (old || []).map((r) => (r.tipo === tipo ? { ...r, titulo_template: titulo, corpo_template: corpo } : r)));
    const { error } = await (supabase.from("notificacao_config" as any) as any)
      .update({ titulo_template: titulo, corpo_template: corpo }).eq("tipo", tipo);
    if (error) { toast.error("Erro ao salvar: " + error.message); return false; }
    toast.success("Copy salva");
    return true;
  };

  const isLoading = cfgQ.isLoading || profQ.isLoading || prefsQ.isLoading;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold font-display flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" /> Central de notificações
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tudo em um lugar: <strong>ligue ou desligue</strong> cada tipo, veja e ajuste
          {" "}<strong>quem recebe</strong>, e <strong>edite a copy</strong> (título e corpo). Você
          (admin) sempre recebe todas.
        </p>
      </header>

      {isLoading ? (
        <p className="text-center text-sm text-muted-foreground py-10">Carregando…</p>
      ) : (
        <div className="space-y-4">
          {(cfgQ.data || []).map((r) => (
            <NotifCard
              key={r.tipo}
              cfg={r}
              admins={admins}
              membros={membros}
              recebe={(uid) => permitidoSet.has(`${r.tipo}::${uid}`)}
              onAtivo={(v) => patchAtivo(r.tipo, v)}
              onRecebe={(uid, on) => toggleRecebe(r.tipo, uid, on)}
              onSalvarCopy={(t, c) => salvarCopy(r.tipo, t, c)}
            />
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        As notificações aparecem no sininho do topo (PC e celular) e, com o app fechado, chegam
        como push no aparelho de quem ativou. A copy que você edita aqui é a mesma no sininho e no push.
      </p>
    </div>
  );
}

function NotifCard({
  cfg, admins, membros, recebe, onAtivo, onRecebe, onSalvarCopy,
}: {
  cfg: ConfigRow;
  admins: ProfileRow[];
  membros: ProfileRow[];
  recebe: (uid: string) => boolean;
  onAtivo: (v: boolean) => void;
  onRecebe: (uid: string, on: boolean) => void;
  onSalvarCopy: (titulo: string, corpo: string) => Promise<boolean>;
}) {
  const [titulo, setTitulo] = useState(cfg.titulo_template ?? "");
  const [corpo, setCorpo] = useState(cfg.corpo_template ?? "");
  const [salvando, setSalvando] = useState(false);
  const vars = cfg.variaveis || {};
  const dirty = titulo !== (cfg.titulo_template ?? "") || corpo !== (cfg.corpo_template ?? "");

  const primeiro = (p: ProfileRow) => (p.nome || p.email || "?").trim().split(/\s+/)[0];

  const inserirVar = (k: string) => setCorpo((c) => (c.endsWith(" ") || c === "" ? c : c + " ") + `{${k}}`);

  const salvar = async () => {
    setSalvando(true);
    await onSalvarCopy(titulo.trim(), corpo);
    setSalvando(false);
  };

  return (
    <div className={`rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-md overflow-hidden ${cfg.ativo ? "" : "opacity-70"}`}>
      {/* Cabeçalho: nome + liga/desliga */}
      <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/[0.06]">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{cfg.label}</p>
          <p className="text-[11px] text-muted-foreground">
            {cfg.ativo ? "Ligada, gerando notificações" : "Desligada, nenhuma notificação é criada"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Zap className={`h-3.5 w-3.5 ${cfg.ativo ? "text-primary" : "text-muted-foreground/40"}`} />
          <Switch checked={cfg.ativo} onCheckedChange={onAtivo} />
        </div>
      </div>

      {/* Quem recebe */}
      <div className="px-5 py-4 border-b border-white/[0.06]">
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-2">
          <Users className="h-3 w-3" /> Quem recebe
        </p>
        <div className="flex flex-wrap gap-1.5">
          {admins.map((p) => (
            <span
              key={p.id}
              title="Admin recebe todas automaticamente"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-primary/12 text-primary ring-1 ring-primary/25"
            >
              <ShieldCheck className="h-3 w-3" /> {primeiro(p)}
            </span>
          ))}
          {membros.map((p) => {
            const on = recebe(p.id);
            return (
              <button
                key={p.id}
                onClick={() => onRecebe(p.id, !on)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs ring-1 transition-colors ${
                  on
                    ? "bg-emerald-500/12 text-emerald-400 ring-emerald-500/30"
                    : "bg-white/[0.03] text-muted-foreground ring-white/10 hover:ring-white/25"
                }`}
              >
                {on ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3 opacity-60" />} {primeiro(p)}
              </button>
            );
          })}
          {membros.length === 0 && admins.length === 0 && (
            <span className="text-[11px] text-muted-foreground">Nenhum usuário aprovado ainda.</span>
          )}
        </div>
      </div>

      {/* Editar copy */}
      <div className="px-5 py-4 space-y-3">
        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          <PenLine className="h-3 w-3" /> Copy
        </p>

        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Título</label>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-primary/50"
            placeholder="Título da notificação"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Corpo</label>
          <textarea
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
            rows={Math.max(2, corpo.split("\n").length)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-primary/50 resize-y whitespace-pre-wrap"
            placeholder="Texto da notificação"
          />
        </div>

        {Object.keys(vars).length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">
              Variáveis (clique pra inserir no corpo):
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(vars).map(([k, desc]) => (
                <button
                  key={k}
                  onClick={() => inserirVar(k)}
                  title={desc}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono bg-white/[0.04] text-foreground/80 ring-1 ring-white/10 hover:ring-primary/40"
                >
                  {`{${k}}`}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          {dirty && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setTitulo(cfg.titulo_template ?? ""); setCorpo(cfg.corpo_template ?? ""); }}
              className="text-muted-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Desfazer
            </Button>
          )}
          <Button size="sm" onClick={salvar} disabled={!dirty || salvando}>
            {salvando ? "Salvando…" : "Salvar copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}
