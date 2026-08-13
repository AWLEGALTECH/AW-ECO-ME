import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Building2, Pencil, ClipboardList, ChevronLeft, Loader2, Check, Plus, X, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { RUBRICAS_FECHAMENTO } from "@/lib/rubricasFechamento";

type Motivo = "rubrica_invalida" | "ja_ajuizada" | "cliente_nao_quer";
const MOTIVO_LABEL: Record<Motivo, string> = {
  rubrica_invalida: "Rúbrica inválida",
  ja_ajuizada: "Já ajuizada",
  cliente_nao_quer: "Cliente não quer",
};

// Cada AÇÃO selecionada (pode repetir a mesma ação para réus diferentes).
interface Sel { rubrica: string; detalhe: string; requerido: string; bloqueada: boolean; motivo: Motivo }

// Lê as rubricas de uma análise (aceita array direto ou { rubricas: [...] }).
function rubricasDaAnalise(ac: any): Sel[] {
  const arr = Array.isArray(ac) ? ac : ac?.rubricas;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((r: any) => ({
      rubrica: String(r?.rubrica ?? "").trim(),
      detalhe: String(r?.detalhe ?? "").trim(),
      requerido: String(r?.requerido ?? "").trim(),
      bloqueada: !!r?.bloqueada,
      motivo: (r?.motivo as Motivo) || "rubrica_invalida",
    }))
    .filter((r) => r.rubrica);
}

interface Props {
  open: boolean;
  onClose: () => void;
  cliente: { id: string; nome: string; analise_comercial?: any } | null;
  onSaved: () => void;
  editorId: string | null;
}

