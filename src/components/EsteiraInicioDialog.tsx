import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ScanSearch, AlertTriangle, X, Check, ChevronLeft, ChevronRight, Hammer, Building2, MessageSquare, User, ExternalLink, PenSquare, CheckCircle2,
} from "lucide-react";
import { DriveFolderButton } from "@/components/DriveFolderButton";
import { DescontosAnaliseComercial, rubricasDaAnalise } from "@/components/DescontosAnaliseComercial";
import { SectionLabel, ActionRow } from "@/components/AcaoEsteira";
import { PendenciaPicker } from "@/components/PendenciaPicker";
import { criarPendencias, type TipoPendencia as TP } from "@/lib/pendencias";

// Catálogo e criação de pendência vivem em lib/pendencias — re-exportados
// aqui porque outras telas já importavam TIPOS_PENDENCIA deste módulo.
export { TIPOS_PENDENCIA, type TipoPendencia } from "@/lib/pendencias";

interface Props {
  open: boolean;
  onClose: () => void;
  cliente: {
    id: string;
    nome: string;
    drive_folder_url?: string | null;
    observacoes?: string | null;
    requerido?: string | null;
    cadastrado_por?: string | null;
    origem?: string | null;
    demandas_downstream?: number;
    analise_comercial?: any | null;
  } | null;
  userId: string | null;
  onCreated: () => void;
  // Sobrescreve o que acontece em "Seguir fluxo Bradesco".
  // Default: navega pra /finder?cliente=...&nome=...
  onConfirmar?: () => Promise<void> | void;
  // Customiza titulo do modal pra contextos diferentes
  titulo?: string;
  // Quando true, exibe o botao "Finalizar analise primaria" — quem
  // controla a saida do cliente da coluna 1 da esteira. Usado apenas
  // quando o dialog eh aberto a partir da Esteira.
  permitirFinalizarPrimaria?: boolean;
}

type Stage = "actions" | "pendencia" | "pos_pendencia" | "artesanal_rubricas";

