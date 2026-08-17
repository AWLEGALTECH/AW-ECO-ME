import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampoData } from "@/components/CampoData";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ICONE_TIPO, LABEL_TIPO, STATUS_PROCESSUAIS, DESFECHOS,
  type Task, type TaskTipo, type TaskDesfecho,
} from "@/components/ProcessoTimeline";
import type { PatchTarefa } from "@/lib/tarefas";

const TIPOS: TaskTipo[] = ["acao", "monitoramento", "pendencia"];

// Rótulo do campo com o microtexto do porquê, no mesmo formato da criação.
function Campo({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>}
    </div>
  );
}

/**
 * Edição de uma tarefa, usada tanto na linha temporal do processo quanto na
 * tela de Tarefas. Só monta o formulário e devolve o patch: quem grava é o
 * chamador, porque um tem estado local com autosave e o outro escreve direto
 * no banco.
 *
 * O que se edita aqui é a tarefa em si. O DESFECHO (concluído, perdido,
 * cancelado) tem diálogo próprio no processo, com a observação obrigatória
 * que fecha o caso, então aqui ele aparece só para ser DESFEITO: marcar algo
 * como concluído sem dizer como não é edição, é perder informação.
 */
export function EditarTarefaDialog({ task, onFechar, onSalvar, onExcluir, contexto }: {
  task: Task | null;
  onFechar: () => void;
  onSalvar: (patch: PatchTarefa) => Promise<void> | void;
  onExcluir?: () => Promise<void> | void;
  contexto?: React.ReactNode;
}) {
  const [form, setForm] = useState({
    tipo: "acao" as TaskTipo, titulo: "", conteudo: "", prazo: "", status: "",
  });
  const [salvando, setSalvando] = useState(false);
  const [confirmaExcluir, setConfirmaExcluir] = useState(false);

  // Recarrega a cada tarefa aberta, senão o formulário guardaria a anterior.
  useEffect(() => {
    if (!task) return;
    setForm({
      tipo: task.tipo,
      titulo: task.titulo ?? "",
      conteudo: task.conteudo ?? "",
      prazo: task.prazo ?? "",
      status: task.status ?? "",
    });
    setConfirmaExcluir(false);
  }, [task]);

  const d = task?.desfecho ? DESFECHOS[task.desfecho as TaskDesfecho] : null;

  const salvar = async (extra?: PatchTarefa) => {
    const titulo = form.titulo.trim();
    if (!titulo) { toast.error("A tarefa precisa de um título."); return; }
    setSalvando(true);
    try {
      await onSalvar({
        tipo: form.tipo,
        titulo,
        conteudo: form.conteudo.trim(),
        prazo: form.prazo,
        status: form.status,
        ...extra,
      });
      onFechar();
    } finally { setSalvando(false); }
  };

  const excluir = async () => {
    if (!onExcluir) return;
    setSalvando(true);
    try { await onExcluir(); onFechar(); }
    finally { setSalvando(false); }
  };

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && !salvando && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Editar tarefa</DialogTitle>
          {contexto && <DialogDescription className="text-xs">{contexto}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-3.5 max-h-[65vh] overflow-y-auto px-0.5 py-0.5">
          <Campo label="Tipo" hint="Ação é o que se faz; monitoramento é o que se acompanha; pendência é o que falta chegar.">
            <div className="grid grid-cols-3 gap-1.5">
              {TIPOS.map((tp) => {
                const Icon = ICONE_TIPO[tp];
                const ativo = form.tipo === tp;
                return (
                  <button key={tp} type="button" onClick={() => setForm((f) => ({ ...f, tipo: tp }))}
                    className={cn("flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs ring-1 transition-colors",
                      ativo ? "bg-primary/15 text-primary ring-primary/35"
                        : "text-muted-foreground ring-white/[0.08] hover:bg-white/[0.05] hover:text-foreground")}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{LABEL_TIPO[tp]}</span>
                  </button>
                );
              })}
            </div>
          </Campo>

          <Campo label="Título">
            <Input value={form.titulo} autoFocus
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvar(); } }} />
          </Campo>

          <Campo label="Detalhe" hint="Opcional. O que alguém precisa saber pra tocar isso sem perguntar.">
            <Textarea value={form.conteudo} rows={3}
              onChange={(e) => setForm((f) => ({ ...f, conteudo: e.target.value }))} />
          </Campo>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Prazo" hint="Digite dd/mm/aaaa ou use o calendário. Vazio tira a tarefa da contagem de prazo.">
              <CampoData valor={form.prazo} onChange={(iso) => setForm((f) => ({ ...f, prazo: iso }))} />
            </Campo>

            <Campo label="Status processual" hint="O que o processo aguarda por causa desta tarefa.">
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger className="text-xs"><SelectValue placeholder="Escolher" /></SelectTrigger>
                <SelectContent>
                  {STATUS_PROCESSUAIS.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Campo>
          </div>

          {/* Desfecho só se desfaz aqui: marcar como concluído exige a
              observação do diálogo próprio, que é o que registra o COMO. */}
          {d && (
            <div className="flex items-center gap-2 rounded-lg ring-1 ring-white/[0.08] bg-white/[0.02] px-3 py-2">
              <d.icon className={cn("h-4 w-4 shrink-0", d.text)} />
              <span className="text-[12px] flex-1 min-w-0">
                Marcada como <span className="font-medium">{d.label.toLowerCase()}</span>
              </span>
              <button type="button" disabled={salvando}
                onClick={() => salvar({ desfecho: undefined, desfechoObs: undefined })}
                className="text-[11.5px] text-primary hover:underline shrink-0">
                Reabrir
              </button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {onExcluir ? (
            confirmaExcluir ? (
              <span className="flex items-center gap-2 mr-auto">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                <span className="text-[11.5px] text-muted-foreground">Excluir de vez?</span>
                <Button size="sm" variant="destructive" onClick={excluir} disabled={salvando}>Excluir</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmaExcluir(false)} disabled={salvando}>Não</Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmaExcluir(true)} disabled={salvando}
                className="mr-auto text-muted-foreground hover:text-rose-400">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Excluir
              </Button>
            )
          ) : <span className="mr-auto" />}

          <Button variant="ghost" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => salvar()} disabled={salvando || !form.titulo.trim()}>
            {salvando && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
