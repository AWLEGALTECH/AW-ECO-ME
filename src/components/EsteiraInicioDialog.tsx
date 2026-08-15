import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  ScanSearch, AlertTriangle, X, Check, ChevronLeft, ChevronRight, Hammer, Building2, MessageSquare, User, ExternalLink, PenSquare, CheckCircle2,
} from "lucide-react";
import { DriveFolderButton } from "@/components/DriveFolderButton";
import { DescontosAnaliseComercial } from "@/components/DescontosAnaliseComercial";
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

type Stage = "actions" | "pendencia" | "pos_pendencia" | "artesanal_qtd" | "artesanal_specs";

export function EsteiraInicioDialog({ open, onClose, cliente, userId, onCreated, onConfirmar, titulo, permitirFinalizarPrimaria }: Props) {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("actions");
  const [finalizandoPrimaria, setFinalizandoPrimaria] = useState(false);
  const [tipos, setTipos] = useState<Set<TP>>(new Set());
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);
  // Fluxo artesanal: quantidade de pecas + descricao de cada uma
  const [artesanalQtd, setArtesanalQtd] = useState<number>(1);
  const [artesanalSpecs, setArtesanalSpecs] = useState<string[]>([""]);
  // PAUTA de cada peça: assunto curto que vira "ESPECÍFICA — <pauta>" no
  // título, no card e no campo matéria do Espelho de Protocolo.
  const [artesanalPautas, setArtesanalPautas] = useState<string[]>([""]);

  const reset = () => {
    setStage("actions");
    setTipos(new Set());
    setCustom("");
    setArtesanalQtd(1);
    setArtesanalSpecs([""]); setArtesanalPautas([""]);
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

  // Entra no fluxo de configuracao artesanal: primeiro escolhe quantas
  // pecas, depois descreve cada uma. So cria as demandas no final.
  const iniciarArtesanal = () => {
    setArtesanalQtd(1);
    setArtesanalSpecs([""]); setArtesanalPautas([""]);
    setStage("artesanal_qtd");
  };

  const confirmarQtd = () => {
    const n = Math.max(1, Math.min(20, Math.floor(artesanalQtd || 1)));
    setArtesanalQtd(n);
    // Mantem o que ja foi digitado se a qtd diminui, completa com "" se aumenta
    setArtesanalSpecs(prev => {
      const next = [...prev];
      while (next.length < n) next.push("");
      next.length = n;
      return next;
    });
    setArtesanalPautas((prev) => Array.from({ length: n }, (_, i) => prev[i] || ""));
    setStage("artesanal_specs");
  };

  const setSpec = (idx: number, valor: string) => {
    setArtesanalSpecs(prev => {
      const next = [...prev];
      next[idx] = valor;
      return next;
    });
  };
  // Pauta por peça. Cresce o array se ainda não tiver a posição (o dialog pode
  // abrir com 1 item e a quantidade mudar depois).
  const setPauta = (idx: number, valor: string) => {
    setArtesanalPautas(prev => {
      const next = [...prev];
      while (next.length <= idx) next.push("");
      next[idx] = valor;
      return next;
    });
  };

  const criarPecasArtesanais = async () => {
    if (!cliente) return;
    const especs = artesanalSpecs.map(s => s.trim());
    if (especs.some(s => !s)) {
      toast.error("Descreva cada peça antes de continuar.");
      return;
    }
    const pautas = artesanalSpecs.map((_, i) => (artesanalPautas[i] || "").trim());
    if (pautas.some(p => !p)) {
      toast.error("Informe a pauta de cada peça (vai no protocolo).");
      return;
    }
    setSaving(true);
    const total = especs.length;
    const rows = especs.map((spec, i) => {
      const sufixo = total > 1 ? ` (${i + 1}/${total})` : "";
      // A peça artesanal não vem de rubrica do Finder: a PAUTA ocupa o campo
      // `desconto`, que é o que alimenta título, card, ficha e o campo matéria
      // do Espelho de Protocolo.
      const materia = `ESPECÍFICA — ${pautas[i]}`;
      return {
        cliente_id: cliente.id,
        tipo: "pre_protocolo",
        etapa: "fluxo_artesanal",
        status: "pendente",
        // titulo eh o que aparece como hint no card da esteira
        titulo: `Peça artesanal${sufixo} — ${materia}`,
        desconto: materia,
        // descricao guarda a especificacao COMPLETA, exibida no popup
        descricao: spec,
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
            {(stage === "pendencia" || stage === "artesanal_qtd") && (
              <button onClick={() => setStage("actions")} className="text-muted-foreground hover:text-foreground" aria-label="Voltar">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {stage === "artesanal_specs" && (
              <button onClick={() => setStage("artesanal_qtd")} className="text-muted-foreground hover:text-foreground" aria-label="Voltar">
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
            {stage === "artesanal_qtd" && "Quantas peças serão confeccionadas pra esse cliente?"}
            {stage === "artesanal_specs" && "Descreva cada peça pra que o advogado saiba o que produzir."}
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

          {stage === "artesanal_qtd" && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground">
                  Quantidade de peças
                </label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={artesanalQtd}
                  onChange={(e) => setArtesanalQtd(Number(e.target.value) || 1)}
                  className="h-12 text-lg font-semibold text-center"
                />
                <p className="text-[11px] text-muted-foreground">
                  Cada peça vira um card separado na coluna "Fluxo artesanal".
                  Mínimo 1, máximo 20.
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <Button variant="ghost" onClick={() => setStage("actions")} disabled={saving}>Voltar</Button>
                <Button onClick={confirmarQtd} disabled={saving || artesanalQtd < 1}>
                  Próximo: especificar peças
                </Button>
              </div>
            </>
          )}

          {stage === "artesanal_specs" && (
            <>
              <div className="space-y-3 max-h-[52vh] overflow-y-auto pr-1.5 -mr-1.5">
                {artesanalSpecs.map((spec, i) => (
                  <div key={i} className="rounded-xl border border-border/60 bg-muted/20 p-3.5 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary/15 text-primary text-[10px] font-bold shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-xs font-semibold text-foreground">Peça {i + 1} de {artesanalQtd}</span>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-foreground/80">
                        Pauta <span className="text-muted-foreground font-normal">· vai no protocolo</span>
                      </label>
                      <Input
                        value={artesanalPautas[i] || ""}
                        onChange={(e) => setPauta(i, e.target.value)}
                        placeholder="Empréstimo consignado não contratado"
                        className="h-9 text-sm"
                      />
                      <p className="text-[10.5px] text-muted-foreground truncate">
                        Registrada como <span className="text-foreground/80 font-medium">ESPECÍFICA — {(artesanalPautas[i] || "").trim() || "assunto"}</span>
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-medium text-foreground/80">
                        Especificação <span className="text-muted-foreground font-normal">· o que o advogado deve produzir</span>
                      </label>
                      <Textarea
                        value={spec}
                        onChange={(e) => setSpec(i, e.target.value)}
                        placeholder="Ex.: Ação revisional contra Banco Pan — empréstimo consignado com taxa de 5,2% a.m., questionar abusividade."
                        className="resize-none min-h-[76px] text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <Button variant="ghost" onClick={() => setStage("artesanal_qtd")} disabled={saving}>Voltar</Button>
                <Button onClick={criarPecasArtesanais} disabled={saving}>
                  {saving ? "Criando…" : <><Check className="h-4 w-4 mr-1" /> Enviar pro fluxo</>}
                </Button>
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