export function EsteiraInicioDialog({ open, onClose, cliente, userId, onCreated, onConfirmar, titulo, permitirFinalizarPrimaria }: Props) {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("actions");
  const [finalizandoPrimaria, setFinalizandoPrimaria] = useState(false);
  const [tipos, setTipos] = useState<Set<TP>>(new Set());
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);
  // Fluxo artesanal: uma peça por RUBRICA da análise comercial. O comercial
  // já levantou o que o cliente tem de não-Bradesco — reaproveita em vez de
  // pedir a mesma descrição de novo.
  const [rubSel, setRubSel] = useState<Set<number>>(new Set());

  const reset = () => {
    setStage("actions");
    setTipos(new Set());
    setCustom("");
    setRubSel(new Set());
  };

  const toggleTipo = (key: TP) => {
    setTipos(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleClose = () => { onClose(); setTimeout(reset, 200); };

  const finalizarPrimaria = async () => {
    if (!cliente) return;
    setFinalizandoPrimaria(true);
    const { error } = await supabase
      .from("clientes")
      .update({
        analise_primaria_finalizada_at: new Date().toISOString(),
        analise_primaria_finalizada_by: userId,
      } as any)
      .eq("id", cliente.id);
    setFinalizandoPrimaria(false);
    if (error) { toast.error("Erro ao finalizar: " + error.message); return; }
    toast.success("Análise primária finalizada — cliente sai da coluna 1.");
    onCreated();
    handleClose();
  };

  const seguirBradesco = async () => {
    if (!cliente) return;
    if (onConfirmar) {
      await onConfirmar();
      handleClose();
    } else {
      handleClose();
      navigate(`/finder?cliente=${cliente.id}&nome=${encodeURIComponent(cliente.nome)}`);
    }
  };

  // Entra no fluxo artesanal: escolher a(s) rubrica(s) do comercial que serão
  // produzidas à mão. Só cria as demandas no final.
  const iniciarArtesanal = () => {
    setRubSel(new Set());
    setStage("artesanal_rubricas");
  };

  // Rubricas do comercial disponíveis pra produção artesanal. As bloqueadas
  // ficam de fora — foram descartadas no comercial e não se reconsideram aqui.
  const rubricasAptas = useMemo(
    () => rubricasDaAnalise(cliente?.analise_comercial).filter((r) => !r.bloqueada),
    [cliente?.analise_comercial],
  );

  const toggleRub = (i: number) =>
    setRubSel((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });

  // Cria UMA peça artesanal por rubrica marcada. Selecionar N rubricas gera N
  // demandas de uma vez — antes era preciso abrir e fechar o diálogo por peça.
  const criarPecasArtesanais = async () => {
    if (!cliente) return;
    const escolhidas = rubricasAptas.filter((_, i) => rubSel.has(i));
    if (!escolhidas.length) { toast.error("Selecione ao menos uma rubrica."); return; }
    setSaving(true);
    const total = escolhidas.length;
    const rows = escolhidas.map((r, i) => {
      const sufixo = total > 1 ? ` (${i + 1}/${total})` : "";
      // A rubrica do comercial É a matéria: alimenta título, card, ficha e o
      // campo matéria do Espelho de Protocolo.
      const contexto = [
        r.requerido ? `Contra ${r.requerido}` : null,
        r.detalhe || null,
      ].filter(Boolean).join(" · ");
      return {
        cliente_id: cliente.id,
        tipo: "pre_protocolo",
        etapa: "fluxo_artesanal",
        status: "pendente",
        titulo: `Peça artesanal${sufixo} — ${r.rubrica}`,
        desconto: r.rubrica,
        descricao: contexto || null,
        // Preserva a linhagem: a ação nasce do contrato que a originou.
        contrato_id: r.contrato_id || null,
        created_by: userId,
      };
    });
    const { error } = await supabase.from("demandas" as any).insert(rows);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(total === 1 ? "Peça artesanal criada" : `${total} peças artesanais criadas`);
    onCreated();
    handleClose();
  };

  const salvarPendencia = async () => {
    if (!cliente) return;
    setSaving(true);
    const { error, qtd } = await criarPendencias({
      clienteId: cliente.id, tipos: Array.from(tipos), custom, userId,
    });
    setSaving(false);
    if (error) { toast.error(error); return; }
    // Cliente com pendência sai da fila de "Análise primária" e fica SÓ na
    // fila de pendências — nunca coexiste nas duas. Volta pra análise
    // primária automaticamente quando todas as pendências forem resolvidas.
    await supabase
      .from("clientes")
      .update({
        analise_primaria_finalizada_at: new Date().toISOString(),
        analise_primaria_finalizada_by: userId,
      } as any)
      .eq("id", cliente.id);
    toast.success(qtd === 1 ? "Pendência registrada" : `${qtd} pendências registradas`);
    onCreated();
    setStage("pos_pendencia");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className={`${stage === "actions" ? "sm:max-w-2xl" : "sm:max-w-lg"} max-w-[95vw] max-h-[88dvh] overflow-y-auto overflow-x-hidden`}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {(stage === "pendencia" || stage === "artesanal_rubricas") && (
              <button onClick={() => setStage("actions")} className="text-muted-foreground hover:text-foreground" aria-label="Voltar">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {stage === "actions" && (
              <ScanSearch className="h-5 w-5 text-primary shrink-0" />
            )}
            {titulo
              ? `${titulo} — ${cliente?.nome || "cliente"}`
              : `Análise primária de ${cliente?.nome || "cliente"}`}
          </DialogTitle>
          <DialogDescription>
            {stage === "actions" && "1. Analise a pasta do Drive. Depois escolha o próximo passo."}
            {stage === "pendencia" && "Selecione tudo que está faltando nesse cliente."}
            {stage === "pos_pendencia" && "Apesar da pendência registrada, este cliente segue ou não?"}
            {stage === "artesanal_rubricas" && "Qual rubrica da análise comercial será produzida à mão? Marque quantas quiser — cada uma vira uma peça."}
          </DialogDescription>
        </DialogHeader>

        <div key={stage} className="animate-in fade-in slide-in-from-right-4 duration-300 space-y-4">
          {stage === "actions" && (
            <>
              {/* BRIEFING + CADASTRAL, lado a lado: à esquerda os dados de
                  leitura do cliente, à direita os atalhos (perfil / Drive).
                  A observação do aprovador passa full-width por baixo dos
                  dois. No mobile tudo colapsa pra coluna única. */}
              <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4 p-4">
                  {/* Coluna esquerda: dados de leitura */}
                  <div className="space-y-2.5 min-w-0 sm:self-center">
                    <div className="flex items-start gap-2.5">
                      <Building2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Requerido</p>
                        <p className="text-sm font-medium text-foreground break-words">
                          {(cliente?.requerido || "").trim() || "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Cadastrado por</p>
                        <p className="text-sm text-foreground/90 break-words">
                          {(cliente?.cadastrado_por || "").trim() || "—"}
                          <span className="text-muted-foreground/70">
                            {" "}({cliente?.origem === "writer" ? "via procuração" : "manual"})
                          </span>
                        </p>
                      </div>
                    </div>
                    {(cliente?.demandas_downstream ?? 0) > 0 && (
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        <p className="text-sm text-emerald-400/90">
                          {cliente!.demandas_downstream === 1
                            ? "1 peça em produção"
                            : `${cliente!.demandas_downstream} peças em produção`}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Coluna direita: atalhos cadastrais (perfil + Drive) */}
                  <div className="space-y-2 min-w-0">
                    {cliente && (
                      <ActionRow
                        icon={User}
                        title="Abrir perfil do cliente"
                        subtitle="Dados, demandas e histórico"
                        href={`/clientes/${cliente.id}`}
                        trailing={<ExternalLink className="h-4 w-4 text-primary opacity-70 shrink-0" />}
                      />
                    )}
                    {cliente && (
                      <DriveFolderButton
                        clienteId={cliente.id}
                        clienteNome={cliente.nome}
                        driveFolderUrl={cliente.drive_folder_url}
                        variant="row"
                      />
                    )}
                  </div>
                </div>

                {/* Observação do aprovador — full-width, por baixo dos dois */}
                {cliente?.observacoes && (
                  <div className="border-t border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 flex items-start gap-2.5">
                    <MessageSquare className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="space-y-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.15em] text-amber-400/80 font-semibold">
                        Observação do aprovador
                      </p>
                      <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
                        {cliente.observacoes}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Descontos da análise comercial — bloqueados aparecem travados,
                  impedindo que a análise primária reconsidere algo já descartado. */}
              {cliente?.analise_comercial && (
                <DescontosAnaliseComercial analise={cliente.analise_comercial} />
              )}

              {/* ── 2) FLUXO DA MATÉRIA — função principal, em destaque e lado
                     a lado no desktop (aproveita a largura); empilha no mobile ── */}
              <div className="space-y-2.5">
                <SectionLabel>Fluxo da matéria</SectionLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <ActionRow
                    hero
                    icon={Building2}
                    title="Seguir fluxo Bradesco"
                    subtitle="Abre o Finder pra análise vinculada Bradesco"
                    onClick={seguirBradesco}
                    trailing={<ChevronRight className="h-5 w-5 text-primary shrink-0" />}
                  />
                  <ActionRow
                    hero
                    icon={Hammer}
                    title="Seguir fluxo artesanal"
                    subtitle="Caso não-Bradesco. A peça será feita à mão."
                    onClick={iniciarArtesanal}
                    disabled={saving}
                    trailing={<ChevronRight className="h-5 w-5 text-primary shrink-0" />}
                  />
                </div>
              </div>

              {/* ── 3) CONCLUSÃO — encerra a análise primária ──────────── */}
              <div className="space-y-2">
                <SectionLabel>Conclusão</SectionLabel>
                <div className={`grid grid-cols-1 gap-2 ${permitirFinalizarPrimaria ? "sm:grid-cols-2" : ""}`}>
                  <ActionRow
                    icon={AlertTriangle}
                    title="Relatar pendência"
                    subtitle="Algo está faltando no Drive deste cliente"
                    onClick={() => setStage("pendencia")}
                    tone="amber"
                  />
                  {/* Finalizar só aparece quando o dialog vem da esteira (col 1).
                      Tira o cliente da fila e preserva as demandas já geradas. */}
                  {permitirFinalizarPrimaria && (
                    <ActionRow
                      icon={Check}
                      title={finalizandoPrimaria ? "Finalizando…" : "Finalizar análise primária"}
                      subtitle="Tira o cliente da coluna 1. As peças continuam nas colunas seguintes."
                      onClick={finalizarPrimaria}
                      disabled={finalizandoPrimaria}
                      tone="emerald"
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {stage === "pendencia" && (
            <>
              <PendenciaPicker tipos={tipos} onToggle={toggleTipo} custom={custom} onCustom={setCustom} />
              <div className="flex items-center justify-between gap-2 pt-2">
                <span className="text-[11px] text-muted-foreground">
                  {tipos.size === 0
                    ? "Nenhuma selecionada"
                    : tipos.size === 1 ? "1 pendência" : `${tipos.size} pendências`}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => setStage("actions")} disabled={saving}>Voltar</Button>
                  <Button onClick={salvarPendencia} disabled={saving || tipos.size === 0}>
                    {saving ? "Salvando…" : <><Check className="h-4 w-4 mr-1" /> Salvar pendência</>}
                  </Button>
                </div>
              </div>
            </>
          )}

          {stage === "artesanal_rubricas" && (
            <>
              {rubricasAptas.length === 0 ? (
                <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-4 flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      Sem rubrica disponível na análise comercial
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-1">
                      Toda peça artesanal nasce de uma rubrica levantada pelo comercial. Defina as
                      ações ajuizáveis deste cliente na ficha dele e volte aqui.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[12px] text-muted-foreground">
                    O comercial já levantou o que este cliente tem de não-Bradesco. Marque a rubrica
                    correspondente — <span className="text-foreground/80">cada marcada vira uma peça
                    separada</span> na coluna "Fluxo artesanal".
                  </p>
                  <div className="rounded-lg border border-border divide-y divide-border/60 max-h-[46dvh] overflow-y-auto">
                    {rubricasAptas.map((r, i) => {
                      const checked = rubSel.has(i);
                      return (
                        <label
                          key={`${r.rubrica}-${i}`}
                          className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                            checked ? "bg-primary/5" : "hover:bg-muted/30"
                          }`}
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggleRub(i)} className="mt-0.5" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{r.rubrica}</span>
                            {(r.requerido || r.detalhe) && (
                              <span className="block text-[11px] text-muted-foreground mt-0.5 break-words">
                                {r.requerido && <span className="text-foreground/70">contra {r.requerido}</span>}
                                {r.requerido && r.detalhe && " · "}
                                {r.detalhe}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2">
                <span className="text-[11px] text-muted-foreground">
                  {rubSel.size === 0
                    ? "Nenhuma rubrica marcada"
                    : rubSel.size === 1 ? "1 peça será criada" : `${rubSel.size} peças serão criadas`}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => setStage("actions")} disabled={saving}>Voltar</Button>
                  <Button onClick={criarPecasArtesanais} disabled={saving || rubSel.size === 0}>
                    {saving ? "Criando…" : <><Check className="h-4 w-4 mr-1" /> Criar {rubSel.size > 1 ? `${rubSel.size} peças` : "peça"}</>}
                  </Button>
                </div>
              </div>
            </>
          )}

          {stage === "pos_pendencia" && (
            <div className="space-y-2.5">
              <ActionRow
                hero
                icon={Building2}
                title="Seguir fluxo Bradesco"
                subtitle="Pendência fica registrada, mas a análise Bradesco começa agora"
                onClick={seguirBradesco}
                disabled={saving}
                trailing={<ChevronRight className="h-5 w-5 text-primary shrink-0" />}
              />
              <ActionRow
                hero
                icon={PenSquare}
                title="Seguir fluxo artesanal"
                subtitle="Vai pra fila de peças manuais com a pendência registrada"
                onClick={iniciarArtesanal}
                disabled={saving}
                trailing={<ChevronRight className="h-5 w-5 text-primary shrink-0" />}
              />
              <ActionRow
                icon={X}
                title="Não seguir agora"
                subtitle="Fecha — só fica a pendência registrada"
                onClick={handleClose}
                disabled={saving}
                tone="muted"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