export function RefazerAnaliseComercialDialog({ open, onClose, cliente, onSaved, editorId }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [stage, setStage] = useState<"chooser" | "manual">("chooser");
  const [salvando, setSalvando] = useState(false);

  // Catálogo GLOBAL de ações (tabela acoes_ajuizaveis): o mesmo do Writer.
  const [catalogo, setCatalogo] = useState<string[]>([]);
  const [novaAcao, setNovaAcao] = useState("");
  const [criandoAcao, setCriandoAcao] = useState(false);
  const [addAberto, setAddAberto] = useState(false);
  const carregarCatalogo = async () => {
    const { data } = await (supabase.from("acoes_ajuizaveis" as any) as any)
      .select("nome").eq("ativo", true).order("ordem").order("nome");
    setCatalogo(((data || []) as any[]).map((r) => String(r.nome)));
  };
  useEffect(() => { if (open) carregarCatalogo(); }, [open]);

  const [sel, setSel] = useState<Sel[]>([]);
  // Reinicia quando abre / troca de cliente.
  const [chaveInit, setChaveInit] = useState<string>("");
  const chaveAtual = `${cliente?.id || ""}|${open}`;
  if (open && chaveAtual !== chaveInit) {
    setChaveInit(chaveAtual);
    setSel(rubricasDaAnalise(cliente?.analise_comercial));
    setStage("chooser");
    setAddAberto(false);
    setNovaAcao("");
  }

  const contagem = (label: string) => sel.filter((s2) => s2.rubrica.toLowerCase() === label.toLowerCase()).length;
  const addAcao = (label: string) =>
    setSel((old) => [...old, { rubrica: label, detalhe: "", requerido: "", bloqueada: false, motivo: "rubrica_invalida" }]);
  const removerSel = (idx: number) => setSel((old) => old.filter((_, i) => i !== idx));
  const patchSel = (idx: number, campo: keyof Sel, valor: any) =>
    setSel((old) => old.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));

  // Nova AÇÃO PADRÃO: entra no catálogo global (vale pra todos) e já é
  // atrelada a este cliente.
  const criarAcaoPadrao = async () => {
    const nome = novaAcao.trim();
    if (!nome) { toast.error("Escreva o nome da ação."); return; }
    if (catalogo.some((c) => c.toLowerCase() === nome.toLowerCase())) {
      toast.error("Essa ação já existe no catálogo.");
      return;
    }
    setCriandoAcao(true);
    const { error } = await (supabase.from("acoes_ajuizaveis" as any) as any)
      .insert({ nome, created_by: editorId });
    setCriandoAcao(false);
    if (error) { toast.error("Não consegui criar: " + error.message); return; }
    await carregarCatalogo();
    addAcao(nome);
    setNovaAcao("");
    setAddAberto(false);
    toast.success("Ação criada — agora aparece para todos.");
  };

  const ajuizaveis = sel.filter((s2) => !s2.bloqueada).length;

  // Refazer = abre o Finder no modo ESTEIRA (sessão persistente) no contexto
  // deste cliente. O Finder puxa a pasta do Drive dele pro gatilho e a nova
  // análise vira uma demanda pronta pra esse cliente na esteira.
  const irFinderEsteira = () => {
    if (!cliente) return;
    onClose();
    navigate(`/finder?cliente=${cliente.id}&nome=${encodeURIComponent(cliente.nome)}`);
  };

  const salvarManual = async () => {
    if (!cliente) return;
    if (sel.length === 0) {
      toast.error("Selecione ao menos uma ação.");
      return;
    }
    // O REQUERIDO é obrigatório: é ele que diz contra quem a ação vai.
    const semRequerido = sel.filter((s2) => !s2.requerido.trim()).length;
    if (semRequerido > 0) {
      toast.error(`Informe o requerido de ${semRequerido === 1 ? "1 ação" : `${semRequerido} ações`} (contra quem será ajuizada).`);
      return;
    }
    setSalvando(true);
    const analise = {
      origem: "manual",
      rubricas: sel.map((s2) => ({
        rubrica: s2.rubrica,
        detalhe: s2.detalhe.trim() || null,
        requerido: s2.requerido.trim(),
        valor: null,
        bloqueada: s2.bloqueada,
        motivo: s2.bloqueada ? s2.motivo : null,
      })),
    };
    const { data, error } = await supabase.rpc("fn_refazer_analise_comercial" as any, {
      p_cliente_id: cliente.id,
      p_analise: analise,
      p_editor: editorId,
    } as any);
    setSalvando(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    // O recálculo mexe no quadro de fechamento. Sem invalidar, o cache
    // persistido (staleTime 30s) segue mostrando o valor antigo.
    qc.invalidateQueries({ queryKey: ["fechamentos"] });
    const r = (data as any) || {};
    toast.success(
      r.acao === "atualizado"
        ? `Análise refeita — fechamento de ${r.responsavel || "captador"}: ${r.antes} → ${r.depois} ação(ões).`
        : `Análise salva e fechamento criado (${r.depois} ação(ões)).`,
      { duration: 4000 },
    );
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[88dvh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {stage === "manual" && (
              <button onClick={() => setStage("chooser")} className="text-muted-foreground hover:text-foreground" aria-label="Voltar">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <ClipboardList className="h-5 w-5 text-primary" />
            Ações ajuizáveis — {cliente?.nome}
          </DialogTitle>
          <DialogDescription>
            {stage === "chooser"
              ? "Edite as ações na hora ou refaça a análise do zero no Finder."
              : "Atrele as ações, diga contra quem cada uma vai e salve. Cada mudança recalcula o fechamento (mantendo quem captou)."}
          </DialogDescription>
        </DialogHeader>

        {stage === "chooser" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <button
              onClick={() => setStage("manual")}
              className="text-left rounded-xl border border-primary/30 bg-gradient-to-br from-primary/[0.13] to-transparent hover:border-primary/55 p-4 transition-colors"
            >
              <div className="h-10 w-10 rounded-xl bg-primary/15 ring-1 ring-primary/30 text-primary flex items-center justify-center mb-3">
                <Pencil className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold">Editar ações atuais</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Adicione ou remova ações na hora. Cada mudança reflete direto no quadro de fechamentos.
              </p>
            </button>
            <button
              onClick={irFinderEsteira}
              className="text-left rounded-xl border border-white/[0.08] bg-white/[0.03] hover:border-primary/40 hover:bg-white/[0.05] p-4 transition-colors"
            >
              <div className="h-10 w-10 rounded-xl bg-white/[0.05] ring-1 ring-white/10 text-foreground/80 flex items-center justify-center mb-3">
                <Building2 className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold">Refazer no Finder (Bradesco)</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Abre o Finder na esteira com a pasta do Drive do cliente já no gatilho. Gera uma nova análise pronta pra ele.
              </p>
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-1 py-1 shrink-0">
              <span className="text-[11px] text-muted-foreground">
                {ajuizaveis} ajuizável(is) = <strong className="text-foreground">{Math.max(1, ajuizaveis)}</strong> ação(ões) no fechamento
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
              {/* GRADE DE AÇÕES — mesmo padrão do Writer: clicar atrela (pode repetir) */}
              <div>
                <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-2">
                  Selecione as ações ({sel.length})
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {catalogo.map((label) => {
                    const n = contagem(label);
                    return (
                      <button
                        key={label}
                        onClick={() => addAcao(label)}
                        title="Clique para atrelar (pode repetir para réus diferentes)"
                        className={`text-left rounded-lg border px-3 py-2.5 flex items-center gap-2 transition-colors ${
                          n > 0 ? "border-primary/40 bg-primary/[0.07]" : "border-border hover:border-primary/30 hover:bg-white/[0.03]"
                        }`}
                      >
                        <span className={`h-4 w-4 rounded-[5px] flex items-center justify-center shrink-0 ${n > 0 ? "bg-primary text-primary-foreground" : "ring-1 ring-white/20"}`}>
                          {n > 0 && <Check className="h-3 w-3" />}
                        </span>
                        <span className="text-[12.5px] flex-1 min-w-0 leading-snug">{label}</span>
                        {n > 0 && (
                          <span className="shrink-0 text-[10px] tabular-nums rounded-full bg-primary/20 text-primary px-1.5 py-0.5">{n}</span>
                        )}
                      </button>
                    );
                  })}

                  {/* NOVA AÇÃO PADRÃO — card do mesmo tamanho; entra no catálogo global */}
                  {addAberto ? (
                    <div className="rounded-lg border border-primary/40 bg-primary/[0.05] px-3 py-2 flex items-center gap-2">
                      <Input
                        value={novaAcao}
                        onChange={(e) => setNovaAcao(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") criarAcaoPadrao(); if (e.key === "Escape") { setAddAberto(false); setNovaAcao(""); } }}
                        placeholder="Nome da nova ação"
                        autoFocus
                        className="h-8 text-[12.5px]"
                      />
                      <Button size="sm" className="h-8 px-2 shrink-0" onClick={criarAcaoPadrao} disabled={criandoAcao}>
                        {criandoAcao ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </Button>
                      <button onClick={() => { setAddAberto(false); setNovaAcao(""); }} className="text-muted-foreground hover:text-foreground shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddAberto(true)}
                      title="Cria uma ação padrão que passa a aparecer para todos os usuários"
                      className="text-left rounded-lg border border-dashed border-primary/40 bg-primary/[0.03] px-3 py-2.5 flex items-center gap-2 hover:bg-primary/[0.08] transition-colors"
                    >
                      <span className="h-4 w-4 rounded-[5px] ring-1 ring-primary/40 text-primary flex items-center justify-center shrink-0">
                        <Plus className="h-3 w-3" />
                      </span>
                      <span className="text-[12.5px] text-primary leading-snug">Nova ação padrão</span>
                    </button>
                  )}
                </div>
              </div>

              {/* AÇÕES ATRELADAS — detalhe + REQUERIDO (obrigatório) */}
              <div>
                <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-2">
                  Ações atreladas ({sel.length})
                </p>
                {sel.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground rounded-lg border border-dashed border-border px-3 py-6 text-center">
                    Clique nas ações acima para atrelá-las. Elas aparecem aqui.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sel.map((it, i) => (
                      <div key={i} className={`rounded-lg border px-3 py-2.5 space-y-2 ${it.bloqueada ? "border-amber-400/30 bg-amber-400/[0.04]" : "border-border bg-white/[0.02]"}`}>
                        <div className="flex items-center gap-2">
                          <span className={`text-[13px] font-medium flex-1 min-w-0 truncate ${it.bloqueada ? "line-through decoration-amber-400/50 text-foreground/70" : ""}`}>
                            {it.rubrica}
                          </span>
                          <button
                            onClick={() => patchSel(i, "bloqueada", !it.bloqueada)}
                            title={it.bloqueada ? "Marcar como ajuizável" : "Bloquear esta ação"}
                            className={`shrink-0 text-[10px] px-2 py-1 rounded-md border transition-colors ${
                              it.bloqueada ? "border-amber-400/40 bg-amber-400/15 text-amber-300" : "border-border text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <Lock className="h-3 w-3 inline mr-1" />{it.bloqueada ? "Bloqueada" : "Bloquear"}
                          </button>
                          <button onClick={() => removerSel(i)} aria-label="remover" className="shrink-0 text-muted-foreground hover:text-rose-400">
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {it.bloqueada && (
                          <select
                            value={it.motivo}
                            onChange={(e) => patchSel(i, "motivo", e.target.value as Motivo)}
                            className="w-full text-[11px] bg-background border border-amber-400/40 rounded-md px-2 py-1.5 text-amber-200"
                          >
                            {(Object.keys(MOTIVO_LABEL) as Motivo[]).map((m) => (
                              <option key={m} value={m}>{MOTIVO_LABEL[m]}</option>
                            ))}
                          </select>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10.5px] text-primary/90 font-medium">
                              Requerido <span className="text-rose-400">*</span> <span className="text-muted-foreground font-normal">· contra quem</span>
                            </label>
                            <Input
                              value={it.requerido}
                              onChange={(e) => patchSel(i, "requerido", e.target.value)}
                              placeholder="Ex.: Bradesco"
                              className={`h-8 text-[12.5px] ${!it.requerido.trim() ? "border-rose-400/40" : ""}`}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10.5px] text-muted-foreground font-medium">Detalhe <span className="font-normal">· opcional</span></label>
                            <Input
                              value={it.detalhe}
                              onChange={(e) => patchSel(i, "detalhe", e.target.value)}
                              placeholder="Ex.: cliente não reconhece"
                              className="h-8 text-[12.5px]"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-2 pt-2">
              <Button variant="ghost" onClick={() => setStage("chooser")} disabled={salvando}>Voltar</Button>
              <Button onClick={salvarManual} disabled={salvando}>
                {salvando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                Salvar e recalcular
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
