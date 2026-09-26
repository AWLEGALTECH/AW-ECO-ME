import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { CATEGORIAS, THEME, matchCategoria, analyzeAll, parseDocumentoPDF } from "./parser.js";
import { reviewMatches, recoverMissingTransactions, autoCorrectTransactions, refineWithLLM } from "./reviewer.js";
import { PonteFinder, useVincular, periodoDosItens, nomeDeAba } from "./vincular.jsx";
import { SaguaoFinder } from "./Saguao.tsx";
import { ResultadosFinder } from "./Resultados.tsx";
import { JanelaDaRubrica } from "./JanelaDaRubrica.tsx";
import { RelatorioDoCliente } from "./RelatorioDoCliente.tsx";

// Fase B (AWFINDER REVISOR) — auditor IA via n8n com cross-check ULTRA.
// Workflow ebpSwVQvRb7vdSGP no n8n Oracle. Ver doc em reviewer.js.
const FINDER_LLM_URL = "https://n8n.awlegaltech.com.br/webhook/awfinder-revisor";

// Excel proíbe : \ / ? * [ ] em nomes de aba; máx 31 chars; não pode ser vazio.
// Necessário desde 2026-05-14, quando o label "Seguro / Vida e Previdência" passou a ter "/".
const sanitizeXlsSheetName = (name) => {
  const cleaned = String(name || "").replace(/[:\\/?*[\]]/g, "-").trim();
  const truncated = cleaned.slice(0, 31);
  return truncated || "Planilha";
};

/* ─────────────────────────────────────────────
   RUBRICAS NÃO AJUIZÁVEIS (feature recuperada do ME, 11/06/2026)
   A atendente/advogado marca uma rubrica que NÃO entra na ação (cliente já
   entrou com essa ação por outro advogado, ou não quer ajuizar). A rubrica
   fica amarela + riscada + cadeado e SAI dos totais, da planilha e do evento
   analysis-ready (o pré-protocolo não a leva pras filas/peça). A linha da
   rubrica e as janelas do cadeado moram em Resultados.tsx.
───────────────────────────────────────────── */
const MOTIVOS_ANULACAO = [
  { id: "ja_ajuizada", label: "Já ajuizada por outro advogado", sub: "Cliente já entrou com essa ação, então a rubrica não pode ser ajuizada de novo." },
  { id: "cliente_nao_quer", label: "Cliente não quer ajuizar", sub: "O cliente recusou a inclusão desta rubrica na ação." },
  /* Veio da análise comercial do ME, que já tinha este terceiro motivo: sem
     ele, uma rubrica bloqueada lá chegaria aqui com o código cru no cartão. */
  { id: "rubrica_invalida", label: "Rubrica inválida", sub: "Não é cobrança indevida de verdade: fica fora da ação." },
];

/* ─────────────────────────────────────────────
   ERROR BOUNDARY (previne tela branca no dashboard)
───────────────────────────────────────────── */
class DashboardErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="mt-6 rounded-2xl bg-red-500/[0.06] px-6 py-5 text-center ring-1 ring-inset ring-red-500/25">
          <p className="text-sm font-medium text-red-400">Erro ao renderizar o relatório</p>
          <p className="mt-1 text-xs text-muted-foreground">Tente recarregar a página. Se o problema persistir, entre em contato.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ─────────────────────────────────────────────
   MAIN APP
───────────────────────────────────────────── */
/**
 * O Finder dentro do AW.
 *
 * Ele era uma página à parte num iframe e conversava com o AW por endereço,
 * eventos na janela e arquivos enfiados no campo de envio. Agora cada uma
 * dessas conversas é uma prop (contrato em docs/finder-contrato.md):
 *
 *  contexto          { clienteId, clienteNome, driveFolderId, driveUrl } no
 *                    modo cliente; nulo no Finder solto e no da conversa
 *  ponte             o que o Finder pede ao banco, com o login de quem usa
 *                    (vincular, clientes, Drive). Nenhuma chave mora aqui.
 *  arquivosIniciais  PDFs que chegam na fila ao abrir (modo conversa)
 *  anuladasIniciais  { rubrica: motivo } bloqueadas na análise comercial; já
 *                    abrem como não ajuizáveis
 *  onLiberarAnulada  (rubrica) quando alguém libera uma dessas
 *  onAnalisePronta   o antigo evento `aw-finder:analysis-ready`
 *  onReset           o antigo evento `aw-finder:reset`
 *  acaoComercial     o botão de gerar a análise comercial, que a página põe
 *                    na barra de decisão do relatório (Finder solto)
 */
