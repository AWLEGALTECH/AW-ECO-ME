import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Building2, ListPlus, ClipboardList, ChevronLeft, ChevronRight, Loader2, Check, Plus, X, Lock, FileSignature, AlertTriangle, LifeBuoy, Minus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { RUBRICAS_FECHAMENTO } from "@/lib/rubricasFechamento";
import { BuscaRubrica, filtraPorBusca } from "@/components/BuscaRubrica";

const mesCorrente = () =>
  new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

type Motivo = "rubrica_invalida" | "ja_ajuizada" | "cliente_nao_quer";
const MOTIVO_LABEL: Record<Motivo, string> = {
  rubrica_invalida: "Rúbrica inválida",
  ja_ajuizada: "Já ajuizada",
  cliente_nao_quer: "Cliente não quer",
};

// Cada AÇÃO selecionada (pode repetir a mesma ação para réus diferentes).
interface Sel { rubrica: string; detalhe: string; requerido: string; bloqueada: boolean; motivo: Motivo; contrato_id: string | null }

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
      contrato_id: (r?.contrato_id && String(r.contrato_id)) || null,
    }))
    .filter((r) => r.rubrica);
}

export interface ContratoOpt {
  id: string;
  modalidade?: string | null;
  data_assinatura?: string | null;
  reus?: string[] | null;
  status?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  cliente: { id: string; nome: string; analise_comercial?: any } | null;
  contratos?: ContratoOpt[];
  onSaved: () => void;
  editorId: string | null;
  // Nome de quem edita — usado no chamado de contrato faltante.
  editorNome?: string | null;
}

