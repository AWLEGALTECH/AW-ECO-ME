import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MODULES, type ModuleKey } from "@/lib/modules";
import { useAuth } from "@/hooks/useAuth";
import { appConfig } from "@/config/app-config";
import { ShieldCheck, UserCog, Check, X, RefreshCw, Mail, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ProfileRow {
  id: string;
  email: string | null;
  nome: string | null;
  role: "admin" | "user";
  approved: boolean;
  created_at: string;
}

interface AccessRow { user_id: string; module_key: string; }

export default function AdminUsuarios() {
  useEffect(() => { document.title = `Usuários — ${appConfig.name}`; }, []);
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingTarget, setDeletingTarget] = useState<ProfileRow | null>(null);

  const profilesQ = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, nome, role, approved, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as ProfileRow[];
    },
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

  const toggleApproved = async (p: ProfileRow, next: boolean) => {
    setSavingId(p.id);
    const { error } = await supabase.from("profiles").update({ approved: next }).eq("id", p.id);
    if (error) toast.error(error.message);
    else {
      toast.success(next
        ? `${p.email} aprovado — libere os módulos abaixo`
        : `${p.email} bloqueado`);
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
      if (error) toast.error(error.message); else qc.setQueryData(["admin-access"], (old: AccessRow[] | undefined) =>
        [...(old || []), { user_id: p.id, module_key: key }]);
    } else {
      const { error } = await supabase
        .from("user_module_access")
        .delete()
        .eq("user_id", p.id)
        .eq("module_key", key);
      if (error) toast.error(error.message); else qc.setQueryData(["admin-access"], (old: AccessRow[] | undefined) =>
        (old || []).filter(r => !(r.user_id === p.id && r.module_key === key)));
    }
    setSavingId(null);
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <UserCog className="h-6 w-6 text-primary" />
            Usuários & Permissões
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Aprove novos cadastros e controle quais módulos cada usuário enxerga.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refetchAll} disabled={isLoading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </header>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12 text-sm">Carregando…</div>
      ) : (profilesQ.data || []).length === 0 ? (
        <div className="text-center text-muted-foreground py-12 text-sm">Nenhum usuário cadastrado ainda.</div>
      ) : (
        <div className="space-y-3">
          {(profilesQ.data || []).map(p => {
            const accessSet = accessByUser.get(p.id) || new Set<string>();
            const isMe = p.id === me?.id;
            const isAdminRow = p.role === "admin";
            return (
              <div
                key={p.id}
                className="rounded-xl border border-border bg-card/40 p-4 space-y-4"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold truncate">{p.nome || p.email}</h3>
                      {isMe && <Badge variant="outline" className="text-[10px]">você</Badge>}
                      {isAdminRow && (
                        <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30">
                          <ShieldCheck className="h-3 w-3 mr-1" /> Admin
                        </Badge>
                      )}
                      {!p.approved && (
                        <Badge variant="outline" className="text-[10px] border-amber-400/40 text-amber-400">
                          aguardando aprovação
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Mail className="h-3 w-3" /> {p.email}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-muted-foreground">Aprovado</span>
                      <Switch
                        checked={p.approved}
                        disabled={savingId === p.id || isMe}
                        onCheckedChange={(v) => toggleApproved(p, v)}
                      />
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={savingId === p.id || (isMe && isAdminRow)}
                      onClick={() => toggleRole(p)}
                    >
                      {isAdminRow ? "Rebaixar a user" : "Promover a admin"}
                    </Button>
                    {!p.approved && !isMe && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={savingId === p.id}
                        onClick={() => setDeletingTarget(p)}
                        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        title="Remove a solicitação e libera o e-mail pra novo cadastro"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Remover
                      </Button>
                    )}
                  </div>
                </div>

                {/* Grade de módulos — sempre renderizada pra alinhar cards.
                    Pra admin: todos checados, fixos, desabilitados.
                    Pra user pendente de aprovação: visível mas só edita depois. */}
                {p.approved && (
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mb-2">
                      {isAdminRow ? "Acesso aos módulos (admin)" : "Acesso aos módulos"}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5">
                      {MODULES.map(m => {
                        const on = isAdminRow ? true : accessSet.has(m.key);
                        return (
                          <button
                            key={m.key}
                            disabled={savingId === p.id || isAdminRow}
                            onClick={() => !isAdminRow && toggleModule(p, m.key, !on)}
                            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
                              on
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border bg-card/40 text-muted-foreground hover:border-muted-foreground/40"
                            } ${isAdminRow ? "cursor-default opacity-90" : ""}`}
                          >
                            <span>{m.label}</span>
                            {on ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5 opacity-40" />}
                          </button>
                        );
                      })}
                    </div>
                    {isAdminRow && (
                      <p className="text-[11px] text-muted-foreground italic mt-2">
                        Admins têm acesso a todos os módulos automaticamente.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deletingTarget} onOpenChange={(o) => { if (!o) setDeletingTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover solicitação de acesso?</AlertDialogTitle>
            <AlertDialogDescription>
              Isto vai apagar o cadastro de <strong>{deletingTarget?.email}</strong> e liberar
              o e-mail pra um novo signup. Esta ação é irreversível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingId === deletingTarget?.id}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (deletingTarget) removerSolicitacao(deletingTarget); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {savingId === deletingTarget?.id ? "Removendo…" : "Sim, remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