export default function App({
  contexto = null,
  ponte = null,
  arquivosIniciais = null,
  anuladasIniciais = null,
  onLiberarAnulada = null,
  onAnalisePronta = null,
  onReset = null,
  acaoComercial = null,
} = {}) {
  /* Callbacks do AW por referência: a página pode mandar uma função nova a
     cada render, e ela está nas dependências do efeito que avisa a análise
     pronta. Sem a referência, avisar faria o AW re-renderizar, que mandaria
     uma função nova, que avisaria de novo: o laço infinito que o comentário
     do `groups` mais abaixo já conta que aconteceu uma vez. */
  const onProntaRef = useRef(onAnalisePronta);
  const onResetRef = useRef(onReset);
  const onLiberarRef = useRef(onLiberarAnulada);
  onProntaRef.current = onAnalisePronta;
  onResetRef.current = onReset;
  onLiberarRef.current = onLiberarAnulada;
  const clienteId = contexto?.clienteId || null;
  const clienteNome = contexto?.clienteNome || null;
  const driveFolderId = contexto?.driveFolderId || null;
  const driveUrl = contexto?.driveUrl || null;
  const ponteComCliente = useMemo(
    () => (ponte ? { ...ponte, cliente: clienteId ? { id: clienteId, nome: clienteNome } : null } : null),
    [ponte, clienteId, clienteNome],
  );


  /* ── APP STATE ── */
  const [phase, setPhase] = useState("upload");
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [fileName, setFileName] = useState("");
  const [parseProgress, setParseProgress] = useState({ page:0, total:0 });
  /* O PROGRESSO REAL da análise (ver Saguao.tsx): cada extrato com a página em
     que está, a etapa atual e os lotes do auditor de IA. */
  const [progresso, setProgresso] = useState(null);
  const mexerNoProgresso = useCallback((fn) => setProgresso(p => (p ? fn(p) : p)), []);
  const umQuadro = () => new Promise(r => setTimeout(r, 40));
  /* "Pular auditor de IA": derruba o lote em andamento e o relatório sai só
     da análise por código (ver refineWithLLM). */
  const iaRef = useRef(null);
  const pularIa = useCallback(() => {
    if (!iaRef.current) return;
    mexerNoProgresso(p => ({ ...p, iaPulada: true }));
    iaRef.current.abort();
  }, [mexerNoProgresso]);
  const [grouped, setGrouped] = useState({});
  const [meta, setMeta] = useState({});
  const [activeModal, setActiveModal] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [downloadedCats, setDownloadedCats] = useState(new Set());
  const [selectedCats, setSelectedCats] = useState(new Set());
  const [batchExporting, setBatchExporting] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [multipleClientsWarning, setMultipleClientsWarning] = useState(null);
  // Titulares misturados por decisão do usuário ("Analisar mesmo assim"):
  // array de nomes -> banner de aviso persiste na tela de resultados.
  const [mixedTitulares, setMixedTitulares] = useState(null);
  // Resultados já parseados quando o conflito de titularidade foi detectado —
  // permite continuar SEM re-parsear (OCR de PDFs grandes leva 10-15 min).
  const pendingResultsRef = useRef(null);
  const [reviewReport, setReviewReport] = useState(null);
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  // excludedKeys: itens que o user marcou como falso positivo manualmente (X no card).
  // manualAdditions: { [catId]: [{data, valor, historico}, ...] } adições manuais
  // do user pra descontos que o parser perdeu e o reviewer não recuperou.
  const [excludedKeys, setExcludedKeys] = useState(new Set());
  const [manualAdditions, setManualAdditions] = useState({});
  const [addingToCatId, setAddingToCatId] = useState(null); // controla modal de add manual
  const [addForm, setAddForm] = useState({ data: "", valor: "", historico: "" });
  // movingItem: sobra do tempo em que mover era uma janela da página. Hoje a
  // janela de mover mora dentro da janela da rubrica (JanelaDaRubrica.tsx).
  // de seleção de destino. User pediu pra "juntar descontos" = mover de uma
  // categoria pra outra (ex: cobrança detectada como "outros" → mover pra "cesta").
  const [movingItem, setMovingItem] = useState(null);
  // Rubricas não ajuizáveis: {catId: {motivo}} — motivo: ja_ajuizada | cliente_nao_quer.
  // Anulada = amarela/riscada/cadeado, FORA de totais, planilha e analysis-ready.
  const [anuladas, setAnuladas] = useState({});
  const [motivoAnulacaoCat, setMotivoAnulacaoCat] = useState(null); // cat aguardando escolha de motivo
  const [cancelAnulacaoCat, setCancelAnulacaoCat] = useState(null); // cat aguardando confirmação de liberação
  // quais bloqueadas do comercial já foram aplicadas nesta análise (por nome)
  const aplicadasDoComercialRef = useRef(new Set());

  /* ── DRIVE DO CLIENTE ── os extratos da pasta do cliente entram na fila sem
     passar pelo computador: ficam só na memória da aba. */
  const [driveAberto, setDriveAberto] = useState(false);
  const [driveCarregando, setDriveCarregando] = useState(false);
  const [driveArquivos, setDriveArquivos] = useState([]);
  const [driveSel, setDriveSel] = useState(new Set());
  const [driveErro, setDriveErro] = useState("");
  const [driveBaixando, setDriveBaixando] = useState(false);
  const [driveProgresso, setDriveProgresso] = useState({ done: 0, total: 0 });
  /* DE QUAL CLIENTE é a pasta. Com o Finder aberto num cliente, é ele e a
     janela vai direto aos arquivos; no Finder solto, a janela pergunta antes
     (etapa "cliente") e só então abre a pasta dele (etapa "arquivos"). */
  const [driveEtapa, setDriveEtapa] = useState("arquivos");
  const [driveDono, setDriveDono] = useState(null);
  const [driveClientes, setDriveClientes] = useState([]);
  const [driveClientesCarregando, setDriveClientesCarregando] = useState(false);

  const lerPasta = useCallback(async (pastaId) => {
    if (!pastaId || !ponte) return;
    setDriveEtapa("arquivos"); setDriveCarregando(true); setDriveErro(""); setDriveSel(new Set()); setDriveArquivos([]);
    try {
      const lista = await ponte.listarDrive(pastaId, null);
      setDriveArquivos(lista);
      // o que se chama "extrato" já vem marcado: é quase sempre o que se quer
      const ehExtrato = /extrato/i;
      setDriveSel(new Set(lista.filter(f => ehExtrato.test(f.name)).map(f => f.id)));
    } catch (e) {
      setDriveErro(String(e?.message || e));
    } finally {
      setDriveCarregando(false);
    }
  }, [ponte]);

  const abrirDrive = useCallback(async () => {
    if (!ponte) return;
    setDriveAberto(true); setDriveErro("");
    if (driveFolderId) {
      setDriveDono({ id: clienteId, nome: clienteNome, fixo: true });
      lerPasta(driveFolderId);
      return;
    }
    setDriveEtapa("cliente"); setDriveDono(null); setDriveClientesCarregando(true);
    try { setDriveClientes(await ponte.listarClientes()); }
    catch (e) { setDriveErro(String(e?.message || e)); }
    finally { setDriveClientesCarregando(false); }
  }, [ponte, driveFolderId, clienteId, clienteNome, lerPasta]);

  const escolherClienteDoDrive = useCallback((c) => {
    const pasta = String(c?.drive_folder_url || "").match(/\/folders\/([a-zA-Z0-9_-]+)/)?.[1] || null;
    setDriveDono({ id: c.id, nome: c.nome, fixo: false });
    if (!pasta) {
      setDriveEtapa("arquivos"); setDriveArquivos([]);
      setDriveErro(`${c.nome} não tem pasta do Drive cadastrada na ficha.`);
      return;
    }
    lerPasta(pasta);
  }, [lerPasta]);

  const adicionarDoDrive = useCallback(async () => {
    const escolhidos = driveArquivos.filter(f => driveSel.has(f.id));
    if (!escolhidos.length || !ponte) return;
    setDriveBaixando(true); setDriveProgresso({ done: 0, total: escolhidos.length });
    const baixados = [];
    for (let i = 0; i < escolhidos.length; i++) {
      const f = escolhidos[i];
      try { baixados.push(await ponte.baixarDrive(f.id, f.name)); }
      catch (e) { console.warn(`[drive-picker] falha ao baixar ${f.name}:`, e); }
      setDriveProgresso({ done: i + 1, total: escolhidos.length });
    }
    setDriveBaixando(false); setDriveAberto(false);
    setUploadedFiles(prev => {
      const ja = new Set(prev.map(x => x.name));
      return [...prev, ...baixados.filter(x => !ja.has(x.name))];
    });
  }, [driveArquivos, driveSel, ponte]);

  /* ── JÁ VINCULADOS ── quantas vezes cada rubrica já virou análise vinculada
     deste cliente (a corrente verde no cartão). */
  const [vinculados, setVinculados] = useState(new Map());
  const carregarVinculados = useCallback(async () => {
    if (!clienteId || !ponte) { setVinculados(new Map()); return; }
    setVinculados(await ponte.listarVinculados(clienteId));
  }, [clienteId, ponte]);
  const aoVincular = useCallback((rotulos) => {
    if (Array.isArray(rotulos) && rotulos.length > 0) {
      setVinculados(prev => {
        const n = new Map(prev);
        for (const r of rotulos) n.set(r, (n.get(r) || 0) + 1);
        return n;
      });
    }
    carregarVinculados();
  }, [carregarVinculados]);
  useEffect(() => { carregarVinculados(); }, [carregarVinculados]);

  // Helper: gera key única pra um item (pra excludedKeys)
  const itemKey = (catId, item) =>
    `${catId}|${item.data || ""}|${(item.valor || 0).toFixed(2)}|${(item.historico || "").slice(0, 40)}`;

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  const addFiles = useCallback((fileList) => {
    const pdfs = Array.from(fileList).filter(f => {
      if (f.size > MAX_FILE_SIZE) { setErrorMsg(`Arquivo "${f.name}" excede 100MB e foi ignorado.`); return false; }
      return f.type==="application/pdf" || f.name.endsWith(".pdf");
    });
    if (!pdfs.length) return;
    setUploadedFiles(prev => { const existing=prev.map(f=>f.name); return [...prev,...pdfs.filter(f=>!existing.includes(f.name))]; });
  }, []);

  const entreguesRef = useRef(null);
  useEffect(() => {
    if (!arquivosIniciais || !arquivosIniciais.length || entreguesRef.current === arquivosIniciais) return;
    entreguesRef.current = arquivosIniciais;
    addFiles(arquivosIniciais);
  }, [arquivosIniciais, addFiles]);

  const removeFile = useCallback((idx) => { setUploadedFiles(prev=>prev.filter((_,i)=>i!==idx)); }, []);

  const handleDrop = useCallback(e => {
    e.preventDefault(); setDragOver(false);
    const files = e.dataTransfer?.files || e.target?.files;
    if (files) addFiles(files);
  }, [addFiles]);

  const processFiles = useCallback(async (files) => {
    if (!files.length) return;
    setMultipleClientsWarning(null); setMixedTitulares(null); pendingResultsRef.current = null;
    setPhase("parsing"); setErrorMsg("");
    setProgresso({
      inicio: Date.now(),
      arquivos: files.map(f => ({ nome: f.name, pagina: 0, paginas: 0, ocr: false, estado: "fila" })),
      etapa: "leitura",
      auditor: { feitos: 0, total: 0 },
    });
    const noArquivo = (i, patch) => mexerNoProgresso(p => ({ ...p, arquivos: p.arquivos.map((a, j) => j === i ? { ...a, ...patch } : a) }));
    const results = [];
    for (let i=0; i<files.length; i++) {
      const file = files[i]; setFileName(file.name);
      noArquivo(i, { estado: "lendo" });
      try {
        const PARSE_TIMEOUT = 1_800_000; // 30min — OCR de PDFs grandes (45+ páginas) pode levar 10-15 min
        const result = await Promise.race([
          parseDocumentoPDF(file,(page,total,ocr)=>{ setParseProgress({page,total,ocr}); noArquivo(i, { pagina: page, paginas: total, ocr: !!ocr }); }),
          new Promise((_,reject) => setTimeout(() => reject(new Error("Timeout: processamento excedeu 10 minutos")), PARSE_TIMEOUT))
        ]);
        results.push({result,file});
        noArquivo(i, { estado: "lido" });
      } catch(err) {
        noArquivo(i, { estado: "falhou" });
        setErrorMsg(prev => prev ? prev : `Erro ao processar "${file.name}": ${err.message}`);
      }
    }
    if (!results.length) { setErrorMsg("Não foi possível processar nenhum PDF. Verifique se os arquivos são documentos válidos."); setPhase("error"); return; }
    // ── Banco não suportado ──
    const unsupportedResult = results.find(r => r.result.unsupported);
    if (unsupportedResult) {
      setErrorMsg(`O banco "${unsupportedResult.result.bankName}" ainda não é suportado pelo AW FINDER. Atualmente são suportados: Bradesco, Itaú, Santander e Agibank.`);
      setPhase("error");
      return;
    }
    const uniqueNames = [...new Set(results.map(r=>r.result.clientName).filter(n=>n&&n!=="Titular não identificado"))];
    if (uniqueNames.length>1) {
      // Guarda os resultados já parseados: se o usuário escolher "Analisar
      // mesmo assim", continuamos daqui sem pagar o OCR de novo.
      pendingResultsRef.current = results;
      setPhase("upload"); setMultipleClientsWarning({names:uniqueNames}); return;
    }
    await runAnalysis(results, null);
  }, [mexerNoProgresso]);

  // Continuação da análise (pós-guardas). `mixedNames` != null quando o
  // usuário optou por analisar extratos de titulares distintos juntos —
  // o clientName vira a lista de nomes (aparece no header e nos exports)
  // e um banner de aviso persiste nos resultados.
  const runAnalysis = useCallback(async (results, mixedNames) => {
    setMixedTitulares(mixedNames || null);
    setPhase("analyzing");
    mexerNoProgresso(p => ({ ...p, etapa: "revisao" }));
    await new Promise(r=>setTimeout(r,600));
    const allTransactions = results.flatMap(r=>r.result.transactions);
    const primary = results[0].result;
    // Merge reviewerData de todos os PDFs (rows + cols do primeiro PDF como referência)
    const reviewerData = {
      rows: results.flatMap(r => r.result.reviewerData?.rows || []),
      cols: results[0]?.result.reviewerData?.cols || {},
    };
    // Camada de revisão + auto-correção (Fase A — determinística).
    // autoCorrectTransactions roda reviewMatches internamente, decide com
    // multi-sinal (killer-words em presence-only OU suspicious + outlier
    // extremo), remove falsos positivos com score>=50 e recupera missing.
    // Itens com score baixo ficam em residualSuspicious.
    let auto = autoCorrectTransactions(allTransactions, reviewerData);
    mexerNoProgresso(p => ({ ...p, etapa: "auditor" }));
    await umQuadro();
    // Fase B: AWFINDER REVISOR audita TODAS as tx classificadas via LLM com
    // cross-check ULTRA (triple-gate no n8n). Falha silenciosa se webhook off.
    if (FINDER_LLM_URL) {
      const ctrl = new AbortController();
      iaRef.current = ctrl;
      try {
        auto = await refineWithLLM(auto, FINDER_LLM_URL, {
          onProgress: (feitos, total) => mexerNoProgresso(p => ({ ...p, auditor: { feitos, total } })),
          signal: ctrl.signal,
        });
      } catch (e) { console.warn("AWFINDER REVISOR falhou:", e); }
      finally { iaRef.current = null; }
      if (ctrl.signal.aborted) {
        auto = { ...auto, summary: (auto.summary || "") + " · auditor de IA pulado, análise só por código" };
      }
    }
    mexerNoProgresso(p => ({ ...p, etapa: "agrupamento" }));
    await umQuadro();
    const g = analyzeAll(auto.transactions);
    mexerNoProgresso(p => ({ ...p, etapa: "fim" }));
    // reviewReport agora carrega tudo: o que foi auto-corrigido (verde) +
    // o que ainda precisa revisão (laranja).
    setReviewReport({
      autoRejected: auto.autoRejected,
      autoRecovered: auto.autoRecovered,
      suspicious: auto.residualSuspicious,
      missing: auto.residualMissing,
      needsHumanReview: auto.needsHumanReview,
      summary: auto.summary,
    });
    setReviewAcknowledged(false);
    setMeta(mixedNames && mixedNames.length > 1 ? { ...primary, clientName: mixedNames.join(" + ") } : primary);
    setGrouped(g);
    setExcludedKeys(new Set()); setManualAdditions({});
    const fileList = results.map(r=>r.file);
    setFileName(fileList.length===1?fileList[0].name:`${fileList.length} documentos analisados`);
    /* O DESFECHO fica na tela o bastante para ser lido: com pontos a conferir,
       um pouco mais, porque ali tem uma frase que importa. */
    const aConferir = auto.needsHumanReview ? ((auto.residualSuspicious?.length || 0) + (auto.residualMissing?.length || 0)) : 0;
    if (Object.keys(g).length>0) { setPhase("success"); setTimeout(()=>setPhase("results"), aConferir > 0 ? 3600 : 2600); }
    else { setPhase("noDiscount"); setTimeout(()=>setPhase("results"),3000); }
  }, [mexerNoProgresso]);

  // "Analisar mesmo assim": usuário assume a mistura de titulares (ex.: casal
  // com extratos separados, ou conferência conjunta). Continua dos resultados
  // já parseados — sem re-OCR.
  const analisarMesmoAssim = useCallback(() => {
    const results = pendingResultsRef.current;
    if (!results || !results.length) { setMultipleClientsWarning(null); return; }
    const names = multipleClientsWarning?.names || [];
    setMultipleClientsWarning(null);
    pendingResultsRef.current = null;
    runAnalysis(results, names);
  }, [multipleClientsWarning, runAnalysis]);

  const reset = useCallback(() => {
    setGrouped({}); setMeta({}); setFileName(""); setUploadedFiles([]);
    setDownloadedCats(new Set()); setSelectedCats(new Set()); setShowDashboard(false);
    setConfirmReset(false); setMultipleClientsWarning(null); setMixedTitulares(null); pendingResultsRef.current = null; setPhase("upload"); setErrorMsg("");
    setReviewReport(null); setReviewAcknowledged(false);
    setExcludedKeys(new Set()); setManualAdditions({}); setAddingToCatId(null); setAddForm({data:"",valor:"",historico:""}); setMovingItem(null);
    setAnuladas({}); setMotivoAnulacaoCat(null); setCancelAnulacaoCat(null); aplicadasDoComercialRef.current = new Set();
  }, []);

  const toggleSelectCat = useCallback((catId) => {
    setSelectedCats(prev => { const next = new Set(prev); if (next.has(catId)) next.delete(catId); else next.add(catId); return next; });
  }, []);

  /* "Selecionar todos" saiu (ver Resultados.tsx): marcar tudo sem olhar é o
     que a lista existe para evitar. */

  // Extrai Descrição (keyword matchada) e Operação (restante) do historico
  const extractDescricaoOperacao = useCallback((historico, cat) => {
    const h = historico.toUpperCase();
    let bestKw = "";
    for (const kw of cat.keywords) {
      const nkw = kw.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const nh = h.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (nh.includes(nkw) && nkw.length > bestKw.length) bestKw = nkw;
    }
    if (!bestKw) return { descricao: historico.toUpperCase(), operacao: "" };
    const nh = h.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const idx = nh.indexOf(bestKw.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
    const remainder = historico.substring(idx + bestKw.length).trim();
    return { descricao: bestKw, operacao: remainder || "" };
  }, []);

  const loadXLSX = useCallback(async () => {
    if (!window.XLSX) {
      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js";
        s.integrity = "sha384-OUW9euuUyxyHcAhTqbhI+Iyb8LMssXt/cpz0yXhs9UWG2/R/uaWdakx/4cfww7Vb";
        s.crossOrigin = "anonymous";
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    return window.XLSX;
  }, []);

  const XLS_BORDER = { top:{style:"thin",color:{rgb:"000000"}}, bottom:{style:"thin",color:{rgb:"000000"}}, left:{style:"thin",color:{rgb:"000000"}}, right:{style:"thin",color:{rgb:"000000"}} };
  const XLS_HEADER = { fill:{fgColor:{rgb:"00B050"}}, font:{bold:true,color:{rgb:"FFFFFF"},sz:11}, border:XLS_BORDER, alignment:{horizontal:"center"} };
  const XLS_DATA = { fill:{fgColor:{rgb:"D6E4F0"}}, border:XLS_BORDER, font:{sz:11} };
  const XLS_VALOR = { fill:{fgColor:{rgb:"D6E4F0"}}, border:XLS_BORDER, font:{sz:11}, numFmt:'"R$ "#,##0.00' };
  const XLS_TOTAL = { fill:{fgColor:{rgb:"FFFF00"}}, font:{bold:true,sz:11}, border:XLS_BORDER };
  const XLS_TOTAL_VALOR = { fill:{fgColor:{rgb:"FFFF00"}}, font:{bold:true,sz:11}, border:XLS_BORDER, numFmt:'"R$ "#,##0.00' };
  const XLS_TITLE = { fill:{fgColor:{rgb:"1F4E79"}}, font:{bold:true,color:{rgb:"FFFFFF"},sz:12}, border:XLS_BORDER, alignment:{horizontal:"center",vertical:"center"} };
  const XLS_COLS = [{ wch: 20 }, { wch: 32 }, { wch: 42 }, { wch: 18 }];

  const applySheetStyles = useCallback((XLSX, ws, rowStyles) => {
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let r = range.s.r; r <= range.e.r; r++) {
      const style = rowStyles[r];
      if (!style) continue;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { t: "s", v: "" };
        ws[addr].s = (c === 3 && style === "data") ? XLS_VALOR
          : (c === 3 && style === "total") ? XLS_TOTAL_VALOR
          : style === "header" ? XLS_HEADER
          : style === "total" ? XLS_TOTAL
          : style === "title" ? XLS_TITLE
          : XLS_DATA;
      }
    }
  }, []);

  const sanitizeXlsCell = (v) => typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? "'" + v : v;

  const buildSheet = useCallback((XLSX, cat, items) => {
    const header = ["Data", "Descrição", "Operação", "Valor"];
    const rows = items.map(item => {
      const { descricao, operacao } = extractDescricaoOperacao(item.historico, cat);
      return [sanitizeXlsCell(item.data), sanitizeXlsCell(descricao), sanitizeXlsCell(operacao), item.valor];
    });
    const total = items.reduce((s, i) => s + i.valor, 0);
    const totalRow = ["VALOR TOTAL", "", "", total];
    const art42Row = ["VALOR EM DOBRO", "", "", total * 2];
    const wsData = [header, ...rows, [], totalRow, art42Row];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = XLS_COLS;
    const rowStyles = {};
    rowStyles[0] = "header";
    for (let i = 1; i <= rows.length; i++) rowStyles[i] = "data";
    rowStyles[rows.length + 2] = "total";
    rowStyles[rows.length + 3] = "total";
    applySheetStyles(XLSX, ws, rowStyles);
    return ws;
  }, [extractDescricaoOperacao, applySheetStyles]);

  const buildMultiSheet = useCallback((XLSX, groups) => {
    const wsData = [];
    const rowStyles = {};
    const merges = [];
    for (let gi = 0; gi < groups.length; gi++) {
      const { cat, items } = groups[gi];
      const titleIdx = wsData.length;
      wsData.push([cat.label, "", "", ""]);
      merges.push({ s: { r: titleIdx, c: 0 }, e: { r: titleIdx, c: 3 } });
      rowStyles[titleIdx] = "title";
      if (gi === 0) {
        rowStyles[wsData.length] = "header";
        wsData.push(["Data", "Descrição", "Operação", "Valor"]);
      }
      for (const item of items) {
        const { descricao, operacao } = extractDescricaoOperacao(item.historico, cat);
        rowStyles[wsData.length] = "data";
        wsData.push([sanitizeXlsCell(item.data), sanitizeXlsCell(descricao), sanitizeXlsCell(operacao), item.valor]);
      }
    }
    const grandTotal = groups.reduce((s, g) => s + g.items.reduce((ss, i) => ss + i.valor, 0), 0);
    rowStyles[wsData.length] = "total";
    wsData.push(["VALOR TOTAL", "", "", grandTotal]);
    rowStyles[wsData.length] = "total";
    wsData.push(["VALOR EM DOBRO", "", "", grandTotal * 2]);
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = XLS_COLS;
    ws["!merges"] = merges;
    applySheetStyles(XLSX, ws, rowStyles);
    return ws;
  }, [extractDescricaoOperacao, applySheetStyles]);

  /* UMA RUBRICA: a planilha dela (para vincular) e o download dela (extrair),
     o que a janela antiga da rubrica fazia por dentro. */
  const planilhaDaRubrica = useCallback(async (cat, items) => {
    const XLSX = await loadXLSX();
    const ws = buildSheet(XLSX, cat, items);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, nomeDeAba(cat.label));
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const totalValor = items.reduce((s2, it) => s2 + Math.abs(it.valor || 0), 0);
    const { dataInicio, dataFim } = periodoDosItens(items);
    return { blob, fileName: `${cat.label}.xlsx`, totalValor, qtdItens: items.length, dataInicio, dataFim };
  }, [loadXLSX, buildSheet]);

  const extrairRubrica = useCallback(async (cat, items) => {
    try {
      const XLSX = await loadXLSX();
      const ws = buildSheet(XLSX, cat, items);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sanitizeXlsSheetName(cat.label));
      const wbOut = XLSX.write(wb, { bookType:"xlsx", type:"array" });
      const blob = new Blob([wbOut], { type:"application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "AW FINDER - Tabela de Descontos.xlsx";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadedCats(prev => new Set([...prev, cat.id]));
    } catch (e) { console.error("[extrairRubrica]", e); }
  }, [loadXLSX, buildSheet]);

  const batchExport = useCallback(async () => {
    // Usa grouped derivado (pós-exclusões/adições) pra exportar XLSX coerente com o que está na tela
    const _liveGrouped = {};
    for (const [catId, g] of Object.entries(grouped)) {
      const filtered = g.items.filter(it => !excludedKeys.has(itemKey(catId, it)));
      const manuals = manualAdditions[catId] || [];
      const combined = [...filtered, ...manuals];
      if (combined.length > 0) _liveGrouped[catId] = { ...g, items: combined };
    }
    for (const [catId, manuals] of Object.entries(manualAdditions)) {
      if (_liveGrouped[catId] || manuals.length === 0) continue;
      const cat = CATEGORIAS.find(c => c.id === catId);
      if (cat) _liveGrouped[catId] = { cat, items: manuals };
    }
    const selected = Object.values(_liveGrouped).filter(g => selectedCats.has(g.cat.id));
    if (!selected.length) return;
    setBatchExporting(true);
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.utils.book_new();
      const ws = buildMultiSheet(XLSX, selected);
      XLSX.utils.book_append_sheet(wb, ws, "Descontos Identificados");
      // Abas individuais por categoria
      const usedNames = new Set(["Descontos Identificados"]);
      for (const g of selected) {
        let name = sanitizeXlsSheetName(g.cat.label);
        if (usedNames.has(name)) {
          let suffix = 2;
          let suffixStr = ` (${suffix})`;
          while (usedNames.has(name.slice(0, 31 - suffixStr.length) + suffixStr)) {
            suffix++;
            suffixStr = ` (${suffix})`;
          }
          name = name.slice(0, 31 - suffixStr.length) + suffixStr;
        }
        usedNames.add(name);
        const catWs = buildSheet(XLSX, g.cat, g.items);
        XLSX.utils.book_append_sheet(wb, catWs, name);
      }
      const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbOut], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "AW FINDER - Tabela de Descontos.xlsx";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      for (const g of selected) setDownloadedCats(prev => new Set([...prev, g.cat.id]));
    } catch (e) { console.error("[batchExport]", e); }
    finally { setBatchExporting(false); }
  }, [grouped, excludedKeys, manualAdditions, selectedCats, loadXLSX, buildMultiSheet, buildSheet]);

  // finalGrouped: aplica exclusões manuais (excludedKeys) e adições manuais
  // (manualAdditions) ao output do parser+reviewer. Resultado é o que a UI
  // renderiza E o que vai pro relatório XLSX (export usa groups).
  const finalGrouped = useMemo(() => {
    const result = {};
    for (const [catId, g] of Object.entries(grouped)) {
      const filtered = g.items.filter(it => !excludedKeys.has(itemKey(catId, it)));
      const manuals = manualAdditions[catId] || [];
      const combined = [...filtered, ...manuals];
      if (combined.length > 0) result[catId] = { ...g, items: combined };
    }
    // Categorias só com adições manuais (caso o parser não tenha detectado nada)
    for (const [catId, manuals] of Object.entries(manualAdditions)) {
      if (result[catId] || manuals.length === 0) continue;
      const cat = CATEGORIAS.find(c => c.id === catId);
      if (cat) result[catId] = { cat, items: manuals };
    }
    return result;
  }, [grouped, excludedKeys, manualAdditions]);

  // useMemo NECESSÁRIO: `reembolsaveis` está nas deps do effect que dispara
  // "aw-finder:analysis-ready". Sem memo, cada render cria um array novo →
  // effect re-dispara → o host AW-ECO (FinderPage) faz setState ao ouvir →
  // re-render → loop infinito ("Maximum update depth exceeded").
  const groups = useMemo(() => Object.values(finalGrouped), [finalGrouped]);
  // Anuladas (não ajuizáveis) saem do conjunto "ajuizável": totais, planilha,
  // dashboard e o evento analysis-ready (pré-protocolo) ignoram todas.
  const reembolsaveis = useMemo(
    () => groups.filter(g => !g.cat.naoReembolsavel && !anuladas[g.cat.id]),
    [groups, anuladas],
  );

  // Marca a rubrica como não ajuizável (com motivo) e tira da seleção de export.
  const anularRubrica = useCallback((catId, motivo) => {
    setAnuladas(prev => ({ ...prev, [catId]: { motivo } }));
    setSelectedCats(prev => { const n = new Set(prev); n.delete(catId); return n; });
    setMotivoAnulacaoCat(null);
  }, []);
  const cancelarAnulacao = useCallback((catId) => {
    /* Liberar uma que veio BLOQUEADA DO COMERCIAL é desfazer uma decisão
       gravada na ficha do cliente, e não só desta tela: o AW grava. */
    if (anuladas[catId]?.doComercial) {
      const rotulo = groups.find(g => g.cat.id === catId)?.cat.label;
      if (rotulo && onLiberarRef.current) onLiberarRef.current(rotulo);
    }
    setAnuladas(prev => { const n = { ...prev }; delete n[catId]; return n; });
    setCancelAnulacaoCat(null);
  }, [anuladas, groups]);

  /* AS BLOQUEADAS NA ANÁLISE COMERCIAL já abrem como não ajuizáveis. Casa
     pelo nome da rubrica (sem acento, sem caixa), que é como o comercial
     grava. Cada uma é aplicada uma vez só por análise: se alguém liberar, ela
     não volta sozinha. */
  useEffect(() => {
    if (!anuladasIniciais || !groups.length) return;
    const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const porNome = new Map(Object.entries(anuladasIniciais).map(([k, v]) => [norm(k), v]));
    const novas = {};
    for (const g of groups) {
      const k = norm(g.cat.label);
      if (!porNome.has(k) || aplicadasDoComercialRef.current.has(k)) continue;
      aplicadasDoComercialRef.current.add(k);
      novas[g.cat.id] = { motivo: porNome.get(k) || "rubrica_invalida", doComercial: true };
    }
    if (Object.keys(novas).length) {
      setAnuladas(prev => ({ ...novas, ...prev }));
      setSelectedCats(prev => { const n = new Set(prev); for (const id of Object.keys(novas)) n.delete(id); return n; });
    }
  }, [anuladasIniciais, groups]);

  // Handlers passados para Modal
  const handleExcludeItem = useCallback((catId, item) => {
    const k = itemKey(catId, item);
    setExcludedKeys(prev => { const n = new Set(prev); n.add(k); return n; });
  }, []);
  const handleAddItem = useCallback((catId, item) => {
    setManualAdditions(prev => ({ ...prev, [catId]: [...(prev[catId] || []), item] }));
  }, []);
  // Mover item de uma categoria para outra: combina exclusão (na origem) +
  // adição manual (no destino). O item carrega flag _movedFrom pra UI mostrar
  // que veio de outra categoria.
  const handleMoveItem = useCallback((fromCatId, item, toCatId) => {
    if (!toCatId || fromCatId === toCatId) { setMovingItem(null); return; }
    setExcludedKeys(prev => { const n = new Set(prev); n.add(itemKey(fromCatId, item)); return n; });
    setManualAdditions(prev => ({
      ...prev,
      [toCatId]: [...(prev[toCatId] || []), { ...item, _manual: true, _movedFrom: fromCatId, _recovered: false }],
    }));
    setMovingItem(null);
  }, []);
  const totalOcorrencias = reembolsaveis.reduce((s,g)=>s+g.items.length,0);
  const totalValor = reembolsaveis.reduce((s,g)=>s+g.items.reduce((ss,i)=>ss+i.valor,0),0);

  /* VINCULAR EM LOTE, o da barra de decisão: UMA análise com as rubricas
     marcadas vai para o cliente (a mesma planilha combinada de antes). */
  const marcadasParaVincular = useMemo(() => groups.filter(g => selectedCats.has(g.cat.id)), [groups, selectedCats]);
  const vinculoEmLote = useVincular({
    ponte: ponteComCliente,
    onVinculado: aoVincular,
    bancoMeta: { banco: meta.banco, agencia: meta.agencia, conta: meta.conta },
    batchLabels: marcadasParaVincular.map(g => g.cat.label),
    produceCombinedBlob: async () => {
      const XLSX = await loadXLSX();
      const sel = marcadasParaVincular;
      if (sel.length === 0) return null;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, buildMultiSheet(XLSX, sel), "Descontos Identificados");
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const totalValor = sel.reduce((s2, g) => s2 + g.items.reduce((s3, it) => s3 + Math.abs(it.valor || 0), 0), 0);
      const qtdItens = sel.reduce((s2, g) => s2 + g.items.length, 0);
      const { dataInicio, dataFim } = periodoDosItens(sel.flatMap(g => g.items));
      return { blob, fileName: `Analise-${sel.length}cats.xlsx`, totalValor, qtdItens, dataInicio, dataFim };
    },
  });

  // Porta dormente — dispara evento com os dados da análise quando pronta.
  // Host (AW-ECO wrapper) pode escutar e integrar; standalone: ninguém escuta, no-op.
  useEffect(() => {
    if (phase !== "results" || reembolsaveis.length === 0) return;
    const toISO = (dataBR) => {
      const parts = (dataBR || "").split("/");
      if (parts.length !== 3) return null;
      const [d, m, y] = parts;
      if (!d || !m || !y) return null;
      return `${y.padStart(4,"0")}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
    };
    const rubricasDetalhadas = reembolsaveis.map(g => {
      const items = g.items.map(it => ({
        data: it.data,
        dataISO: toISO(it.data),
        valor: Number(it.valor) || 0,
        descricao: it.historico || "",
      }));
      const datesISO = items.map(i => i.dataISO).filter(Boolean).sort();
      const total = items.reduce((s, i) => s + i.valor, 0);
      return {
        id: g.cat.id,
        label: g.cat.label,
        total,
        dataInicioISO: datesISO.length ? datesISO[0] : null,
        dataFimISO: datesISO.length ? datesISO[datesISO.length - 1] : null,
        items,
      };
    });
    const allDatesISO = rubricasDetalhadas
      .flatMap(r => r.items.map(i => i.dataISO))
      .filter(Boolean)
      .sort();
    const periodoISO = allDatesISO.length
      ? { inicio: allDatesISO[0], fim: allDatesISO[allDatesISO.length - 1] }
      : { inicio: null, fim: null };
    const rubricas = rubricasDetalhadas.map(r => r.label);
    const buildXlsxBlob = async () => {
      try {
        const XLSX = await loadXLSX();
        const wb = XLSX.utils.book_new();
        const ws = buildMultiSheet(XLSX, reembolsaveis);
        XLSX.utils.book_append_sheet(wb, ws, "Descontos Identificados");
        const usedNames = new Set(["Descontos Identificados"]);
        for (const g of reembolsaveis) {
          let name = sanitizeXlsSheetName(g.cat.label);
          if (usedNames.has(name)) {
            let suffix = 2;
            let suffixStr = ` (${suffix})`;
            while (usedNames.has(name.slice(0, 31 - suffixStr.length) + suffixStr)) {
              suffix++;
              suffixStr = ` (${suffix})`;
            }
            name = name.slice(0, 31 - suffixStr.length) + suffixStr;
          }
          usedNames.add(name);
          const catWs = buildSheet(XLSX, g.cat, g.items);
          XLSX.utils.book_append_sheet(wb, catWs, name);
        }
        const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        return new Blob([wbOut], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      } catch (e) {
        console.error("[buildXlsxBlob]", e);
        return null;
      }
    };
    if (onProntaRef.current) {
      onProntaRef.current({
          meta,
          grouped,
          rubricas,
          rubricasDetalhadas,
          // Rubricas marcadas como NÃO ajuizáveis (fora da ação): o host pode
          // persistir na análise salva e exibir na ficha. Motivos:
          // ja_ajuizada (cliente já entrou com essa ação) | cliente_nao_quer.
          rubricasAnuladas: groups
            .filter(g => anuladas[g.cat.id])
            .map(g => ({
              id: g.cat.id,
              label: g.cat.label,
              motivo: anuladas[g.cat.id].motivo,
              total: g.items.reduce((s, i) => s + i.valor, 0),
            })),
          /* TODAS as rubricas, inclusive as não reembolsáveis (Invest Fácil)
             e as não ajuizáveis. A análise comercial precisa da lista
             inteira; `rubricasDetalhadas` só tem as que entram na ação. */
          rubricasTodas: groups.map(g => ({
            id: g.cat.id,
            label: g.cat.label,
            total: g.items.reduce((s, i) => s + i.valor, 0),
            naoReembolsavel: !!g.cat.naoReembolsavel,
            anulada: anuladas[g.cat.id]?.motivo || null,
          })),
          totalDescontos: totalValor,
          periodoISO,
          fileName,
          buildXlsxBlob,
      });
    }
  }, [phase, grouped, meta, reembolsaveis, groups, anuladas, totalValor, fileName, loadXLSX, buildMultiSheet, buildSheet]);

  useEffect(() => {
    if (phase === "upload" && Object.keys(grouped).length === 0) {
      if (onResetRef.current) onResetRef.current();
    }
  }, [phase, grouped]);

  /* Saguão (envio, análise em andamento, desfecho) em Saguao.tsx; o
     relatório em Resultados.tsx. */
  const faseDoSaguao = ["upload","parsing","analyzing","success","noDiscount","error"].includes(phase);

  return (
    <PonteFinder.Provider value={ponteComCliente}>
      {/* O Finder inteiro é tela do AW agora (Saguao, Resultados, JanelaDaRubrica,
          RelatorioDoCliente). Do CSS da tela antiga (cores à mão, fonte
          própria, inversão dos temas claros) só ficou a caixa. */}
      <style>{`.aw-finder{contain:layout paint}`}</style>

      {/* A caixa do Finder: o saguão ou o relatório, cada um com a sua área
          que rola. As janelas são do AW e saem por cima de tudo. */}
      <div className="aw-finder" style={{ height:"100%",position:"relative" }}>
      {faseDoSaguao ? (
        <SaguaoFinder
          fase={phase}
          clienteNome={clienteNome}
          driveFolderId={driveFolderId}
          driveUrl={driveUrl}
          arquivos={uploadedFiles}
          aviso={phase==="upload" ? errorMsg : ""}
          onAdicionar={(files)=>{ setErrorMsg(""); addFiles(files); }}
          onRemover={removeFile}
          onAnalisar={()=>processFiles(uploadedFiles)}
          progresso={progresso}
          erro={errorMsg}
          onRecomecar={()=>{ setErrorMsg(""); setPhase("upload"); }}
          onPularIa={pularIa}
          resumo={(() => {
            const gs = Object.values(grouped);
            const conferir = reviewReport?.needsHumanReview ? ((reviewReport.suspicious?.length || 0) + (reviewReport.missing?.length || 0)) : 0;
            return {
              rubricas: gs.filter(g2 => !g2.cat.naoReembolsavel).length,
              total: gs.filter(g2 => !g2.cat.naoReembolsavel).reduce((t, g2) => t + g2.items.reduce((u, it) => u + (Number(it.valor) || 0), 0), 0),
              conferir,
            };
          })()}
          onAbrirDrive={abrirDrive}
          drive={{ aberto: driveAberto, carregando: driveCarregando, arquivos: driveArquivos, selecionados: driveSel, erro: driveErro, baixando: driveBaixando, progresso: driveProgresso,
            etapa: driveEtapa, dono: driveDono, clientes: driveClientes, carregandoClientes: driveClientesCarregando }}
          onDriveCliente={escolherClienteDoDrive}
          onDriveTrocarCliente={()=>{ setDriveEtapa("cliente"); setDriveErro(""); setDriveArquivos([]); setDriveSel(new Set()); if (!driveClientes.length) abrirDrive(); }}
          onDriveAlternar={(id)=>setDriveSel(prev=>{ const n=new Set(prev); if(n.has(id)) n.delete(id); else n.add(id); return n; })}
          onDriveTodos={()=>setDriveSel(new Set(driveArquivos.map(f=>f.id)))}
          onDriveLimpar={()=>setDriveSel(new Set())}
          onDriveFechar={()=>setDriveAberto(false)}
          onDriveAdicionar={adicionarDoDrive}
          titulares={multipleClientsWarning && phase==="upload" ? multipleClientsWarning.names : null}
          onAjustarArquivos={()=>{ setMultipleClientsWarning(null); pendingResultsRef.current = null; }}
          onAnalisarMesmoAssim={analisarMesmoAssim}
        />
      ) : (
      <>
        <ResultadosFinder
          meta={meta}
          arquivo={fileName}
          clienteNome={clienteNome}
          grupos={groups}
          anuladas={anuladas}
          motivos={MOTIVOS_ANULACAO}
          vinculados={vinculados}
          baixadas={downloadedCats}
          selecionadas={selectedCats}
          onAlternar={toggleSelectCat}
          onAbrir={(g)=>setActiveModal(g)}
          onCadeado={(g)=> anuladas[g.cat.id] ? setCancelAnulacaoCat(g.cat) : setMotivoAnulacaoCat(g.cat)}
          totalValor={totalValor}
          totalOcorrencias={totalOcorrencias}
          revisao={reviewReport}
          revisaoConferida={reviewAcknowledged}
          onConferir={()=>setReviewAcknowledged(true)}
          titularesMisturados={mixedTitulares}
          vinculo={vinculoEmLote}
          onExtrair={batchExport}
          extraindo={batchExporting}
          acaoComercial={acaoComercial}
          confirmandoNova={confirmReset}
          onPedirNova={()=>setConfirmReset(true)}
          onCancelarNova={()=>setConfirmReset(false)}
          onConfirmarNova={reset}
          pedindoMotivo={motivoAnulacaoCat}
          onMotivo={anularRubrica}
          onFecharMotivo={()=>setMotivoAnulacaoCat(null)}
          liberando={cancelAnulacaoCat}
          onLiberar={cancelarAnulacao}
          onFecharLiberar={()=>setCancelAnulacaoCat(null)}
          relatorioAberto={showDashboard}
          onAlternarRelatorio={()=>setShowDashboard(v=>!v)}
          relatorio={
            <DashboardErrorBoundary><RelatorioDoCliente groups={groups.filter(g => !anuladas[g.cat.id])} meta={meta} totalValor={totalValor} totalOcorrencias={totalOcorrencias} /></DashboardErrorBoundary>
          }
        />

        {/* A JANELA DA RUBRICA, com os lançamentos. Re-derivada ao vivo:
            lançamentos podem ter saído ou entrado depois do clique. */}
        <JanelaDaRubrica
          grupo={activeModal ? (finalGrouped[activeModal.cat.id] || activeModal) : null}
          onFechar={()=>setActiveModal(null)}
          categorias={CATEGORIAS}
          ponte={ponteComCliente}
          bancoMeta={{ banco: meta.banco, agencia: meta.agencia, conta: meta.conta }}
          onVinculado={aoVincular}
          planilha={planilhaDaRubrica}
          extrair={extrairRubrica}
          onExcluir={handleExcludeItem}
          onAdicionar={handleAddItem}
          onMover={handleMoveItem}
        />
      </>
      )}
      </div>
    </PonteFinder.Provider>
  );
}
