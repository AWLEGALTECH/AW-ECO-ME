import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bell, Eye, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface ConfigRow {
  tipo: string;
  label: string;
  ativo: boolean;
  visivel_usuarios: boolean;
}

export default function AdminNotificacoes() {
  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["notificacao_config"],
    queryFn: async (): Promise<ConfigRow[]> => {
      const { data, error } = await (supabase.from("notificacao_config" as any) as any)
        .select("tipo,label,ativo,visivel_usuarios")
        .order("label");
      if (error) throw error;
      return data || [];
    },
  });

  const patch = async (tipo: string, campo: "ativo" | "visivel_usuarios", valor: boolean) => {
    // otimista
    qc.setQueryData<ConfigRow[]>(["notificacao_config"], (old) =>
      (old || []).map((r) => (r.tipo === tipo ? { ...r, [campo]: valor } : r)));
    const { error } = await (supabase.from("notificacao_config" as any) as any)
      .update({ [campo]: valor })
      .eq("tipo", tipo);
    if (error) {
      toast.error("Erro ao salvar: " + error.message);
      qc.invalidateQueries({ queryKey: ["notificacao_config"] });
    } else {
      toast.success("Configuração salva", { duration: 1200 });
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold font-display flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" /> Notificações
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Você (admin) recebe <strong>todos</strong> os eventos. Aqui você liga/desliga cada tipo
          e decide o que os demais usuários enxergam.
        </p>
      </header>

      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.35)] overflow-hidden">
        {/* Cabeçalho de colunas */}
        <div className="hidden sm:grid grid-cols-[1fr,auto,auto] gap-6 px-5 py-3 border-b border-white/[0.07] text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          <span>Evento</span>
          <span className="inline-flex items-center gap-1 justify-end w-24"><Zap className="h-3 w-3" /> Ativa</span>
          <span className="inline-flex items-center gap-1 justify-end w-28"><Eye className="h-3 w-3" /> Usuários veem</span>
        </div>

        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-10">Carregando…</p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {rows.map((r) => (
              <li key={r.tipo} className="grid grid-cols-[1fr,auto] sm:grid-cols-[1fr,auto,auto] gap-x-6 gap-y-3 items-center px-5 py-4">
                <div className="min-w-0 col-span-2 sm:col-span-1">
                  <p className="text-sm font-medium text-foreground">{r.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.ativo
                      ? r.visivel_usuarios
                        ? "Gerando · visível pra todos os usuários"
                        : "Gerando · só você (admin) vê"
                      : "Desligada — nenhuma notificação é criada"}
                  </p>
                </div>
                <div className="flex items-center gap-2 justify-end sm:w-24">
                  <span className="text-[11px] text-muted-foreground sm:hidden">Ativa</span>
                  <Switch checked={r.ativo} onCheckedChange={(v) => patch(r.tipo, "ativo", v)} />
                </div>
                <div className="flex items-center gap-2 justify-end sm:w-28">
                  <span className="text-[11px] text-muted-foreground sm:hidden">Usuários veem</span>
                  <Switch
                    checked={r.visivel_usuarios}
                    disabled={!r.ativo}
                    onCheckedChange={(v) => patch(r.tipo, "visivel_usuarios", v)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        As notificações aparecem no sininho do topo (PC e celular). O push real (com o app
        fechado) é ativado na próxima etapa.
      </p>
    </div>
  );
}