export function RefazerAnaliseComercialDialog({ open, onClose, cliente, contratos = [], onSaved, editorId, editorNome }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [stage, setStage] = useState<"chooser" | "contrato" | "sem_contrato" | "manual" | "conferir">("chooser");
  const [busca, setBusca] = useState("");
  const [abrindoChamado, setAbrindoChamado] = useState(false);
  // Já existe chamado de contrato faltante em aberto pra este cliente?
  const [chamadoAberto, setChamadoAberto] = useState(false);
  const [checandoChamado, setChecandoChamado] = useState(false);
  // Toda ação nasce presa a um CONTRATO (o instrumento procuratório que nos dá
  // poderes). Editar exige escolher de qual contrato são as ações.
  const [contratoSel, setContratoSel] = useState<string | null>(null);
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

  // ── Responsabilização das ações NOVAS ──────────────────────────────────────
  // Quem digita não é necessariamente quem leva o crédito: às vezes a ação é
  // competência de quem a descobriu agora, às vezes é complemento do trabalho
  // de quem captou o cliente. Por isso a escolha é explícita — sem padrão
  // automático pra nenhum dos dois lados.
  const [equipe, setEquipe] = useState<{ id: string; nome: string }[]>([]);
  const [donoAnalise, setDonoAnalise] = useState<{ id: string; nome: string } | null>(null);
  const [creditarA, setCreditarA] = useState<string | null>(null);
  const [motivoRemocao, setMotivoRemocao] = useState("");

  useEffect(() => {
    if (!open || !cliente) return;
    let cancel = false;
    (async () => {
      const [{ data: profs }, { data: fech }] = await Promise.all([
        supabase.from("profiles").select("id, nome").order("nome"),
        (supabase.from("fechamentos" as never) as never as any)
          .select("user_id, responsavel")
          .eq("cliente_id", cliente.id)
          .order("data", { ascending: true })
          .limit(1),
      ]);
      if (cancel) return;
      const lista = ((profs || []) as any[]).map((p) => ({ id: String(p.id), nome: String(p.nome || "—") }));
      setEquipe(lista);
      const dono = (fech || [])[0];
      setDonoAnalise(dono?.user_id
        ? { id: String(dono.user_id), nome: lista.find((p) => p.id === String(dono.user_id))?.nome || String(dono.responsavel || "—") }
        : null);
    })();
    return () => { cancel = true; };
  }, [open, cliente?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [sel, setSel] = useState<Sel[]>([]);
  // Foto de como a análise estava ao abrir — base do diff de conferência.
  const [selOriginal, setSelOriginal] = useState<Sel[]>([]);
  // Reinicia quando abre / troca de cliente.
  const [chaveInit, setChaveInit] = useState<string>("");
  const chaveAtual = `${cliente?.id || ""}|${open}`;
  if (open && chaveAtual !== chaveInit) {
    setChaveInit(chaveAtual);
    const inicial = rubricasDaAnalise(cliente?.analise_comercial);
    setSel(inicial);
    setSelOriginal(inicial);
    setBusca("");
    setStage("chooser");
    setContratoSel(null);
    setAddAberto(false);
    setNovaAcao("");
    setCreditarA(null);
    setMotivoRemocao("");
  }

  // Só as ações DO contrato escolhido entram no editor; as dos outros ficam
  // intactas e são recompostas no salvamento.
  const doContrato = sel.filter((s2) => s2.contrato_id === contratoSel);
  const deOutros = sel.filter((s2) => s2.contrato_id !== contratoSel);
  const fmtDataCt = (d?: string | null) => {
    if (!d) return null;
    const dt = new Date(`${d}T00:00:00`);
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("pt-BR");
  };
  const rotuloCt = (c: ContratoOpt) =>
    [(c.reus || []).filter(Boolean).join(", ") || "réu não informado",
     fmtDataCt(c.data_assinatura) ? `assinado em ${fmtDataCt(c.data_assinatura)}` : null]
      .filter(Boolean).join(" · ");

  const contagem = (label: string) => doContrato.filter((s2) => s2.rubrica.toLowerCase() === label.toLowerCase()).length;
  const addAcao = (label: string) =>
    setSel((old) => [...old, { rubrica: label, detalhe: "", requerido: "", bloqueada: false, motivo: "rubrica_invalida", contrato_id: contratoSel }]);
  // Os índices da UI são os da lista FILTRADA — converte pro índice real.
  const idxReal = (i: number) => sel.indexOf(doContrato[i]);
  const removerSel = (i: number) => { const r = idxReal(i); setSel((old) => old.filter((_, k) => k !== r)); };
  const patchSel = (i: number, campo: keyof Sel, valor: any) => {
    const r = idxReal(i);
    setSel((old) => old.map((it, k) => (k === r ? { ...it, [campo]: valor } : it)));
  };

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

  const catalogoFiltrado = useMemo(
    () => filtraPorBusca(catalogo, busca, (c) => c),
    [catalogo, busca],
  );

  // Diff da conferência: o que entra, o que sai e o que fica. Compara pelo par
  // AÇÃO + REQUERIDO, já que a mesma ação pode repetir para réus diferentes.
  const chaveAcao = (x: Sel) => `${x.rubrica.toLowerCase()}||${x.requerido.trim().toLowerCase()}`;
  const diff = useMemo(() => {
    const antes = new Map<string, Sel>();
    const contaAntes = new Map<string, number>();
    selOriginal.forEach((x) => { antes.set(chaveAcao(x), x); contaAntes.set(chaveAcao(x), (contaAntes.get(chaveAcao(x)) || 0) + 1); });
    const contaDepois = new Map<string, number>();
    const depois = new Map<string, Sel>();
    sel.forEach((x) => { depois.set(chaveAcao(x), x); contaDepois.set(chaveAcao(x), (contaDepois.get(chaveAcao(x)) || 0) + 1); });

    const adicionadas: Sel[] = [];
    const removidas: Sel[] = [];
    const mantidas: Sel[] = [];
    for (const [k, n] of contaDepois) {
      const antesN = contaAntes.get(k) || 0;
      const item = depois.get(k)!;
      for (let i = 0; i < n - antesN; i++) adicionadas.push(item);
      for (let i = 0; i < Math.min(n, antesN); i++) mantidas.push(item);
    }
    for (const [k, n] of contaAntes) {
      const depoisN = contaDepois.get(k) || 0;
      const item = antes.get(k)!;
      for (let i = 0; i < n - depoisN; i++) removidas.push(item);
    }
    return { adicionadas, removidas, mantidas };
  }, [sel, selOriginal]);

  const ajuizaveis = sel.filter((s2) => !s2.bloqueada).length;
  const ajuizaveisCt = doContrato.filter((s2) => !s2.bloqueada).length;

  // Refazer = abre o Finder no modo ESTEIRA (sessão persistente) no contexto
  // deste cliente. O Finder puxa a pasta do Drive dele pro gatilho e a nova
  // análise vira uma demanda pronta pra esse cliente na esteira.
  const irFinderEsteira = () => {
    if (!cliente) return;
    onClose();
    navigate(`/finder?cliente=${cliente.id}&nome=${encodeURIComponent(cliente.nome)}`);
  };

  // Valida aqui e leva pra conferência — o salvamento em si só acontece
  // depois que a pessoa vê o que entra e o que sai.
  const irConferir = () => {
    if (doContrato.length === 0) {
      toast.error("Selecione ao menos uma ação para este contrato.");
      return;
    }
    const semRequerido = doContrato.filter((s2) => !s2.requerido.trim()).length;
    if (semRequerido > 0) {
      toast.error(`Informe o requerido de ${semRequerido === 1 ? "1 ação" : `${semRequerido} ações`} (contra quem será ajuizada).`);
      return;
    }
    setStage("conferir");
  };

  const salvarManual = async () => {
    if (!cliente) return;
    // Sem contrato é permitido: o cliente pode não ter o instrumento ainda, e
    // isso não pode custar a definição das ações. Elas ficam com contrato_id
    // nulo e aparecem no bloco "Ações sem contrato" até serem atribuídas.
    if (doContrato.length === 0) {
      toast.error("Selecione ao menos uma ação para este contrato.");
      return;
    }
    // O REQUERIDO é obrigatório: é ele que diz contra quem a ação vai.
    const semRequerido = doContrato.filter((s2) => !s2.requerido.trim()).length;
    if (semRequerido > 0) {
      toast.error(`Informe o requerido de ${semRequerido === 1 ? "1 ação" : `${semRequerido} ações`} (contra quem será ajuizada).`);
      return;
    }
    // A responsabilização é obrigatória quando há ação nova: é ela que decide
    // no fechamento de quem a ação vai cair.
    if (diff.adicionadas.length > 0 && !creditarA) {
      toast.error("Escolha a quem atribuir as ações novas.");
      return;
    }
    setSalvando(true);
    const analise = {
      origem: "manual",
      // Preserva as ações dos OUTROS contratos; substitui só as deste.
      rubricas: [...deOutros, ...doContrato].map((s2) => ({
        rubrica: s2.rubrica,
        detalhe: s2.detalhe.trim() || null,
        requerido: s2.requerido.trim(),
        valor: null,
        bloqueada: s2.bloqueada,
        motivo: s2.bloqueada ? s2.motivo : null,
        contrato_id: s2.contrato_id,
      })),
    };
    const { data, error } = await supabase.rpc("fn_editar_analise_comercial" as any, {
      p_cliente_id: cliente.id,
      p_analise: analise,
      p_editor: editorId,
      p_creditar_a: creditarA,
      p_motivo_remocao: motivoRemocao.trim() || null,
    } as any);
    setSalvando(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    // O recálculo mexe no quadro de fechamento. Sem invalidar, o cache
    // persistido (staleTime 30s) segue mostrando o valor antigo.
    qc.invalidateQueries({ queryKey: ["fechamentos"] });
    const r = (data as any) || {};
    const partes = [
      r.novas > 0 ? `${r.novas} ${r.novas === 1 ? "ação nova" : "ações novas"} para ${r.creditadas_a || "—"}` : null,
      r.removidas > 0 ? `${r.removidas} ${r.removidas === 1 ? "retirada" : "retiradas"}` : null,
    ].filter(Boolean);
    toast.success(partes.length ? `Análise salva — ${partes.join(" · ")}.` : "Análise salva.", { duration: 4000 });
    onSaved();
    onClose();
  };

  const tituloChamado = cliente ? `Contrato faltante — ${cliente.nome}` : "";

  // Rota manual. Sem contrato NÃO bloqueia: pergunta se segue mesmo assim.
  // Antes de perguntar, verifica se a falta já foi reportada — um chamado por
  // rubrica seria ruído; um por cliente basta pra ninguém esquecer.
  const irManual = async () => {
    if (contratos.length === 0) {
      setStage("sem_contrato");
      if (cliente) {
        setChecandoChamado(true);
        const { data } = await (supabase.from("chamados" as never) as never as any)
          .select("id, status")
          .eq("titulo", tituloChamado)
          .neq("status", "resolvido")
          .limit(1);
        setChamadoAberto(!!(data && data.length));
        setChecandoChamado(false);
      }
      return;
    }
    if (contratos.length === 1) { setContratoSel(contratos[0].id); setStage("manual"); return; }
    setStage("contrato");
  };

  // Segue sem contrato. Abre o chamado só se ainda não existir um em aberto
  // pra este cliente — nas edições seguintes o aviso já está na fila.
  const seguirSemContratoEAvisar = async () => {
    if (!cliente) return;
    if (chamadoAberto) {
      toast.info("Já existe um chamado de contrato faltante pra este cliente");
      setContratoSel(null);
      setStage("manual");
      return;
    }
    setAbrindoChamado(true);
    const { error } = await (supabase.from("chamados" as never) as never as any).insert({
      titulo: tituloChamado,
      tipo: "outro",
      sistema: "Clientes",
      observacoes:
        `Ações ajuizáveis foram definidas para ${cliente.nome} sem contrato cadastrado. ` +
        `Cadastrar o instrumento e atrelar as ações a ele.`,
      created_by: editorId,
      autor_nome: editorNome || null,
    });
    setAbrindoChamado(false);
    if (error) toast.error("Ações liberadas, mas o chamado falhou: " + error.message);
    else { toast.success("Chamado de contrato faltante aberto"); setChamadoAberto(true); }
    setContratoSel(null);
    setStage("manual");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[88dvh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {stage !== "chooser" && (
              <button onClick={() => setStage(stage === "conferir" ? "manual" : stage === "manual" && contratos.length > 1 ? "contrato" : "chooser")} className="text-muted-foreground hover:text-foreground" aria-label="Voltar">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <ClipboardList className="h-5 w-5 text-primary" />
            Ações ajuizáveis — {cliente?.nome}
          </DialogTitle>
          <DialogDescription>
            {stage === "chooser"
              ? "Adicione ou edite as ações deste cliente. Escolha por onde."
              : stage === "sem_contrato"
              ? "Este cliente ainda não tem contrato cadastrado."
              : stage === "conferir"
              ? "Confira o que muda antes de gravar. Isto recalcula o fechamento do cliente."
              : stage === "contrato"
              ? "Cada ação pertence a um contrato do cliente. Escolha qual deles você vai editar."
              : "Atrele as ações e diga contra quem cada uma vai. Na conferência você escolhe a quem as ações novas serão creditadas."}
          </DialogDescription>
        </DialogHeader>

        {stage === "chooser" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <button
              onClick={irManual}
              className="text-left rounded-xl border border-primary/30 bg-gradient-to-br from-primary/[0.13] to-transparent hover:border-primary/55 p-4 transition-colors"
            >
              <div className="h-10 w-10 rounded-xl bg-primary/15 ring-1 ring-primary/30 text-primary flex items-center justify-center mb-3">
                <ListPlus className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold">Definir aqui mesmo</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Monte a lista na mão: adicione ações novas, ajuste ou remova as que já existem.
                Cada mudança reflete direto no quadro de fechamentos.
              </p>
            </button>
            <button
              onClick={irFinderEsteira}
              className="text-left rounded-xl border border-white/[0.08] bg-white/[0.03] hover:border-primary/40 hover:bg-white/[0.05] p-4 transition-colors"
            >
              <div className="h-10 w-10 rounded-xl bg-white/[0.05] ring-1 ring-white/10 text-foreground/80 flex items-center justify-center mb-3">
                <Building2 className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold">Levantar pelo Finder (Bradesco)</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Abre o Finder na esteira com a pasta do Drive já no gatilho. Ele lê os extratos e
                devolve a lista pronta, substituindo a atual.
              </p>
            </button>
          </div>
        ) : stage === "sem_contrato" ? (
          <div className="space-y-3 py-2">
            <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {cliente?.nome} não tem contrato cadastrado
                </p>
                <p className="text-[12px] text-muted-foreground mt-1">
                  A ação é ajuizada com base no instrumento que nos dá poderes. Dá pra definir as
                  ações agora e atrelar o contrato depois — mas alguém precisa lembrar de cadastrá-lo.
                </p>
              </div>
            </div>

            <button
              onClick={seguirSemContratoEAvisar}
              disabled={abrindoChamado || checandoChamado}
              className="w-full text-left rounded-xl border border-primary/30 bg-gradient-to-br from-primary/[0.13] to-transparent hover:border-primary/55 p-4 flex items-center gap-3 transition-colors disabled:opacity-60"
            >
              <span className="h-10 w-10 rounded-xl bg-primary/15 ring-1 ring-primary/30 text-primary flex items-center justify-center shrink-0">
                {abrindoChamado || checandoChamado
                  ? <Loader2 className="h-5 w-5 animate-spin" />
                  : chamadoAberto ? <Check className="h-5 w-5" /> : <LifeBuoy className="h-5 w-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">
                  {checandoChamado ? "Verificando…"
                    : abrindoChamado ? "Abrindo chamado…"
                    : chamadoAberto ? "Sim, continuar" : "Sim, continuar e abrir chamado"}
                </span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">
                  {chamadoAberto
                    ? "A falta já foi reportada — o chamado deste cliente está em aberto. Não abrimos outro."
                    : <>As ações ficam salvas sem contrato e um chamado "Contrato faltante — {cliente?.nome}" entra na fila, pra ninguém esquecer.</>}
                </span>
              </span>
            </button>

            <button
              onClick={() => setStage("chooser")}
              disabled={abrindoChamado}
              className="w-full text-left rounded-xl border border-white/[0.08] bg-white/[0.03] hover:border-white/[0.16] p-4 flex items-center gap-3 transition-colors disabled:opacity-60"
            >
              <span className="h-10 w-10 rounded-xl bg-white/[0.05] ring-1 ring-white/10 text-muted-foreground flex items-center justify-center shrink-0">
                <FileSignature className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Não, vou cadastrar o contrato antes</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">
                  Fecha isto e volta pra ficha, onde o contrato é cadastrado.
                </span>
              </span>
            </button>
          </div>
        ) : stage === "contrato" ? (
          <div className="space-y-2 py-1 overflow-y-auto">
            <p className="text-[12px] text-muted-foreground">
              Toda ação é ajuizada com base num contrato — o instrumento que nos dá poderes para
              representar o cliente. Escolha de qual contrato você vai editar as ações.
            </p>
            {contratos.map((c) => {
              const n = sel.filter((s2) => s2.contrato_id === c.id).length;
              return (
                <button
                  key={c.id}
                  onClick={() => { setContratoSel(c.id); setStage("manual"); }}
                  className="w-full text-left rounded-xl border border-white/[0.08] bg-white/[0.02] hover:border-primary/40 hover:bg-white/[0.04] p-3.5 flex items-center gap-3 transition-colors"
                >
                  <span className="h-10 w-10 rounded-xl bg-primary/10 ring-1 ring-primary/20 text-primary flex items-center justify-center shrink-0">
                    <FileSignature className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      Contrato {c.modalidade ? `de ${c.modalidade}` : ""}
                    </span>
                    <span className="block text-[11.5px] text-muted-foreground mt-0.5 truncate">{rotuloCt(c)}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {n} ação(ões)
                  </span>
                </button>
              );
            })}
            {sel.some((s2) => !s2.contrato_id) && (
              <button
                onClick={() => { setContratoSel(null); setStage("manual"); }}
                className="w-full text-left rounded-xl border border-dashed border-amber-400/30 bg-amber-400/[0.04] p-3.5 flex items-center gap-3 hover:bg-amber-400/[0.08] transition-colors"
              >
                <span className="h-10 w-10 rounded-xl bg-amber-400/10 ring-1 ring-amber-400/25 text-amber-400 flex items-center justify-center shrink-0">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground/85">Ações sem contrato</span>
                  <span className="block text-[11.5px] text-muted-foreground mt-0.5">
                    Ações antigas, sem contrato de origem — abra para atribuí-las a um contrato.
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {sel.filter((s2) => !s2.contrato_id).length} ação(ões)
                </span>
              </button>
            )}
          </div>
        ) : stage === "manual" ? (
          <>
            <div className="flex items-center justify-between px-1 py-1 shrink-0">
              <span className="text-[11px] text-muted-foreground truncate">
                {contratoSel
                  ? <>Editando o <strong className="text-foreground">contrato {contratos.find((c) => c.id === contratoSel)?.modalidade || ""} · {rotuloCt(contratos.find((c) => c.id === contratoSel) || { id: "" })}</strong></>
                  : <>Editando as <strong className="text-amber-300">ações sem contrato</strong></>}
                {" · "}{ajuizaveisCt} nesta · {ajuizaveis} no total = <strong className="text-foreground">{Math.max(1, ajuizaveis)}</strong> ação(ões) no fechamento
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
              {/* GRADE DE AÇÕES — mesmo padrão do Writer: clicar atrela (pode repetir) */}
              <div>
                <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground mb-2">
                  Selecione as ações ({doContrato.length})
                </p>
                <div className="mb-2">
                  <BuscaRubrica
                    valor={busca}
                    onChange={setBusca}
                    total={catalogo.length}
                    filtrados={catalogoFiltrado.length}
                  />
                </div>
                {busca.trim() && catalogoFiltrado.length === 0 && (
                  <p className="text-[12px] text-muted-foreground text-center py-6">
                    Nenhuma ação com “{busca.trim()}”. Crie como ação padrão abaixo.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {catalogoFiltrado.map((label) => {
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
                  Ações atreladas a este contrato ({doContrato.length})
                </p>
                {doContrato.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground rounded-lg border border-dashed border-border px-3 py-6 text-center">
                    Clique nas ações acima para atrelá-las. Elas aparecem aqui.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {doContrato.map((it, i) => (
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
              <Button variant="ghost" onClick={() => setStage(contratos.length > 1 ? "contrato" : "chooser")} disabled={salvando}>Voltar</Button>
              <Button onClick={irConferir} disabled={salvando}>
                <ChevronRight className="h-4 w-4 mr-1.5" />
                Conferir e salvar
              </Button>
            </DialogFooter>
          </>
        ) : null}
        {stage === "conferir" && (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 py-1">
              <div className="rounded-xl border border-border bg-card/40 p-3.5">
                <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Como vai ficar</p>
                <p className="text-sm mt-1">
                  <strong className="text-foreground text-lg tabular-nums">{sel.length}</strong>{" "}
                  {sel.length === 1 ? "ação ajuizável" : "ações ajuizáveis"} para {cliente?.nome}
                  {" · "}
                  <span className="text-muted-foreground">
                    {ajuizaveis} {ajuizaveis === 1 ? "conta" : "contam"} no fechamento
                  </span>
                </p>
              </div>

              {diff.adicionadas.length === 0 && diff.removidas.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground text-center py-4">
                  Nada muda na lista de ações — só os detalhes podem ter sido ajustados.
                </p>
              ) : null}

              {diff.adicionadas.length > 0 && (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] overflow-hidden">
                  <div className="px-3.5 py-2 flex items-center gap-2 border-b border-emerald-500/15">
                    <Plus className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-[11px] uppercase tracking-[0.12em] text-emerald-400 font-semibold">
                      Entrando ({diff.adicionadas.length})
                    </span>
                  </div>
                  <ul className="divide-y divide-emerald-500/10">
                    {diff.adicionadas.map((a, i) => (
                      <li key={`add-${i}`} className="px-3.5 py-2">
                        <p className="text-[13px] text-foreground">{a.rubrica}</p>
                        <p className="text-[11px] text-muted-foreground">
                          contra {a.requerido || "—"}{a.detalhe ? ` · ${a.detalhe}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>

                  {/* De quem é o crédito. Sem escolha padrão: nem sempre é de
                      quem digitou, nem sempre de quem captou o cliente. */}
                  <div className="px-3.5 py-3 border-t border-emerald-500/15 bg-black/20">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      {diff.adicionadas.length === 1 ? "Esta ação conta para quem?" : `Estas ${diff.adicionadas.length} ações contam para quem?`}
                    </p>
                    <p className="text-[11px] text-muted-foreground/80 mt-0.5 leading-snug">
                      Entram no fechamento de <strong className="text-foreground/90">{mesCorrente()}</strong>, o mês em que foram descobertas.
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {equipe.map((p) => {
                        const ativo = creditarA === p.id;
                        const ehDono = donoAnalise?.id === p.id;
                        const ehEditor = editorId === p.id;
                        return (
                          <button
                            key={p.id}
                            onClick={() => setCreditarA(p.id)}
                            className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                              ativo
                                ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200"
                                : "border-white/[0.08] bg-white/[0.02] text-muted-foreground hover:border-emerald-400/30 hover:text-foreground"
                            }`}
                          >
                            <span className="block text-[12.5px] font-medium">{p.nome}</span>
                            {(ehDono || ehEditor) && (
                              <span className="block text-[10px] opacity-70">
                                {[ehDono ? "captou o cliente" : null, ehEditor ? "está editando" : null].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {!creditarA && (
                      <p className="text-[11px] text-amber-300 mt-2 flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3 shrink-0" /> Escolha a quem atribuir antes de salvar.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {diff.removidas.length > 0 && (
                <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.05] overflow-hidden">
                  <div className="px-3.5 py-2 flex items-center gap-2 border-b border-rose-500/15">
                    <Minus className="h-3.5 w-3.5 text-rose-400" />
                    <span className="text-[11px] uppercase tracking-[0.12em] text-rose-400 font-semibold">
                      Saindo ({diff.removidas.length})
                    </span>
                  </div>
                  <ul className="divide-y divide-rose-500/10">
                    {diff.removidas.map((r, i) => (
                      <li key={`rem-${i}`} className="px-3.5 py-2">
                        <p className="text-[13px] text-muted-foreground line-through decoration-rose-400/50">{r.rubrica}</p>
                        <p className="text-[11px] text-muted-foreground/70">
                          contra {r.requerido || "—"}{r.detalhe ? ` · ${r.detalhe}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>

                  {/* Quem tirou fica registrado de qualquer jeito; o porquê é
                      opcional, mas é ele que evita a pergunta daqui a um mês. */}
                  <div className="px-3.5 py-3 border-t border-rose-500/15 bg-black/20">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Por que saiu? (opcional)</p>
                    <Input
                      value={motivoRemocao}
                      onChange={(e) => setMotivoRemocao(e.target.value)}
                      placeholder="ex.: já ajuizada em outro processo"
                      className="mt-1.5 h-8 text-[12.5px]"
                    />
                    <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                      Fica registrado que <strong className="text-foreground/80">{editorNome || "você"}</strong> retirou
                      {diff.removidas.length === 1 ? " esta ação" : ` estas ${diff.removidas.length} ações`}, e elas saem do fechamento em que estavam.
                    </p>
                  </div>
                </div>
              )}

              {diff.mantidas.length > 0 && (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                  <div className="px-3.5 py-2 flex items-center gap-2 border-b border-white/[0.06]">
                    <Check className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-semibold">
                      Permanecem ({diff.mantidas.length})
                    </span>
                  </div>
                  <ul className="divide-y divide-white/[0.05]">
                    {diff.mantidas.map((m, i) => (
                      <li key={`keep-${i}`} className="px-3.5 py-2">
                        <p className="text-[13px] text-foreground/85">{m.rubrica}</p>
                        <p className="text-[11px] text-muted-foreground">
                          contra {m.requerido || "—"}{m.detalhe ? ` · ${m.detalhe}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <DialogFooter className="shrink-0 gap-2 pt-2">
              <Button variant="ghost" onClick={() => setStage("manual")} disabled={salvando}>Voltar e ajustar</Button>
              <Button onClick={salvarManual} disabled={salvando || (diff.adicionadas.length > 0 && !creditarA)}>
                {salvando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
                Confirmar e recalcular
              </Button>
            </DialogFooter>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
