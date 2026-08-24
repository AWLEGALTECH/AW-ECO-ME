import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { MODULES, type ModuleKey } from "@/lib/modules";
import { useAuth } from "@/hooks/useAuth";
import { appConfig } from "@/config/app-config";
import {
  ShieldCheck, UserCog, RefreshCw, Mail, Trash2, MessageSquareText, Bell,
  Search, Clock, Layers, X, ArrowUpRight, CircleSlash,
} from "lucide-react";
import { SLOTS_MENSAGENS } from "@/lib/mensagensProntas";
import { AvatarUsuario } from "@/components/AvatarUsuario";
import AdminNotificacoes from "@/pages/AdminNotificacoes";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ProfileRow {
  id: string;
  email: string | null;
  nome: string | null;
  avatar_url: string | null;
  role: "admin" | "user";
  approved: boolean;
  created_at: string;
  ultimo_acesso: string | null;
  modulos: number;
}

interface AccessRow { user_id: string; module_key: string; }

// "há 27 minutos", "há 4 dias", "há 2 meses" — a mesma leitura do print de
// referência. Quem olha esta tela quer saber quem sumiu, e a distância diz
// isso mais rápido que a data.
function desdeAcesso(iso: string | null): { txt: string; frio: boolean } {
  if (!iso) return { txt: "nunca entrou", frio: true };
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return { txt: "agora mesmo", frio: false };
  if (min < 60) return { txt: `há ${min} min`, frio: false };
  const h = Math.floor(min / 60);
  if (h < 24) return { txt: h === 1 ? "há cerca de 1 hora" : `há ${h} horas`, frio: false };
  const d = Math.floor(h / 24);
  if (d < 30) return { txt: d === 1 ? "há 1 dia" : `há ${d} dias`, frio: d > 7 };
  const m = Math.floor(d / 30);
  return { txt: m === 1 ? "há 1 mês" : `há ${m} meses`, frio: true };
}

// "há 3 min" é calculado no render, então sem alguém mandar renderizar ele
// congela: a tela aberta continua dizendo 3 min meia hora depois. Este tique
// só marca a passagem do tempo — não vai ao banco.
function useRelogio(intervaloMs = 30_000) {
  const [, setTique] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTique((n) => n + 1), intervaloMs);
    return () => window.clearInterval(t);
  }, [intervaloMs]);
}

