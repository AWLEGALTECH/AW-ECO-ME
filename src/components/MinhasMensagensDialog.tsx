import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MessageSquareText, Check } from "lucide-react";
import { SLOTS_MENSAGENS } from "@/lib/mensagensProntas";

// Editor das mensagens prontas do próprio usuário. Cada slot salva
// individualmente (upsert em mensagens_prontas). Só o dono edita as suas.
export function MinhasMensagensDialog({
  open, onClose, userId,
}: { open: boolean; onClose: () => void; userId: string | null }) {
  const qc = useQueryClient();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [originais, setOriginais] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["mensagens-prontas", userId],
    enabled: open && !!userId,
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

  useEffect(() => {
    if (!q.data) return;
    const init: Record<string, string> = {};
    for (const s of SLOTS_MENSAGENS) init[s.chave] = q.data[s.chave] ?? "";
    setValores(init);
    setOriginais(init);
  }, [q.data]);

  const salvar = async (chave: string) => {
    if (!userId) return;
    setSalvando(chave);
    const { error } = await supabase
      .from("mensagens_prontas" as any)
      .upsert({ user_id: userId, chave, conteudo: valores[chave] ?? "" }, { onConflict: "user_id,chave" });
    setSalvando(null);
    if (error) { toast.error(error.message); return; }
    setOriginais(o => ({ ...o, [chave]: valores[chave] ?? "" }));
    toast.success("Mensagem salva.");
    qc.invalidateQueries({ queryKey: ["mensagens-prontas", userId] });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-primary" />
            Minhas mensagens prontas
          </DialogTitle>
          <DialogDescription>
            Saudações que entram prontas ao acionar cada canal no lead. Só você edita as suas.
          </DialogDescription>
        </DialogHeader>

        {q.isLoading ? (
          <div className="text-center text-muted-foreground py-8 text-sm">Carregando…</div>
        ) : (
          <div className="space-y-4 pt-1">
            {SLOTS_MENSAGENS.map(slot => {
              const dirty = (valores[slot.chave] ?? "") !== (originais[slot.chave] ?? "");
              return (
                <div key={slot.chave} className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <slot.icon className="h-3.5 w-3.5 text-primary" /> {slot.label}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{slot.descricao}</p>
                  <Textarea
                    value={valores[slot.chave] ?? ""}
                    onChange={(e) => setValores(v => ({ ...v, [slot.chave]: e.target.value }))}
                    rows={3}
                    placeholder={slot.placeholder}
                    className="text-xs resize-none"
                  />
                  <div className="flex justify-end">
                    <Button size="sm" disabled={!dirty || salvando === slot.chave} onClick={() => salvar(slot.chave)}>
                      {salvando === slot.chave
                        ? "Salvando…"
                        : dirty
                          ? "Salvar"
                          : <><Check className="h-3.5 w-3.5 mr-1" /> Salvo</>}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
