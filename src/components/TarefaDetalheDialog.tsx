import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CampoData } from "@/components/CampoData";
import { CalendarDays, CalendarClock, Loader2, Pencil, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ICONE_TIPO, LABEL_TIPO, DESFECHOS, prazoInfo,
  type Task, type TaskDesfecho,
} from "@/components/ProcessoTimeline";

const ORDEM_DESFECHO: TaskDesfecho[] = ["concluido", "perdido", "cancelado"];

/**
 * O que a tarefa é e o que dá pra fazer com ela, num lugar só.
 *
 * Clicar numa tarefa quase nunca é "quero reescrever isto": é "o que era mesmo
 * essa tarefa" e, quase sempre em seguida, uma de três respostas — resolvi,
 * perdi, ou não vai ser hoje. Abrir direto o formulário de edição obrigava a
 * ler campos editáveis pra descobrir uma informação, e escondia as três ações
 * atrás de um botão.
 *
 * Então: resumo em cima, as três saídas no meio, e editar num canto, que é a
 * frequência real de cada coisa.
 *
 * Reagendar fica lado a lado com os desfechos porque é a MESMA decisão vista de
 * outro ângulo: quem olha um prazo estourado ou resolve, ou perde, ou empurra.
 * Não é desfecho (a tarefa segue aberta), mas é a resposta que compete com eles.
 */
export function TarefaDetalheDialog({
  task, contexto, onFechar, onDesfecho, onReagendar, onEditar,
}: {
  task: Task | null;
  contexto?: React.ReactNode;
  onFechar: () => void;
  onDesfecho: (desfecho: TaskDesfecho, obs: string) => Promise<void> | void;
  onReagendar: (prazo: string) => Promise<void> | void;
  onEditar: () => void;
}) {
  const [escolhido, setEscolhido] = useState<TaskDesfecho | "">("");
  const [obs, setObs] = useState("");
  const [reagendando, setReagendando] = useState(false);
  const [novoPrazo, setNovoPrazo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  // Cada tarefa aberta começa limpa, senão o rascunho da anterior vazaria.
  useEffect(() => {
    if (!task) return;
    setEscolhido(task.desfecho ?? "");
    setObs(task.desfechoObs ?? "");
    setReagendando(false);
    setNovoPrazo(task.prazo ?? "");
  }, [task]);

  if (!task) return <Dialog open={false} onOpenChange={() => {}}><DialogContent /></Dialog>;

  const Icon = ICONE_TIPO[task.tipo];
  const d = task.desfecho ? DESFECHOS[task.desfecho] : null;
  const prazo = prazoInfo(task.prazo);

  const confirmarDesfecho = async () => {
    if (!escolhido) return;
    setOcupado(true);
    try { await onDesfecho(escolhido, obs.trim()); onFechar(); }
    finally { setOcupado(false); }
  };

  const confirmarReagendamento = async () => {
    setOcupado(true);
    try { await onReagendar(novoPrazo); onFechar(); }
    finally { setOcupado(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !ocupado && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2.5 text-base leading-tight pr-6">
            <span className="h-8 w-8 rounded-xl bg-primary/12 ring-1 ring-primary/25 grid place-items-center shrink-0 mt-0.5">
              <Icon className="h-4 w-4 text-primary" />
            </span>
            <span className="min-w-0">
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground font-normal">
                {LABEL_TIPO[task.tipo]}
              </span>
              <span className="block">{task.titulo}</span>
            </span>
          </DialogTitle>
          {contexto && <DialogDescription className="text-xs pt-1">{contexto}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto px-0.5">
          {/* Resumo */}
          <div className="rounded-xl ring-1 ring-white/[0.07] bg-white/[0.02] p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              {d ? (
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1", d.chip)}>
                  <d.icon className="h-3 w-3" /> {d.label}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 bg-primary/15 text-primary ring-primary/30">
                  {task.tipo === "pendencia" ? "Pendente" : task.status}
                </span>
              )}
              <span className={cn("inline-flex items-center gap-1.5 text-[11.5px]", d ? "text-muted-foreground" : prazo.cls)}>
                <CalendarDays className="h-3 w-3 shrink-0" /> {prazo.label}
              </span>
            </div>

            {task.conteudo
              ? <p className="text-[12px] text-muted-foreground leading-snug whitespace-pre-wrap">{task.conteudo}</p>
              : <p className="text-[12px] text-muted-foreground/60 italic">Sem detalhe escrito.</p>}

            {d && task.desfechoObs && (
              <p className="text-[11.5px] text-muted-foreground leading-snug border-t border-white/[0.06] pt-2">
                <FileText className="h-3 w-3 inline mr-1 -mt-0.5" />
                {task.desfechoObs}
              </p>
            )}
          </div>

          {/* Reagendar: a tarefa segue aberta, só muda de data */}
          {reagendando ? (
            <div className="rounded-xl ring-1 ring-primary/25 bg-primary/[0.05] p-3 space-y-2">
              <p className="text-[12px] font-medium">Novo prazo</p>
              <CampoData valor={novoPrazo} onChange={setNovoPrazo} />
              <div className="flex gap-1.5">
                <Button size="sm" onClick={confirmarReagendamento} disabled={ocupado}>
                  {ocupado && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Reagendar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setReagendando(false)} disabled={ocupado}>
                  Cancelar
                </Button>
              </div>
              <p className="text-[10.5px] text-muted-foreground">
                Vazio tira a tarefa da contagem de prazo, sem fechá-la.
              </p>
            </div>
          ) : (
            <>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {d ? "Trocar a saída" : "Como isso termina?"}
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {ORDEM_DESFECHO.map((k) => {
                  const info = DESFECHOS[k];
                  const ativo = escolhido === k;
                  return (
                    <button key={k} onClick={() => setEscolhido(k)} disabled={ocupado}
                      className={cn("flex flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all hover:-translate-y-0.5",
                        ativo ? cn("ring-1", info.chip)
                          : "border-white/[0.08] bg-white/[0.03] hover:border-primary/40 text-muted-foreground")}>
                      <info.icon className="h-4 w-4" />
                      <span className="text-[10.5px] font-medium">{info.label}</span>
                    </button>
                  );
                })}
                <button onClick={() => setReagendando(true)} disabled={ocupado}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-2.5 text-muted-foreground hover:border-primary/40 hover:text-primary transition-all hover:-translate-y-0.5">
                  <CalendarClock className="h-4 w-4" />
                  <span className="text-[10.5px] font-medium">Reagendar</span>
                </button>
              </div>

              {escolhido && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Observações</label>
                  <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3}
                    placeholder={
                      escolhido === "concluido" ? "Como foi concluída…"
                        : escolhido === "perdido" ? "Por que foi perdida…"
                          : "Por que foi cancelada…"
                    } />
                  <p className="text-[10.5px] text-muted-foreground">Fica registrado na tarefa.</p>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onEditar} disabled={ocupado}
            className="mr-auto text-muted-foreground hover:text-foreground">
            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
          </Button>
          <Button variant="ghost" onClick={onFechar} disabled={ocupado}>Fechar</Button>
          {!reagendando && (
            <Button onClick={confirmarDesfecho} disabled={ocupado || !escolhido || escolhido === task.desfecho}>
              {ocupado && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Salvar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