export default function AdminUsuarios() {
  useEffect(() => { document.title = `Usuários · ${appConfig.name}`; }, []);
  useRelogio();
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingTarget, setDeletingTarget] = useState<ProfileRow | null>(null);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [vista, setVista] = useState<"pessoas" | "tipos">("pessoas");

  const profilesQ = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async (): Promise<ProfileRow[]> => {
      // Passa por função: parte do que a tela mostra mora no schema auth, que
      // o cliente não lê. Ela devolve só estas colunas, e só para admin.
      const { data, error } = await supabase.rpc("fn_admin_usuarios" as any);
      if (error) throw error;
      return (data || []) as ProfileRow[];
    },
    // O último acesso é o dado mais perecível desta tela: sem reler, ela abre
    // certa e envelhece em silêncio enquanto fica aberta.
    refetchInterval: 60_000,
    staleTime: 0,
  });

  const accessQ = useQuery({
    queryKey: ["admin-access"],
    queryFn: async (): Promise<AccessRow[]> => {
      const { data, error } = await supabase
        .from("user_module_access")
        .select("user_id, module_key");
      if (error) throw error;
      return data as AccessRow[];
    },
  });

  const accessByUser = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of accessQ.data || []) {
      if (!m.has(r.user_id)) m.set(r.user_id, new Set());
      m.get(r.user_id)!.add(r.module_key);
    }
    return m;
  }, [accessQ.data]);

  const refetchAll = () => { profilesQ.refetch(); accessQ.refetch(); };
  const isLoading = profilesQ.isLoading || accessQ.isLoading;

  const lista = useMemo(() => {
    const todos = profilesQ.data || [];
    const s = busca.trim().toLowerCase();
    const filtrados = s
      ? todos.filter((p) => (p.nome ?? "").toLowerCase().includes(s) || (p.email ?? "").toLowerCase().includes(s))
      : todos;
    // Quem está esperando aprovação vem primeiro: é a única linha desta tela
    // que pede uma decisão, e ela não pode ficar no meio do bolo.
    return [...filtrados].sort((a, b) =>
      Number(a.approved) - Number(b.approved)
      || (a.nome ?? a.email ?? "").localeCompare(b.nome ?? b.email ?? ""));
  }, [profilesQ.data, busca]);

  const pendentes = (profilesQ.data || []).filter((p) => !p.approved).length;
  const usuarioAberto = (profilesQ.data || []).find((p) => p.id === aberto) || null;

  const toggleApproved = async (p: ProfileRow, next: boolean) => {
    setSavingId(p.id);
    const { error } = await supabase.from("profiles").update({ approved: next }).eq("id", p.id);
    if (error) toast.error(error.message);
    else {
      toast.success(next ? `${p.email} aprovado — libere os módulos` : `${p.email} bloqueado`);
      refetchAll();
    }
    setSavingId(null);
  };

  const removerSolicitacao = async (p: ProfileRow) => {
    setSavingId(p.id);
    const { error } = await supabase.rpc("admin_delete_pending_user" as any, { target_user_id: p.id });
    setSavingId(null);
    setDeletingTarget(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Solicitação de ${p.email} removida`);
    setAberto(null);
    refetchAll();
  };

  const toggleRole = async (p: ProfileRow) => {
    if (p.id === me?.id && p.role === "admin") {
      toast.error("Você não pode rebaixar a si mesmo.");
      return;
    }
    const next = p.role === "admin" ? "user" : "admin";
    setSavingId(p.id);
    const { error } = await supabase.from("profiles").update({ role: next }).eq("id", p.id);
    if (error) toast.error(error.message);
    else { toast.success(`${p.email} agora é ${next}`); refetchAll(); }
    setSavingId(null);
  };

  const toggleModule = async (p: ProfileRow, key: ModuleKey, on: boolean) => {
    setSavingId(p.id);
    if (on) {
      const { error } = await supabase
        .from("user_module_access")
        .upsert({ user_id: p.id, module_key: key, granted_by: me?.id || null });
      if (error) toast.error(error.message);
      else qc.setQueryData(["admin-access"], (old: AccessRow[] | undefined) =>
        [...(old || []), { user_id: p.id, module_key: key }]);
    } else {
      const { error } = await supabase
        .from("user_module_access")
        .delete()
        .eq("user_id", p.id)
        .eq("module_key", key);
      if (error) toast.error(error.message);
      else qc.setQueryData(["admin-access"], (old: AccessRow[] | undefined) =>
        (old || []).filter((r) => !(r.user_id === p.id && r.module_key === key)));
    }
    setSavingId(null);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold font-display flex items-center gap-2">
            <UserCog className="h-6 w-6 text-primary" /> Equipe
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Contas, permissões de módulo e preferências de notificação.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {vista === "pessoas" && (
            <div className="relative w-52">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou e-mail" className="pl-9 h-9" />
            </div>
          )}
          <Button variant="outline" size="sm" onClick={refetchAll}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Atualizar
          </Button>
        </div>
      </header>

      {/* As duas metades da antiga Central de notificações: por pessoa (dentro
          do painel de cada uma) e por tipo (aqui). O que era uma tela separada
          vira a segunda aba desta. */}
      <div className="inline-flex gap-1 p-1 rounded-xl border border-border bg-muted/20">
        {([
          { k: "pessoas", label: "Pessoas", n: (profilesQ.data || []).length },
          { k: "tipos", label: "Tipos de notificação", n: null },
        ] as const).map((t) => (
          <button
            key={t.k}
            onClick={() => setVista(t.k)}
            className={`px-3.5 h-8 rounded-lg text-[12.5px] font-medium transition-colors ${
              vista === t.k ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}{t.n !== null && <span className="ml-1.5 opacity-60 tabular-nums">{t.n}</span>}
          </button>
        ))}
      </div>

      {vista === "tipos" ? (
        <AdminNotificacoes embutido />
      ) : isLoading ? (
        <p className="text-center text-sm text-muted-foreground py-16">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-16">Nenhum usuário encontrado.</p>
      ) : (
        <>
          {pendentes > 0 && (
            <p className="text-[12px] text-amber-300 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              {pendentes === 1 ? "1 pessoa aguardando aprovação" : `${pendentes} pessoas aguardando aprovação`}
              {" — "}aparecem primeiro.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {lista.map((p) => (
              <CardPessoa
                key={p.id}
                p={p}
                euMesmo={p.id === me?.id}
                onAbrir={() => setAberto(p.id)}
              />
            ))}
          </div>
        </>
      )}

      <PainelPessoa
        p={usuarioAberto}
        onFechar={() => setAberto(null)}
        euMesmo={usuarioAberto?.id === me?.id}
        salvando={savingId === usuarioAberto?.id}
        modulos={usuarioAberto ? (accessByUser.get(usuarioAberto.id) ?? new Set<string>()) : new Set<string>()}
        onAprovar={(v) => usuarioAberto && toggleApproved(usuarioAberto, v)}
        onPapel={() => usuarioAberto && toggleRole(usuarioAberto)}
        onModulo={(k, v) => usuarioAberto && toggleModule(usuarioAberto, k, v)}
        onRemover={() => usuarioAberto && setDeletingTarget(usuarioAberto)}
      />

      <AlertDialog open={!!deletingTarget} onOpenChange={(o) => { if (!o) setDeletingTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover solicitação?</AlertDialogTitle>
            <AlertDialogDescription>
              O cadastro de <strong>{deletingTarget?.email}</strong> será apagado e a pessoa poderá
              se cadastrar de novo. Só vale para quem ainda não foi aprovado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); deletingTarget && removerSolicitacao(deletingTarget); }}
              className="bg-red-600 hover:bg-red-500"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// O card grande. O retrato ocupa o topo inteiro, como nas fichas de perfil de
// console: é o retrato que identifica, e o texto vem depois pra confirmar.
function CardPessoa({ p, euMesmo, onAbrir }: { p: ProfileRow; euMesmo: boolean; onAbrir: () => void }) {
  const acesso = desdeAcesso(p.ultimo_acesso);
  const nome = p.nome || p.email || "sem nome";
  return (
    <button
      onClick={onAbrir}
      className="group text-left rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden
                 transition-all hover:border-primary/40 hover:bg-white/[0.04] hover:-translate-y-0.5
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <div className="relative">
        <AvatarUsuario nome={p.nome} email={p.email} avatarUrl={p.avatar_url} tamanho="xl" className="rounded-none ring-0" />
        {/* Degradê pro nome ficar legível por cima de qualquer foto. */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
          {!p.approved ? (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-500/90 text-black">
              Aguardando
            </span>
          ) : (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-500/85 text-black">
              Ativo
            </span>
          )}
          {p.role === "admin" && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-primary/85 text-white inline-flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> Admin
            </span>
          )}
        </div>
        {euMesmo && (
          <span className="absolute top-2.5 right-2.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-white/15 text-white backdrop-blur-sm">
            você
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="text-[15px] font-semibold text-white leading-tight break-words drop-shadow">{nome}</p>
        </div>
      </div>

      <div className="p-3 space-y-1.5">
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground truncate">
          <Mail className="h-3 w-3 shrink-0 opacity-70" /> <span className="truncate">{p.email}</span>
        </p>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Layers className="h-3 w-3 shrink-0 opacity-70" />
          {p.role === "admin" ? "todos os módulos" : `${p.modulos} de ${MODULES.length} módulos`}
        </p>
        <p className={`flex items-center gap-1.5 text-[11px] ${acesso.frio ? "text-amber-300/80" : "text-muted-foreground"}`}>
          <Clock className="h-3 w-3 shrink-0 opacity-70" /> Último acesso: {acesso.txt}
        </p>
      </div>
    </button>
  );
}

// Painel da pessoa: tudo que era card empilhado vira abas aqui dentro.
function PainelPessoa({
  p, onFechar, euMesmo, salvando, modulos, onAprovar, onPapel, onModulo, onRemover,
}: {
  p: ProfileRow | null;
  onFechar: () => void;
  euMesmo: boolean;
  salvando: boolean;
  modulos: Set<string>;
  onAprovar: (v: boolean) => void;
  onPapel: () => void;
  onModulo: (k: ModuleKey, v: boolean) => void;
  onRemover: () => void;
}) {
  const [aba, setAba] = useState<"acesso" | "notificacoes" | "mensagens">("acesso");
  const chave = `${p?.id ?? ""}`;
  const [chaveInit, setChaveInit] = useState("");
  if (p && chave !== chaveInit) { setChaveInit(chave); setAba("acesso"); }
  if (!p) return null;

  const acesso = desdeAcesso(p.ultimo_acesso);
  const ehAdmin = p.role === "admin";

  return (
    <Dialog open={!!p} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[88dvh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <AvatarUsuario nome={p.nome} email={p.email} avatarUrl={p.avatar_url} tamanho="md" />
            <span className="min-w-0">
              <span className="block truncate">{p.nome || p.email}</span>
              <span className="block text-[11px] font-normal text-muted-foreground truncate">{p.email}</span>
            </span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {ehAdmin ? "Administrador" : "Membro"} · último acesso {acesso.txt}
          </DialogDescription>
        </DialogHeader>

        <div className="inline-flex gap-1 p-1 rounded-xl border border-border bg-muted/20 shrink-0 w-fit">
          {([
            { k: "acesso", label: "Acesso" },
            { k: "notificacoes", label: "Notificações" },
            { k: "mensagens", label: "Mensagens prontas" },
          ] as const).map((t) => (
            <button
              key={t.k}
              onClick={() => setAba(t.k)}
              className={`px-3 h-7 rounded-lg text-[12px] font-medium transition-colors ${
                aba === t.k ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1 py-1">
          {aba === "acesso" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/40 p-3">
                <label className="flex items-center gap-2 text-[12.5px]">
                  <Switch checked={p.approved} disabled={euMesmo || salvando} onCheckedChange={onAprovar} />
                  Aprovado
                </label>
                <Button size="sm" variant="outline" onClick={onPapel} disabled={salvando || (euMesmo && ehAdmin)}>
                  <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                  {ehAdmin ? "Rebaixar para membro" : "Promover a admin"}
                </Button>
                {!p.approved && !euMesmo && (
                  <Button size="sm" variant="ghost" onClick={onRemover} className="text-red-400 hover:text-red-300 ml-auto">
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remover solicitação
                  </Button>
                )}
              </div>

              {!p.approved ? (
                <p className="text-[12px] text-muted-foreground flex items-center gap-1.5 py-6 justify-center">
                  <CircleSlash className="h-3.5 w-3.5" /> Aprove a pessoa para liberar módulos.
                </p>
              ) : ehAdmin ? (
                <p className="text-[12px] text-muted-foreground italic">
                  Admin enxerga todos os módulos automaticamente.
                </p>
              ) : (
                <div>
                  <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-2">
                    Módulos ({modulos.size} de {MODULES.length})
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {MODULES.map((m) => {
                      const on = modulos.has(m.key);
                      return (
                        <button
                          key={m.key}
                          onClick={() => onModulo(m.key, !on)}
                          disabled={salvando}
                          className={`px-3 py-2 rounded-lg border text-[12px] text-left transition-colors ${
                            on
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border bg-card/40 text-muted-foreground hover:text-foreground hover:border-white/20"
                          }`}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {aba === "notificacoes" && <NotificacoesDoUsuario userId={p.id} isAdminRow={ehAdmin} />}
          {aba === "mensagens" && <MensagensDoUsuario userId={p.id} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Quais notificações este usuário recebe. Admin sempre recebe todas.
function NotificacoesDoUsuario({ userId, isAdminRow }: { userId: string; isAdminRow: boolean }) {
  const qc = useQueryClient();

  const cfgQ = useQuery({
    queryKey: ["notif-config-list"],
    queryFn: async (): Promise<{ tipo: string; label: string; ativo: boolean }[]> => {
      const { data, error } = await (supabase.from("notificacao_config" as any) as any)
        .select("tipo,label,ativo").order("label");
      if (error) throw error;
      return (data || []) as any;
    },
  });

  const prefsQ = useQuery({
    queryKey: ["notif-prefs", userId],
    enabled: !isAdminRow,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await (supabase.from("notificacao_user_prefs" as any) as any)
        .select("tipo,permitido").eq("user_id", userId);
      if (error) throw error;
      const m: Record<string, boolean> = {};
      for (const r of (data || []) as any[]) m[r.tipo] = r.permitido;
      return m;
    },
  });

  const toggle = async (tipo: string, on: boolean) => {
    qc.setQueryData<Record<string, boolean>>(["notif-prefs", userId], (old) => ({ ...(old || {}), [tipo]: on }));
    if (on) {
      const { error } = await (supabase.from("notificacao_user_prefs" as any) as any)
        .upsert({ user_id: userId, tipo, permitido: true }, { onConflict: "user_id,tipo" });
      if (error) toast.error(error.message);
    } else {
      const { error } = await (supabase.from("notificacao_user_prefs" as any) as any)
        .delete().eq("user_id", userId).eq("tipo", tipo);
      if (error) toast.error(error.message);
    }
  };

  if (isAdminRow) {
    return (
      <p className="text-[12px] text-muted-foreground italic py-4 flex items-center gap-1.5">
        <Bell className="h-3.5 w-3.5" /> Admin recebe todas as notificações automaticamente.
      </p>
    );
  }
  if (cfgQ.isLoading) return <p className="text-[12px] text-muted-foreground py-4">Carregando…</p>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {(cfgQ.data || []).map((c) => {
        const on = !!prefsQ.data?.[c.tipo];
        return (
          <label
            key={c.tipo}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-card/40 text-xs cursor-pointer"
          >
            <span className={c.ativo ? "" : "text-muted-foreground/60"}>
              {c.label}{!c.ativo && " (desligada)"}
            </span>
            <Switch checked={on} disabled={!c.ativo} onCheckedChange={(v) => toggle(c.tipo, v)} />
          </label>
        );
      })}
    </div>
  );
}

// Mensagens prontas do usuário, somente leitura. RLS libera pro admin.
function MensagensDoUsuario({ userId }: { userId: string }) {
  const q = useQuery({
    queryKey: ["admin-mensagens", userId],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("mensagens_prontas" as any)
        .select("chave, conteudo")
        .eq("user_id", userId);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const r of (data || []) as any[]) map[r.chave] = r.conteudo;
      return map;
    },
  });

  if (q.isLoading) return <p className="text-[12px] text-muted-foreground py-4">Carregando…</p>;
  return (
    <div className="space-y-2.5">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <MessageSquareText className="h-3.5 w-3.5" /> Somente leitura — quem edita é a própria pessoa.
      </p>
      {SLOTS_MENSAGENS.map((slot) => {
        const txt = (q.data?.[slot.chave] || "").trim();
        return (
          <div key={slot.chave} className="text-xs">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/80">
              <slot.icon className="h-3 w-3 text-primary" /> {slot.label}
            </div>
            <p className={`mt-0.5 whitespace-pre-wrap break-words rounded-md border border-border/60 bg-card/40 px-2 py-1.5 ${txt ? "" : "italic text-muted-foreground/60"}`}>
              {txt || "— vazio —"}
            </p>
          </div>
        );
      })}
    </div>
  );
}
